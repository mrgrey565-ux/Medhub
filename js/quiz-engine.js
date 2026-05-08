/* ============================================================
   MEDICAL STUDY HUB — QUIZ ENGINE
   MCQ logic: loading, filtering, session tracking,
   AI question generation, flagging for revision
   ============================================================ */

'use strict';

const QuizEngine = {
  allQuestions: [],
  currentSession: [],
  currentIndex: 0,
  sessionStats: { attempted: 0, correct: 0, startTime: null },
  selectedAnswer: null,
  answered: false,

  /* ── Load All Questions ── */
  async loadQuestions() {
    let questions = [];

    // Load from JSON file
    try {
      const res = await fetch('data/sample-mcq.json');
      if (res.ok) {
        const jsonQs = await res.json();
        questions = [...jsonQs];
      }
    } catch (err) {
      console.warn('Could not load sample-mcq.json:', err);
    }

    // Merge AI-generated questions from localStorage
    const aiQs = Storage.get(KEYS.MCQ_BANK, []);
    if (Array.isArray(aiQs) && aiQs.length > 0) {
      // Deduplicate by id
      const existingIds = new Set(questions.map(q => q.id));
      aiQs.forEach(q => {
        if (!existingIds.has(q.id)) {
          questions.push(q);
          existingIds.add(q.id);
        }
      });
    }

    this.allQuestions = questions;
    return questions;
  },

  /* ── Get Unique Topics ── */
  getTopics() {
    const topics = new Set(this.allQuestions.map(q => q.topic));
    return ['All Topics', ...Array.from(topics).sort()];
  },

  /* ── Get Unique Subjects ── */
  getSubjects() {
    const subjects = new Set(this.allQuestions.map(q => q.subject));
    return ['All Subjects', ...Array.from(subjects).sort()];
  },

  /* ── Filter Questions ── */
  filterQuestions(topic = 'All Topics', subject = 'All Subjects', difficulty = 'all') {
    return this.allQuestions.filter(q => {
      const topicMatch = topic === 'All Topics' || q.topic === topic;
      const subjectMatch = subject === 'All Subjects' || q.subject === subject;
      const diffMatch = difficulty === 'all' || q.difficulty === difficulty;
      return topicMatch && subjectMatch && diffMatch;
    });
  },

  /* ── Start Session ── */
  startSession(questions) {
    this.currentSession = [...questions];
    this.currentIndex = 0;
    this.selectedAnswer = null;
    this.answered = false;
    this.sessionStats = {
      attempted: 0,
      correct: 0,
      startTime: Date.now(),
    };
  },

  /* ── Get Current Question ── */
  currentQuestion() {
    return this.currentSession[this.currentIndex] || null;
  },

  /* ── Select Answer ── */
  selectAnswer(letter) {
    if (this.answered) return;
    this.selectedAnswer = letter;
  },

  /* ── Submit Answer ── */
  submitAnswer() {
    if (!this.selectedAnswer || this.answered) return null;
    const q = this.currentQuestion();
    if (!q) return null;

    this.answered = true;
    const isCorrect = this.selectedAnswer === q.correct;

    // Update session stats
    this.sessionStats.attempted += 1;
    if (isCorrect) this.sessionStats.correct += 1;

    // Update global stats
    StudyStats.recordAnswer(isCorrect);

    // Update question stats
    this.updateQuestionStats(q.id, isCorrect);

    return { isCorrect, correct: q.correct, explanation: q.explanation };
  },

  /* ── Update Question Stats in Bank ── */
  updateQuestionStats(questionId, isCorrect) {
    // Update in-memory
    const q = this.allQuestions.find(q => q.id === questionId);
    if (q) {
      q.timesShown = (q.timesShown || 0) + 1;
      if (isCorrect) q.timesCorrect = (q.timesCorrect || 0) + 1;
    }

    // Update in localStorage bank (AI questions)
    const bank = Storage.get(KEYS.MCQ_BANK, []);
    const idx = bank.findIndex(bq => bq.id === questionId);
    if (idx !== -1) {
      bank[idx].timesShown = (bank[idx].timesShown || 0) + 1;
      if (isCorrect) bank[idx].timesCorrect = (bank[idx].timesCorrect || 0) + 1;
      Storage.set(KEYS.MCQ_BANK, bank);
    }
  },

  /* ── Next Question ── */
  nextQuestion() {
    if (this.currentIndex < this.currentSession.length - 1) {
      this.currentIndex += 1;
      this.selectedAnswer = null;
      this.answered = false;
      return true;
    }
    return false; // session complete
  },

  /* ── Get Session Accuracy ── */
  getAccuracy() {
    if (this.sessionStats.attempted === 0) return 0;
    return Math.round((this.sessionStats.correct / this.sessionStats.attempted) * 100);
  },

  /* ── Get Elapsed Time ── */
  getElapsed() {
    if (!this.sessionStats.startTime) return '00:00';
    const elapsed = Math.floor((Date.now() - this.sessionStats.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  },

  /* ── Flag for Revision ── */
  flagForRevision(questionId) {
    const q = this.allQuestions.find(q => q.id === questionId);
    if (!q) return false;

    const cards = Storage.get(KEYS.SRS_CARDS, []);
    const exists = cards.find(c => c.id === questionId);

    if (!exists) {
      const newCard = {
        id: questionId,
        questionId: questionId,
        interval: 1,
        dueDate: DateUtils.addDays(DateUtils.today(), 1),
        easeFactor: 2.5,
        reps: 0,
        incorrectCount: 0,
        question: q.question,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        topic: q.topic,
        addedAt: new Date().toISOString(),
      };
      cards.push(newCard);
      Storage.set(KEYS.SRS_CARDS, cards);
      Toast.show(`"${q.question.substring(0, 40)}..." added to revision`, 'success');
      return true;
    } else {
      Toast.show('Already in your revision queue', 'info');
      return false;
    }
  },

  /* ── Generate AI Questions ── */
  async generateAIQuestions(topic, count = 10) {
    let notesText = '';
    try {
      notesText = await DB.getAllNotesText();
    } catch (err) {
      console.warn('Could not fetch notes from IndexedDB:', err);
    }

    const context = getRelevantNoteChunk(notesText, topic);

    const systemPrompt = `You are a medical education expert creating high-quality MCQ questions for MBBS/NEET PG exam preparation. Generate questions strictly based on the provided study notes. Output ONLY valid JSON — no markdown, no explanation outside JSON.`;

    const userMessage = `${context}

Based ONLY on the notes above, generate exactly ${count} MCQ questions on the topic: "${topic}".

Return a JSON array with this exact schema for each question:
{
  "question": "string",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A|B|C|D",
  "explanation": "string (2-3 sentences explaining why correct and why others are wrong)",
  "topic": "${topic}",
  "subject": "string",
  "difficulty": "easy|medium|hard"
}

Output only the JSON array, starting with [ and ending with ].`;

    const result = await AIClient.call(systemPrompt, userMessage);
    if (!result) return [];

    try {
      // Extract JSON array from response
      const match = result.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response');

      const parsed = JSON.parse(match[0]);
      const now = new Date().toISOString();

      const newQuestions = parsed.map(q => ({
        id: generateId(),
        question: q.question,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        topic: q.topic || topic,
        subject: q.subject || 'General',
        source: 'ai-generated',
        difficulty: q.difficulty || 'medium',
        createdAt: now,
        timesShown: 0,
        timesCorrect: 0,
      }));

      // Save to localStorage bank
      const bank = Storage.get(KEYS.MCQ_BANK, []);
      bank.push(...newQuestions);
      Storage.set(KEYS.MCQ_BANK, bank);

      // Add to in-memory pool
      this.allQuestions.push(...newQuestions);

      Toast.show(`Generated ${newQuestions.length} new questions on "${topic}"`, 'success');
      return newQuestions;
    } catch (err) {
      console.error('Failed to parse AI questions:', err);
      Toast.show('Failed to parse AI-generated questions', 'error');
      return [];
    }
  },

  /* ── Get AI Explanation ── */
  async getAIExplanation(question) {
    let notesText = '';
    try {
      notesText = await DB.getAllNotesText();
    } catch {}

    const context = getRelevantNoteChunk(notesText, question.topic || question.question.substring(0, 50));

    const systemPrompt = `You are a medical tutor. Explain concepts clearly and concisely, strictly based on the provided study notes.`;

    const userMessage = `${context}

Question: ${question.question}
Correct Answer: ${question.correct}) ${question.options[question.correct]}

Please provide a clear, detailed explanation of why ${question.correct} is correct and briefly mention why the other options are incorrect. Keep your response under 200 words.`;

    return await AIClient.call(systemPrompt, userMessage);
  },

  /* ── Shuffle Array ── */
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};

window.QuizEngine = QuizEngine;
