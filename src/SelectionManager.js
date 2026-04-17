/**
 * Tracks the active TextBlock AND a multi-block selection set.
 */
export class SelectionManager {
  constructor() {
    this._activeBlock = null;
    this._selectedBlocks = new Set(); // multi-selection
    this._listeners = [];
    this._multiListeners = [];
  }

  /* ── Single-block active ────────────────────────────────────────────── */

  get activeBlock() {
    return this._activeBlock;
  }

  setActive(block) {
    if (this._activeBlock === block) return;
    if (this._activeBlock) this._activeBlock.setActive(false);
    this._activeBlock = block;
    if (block) block.setActive(true);
    this._notify(block);
  }

  clear() {
    this.setActive(null);
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  _notify(block) {
    for (const fn of this._listeners) {
      try { fn(block); } catch (_) { /* ignore */ }
    }
  }

  /* ── Multi-block selection ──────────────────────────────────────────── */

  /** Replace the entire multi-selection with a new set of blocks. */
  setMultiSelection(blocks) {
    // Deselect old
    this._selectedBlocks.forEach(b => b.setSelected(false));
    this._selectedBlocks.clear();

    // Select new
    blocks.forEach(b => {
      b.setSelected(true);
      this._selectedBlocks.add(b);
    });

    this._notifyMulti();
  }

  /** Toggle a single block in/out of the multi-selection (Ctrl+click). */
  toggleInSelection(block) {
    if (this._selectedBlocks.has(block)) {
      block.setSelected(false);
      this._selectedBlocks.delete(block);
    } else {
      block.setSelected(true);
      this._selectedBlocks.add(block);
    }
    this._notifyMulti();
  }

  /** Clear all multi-selected blocks. */
  clearMultiSelection() {
    this._selectedBlocks.forEach(b => b.setSelected(false));
    this._selectedBlocks.clear();
    this._notifyMulti();
  }

  /** @returns {TextBlock[]} */
  getSelectedBlocks() {
    return [...this._selectedBlocks];
  }

  /** @returns {number} */
  get selectedCount() {
    return this._selectedBlocks.size;
  }

  /** @param {TextBlock} block @returns {boolean} */
  isSelected(block) {
    return this._selectedBlocks.has(block);
  }

  onMultiChange(fn) {
    this._multiListeners.push(fn);
  }

  _notifyMulti() {
    const blocks = this.getSelectedBlocks();
    for (const fn of this._multiListeners) {
      try { fn(blocks); } catch (_) { /* ignore */ }
    }
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  destroy() {
    this.clearMultiSelection();
    this._listeners = [];
    this._multiListeners = [];
    this._activeBlock = null;
  }
}
