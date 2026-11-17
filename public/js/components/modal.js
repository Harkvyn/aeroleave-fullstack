/* ============================================================================
   AEROLEAVE GLOBAL — ACCESSIBLE MODAL & CONFIRMATION DIALOGS
   ============================================================================ */
import { escapeHtml } from '../utils.js';

let lastFocusedElement = null;

export function openModal(html) {
  const backdrop = document.getElementById('modalBackdrop');
  const container = document.getElementById('modalContainer');
  if (!backdrop || !container) return;

  if (backdrop.classList.contains('hidden')) {
    lastFocusedElement = document.activeElement;
  }
  container.innerHTML = html;
  backdrop.classList.remove('hidden');

  const focusTarget =
    container.querySelector('[data-autofocus], input, select, button:not([data-close-modal])') ||
    container;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    focusTarget.focus({ preventScroll: true });
  }
}

export function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const container = document.getElementById('modalContainer');
  if (!backdrop || !container) return;

  backdrop.classList.add('hidden');
  container.innerHTML = '';

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus({ preventScroll: true });
  }
  lastFocusedElement = null;
}

export function initModalAccessibility() {
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close-modal]')) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!backdrop || backdrop.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
}

export function openConfirmModal({
  title = 'Konfirmasi Tindakan',
  message,
  confirmLabel = 'Lanjutkan',
  confirmVariant = 'btn-danger',
  onConfirm
}) {
  openModal(`
    <div class="modal-head">
      <strong id="modalTitle">${escapeHtml(title)}</strong>
      <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Batal</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 1.25rem;color:var(--ink-secondary);line-height:1.55;">${escapeHtml(message)}</p>
      <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
        <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
        <button type="button" class="btn ${escapeHtml(confirmVariant)}" id="btnModalConfirmAction" data-autofocus>
          ${escapeHtml(confirmLabel)}
        </button>
      </div>
    </div>
  `);

  const btn = document.getElementById('btnModalConfirmAction');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      closeModal();
      if (onConfirm) await onConfirm();
    });
  }
}
