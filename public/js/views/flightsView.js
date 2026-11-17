/* ============================================================================
   AEROLEAVE GLOBAL — VIEW 1: FLIGHTS SEARCH & MULTI-DESTINATION
   ============================================================================ */
import { escapeHtml, formatMoney, formatDuration, getAirportLocalTime, getAirlineColor, renderAirportOptions } from '../utils.js';
import { getAppState, getAirport, ui } from '../state.js';
import { renderAirportCard } from '../components/airportModal.js';

function getFilteredFlights(appState) {
  const f = ui.flights;
  let list = (appState.flights || []).filter((fl) => fl.seatsAvailable > 0);
  if (f.origin) list = list.filter((fl) => fl.origin === f.origin);
  if (f.destination) list = list.filter((fl) => fl.destination === f.destination);
  if (f.date) list = list.filter((fl) => fl.date === f.date);
  if (f.cabin !== 'ALL') list = list.filter((fl) => fl.cabinClass === f.cabin);
  if (f.scope === 'international') list = list.filter((fl) => fl.isInternational);
  if (f.scope === 'domestic') list = list.filter((fl) => !fl.isInternational);
  if (f.stops === '0') list = list.filter((fl) => (fl.stops || 0) === 0);
  if (f.stops === '1') list = list.filter((fl) => (fl.stops || 0) >= 1);
  if (f.airlines.length > 0) list = list.filter((fl) => f.airlines.includes(fl.airline));

  if (f.sortBy === 'cheapest') list.sort((a, b) => a.price - b.price);
  else if (f.sortBy === 'fastest') list.sort((a, b) => a.durationMinutes - b.durationMinutes);
  else if (f.sortBy === 'earliest') list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));

  return list;
}

function renderFlightCard(fl) {
  const oAir = getAirport(fl.origin);
  const dAir = getAirport(fl.destination);
  const badgeColor = getAirlineColor(fl.airlineCode);
  const stopsLabel = (fl.stops || 0) === 0 ? 'Non-stop' : fl.stopInfo || `${fl.stops} Transit`;

  return `
    <article class="flight-card">
      <div class="airline-block">
        <div class="airline-logo" style="background:${badgeColor};">${escapeHtml(fl.airlineCode)}</div>
        <div>
          <div style="font-weight:700;color:var(--navy-900);">${escapeHtml(fl.airline)}</div>
          <div class="mono" style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(fl.flightNumber)} · ${escapeHtml(fl.cabinClass)}</div>
          <div style="font-size:0.74rem;color:var(--ink-secondary);">${escapeHtml(fl.aircraft || 'Commercial Jet')}</div>
        </div>
      </div>

      <div>
        <div class="timeline-block">
          <div class="time-col">
            <div class="clock">${escapeHtml(fl.departureTime)}</div>
            <div class="code">${escapeHtml(fl.origin)} · ${escapeHtml(fl.terminalOrigin || (oAir ? oAir.primaryTerminal : ''))}</div>
          </div>
          <div class="arc-col">
            <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${formatDuration(fl.durationMinutes)}</div>
            <div class="arc-line"></div>
            <div style="font-size:0.75rem;font-weight:600;color:${(fl.stops || 0) === 0 ? 'var(--status-confirmed-ink)' : 'var(--accent-amber)'};">
              ${escapeHtml(stopsLabel)} · ${escapeHtml(fl.date)}
            </div>
          </div>
          <div class="time-col" style="text-align:right;">
            <div class="clock">${escapeHtml(fl.arrivalTime)}</div>
            <div class="code">${escapeHtml(fl.destination)} · ${escapeHtml(fl.terminalDestination || (dAir ? dAir.primaryTerminal : ''))}</div>
          </div>
        </div>
        <div class="amenity-row">
          ${fl.isInternational ? '<span class="badge badge-intl">Internasional</span>' : '<span class="amenity-chip">Domestik</span>'}
          <span class="amenity-chip">Bagasi ${fl.baggageKg} kg</span>
          ${(fl.amenities || []).slice(0, 3).map((am) => `<span class="amenity-chip">${escapeHtml(am)}</span>`).join('')}
        </div>
      </div>

      <div class="price-block">
        <div style="font-size:0.74rem;color:var(--ink-muted);">Mulai dari / pax</div>
        <div class="price-amount">${formatMoney(fl.price, ui.currency)}</div>
        <div class="seats-left">Tersisa ${fl.seatsAvailable} kursi · Gate ${escapeHtml(fl.gate || 'TBD')}</div>
        <button type="button" class="btn btn-primary" style="width:100%;" data-book-flight="${escapeHtml(fl.flightId)}">
          Pilih &amp; Kursi →
        </button>
      </div>
    </article>
  `;
}

export function renderFlightsView() {
  const appState = getAppState();
  const f = ui.flights;
  const user = appState.currentUser;
  const heroAirport = getAirport(f.destination || 'SIN') || getAirport('SIN') || appState.airports[0];
  const originAirport = getAirport(f.origin);
  const destAirport = getAirport(f.destination);
  const matched = getFilteredFlights(appState);
  const allAirlines = Array.from(new Set(appState.flights.map((fl) => fl.airline))).sort();

  const actorRibbon = user
    ? `<div class="banner" style="background:var(--bg-surface);border:1px solid var(--border-hairline);margin-bottom:1.1rem;">
        <div>
          <span class="badge badge-booked">${escapeHtml(user.roleBadge)}</span>
          <strong style="margin-left:0.45rem;color:var(--navy-900);">${escapeHtml(user.fullName)}</strong>
          <span style="color:var(--ink-secondary);margin-left:0.45rem;">${escapeHtml(user.roleSummary)}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-open-auth>Ganti Aktor</button>
      </div>`
    : `<div class="banner" style="background:var(--accent-cobalt-soft);border:1px solid rgba(27,77,219,0.22);margin-bottom:1.1rem;">
        <div>
          <strong style="color:var(--accent-cobalt-ink);">Mode Tamu (Browsing Katalog)</strong> —
          <span style="color:var(--ink-secondary);">Masuk sebagai <strong>Visitor / Customer</strong> atau <strong>Frequent Traveller</strong> untuk pesan tiket sendiri, atau masuk sebagai <strong>Employee / HR / Travel Manager</strong> untuk layanan loket offline &amp; manajemen perusahaan.</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-open-auth>Masuk / Pilih Aktor</button>
      </div>`;

  let resultsSectionHtml = '';
  if (f.tripMode === 'multi') {
    const allDestCodes = (appState.airports || []).map((a) => a.code);
    const groups = f.multiDestinations.map((code) => {
      const air = getAirport(code);
      const list = appState.flights.filter(
        (fl) => fl.destination === code && (!f.origin || fl.origin === f.origin) && fl.seatsAvailable > 0
      );
      return { code, air, list };
    });
    resultsSectionHtml = `
      <div class="panel mb-2">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Jelajah Multi-Destinasi Sekaligus</h3>
            <p class="panel-desc">Bandingkan ketersediaan jadwal &amp; tarif terbaik ke beberapa kota internasional maupun domestik secara paralel.</p>
          </div>
        </div>
        <div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:1rem;">
          ${allDestCodes
            .map((code) => {
              const active = f.multiDestinations.includes(code);
              return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" data-toggle-multidest="${code}">${code}</button>`;
            })
            .join('')}
        </div>
        <div class="grid-2">
          ${groups
            .map(
              (g) => `
            <div class="panel" style="padding:0;overflow:hidden;">
              ${
                g.air
                  ? `<div class="airport-photo-box" style="height:125px;cursor:pointer;" data-open-airport="${escapeHtml(g.air.code)}">
                      <img src="${escapeHtml(g.air.imageUrl)}" alt="${escapeHtml(g.air.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(g.air.code)}', '${escapeHtml(g.air.city)}')">
                      <div class="airport-photo-overlay">
                        <div class="airport-photo-top"><span class="iata-pill">${escapeHtml(g.air.code)}</span><span class="airport-clock-pill">${getAirportLocalTime(g.air.timezone)}</span></div>
                        <strong>${escapeHtml(g.air.city)}, ${escapeHtml(g.air.country)}</strong>
                      </div>
                    </div>`
                  : ''
              }
              <div style="padding:0.9rem;">
                ${
                  g.list.length === 0
                    ? '<div style="color:var(--ink-muted);font-size:0.85rem;">Tidak ada jadwal dari asal terpilih.</div>'
                    : g.list
                        .slice(0, 4)
                        .map(
                          (fl) => `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid var(--border-hairline);gap:0.5rem;">
                        <div>
                          <strong>${escapeHtml(fl.airline)}</strong> <span class="mono" style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(fl.flightNumber)}</span>
                          <div style="font-size:0.76rem;color:var(--ink-secondary);">${escapeHtml(fl.origin)} → ${escapeHtml(fl.destination)} · ${escapeHtml(fl.date)} · ${escapeHtml(fl.departureTime)}</div>
                        </div>
                        <div style="text-align:right;">
                          <div style="font-weight:700;color:var(--navy-900);">${formatMoney(fl.price, ui.currency)}</div>
                          <button type="button" class="btn btn-primary btn-sm" style="height:28px;margin-top:0.2rem;" data-book-flight="${escapeHtml(fl.flightId)}">Pesan</button>
                        </div>
                      </div>`
                        )
                        .join('')
                }
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    `;
  } else {
    const airportStripHtml =
      originAirport && destAirport && originAirport.code !== destAirport.code
        ? `
        <div class="route-airport-strip">
          <div class="airport-mini-card" data-open-airport="${escapeHtml(originAirport.code)}">
            <div class="airport-mini-thumb">
              <img src="${escapeHtml(originAirport.imageUrl)}" alt="${escapeHtml(originAirport.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(originAirport.code)}', '${escapeHtml(originAirport.city)}')">
            </div>
            <div class="airport-mini-info">
              <div class="code-row"><span class="iata-pill">${escapeHtml(originAirport.code)}</span><strong>${escapeHtml(originAirport.city)}</strong></div>
              <div style="font-size:0.8rem;color:var(--ink-secondary);margin-top:0.15rem;">${escapeHtml(originAirport.name)}</div>
              <div class="mono" style="font-size:0.74rem;color:var(--accent-cobalt);margin-top:0.15rem;">Lokal ${getAirportLocalTime(originAirport.timezone)} · Info terminal</div>
            </div>
          </div>
          <div class="route-connector">
            <span>${destAirport.countryCode !== originAirport.countryCode ? 'INTL ROUTE' : 'DOMESTIC'}</span>
            <span style="font-size:1.1rem;color:var(--accent-cobalt);">✈ ───▶</span>
            <span>${matched.length} jadwal</span>
          </div>
          <div class="airport-mini-card" data-open-airport="${escapeHtml(destAirport.code)}">
            <div class="airport-mini-thumb">
              <img src="${escapeHtml(destAirport.imageUrl)}" alt="${escapeHtml(destAirport.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${escapeHtml(destAirport.code)}', '${escapeHtml(destAirport.city)}')">
            </div>
            <div class="airport-mini-info">
              <div class="code-row"><span class="iata-pill">${escapeHtml(destAirport.code)}</span><strong>${escapeHtml(destAirport.city)}</strong></div>
              <div style="font-size:0.8rem;color:var(--ink-secondary);margin-top:0.15rem;">${escapeHtml(destAirport.name)}</div>
              <div class="mono" style="font-size:0.74rem;color:var(--accent-cobalt);margin-top:0.15rem;">Lokal ${getAirportLocalTime(destAirport.timezone)} · Info terminal</div>
            </div>
          </div>
        </div>`
        : '';

    resultsSectionHtml = `
      ${airportStripHtml}
      <div class="results-layout">
        <aside class="filter-sidebar">
          <div class="filter-group">
            <h4>Cakupan Rute</h4>
            <label class="check-row"><input type="radio" name="fltScope" value="ALL" ${f.scope === 'ALL' ? 'checked' : ''}> Semua Rute (${appState.flights.length})</label>
            <label class="check-row"><input type="radio" name="fltScope" value="international" ${f.scope === 'international' ? 'checked' : ''}> Internasional</label>
            <label class="check-row"><input type="radio" name="fltScope" value="domestic" ${f.scope === 'domestic' ? 'checked' : ''}> Domestik Indonesia</label>
          </div>
          <div class="filter-group">
            <h4>Transit</h4>
            <label class="check-row"><input type="radio" name="fltStops" value="ALL" ${f.stops === 'ALL' ? 'checked' : ''}> Semua</label>
            <label class="check-row"><input type="radio" name="fltStops" value="0" ${f.stops === '0' ? 'checked' : ''}> Langsung (Non-stop)</label>
            <label class="check-row"><input type="radio" name="fltStops" value="1" ${f.stops === '1' ? 'checked' : ''}> 1 Transit</label>
          </div>
          <div class="filter-group">
            <h4>Maskapai</h4>
            ${allAirlines
              .map(
                (al) => `
              <label class="check-row">
                <input type="checkbox" class="chk-airline" value="${escapeHtml(al)}" ${f.airlines.includes(al) ? 'checked' : ''}>
                <span>${escapeHtml(al)}</span>
              </label>`
              )
              .join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="width:100%;" id="btnResetFlightFilters">Reset Semua Filter</button>
        </aside>

        <div>
          <div class="results-toolbar">
            <div>
              <strong style="font-size:1.05rem;color:var(--navy-900);">${matched.length} Penerbangan Tersedia</strong>
              <span style="font-size:0.84rem;color:var(--ink-muted);margin-left:0.5rem;">Multi-penumpang &amp; pilih kursi interaktif</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <label for="fltSortBy" style="font-size:0.82rem;color:var(--ink-secondary);">Urutkan:</label>
              <select id="fltSortBy" class="select" style="width:auto;height:34px;">
                <option value="cheapest" ${f.sortBy === 'cheapest' ? 'selected' : ''}>Termurah</option>
                <option value="fastest" ${f.sortBy === 'fastest' ? 'selected' : ''}>Durasi Tercepat</option>
                <option value="earliest" ${f.sortBy === 'earliest' ? 'selected' : ''}>Keberangkatan Paling Awal</option>
              </select>
            </div>
          </div>

          <div class="flight-card-list">
            ${
              matched.length === 0
                ? `<div class="panel" style="text-align:center;padding:2.2rem;">
                    <strong>Tidak ada jadwal yang cocok dengan filter saat ini.</strong>
                    <p style="color:var(--ink-secondary);margin:0.4rem 0 1rem;">Coba kosongkan tanggal atau pilih rute lain seperti CGK → SIN, HND, DXB, atau DPS.</p>
                    <button type="button" class="btn btn-primary btn-sm" id="btnShowAllFlights">Tampilkan Semua Rute</button>
                  </div>`
                : matched.map(renderFlightCard).join('')
            }
          </div>
        </div>
      </div>
    `;
  }

  return `
    <section class="hero-banner">
      ${
        heroAirport
          ? `<img class="hero-bg-photo" src="${escapeHtml(heroAirport.imageUrl)}" alt="${escapeHtml(heroAirport.name)}" onerror="this.style.display='none'">`
          : ''
      }
      <div class="hero-scrim"></div>
      <div class="hero-content">
        <div>
          <div class="hero-kicker">INTERNATIONAL FLIGHT BOOKING · 14 GLOBAL HUBS</div>
          <h1 class="hero-title">Terbang Lintas Benua, Pemesanan Online hingga Layanan Loket Agen.</h1>
          <p class="hero-subtitle">Cari tiket penerbangan domestik &amp; internasional, pilih kursi kabin multi-penumpang, cetak boarding pass QR, serta kelola operasional agen &amp; cuti HR perusahaan.</p>
        </div>
        ${
          heroAirport
            ? `<div class="hero-airport-badge" style="cursor:pointer;" data-open-airport="${escapeHtml(heroAirport.code)}">
                <div class="label">BANDARA DESTINASI UNGGULAN</div>
                <div class="name">${escapeHtml(heroAirport.code)} · ${escapeHtml(heroAirport.name)}</div>
                <div class="meta">${escapeHtml(heroAirport.city)}, ${escapeHtml(heroAirport.country)} · ${getAirportLocalTime(heroAirport.timezone)} (${escapeHtml(heroAirport.utcLabel)})</div>
              </div>`
            : ''
        }
      </div>
    </section>

    <div class="search-shell">
      <div class="search-card">
        <div class="trip-tabs">
          <div class="segmented">
            <button type="button" class="seg-btn ${f.tripMode === 'single' ? 'active' : ''}" data-trip-mode="single">Cari Rute</button>
            <button type="button" class="seg-btn ${f.tripMode === 'multi' ? 'active' : ''}" data-trip-mode="multi">Multi-Destinasi</button>
          </div>
          <div class="quick-routes">
            <span style="font-size:0.78rem;color:var(--ink-muted);font-weight:600;">Rute Populer:</span>
            <button type="button" class="quick-pill" data-quick-route="CGK|SIN">CGK → SIN</button>
            <button type="button" class="quick-pill" data-quick-route="CGK|HND">CGK → Tokyo (HND)</button>
            <button type="button" class="quick-pill" data-quick-route="CGK|DXB">CGK → Dubai (DXB)</button>
            <button type="button" class="quick-pill" data-quick-route="CGK|LHR">CGK → London (LHR)</button>
            <button type="button" class="quick-pill" data-quick-route="CGK|DPS">CGK → Bali (DPS)</button>
            <button type="button" class="quick-pill" data-quick-route="|">Semua Rute</button>
          </div>
        </div>

        <div class="search-grid">
          <div class="field">
            <label for="fltOrigin">Dari (Bandara Asal)</label>
            <select id="fltOrigin" class="select">${renderAirportOptions(appState.airports, f.origin, 'Semua Bandara Asal')}</select>
          </div>
          <button type="button" class="swap-btn" id="btnSwapRoute" title="Tukar Asal &amp; Tujuan">⇄</button>
          <div class="field">
            <label for="fltDestination">Ke (Bandara Tujuan)</label>
            <select id="fltDestination" class="select">${renderAirportOptions(appState.airports, f.destination, 'Semua Bandara Tujuan')}</select>
          </div>
          <div class="field">
            <label for="fltDate">Tanggal Berangkat</label>
            <input type="date" id="fltDate" class="input" value="${escapeHtml(f.date)}">
          </div>
          <div class="field">
            <label for="fltCabin">Kelas Kabin</label>
            <select id="fltCabin" class="select">
              <option value="ALL" ${f.cabin === 'ALL' ? 'selected' : ''}>Semua Kabin</option>
              <option value="Economy" ${f.cabin === 'Economy' ? 'selected' : ''}>Economy</option>
              <option value="Premium Economy" ${f.cabin === 'Premium Economy' ? 'selected' : ''}>Premium Economy</option>
              <option value="Business" ${f.cabin === 'Business' ? 'selected' : ''}>Business Class</option>
              <option value="First" ${f.cabin === 'First' ? 'selected' : ''}>First Class</option>
            </select>
          </div>
          <button type="button" class="btn btn-primary" id="btnRunSearch">Cari</button>
        </div>
      </div>
    </div>

    <div class="container">
      ${actorRibbon}
      ${resultsSectionHtml}

      <div class="section-header">
        <div>
          <h2 class="section-title">Galeri Bandara Internasional &amp; Domestik</h2>
          <p class="section-sub">Klik salah satu bandara untuk melihat foto terminal, daftar lounge eksekutif, jam lokal, dan jadwal FIDS langsung.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-view-jump="airports">Lihat Semua 14 Bandara &amp; Peta Rute →</button>
      </div>
      <div class="airport-grid">
        ${(appState.airports || [])
          .filter((a) => ['SIN', 'CGK', 'HND', 'DXB', 'LHR', 'DPS', 'ICN', 'SYD'].includes(a.code))
          .map((a) => renderAirportCard(a, appState.flights, ui.currency))
          .join('')}
      </div>
    </div>
  `;
}

export function bindFlightsEvents({ renderApp, onBookFlight }) {
  document.querySelectorAll('[data-trip-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.flights.tripMode = btn.dataset.tripMode;
      renderApp();
    });
  });

  document.querySelectorAll('[data-quick-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [orig, dest] = btn.dataset.quickRoute.split('|');
      ui.flights.tripMode = 'single';
      ui.flights.origin = orig;
      ui.flights.destination = dest;
      ui.flights.date = '';
      renderApp();
    });
  });

  const fltOrigin = document.getElementById('fltOrigin');
  const fltDest = document.getElementById('fltDestination');
  const fltDate = document.getElementById('fltDate');
  const fltCabin = document.getElementById('fltCabin');
  const syncSearch = () => {
    if (fltOrigin) ui.flights.origin = fltOrigin.value;
    if (fltDest) ui.flights.destination = fltDest.value;
    if (fltDate) ui.flights.date = fltDate.value;
    if (fltCabin) ui.flights.cabin = fltCabin.value;
    renderApp();
  };
  if (fltOrigin) fltOrigin.addEventListener('change', syncSearch);
  if (fltDest) fltDest.addEventListener('change', syncSearch);
  if (fltDate) fltDate.addEventListener('change', syncSearch);
  if (fltCabin) fltCabin.addEventListener('change', syncSearch);
  const btnRunSearch = document.getElementById('btnRunSearch');
  if (btnRunSearch) btnRunSearch.addEventListener('click', syncSearch);

  const btnSwap = document.getElementById('btnSwapRoute');
  if (btnSwap) {
    btnSwap.addEventListener('click', () => {
      const tmp = ui.flights.origin;
      ui.flights.origin = ui.flights.destination;
      ui.flights.destination = tmp;
      renderApp();
    });
  }

  document.querySelectorAll('input[name="fltScope"]').forEach((r) => {
    r.addEventListener('change', () => {
      ui.flights.scope = r.value;
      renderApp();
    });
  });
  document.querySelectorAll('input[name="fltStops"]').forEach((r) => {
    r.addEventListener('change', () => {
      ui.flights.stops = r.value;
      renderApp();
    });
  });
  document.querySelectorAll('.chk-airline').forEach((chk) => {
    chk.addEventListener('change', () => {
      ui.flights.airlines = Array.from(document.querySelectorAll('.chk-airline:checked')).map((el) => el.value);
      renderApp();
    });
  });

  const fltSort = document.getElementById('fltSortBy');
  if (fltSort) fltSort.addEventListener('change', () => {
    ui.flights.sortBy = fltSort.value;
    renderApp();
  });

  [document.getElementById('btnResetFlightFilters'), document.getElementById('btnShowAllFlights')].forEach((b) => {
    if (b) {
      b.addEventListener('click', () => {
        ui.flights.origin = '';
        ui.flights.destination = '';
        ui.flights.date = '';
        ui.flights.cabin = 'ALL';
        ui.flights.scope = 'ALL';
        ui.flights.stops = 'ALL';
        ui.flights.airlines = [];
        renderApp();
      });
    }
  });

  document.querySelectorAll('[data-toggle-multidest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.toggleMultidest;
      const idx = ui.flights.multiDestinations.indexOf(code);
      if (idx >= 0 && ui.flights.multiDestinations.length > 1) ui.flights.multiDestinations.splice(idx, 1);
      else if (idx < 0) ui.flights.multiDestinations.push(code);
      renderApp();
    });
  });

  document.querySelectorAll('[data-book-flight]').forEach((btn) => {
    btn.addEventListener('click', () => onBookFlight(btn.dataset.bookFlight));
  });
}
