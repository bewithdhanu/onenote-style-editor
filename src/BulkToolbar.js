/**
 * Floating bulk-action toolbar that appears when 2+ blocks are multi-selected.
 * Actions: Copy, Cut, Delete, and alignment options.
 */
export class BulkToolbar {
  /**
   * @param {object} options
   * @param {boolean} [options.dark]
   * @param {Function} options.onCopy   - () => void
   * @param {Function} options.onCut    - () => void
   * @param {Function} options.onDelete - () => void
   * @param {Function} options.onAlign  - (direction: 'left'|'center'|'right'|'top'|'middle') => void
   */
  constructor({ dark = false, onCopy, onCut, onDelete, onAlign } = {}) {
    this.dark = dark;
    this._onCopy = onCopy || (() => {});
    this._onCut = onCut || (() => {});
    this._onDelete = onDelete || (() => {});
    this._onAlign = onAlign || (() => {});
    this._visible = false;
    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'one-bulk-toolbar one-bulk-toolbar--hidden';
    if (this.dark) this.el.classList.add('one-bulk-toolbar--dark');

    this.el.innerHTML = `
      <div class="one-bulk-toolbar__badge" id="one-bulk-count">0 selected</div>

      <div class="one-bulk-toolbar__sep"></div>

      <button class="one-bulk-toolbar__btn" id="one-bulk-copy" title="Copy blocks">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      </button>

      <button class="one-bulk-toolbar__btn" id="one-bulk-cut" title="Cut blocks">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="20" r="3"/><circle cx="18" cy="20" r="3"/><line x1="5.45" y1="17.1" x2="18.55" y2="3.01"/><line x1="18.55" y1="17.1" x2="12" y2="9.96"/>
          <polyline points="15 3 21 3 21 9"/>
        </svg>
        Cut
      </button>

      <button class="one-bulk-toolbar__btn one-bulk-toolbar__btn--danger" id="one-bulk-delete" title="Delete selected blocks">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
        Delete
      </button>

      <div class="one-bulk-toolbar__sep"></div>

      <span class="one-bulk-toolbar__label">Align:</span>

      <button class="one-bulk-toolbar__btn one-bulk-toolbar__btn--icon" id="one-bulk-align-left" title="Align left edges" data-align="left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="14" height="3" rx="1"/><rect x="2" y="10" width="10" height="3" rx="1"/><rect x="2" y="17" width="12" height="3" rx="1"/></svg>
      </button>
      <button class="one-bulk-toolbar__btn one-bulk-toolbar__btn--icon" id="one-bulk-align-center" title="Align horizontal centers" data-align="center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="3" rx="1"/><rect x="7" y="10" width="10" height="3" rx="1"/><rect x="6" y="17" width="12" height="3" rx="1"/></svg>
      </button>
      <button class="one-bulk-toolbar__btn one-bulk-toolbar__btn--icon" id="one-bulk-align-top" title="Align top edges" data-align="top">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="2" width="3" height="14" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="17" y="2" width="3" height="12" rx="1"/></svg>
      </button>
      <button class="one-bulk-toolbar__btn one-bulk-toolbar__btn--icon" id="one-bulk-align-middle" title="Align vertical midpoints" data-align="middle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="3" height="14" rx="1"/><rect x="10" y="7" width="3" height="10" rx="1"/><rect x="17" y="6" width="3" height="12" rx="1"/></svg>
      </button>
    `;

    document.body.appendChild(this.el);

    this._countEl = this.el.querySelector('#one-bulk-count');
  }

  _bindEvents() {
    this.el.querySelector('#one-bulk-copy').addEventListener('mousedown', e => {
      e.preventDefault();
      this._onCopy();
    });

    this.el.querySelector('#one-bulk-cut').addEventListener('mousedown', e => {
      e.preventDefault();
      this._onCut();
    });

    this.el.querySelector('#one-bulk-delete').addEventListener('mousedown', e => {
      e.preventDefault();
      this._onDelete();
    });

    this.el.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        this._onAlign(btn.dataset.align);
      });
    });
  }

  /**
   * Show the toolbar centered above the bounding box of all selected block elements.
   * @param {HTMLElement[]} blockEls
   * @param {number} count
   */
  show(blockEls, count) {
    if (!blockEls.length) { this.hide(); return; }

    this._countEl.textContent = `${count} selected`;
    this._visible = true;
    this.el.classList.remove('one-bulk-toolbar--hidden');

    // Compute bounding box around all selected blocks
    let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity;
    blockEls.forEach(el => {
      const r = el.getBoundingClientRect();
      minLeft = Math.min(minLeft, r.left);
      minTop = Math.min(minTop, r.top);
      maxRight = Math.max(maxRight, r.right);
    });

    const tbRect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = minLeft + (maxRight - minLeft) / 2 - tbRect.width / 2;
    let top = minTop - tbRect.height - 14;

    if (top < 8) top = minTop + 8;
    left = Math.max(8, Math.min(left, vw - tbRect.width - 8));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /** Reposition based on current block positions (call after group drag). */
  reposition(blockEls, count) {
    if (this._visible) this.show(blockEls, count);
  }

  hide() {
    this._visible = false;
    this.el.classList.add('one-bulk-toolbar--hidden');
  }

  setDark(dark) {
    this.dark = dark;
    this.el.classList.toggle('one-bulk-toolbar--dark', dark);
  }

  destroy() {
    this.el.remove();
  }
}
