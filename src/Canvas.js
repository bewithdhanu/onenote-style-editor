import { TextBlock } from './TextBlock.js';
import { SelectionManager } from './SelectionManager.js';
import { Toolbar } from './Toolbar.js';
import { HistoryManager } from './HistoryManager.js';
import { EventEmitter } from './EventEmitter.js';
import { getRelativePosition, isDescendant, clamp } from './utils.js';
import './styles.css';

export class Canvas extends EventEmitter {
  constructor(containerEl, { dark = 'auto', showHint = true } = {}) {
    super();
    this.containerEl = containerEl;
    this.containerEl.classList.add('one-editor');
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    this.containerEl.style.height = '100vh';
    this.containerEl.style.overflow = 'hidden';

    // Resolve 'auto' to system preference
    if (dark === 'auto') {
      this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // Listen for system theme changes
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._onSystemThemeChange = e => this.setDark(e.matches);
      this._mediaQuery.addEventListener('change', this._onSystemThemeChange);
    } else {
      this.dark = !!dark;
    }

    this._blocks = new Map();
    this._selectionManager = new SelectionManager();

    // Unified Fixed Top Toolbar
    this._toolbar = new Toolbar({ containerEl: this.containerEl, canvas: this, dark: this.dark });

    // Rubber-band state
    this._rubberBanding = false;
    this._rbOrigin = { x: 0, y: 0 };
    this._rbEl = null;

    // Group-drag state
    this._groupDragging = false;

    // Clipboard (internal) for cut/copy
    this._clipboard = [];

    // Undo/redo history
    this._history = new HistoryManager({ maxHistory: 100 });
    this._contentChangeTimer = null; // debounce timer for typing snapshots

    this._hintShown = false;

    this._buildDOM();
    this._bindEvents();
    this._watchSelectionChange();

    this.containerEl.classList.toggle('one-editor--dark', this.dark);
    // Ensure host page styles don't leak into the editor background
    this.containerEl.style.backgroundColor = this.dark ? '#1e1e2e' : '#f5f5f0';
    if (showHint) this._showHint();
  }

  /* ── DOM setup ─────────────────────────────────────────────────────── */

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'one-canvas';
    if (this.dark) this.el.classList.add('one-canvas--dark');
    this.el.setAttribute('role', 'presentation');
    this.el.setAttribute('aria-label', 'OneNote-style canvas editor');
    this.containerEl.appendChild(this.el);
  }

  _showHint() {
    if (this._hintShown) return;
    this._hintShown = true;
    const hint = document.createElement('div');
    hint.className = 'one-canvas__hint';
    hint.textContent = '✦ Double-click to type · Drag to select multiple';
    this.el.appendChild(hint);
    setTimeout(() => hint.classList.add('one-canvas__hint--fade'), 3500);
    setTimeout(() => hint.remove(), 4200);
  }

  /* ── Event binding ─────────────────────────────────────────────────── */

  _bindEvents() {
    // Double-click on empty canvas → create block
    this.el.addEventListener('dblclick', e => {
      if (e.target !== this.el) return;
      this._historyPush();
      const pos = getRelativePosition(e, this.el);
      const block = this.addBlock({ x: pos.x - 100, y: pos.y - 16 });
      requestAnimationFrame(() => block.focus());
    });

    // Mousedown on canvas bg → start rubber-band OR clear selection
    this.el.addEventListener('mousedown', e => {
      if (e.target !== this.el) return;
      // Clear single-block active state
      this._selectionManager.clear();
      this._toolbar.syncState();
      // Don't start rubber-band if it's a right-click
      if (e.button !== 0) return;
      this._startRubberBand(e);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      const isEditing = document.activeElement?.classList.contains('one-block__content');
      const activeBlock = this._selectionManager.activeBlock;
      const selectedBlocks = this._selectionManager.getSelectedBlocks();
      const hasMultiSelect = selectedBlocks.length >= 1;

      // ── Escape: deselect everything (works always) ──────────────────
      if (e.key === 'Escape') {
        if (isEditing && activeBlock) {
          activeBlock._contentEl.blur();
        }
        if (activeBlock) { this._selectionManager.clear(); this._toolbar.syncState(); }
        this._clearMultiSelection();
        return;
      }

      // ── Shortcuts that work when NOT typing in a block ──────────────
      if (!isEditing) {
        // Ctrl/Cmd + A: select all blocks
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          this._selectionManager.setMultiSelection(this.getBlocks());
          this._toolbar.syncState();
          return;
        }

        // Ctrl/Cmd + C: copy selected or active block(s) to clipboard
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          const targets = hasMultiSelect ? selectedBlocks
            : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            this.emit('keyboard:copy', this._clipboard);
          }
          return;
        }

        // Ctrl/Cmd + X: cut selected or active block(s)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
          const targets = hasMultiSelect ? selectedBlocks
            : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            const ids = targets.map(b => b.id);
            this._clearMultiSelection();
            this._selectionManager.clear();
            this._toolbar.syncState();
            ids.forEach(id => this.removeBlock(id));
            this.emit('bulk:cut', this._clipboard);
          }
          return;
        }

        // Ctrl/Cmd + V: paste from clipboard
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (this._clipboard.length) {
            e.preventDefault();
            this._bulkPaste();
          }
          return;
        }

        // Ctrl/Cmd + D: duplicate selected or active block(s)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          const targets = hasMultiSelect ? selectedBlocks
            : activeBlock ? [activeBlock] : [];
          if (targets.length) {
            e.preventDefault();
            this._clipboardSave(targets);
            this._bulkPaste();
          }
          return;
        }

        // Delete / Backspace: delete selected or active block(s)
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (hasMultiSelect) {
            e.preventDefault();
            this._bulkDelete();
            return;
          }
          if (activeBlock) {
            e.preventDefault();
            const id = activeBlock.id;
            this._selectionManager.clear();
            this._toolbar.syncState();
            this.removeBlock(id);
            return;
          }
        }

        // Ctrl/Cmd + Z: undo
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this._undo();
          return;
        }

        // Ctrl/Cmd + Shift + Z  OR  Ctrl/Cmd + Y: redo
        if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
            ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) {
          e.preventDefault();
          this._redo();
          return;
        }
      }
    });
  }

  /* ── Rubber-band selection ─────────────────────────────────────────── */

  _startRubberBand(e) {
    this._rubberBanding = true;
    const pos = getRelativePosition(e, this.el);
    this._rbOrigin = pos;

    // Create selection rect element
    this._rbEl = document.createElement('div');
    this._rbEl.className = 'one-selection-rect';
    this._rbEl.style.left = `${pos.x}px`;
    this._rbEl.style.top = `${pos.y}px`;
    this._rbEl.style.width = '0';
    this._rbEl.style.height = '0';
    this.el.appendChild(this._rbEl);

    // Clear previous multi-selection
    this._selectionManager.clearMultiSelection();
    this._toolbar.syncState();

    const onMove = ev => {
      if (!this._rubberBanding) return;
      this._updateRubberBand(ev);
    };

    const onUp = ev => {
      if (!this._rubberBanding) return;
      this._finishRubberBand(ev);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _updateRubberBand(e) {
    if (!this._rbEl) return;
    const pos = getRelativePosition(e, this.el);
    const x = Math.min(pos.x, this._rbOrigin.x);
    const y = Math.min(pos.y, this._rbOrigin.y);
    const w = Math.abs(pos.x - this._rbOrigin.x);
    const h = Math.abs(pos.y - this._rbOrigin.y);

    this._rbEl.style.left = `${x}px`;
    this._rbEl.style.top = `${y}px`;
    this._rbEl.style.width = `${w}px`;
    this._rbEl.style.height = `${h}px`;

    // Live-preview — highlight blocks that will be selected
    const selRect = { x, y, width: w, height: h };
    const hits = this.getBlocks().filter(b => this._rectsIntersect(selRect, b));
    this._selectionManager.setMultiSelection(hits);
  }

  _finishRubberBand(e) {
    this._rubberBanding = false;
    if (this._rbEl) { this._rbEl.remove(); this._rbEl = null; }

    const selected = this._selectionManager.getSelectedBlocks();
    if (selected.length >= 1) {
      this._toolbar.syncState();
    } else {
      this._selectionManager.clearMultiSelection();
      this._toolbar.syncState();
    }
  }

  /** Check if a block's element intersects a rect {x, y, width, height} in canvas coords. */
  _rectsIntersect(selRect, block) {
    const bx = block.x, by = block.y,
          bw = block.el.offsetWidth, bh = block.el.offsetHeight;
    return !(
      selRect.x + selRect.width < bx ||
      selRect.x > bx + bw ||
      selRect.y + selRect.height < by ||
      selRect.y > by + bh
    );
  }

  /* ── Group drag ────────────────────────────────────────────────────── */

  /**
   * Start dragging all selected blocks together.
   * Called when a selected block's handle is mousedown'd.
   */
  _startGroupDrag(leadBlock, e) {
    e.preventDefault();
    this._historyPush(); // snapshot before positions change
    const selected = this._selectionManager.getSelectedBlocks();
    const canvasRect = this.el.getBoundingClientRect();

    // Record start position for each block and the lead block's offset
    const startPositions = selected.map(b => ({ block: b, startX: b.x, startY: b.y }));
    const leadRect = leadBlock.el.getBoundingClientRect();
    const offsetX = e.clientX - leadRect.left;
    const offsetY = e.clientY - leadRect.top;
    let prevClientX = e.clientX, prevClientY = e.clientY;

    this._groupDragging = true;
    selected.forEach(b => { b.el.style.zIndex = '100'; });

    const onMove = ev => {
      const dx = ev.clientX - prevClientX;
      const dy = ev.clientY - prevClientY;
      prevClientX = ev.clientX;
      prevClientY = ev.clientY;

      selected.forEach(b => {
        b.x = clamp(b.x + dx, 0, this.el.scrollWidth - b.el.offsetWidth);
        b.y = clamp(b.y + dy, 0, this.el.scrollHeight - b.el.offsetHeight);
        b.el.style.left = `${b.x}px`;
        b.el.style.top = `${b.y}px`;
      });

      // Reposition bulk toolbar while dragging
      this._toolbar.syncState();
    };

    const onUp = () => {
      this._groupDragging = false;
      selected.forEach(b => {
        b.el.style.zIndex = b._isSelected ? '15' : '10';
        this.emit('block:moved', b.toJSON());
      });
      this._toolbar.syncState();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ── Block event wiring ────────────────────────────────────────────── */

  _wireBlock(block) {
    block.on('focus', b => {
      // Focusing a block clears multi-selection
      this._clearMultiSelection();
      this._selectionManager.setActive(b);
      this._toolbar.syncState();
    });

    block.on('blur', () => { /* selectionchange drives toolbar */ });

    block.on('change', b => {
      // Debounce: push history snapshot after 800ms of no typing
      clearTimeout(this._contentChangeTimer);
      this._contentChangeTimer = setTimeout(() => {
        this._historyPush();
      }, 800);
      this.emit('content:changed', b.toJSON());
    });

    block.on('drag:start', () => this._historyPush());
    block.on('resize:start', () => this._historyPush());

    block.on('move', b => {
      this.emit('block:moved', b.toJSON());
    });

    block.on('delete', b => {
      this._historyPush();
      this.removeBlock(b.id);
    });

    block.on('duplicate', b => {
      this._historyPush();
      this.addBlock({ x: b.x + 24, y: b.y + 24, content: b._contentEl.innerHTML, width: b.width });
    });

    // Intercept block mousedown for Ctrl+click multi-select
    block.on('block:mousedown', (b, e) => {
      if (e.ctrlKey || e.metaKey) {
        // Toggle this block in multi-selection without focusing it
        e.preventDefault();
        this._selectionManager.clear();
        this._selectionManager.toggleInSelection(b);
        this._toolbar.syncState();
      } else {
        // Plain click — If clicking the block padding/wrapper directly (not text), select as object
        if (e.target === b.el) {
          e.preventDefault(); // prevent focusing the contenteditable
          this._selectionManager.clear();
          this._selectionManager.setMultiSelection([b]);
          this._toolbar.syncState();
        } else {
          // Clicked inside content to type — clear multi-selection if it wasn't already part of a multi-select
          if (!this._selectionManager.isSelected(b) && this._selectionManager.selectedCount > 0) {
            this._clearMultiSelection();
          }
        }
      }
    });

    // Intercept handle mousedown for group drag or solo object drag
    block.on('handle:mousedown', (b, e) => {
      if (this._selectionManager.isSelected(b) && this._selectionManager.selectedCount >= 2) {
        this._startGroupDrag(b, e);
      } else {
        // Solo drag: select as single object before dragging
        if (!this._selectionManager.isSelected(b)) {
          this._selectionManager.clear();
          this._selectionManager.setMultiSelection([b]);
          this._toolbar.syncState();
        }
        b.startDrag(e);
      }
    });
  }

  /* ── Multi-selection helpers ───────────────────────────────────────── */

  /**
   * Save current canvas state to history BEFORE a mutation.
   */
  _historyPush() {
    this._history.push(this.getState());
  }

  _clearMultiSelection() {
    this._selectionManager.clearMultiSelection();
    this._toolbar.syncState();
  }

  /* ── Bulk operations ───────────────────────────────────────────────── */

  /**
   * Save block snapshots to the internal clipboard (no DOM change).
   * @param {TextBlock[]} blocks
   */
  _clipboardSave(blocks) {
    this._clipboard = blocks.map(b => b.toJSON());
  }

  /**
   * Paste clipboard items as new blocks, offset by 32px.
   * The new blocks become the current multi-selection.
   */
  _bulkPaste(offset = 32) {
    if (!this._clipboard.length) return;
    this._historyPush();
    this._clearMultiSelection();
    this._selectionManager.clear();
    const newBlocks = this._clipboard.map(snap =>
      this.addBlock({ x: snap.x + offset, y: snap.y + offset, content: snap.content, width: snap.width })
    );
    this._selectionManager.setMultiSelection(newBlocks);
    this._toolbar.syncState();
    this.emit('bulk:paste', this._clipboard);
  }

  /** Toolbar Copy button: save + immediately paste (visible duplicate). */
  _bulkCopy() {
    const selected = this._selectionManager.getSelectedBlocks();
    this._clipboardSave(selected);
    this._bulkPaste(24);
    this.emit('bulk:copy', this._clipboard);
  }

  /** Toolbar Cut button: save to clipboard then delete originals. */
  _bulkCut() {
    const selected = this._selectionManager.getSelectedBlocks();
    this._clipboardSave(selected);
    this._historyPush();
    // Delete originals
    const ids = selected.map(b => b.id);
    this._clearMultiSelection();
    ids.forEach(id => this.removeBlock(id));
    this.emit('bulk:cut', this._clipboard);
  }

  _bulkDelete() {
    const selected = this._selectionManager.getSelectedBlocks();
    const ids = selected.map(b => b.id);
    this._historyPush();
    this._clearMultiSelection();
    ids.forEach(id => this.removeBlock(id));
    this.emit('bulk:delete', { count: ids.length });
  }

  _bulkAlign(direction) {
    const selected = this._selectionManager.getSelectedBlocks();
    if (selected.length < 2) return;

    if (direction === 'left') {
      const minX = Math.min(...selected.map(b => b.x));
      selected.forEach(b => { b.x = minX; b.el.style.left = `${minX}px`; });
    } else if (direction === 'center') {
      const avgX = selected.reduce((s, b) => s + b.x + b.el.offsetWidth / 2, 0) / selected.length;
      selected.forEach(b => { b.x = avgX - b.el.offsetWidth / 2; b.el.style.left = `${b.x}px`; });
    } else if (direction === 'top') {
      const minY = Math.min(...selected.map(b => b.y));
      selected.forEach(b => { b.y = minY; b.el.style.top = `${minY}px`; });
    } else if (direction === 'middle') {
      const avgY = selected.reduce((s, b) => s + b.y + b.el.offsetHeight / 2, 0) / selected.length;
      selected.forEach(b => { b.y = avgY - b.el.offsetHeight / 2; b.el.style.top = `${b.y}px`; });
    }

    this._toolbar.syncState();
    this.emit('bulk:align', { direction });
  }

  /* ── Block management (public API) ─────────────────────────────────── */

  addBlock({ x = 100, y = 100, content = '', width = 240, id, _silent = false } = {}) {
    const block = new TextBlock({ x, y, content, width, id, canvasEl: this.el });
    this._wireBlock(block);
    this._blocks.set(block.id, block);
    this.el.appendChild(block.el);
    this.emit('block:created', block.toJSON());
    return block;
  }

  removeBlock(id, _silent = false) {
    const block = this._blocks.get(id);
    if (!block) return;
    if (this._selectionManager.activeBlock === block) {
      this._selectionManager.clear();
      this._toolbar.syncState();
    }
    block.destroy();
    this._blocks.delete(id);
    this.emit('block:deleted', { id });
  }

  getBlocks() {
    return [...this._blocks.values()];
  }

  /* ── Selection change → toolbar sync ─────────────────────────────── */

  _watchSelectionChange() {
    document.addEventListener('selectionchange', () => {
      const active = this._selectionManager.activeBlock;
      if (!active) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed &&
          sel.anchorNode && isDescendant(active._contentEl, sel.anchorNode)) {
        this._toolbar.show(active.el);
        this._toolbar._syncState();
      }
    });

    this._selectionManager.onChange(block => {
      if (!block) {
        setTimeout(() => {
          if (!this._selectionManager.activeBlock) this._toolbar.syncState();
        }, 150);
      }
    });
  }

  /* ── State persistence ──────────────────────────────────────────────── */

  getState() {
    return { blocks: this.getBlocks().map(b => b.toJSON()) };
  }

  /**
   * Restore state (optionally suppress history push — used by undo/redo itself).
   * @param {object} state
   * @param {boolean} [silent=false]  if true, don't push to history
   */
  loadState(state, { silent = false } = {}) {
    if (!silent) this._historyPush();
    this._clearMultiSelection();
    this._selectionManager.clear();
    this._toolbar.syncState();
    [...this._blocks.keys()].forEach(id => this.removeBlock(id));
    if (state && Array.isArray(state.blocks)) {
      state.blocks.forEach(b => this.addBlock(b));
    }
  }

  /* ── Undo / Redo ────────────────────────────────────────────────────── */

  _undo() {
    const prev = this._history.undo(this.getState());
    if (!prev) { this.emit('history:no-undo'); return; }
    this.loadState(prev, { silent: true });
    this.emit('history:undo', { undoCount: this._history.undoCount, redoCount: this._history.redoCount });
  }

  _redo() {
    const next = this._history.redo(this.getState());
    if (!next) { this.emit('history:no-redo'); return; }
    this.loadState(next, { silent: true });
    this.emit('history:redo', { undoCount: this._history.undoCount, redoCount: this._history.redoCount });
  }

  /* ── Appearance ────────────────────────────────────────────────────── */

  setDark(dark) {
    this.dark = dark;
    this.el.classList.toggle('one-canvas--dark', dark);
    this.containerEl.classList.toggle('one-editor--dark', dark);
    this.containerEl.style.backgroundColor = dark ? '#1e1e2e' : '#f5f5f0';
    if (this._toolbar) this._toolbar.setDark(dark);
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  destroy() {
    clearTimeout(this._contentChangeTimer);
    [...this._blocks.keys()].forEach(id => this.removeBlock(id));
    if (this._toolbar) this._toolbar.destroy();
    this._selectionManager.destroy();
    this._history.clear();
    this.el.remove();
    this.removeAllListeners();
  }
}
