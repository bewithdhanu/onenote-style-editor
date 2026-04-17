/**
 * Lightweight pub/sub event emitter for the OneNote editor library.
 */
export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  /**
   * Register a listener for an event.
   * @param {string} event
   * @param {Function} listener
   */
  on(event, listener) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(listener);
    return this;
  }

  /**
   * Remove a specific listener, or all listeners for an event.
   * @param {string} event
   * @param {Function} [listener]
   */
  off(event, listener) {
    if (!this._listeners[event]) return this;
    if (listener) {
      this._listeners[event] = this._listeners[event].filter(l => l !== listener);
    } else {
      delete this._listeners[event];
    }
    return this;
  }

  /**
   * Register a one-time listener.
   * @param {string} event
   * @param {Function} listener
   */
  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Emit an event, calling all registered listeners.
   * @param {string} event
   * @param {...any} args
   */
  emit(event, ...args) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(listener => {
      try {
        listener(...args);
      } catch (e) {
        console.error(`[OneNoteEditor] Error in listener for "${event}":`, e);
      }
    });
    return this;
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners() {
    this._listeners = {};
    return this;
  }
}
