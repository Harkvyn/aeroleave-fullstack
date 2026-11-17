/* ============================================================================
   AEROLEAVE GLOBAL — AIRPORT CARDS & TERMINAL FIDS MODAL
   ============================================================================ */
import { Api } from '../api.js';
import { escapeHtml, formatMoney, getAirportLocalTime } from '../utils.js';
import { openModal, closeModal } from './modal.js';

export function renderAirportCard(airport, flights, currency) {
  const inbound = flights.filter((f) => f.destination === airport.code && f.seatsAvailable > 0);
  const outbound = flights.filter((f) => f.origin === airport.code && f.seatsAvailable > 0);
  const minPrice = inbound.length > 0 ? Math.min(...inbound.map((f) => f.price)) : null;
  const localTime = getAirportLocalTime(airport.timezone);

  return `
    <article class="airport-card" data-open-airport="${escapeHtml(airport.code)}">
      <div class="airport-photo-box">
        <img
          src="${escapeHtml(airport.imageUrl)}"
          alt="${escapeHtml(airport.name)}"
          loading="lazy"
          onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(airport.code)}', '${escapeHtml(airport.city)}')"
        >
        <div class="airport-photo-overlay">
          <div class="airport-photo-top">
            <span class="iata-pill">${escapeHtml(airport.code)} · ${escapeHtml(airport.icao)}</span>
            <span class="airport-clock-pill">${escapeHtml(localTime)} ${escapeHtml(airport.utcLabel)}</span>
          </div>
          <div>
            <div style="font-weight:700;font-size:1.05rem;">${escapeHtml(airport.city)}, ${escapeHtml(airport.country)}</div>
            <div style="font-size:0.76rem;opacity:0.86;">${escapeHtml(airport.region)} · ${airport.terminals.length} Terminal · ${airport.runways} Runway</div>
          </div>
        </div>
      </div>
      <div class="airport-card-body">
        <h3>${escapeHtml(airport.name)}</h3>
        <p style="margin:0;font-size:0.82rem;color:var(--ink-secondary);">${escapeHtml(airport.heroCaption)}</p>
        <div class="amenity-row">
          ${airport.facilities.slice(0, 3).map((fac) => `<span class="amenity-chip">${escapeHtml(fac)}</span>`).join('')}
        </div>
        <div class="airport-card-footer">
          <span style="color:var(--ink-muted);">${outbound.length} berangkat · ${inbound.length} tiba</span>
          <strong style="color:var(--accent-cobalt);">${minPrice ? 'Mulai ' + formatMoney(minPrice, currency) : 'Lihat Terminal →'}</strong>
        </div>
      </div>
    </article>
  `;
}

export async function openAirportModal(code, appState, currency, onBookFlight, onSearchToAirport) {
  let airport = (appState.airports || []).find((a) => a.code === code);
  let departures = (appState.flights || []).filter((f) => f.origin === code && f.seatsAvailable > 0);
  let arrivals = (appState.flights || []).filter((f) => f.destination === code && f.seatsAvailable > 0);

  try {
    const detail = await Api.getAirportDetail(code);
    if (detail && detail.airport) {
      airport = detail.airport;
      departures = detail.departures || departures;
      arrivals = detail.arrivals || arrivals;
    }
  } catch (_) {
    // Fallback to in-memory appState
  }

  if (!airport) return;
  const localTime = getAirportLocalTime(airport.timezone);

  openModal(`
    <div class="modal-head">
      <div>
        <span class="iata-pill">${escapeHtml(airport.code)} / ${escapeHtml(airport.icao)}</span>
        <strong id="modalTitle" style="margin-left:0.5rem;font-size:1.05rem;">${escapeHtml(airport.name)}</strong>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Tutup</button>
    </div>
    <div class="modal-body">
      <div class="airport-photo-box" style="height:230px;border-radius:var(--radius-md);margin-bottom:1.1rem;">
        <img
          src="${escapeHtml(airport.imageUrl)}"
          alt="${escapeHtml(airport.name)}"
          onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(airport.code)}', '${escapeHtml(airport.city)}')"
        >
        <div class="airport-photo-overlay">
          <div class="airport-photo-top">
            <span class="badge badge-intl">${escapeHtml(airport.region)}</span>
            <span class="airport-clock-pill">Waktu Lokal: ${escapeHtml(localTime)} (${escapeHtml(airport.utcLabel)})</span>
          </div>
          <div>
            <div style="font-size:1.35rem;font-weight:800;">${escapeHtml(airport.city)}, ${escapeHtml(airport.country)}</div>
            <div style="font-size:0.84rem;opacity:0.9;">${escapeHtml(airport.heroCaption)}</div>
          </div>
        </div>
      </div>

      <div class="grid-3 mb-2">
        <div class="panel" style="padding:0.85rem;">
          <div class="metric-label">Terminal (${airport.terminals.length})</div>
          <div style="font-size:0.85rem;margin-top:0.35rem;">${airport.terminals.map((t) => `<div>• ${escapeHtml(t)}</div>`).join('')}</div>
        </div>
        <div class="panel" style="padding:0.85rem;">
          <div class="metric-label">Lounges Eksekutif</div>
          <div style="font-size:0.85rem;margin-top:0.35rem;">${airport.lounges.map((l) => `<div>• ${escapeHtml(l)}</div>`).join('')}</div>
        </div>
        <div class="panel" style="padding:0.85rem;">
          <div class="metric-label">Fasilitas Utama</div>
          <div class="amenity-row" style="margin-top:0.35rem;">
            ${airport.facilities.map((fac) => `<span class="amenity-chip">${escapeHtml(fac)}</span>`).join('')}
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;flex-wrap:wrap;gap:0.5rem;">
        <h4 style="margin:0;color:var(--navy-900);">Papan Informasi Penerbangan (FIDS) — ${escapeHtml(airport.code)}</h4>
        <button type="button" class="btn btn-primary btn-sm" id="btnSearchDestFromAirport" data-code="${escapeHtml(airport.code)}">
          Cari Semua Tiket ke ${escapeHtml(airport.code)}
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tipe</th>
              <th>Penerbangan</th>
              <th>Rute</th>
              <th>Jam &amp; Terminal</th>
              <th class="num">Tarif</th>
              <th class="num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${[...departures.map((f) => ({ ...f, dir: 'BERANGKAT' })), ...arrivals.map((f) => ({ ...f, dir: 'TIBA' }))]
              .map(
                (f) => `
                <tr>
                  <td><span class="badge ${f.dir === 'BERANGKAT' ? 'badge-booked' : 'badge-confirmed'}">${f.dir}</span></td>
                  <td><strong>${escapeHtml(f.flightNumber)}</strong><br><span style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(f.airline)}</span></td>
                  <td>${escapeHtml(f.origin)} → ${escapeHtml(f.destination)}<br><span style="font-size:0.76rem;color:var(--ink-muted);">${escapeHtml(f.date)}</span></td>
                  <td class="mono">${escapeHtml(f.departureTime)}–${escapeHtml(f.arrivalTime)}<br><span style="font-size:0.74rem;color:var(--ink-muted);">${escapeHtml(f.terminalOrigin || '-')} · Gate ${escapeHtml(f.gate || '-')}</span></td>
                  <td class="num"><strong>${formatMoney(f.price, currency)}</strong></td>
                  <td class="num">
                    <button type="button" class="btn btn-primary btn-sm" data-modal-book-flight="${escapeHtml(f.flightId)}">Pilih</button>
                  </td>
                </tr>`
              )
              .join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Belum ada jadwal aktif.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `);

  const searchBtn = document.getElementById('btnSearchDestFromAirport');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      closeModal();
      onSearchToAirport(airport.code);
    });
  }
  document.querySelectorAll('[data-modal-book-flight]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const flight =
        departures.find((fl) => fl.flightId === btn.dataset.modalBookFlight) ||
        arrivals.find((fl) => fl.flightId === btn.dataset.modalBookFlight) ||
        appState.flights.find((fl) => fl.flightId === btn.dataset.modalBookFlight);
      closeModal();
      if (flight) onBookFlight(flight);
    });
  });
}
