/* ============================================================
   MEDICAL STUDY HUB — HEKO ENGINE
   Daily 10-minute fundamental session logic & tracking
   ============================================================ */

'use strict';

const HEKO_TOPICS = [
  'Cardiac Action Potential', 'Renin-Angiotensin System', 'Coagulation Cascade',
  'Complement System', 'Cell-Mediated Immunity', 'Hypersensitivity Reactions',
  'Glycolysis', 'Krebs Cycle', 'Oxidative Phosphorylation', 'Beta-Oxidation',
  'Neuromuscular Junction', 'Blood-Brain Barrier', 'Autonomic Nervous System',
  'Thyroid Hormone Synthesis', 'Adrenal Cortex Hormones', 'Insulin Secretion',
  'Renal Autoregulation', 'Tubular Reabsorption', 'Acid-Base Balance',
  'Hemoglobin Oxygen Dissociation', 'Pulmonary Surfactant', 'Dead Space',
  'Liver Metabolism', 'Bile Synthesis', 'Portal Hypertension',
  'Inflammation Mediators', 'Wound Healing', 'Apoptosis vs Necrosis',
  'Cell Cycle Checkpoints', 'DNA Repair Mechanisms',
  'Antibiotic Mechanisms', 'Bacterial Resistance', 'Viral Replication',
  'Innate Immunity', 'Antigen Presentation', 'Antibody Structure',
  'Neurotransmitters', 'Synaptic Transmission', 'Cerebrospinal Fluid',
  'Frank-Starling Mechanism', 'Cardiac Cycle', 'JVP Waveform',
  'Glomerular Filtration', 'Starling Forces', 'Capillary Exchange',
  'Heme Synthesis', 'Bilirubin Metabolism', 'Iron Metabolism',
  'Clotting Factors', 'Fibrinolysis', 'Platelet Activation',
  'Beta-Lactam Antibiotics', 'Aminoglycosides', 'Fluoroquinolones',
  'Steroid Biosynthesis', 'Prostaglandin Synthesis', 'Eicosanoids',
];

const HekoEngine = {

  /* ── Get Today's Topic ── */
  getTodaysTopic() {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
    );
    const idx = dayOfYear % HEKO_TOPICS.length;
    return HEKO_TOPICS[idx];
  },

  /* ── Get Tomorrow's Topic ── */
  getTomorrowsTopic() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayOfYear = Math.floor(
      (tomorrow - new Date(tomorrow.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
    );
    const idx = dayOfYear % HEKO_TOPICS.length;
    return HEKO_TOPICS[idx];
  },

  /* ── Check if Already Completed Today ── */
  isCompletedToday() {
    const history = Storage.get(KEYS.HEKO_HISTORY, []);
    const today = DateUtils.today();
    return history.some(h => h.date === today);
  },

  /* ── Mark Session Complete ── */
  completeSession(topic, score) {
    const history = Storage.get(KEYS.HEKO_HISTORY, []);
    const today = DateUtils.today();

    // Avoid duplicate
    if (!history.some(h => h.date === today)) {
      history.unshift({
        date: today,
        topic: topic,
        score: score,
        completedAt: new Date().toISOString(),
      });
      Storage.set(KEYS.HEKO_HISTORY, history);
      StreakManager.update();
    }
  },

  /* ── Get Last 7 Days History ── */
  getLast7Days() {
    const history = Storage.get(KEYS.HEKO_HISTORY, []);
    const historyMap = {};
    history.forEach(h => { historyMap[h.date] = h; });

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        completed: !!historyMap[dateStr],
        topic: historyMap[dateStr] ? historyMap[dateStr].topic : null,
        score: historyMap[dateStr] ? historyMap[dateStr].score : null,
      });
    }
    return days;
  },

  /* ── Generate Phase 1: Core Concept ── */
  async generateCoreConcept(topic) {
    let notesText = '';
    try { notesText = await DB.getAllNotesText(); } catch {}

    const context = getRelevantNoteChunk(notesText, topic, 12000);

    const systemPrompt = `You are a concise medical tutor. Generate a brief core concept summary strictly from the provided notes. Be direct and high-yield. Use bullet points. Keep it readable in 3 minutes.`;

    const userMessage = `${context}

Generate a concise "Core Concept" summary for: "${topic}"

Format:
**What is it?** (1-2 sentences)
**Key Mechanism:** (3-5 bullet points)
**Why it matters clinically:** (2-3 bullet points)

Keep the entire response under 250 words. Only use information from the notes above.`;

    return await AIClient.call(systemPrompt, userMessage);
  },

  /* ── Generate Phase 2: Rapid-Fire MCQs ── */
  async generateRapidMCQs(topic) {
    let notesText = '';
    try { notesText = await DB.getAllNotesText(); } catch {}

    const context = getRelevantNoteChunk(notesText, topic, 10000);

    const systemPrompt = `You are a medical exam question writer. Generate rapid-fire MCQs strictly from the provided notes. Output ONLY valid JSON.`;

    const userMessage = `${context}

Generate exactly 5 rapid-fire MCQ questions on: "${topic}"

Return JSON array only:
[{
  "question": "string (concise, direct)",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A|B|C|D",
  "explanation": "string (1 sentence)"
}]`;

    const result = await AIClient.call(systemPrompt, userMessage);
    if (!result) return [];

    try {
      const match = result.match(/\[[\s\S]*\]/);
      if (!match) return [];
      return JSON.parse(match[0]);
    } catch {
      return [];
    }
  },

  /* ── Generate Phase 3: Key Takeaways ── */
  async generateTakeaways(topic) {
    let notesText = '';
    try { notesText = await DB.getAllNotesText(); } catch {}

    const context = getRelevantNoteChunk(notesText, topic, 8000);

    const systemPrompt = `You are a medical educator. Generate memorable key takeaways from the student's notes only.`;

    const userMessage = `${context}

For the topic "${topic}", generate exactly 3 high-yield key takeaways to remember for exams.

Format:
**Takeaway 1:** [bold point]
[1-2 sentence elaboration]

**Takeaway 2:** ...

**Takeaway 3:** ...

Keep under 200 words total. Use ONLY information from the notes above.`;

    return await AIClient.call(systemPrompt, userMessage);
  },

  /* ── Phase Duration Config (in seconds) ── */
  phases: [
    { id: 1, name: 'Core Concept',    duration: 180, icon: '🧠' },
    { id: 2, name: 'Rapid-Fire MCQs', duration: 240, icon: '⚡' },
    { id: 3, name: 'Key Takeaways',   duration: 180, icon: '🎯' },
  ],

  totalDuration: 600, // 10 minutes

  getAllTopics() {
    return HEKO_TOPICS;
  },
};

window.HekoEngine = HekoEngine;
window.HEKO_TOPICS = HEKO_TOPICS;
