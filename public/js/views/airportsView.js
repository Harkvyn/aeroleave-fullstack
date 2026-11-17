/* ============================================================================
   AEROLEAVE GLOBAL — VIEW 2: AIRPORTS & WORLD ROUTE MAP
   ============================================================================ */
import { escapeHtml } from '../utils.js';
import { getAppState, ui } from '../state.js';
import { renderWorldRouteMap } from '../components/worldMap.js';
import { renderAirportCard } from '../components/airportModal.js';

export function renderAirportsView() {
  const appState = getAppState();
  const aState = ui.airports;
  const regions = ['ALL', 'Domestic', 'Southeast Asia', 'East Asia', 'Middle East', 'Europe', 'Oceania'];
  let list = [...(appState.airports || [])];

  if (aState.region !== 'ALL') {
    list = list.filter((a) => a.region === aState.region);
  }
  if (aState.query.trim()) {
    const q = aState.query.trim().toLowerCase();
    list = list.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    );
  }

  return `
    <div class="container">
      <div class="section-header" style="margin-top:0;">
        <div>
          <h1 class="section-title">Jaringan Bandara Internasional &amp; Terminal Guide</h1>
          <p class="section-sub">Eksplorasi peta rute lintas benua, arsitektur terminal, fasilitas lounge, zona waktu lokal, serta jadwal FIDS tiap hub.</p>
        </div>
      </div>

      ${renderWorldRouteMap(appState.airports || [], appState.flights, aState.selectedCode)}

      <div class="panel mt-2 mb-2" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          ${regions
            .map(
              (reg) => `<button type="button" class="btn btn-sm ${aState.region === reg ? 'btn-primary' : 'btn-secondary'}" data-air-region="${escapeHtml(reg)}">${reg === 'ALL' ? 'Semua Wilayah' : escapeHtml(reg)}</button>`
            )
            .join('')}
        </div>
        <input type="text" id="airSearchInput" class="input" style="max-width:280px;" placeholder="Cari kode IATA, kota, negara..." value="${escapeHtml(aState.query)}">
      </div>

      <div class="airport-grid">
        ${list.map((a) => renderAirportCard(a, appState.flights, ui.currency)).join('') || '<div class="panel">Tidak ada bandara yang cocok.</div>'}
      </div>
    </div>
  `;
}

export function bindAirportsEvents({ renderApp, onOpenAirport }) {
  document.querySelectorAll('[data-select-map-hub]').forEach((el) => {
    el.addEventListener('click', () => {
      const code = el.dataset.selectMapHub;
      if (ui.airports.selectedCode === code && el.classList.contains('map-airport-node')) {
        onOpenAirport(code);
        return;
      }
      ui.airports.selectedCode = code;
      renderApp();
    });
  });

  document.querySelectorAll('[data-air-region]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.airports.region = btn.dataset.airRegion;
      renderApp();
    });
  });

  const airSearch = document.getElementById('airSearchInput');
  if (airSearch) {
    airSearch.addEventListener('input', () => {
      ui.airports.query = airSearch.value;
      renderApp();
      const el = document.getElementById('airSearchInput');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }
}
