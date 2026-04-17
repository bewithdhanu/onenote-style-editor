import { Canvas } from './Canvas.js';

/**
 * OneNoteEditor — the main public API class.
 *
 * @example
 * const editor = new OneNoteEditor('#my-container', { dark: false });
 * editor.on('block:created', data => console.log('Created:', data));
 * const state = editor.getState();
 * editor.loadState(state);
 * editor.destroy();
 */
export class OneNoteEditor {
  /**
   * @param {string|HTMLElement} target — CSS selector or DOM element
   * @param {object} [options]
   * @param {boolean} [options.dark=false] — Enable dark mode
   * @param {boolean} [options.showHint=true] — Show "double-click to type" hint on first load
   */
  constructor(target, options = {}) {
    const el = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!el) throw new Error(`[OneNoteEditor] Cannot find element: ${target}`);

    this._canvas = new Canvas(el, options);
  }

  /* ── Event Emitter proxy ── */

  on(event, listener) {
    this._canvas.on(event, listener);
    return this;
  }

  off(event, listener) {
    this._canvas.off(event, listener);
    return this;
  }

  /* ── Block management ── */

  /**
   * Programmatically add a text block.
   * @param {object} [options]
   * @param {number} [options.x=100]
   * @param {number} [options.y=100]
   * @param {string} [options.content='']
   * @param {number} [options.width=240]
   * @returns {TextBlock}
   */
  addBlock(options = {}) {
    return this._canvas.addBlock(options);
  }

  /**
   * Remove a block by id.
   * @param {string} id
   */
  removeBlock(id) {
    this._canvas.removeBlock(id);
    return this;
  }

  /**
   * Get all blocks on the canvas.
   */
  getBlocks() {
    return this._canvas.getBlocks();
  }

  /**
   * Get all currently multi-selected blocks.
   * @returns {TextBlock[]}
   */
  getSelectedBlocks() {
    return this._canvas._selectionManager.getSelectedBlocks();
  }

  /* ── State persistence ── */

  /**
   * Export the current canvas state as a plain JS object (JSON-serializable).
   * @returns {{ blocks: object[] }}
   */
  getState() {
    return this._canvas.getState();
  }

  /**
   * Load a previously exported state, replacing all current blocks.
   * @param {{ blocks: object[] }} state
   */
  loadState(state) {
    this._canvas.loadState(state);
    return this;
  }

  /* ── Appearance ── */

  /**
   * Switch between light and dark mode.
   * @param {boolean} dark
   */
  setDark(dark) {
    this._canvas.setDark(dark);
    return this;
  }

  /* ── History ── */

  /** Undo the last block-level operation. @returns {this} */
  undo() {
    this._canvas._undo();
    return this;
  }

  /** Redo the last undone operation. @returns {this} */
  redo() {
    this._canvas._redo();
    return this;
  }

  /** @returns {boolean} */
  get canUndo() { return this._canvas._history.canUndo; }

  /** @returns {boolean} */
  get canRedo() { return this._canvas._history.canRedo; }

  /* ── Lifecycle ── */

  /**
   * Destroy the editor and clean up all DOM and event listeners.
   */
  destroy() {
    this._canvas.destroy();
  }
}

export default OneNoteEditor;
