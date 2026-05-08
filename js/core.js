/* ============================================================
   MEDICAL STUDY HUB — CORE.JS
   Shared foundation: nav, theme, localStorage helpers,
   AI client, API key management
   ============================================================ */

'use strict';

/* ── Navigation Config ── */
const NAV_ITEMS = [
  { href: 'index.html',    icon: '🏠', label: 'Dashboard' },
  { href: 'study.html',    icon: '📚', label: 'Study' },
  { href: 'exam.html',     icon: '📝', label: 'Exam' },
  { href: 'notes.html',    icon: '🤖', label: 'AI Notes' },
  { href: 'heko.html',     icon: '⚡', label: 'HEKO' },
  { href: 'revision.html', icon: '🔁', label: 'Revision' },
  { href: 'library.html',  icon: '📁', label: 'Library' },
  { href: 'planning.html', icon: '📅', label: 'Planning' },
];

/* ── localStorage Keys ── */
const KEYS = {
  API_KEY     : 'medhub_api_key',
  THEME       : 'medhub_theme',
  STREAK      : 'medhub_streak',
  MCQ_BANK    : 'medhub_mcq_bank',
  NOTES_LIB   : 'medhub_notes_library',
  HEKO_HISTORY: 'medhub_heko_history',
  SRS_CARDS   : 'medhub_srs_cards',
  STUDY_STATS : 'medhub_study_stats',
  PLANNER     : 'medhub_planner_tasks',
  EXAM_DATE   : 'medhub_exam_date',
  LAST_PAGE   : 'medhub_last_page',
};

/* ── Storage Helpers ── */
const Storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
};

/* ── AI Client ── */
const AIClient = {
  getApiKey() {
    return localStorage.getItem(KEYS.API_KEY) || null;
  },

  saveApiKey(key) {
    localStorage.setItem(KEYS.API_KEY, key.trim());
  },

  clearApiKey() {
    localStorage.removeItem(KEYS.API_KEY);
  },
async call(systemPrompt, userMessage) {
  const key = this.getApiKey();
  if (!key) {
    this.promptForKey();
    return null;
  }

  try {
    const response = await fetch('https://opus.abhibots.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8146,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    // Log raw response info for debugging
    console.log('Response status:', response.status);
    console.log('Response headers:', [...response.headers.entries()]);

    if (!response.ok) {
      let errMsg = `API Error ${response.status}`;
      try {
        const errBody = await response.json();
        console.log('Error response body:', errBody);
        errMsg = errBody.error?.message || errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody);
      } catch {
        errMsg = await response.text();
      }
      
      if (response.status === 401) {
        Toast.show('Invalid API key. Please update it.', 'error');
        this.promptForKey();
        return null;
      }
      Toast.show(`API Error: ${errMsg}`, 'error');
      return null;
    }

    // Parse response and log for debugging
    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));

    // Anthropic format: { content: [{ type: "text", text: "..." }] }
    if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
      console.log('Detected: Anthropic format');
      return data.content[0].text;
    }

    // OpenAI format: { choices: [{ message: { content: "..." } }] }
    if (data.choices && Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      console.log('Detected: OpenAI format');
      return data.choices[0].message.content;
    }

    // Direct text field
    if (typeof data.text === 'string') { console.log('Detected: text field'); return data.text; }
    if (typeof data.result === 'string') { console.log('Detected: result field'); return data.result; }
    if (typeof data.output === 'string') { console.log('Detected: output field'); return data.output; }
    if (typeof data.message === 'string') { console.log('Detected: message field'); return data.message; }
    if (typeof data.response === 'string') { console.log('Detected: response field'); return data.response; }

    // Check for nested objects with text
    if (data.data?.text) { console.log('Detected: data.text'); return data.data.text; }
    if (data.data?.content) { console.log('Detected: data.content'); return data.data.content; }
    if (data.result?.text) { console.log('Detected: result.text'); return data.result.text; }
    if (data.output?.text) { console.log('Detected: output.text'); return data.output.text; }
    if (data.response?.text) { console.log('Detected: response.text'); return data.response.text; }

    // Check if content is directly in data (single field response)
    if (typeof data === 'string') { console.log('Detected: raw string'); return data; }

    // Check for any property that looks like content
    for (const key of Object.keys(data)) {
      if (typeof data[key] === 'string' && data[key].length > 50) {
        console.log(`Detected: ${key} field`);
        return data[key];
      }
    }

    // No valid response found
    console.error('Unexpected API response structure:', data);
    Toast.show('Unexpected response format from API', 'error');
    return null;
 } catch (err) {
    console.error('AIClient.call error:', err);
    if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')) {
      Toast.show('Network error — check your connection.', 'error');
    } else {
      Toast.show(`AI Error: ${err.message}`, 'error');
    }
    return null;
  }
},
   catch (err) {
      if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')) {
        Toast.show('Network error — check your connection.', 'error');
      } else {
        Toast.show(`AI Error: ${err.message}`, 'error');
      }
      console.error('AIClient.call error:', err);
      return null;
    }
  },

  promptForKey() {
    const existing = document.getElementById('api-key-modal');
    if (existing) { existing.classList.remove('hidden'); return; }

    const modal = document.createElement('div');
    modal.id = 'api-key-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;margin-bottom:12px;">🔑</div>
          <div class="modal-title">API Key Required</div>
          <div class="modal-subtitle">
            Enter your API key to enable AI features. Your key is stored
            locally in your browser and never sent anywhere except the AI API.
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input
            type="password"
            id="api-key-input"
            class="form-input"
            placeholder="sk-ant-..."
            autocomplete="off"
          />
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary btn-full" id="api-key-save">
            💾 Save & Continue
          </button>
          <button class="btn btn-ghost" id="api-key-cancel" style="min-width:80px;">
            Cancel
          </button>
        </div>
        <p style="margin-top:12px;font-size:0.75rem;color:var(--text-muted);text-align:center;">
          API endpoint: opus.abhibots.com · Model: claude-sonnet-4-6
        </p>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#api-key-input');
    const saveBtn = modal.querySelector('#api-key-save');
    const cancelBtn = modal.querySelector('#api-key-cancel');

    const savedKey = this.getApiKey();
    if (savedKey) { input.value = savedKey; }

    saveBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) { Toast.show('Please enter a valid API key', 'error'); return; }
      this.saveApiKey(val);
      modal.classList.add('hidden');
      Toast.show('API key saved!', 'success');
      updateApiStatusIndicator();
    });

    cancelBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
  },
};

/* ── Notes Chunking ── */
function getRelevantNoteChunk(notesText, topic, maxChars = 24000) {
  const prefix = `The following are the student's personal study notes. ` +
    `Base ALL responses strictly and exclusively on this content. ` +
    `Do not add external knowledge.\n\n`;

  if (!notesText || notesText.trim().length === 0) {
    return prefix + '[No notes uploaded yet. Please upload your .txt notes files in the Library section.]';
  }

  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const paragraphs = notesText.split(/\n{2,}/);

  const scored = paragraphs.map(p => {
    const lower = p.toLowerCase();
    let score = 0;
    topicWords.forEach(word => {
      const matches = (lower.match(new RegExp(word, 'g')) || []).length;
      score += matches;
    });
    return { text: p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let result = '';
  for (const item of scored) {
    if ((result + item.text).length > maxChars) break;
    result += item.text + '\n\n';
  }

  if (!result.trim()) {
    result = notesText.substring(0, maxChars);
  }

  return prefix + result.trim();
}

/* ── Theme Manager ── */
const ThemeManager = {
  init() {
    const saved = Storage.get(KEYS.THEME, 'dark');
    this.apply(saved);
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.set(KEYS.THEME, theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  },
  toggle() {
    const current = Storage.get(KEYS.THEME, 'dark');
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
};

/* ── Toast Notifications ── */
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-msg">${message}</span>
    `;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
};

/* ── Navigation Builder ── */
function buildNavigation() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // ── Sidebar ──
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) {
    const isCollapsed = Storage.get('medhub_sidebar_collapsed', false);
    if (isCollapsed) sidebarEl.classList.add('collapsed');

    const mainContent = document.getElementById('main-content');
    if (mainContent && isCollapsed) mainContent.classList.add('sidebar-collapsed');

    sidebarEl.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo">🩺</div>
        <div class="sidebar-title">MedStudy Hub</div>
        <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">
          ${isCollapsed ? '›' : '‹'}
        </button>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map(item => `
          <a href="${item.href}"
             class="nav-item ${currentPage === item.href ? 'active' : ''}"
             title="${item.label}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <button class="nav-item" id="theme-toggle" style="width:100%;background:none;"
                title="Toggle theme">
          ${Storage.get(KEYS.THEME, 'dark') === 'dark' ? '☀️' : '🌙'}
          <span class="nav-label">Toggle Theme</span>
        </button>
        <div id="api-status-sidebar" class="api-status ${AIClient.getApiKey() ? 'connected' : 'disconnected'}"
             onclick="AIClient.promptForKey()"
             style="margin-top:8px;width:100%;justify-content:center;">
          <span class="status-dot"></span>
          <span class="nav-label">${AIClient.getApiKey() ? 'AI Connected' : 'Set API Key'}</span>
        </div>
      </div>
    `;

    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const collapsed = sidebarEl.classList.toggle('collapsed');
        if (mainContent) mainContent.classList.toggle('sidebar-collapsed', collapsed);
        Storage.set('medhub_sidebar_collapsed', collapsed);
        toggleBtn.textContent = collapsed ? '›' : '‹';
      });
    }

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => ThemeManager.toggle());
    }
  }

  // ── Bottom Nav (Mobile) ──
  const bottomNavEl = document.getElementById('bottom-nav');
  if (bottomNavEl) {
    const visibleItems = NAV_ITEMS.slice(0, 5);
    bottomNavEl.innerHTML = `
      <div class="bottom-nav-items">
        ${visibleItems.map(item => `
          <a href="${item.href}"
             class="bottom-nav-item ${currentPage === item.href ? 'active' : ''}"
             title="${item.label}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `).join('')}
        <a href="#more-menu" class="bottom-nav-item" id="more-btn"
           onclick="toggleMoreMenu(event)">
          <span class="nav-icon">⋯</span>
          <span>More</span>
        </a>
      </div>
      <div id="more-menu" class="hidden" style="
        position:fixed;bottom:var(--bottom-nav-height);left:0;right:0;
        background:var(--bg-card);border-top:1px solid var(--border-subtle);
        padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;
        z-index:200;
      ">
        ${NAV_ITEMS.slice(5).map(item => `
          <a href="${item.href}"
             class="bottom-nav-item ${currentPage === item.href ? 'active' : ''}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `).join('')}
        <button class="bottom-nav-item" onclick="ThemeManager.toggle()">
          <span class="nav-icon" id="theme-toggle">
            ${Storage.get(KEYS.THEME, 'dark') === 'dark' ? '☀️' : '🌙'}
          </span>
          <span>Theme</span>
        </button>
      </div>
    `;
  }
}

function toggleMoreMenu(e) {
  e.preventDefault();
  const menu = document.getElementById('more-menu');
  if (menu) menu.classList.toggle('hidden');
}

function updateApiStatusIndicator() {
  const indicators = document.querySelectorAll('#api-status-sidebar');
  const hasKey = !!AIClient.getApiKey();
  indicators.forEach(el => {
    el.className = `api-status ${hasKey ? 'connected' : 'disconnected'}`;
    const label = el.querySelector('.nav-label');
    if (label) label.textContent = hasKey ? 'AI Connected' : 'Set API Key';
  });
}

/* ── Streak Manager ── */
const StreakManager = {
  get() {
    return Storage.get(KEYS.STREAK, { count: 0, lastDate: null });
  },

  update() {
    const streak = this.get();
    const today = new Date().toISOString().split('T')[0];

    if (streak.lastDate === today) return streak;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];

    if (streak.lastDate === yStr) {
      streak.count += 1;
    } else if (streak.lastDate !== today) {
      streak.count = 1;
    }

    streak.lastDate = today;
    Storage.set(KEYS.STREAK, streak);
    return streak;
  },

  reset() {
    Storage.set(KEYS.STREAK, { count: 0, lastDate: null });
  },
};

/* ── Study Stats ── */
const StudyStats = {
  get() {
    return Storage.get(KEYS.STUDY_STATS, {
      totalAnswered: 0,
      totalCorrect: 0,
      sessionsCount: 0,
      notesGenerated: 0,
    });
  },

  recordAnswer(correct) {
    const stats = this.get();
    stats.totalAnswered += 1;
    if (correct) stats.totalCorrect += 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },

  recordSession() {
    const stats = this.get();
    stats.sessionsCount += 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },

  recordNoteGenerated() {
    const stats = this.get();
    stats.notesGenerated = (stats.notesGenerated || 0) + 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },

  accuracy() {
    const stats = this.get();
    if (stats.totalAnswered === 0) return 0;
    return Math.round((stats.totalCorrect / stats.totalAnswered) * 100);
  },
};

/* ── Date Helpers ── */
const DateUtils = {
  today() {
    return new Date().toISOString().split('T')[0];
  },
  format(dateStr, opts = {}) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      ...opts,
    });
  },
  daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff;
  },
  addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  },
};

/* ── UUID Generator ── */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ── Simple Markdown Renderer ── */
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[h|u|b|p|l])(.+)$/gm, (m) => m.trim() ? m : '')
    .replace(/\n/g, '<br>');
}

/* ── IndexedDB Helper ── */
const DB = {
  db: null,
  DB_NAME: 'MedHubDB',
  DB_VERSION: 1,
  STORE: 'notes_files',

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          const store = db.createObjectStore(this.STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('filename', 'filename', { unique: false });
          store.createIndex('uploadDate', 'uploadDate', { unique: false });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },

  async getAllFiles() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const req = tx.objectStore(this.STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async addFile(fileObj) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).add(fileObj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteFile(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clearAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getAllNotesText() {
    const files = await this.getAllFiles();
    return files.map(f => f.content).join('\n\n---\n\n');
  },
};

/* ── Medical Topic Auto-Tagger ── */
const MEDICAL_KEYWORDS = [
  'anatomy', 'physiology', 'pathology', 'pharmacology', 'biochemistry',
  'microbiology', 'immunology', 'histology', 'embryology', 'genetics',
  'cardiology', 'neurology', 'nephrology', 'hepatology', 'pulmonology',
  'gastroenterology', 'endocrinology', 'hematology', 'oncology', 'dermatology',
  'orthopedics', 'ophthalmology', 'ent', 'obstetrics', 'gynecology', 'pediatrics',
  'psychiatry', 'surgery', 'radiology', 'anesthesia', 'emergency',
  'diabetes', 'hypertension', 'infection', 'inflammation', 'cancer',
  'heart', 'lung', 'liver', 'kidney', 'brain', 'bone', 'blood', 'cell',
  'receptor', 'enzyme', 'hormone', 'protein', 'dna', 'rna', 'antibody',
  'diagnosis', 'treatment', 'prognosis', 'etiology', 'pathogenesis',
  'neet', 'mbbs', 'usmle', 'clinical', 'case study',
];

function autoTagTopics(text) {
  const lower = text.toLowerCase();
  return MEDICAL_KEYWORDS.filter(kw => lower.includes(kw)).slice(0, 8);
}

/* ── App Initialization ── */
function initApp() {
  ThemeManager.init();
  buildNavigation();
  Toast.init();

  // Update last page
  Storage.set(KEYS.LAST_PAGE, window.location.pathname.split('/').pop());

  // Close more menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('more-menu');
    const moreBtn = document.getElementById('more-btn');
    if (menu && !menu.classList.contains('hidden') &&
        !menu.contains(e.target) && e.target !== moreBtn) {
      menu.classList.add('hidden');
    }
  });
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* ── Global Expose ── */
window.AIClient = AIClient;
window.Storage = Storage;
window.KEYS = KEYS;
window.DB = DB;
window.Toast = Toast;
window.ThemeManager = ThemeManager;
window.StreakManager = StreakManager;
window.StudyStats = StudyStats;
window.DateUtils = DateUtils;
window.generateId = generateId;
window.renderMarkdown = renderMarkdown;
window.getRelevantNoteChunk = getRelevantNoteChunk;
window.autoTagTopics = autoTagTopics;
window.updateApiStatusIndicator = updateApiStatusIndicator;
window.toggleMoreMenu = toggleMoreMenu;
