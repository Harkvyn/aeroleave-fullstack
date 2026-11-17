/* ============================================================================
   AEROLEAVE GLOBAL — VIEW 3: MY TRIPS, BOARDING PASSES & VISITOR INBOX
   ============================================================================ */
import { Api } from '../api.js';
import { escapeHtml, formatMoney, formatShortTimestamp, statusBadge, showToast } from '../utils.js';
import { getAppState, getAirport, ui } from '../state.js';
import { openConfirmModal } from '../components/modal.js';
import { openBoardingPassModal } from '../components/boardingPass.js';

export function renderTripsView() {
  const appState = getAppState();
  const user = appState.currentUser;

  if (!user) {
    return `
      <div class="container">
        <div class="panel" style="text-align:center;padding:2.5rem;">
          <h2 class="section-title">Masuk untuk Melihat Perjalanan Anda</h2>
          <p class="section-sub" style="margin:0.5rem auto 1.25rem;max-width:56ch;">
            Setiap aktor memiliki akses sesuai perannya: Pelanggan (Visitor), Frequent Traveller, dan Staff melihat reservasi terkait akunnya (termasuk tiket yang dibookingkan agen secara offline), sedangkan Manajer Travel melihat seluruh transaksi.
          </p>
          <button type="button" class="btn btn-primary" data-open-auth>Masuk / Pilih Aktor</button>
        </div>
      </div>
    `;
  }

  const t = ui.trips;
  let list = [...(appState.bookings || [])];
  if (t.statusFilter !== 'ALL') {
    list = list.filter((b) => b.status.toLowerCase() === t.statusFilter.toLowerCase());
  }
  if (t.searchQuery.trim()) {
    const q = t.searchQuery.trim().toLowerCase();
    list = list.filter(
      (b) =>
        b.bookingReference.toLowerCase().includes(q) ||
        b.passengerName.toLowerCase().includes(q) ||
        b.origin.toLowerCase().includes(q) ||
        b.destination.toLowerCase().includes(q)
    );
  }

  const counts = {
    ALL: appState.bookings.length,
    confirmed: appState.bookings.filter((b) => b.status === 'confirmed').length,
    booked: appState.bookings.filter((b) => b.status === 'booked').length,
    'waiting for the payment': appState.bookings.filter((b) => b.status === 'waiting for the payment').length,
    cancelled: appState.bookings.filter((b) => b.status === 'cancelled').length
  };

  const visitorInboxHtml =
    user.role === 'visitor'
      ? `<div class="panel mt-2">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Kotak Masuk E-Tiket Resmi (${(appState.emailNotifications || []).length})</h3>
              <p class="panel-desc">Email notifikasi yang dikirim oleh Corporate Travel Manager ke ${escapeHtml(user.email)}.</p>
            </div>
          </div>
          ${
            (appState.emailNotifications || []).length === 0
              ? '<div style="color:var(--ink-muted);font-size:0.88rem;">Belum ada email e-tiket yang diterima.</div>'
              : appState.emailNotifications
                  .map(
                    (em) => `
                  <div style="padding:0.85rem;border:1px solid var(--border-hairline);border-radius:var(--radius-sm);margin-bottom:0.6rem;background:var(--bg-paper);">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                      <strong>${escapeHtml(em.subject)}</strong>
                      ${statusBadge(em.deliveryStatus)}
                    </div>
                    <div class="mono" style="font-size:0.78rem;color:var(--ink-muted);margin-top:0.25rem;">
                      ${escapeHtml(em.eTicketNumber)} · Dikirim ${escapeHtml(formatShortTimestamp(em.sentAt))}
                    </div>
                    <div style="font-size:0.84rem;color:var(--ink-secondary);margin-top:0.35rem;">
                      Rute: <strong>${escapeHtml(em.eTicketPayload?.route || '-')}</strong> · Kursi: <span class="mono">${escapeHtml(em.eTicketPayload?.seatNumber || '-')}</span> · Tanggal: ${escapeHtml(em.eTicketPayload?.date || '-')}
                    </div>
                  </div>`
                  )
                  .join('')
          }
        </div>`
      : '';

  return `
    <div class="container">
      <div class="section-header" style="margin-top:0;">
        <div>
          <h1 class="section-title">${user.role === 'visitor' ? 'Portal Pengunjung &amp; E-Tiket Saya' : user.role === 'travel_manager' ? 'Seluruh Perjalanan &amp; Reservasi Korporat' : 'Perjalanan Saya &amp; E-Tiket'}</h1>
          <p class="section-sub">Menampilkan reservasi untuk <strong>${escapeHtml(user.fullName)}</strong> (${escapeHtml(user.roleLabel)}).</p>
        </div>
      </div>

      <div class="panel mb-2" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          ${Object.entries(counts)
            .map(
              ([st, cnt]) => `<button type="button" class="btn btn-sm ${t.statusFilter === st ? 'btn-primary' : 'btn-secondary'}" data-trip-status="${escapeHtml(st)}">${st === 'ALL' ? 'Semua' : escapeHtml(st)} (${cnt})</button>`
            )
            .join('')}
        </div>
        <input type="text" id="tripSearchInput" class="input" style="max-width:290px;" placeholder="Cari PNR (HLM-...) atau penumpang" value="${escapeHtml(t.searchQuery)}">
      </div>

      <div class="flight-card-list">
        ${
          list.length === 0
            ? '<div class="panel" style="text-align:center;color:var(--ink-muted);padding:2rem;">Belum ada pesanan yang sesuai filter.</div>'
            : list
                .map((b) => {
                  const oAir = getAirport(b.origin);
                  const dAir = getAirport(b.destination);
                  const canPay = b.status === 'waiting for the payment' || b.status === 'booked';
                  const canCancel = b.status !== 'cancelled';
                  const channelLabel =
                    b.travelPurpose === 'offline_desk' || b.bookedByRole === 'employee' || b.bookedByRole === 'travel_manager'
                      ? 'Loket Agen Offline'
                      : b.bookingType === 'frequent_traveller'
                      ? 'Club Member'
                      : 'Pemesanan Online';

                  return `
                    <article class="flight-card flight-card--trip">
                      <div>
                        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.35rem;">
                          <span class="iata-pill">${escapeHtml(b.bookingReference)}</span>
                          ${statusBadge(b.status)}
                        </div>
                        <div style="font-weight:700;color:var(--navy-900);">${escapeHtml(b.passengerName)} ${b.passengerCount > 1 ? `(${b.passengerCount} pax)` : ''}</div>
                        <div class="mono" style="font-size:0.76rem;color:var(--ink-muted);">${escapeHtml(b.eTicketNumber)}</div>
                        <div style="font-size:0.74rem;color:var(--ink-secondary);margin-top:0.2rem;">
                          ${channelLabel} · ${b.authorizedByTravelManager ? 'Otorisasi OK' : 'Belum Diotorisasi Manajer'}
                        </div>
                      </div>

                      <div style="display:flex;align-items:center;gap:1rem;">
                        ${
                          dAir
                            ? `<div class="airport-mini-thumb" style="width:76px;height:54px;cursor:pointer;" data-open-airport="${escapeHtml(dAir.code)}">
                                <img src="${escapeHtml(dAir.imageUrl)}" alt="${escapeHtml(dAir.city)}" onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(dAir.code)}', '${escapeHtml(dAir.city)}')">
                              </div>`
                            : ''
                        }
                        <div>
                          <div style="font-weight:700;">${escapeHtml(b.origin)} (${escapeHtml(oAir ? oAir.city : b.origin)}) → ${escapeHtml(b.destination)} (${escapeHtml(dAir ? dAir.city : b.destination)})</div>
                          <div style="font-size:0.84rem;color:var(--ink-secondary);">${escapeHtml(b.airline)} ${escapeHtml(b.flightNumber)} · ${escapeHtml(b.date)} · ${escapeHtml(b.departureTime)}–${escapeHtml(b.arrivalTime)}</div>
                          <div class="mono" style="font-size:0.76rem;color:var(--ink-muted);">Kursi ${escapeHtml(b.seatNumber)} · ${escapeHtml(b.cabinClass)} (${escapeHtml(b.fareTier || 'Standard')})</div>
                        </div>
                      </div>

                      <div class="trip-actions-col">
                        <strong style="font-size:1.1rem;color:var(--navy-900);">${formatMoney(b.price, ui.currency)}</strong>
                        <div class="trip-actions-row">
                          ${canPay ? `<button type="button" class="btn btn-primary btn-sm" data-pay-booking="${escapeHtml(b.bookingId)}">Bayar &amp; Konfirmasi</button>` : ''}
                          <button type="button" class="btn btn-secondary btn-sm" data-view-bp="${escapeHtml(b.bookingReference)}">Boarding Pass</button>
                          ${canCancel ? `<button type="button" class="btn btn-danger btn-sm" data-cancel-booking="${escapeHtml(b.bookingId)}" data-cancel-ref="${escapeHtml(b.bookingReference)}">Batalkan</button>` : ''}
                        </div>
                      </div>
                    </article>`;
                })
                .join('')
        }
      </div>

      ${visitorInboxHtml}
    </div>
  `;
}

export function bindTripsEvents({ renderApp, refreshState }) {
  document.querySelectorAll('[data-trip-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.trips.statusFilter = btn.dataset.tripStatus;
      renderApp();
    });
  });

  const tripSearch = document.getElementById('tripSearchInput');
  if (tripSearch) {
    tripSearch.addEventListener('input', () => {
      ui.trips.searchQuery = tripSearch.value;
      renderApp();
      const el = document.getElementById('tripSearchInput');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  document.querySelectorAll('[data-pay-booking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.payBooking(btn.dataset.payBooking, { currency: ui.currency });
        showToast('Pembayaran berhasil dikonfirmasi! E-Tiket aktif.');
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll('[data-cancel-booking]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bookingId = btn.dataset.cancelBooking;
      const ref = btn.dataset.cancelRef || bookingId;
      openConfirmModal({
        title: `Batalkan Reservasi ${ref}?`,
        message: `Kursi pada reservasi ${ref} akan dilepaskan kembali (dan poin miles member akan disesuaikan bila berlaku). Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: 'Ya, Batalkan Tiket',
        confirmVariant: 'btn-danger',
        onConfirm: async () => {
          try {
            await Api.cancelBooking(bookingId);
            showToast(`Reservasi ${ref} berhasil dibatalkan.`);
            await refreshState();
          } catch (err) {
            showToast(err.message);
          }
        }
      });
    });
  });

  document.querySelectorAll('[data-view-bp]').forEach((btn) => {
    btn.addEventListener('click', () => openBoardingPassModal(btn.dataset.viewBp, ui.currency));
  });
}
