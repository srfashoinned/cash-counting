/**
 * CASH COUNTER LEDGER - script.js
 * Modular Vanilla JS | localStorage persistence | No dependencies
 * ================================================================
 */

'use strict';

/* ================================================================
   CONFIG & STATE
   ================================================================ */

/** All supported denominations (₹) */
const DENOMINATIONS = [10, 20, 50, 100, 200, 500];

/** Application state (in-memory, synced to localStorage) */
const state = {
  entries: [],        // All ledger entries
  runningTotal: 0,    // Persistent running total
  lastUndo: null,     // Last deleted entry for undo
  currentQty: {},     // Current denomination quantities being entered
};

/* ================================================================
   LOCAL STORAGE HELPERS
   ================================================================ */

const Storage = {
  KEY_ENTRIES:  'ccl_entries',
  KEY_RUNNING:  'ccl_running_total',

  /** Load all data from localStorage into state */
  load() {
    try {
      const rawEntries = localStorage.getItem(this.KEY_ENTRIES);
      state.entries = rawEntries ? JSON.parse(rawEntries) : [];
      const rawTotal = localStorage.getItem(this.KEY_RUNNING);
      state.runningTotal = rawTotal ? parseFloat(rawTotal) : 0;
    } catch (e) {
      console.error('Storage load error:', e);
      state.entries = [];
      state.runningTotal = 0;
    }
  },

  /** Save entries to localStorage */
  saveEntries() {
    try {
      localStorage.setItem(this.KEY_ENTRIES, JSON.stringify(state.entries));
    } catch (e) {
      Toast.show('Storage full! Old entries may not save.', 'error');
    }
  },

  /** Save running total to localStorage */
  saveRunning() {
    localStorage.setItem(this.KEY_RUNNING, state.runningTotal.toString());
  },

  /** Clear everything */
  clearAll() {
    localStorage.removeItem(this.KEY_ENTRIES);
    localStorage.removeItem(this.KEY_RUNNING);
  },
};

/* ================================================================
   UTILITIES
   ================================================================ */

/** Format number as Indian Rupee string */
function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Get today's date string YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/** Format a full timestamp nicely */
function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/** Format time only */
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Format date only */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Generate a simple unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Sum all qty × denomination */
function calcEntryTotal(breakdown) {
  return DENOMINATIONS.reduce((sum, d) => sum + (breakdown[d] || 0) * d, 0);
}

/** Sum note count */
function calcNoteCount(breakdown) {
  return DENOMINATIONS.reduce((sum, d) => sum + (breakdown[d] || 0), 0);
}

/* ================================================================
   TOAST NOTIFICATION
   ================================================================ */

const Toast = {
  container: null,

  init() { this.container = document.getElementById('toast-container'); },

  show(message, type = 'info', duration = 3000) {
    const icons = {
      success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    this.container.appendChild(el);

    // Vibrate on mobile (if supported)
    if (type === 'success' && 'vibrate' in navigator) navigator.vibrate(50);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = '0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
};

/* ================================================================
   CONFIRM MODAL
   ================================================================ */

const Modal = {
  overlay: null, titleEl: null, messageEl: null,
  confirmBtn: null, cancelBtn: null, _resolve: null,

  init() {
    this.overlay    = document.getElementById('confirm-modal');
    this.titleEl    = document.getElementById('modal-title');
    this.messageEl  = document.getElementById('modal-message');
    this.confirmBtn = document.getElementById('modal-confirm');
    this.cancelBtn  = document.getElementById('modal-cancel');
    this.confirmBtn.addEventListener('click', () => this._close(true));
    this.cancelBtn.addEventListener('click',  () => this._close(false));
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this._close(false); });
  },

  confirm(title, message) {
    this.titleEl.textContent   = title;
    this.messageEl.textContent = message;
    this.overlay.classList.remove('hidden');
    return new Promise(resolve => { this._resolve = resolve; });
  },

  _close(result) {
    this.overlay.classList.add('hidden');
    if (this._resolve) { this._resolve(result); this._resolve = null; }
  },
};

/* ================================================================
   SOUND FEEDBACK (Web Audio API)
   ================================================================ */

const Sound = {
  ctx: null,

  _init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { /* not supported */ }
    }
  },

  play(type = 'save') {
    this._init();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g);
    g.connect(this.ctx.destination);
    if (type === 'save') {
      o.frequency.setValueAtTime(880, this.ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.15, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      o.start(); o.stop(this.ctx.currentTime + 0.2);
    } else if (type === 'delete') {
      o.frequency.setValueAtTime(300, this.ctx.currentTime);
      g.gain.setValueAtTime(0.1, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      o.start(); o.stop(this.ctx.currentTime + 0.15);
    }
  },
};

/* ================================================================
   NAVIGATION
   ================================================================ */

const Nav = {
  currentPage: 'dashboard',

  init() {
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => this.goto(btn.dataset.page));
    });
  },

  goto(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    // Highlight nav
    document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add('active'));
    this.currentPage = page;
    // Close mobile sidebar
    Sidebar.close();
    // Page-specific refresh
    if (page === 'dashboard') Dashboard.refresh();
    if (page === 'history')   History.render();
    if (page === 'reports')   Reports.render();
  },
};

/* ================================================================
   SIDEBAR (mobile)
   ================================================================ */

const Sidebar = {
  sidebar: null, overlay: null, isOpen: false,

  init() {
    this.sidebar = document.getElementById('sidebar');
    this.overlay = document.getElementById('sidebar-overlay');
    document.getElementById('menu-toggle').addEventListener('click', () => this.toggle());
    this.overlay.addEventListener('click', () => this.close());
  },

  toggle() { this.isOpen ? this.close() : this.open(); },

  open() {
    this.sidebar.classList.add('open');
    this.overlay.classList.remove('hidden');
    this.isOpen = true;
  },

  close() {
    this.sidebar.classList.remove('open');
    this.overlay.classList.add('hidden');
    this.isOpen = false;
  },
};

/* ================================================================
   THEME TOGGLE
   ================================================================ */

const Theme = {
  isDark: true,

  init() {
    const saved = localStorage.getItem('ccl_theme');
    this.isDark = saved !== 'light';
    this.apply();
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggle());
    document.getElementById('mobile-theme-toggle').addEventListener('click', () => this.toggle());
  },

  toggle() { this.isDark = !this.isDark; this.apply(); localStorage.setItem('ccl_theme', this.isDark ? 'dark' : 'light'); },

  apply() {
    document.documentElement.setAttribute('data-theme', this.isDark ? 'dark' : 'light');
    document.getElementById('theme-label').textContent = this.isDark ? 'Light Mode' : 'Dark Mode';
    document.getElementById('theme-icon-sun').classList.toggle('hidden', this.isDark);
    document.getElementById('theme-icon-moon').classList.toggle('hidden', !this.isDark);
  },
};

/* ================================================================
   DENOMINATION ENTRY
   ================================================================ */

const Entry = {
  autoSaveTimer: null,

  init() {
    this.buildGrid();
    this.bindButtons();
    this.bindKeyboard();
    this.renderTotals();
  },

  /** Build denomination input cards */
  buildGrid() {
    const grid = document.getElementById('denom-grid');
    grid.innerHTML = '';
    DENOMINATIONS.forEach(d => {
      state.currentQty[d] = 0;
      const card = document.createElement('div');
      card.className = 'denom-card';
      card.innerHTML = `
        <div class="denom-badge">₹${d}</div>
        <div class="denom-note-label">Quantity of Notes</div>
        <input
          type="number" min="0" step="1"
          class="denom-input" id="qty-${d}"
          data-denom="${d}"
          placeholder="0"
          autocomplete="off"
          inputmode="numeric"
          aria-label="Quantity of ₹${d} notes"
        />
        <div class="denom-subtotal-label">Subtotal</div>
        <div class="denom-subtotal" id="sub-${d}">₹0</div>
      `;
      grid.appendChild(card);
      const input = card.querySelector(`#qty-${d}`);
      input.addEventListener('input', () => this.onQtyChange(d, input));
      // Tab through denominations
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const idx = DENOMINATIONS.indexOf(d);
          const next = DENOMINATIONS[idx + 1];
          if (next) document.getElementById(`qty-${next}`)?.focus();
          else document.getElementById('btn-add')?.focus();
        }
      });
    });
  },

  /** Handle quantity input change */
  onQtyChange(denom, input) {
    const val = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = val || '';
    state.currentQty[denom] = val;
    document.getElementById(`sub-${denom}`).textContent = formatINR(val * denom);
    this.renderTotals();
    // Auto-save draft to sessionStorage
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.saveDraft(), 600);
  },

  /** Render live totals */
  renderTotals() {
    const total = calcEntryTotal(state.currentQty);
    const notes = calcNoteCount(state.currentQty);
    document.getElementById('current-total').textContent  = formatINR(total);
    document.getElementById('total-notes').textContent    = notes.toLocaleString('en-IN');
    document.getElementById('running-total').textContent  = formatINR(state.runningTotal);
  },

  /** Bind action buttons */
  bindButtons() {
    document.getElementById('btn-add').addEventListener('click',         () => this.addEntry());
    document.getElementById('btn-reset-entry').addEventListener('click', () => this.resetEntry());
    document.getElementById('btn-undo').addEventListener('click',        () => this.undoLast());
    document.getElementById('btn-reset-all').addEventListener('click',   () => this.resetAll());
  },

  /** Ctrl+Enter to add */
  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this.addEntry();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z')      this.undoLast();
    });
  },

  /** Add current entry to ledger */
  async addEntry() {
    const total = calcEntryTotal(state.currentQty);
    if (total === 0) { Toast.show('Enter at least one denomination quantity.', 'error'); return; }

    const note = document.getElementById('entry-note').value.trim() || 'Cash Entry';
    const breakdown = { ...state.currentQty };
    const entry = {
      id:        uid(),
      timestamp: new Date().toISOString(),
      note,
      breakdown,
      total,
    };

    state.entries.unshift(entry);
    state.runningTotal += total;
    Storage.saveEntries();
    Storage.saveRunning();
    Sound.play('save');
    Toast.show(`${formatINR(total)} added to ledger!`, 'success');
    this.resetEntry(false);
    Dashboard.refresh();
  },

  /** Reset current input fields */
  resetEntry(showToast = true) {
    DENOMINATIONS.forEach(d => {
      state.currentQty[d] = 0;
      const input = document.getElementById(`qty-${d}`);
      if (input) input.value = '';
      const sub = document.getElementById(`sub-${d}`);
      if (sub) sub.textContent = '₹0';
    });
    document.getElementById('entry-note').value = '';
    this.renderTotals();
    sessionStorage.removeItem('ccl_draft');
    if (showToast) Toast.show('Entry cleared.', 'info');
  },

  /** Undo last added entry */
  async undoLast() {
    if (state.entries.length === 0) { Toast.show('Nothing to undo.', 'error'); return; }
    const last = state.entries[0];
    const ok = await Modal.confirm('Undo Last Entry', `Remove entry "${last.note}" (${formatINR(last.total)})?`);
    if (!ok) return;
    state.lastUndo = state.entries.shift();
    state.runningTotal = Math.max(0, state.runningTotal - last.total);
    Storage.saveEntries();
    Storage.saveRunning();
    this.renderTotals();
    Dashboard.refresh();
    Toast.show('Last entry removed.', 'info');
    Sound.play('delete');
  },

  /** Reset all data */
  async resetAll() {
    const ok = await Modal.confirm('Reset All Data', 'This will permanently delete ALL entries and reset the running total. This cannot be undone.');
    if (!ok) return;
    state.entries = [];
    state.runningTotal = 0;
    Storage.clearAll();
    this.resetEntry(false);
    Dashboard.refresh();
    Toast.show('All data cleared.', 'info');
    Sound.play('delete');
  },

  /** Save draft to sessionStorage for auto-restore */
  saveDraft() {
    sessionStorage.setItem('ccl_draft', JSON.stringify(state.currentQty));
  },

  /** Restore draft from sessionStorage */
  restoreDraft() {
    try {
      const draft = sessionStorage.getItem('ccl_draft');
      if (!draft) return;
      const d = JSON.parse(draft);
      DENOMINATIONS.forEach(denom => {
        const val = d[denom] || 0;
        if (val > 0) {
          state.currentQty[denom] = val;
          const input = document.getElementById(`qty-${denom}`);
          if (input) input.value = val;
          const sub = document.getElementById(`sub-${denom}`);
          if (sub) sub.textContent = formatINR(val * denom);
        }
      });
      this.renderTotals();
    } catch (e) { /* ignore */ }
  },
};

/* ================================================================
   DASHBOARD
   ================================================================ */

const Dashboard = {
  refresh() {
    // Date
    document.getElementById('dashboard-date').textContent =
      new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // KPI: Total Cash
    document.getElementById('kpi-total').textContent = formatINR(state.runningTotal);

    // KPI: Today's total
    const today = todayStr();
    const todayTotal = state.entries
      .filter(e => e.timestamp.startsWith(today))
      .reduce((s, e) => s + e.total, 0);
    document.getElementById('kpi-today').textContent = formatINR(todayTotal);

    // KPI: Total entries
    document.getElementById('kpi-entries').textContent = state.entries.length.toLocaleString('en-IN');

    // KPI: Last entry time
    const last = state.entries[0];
    document.getElementById('kpi-last').textContent = last ? formatTime(last.timestamp) : '—';

    // Recent entries (latest 5)
    const container = document.getElementById('recent-entries');
    const recent = state.entries.slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>No entries yet. Start by adding cash!</p></div>`;
      return;
    }
    container.innerHTML = recent.map(e => `
      <div class="recent-item">
        <div class="recent-meta">
          <div class="recent-note">${escHtml(e.note)}</div>
          <div class="recent-time">${formatDateTime(e.timestamp)}</div>
        </div>
        <div class="recent-amount">${formatINR(e.total)}</div>
      </div>
    `).join('');
  },
};

/* ================================================================
   HISTORY
   ================================================================ */

const History = {
  filtered: [],

  render() {
    const search = document.getElementById('history-search').value.trim().toLowerCase();
    const dateFilter = document.getElementById('history-date-filter').value;

    this.filtered = state.entries.filter(e => {
      const matchSearch = !search
        || e.note.toLowerCase().includes(search)
        || formatINR(e.total).includes(search)
        || formatDate(e.timestamp).toLowerCase().includes(search);
      const matchDate = !dateFilter || e.timestamp.startsWith(dateFilter);
      return matchSearch && matchDate;
    });

    const container = document.getElementById('history-list');
    const summary   = document.getElementById('history-summary');
    const footer    = document.getElementById('history-footer');

    if (state.entries.length === 0) {
      container.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M3 12a9 9 0 109-9"/><path d="M3 3v6h6"/><path d="M12 7v5l3 3"/></svg><p>No history yet. Add your first cash entry!</p></div>`;
      summary.style.display = 'none';
      footer.style.display = 'none';
      return;
    }

    footer.style.display = 'block';
    summary.style.display = 'flex';
    const filteredTotal = this.filtered.reduce((s, e) => s + e.total, 0);
    document.getElementById('history-count').textContent = `${this.filtered.length} of ${state.entries.length} entries`;
    document.getElementById('history-filtered-total').textContent =
      this.filtered.length ? `Total: ${formatINR(filteredTotal)}` : '';

    if (this.filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>No entries match your filter.</p></div>`;
      return;
    }

    container.innerHTML = this.filtered.map(e => {
      const chips = DENOMINATIONS
        .filter(d => e.breakdown[d] > 0)
        .map(d => `<span class="denom-chip">₹${d} × ${e.breakdown[d]} = ${formatINR(e.breakdown[d] * d)}</span>`)
        .join('');
      return `
        <div class="history-item" data-id="${e.id}">
          <div class="history-item-header">
            <div class="history-item-left">
              <div class="history-item-note">${escHtml(e.note)}</div>
              <div class="history-item-time">${formatDateTime(e.timestamp)}</div>
            </div>
            <div class="history-item-amount">${formatINR(e.total)}</div>
          </div>
          <div class="history-denom-breakdown">${chips}</div>
          <button class="history-delete-btn" data-id="${e.id}" title="Delete entry" aria-label="Delete entry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>`;
    }).join('');

    // Bind delete buttons
    container.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.deleteEntry(btn.dataset.id);
      });
    });
  },

  async deleteEntry(id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    const ok = await Modal.confirm('Delete Entry', `Delete "${entry.note}" (${formatINR(entry.total)})?`);
    if (!ok) return;
    state.entries = state.entries.filter(e => e.id !== id);
    state.runningTotal = Math.max(0, state.runningTotal - entry.total);
    Storage.saveEntries();
    Storage.saveRunning();
    Entry.renderTotals();
    this.render();
    Dashboard.refresh();
    Sound.play('delete');
    Toast.show('Entry deleted.', 'info');
  },

  async deleteAll() {
    if (state.entries.length === 0) return;
    const ok = await Modal.confirm('Delete All History', `Permanently delete all ${state.entries.length} entries? Running total will reset.`);
    if (!ok) return;
    state.entries = [];
    state.runningTotal = 0;
    Storage.clearAll();
    Entry.renderTotals();
    this.render();
    Dashboard.refresh();
    Sound.play('delete');
    Toast.show('All history deleted.', 'info');
  },

  initControls() {
    document.getElementById('history-search').addEventListener('input',     () => this.render());
    document.getElementById('history-date-filter').addEventListener('change', () => this.render());
    document.getElementById('btn-clear-filter').addEventListener('click',  () => {
      document.getElementById('history-search').value = '';
      document.getElementById('history-date-filter').value = '';
      this.render();
    });
    document.getElementById('btn-delete-all').addEventListener('click', () => this.deleteAll());
  },
};

/* ================================================================
   REPORTS
   ================================================================ */

const Reports = {
  render() {
    const from = document.getElementById('report-from').value;
    const to   = document.getElementById('report-to').value;

    let entries = state.entries;
    if (from) entries = entries.filter(e => e.timestamp >= from);
    if (to)   entries = entries.filter(e => e.timestamp <= to + 'T23:59:59');

    // Sort oldest first for report
    entries = [...entries].reverse();

    const grandTotal = entries.reduce((s, e) => s + e.total, 0);
    const totalNotes = entries.reduce((s, e) => s + calcNoteCount(e.breakdown), 0);

    // Denomination summary
    const denomTotals = {};
    DENOMINATIONS.forEach(d => { denomTotals[d] = 0; });
    entries.forEach(e => DENOMINATIONS.forEach(d => { denomTotals[d] += (e.breakdown[d] || 0); }));

    const rangeLabel = from || to
      ? `${from ? formatDate(from + 'T00:00:00') : 'Beginning'} — ${to ? formatDate(to + 'T00:00:00') : 'Today'}`
      : 'All Time';

    const preview = document.getElementById('report-preview');
    preview.innerHTML = `
      <div id="printable-report">
        <div class="report-title">Cash Counter Ledger — Report</div>
        <div class="report-subtitle">Period: ${rangeLabel} &nbsp;|&nbsp; Generated: ${formatDateTime(new Date().toISOString())} &nbsp;|&nbsp; ${entries.length} Entries</div>

        ${entries.length === 0 ? '<p style="color:var(--text-muted)">No entries for selected period.</p>' : `
        <table class="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date & Time</th>
              <th>Note</th>
              ${DENOMINATIONS.map(d => `<th>₹${d}</th>`).join('')}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((e, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${formatDateTime(e.timestamp)}</td>
                <td>${escHtml(e.note)}</td>
                ${DENOMINATIONS.map(d => `<td>${e.breakdown[d] || '—'}</td>`).join('')}
                <td><strong>${formatINR(e.total)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="report-summary">
          <div class="report-summary-row"><span>Total Entries</span><span>${entries.length}</span></div>
          <div class="report-summary-row"><span>Total Notes Counted</span><span>${totalNotes.toLocaleString('en-IN')}</span></div>
          ${DENOMINATIONS.filter(d => denomTotals[d] > 0).map(d => `
            <div class="report-summary-row">
              <span>₹${d} × ${denomTotals[d]} notes</span>
              <span>${formatINR(denomTotals[d] * d)}</span>
            </div>`).join('')}
          <div class="report-summary-row grand"><span>Grand Total</span><span>${formatINR(grandTotal)}</span></div>
        </div>
        `}
      </div>
    `;
  },

  initControls() {
    document.getElementById('report-from').addEventListener('change', () => this.render());
    document.getElementById('report-to').addEventListener('change',   () => this.render());
    document.getElementById('btn-print').addEventListener('click',    () => this.print());
    document.getElementById('btn-csv').addEventListener('click',      () => this.exportCSV());
  },

  print() {
    if (state.entries.length === 0) { Toast.show('No data to print.', 'error'); return; }
    window.print();
  },

  exportCSV() {
    if (state.entries.length === 0) { Toast.show('No data to export.', 'error'); return; }
    const from = document.getElementById('report-from').value;
    const to   = document.getElementById('report-to').value;
    let entries = [...state.entries].reverse();
    if (from) entries = entries.filter(e => e.timestamp >= from);
    if (to)   entries = entries.filter(e => e.timestamp <= to + 'T23:59:59');

    const headers = ['#', 'Date', 'Time', 'Note', ...DENOMINATIONS.map(d => `Rs${d}`), 'Total'];
    const rows = entries.map((e, i) => {
      const d = new Date(e.timestamp);
      return [
        i + 1,
        d.toLocaleDateString('en-IN'),
        d.toLocaleTimeString('en-IN'),
        `"${e.note.replace(/"/g, '""')}"`,
        ...DENOMINATIONS.map(d => e.breakdown[d] || 0),
        e.total,
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `cash-ledger-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('CSV exported successfully!', 'success');
  },
};

/* ================================================================
   UTILITY: Escape HTML
   ================================================================ */
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ================================================================
   PWA: SERVICE WORKER REGISTRATION
   ================================================================ */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

/* ================================================================
   APP INIT
   ================================================================ */
function init() {
  // Load data
  Storage.load();

  // Init modules
  Toast.init();
  Modal.init();
  Theme.init();
  Nav.init();
  Sidebar.init();
  Entry.init();
  Entry.restoreDraft();
  History.initControls();
  Reports.initControls();
  Reports.render();
  Dashboard.refresh();

  // Set default report date range (current month)
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('report-from').value = `${y}-${m}-01`;
  document.getElementById('report-to').value   = todayStr();
  Reports.render();

  // PWA
  registerSW();

  // Show app after splash
  setTimeout(() => {
    document.getElementById('app').classList.remove('hidden');
  }, 100);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
