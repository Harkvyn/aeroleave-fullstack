/* ============================================================================
   AEROLEAVE GLOBAL — STATUS-ACCURATE PRINTABLE BOARDING PASS MODAL
   ============================================================================ */
import { Api } from '../api.js';
import { escapeHtml, formatMoney, statusBadge, buildQrSvg, showToast } from '../utils.js';
import { openModal } from './modal.js';

function getBoardingStubStatus(booking) {
  const s = String(booking.status || '').toLowerCase();
  if (s === 'confirmed') {
    return { cls: 'badge-confirmed', label: 'SIAP BOARDING', canPrint: true };
  }
  if (s === 'waiting for the payment') {
    return { cls: 'badge-waiting', label: 'MENUNGGU PEMBAYARAN', canPrint: false };
  }
  if (s === 'booked') {
    return { cls: 'badge-booked', label: 'MENUNGGU OTORISASI', canPrint: false };
  }
  return { cls: 'badge-danger', label: 'DIBATALKAN', canPrint: false };
}

export async function openBoardingPassModal(bookingIdOrRef, currency) {
  try {
    const data = await Api.getBoardingPass(bookingIdOrRef);
    const b = data.booking;
    const oAir = data.originAirport;
    const dAir = data.destAirport;
    const qrSvg = buildQrSvg(data.qrPayload, 132);
    const stubState = getBoardingStubStatus(b);
    const paxList = Array.isArray(b.passengers) && b.passengers.length > 0
      ? b.passengers
      : [{ fullName: b.passengerName, seatNumber: b.seatNumber, identityNumber: b.identityNumber }];

    openModal(`
      <div class="modal-head no-print">
        <strong id="modalTitle">E-Tiket &amp; Boarding Pass — ${escapeHtml(b.bookingReference)}</strong>
        <div style="display:flex;gap:0.5rem;">
          ${
            stubState.canPrint
              ? '<button type="button" class="btn btn-primary btn-sm" id="btnPrintBp">Cetak / Simpan PDF</button>'
              : '<button type="button" class="btn btn-secondary btn-sm" disabled title="Konfirmasi pembayaran/otorisasi untuk mencetak boarding pass aktif">Belum Siap Cetak</button>'
          }
          <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Tutup</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="boarding-pass">
          <div class="bp-header">
            <div>
              <div style="font-family:var(--font-mono);font-size:0.75rem;opacity:0.82;">BOARDING PASS / E-TICKET</div>
              <div style="font-size:1.25rem;font-weight:800;">${escapeHtml(b.airline)} · ${escapeHtml(b.flightNumber)}</div>
            </div>
            <div style="text-align:right;">
              <div class="mono" style="font-size:1.05rem;font-weight:700;">PNR: ${escapeHtml(b.bookingReference)}</div>
              <div style="font-size:0.78rem;opacity:0.86;">${escapeHtml(b.eTicketNumber)}</div>
            </div>
          </div>
          <div class="bp-body">
            <div class="bp-main">
              <div class="bp-route-header">
                <div>
                  <div class="mono" style="font-size:2rem;font-weight:800;color:var(--navy-900);line-height:1;">${escapeHtml(b.origin)}</div>
                  <div style="font-size:0.82rem;color:var(--ink-secondary);">${escapeHtml(oAir ? oAir.city : b.origin)}</div>
                  <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${escapeHtml(b.terminalOrigin || (oAir ? oAir.primaryTerminal : 'Terminal 3'))}</div>
                </div>
                <div style="flex:1;text-align:center;">
                  <div class="mono" style="font-size:0.8rem;color:var(--accent-cobalt);font-weight:700;">${escapeHtml(b.departureTime)} → ${escapeHtml(b.arrivalTime)}</div>
                  <div class="arc-line"></div>
                  <div style="font-size:0.76rem;color:var(--ink-muted);">${escapeHtml(b.date)} · ${escapeHtml(b.cabinClass)}</div>
                </div>
                <div style="text-align:right;">
                  <div class="mono" style="font-size:2rem;font-weight:800;color:var(--navy-900);line-height:1;">${escapeHtml(b.destination)}</div>
                  <div style="font-size:0.82rem;color:var(--ink-secondary);">${escapeHtml(dAir ? dAir.city : b.destination)}</div>
                  <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${escapeHtml(dAir ? dAir.primaryTerminal : 'Arrival Terminal')}</div>
                </div>
              </div>

              <div class="grid-4" style="background:var(--bg-paper);padding:0.8rem;border-radius:var(--radius-sm);">
                <div><div class="metric-label">Penumpang</div><strong style="font-size:0.86rem;">${escapeHtml(b.passengerName)} (${paxList.length}x)</strong></div>
                <div><div class="metric-label">Kursi</div><strong class="mono" style="font-size:0.95rem;color:var(--accent-cobalt);">${escapeHtml(b.seatNumber)}</strong></div>
                <div><div class="metric-label">Gate</div><strong class="mono">${escapeHtml(b.gate || 'G12')}</strong></div>
                <div><div class="metric-label">Status</div><div>${statusBadge(b.status)}</div></div>
              </div>

              ${
                paxList.length > 1
                  ? `<div style="margin-top:0.7rem;font-size:0.8rem;color:var(--ink-secondary);">
                      <strong>Daftar Penumpang:</strong>
                      ${paxList.map((p, idx) => `<span>P${idx + 1}: ${escapeHtml(p.fullName)} (<span class="mono">${escapeHtml(p.seatNumber)}</span>)</span>`).join(' · ')}
                    </div>`
                  : ''
              }

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.9rem;font-size:0.8rem;color:var(--ink-secondary);flex-wrap:wrap;gap:0.5rem;">
                <span>
                  Paket: <strong>${escapeHtml(b.fareTier || 'Standard')}</strong>
                  · Otorisasi: <strong>${b.authorizedByTravelManager ? 'Disetujui' : 'Belum diotorisasi'}</strong>
                </span>
                <strong>${formatMoney(b.price, currency)}</strong>
              </div>
            </div>
            <div class="bp-stub">
              ${qrSvg}
              <div class="mono" style="font-size:0.72rem;color:var(--ink-muted);word-break:break-all;">${escapeHtml(b.eTicketNumber)}</div>
              <span class="badge ${stubState.cls}">${stubState.label}</span>
            </div>
          </div>
        </div>
      </div>
    `);

    const printBtn = document.getElementById('btnPrintBp');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  } catch (err) {
    showToast(err.message);
  }
}
