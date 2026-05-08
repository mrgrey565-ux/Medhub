/* ============================================================
   MEDICAL STUDY HUB — REVISION ENGINE
   FSRS-lite spaced repetition scheduler
   ============================================================ */

'use strict';

const RevisionEngine = {

  /* ── FSRS-lite Intervals ── */
  INTERVALS: {
    0: 1,   // Again → 1 day
    1: 3,   // Hard  → 3 days
    2: 7,   // Good  → 7 days
    3: 14,  // Easy  → 14 days
  },

  RATING_LABELS: {
    0: { label: 'Again', class: 'again', icon: '🔴', interval: '1 day' },
    1: { label: 'Hard',  class: 'hard',  icon: '🟠', interval: '3 days' },
    2: { label: 'Good',  class: 'good',  icon: '🔵', interval: '7 days' },
    3: { label: 'Easy',  class: 'easy',  icon: '🟢', interval: '14 days' },
  },

  /* ── Get All Cards ── */
  getAllCards() {
    return Storage.get(KEYS.SRS_CARDS, []);
  },

  /* ── Get Due Cards (today or overdue) ── */
  getDueCards() {
    const today = DateUtils.today();
    return this.getAllCards().filter(c => c.dueDate <= today);
  },

  /* ── Get Weak Points (wrong 2+ times) ── */
  getWeakPoints() {
    return this.getAllCards().filter(c => (c.incorrectCount || 0) >= 2);
  },

  /* ── Rate Card (FSRS-lite) ── */
  rateCard(cardId, rating) {
    const cards = this.getAllCards();
    const idx = cards.findIndex(c => c.id === cardId);
    if (idx === -1) return null;

    const card = cards[idx];
    const interval = this.INTERVALS[rating] || 1;
    const isCorrect = rating >= 2;

    // Update card
    card.reps = (card.reps || 0) + 1;
    card.interval = interval;
    card.dueDate = DateUtils.addDays(DateUtils.today(), interval);
    card.lastRating = rating;
    card.lastReviewed = DateUtils.today();

    if (!isCorrect) {
      card.incorrectCount = (card.incorrectCount || 0) + 1;
    }

    // Update ease factor (simplified)
    if (rating === 3) card.easeFactor = Math.min(3.0, (card.easeFactor || 2.5) + 0.1);
    if (rating === 1) card.easeFactor = Math.max(1.3, (card.easeFactor || 2.5) - 0.15);
    if (rating === 0) card.easeFactor = Math.max(1.3, (card.easeFactor || 2.5) - 0.2);

    cards[idx] = card;
    Storage.set(KEYS.SRS_CARDS, cards);

    // Track for graph
    this.recordReview(DateUtils.today());

    return card;
  },

  /* ── Record Daily Review ── */
  recordReview(date) {
    const key = 'medhub_srs_reviews';
    const reviews = Storage.get(key, {});
    reviews[date] = (reviews[date] || 0) + 1;
    Storage.set(key, reviews);
  },

  /* ── Get Last 7 Days Review Data ── */
  getReviewGraph() {
    const key = 'medhub_srs_reviews';
    const reviews = Storage.get(key, {});
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: reviews[dateStr] || 0,
      });
    }
    return days;
  },

  /* ── Add Card from Question ── */
  addCardFromQuestion(question) {
    const cards = this.getAllCards();
    if (cards.find(c => c.id === question.id)) {
      Toast.show('Already in revision queue', 'info');
      return null;
    }

    const card = {
      id: question.id,
      questionId: question.id,
      interval: 1,
      dueDate: DateUtils.addDays(DateUtils.today(), 1),
      easeFactor: 2.5,
      reps: 0,
      incorrectCount: 0,
      question: question.question,
      options: question.options,
      correct: question.correct,
      explanation: question.explanation,
      topic: question.topic,
      addedAt: new Date().toISOString(),
    };

    cards.push(card);
    Storage.set(KEYS.SRS_CARDS, cards);
    return card;
  },

  /* ── Remove Card ── */
  removeCard(cardId) {
    const cards = this.getAllCards().filter(c => c.id !== cardId);
    Storage.set(KEYS.SRS_CARDS, cards);
  },

  /* ── Get AI Explanation ── */
  async explainCard(card) {
    let notesText = '';
    try { notesText = await DB.getAllNotesText(); } catch {}

    const context = getRelevantNoteChunk(notesText, card.topic || card.question.substring(0, 50), 10000);

    const systemPrompt = `You are a patient medical tutor re-explaining a concept the student got wrong. Be clear, use analogies where helpful, and strictly use only the provided notes.`;

    const userMessage = `${context}

The student had difficulty with this question:
"${card.question}"

Correct answer: ${card.correct}) ${card.options[card.correct]}

Please re-explain this concept in a clear, memorable way. Focus on why the correct answer is right and how to remember it. Keep under 200 words.`;

    return await AIClient.call(systemPrompt, userMessage);
  },

  /* ── Get Stats ── */
  getStats() {
    const cards = this.getAllCards();
    const due = this.getDueCards();
    const weak = this.getWeakPoints();
    const today = DateUtils.today();
    const reviewed = cards.filter(c => c.lastReviewed === today).length;

    return {
      total: cards.length,
      due: due.length,
      weak: weak.length,
      reviewedToday: reviewed,
    };
  },

  /* ── Push Weak Areas from Exam ── */
  pushWeakAreasFromExam(wrongQuestions) {
    const cards = this.getAllCards();
    const existingIds = new Set(cards.map(c => c.id));
    let added = 0;

    wrongQuestions.forEach(q => {
      if (!existingIds.has(q.id)) {
        cards.push({
          id: q.id,
          questionId: q.id,
          interval: 1,
          dueDate: DateUtils.addDays(DateUtils.today(), 1),
          easeFactor: 2.5,
          reps: 0,
          incorrectCount: 1,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          topic: q.topic,
          addedAt: new Date().toISOString(),
        });
        existingIds.add(q.id);
        added++;
      } else {
        // Increment incorrect count for existing card
        const idx = cards.findIndex(c => c.id === q.id);
        if (idx !== -1) {
          cards[idx].incorrectCount = (cards[idx].incorrectCount || 0) + 1;
        }
      }
    });

    Storage.set(KEYS.SRS_CARDS, cards);
    return added;
  },
};

window.RevisionEngine = RevisionEngine;
