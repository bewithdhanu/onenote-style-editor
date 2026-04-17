/**
 * Shared utility functions for the OneNote editor library.
 */

/**
 * Generate a unique ID for each element.
 */
export function generateId() {
  return `one-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get the cursor position relative to a container element.
 * @param {MouseEvent} event
 * @param {HTMLElement} container
 * @returns {{ x: number, y: number }}
 */
export function getRelativePosition(event, container) {
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + container.scrollLeft,
    y: event.clientY - rect.top + container.scrollTop,
  };
}

/**
 * Throttle a function call.
 * @param {Function} fn
 * @param {number} ms
 */
export function throttle(fn, ms = 16) {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn(...args);
    }
  };
}

/**
 * Safely inject CSS into the document <head> (once, by id).
 * @param {string} css
 * @param {string} id
 */
export function injectStyles(css, id = 'onenote-editor-styles') {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Clamp a numeric value between min and max.
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if a node is inside a given container.
 */
export function isDescendant(parent, child) {
  let node = child;
  while (node) {
    if (node === parent) return true;
    node = node.parentNode;
  }
  return false;
}
