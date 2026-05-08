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

      // Log response info for debugging
      console.log('Response status:', response.status);

      if (!response.ok) {
        let errMsg = 'API Error ' + response.status;
        try {
          const errBody = await response.json();
          console.log('Error body:', errBody);
          errMsg = errBody.error?.message || errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody);
        } catch {
          errMsg = await response.text();
        }
        
        if (response.status === 401) {
          Toast.show('Invalid API key. Please update it.', 'error');
          this.promptForKey();
          return null;
        }
        Toast.show('API Error: ' + errMsg, 'error');
        return null;
      }

      // Parse response
      const data = await response.json();
      console.log('Full API Response:', JSON.stringify(data, null, 2));

      // Anthropic format
      if (data.content && Array.isArray(data.content) && data.content[0] && data.content[0].text) {
        console.log('Format: Anthropic');
        return data.content[0].text;
      }

      // OpenAI format
      if (data.choices && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        console.log('Format: OpenAI');
        return data.choices[0].message.content;
      }

      // Direct fields
      if (typeof data.text === 'string') { console.log('Format: text'); return data.text; }
      if (typeof data.result === 'string') { console.log('Format: result'); return data.result; }
      if (typeof data.output === 'string') { console.log('Format: output'); return data.output; }
      if (typeof data.message === 'string') { console.log('Format: message'); return data.message; }
      if (typeof data.response === 'string') { console.log('Format: response'); return data.response; }

      // Nested fields
      if (data.data && (typeof data.data.text === 'string' || typeof data.data.content === 'string')) {
        console.log('Format: data.*');
        return data.data.text || data.data.content;
      }
      if (data.result && (typeof data.result.text === 'string' || typeof data.result.content === 'string')) {
        console.log('Format: result.*');
        return data.result.text || data.result.content;
      }

      // No valid response
      console.error('Could not parse API response. Check console for full data.', data);
      Toast.show('Unexpected response format from API. Check console.', 'error');
      return null;

    } catch (err) {
      console.error('AIClient.call error:', err);
      if (err.message.indexOf('fetch') !== -1 || err.message.indexOf('network') !== -1) {
        Toast.show('Network error — check your connection.', 'error');
      } else {
        Toast.show('AI Error: ' + err.message, 'error');
      }
      return null;
    }
  },

  promptForKey() {
    const existing = document.getElementById('api-key-modal');
    if (existing) { existing.classList.remove('hidden'); return; }

    const modal = document.createElement('div');
    modal.id = 'api-key-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:48px;margin-bottom:12px;">🔑</div>' +
        '<div class="modal-title">API Key Required</div>' +
        '<div class="modal-subtitle">Enter your API key to enable AI features.</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">API Key</label>' +
        '<input type="password" id="api-key-input" class="form-input" placeholder="sk-ant-..." autocomplete="off" />' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button class="btn btn-primary btn-full" id="api-key-save">💾 Save & Continue</button>' +
        '<button class="btn btn-ghost" id="api-key-cancel" style="min-width:80px;">Cancel</button>' +
      '</div>' +
      '<p style="margin-top:12px;font-size:0.75rem;color:var(--text-muted);text-align:center;">API endpoint: opus.abhibots.com</p>' +
    '</div>';
    document.body.appendChild(modal);

    var input = modal.querySelector('#api-key-input');
    var saveBtn = modal.querySelector('#api-key-save');
    var cancelBtn = modal.querySelector('#api-key-cancel');

    var savedKey = this.getApiKey();
    if (savedKey) { input.value = savedKey; }

    saveBtn.addEventListener('click', function() {
      var val = input.value.trim();
      if (!val) { Toast.show('Please enter a valid API key', 'error'); return; }
      AIClient.saveApiKey(val);
      modal.classList.add('hidden');
      Toast.show('API key saved!', 'success');
      updateApiStatusIndicator();
    });

    cancelBtn.addEventListener('click', function() {
      modal.classList.add('hidden');
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') saveBtn.click();
    });
  },
};

/* ── Notes Chunking ── */
function getRelevantNoteChunk(notesText, topic, maxChars) {
  maxChars = maxChars || 24000;
  var prefix = 'The following are the student\'s personal study notes. Base ALL responses strictly and exclusively on this content. Do not add external knowledge.\n\n';

  if (!notesText || notesText.trim().length === 0) {
    return prefix + '[No notes uploaded yet. Please upload your .txt notes files in the Library section.]';
  }

  var topicWords = topic.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 2; });
  var paragraphs = notesText.split(/\n{2,}/);

  var scored = paragraphs.map(function(p) {
    var lower = p.toLowerCase();
    var score = 0;
    topicWords.forEach(function(word) {
      var matches = lower.match(new RegExp(word, 'g'));
      score += matches ? matches.length : 0;
    });
    return { text: p, score: score };
  });

  scored.sort(function(a, b) { return b.score - a.score; });

  var result = '';
  for (var i = 0; i < scored.length; i++) {
    if ((result + scored[i].text).length > maxChars) break;
    result += scored[i].text + '\n\n';
  }

  if (!result.trim()) {
    result = notesText.substring(0, maxChars);
  }

  return prefix + result.trim();
}

/* ── Theme Manager ── */
const ThemeManager = {
  init: function() {
    var saved = Storage.get(KEYS.THEME, 'dark');
    this.apply(saved);
  },
  apply: function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.set(KEYS.THEME, theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  },
  toggle: function() {
    var current = Storage.get(KEYS.THEME, 'dark');
    this.apply(current === 'dark' ? 'light' : 'dark');
  }
};

/* ── Toast Notifications ── */
const Toast = {
  container: null,
  init: function() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show: function(message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;
    this.init();
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-msg">' + message + '</span>';
    this.container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(function() { toast.remove(); }, 300);
    }, duration);
  }
};

/* ── Navigation Builder ── */
function buildNavigation() {
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Sidebar
  var sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) {
    var isCollapsed = Storage.get('medhub_sidebar_collapsed', false);
    if (isCollapsed) sidebarEl.classList.add('collapsed');

    var mainContent = document.getElementById('main-content');
    if (mainContent && isCollapsed) mainContent.classList.add('sidebar-collapsed');

    var navHTML = '<div class="sidebar-header">' +
      '<div class="sidebar-logo">🩺</div>' +
      '<div class="sidebar-title">MedStudy Hub</div>' +
      '<button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">' + (isCollapsed ? '›' : '‹') + '</button>' +
    '</div>' +
    '<nav class="sidebar-nav">';

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      var active = currentPage === item.href ? ' active' : '';
      navHTML += '<a href="' + item.href + '" class="nav-item' + active + '" title="' + item.label + '">' +
        '<span class="nav-icon">' + item.icon + '</span>' +
        '<span class="nav-label">' + item.label + '</span>' +
      '</a>';
    }

    navHTML += '</nav><div class="sidebar-footer">' +
      '<button class="nav-item" id="theme-toggle" style="width:100%;background:none;" title="Toggle theme">' +
        (Storage.get(KEYS.THEME, 'dark') === 'dark' ? '☀️' : '🌙') +
        '<span class="nav-label">Toggle Theme</span>' +
      '</button>' +
      '<div id="api-status-sidebar" class="api-status ' + (AIClient.getApiKey() ? 'connected' : 'disconnected') + '" ' +
           'onclick="AIClient.promptForKey()" style="margin-top:8px;width:100%;justify-content:center;">' +
        '<span class="status-dot"></span>' +
        '<span class="nav-label">' + (AIClient.getApiKey() ? 'AI Connected' : 'Set API Key') + '</span>' +
      '</div>' +
    '</div>';

    sidebarEl.innerHTML = navHTML;

    var toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        var collapsed = sidebarEl.classList.toggle('collapsed');
        if (mainContent) mainContent.classList.toggle('sidebar-collapsed', collapsed);
        Storage.set('medhub_sidebar_collapsed', collapsed);
        toggleBtn.textContent = collapsed ? '›' : '‹';
      });
    }

    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function() { ThemeManager.toggle(); });
    }
  }

  // Bottom Nav (Mobile)
  var bottomNavEl = document.getElementById('bottom-nav');
  if (bottomNavEl) {
    var visibleItems = NAV_ITEMS.slice(0, 5);
    var bottomHTML = '<div class="bottom-nav-items">';

    for (var j = 0; j < visibleItems.length; j++) {
      var bitem = visibleItems[j];
      var bActive = currentPage === bitem.href ? ' active' : '';
      bottomHTML += '<a href="' + bitem.href + '" class="bottom-nav-item' + bActive + '" title="' + bitem.label + '">' +
        '<span class="nav-icon">' + bitem.icon + '</span>' +
        '<span>' + bitem.label + '</span>' +
      '</a>';
    }

    bottomHTML += '<a href="#more-menu" class="bottom-nav-item" id="more-btn" onclick="toggleMoreMenu(event)">' +
      '<span class="nav-icon">⋯</span><span>More</span></a></div>' +
      '<div id="more-menu" class="hidden" style="position:fixed;bottom:var(--bottom-nav-height);left:0;right:0;' +
        'background:var(--bg-card);border-top:1px solid var(--border-subtle);padding:16px;' +
        'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;z-index:200;">';

    for (var k = 5; k < NAV_ITEMS.length; k++) {
      var mitem = NAV_ITEMS[k];
      var mActive = currentPage === mitem.href ? ' active' : '';
      bottomHTML += '<a href="' + mitem.href + '" class="bottom-nav-item' + mActive + '">' +
        '<span class="nav-icon">' + mitem.icon + '</span>' +
        '<span>' + mitem.label + '</span>' +
      '</a>';
    }

    bottomHTML += '<button class="bottom-nav-item" onclick="ThemeManager.toggle()">' +
      '<span class="nav-icon">☀️</span><span>Theme</span></button></div>';

    bottomNavEl.innerHTML = bottomHTML;
  }
}

/* ── Toggle More Menu ── */
function toggleMoreMenu(e) {
  if (e) e.preventDefault();
  var menu = document.getElementById('more-menu');
  if (menu) menu.classList.toggle('hidden');
}

/* ── Update API Status ── */
function updateApiStatusIndicator() {
  var indicators = document.querySelectorAll('#api-status-sidebar');
  var hasKey = !!AIClient.getApiKey();
  for (var i = 0; i < indicators.length; i++) {
    indicators[i].className = 'api-status ' + (hasKey ? 'connected' : 'disconnected');
    var label = indicators[i].querySelector('.nav-label');
    if (label) label.textContent = hasKey ? 'AI Connected' : 'Set API Key';
  }
}

/* ── Streak Manager ── */
const StreakManager = {
  get: function() {
    return Storage.get(KEYS.STREAK, { count: 0, lastDate: null });
  },
  update: function() {
    var streak = this.get();
    var today = new Date().toISOString().split('T')[0];
    if (streak.lastDate === today) return streak;

    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yStr = yesterday.toISOString().split('T')[0];

    if (streak.lastDate === yStr) {
      streak.count += 1;
    } else if (streak.lastDate !== today) {
      streak.count = 1;
    }

    streak.lastDate = today;
    Storage.set(KEYS.STREAK, streak);
    return streak;
  },
  reset: function() {
    Storage.set(KEYS.STREAK, { count: 0, lastDate: null });
  }
};

/* ── Study Stats ── */
const StudyStats = {
  get: function() {
    return Storage.get(KEYS.STUDY_STATS, {
      totalAnswered: 0,
      totalCorrect: 0,
      sessionsCount: 0,
      notesGenerated: 0
    });
  },
  recordAnswer: function(correct) {
    var stats = this.get();
    stats.totalAnswered += 1;
    if (correct) stats.totalCorrect += 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },
  recordSession: function() {
    var stats = this.get();
    stats.sessionsCount += 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },
  recordNoteGenerated: function() {
    var stats = this.get();
    stats.notesGenerated = (stats.notesGenerated || 0) + 1;
    Storage.set(KEYS.STUDY_STATS, stats);
  },
  accuracy: function() {
    var stats = this.get();
    if (stats.totalAnswered === 0) return 0;
    return Math.round((stats.totalCorrect / stats.totalAnswered) * 100);
  }
};

/* ── Date Helpers ── */
const DateUtils = {
  today: function() {
    return new Date().toISOString().split('T')[0];
  },
  format: function(dateStr, opts) {
    opts = opts || {};
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  },
  daysUntil: function(dateStr) {
    if (!dateStr) return null;
    var target = new Date(dateStr);
    var now = new Date();
    var diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff;
  },
  addDays: function(dateStr, n) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }
};

/* ── UUID Generator ── */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0;
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
    .replace(/^(?!<[h|u|b|p|l])(.+)$/gm, function(m) { return m.trim() ? m : ''; })
    .replace(/\n/g, '<br>');
}

/* ── IndexedDB Helper ── */
const DB = {
  db: null,
  DB_NAME: 'MedHubDB',
  DB_VERSION: 1,
  STORE: 'notes_files',

  open: function() {
    var self = this;
    if (self.db) return Promise.resolve(self.db);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          var store = db.createObjectStore(self.STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('filename', 'filename', { unique: false });
          store.createIndex('uploadDate', 'uploadDate', { unique: false });
        }
      };
      req.onsuccess = function(e) { self.db = e.target.result; resolve(self.db); };
      req.onerror = function() { reject(req.error); };
    });
  },

  getAllFiles: function() {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE, 'readonly');
        var req = tx.objectStore(self.STORE).getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  addFile: function(fileObj) {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE, 'readwrite');
        var req = tx.objectStore(self.STORE).add(fileObj);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  deleteFile: function(id) {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE, 'readwrite');
        var req = tx.objectStore(self.STORE).delete(id);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  clearAll: function() {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE, 'readwrite');
        var req = tx.objectStore(self.STORE).clear();
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  getAllNotesText: function() {
    var self = this;
    return this.getAllFiles().then(function(files) {
      return files.map(function(f) { return f.content; }).join('\n\n---\n\n');
    });
  }
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
  'neet', 'mbbs', 'usmle', 'clinical', 'case study'
];

function autoTagTopics(text) {
  var lower = text.toLowerCase();
  return MEDICAL_KEYWORDS.filter(function(kw) { return lower.indexOf(kw) !== -1; }).slice(0, 8);
}

/* ── App Initialization ── */
function initApp() {
  ThemeManager.init();
  buildNavigation();
  Toast.init();

  Storage.set(KEYS.LAST_PAGE, window.location.pathname.split('/').pop());

  document.addEventListener('click', function(e) {
    var menu = document.getElementById('more-menu');
    var moreBtn = document.getElementById('more-btn');
    if (menu && !menu.classList.contains('hidden') &&
        !menu.contains(e.target) && e.target !== moreBtn) {
      menu.classList.add('hidden');
    }
  });
}

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
