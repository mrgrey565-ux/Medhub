/* ============================================================
   MEDICAL STUDY HUB — NOTES ENGINE
   AI notes generation, saving, export, topic suggestions
   ============================================================ */

'use strict';

const NotesEngine = {

  /* ── Generate Notes ── */
  async generateNotes(topic, scope = 'standard') {
    if (!topic || !topic.trim()) {
      Toast.show('Please enter a topic', 'error');
      return null;
    }

    let notesText = '';
    try {
      notesText = await DB.getAllNotesText();
    } catch (err) {
      console.warn('Could not load notes from IndexedDB:', err);
    }

    const context = getRelevantNoteChunk(notesText, topic);

    const scopeInstructions = {
      quick: 'Generate a concise summary (3–5 bullet points per section) covering the most essential high-yield facts.',
      standard: 'Generate comprehensive study notes with clear sections, key definitions, mechanisms, clinical relevance, and mnemonics where applicable.',
      deep: 'Generate extremely detailed notes covering all aspects: basic science foundations, detailed mechanisms, clinical presentations, investigations, management, complications, and exam-focused mnemonics. Be thorough.',
    };

    const systemPrompt = `You are an expert medical educator creating structured study notes for MBBS/NEET PG students. You MUST base your response STRICTLY and EXCLUSIVELY on the student's personal study notes provided. Do NOT add any information not present in the source material. Format your response in clean markdown with headers (##), bullet points, bold key terms, and clear structure.`;

    const userMessage = `${context}

Topic: ${topic}
Scope: ${scopeInstructions[scope] || scopeInstructions.standard}

Generate well-structured study notes on "${topic}" using ONLY the information in the notes above. Use this structure:
## Overview
## Key Concepts
## Mechanisms / Pathophysiology
## Clinical Relevance
## High-Yield Points
## Mnemonics (if applicable)`;

    const result = await AIClient.call(systemPrompt, userMessage);
    return result;
  },

  /* ── Save Note ── */
  saveNote(topic, content, scope) {
    const notes = Storage.get(KEYS.NOTES_LIB, []);
    const existingIdx = notes.findIndex(n => n.topic.toLowerCase() === topic.toLowerCase());

    const noteObj = {
      id: generateId(),
      topic: topic.trim(),
      content: content,
      scope: scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx !== -1) {
      noteObj.id = notes[existingIdx].id;
      noteObj.createdAt = notes[existingIdx].createdAt;
      notes[existingIdx] = noteObj;
    } else {
      notes.unshift(noteObj);
      StudyStats.recordNoteGenerated();
    }

    Storage.set(KEYS.NOTES_LIB, notes);
    return noteObj;
  },

  /* ── Get All Saved Notes ── */
  getAllNotes() {
    return Storage.get(KEYS.NOTES_LIB, []);
  },

  /* ── Delete Note ── */
  deleteNote(id) {
    const notes = Storage.get(KEYS.NOTES_LIB, []);
    const filtered = notes.filter(n => n.id !== id);
    Storage.set(KEYS.NOTES_LIB, filtered);
    return filtered;
  },

  /* ── Export Note as .txt ── */
  exportNote(note) {
    const content = `MEDICAL STUDY HUB — AI Generated Notes
Topic: ${note.topic}
Generated: ${new Date(note.createdAt).toLocaleString()}
Scope: ${note.scope || 'standard'}
${'='.repeat(60)}

${note.content}`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.topic.replace(/[^a-z0-9]/gi, '_')}_notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Note exported as .txt', 'success');
  },

  /* ── Generate MCQs from Notes Content ── */
  async generateMCQsFromNote(note) {
    const systemPrompt = `You are a medical education expert. Generate high-quality MCQ questions strictly based on the provided notes content. Output ONLY valid JSON array.`;

    const userMessage = `Based ONLY on these study notes, generate 5 high-quality MCQ questions:

Topic: ${note.topic}
Content:
${note.content.substring(0, 6000)}

Return a JSON array with this schema for each question:
{
  "question": "string",
  "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
  "correct": "A|B|C|D",
  "explanation": "string",
  "topic": "${note.topic}",
  "subject": "General",
  "difficulty": "easy|medium|hard"
}

Output only the JSON array.`;

    const result = await AIClient.call(systemPrompt, userMessage);
    if (!result) return [];

    try {
      const match = result.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');

      const parsed = JSON.parse(match[0]);
      const now = new Date().toISOString();

      const newQs = parsed.map(q => ({
        id: generateId(),
        question: q.question,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        topic: q.topic || note.topic,
        subject: q.subject || 'General',
        source: 'ai-generated',
        difficulty: q.difficulty || 'medium',
        createdAt: now,
        timesShown: 0,
        timesCorrect: 0,
      }));

      const bank = Storage.get(KEYS.MCQ_BANK, []);
      bank.push(...newQs);
      Storage.set(KEYS.MCQ_BANK, bank);

      Toast.show(`Generated ${newQs.length} MCQs from "${note.topic}"`, 'success');
      return newQs;
    } catch (err) {
      Toast.show('Failed to parse generated MCQs', 'error');
      return [];
    }
  },

  /* ── Get Topic Suggestions ── */
  getTopicSuggestions() {
    const notes = this.getAllNotes();
    const fromNotes = notes.map(n => n.topic);

    const commonTopics = [
      'Cardiac Action Potential', 'Renin-Angiotensin-Aldosterone System',
      'Inflammation', 'Complement System', 'Cell Cycle', 'Apoptosis',
      'Glycolysis', 'Krebs Cycle', 'Oxidative Phosphorylation',
      'Neuromuscular Junction', 'Blood-Brain Barrier', 'Immune Response',
      'Clotting Cascade', 'Renal Tubular Transport', 'Liver Metabolism',
      'Thyroid Hormones', 'Adrenal Cortex', 'Insulin Resistance',
      'Antibiotic Mechanisms', 'Beta-Lactam Resistance',
    ];

    const all = [...new Set([...fromNotes, ...commonTopics])];
    return all.slice(0, 30);
  },
};

window.NotesEngine = NotesEngine;
