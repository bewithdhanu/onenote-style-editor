/* demo.js — initialise the OneNote editor and wire up the demo UI */

(function () {
  'use strict';

  const EditorClass = window.OneNoteEditor?.OneNoteEditor || window.OneNoteEditor;

  // Detect system theme
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const editor = new EditorClass('#editor', {
    dark: 'auto',   // follows system theme
    showHint: true,
  });

  // ── Pre-load sample blocks ──────────────────────────────────────────────
  const samples = [
    {
      x: 80, y: 80, width: 320,
      content: '<h2 style="font-size:22px;font-weight:700;color:#0078d4;margin:0">Welcome to OneNote Editor!</h2>',
    },
    {
      x: 80, y: 145, width: 360,
      content: '<p style="margin:0;font-size:14px;line-height:1.6">This is a <strong>free-form canvas editor</strong>. ' +
        '<em>Double-click anywhere</em> on the canvas to create a new text block. ' +
        'You can <u>drag blocks</u> around and <mark>format your text</mark> using the toolbar.</p>',
    },
    {
      x: 80, y: 260, width: 260,
      content: '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8"><li>Click to <strong>position freely</strong></li>' +
        '<li>Select text &rarr; <strong>toolbar appears</strong></li>' +
        '<li>Drag the <strong>blue handle</strong> to move</li>' +
        '<li>Drag <strong>corner</strong> to resize</li></ul>',
    },
    {
      x: 420, y: 80, width: 280,
      content: '<h3 style="font-size:16px;font-weight:600;margin:0 0 6px;color:#6b21a8">Style anything!</h3>' +
        '<p style="margin:0;font-size:13px;line-height:1.6">Select any text and use the toolbar to change fonts, colors, alignment, and more.</p>',
    },
    {
      x: 420, y: 220, width: 280,
      content: '<p style="margin:0;font-size:13px">Try the <strong style="color:#e11d48">Export</strong> button to save your canvas state and restore it later with <strong style="color:#0078d4">Import</strong>.</p>',
    },
  ];

  samples.forEach(s => editor.addBlock(s));

  // ── Stats ───────────────────────────────────────────────────────────────
  const statBlocks = document.getElementById('stat-blocks');
  const statSelected = document.getElementById('stat-selected');

  function updateStats() {
    statBlocks.textContent = editor.getBlocks().length;
    statSelected.textContent = editor.getSelectedBlocks().length;
  }

  editor.on('block:created', updateStats);
  editor.on('block:deleted', updateStats);
  editor.on('bulk:copy', d => { updateStats(); toast(`Copied ${d.length} block(s)`); });
  editor.on('bulk:cut', d => { updateStats(); toast(`Cut ${d.length} block(s)`); });
  editor.on('bulk:delete', d => { updateStats(); toast(`Deleted ${d.count} block(s)`); });
  editor.on('bulk:paste', d => { updateStats(); toast(`Pasted ${d.length} block(s)`); });
  editor.on('bulk:align', d => toast(`Aligned ${d.direction}`));
  editor.on('keyboard:copy', d => toast(`Copied ${d.length} block(s) to clipboard`));

  // ── Undo / Redo ─────────────────────────────────────────────────────────
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');

  function syncHistoryButtons() {
    undoBtn.disabled = !editor.canUndo;
    redoBtn.disabled = !editor.canRedo;
  }

  undoBtn.addEventListener('click', () => { editor.undo(); syncHistoryButtons(); });
  redoBtn.addEventListener('click', () => { editor.redo(); syncHistoryButtons(); });

  editor.on('history:undo', d => { syncHistoryButtons(); toast(`Undo (${d.undoCount} left)`); });
  editor.on('history:redo', d => { syncHistoryButtons(); toast(`Redo (${d.redoCount} left)`); });
  editor.on('history:no-undo', () => toast('Nothing to undo'));
  editor.on('history:no-redo', () => toast('Nothing to redo'));
  editor.on('block:created', syncHistoryButtons);
  editor.on('block:deleted', syncHistoryButtons);

  // Update selected count on any canvas multi-selection change
  document.addEventListener('mouseup', () => setTimeout(updateStats, 50));
  updateStats();

  // ── Toast helper ────────────────────────────────────────────────────────
  function toast(msg) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ── Add Block button ────────────────────────────────────────────────────
  document.getElementById('add-block-btn').addEventListener('click', () => {
    const canvasEl = document.querySelector('.one-canvas');
    const rect = canvasEl.getBoundingClientRect();
    const x = 80 + Math.random() * (rect.width - 300);
    const y = 80 + Math.random() * (rect.height - 200);
    editor._canvas._historyPush();
    const block = editor.addBlock({ x, y, width: 240 });
    requestAnimationFrame(() => block.focus());
    syncHistoryButtons();
  });

  // ── Clear canvas ────────────────────────────────────────────────────────
  document.getElementById('clear-canvas-btn').addEventListener('click', () => {
    editor.loadState({ blocks: [] });
    toast('Canvas cleared');
    syncHistoryButtons();
  });

  // ── Load sample ─────────────────────────────────────────────────────────
  document.getElementById('load-sample-btn').addEventListener('click', () => {
    editor.loadState({ blocks: samples });
    toast('Sample loaded');
    syncHistoryButtons();
  });

  // ── Dark mode toggle ────────────────────────────────────────────────────
  let isDark = systemDark;
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');

  function syncThemeIcon() {
    sunIcon.style.display = isDark ? 'block' : 'none';
    moonIcon.style.display = isDark ? 'none' : 'block';
  }
  syncThemeIcon();

  document.getElementById('dark-toggle').addEventListener('click', () => {
    isDark = !isDark;
    editor.setDark(isDark);
    syncThemeIcon();
  });

  // ── JSON Modal ──────────────────────────────────────────────────────────
  const modal = document.getElementById('json-modal');
  const modalTitle = document.getElementById('modal-title');
  const jsonTextarea = document.getElementById('json-textarea');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  let modalMode = 'export';

  function openModal(mode) {
    modalMode = mode;
    if (mode === 'export') {
      modalTitle.textContent = 'Export JSON';
      jsonTextarea.value = JSON.stringify(editor.getState(), null, 2);
      jsonTextarea.readOnly = true;
      modalConfirmBtn.textContent = 'Copy to clipboard';
    } else {
      modalTitle.textContent = 'Import JSON';
      jsonTextarea.value = '';
      jsonTextarea.readOnly = false;
      jsonTextarea.placeholder = 'Paste your exported JSON here…';
      modalConfirmBtn.textContent = 'Apply JSON';
    }
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  document.getElementById('export-btn').addEventListener('click', () => openModal('export'));
  document.getElementById('import-btn').addEventListener('click', () => openModal('import'));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  modalConfirmBtn.addEventListener('click', () => {
    if (modalMode === 'export') {
      navigator.clipboard.writeText(jsonTextarea.value)
        .then(() => toast('Copied to clipboard!'))
        .catch(() => {
          jsonTextarea.select();
          document.execCommand('copy');
          toast('Copied to clipboard!');
        });
    } else {
      try {
        const state = JSON.parse(jsonTextarea.value);
        editor.loadState(state);
        closeModal();
        toast('State imported');
      } catch (e) {
        toast('Invalid JSON — please check your input.');
      }
    }
  });

})();
