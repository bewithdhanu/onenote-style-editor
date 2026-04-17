/**
 * Stack-based undo/redo history manager.
 * Stores full JSON canvas snapshots.
 */
export class HistoryManager {
  /**
   * @param {object} [options]
   * @param {number} [options.maxHistory=100]
   */
  constructor({ maxHistory = 100 } = {}) {
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = maxHistory;
  }

  /**
   * Push a snapshot onto the undo stack (clears redo stack).
   * Call this BEFORE making a change.
   * @param {object} state  — plain JSON-serializable canvas state
   */
  push(state) {
    this._undoStack.push(JSON.stringify(state));
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }
    // Any new action invalidates the redo future
    this._redoStack = [];
  }

  /**
   * Undo: returns the previous state, or null if nothing to undo.
   * Saves current state to redo stack.
   * @param {object} currentState
   * @returns {object|null}
   */
  undo(currentState) {
    if (!this._undoStack.length) return null;
    this._redoStack.push(JSON.stringify(currentState));
    return JSON.parse(this._undoStack.pop());
  }

  /**
   * Redo: returns the next state, or null if nothing to redo.
   * Saves current state to undo stack.
   * @param {object} currentState
   * @returns {object|null}
   */
  redo(currentState) {
    if (!this._redoStack.length) return null;
    this._undoStack.push(JSON.stringify(currentState));
    return JSON.parse(this._redoStack.pop());
  }

  /** @returns {boolean} */
  get canUndo() {
    return this._undoStack.length > 0;
  }

  /** @returns {boolean} */
  get canRedo() {
    return this._redoStack.length > 0;
  }

  /** Number of entries on the undo stack. */
  get undoCount() {
    return this._undoStack.length;
  }

  /** Number of entries on the redo stack. */
  get redoCount() {
    return this._redoStack.length;
  }

  /** Clear all history. */
  clear() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
