/* ============================================================================
   AEROLEAVE GLOBAL — ACTOR SWITCHER & AUTHENTICATION MODAL
   ============================================================================ */
import { Api } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';
import { openModal, closeModal } from './modal.js';

const ROLE_ORDER = ['visitor', 'frequent_traveller', 'employee', 'hr_manager', 'travel_manager'];

export function openAuthModal(appState, onAuthenticated) {
  const currentUser = appState?.currentUser || null;
  const actors = appState?.demoActors || [];
  const roleDefs = appState?.roleDefinitions || {};

  const groupedHtml = ROLE_ORDER.map((roleKey) => {
    const def = roleDefs[roleKey] || { title: roleKey, badge: roleKey, summary: '', permissions: [] };
    const roleActors = actors.filter((a) => a.role === roleKey);
    if (roleActors.length === 0) return '';

    return `
      <div style="margin-bottom:1.1rem;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.45rem;">
          <div>
            <strong style="color:var(--navy-900);font-size:0.96rem;">${escapeHtml(def.title)}</strong>
            <span class="badge badge-booked" style="margin-left:0.35rem;">${escapeHtml(def.badge)}</span>
          </div>
          <span style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(def.summary)}</span>
        </div>
        <div class="actor-role-grid">
          ${roleActors
            .map((a) => {
              const isCurrent = currentUser && currentUser.userId === a.userId;
              return `
                <div class="actor-card ${isCurrent ? 'active' : ''}">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.4rem;">
                    <div>
                      <strong style="color:var(--navy-900);">${escapeHtml(a.fullName)}</strong>
                      <div style="font-size:0.76rem;color:var(--ink-secondary);">${escapeHtml(a.roleLabel)}</div>
                    </div>
                    ${isCurrent ? '<span class="badge badge-confirmed">Aktif</span>' : ''}
                  </div>
                  <div class="mono" style="font-size:0.74rem;color:var(--ink-muted);word-break:break-all;">${escapeHtml(a.email)}</div>
                  <button
                    type="button"
                    class="btn btn-sm ${isCurrent ? 'btn-secondary' : 'btn-primary'}"
                    style="margin-top:auto;"
                    data-demo-login="${escapeHtml(a.userId)}"
                    ${isCurrent ? 'disabled' : ''}
                  >
                    ${isCurrent ? 'Sedang Aktif' : 'Masuk sebagai Aktor Ini'}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }).join('');

  openModal(`
    <div class="modal-head">
      <div>
        <strong id="modalTitle" style="font-size:1.05rem;">Portal Aktor &amp; Hak Akses Sistem (RBAC)</strong>
        <div style="font-size:0.78rem;color:var(--ink-muted);">Pilih aktor skenario dunia nyata untuk mencoba hak akses &amp; alur persetujuan masing-masing peran.</div>
      </div>
      <div style="display:flex;gap:0.45rem;">
        ${currentUser ? '<button type="button" class="btn btn-danger btn-sm" id="btnAuthLogout">Keluar (Guest)</button>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Tutup</button>
      </div>
    </div>
    <div class="modal-body">
      ${groupedHtml}

      <div class="panel" style="background:var(--bg-paper);margin-top:0.75rem;">
        <div class="panel-head" style="margin-bottom:0.65rem;">
          <div>
            <h4 class="panel-title" style="font-size:0.95rem;">Login Manual Email &amp; Password</h4>
            <p class="panel-desc" style="font-size:0.78rem;">Kata sandi default seluruh akun demo: <code class="mono">aeroleave123</code></p>
          </div>
        </div>
        <form id="formManualLogin" style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-end;">
          <div class="field" style="flex:1.2;min-width:200px;">
            <label for="authEmailInput">Email Korporat / Member</label>
            <input type="email" id="authEmailInput" class="input" placeholder="dewi.lestari@ooalah.id" required>
          </div>
          <div class="field" style="flex:1;min-width:160px;">
            <label for="authPasswordInput">Password</label>
            <input type="password" id="authPasswordInput" class="input" value="aeroleave123" required>
          </div>
          <button type="submit" class="btn btn-navy">Masuk</button>
        </form>
      </div>
    </div>
  `);

  document.querySelectorAll('[data-demo-login]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Masuk...';
      try {
        const res = await Api.demoLogin(btn.dataset.demoLogin);
        closeModal();
        showToast(`Masuk sebagai ${res.user.fullName} (${res.user.roleBadge})`);
        if (onAuthenticated) await onAuthenticated(res.user);
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = 'Masuk sebagai Aktor Ini';
      }
    });
  });

  const logoutBtn = document.getElementById('btnAuthLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await Api.logout();
        closeModal();
        showToast('Keluar ke mode Tamu (Guest).');
        if (onAuthenticated) await onAuthenticated(null);
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  const form = document.getElementById('formManualLogin');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const email = document.getElementById('authEmailInput').value;
        const password = document.getElementById('authPasswordInput').value;
        const res = await Api.login(email, password);
        closeModal();
        showToast(`Selamat datang, ${res.user.fullName}`);
        if (onAuthenticated) await onAuthenticated(res.user);
      } catch (err) {
        showToast(err.message);
      }
    });
  }
}
