/* ============================================================================
   AEROLEAVE GLOBAL — MAIN APPLICATION CONTROLLER
   ============================================================================ */
(() => {
  const U = window.AeroUtils;
  const Api = window.AeroApi;
  const C = window.AeroComponents;

  let appState = null;

  const ui = {
    activeView: 'flights', // 'flights' | 'airports' | 'trips' | 'club' | 'corporate'
    currency: 'IDR',
    flights: {
      tripMode: 'single', // 'single' | 'multi'
      origin: 'CGK',
      destination: 'SIN',
      date: '',
      cabin: 'ALL',
      scope: 'ALL', // 'ALL' | 'international' | 'domestic'
      stops: 'ALL', // 'ALL' | '0' | '1'
      airlines: [],
      sortBy: 'cheapest',
      multiDestinations: ['SIN', 'HND', 'DPS', 'LHR']
    },
    airports: {
      region: 'ALL',
      query: '',
      selectedCode: null
    },
    trips: {
      statusFilter: 'ALL',
      searchQuery: ''
    },
    club: {
      subtab: 'multicity', // 'multicity' | 'compare' | 'profile'
      activeMemberId: 'FT-002',
      legs: [
        { origin: 'CGK', destination: 'SUB', date: '2026-11-20' },
        { origin: 'SUB', destination: 'DPS', date: '2026-11-21' },
        { origin: 'DPS', destination: 'UPG', date: '2026-11-22' }
      ],
      multiResult: null,
      validationResult: null,
      compareOrigin: 'CGK',
      compareDest: 'DPS',
      compareDate: '2026-11-20',
      compareTime: '08:00',
      ftBookingPage: null
    },
    corporate: {
      subtab: 'hr', // 'hr' | 'tm_status' | 'tm_visitor' | 'tm_auth'
      hr: { day: '', month: '', year: '2026', startDate: '', endDate: '', selectedEmployeeId: 'EMP-001' },
      tmStatusFilter: 'ALL',
      tmSearchDest: '',
      selectedVisitorId: 'VIS-002',
      visitorPreviewId: 'VIS-001',
      authCodeInput: '',
      authResult: null
    }
  };

  async function refreshState() {
    appState = await Api.getState();
    const statusEl = document.getElementById('footerSyncStatus');
    if (statusEl) {
      statusEl.textContent = `Sinkronisasi aktif · ${(appState.airports || []).length} Bandara · ${appState.flights.length} Jadwal Penerbangan`;
    }
    renderApp();
  }

  function getAirport(code) {
    return (appState.airports || []).find((a) => a.code === code) || null;
  }

  function renderAirportOptions(selected, includeAnyLabel = null) {
    const opts = [];
    if (includeAnyLabel) {
      opts.push(`<option value="" ${!selected ? 'selected' : ''}>${U.escapeHtml(includeAnyLabel)}</option>`);
    }
    const groups = {
      Indonesia: [],
      International: []
    };
    for (const a of appState.airports || []) {
      if (a.countryCode === 'ID') groups.Indonesia.push(a);
      else groups.International.push(a);
    }
    opts.push(
      `<optgroup label="Bandara Indonesia">${groups.Indonesia.map(
        (a) => `<option value="${U.escapeHtml(a.code)}" ${selected === a.code ? 'selected' : ''}>${U.escapeHtml(a.code)} — ${U.escapeHtml(a.city)} (${U.escapeHtml(a.shortName)})</option>`
      ).join('')}</optgroup>`
    );
    opts.push(
      `<optgroup label="Bandara Internasional">${groups.International.map(
        (a) => `<option value="${U.escapeHtml(a.code)}" ${selected === a.code ? 'selected' : ''}>${U.escapeHtml(a.code)} — ${U.escapeHtml(a.city)}, ${U.escapeHtml(a.country)}</option>`
      ).join('')}</optgroup>`
    );
    return opts.join('');
  }

  // ==========================================================================
  // VIEW 1: FLIGHTS (INTERNATIONAL SEARCH + AIRPORT PAIR + FLIGHT CARDS)
  // ==========================================================================
  function getFilteredFlights() {
    const f = ui.flights;
    let list = appState.flights.filter((fl) => fl.seatsAvailable > 0);
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
    const badgeColor = U.getAirlineColor(fl.airlineCode);
    const stopsLabel = (fl.stops || 0) === 0 ? 'Non-stop' : fl.stopInfo || `${fl.stops} Transit`;

    return `
      <article class="flight-card">
        <div class="airline-block">
          <div class="airline-logo" style="background:${badgeColor};">${U.escapeHtml(fl.airlineCode)}</div>
          <div>
            <div style="font-weight:700;color:var(--navy-900);">${U.escapeHtml(fl.airline)}</div>
            <div class="mono" style="font-size:0.78rem;color:var(--ink-muted);">${U.escapeHtml(fl.flightNumber)} · ${U.escapeHtml(fl.cabinClass)}</div>
            <div style="font-size:0.74rem;color:var(--ink-secondary);">${U.escapeHtml(fl.aircraft || 'Commercial Jet')}</div>
          </div>
        </div>

        <div>
          <div class="timeline-block">
            <div class="time-col">
              <div class="clock">${U.escapeHtml(fl.departureTime)}</div>
              <div class="code">${U.escapeHtml(fl.origin)} · ${U.escapeHtml(fl.terminalOrigin || (oAir ? oAir.primaryTerminal : ''))}</div>
            </div>
            <div class="arc-col">
              <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${U.formatDuration(fl.durationMinutes)}</div>
              <div class="arc-line"></div>
              <div style="font-size:0.75rem;font-weight:600;color:${(fl.stops || 0) === 0 ? 'var(--status-confirmed-ink)' : 'var(--accent-amber)'};">
                ${U.escapeHtml(stopsLabel)} · ${U.escapeHtml(fl.date)}
              </div>
            </div>
            <div class="time-col" style="text-align:right;">
              <div class="clock">${U.escapeHtml(fl.arrivalTime)}</div>
              <div class="code">${U.escapeHtml(fl.destination)} · ${U.escapeHtml(fl.terminalDestination || (dAir ? dAir.primaryTerminal : ''))}</div>
            </div>
          </div>
          <div class="amenity-row">
            ${fl.isInternational ? '<span class="badge badge-intl">Internasional</span>' : '<span class="amenity-chip">Domestik</span>'}
            <span class="amenity-chip">Bagasi ${fl.baggageKg} kg</span>
            ${(fl.amenities || []).slice(0, 3).map((am) => `<span class="amenity-chip">${U.escapeHtml(am)}</span>`).join('')}
          </div>
        </div>

        <div class="price-block">
          <div style="font-size:0.74rem;color:var(--ink-muted);">Mulai dari / pax</div>
          <div class="price-amount">${U.formatMoney(fl.price, ui.currency)}</div>
          <div class="seats-left">Tersisa ${fl.seatsAvailable} kursi · Gate ${U.escapeHtml(fl.gate || 'TBD')}</div>
          <button type="button" class="btn btn-primary" style="width:100%;" data-book-flight="${U.escapeHtml(fl.flightId)}">
            Pilih &amp; Kursi →
          </button>
        </div>
      </article>
    `;
  }

  function renderFlightsView() {
    const f = ui.flights;
    const heroAirport = getAirport(f.destination || 'SIN') || getAirport('SIN') || appState.airports[0];
    const originAirport = getAirport(f.origin);
    const destAirport = getAirport(f.destination);
    const matched = getFilteredFlights();
    const allAirlines = Array.from(new Set(appState.flights.map((fl) => fl.airline))).sort();

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
                    ? `<div class="airport-photo-box" style="height:125px;cursor:pointer;" data-open-airport="${U.escapeHtml(g.air.code)}">
                        <img src="${U.escapeHtml(g.air.imageUrl)}" alt="${U.escapeHtml(g.air.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(g.air.code)}', '${U.escapeHtml(g.air.city)}')">
                        <div class="airport-photo-overlay">
                          <div class="airport-photo-top"><span class="iata-pill">${U.escapeHtml(g.air.code)}</span><span class="airport-clock-pill">${U.getAirportLocalTime(g.air.timezone)}</span></div>
                          <strong>${U.escapeHtml(g.air.city)}, ${U.escapeHtml(g.air.country)}</strong>
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
                            <strong>${U.escapeHtml(fl.airline)}</strong> <span class="mono" style="font-size:0.78rem;color:var(--ink-muted);">${U.escapeHtml(fl.flightNumber)}</span>
                            <div style="font-size:0.76rem;color:var(--ink-secondary);">${U.escapeHtml(fl.origin)} → ${U.escapeHtml(fl.destination)} · ${U.escapeHtml(fl.date)} · ${U.escapeHtml(fl.departureTime)}</div>
                          </div>
                          <div style="text-align:right;">
                            <div style="font-weight:700;color:var(--navy-900);">${U.formatMoney(fl.price, ui.currency)}</div>
                            <button type="button" class="btn btn-primary btn-sm" style="height:28px;margin-top:0.2rem;" data-book-flight="${U.escapeHtml(fl.flightId)}">Pesan</button>
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
            <div class="airport-mini-card" data-open-airport="${U.escapeHtml(originAirport.code)}">
              <div class="airport-mini-thumb">
                <img src="${U.escapeHtml(originAirport.imageUrl)}" alt="${U.escapeHtml(originAirport.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(originAirport.code)}', '${U.escapeHtml(originAirport.city)}')">
              </div>
              <div class="airport-mini-info">
                <div class="code-row"><span class="iata-pill">${U.escapeHtml(originAirport.code)}</span><strong>${U.escapeHtml(originAirport.city)}</strong></div>
                <div style="font-size:0.8rem;color:var(--ink-secondary);margin-top:0.15rem;">${U.escapeHtml(originAirport.name)}</div>
                <div class="mono" style="font-size:0.74rem;color:var(--accent-cobalt);margin-top:0.15rem;">Lokal ${U.getAirportLocalTime(originAirport.timezone)} · Klik untuk info terminal</div>
              </div>
            </div>
            <div class="route-connector">
              <span>${destAirport.countryCode !== originAirport.countryCode ? 'INTL ROUTE' : 'DOMESTIC'}</span>
              <span style="font-size:1.1rem;color:var(--accent-cobalt);">✈ ───▶</span>
              <span>${matched.length} jadwal</span>
            </div>
            <div class="airport-mini-card" data-open-airport="${U.escapeHtml(destAirport.code)}">
              <div class="airport-mini-thumb">
                <img src="${U.escapeHtml(destAirport.imageUrl)}" alt="${U.escapeHtml(destAirport.name)}" onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(destAirport.code)}', '${U.escapeHtml(destAirport.city)}')">
              </div>
              <div class="airport-mini-info">
                <div class="code-row"><span class="iata-pill">${U.escapeHtml(destAirport.code)}</span><strong>${U.escapeHtml(destAirport.city)}</strong></div>
                <div style="font-size:0.8rem;color:var(--ink-secondary);margin-top:0.15rem;">${U.escapeHtml(destAirport.name)}</div>
                <div class="mono" style="font-size:0.74rem;color:var(--accent-cobalt);margin-top:0.15rem;">Lokal ${U.getAirportLocalTime(destAirport.timezone)} · Klik untuk info terminal</div>
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
                  <input type="checkbox" class="chk-airline" value="${U.escapeHtml(al)}" ${f.airlines.includes(al) ? 'checked' : ''}>
                  <span>${U.escapeHtml(al)}</span>
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
                <span style="font-size:0.84rem;color:var(--ink-muted);margin-left:0.5rem;">Harga termasuk bagasi &amp; opsi pilih kursi</span>
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
            ? `<img class="hero-bg-photo" src="${U.escapeHtml(heroAirport.imageUrl)}" alt="${U.escapeHtml(heroAirport.name)}" onerror="this.style.display='none'">`
            : ''
        }
        <div class="hero-scrim"></div>
        <div class="hero-content">
          <div>
            <div class="hero-kicker">INTERNATIONAL FLIGHT BOOKING · 14 GLOBAL HUBS</div>
            <h1 class="hero-title">Terbang Lintas Benua, Terintegrasi dengan Travel Korporat.</h1>
            <p class="hero-subtitle">Cari tiket internasional &amp; domestik, lihat foto terminal bandara tujuan, pilih kursi kabin interaktif, hingga terbitkan boarding pass QR resmi.</p>
          </div>
          ${
            heroAirport
              ? `<div class="hero-airport-badge" style="cursor:pointer;" data-open-airport="${U.escapeHtml(heroAirport.code)}">
                  <div class="label">BANDARA DESTINASI UNGGULAN</div>
                  <div class="name">${U.escapeHtml(heroAirport.code)} · ${U.escapeHtml(heroAirport.name)}</div>
                  <div class="meta">${U.escapeHtml(heroAirport.city)}, ${U.escapeHtml(heroAirport.country)} · ${U.getAirportLocalTime(heroAirport.timezone)} (${U.escapeHtml(heroAirport.utcLabel)})</div>
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
              <select id="fltOrigin" class="select">${renderAirportOptions(f.origin, 'Semua Bandara Asal')}</select>
            </div>
            <button type="button" class="swap-btn" id="btnSwapRoute" title="Tukar Asal & Tujuan">⇄</button>
            <div class="field">
              <label for="fltDestination">Ke (Bandara Tujuan)</label>
              <select id="fltDestination" class="select">${renderAirportOptions(f.destination, 'Semua Bandara Tujuan')}</select>
            </div>
            <div class="field">
              <label for="fltDate">Tanggal Berangkat</label>
              <input type="date" id="fltDate" class="input" value="${U.escapeHtml(f.date)}">
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
            .map((a) => C.renderAirportCard(a, appState.flights, ui.currency))
            .join('')}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // VIEW 2: AIRPORTS & GLOBAL HUBS DIRECTORY
  // ==========================================================================
  function renderAirportsView() {
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
            <p class="section-sub">Eksplorasi foto arsitektur terminal, fasilitas lounge, zona waktu lokal, serta jadwal keberangkatan &amp; kedatangan tiap hub.</p>
          </div>
        </div>

        ${C.renderWorldRouteMap(appState.airports || [], appState.flights, aState.selectedCode)}

        <div class="panel mt-2 mb-2" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            ${regions
              .map(
                (reg) => `<button type="button" class="btn btn-sm ${aState.region === reg ? 'btn-primary' : 'btn-secondary'}" data-air-region="${U.escapeHtml(reg)}">${reg === 'ALL' ? 'Semua Wilayah' : U.escapeHtml(reg)}</button>`
              )
              .join('')}
          </div>
          <input type="text" id="airSearchInput" class="input" style="max-width:280px;" placeholder="Cari kode IATA, kota, negara..." value="${U.escapeHtml(aState.query)}">
        </div>

        <div class="airport-grid">
          ${list.map((a) => C.renderAirportCard(a, appState.flights, ui.currency)).join('')}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // VIEW 3: MY TRIPS & BOARDING PASSES
  // ==========================================================================
  function renderTripsView() {
    const t = ui.trips;
    let list = [...appState.bookings];
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

    return `
      <div class="container">
        <div class="section-header" style="margin-top:0;">
          <div>
            <h1 class="section-title">Perjalanan Saya &amp; E-Tiket</h1>
            <p class="section-sub">Kelola seluruh reservasi penerbangan, selesaikan pembayaran tertunda, atau cetak Boarding Pass QR resmi.</p>
          </div>
        </div>

        <div class="panel mb-2" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            ${Object.entries(counts)
              .map(
                ([st, cnt]) => `<button type="button" class="btn btn-sm ${t.statusFilter === st ? 'btn-primary' : 'btn-secondary'}" data-trip-status="${U.escapeHtml(st)}">${st === 'ALL' ? 'Semua' : U.escapeHtml(st)} (${cnt})</button>`
              )
              .join('')}
          </div>
          <input type="text" id="tripSearchInput" class="input" style="max-width:290px;" placeholder="Cari PNR (HLM-...) atau penumpang" value="${U.escapeHtml(t.searchQuery)}">
        </div>

        <div class="flight-card-list">
          ${
            list.length === 0
              ? '<div class="panel" style="text-align:center;color:var(--ink-muted);padding:2rem;">Belum ada pesanan yang sesuai filter.</div>'
              : list
                  .slice()
                  .reverse()
                  .map((b) => {
                    const oAir = getAirport(b.origin);
                    const dAir = getAirport(b.destination);
                    const canPay = b.status === 'booked' || b.status === 'waiting for the payment';
                    const canCancel = b.status !== 'cancelled';
                    return `
                      <article class="flight-card" style="grid-template-columns:230px minmax(0,1fr) 260px;">
                        <div>
                          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
                            <span class="iata-pill">${U.escapeHtml(b.bookingReference)}</span>
                            ${U.statusBadge(b.status)}
                          </div>
                          <div style="font-weight:700;color:var(--navy-900);">${U.escapeHtml(b.passengerName)}</div>
                          <div class="mono" style="font-size:0.76rem;color:var(--ink-muted);">${U.escapeHtml(b.eTicketNumber)}</div>
                        </div>

                        <div style="display:flex;align-items:center;gap:1rem;">
                          ${
                            dAir
                              ? `<div class="airport-mini-thumb" style="width:76px;height:54px;cursor:pointer;" data-open-airport="${U.escapeHtml(dAir.code)}">
                                  <img src="${U.escapeHtml(dAir.imageUrl)}" alt="${U.escapeHtml(dAir.city)}" onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(dAir.code)}', '${U.escapeHtml(dAir.city)}')">
                                </div>`
                              : ''
                          }
                          <div>
                            <div style="font-weight:700;">${U.escapeHtml(b.origin)} (${U.escapeHtml(oAir ? oAir.city : b.origin)}) → ${U.escapeHtml(b.destination)} (${U.escapeHtml(dAir ? dAir.city : b.destination)})</div>
                            <div style="font-size:0.84rem;color:var(--ink-secondary);">${U.escapeHtml(b.airline)} ${U.escapeHtml(b.flightNumber)} · ${U.escapeHtml(b.date)} · ${U.escapeHtml(b.departureTime)}–${U.escapeHtml(b.arrivalTime)}</div>
                            <div class="mono" style="font-size:0.76rem;color:var(--ink-muted);">Kursi ${U.escapeHtml(b.seatNumber)} · ${U.escapeHtml(b.cabinClass)} (${U.escapeHtml(b.fareTier || 'Standard')})</div>
                          </div>
                        </div>

                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.45rem;">
                          <strong style="font-size:1.1rem;color:var(--navy-900);">${U.formatMoney(b.price, ui.currency)}</strong>
                          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;justify-content:flex-end;">
                            ${canPay ? `<button type="button" class="btn btn-primary btn-sm" data-pay-booking="${U.escapeHtml(b.bookingId)}">Bayar &amp; Konfirmasi</button>` : ''}
                            <button type="button" class="btn btn-secondary btn-sm" data-view-bp="${U.escapeHtml(b.bookingReference)}">Boarding Pass</button>
                            ${canCancel ? `<button type="button" class="btn btn-danger btn-sm" data-cancel-booking="${U.escapeHtml(b.bookingId)}">Batalkan</button>` : ''}
                          </div>
                        </div>
                      </article>`;
                  })
                  .join('')
          }
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // VIEW 4: FREQUENT FLYER CLUB (US4, US5, US6)
  // ==========================================================================
  function evaluateFtProfile(member) {
    const req = ['fullName', 'email', 'phone', 'identityNumber', 'birthDate', 'nationality', 'frequentFlyerNumber'];
    const missing = req.filter((k) => !member[k] || String(member[k]).trim() === '');
    return { isComplete: missing.length === 0, missing };
  }

  function renderClubView() {
    const c = ui.club;
    const member = appState.frequentTravellers.find((m) => m.memberId === c.activeMemberId) || appState.frequentTravellers[0];
    const profStatus = evaluateFtProfile(member);

    let tabHtml = '';
    if (c.subtab === 'multicity') {
      tabHtml = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Perencana Rute Multi-City &amp; Perbandingan Itinerary</h3>
              <p class="panel-desc">Atur segmen keberangkatan lintas kota atau negara untuk membandingkan kombinasi tarif dan total penerbangan.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btnClubAddLeg">+ Tambah Segmen</button>
          </div>
          ${c.legs
            .map(
              (leg, idx) => `
            <div class="grid-4 mb-1" style="align-items:end;">
              <div class="field"><label>Segmen ${idx + 1} Asal</label><select class="select club-leg-origin" data-idx="${idx}">${renderAirportOptions(leg.origin)}</select></div>
              <div class="field"><label>Tujuan</label><select class="select club-leg-dest" data-idx="${idx}">${renderAirportOptions(leg.destination)}</select></div>
              <div class="field"><label>Tanggal</label><input type="date" class="input club-leg-date" data-idx="${idx}" value="${U.escapeHtml(leg.date)}"></div>
              <div>${c.legs.length > 1 ? `<button type="button" class="btn btn-danger btn-sm" data-club-del-leg="${idx}">Hapus</button>` : ''}</div>
            </div>`
            )
            .join('')}
          <button type="button" class="btn btn-primary mt-1" id="btnClubSearchMulti">Cari &amp; Bandingkan Multi-City</button>

          ${
            c.multiResult
              ? `<div class="table-wrap mt-2">
                  <table>
                    <thead><tr><th>Paket</th><th>Rute</th><th class="num">Segmen</th><th class="num">Durasi</th><th class="num">Total Tarif</th></tr></thead>
                    <tbody>
                      ${
                        c.multiResult.multiDestinationItinerariesComparison.length === 0
                          ? '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);">Tidak ada kombinasi penuh untuk semua segmen tanggal tersebut.</td></tr>'
                          : c.multiResult.multiDestinationItinerariesComparison
                              .map(
                                (it, i) => `
                              <tr>
                                <td><strong>${U.escapeHtml(it.itineraryId)}</strong> ${i === 0 ? '<span class="badge badge-confirmed">Termurah</span>' : ''}</td>
                                <td class="mono">${U.escapeHtml(it.routeSummary)}</td>
                                <td class="num">${it.totalFlights}</td>
                                <td class="num">${U.formatDuration(it.totalDurationMinutes)}</td>
                                <td class="num"><strong>${U.formatMoney(it.totalPrice, ui.currency)}</strong></td>
                              </tr>`
                              )
                              .join('')
                      }
                    </tbody>
                  </table>
                </div>`
              : ''
          }
        </div>
      `;
    } else if (c.subtab === 'compare') {
      const matched = appState.flights
        .filter((fl) => {
          const origOk = !c.compareOrigin || fl.origin === c.compareOrigin;
          const destOk = !c.compareDest || fl.destination === c.compareDest;
          const dateOk = !c.compareDate || fl.date === c.compareDate;
          return origOk && destOk && dateOk && fl.seatsAvailable > 0;
        })
        .sort((a, b) => a.price - b.price);
      const minP = matched.length > 0 ? matched[0].price : 0;

      tabHtml = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">Komparasi Tarif Member &amp; Perolehan Miles</h3>
              <p class="panel-desc">Bandingkan tarif berdasarkan rute, tanggal, serta estimasi perolehan poin Frequent Flyer.</p>
            </div>
          </div>
          <div class="grid-4 mb-2">
            <div class="field"><label>Asal</label><select id="clubCmpOrig" class="select">${renderAirportOptions(c.compareOrigin, 'Semua')}</select></div>
            <div class="field"><label>Tujuan</label><select id="clubCmpDest" class="select">${renderAirportOptions(c.compareDest, 'Semua')}</select></div>
            <div class="field"><label>Tanggal</label><input type="date" id="clubCmpDate" class="input" value="${U.escapeHtml(c.compareDate)}"></div>
            <div class="field"><label>Jam Preferensi</label><input type="text" id="clubCmpTime" class="input" value="${U.escapeHtml(c.compareTime)}" placeholder="08:00 / pagi"></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Maskapai</th><th>Rute &amp; Jam</th><th class="num">Miles</th><th class="num">Selisih Termurah</th><th class="num">Tarif</th><th class="num">Aksi</th></tr></thead>
              <tbody>
                ${matched
                  .map(
                    (fl, idx) => `
                  <tr>
                    <td><strong>${U.escapeHtml(fl.airline)}</strong> <span class="mono">${U.escapeHtml(fl.flightNumber)}</span> ${idx === 0 ? '<span class="badge badge-confirmed">Terhemat</span>' : ''}</td>
                    <td class="mono">${U.escapeHtml(fl.origin)}→${U.escapeHtml(fl.destination)} · ${U.escapeHtml(fl.date)} · ${U.escapeHtml(fl.departureTime)}</td>
                    <td class="num">+${Math.round(fl.price / 1000)} pts</td>
                    <td class="num">${idx === 0 ? 'Termurah' : '+' + U.formatMoney(fl.price - minP, ui.currency)}</td>
                    <td class="num"><strong>${U.formatMoney(fl.price, ui.currency)}</strong></td>
                    <td class="num"><button type="button" class="btn btn-primary btn-sm" data-club-book="${U.escapeHtml(fl.flightId)}">Pesan Member</button></td>
                  </tr>`
                  )
                  .join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Tidak ada jadwal yang cocok.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      tabHtml = `
        <div class="grid-2">
          <div class="panel">
            <h3 class="panel-title">Profil &amp; Dokumen Member</h3>
            <p class="panel-desc mb-1">Lengkapi seluruh data identitas/paspor agar validasi tiket &amp; check-in internasional disetujui.</p>
            <form id="formFtProfile">
              <div class="grid-2">
                <div class="field"><label>Nama Lengkap</label><input class="input" id="ftName" value="${U.escapeHtml(member.fullName)}" required></div>
                <div class="field"><label>Email</label><input class="input" id="ftEmail" value="${U.escapeHtml(member.email)}" required></div>
                <div class="field"><label>Nomor Telepon</label><input class="input" id="ftPhone" value="${U.escapeHtml(member.phone)}" placeholder="+628..."></div>
                <div class="field"><label>Nomor KTP / Paspor</label><input class="input" id="ftIdNum" value="${U.escapeHtml(member.identityNumber)}" placeholder="Wajib diisi"></div>
                <div class="field"><label>Tanggal Lahir</label><input type="date" class="input" id="ftBirth" value="${U.escapeHtml(member.birthDate)}"></div>
                <div class="field"><label>Kewarganegaraan</label><input class="input" id="ftNat" value="${U.escapeHtml(member.nationality)}"></div>
              </div>
              <div class="field mt-1"><label>Alamat Domisili</label><input class="input" id="ftAddr" value="${U.escapeHtml(member.address)}"></div>
              <div class="field mt-1 mb-2"><label>Nomor Frequent Flyer</label><input class="input mono" id="ftFfn" value="${U.escapeHtml(member.frequentFlyerNumber)}"></div>
              <button type="submit" class="btn btn-primary">Simpan Profil Member</button>
            </form>
          </div>

          <div class="panel">
            <h3 class="panel-title">Status Kelengkapan &amp; Validasi Tiket</h3>
            <p class="panel-desc mb-1">Sistem memverifikasi kelengkapan dokumen sebelum penerbitan boarding pass.</p>
            <div class="banner ${profStatus.isComplete ? 'banner-success' : 'banner-danger'}">
              <div>
                <strong>${profStatus.isComplete ? 'Profil Lengkap' : 'Profil Belum Lengkap'}</strong><br>
                <span>${profStatus.isComplete ? 'Siap melakukan validasi tiket.' : 'Field kosong: ' + profStatus.missing.join(', ')}</span>
              </div>
            </div>
            <button type="button" class="btn btn-navy" id="btnFtValidate">Validasi Tiket Member</button>
            ${
              c.validationResult
                ? `<div class="banner mt-1 ${c.validationResult.valid ? 'banner-success' : 'banner-danger'}">
                    <div>
                      <strong>${U.escapeHtml(c.validationResult.valid ? 'VALIDASI BERHASIL' : 'VALIDASI DITOLAK')}</strong><br>
                      <span>${U.escapeHtml(c.validationResult.message)}</span>
                    </div>
                  </div>`
                : ''
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="container">
        <div class="panel mb-2" style="background:linear-gradient(135deg, var(--navy-950), var(--navy-800));color:#fff;border:none;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
            <div>
              <div class="mono" style="font-size:0.75rem;color:#93c5fd;">AEROLEAVE LOYALTY CLUB · ${U.escapeHtml(member.tier.toUpperCase())} TIER</div>
              <h1 style="margin:0.2rem 0;font-family:var(--font-display);font-size:2.1rem;font-weight:400;">${U.escapeHtml(member.fullName)}</h1>
              <div class="mono" style="font-size:0.84rem;opacity:0.86;">${U.escapeHtml(member.frequentFlyerNumber)} · ${member.points.toLocaleString('id-ID')} Miles</div>
            </div>
            <div style="display:flex;gap:0.65rem;align-items:center;">
              <label for="clubMemberSelect" style="font-size:0.82rem;opacity:0.85;">Akun Member:</label>
              <select id="clubMemberSelect" class="select" style="width:auto;color:var(--ink-primary);">
                ${appState.frequentTravellers.map((m) => `<option value="${U.escapeHtml(m.memberId)}" ${m.memberId === member.memberId ? 'selected' : ''}>${U.escapeHtml(m.fullName)} (${U.escapeHtml(m.tier)})</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="segmented mb-2">
          <button type="button" class="seg-btn ${c.subtab === 'multicity' ? 'active' : ''}" data-club-tab="multicity">Multi-City Planner</button>
          <button type="button" class="seg-btn ${c.subtab === 'compare' ? 'active' : ''}" data-club-tab="compare">Komparasi Preferensi</button>
          <button type="button" class="seg-btn ${c.subtab === 'profile' ? 'active' : ''}" data-club-tab="profile">Profil &amp; Validasi Tiket</button>
        </div>

        ${tabHtml}
      </div>
    `;
  }

  // ==========================================================================
  // VIEW 5: CORPORATE & HR OPS (US1, US7, US8, US9)
  // ==========================================================================
  function renderCorporateView() {
    const corp = ui.corporate;
    let bodyHtml = '';

    if (corp.subtab === 'hr') {
      const h = corp.hr;
      let leaves = [...appState.leaveRequests];
      if (h.day || h.month || h.year) {
        leaves = leaves.filter((lv) => {
          const [sy, sm] = lv.startDate.split('-').map(Number);
          const [ey, em] = lv.endDate.split('-').map(Number);
          if (h.year && sy !== Number(h.year) && ey !== Number(h.year)) return false;
          if (h.month && sm !== Number(h.month) && em !== Number(h.month)) return false;
          if (h.day) {
            const ty = h.year ? Number(h.year) : sy;
            const tm = h.month ? Number(h.month) : sm;
            const tStr = `${String(ty).padStart(4, '0')}-${String(tm).padStart(2, '0')}-${String(Number(h.day)).padStart(2, '0')}`;
            return lv.startDate <= tStr && lv.endDate >= tStr;
          }
          return true;
        });
      }
      if (h.startDate || h.endDate) {
        leaves = leaves.filter((lv) => lv.startDate <= (h.endDate || '9999-12-31') && lv.endDate >= (h.startDate || '0000-01-01'));
      }

      const emp = appState.employees.find((e) => e.employeeId === h.selectedEmployeeId) || appState.employees[0];
      const empLeaves = appState.leaveRequests.filter((l) => l.employeeId === emp.employeeId);
      const targetYear = String(h.year || 2026);
      const usedDays = empLeaves
        .filter((l) => l.status === 'approved' && (l.startDate.startsWith(targetYear) || l.endDate.startsWith(targetYear)))
        .reduce((acc, l) => acc + l.durationDays, 0);
      const remDays = Math.max(0, emp.annualLeaveQuota - usedDays);

      bodyHtml = `
        <div class="panel mb-2">
          <div class="panel-head">
            <div><h3 class="panel-title">Jadwal &amp; Periode Cuti Pegawai</h3><p class="panel-desc">Filter pengajuan cuti berdasarkan tanggal, bulan, tahun, atau rentang periode.</p></div>
            <button type="button" class="btn btn-secondary btn-sm" id="btnHrReset">Reset Filter</button>
          </div>
          <div class="grid-4 mb-2">
            <div class="field"><label>Tanggal</label><input type="number" min="1" max="31" id="hrDay" class="input" value="${U.escapeHtml(h.day)}" placeholder="Semua"></div>
            <div class="field"><label>Bulan</label><select id="hrMonth" class="select"><option value="">Semua</option>${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((m, i) => `<option value="${i + 1}" ${Number(h.month) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            <div class="field"><label>Tahun</label><select id="hrYear" class="select"><option value="">Semua</option><option value="2025" ${h.year === '2025' ? 'selected' : ''}>2025</option><option value="2026" ${h.year === '2026' ? 'selected' : ''}>2026</option></select></div>
            <div class="field"><label>Periode Mulai</label><input type="date" id="hrStart" class="input" value="${U.escapeHtml(h.startDate)}"></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Pegawai</th><th>Periode Cuti</th><th class="num">Durasi</th><th>Alasan</th><th>Status</th></tr></thead>
              <tbody>
                ${leaves
                  .map(
                    (lv) => `
                  <tr>
                    <td><strong>${U.escapeHtml(lv.employeeName)}</strong></td>
                    <td class="mono">${U.escapeHtml(lv.startDate)} s/d ${U.escapeHtml(lv.endDate)}</td>
                    <td class="num">${lv.durationDays} hari</td>
                    <td>${U.escapeHtml(lv.reason)}</td>
                    <td>${U.statusBadge(lv.status)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h3 class="panel-title">Riwayat &amp; Sisa Kuota Cuti Pegawai</h3>
            <div class="field mt-1 mb-1">
              <label>Pilih Pegawai</label>
              <select id="hrEmpSelect" class="select">
                ${appState.employees.map((e) => `<option value="${U.escapeHtml(e.employeeId)}" ${e.employeeId === emp.employeeId ? 'selected' : ''}>${U.escapeHtml(e.employeeName)} — ${U.escapeHtml(e.department)}</option>`).join('')}
              </select>
            </div>
            <div class="grid-3 mb-1">
              <div class="metric-card"><div class="metric-label">Kuota</div><div class="metric-val">${emp.annualLeaveQuota}h</div></div>
              <div class="metric-card"><div class="metric-label">Terpakai</div><div class="metric-val">${usedDays}h</div></div>
              <div class="metric-card"><div class="metric-label">Sisa Cuti</div><div class="metric-val" style="color:var(--accent-cobalt);">${remDays}h</div></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Periode</th><th class="num">Durasi</th><th>Status</th></tr></thead>
                <tbody>
                  ${empLeaves.map((l) => `<tr><td class="mono">${U.escapeHtml(l.startDate)} → ${U.escapeHtml(l.endDate)}</td><td class="num">${l.durationDays} hari</td><td>${U.statusBadge(l.status)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <h3 class="panel-title">Ajukan Cuti Baru</h3>
            <form id="formCorpLeave" class="mt-1">
              <div class="field mb-1"><label>Pegawai</label><select id="newLvEmp" class="select">${appState.employees.map((e) => `<option value="${U.escapeHtml(e.employeeId)}">${U.escapeHtml(e.employeeName)}</option>`).join('')}</select></div>
              <div class="grid-2 mb-1">
                <div class="field"><label>Tanggal Mulai</label><input type="date" id="newLvStart" class="input" value="2026-11-26" required></div>
                <div class="field"><label>Tanggal Selesai</label><input type="date" id="newLvEnd" class="input" value="2026-11-27" required></div>
              </div>
              <div class="field mb-2"><label>Alasan</label><input type="text" id="newLvReason" class="input" placeholder="Alasan pengajuan cuti" required></div>
              <button type="submit" class="btn btn-primary">Simpan Pengajuan Cuti</button>
            </form>
          </div>
        </div>
      `;
    } else if (corp.subtab === 'tm_status') {
      const list =
        corp.tmStatusFilter === 'ALL'
          ? appState.bookings
          : appState.bookings.filter((b) => b.status === corp.tmStatusFilter);
      bodyHtml = `
        <div class="panel">
          <div class="panel-head">
            <div><h3 class="panel-title">Monitor Status Booking Korporat</h3><p class="panel-desc">Filter reservasi berdasarkan status confirmed, booked, atau waiting for the payment.</p></div>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;">
            ${['ALL', 'confirmed', 'booked', 'waiting for the payment', 'cancelled']
              .map((st) => `<button type="button" class="btn btn-sm ${corp.tmStatusFilter === st ? 'btn-primary' : 'btn-secondary'}" data-tm-status="${U.escapeHtml(st)}">${st === 'ALL' ? 'Semua' : U.escapeHtml(st)}</button>`)
              .join('')}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>PNR</th><th>Penumpang</th><th>Rute &amp; Maskapai</th><th class="num">Tarif</th><th>Status</th><th class="num">Aksi</th></tr></thead>
              <tbody>
                ${list
                  .map(
                    (b) => `
                  <tr>
                    <td class="mono"><strong>${U.escapeHtml(b.bookingReference)}</strong></td>
                    <td>${U.escapeHtml(b.passengerName)}<br><span style="font-size:0.75rem;color:var(--ink-muted);">${U.escapeHtml(b.passengerEmail)}</span></td>
                    <td>${U.escapeHtml(b.origin)}→${U.escapeHtml(b.destination)} · ${U.escapeHtml(b.airline)} ${U.escapeHtml(b.flightNumber)}</td>
                    <td class="num">${U.formatMoney(b.price, ui.currency)}</td>
                    <td>${U.statusBadge(b.status)}</td>
                    <td class="num"><button type="button" class="btn btn-secondary btn-sm" data-view-bp="${U.escapeHtml(b.bookingReference)}">E-Tiket</button></td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (corp.subtab === 'tm_visitor') {
      const visFlights = appState.flights.filter(
        (fl) => fl.seatsAvailable > 0 && (!corp.tmSearchDest || fl.destination === corp.tmSearchDest)
      );
      const previewVis = appState.visitors.find((v) => v.visitorId === corp.visitorPreviewId) || appState.visitors[0];
      const visTickets = appState.bookings.filter((b) => b.visitorId === previewVis.visitorId || b.passengerEmail === previewVis.visitorEmail);
      const visEmails = appState.emailNotifications.filter((e) => e.visitorId === previewVis.visitorId || e.recipientEmail === previewVis.visitorEmail);

      bodyHtml = `
        <div class="grid-2">
          <div class="panel">
            <h3 class="panel-title">Pesan Tiket atas Nama Pengunjung &amp; Kirim E-Tiket</h3>
            <div class="grid-2 mt-1 mb-1">
              <div class="field"><label>Pengunjung</label><select id="tmVisitorSelect" class="select">${appState.visitors.map((v) => `<option value="${U.escapeHtml(v.visitorId)}" ${v.visitorId === corp.selectedVisitorId ? 'selected' : ''}>${U.escapeHtml(v.visitorName)} (${U.escapeHtml(v.visitorEmail)})</option>`).join('')}</select></div>
              <div class="field"><label>Filter Tujuan</label><select id="tmSearchDest" class="select">${renderAirportOptions(corp.tmSearchDest, 'Semua Tujuan')}</select></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Maskapai</th><th>Rute</th><th class="num">Tarif</th><th class="num">Aksi</th></tr></thead>
                <tbody>
                  ${visFlights
                    .slice(0, 6)
                    .map(
                      (fl) => `
                    <tr>
                      <td><strong>${U.escapeHtml(fl.airline)}</strong><br><span class="mono" style="font-size:0.75rem;">${U.escapeHtml(fl.flightNumber)}</span></td>
                      <td>${U.escapeHtml(fl.origin)}→${U.escapeHtml(fl.destination)} (${U.escapeHtml(fl.date)})</td>
                      <td class="num">${U.formatMoney(fl.price, ui.currency)}</td>
                      <td class="num"><button type="button" class="btn btn-primary btn-sm" data-tm-book-visitor="${U.escapeHtml(fl.flightId)}">Pesan &amp; Kirim</button></td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <h3 class="panel-title">Akun Pengunjung &amp; Inbox E-Tiket Email</h3>
            <div class="field mt-1 mb-1">
              <label>Lihat Akun Pengunjung</label>
              <select id="tmVisPreviewSelect" class="select">${appState.visitors.map((v) => `<option value="${U.escapeHtml(v.visitorId)}" ${v.visitorId === previewVis.visitorId ? 'selected' : ''}>${U.escapeHtml(v.visitorName)} — ${U.escapeHtml(v.visitorEmail)}</option>`).join('')}</select>
            </div>
            <h4 style="margin:0.5rem 0;">Tiket Terpesan (${visTickets.length})</h4>
            ${visTickets.map((t) => `<div style="padding:0.5rem;border:1px solid var(--border-hairline);border-radius:var(--radius-sm);margin-bottom:0.4rem;font-size:0.84rem;"><strong>${U.escapeHtml(t.bookingReference)}</strong> · ${U.escapeHtml(t.airline)} ${U.escapeHtml(t.flightNumber)} (${U.escapeHtml(t.origin)}→${U.escapeHtml(t.destination)}) ${U.statusBadge(t.status)}</div>`).join('') || '<div style="color:var(--ink-muted);font-size:0.84rem;">Belum ada tiket.</div>'}
            <h4 style="margin:0.85rem 0 0.5rem;">Kotak Masuk Email (${visEmails.length})</h4>
            ${visEmails.map((em) => `<div style="padding:0.55rem;background:var(--bg-paper);border-radius:var(--radius-sm);margin-bottom:0.4rem;font-size:0.82rem;"><strong>${U.escapeHtml(em.subject)}</strong><div style="color:var(--ink-muted);">Ke: ${U.escapeHtml(em.recipientEmail)} · ${U.statusBadge(em.deliveryStatus)}</div></div>`).join('') || '<div style="color:var(--ink-muted);font-size:0.84rem;">Belum ada email.</div>'}
          </div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="panel" style="max-width:640px;">
          <h3 class="panel-title">Otorisasi Tiket via Booking Reference (PNR)</h3>
          <p class="panel-desc mb-1">Masukkan kode booking reference untuk memverifikasi dan mengotorisasi tiket perjalanan.</p>
          <form id="formTmAuth" style="display:flex;gap:0.65rem;align-items:flex-end;flex-wrap:wrap;">
            <div class="field" style="flex:1;min-width:220px;">
              <label for="tmAuthInput">Booking Reference</label>
              <input id="tmAuthInput" class="input mono" placeholder="Contoh: HLM-BOOK02" value="${U.escapeHtml(corp.authCodeInput)}">
            </div>
            <button type="submit" class="btn btn-primary">Verifikasi &amp; Otorisasi</button>
          </form>
          ${
            corp.authResult
              ? `<div class="banner mt-2 ${corp.authResult.authorized ? 'banner-success' : 'banner-danger'}">
                  <div>
                    <strong>${U.escapeHtml(corp.authResult.authorized ? 'Otorisasi Berhasil' : 'Otorisasi Gagal')}</strong><br>
                    <span>${U.escapeHtml(corp.authResult.message)}</span>
                  </div>
                </div>`
              : ''
          }
        </div>
      `;
    }

    return `
      <div class="container">
        <div class="section-header" style="margin-top:0;">
          <div>
            <h1 class="section-title">Corporate Travel &amp; HR Leave Operations</h1>
            <p class="section-sub">Manajemen jadwal cuti pegawai, pemantauan reservasi tamu korporat, serta otorisasi tiket perjalanan.</p>
          </div>
        </div>
        <div class="segmented mb-2">
          <button type="button" class="seg-btn ${corp.subtab === 'hr' ? 'active' : ''}" data-corp-tab="hr">Manajemen Cuti HR</button>
          <button type="button" class="seg-btn ${corp.subtab === 'tm_status' ? 'active' : ''}" data-corp-tab="tm_status">Monitor Booking</button>
          <button type="button" class="seg-btn ${corp.subtab === 'tm_visitor' ? 'active' : ''}" data-corp-tab="tm_visitor">Travel Pengunjung &amp; E-Tiket</button>
          <button type="button" class="seg-btn ${corp.subtab === 'tm_auth' ? 'active' : ''}" data-corp-tab="tm_auth">Otorisasi PNR</button>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  // ==========================================================================
  // RENDER & EVENT BINDING
  // ==========================================================================
  function renderApp() {
    if (!appState) return;
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === ui.activeView);
    });

    const root = document.getElementById('appRoot');
    if (ui.activeView === 'flights') root.innerHTML = renderFlightsView();
    else if (ui.activeView === 'airports') root.innerHTML = renderAirportsView();
    else if (ui.activeView === 'trips') root.innerHTML = renderTripsView();
    else if (ui.activeView === 'club') root.innerHTML = renderClubView();
    else if (ui.activeView === 'corporate') root.innerHTML = renderCorporateView();

    bindDynamicEvents();
  }

  function bindDynamicEvents() {
    // Airport modal triggers (photos & map nodes)
    document.querySelectorAll('[data-open-airport]').forEach((el) => {
      el.addEventListener('click', () => {
        const code = el.dataset.openAirport;
        C.openAirportModal(
          code,
          appState,
          ui.currency,
          (flight) => C.openCheckoutWizard(flight, appState, ui.currency, async (booking) => {
            await refreshState();
            C.openBoardingPassModal(booking.bookingReference, ui.currency);
          }),
          (destCode) => {
            ui.activeView = 'flights';
            ui.flights.tripMode = 'single';
            ui.flights.origin = '';
            ui.flights.destination = destCode;
            ui.flights.date = '';
            renderApp();
          }
        );
      });
    });

    // View jump buttons
    document.querySelectorAll('[data-view-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.activeView = btn.dataset.viewJump;
        renderApp();
      });
    });

    // Flights view events
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
    if (fltSort) fltSort.addEventListener('change', () => { ui.flights.sortBy = fltSort.value; renderApp(); });

    const btnResetFilters = document.getElementById('btnResetFlightFilters');
    const btnShowAllFlights = document.getElementById('btnShowAllFlights');
    [btnResetFilters, btnShowAllFlights].forEach((b) => {
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
      btn.addEventListener('click', () => {
        const fl = appState.flights.find((x) => x.flightId === btn.dataset.bookFlight);
        if (!fl) return;
        C.openCheckoutWizard(fl, appState, ui.currency, async (booking) => {
          await refreshState();
          C.openBoardingPassModal(booking.bookingReference, ui.currency);
        });
      });
    });

    // Airports view events
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
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }

    // Trips view events
    document.querySelectorAll('[data-trip-status]').forEach((btn) => {
      btn.addEventListener('click', () => { ui.trips.statusFilter = btn.dataset.tripStatus; renderApp(); });
    });
    const tripSearch = document.getElementById('tripSearchInput');
    if (tripSearch) {
      tripSearch.addEventListener('input', () => {
        ui.trips.searchQuery = tripSearch.value;
        renderApp();
        const el = document.getElementById('tripSearchInput');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }
    document.querySelectorAll('[data-pay-booking]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await Api.payBooking(btn.dataset.payBooking, { currency: ui.currency });
          U.showToast('Pembayaran berhasil dikonfirmasi! E-Tiket aktif.');
          await refreshState();
        } catch (err) {
          U.showToast(err.message);
        }
      });
    });
    document.querySelectorAll('[data-cancel-booking]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await Api.cancelBooking(btn.dataset.cancelBooking);
          U.showToast('Reservasi berhasil dibatalkan.');
          await refreshState();
        } catch (err) {
          U.showToast(err.message);
        }
      });
    });
    document.querySelectorAll('[data-view-bp]').forEach((btn) => {
      btn.addEventListener('click', () => C.openBoardingPassModal(btn.dataset.viewBp, ui.currency));
    });

    // Frequent Flyer Club events
    const clubMemSel = document.getElementById('clubMemberSelect');
    if (clubMemSel) clubMemSel.addEventListener('change', () => { ui.club.activeMemberId = clubMemSel.value; ui.club.validationResult = null; renderApp(); });
    document.querySelectorAll('[data-club-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { ui.club.subtab = btn.dataset.clubTab; renderApp(); });
    });
    document.querySelectorAll('.club-leg-origin').forEach((el) => el.addEventListener('change', () => { ui.club.legs[Number(el.dataset.idx)].origin = el.value; }));
    document.querySelectorAll('.club-leg-dest').forEach((el) => el.addEventListener('change', () => { ui.club.legs[Number(el.dataset.idx)].destination = el.value; }));
    document.querySelectorAll('.club-leg-date').forEach((el) => el.addEventListener('change', () => { ui.club.legs[Number(el.dataset.idx)].date = el.value; }));
    const btnAddLeg = document.getElementById('btnClubAddLeg');
    if (btnAddLeg) btnAddLeg.addEventListener('click', () => { ui.club.legs.push({ origin: 'CGK', destination: 'SIN', date: '2026-11-20' }); renderApp(); });
    document.querySelectorAll('[data-club-del-leg]').forEach((btn) => btn.addEventListener('click', () => { ui.club.legs.splice(Number(btn.dataset.clubDelLeg), 1); renderApp(); }));
    const btnSearchMulti = document.getElementById('btnClubSearchMulti');
    if (btnSearchMulti) {
      btnSearchMulti.addEventListener('click', async () => {
        try {
          ui.club.multiResult = await Api.searchMultiCity(ui.club.legs);
          renderApp();
        } catch (err) { U.showToast(err.message); }
      });
    }

    const clubCmpOrig = document.getElementById('clubCmpOrig');
    const clubCmpDest = document.getElementById('clubCmpDest');
    const clubCmpDate = document.getElementById('clubCmpDate');
    const clubCmpTime = document.getElementById('clubCmpTime');
    [clubCmpOrig, clubCmpDest, clubCmpDate, clubCmpTime].forEach((el) => {
      if (el) el.addEventListener('change', () => {
        ui.club.compareOrigin = clubCmpOrig.value;
        ui.club.compareDest = clubCmpDest.value;
        ui.club.compareDate = clubCmpDate.value;
        ui.club.compareTime = clubCmpTime.value;
        renderApp();
      });
    });
    document.querySelectorAll('[data-club-book]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await Api.bookFtFlight({ memberId: ui.club.activeMemberId, flightId: btn.dataset.clubBook });
          U.showToast(`Booking Member ${res.booking.bookingReference} dibuat (+${res.bookingPage.memberSummary.milesEarnedThisFlight} miles)`);
          await refreshState();
        } catch (err) { U.showToast(err.message); }
      });
    });

    const formFtProfile = document.getElementById('formFtProfile');
    if (formFtProfile) {
      formFtProfile.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Api.updateFtProfile(ui.club.activeMemberId, {
            fullName: document.getElementById('ftName').value,
            email: document.getElementById('ftEmail').value,
            phone: document.getElementById('ftPhone').value,
            identityNumber: document.getElementById('ftIdNum').value,
            birthDate: document.getElementById('ftBirth').value,
            nationality: document.getElementById('ftNat').value,
            address: document.getElementById('ftAddr').value,
            frequentFlyerNumber: document.getElementById('ftFfn').value
          });
          U.showToast('Profil member berhasil diperbarui.');
          await refreshState();
        } catch (err) { U.showToast(err.message); }
      });
    }
    const btnFtValidate = document.getElementById('btnFtValidate');
    if (btnFtValidate) {
      btnFtValidate.addEventListener('click', async () => {
        try {
          ui.club.validationResult = await Api.validateFtTicket(ui.club.activeMemberId);
        } catch (err) {
          ui.club.validationResult = err.payload || { valid: false, message: err.message };
        }
        renderApp();
      });
    }

    // Corporate & HR Ops events
    document.querySelectorAll('[data-corp-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { ui.corporate.subtab = btn.dataset.corpTab; renderApp(); });
    });
    const hrDay = document.getElementById('hrDay');
    const hrMonth = document.getElementById('hrMonth');
    const hrYear = document.getElementById('hrYear');
    const hrStart = document.getElementById('hrStart');
    const hrEmpSel = document.getElementById('hrEmpSelect');
    [hrDay, hrMonth, hrYear, hrStart].forEach((el) => {
      if (el) el.addEventListener('change', () => {
        ui.corporate.hr.day = hrDay.value;
        ui.corporate.hr.month = hrMonth.value;
        ui.corporate.hr.year = hrYear.value;
        ui.corporate.hr.startDate = hrStart.value;
        renderApp();
      });
    });
    if (hrEmpSel) hrEmpSel.addEventListener('change', () => { ui.corporate.hr.selectedEmployeeId = hrEmpSel.value; renderApp(); });
    const btnHrReset = document.getElementById('btnHrReset');
    if (btnHrReset) btnHrReset.addEventListener('click', () => { ui.corporate.hr = { ...ui.corporate.hr, day: '', month: '', year: '2026', startDate: '', endDate: '' }; renderApp(); });

    const formCorpLeave = document.getElementById('formCorpLeave');
    if (formCorpLeave) {
      formCorpLeave.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Api.createLeave({
            employeeId: document.getElementById('newLvEmp').value,
            startDate: document.getElementById('newLvStart').value,
            endDate: document.getElementById('newLvEnd').value,
            reason: document.getElementById('newLvReason').value
          });
          U.showToast('Pengajuan cuti pegawai tersimpan.');
          await refreshState();
        } catch (err) { U.showToast(err.message); }
      });
    }

    document.querySelectorAll('[data-tm-status]').forEach((btn) => {
      btn.addEventListener('click', () => { ui.corporate.tmStatusFilter = btn.dataset.tmStatus; renderApp(); });
    });
    const tmVisSel = document.getElementById('tmVisitorSelect');
    const tmDestSel = document.getElementById('tmSearchDest');
    const tmVisPrevSel = document.getElementById('tmVisPreviewSelect');
    if (tmVisSel) tmVisSel.addEventListener('change', () => { ui.corporate.selectedVisitorId = tmVisSel.value; });
    if (tmDestSel) tmDestSel.addEventListener('change', () => { ui.corporate.tmSearchDest = tmDestSel.value; renderApp(); });
    if (tmVisPrevSel) tmVisPrevSel.addEventListener('change', () => { ui.corporate.visitorPreviewId = tmVisPrevSel.value; renderApp(); });

    document.querySelectorAll('[data-tm-book-visitor]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vis = appState.visitors.find((v) => v.visitorId === ui.corporate.selectedVisitorId);
        if (!vis) return;
        try {
          const res = await Api.bookVisitorFlight({ ...vis, flightId: btn.dataset.tmBookVisitor });
          ui.corporate.visitorPreviewId = vis.visitorId;
          U.showToast(`E-Tiket ${res.booking.bookingReference} dikirim ke ${vis.visitorEmail}`);
          await refreshState();
        } catch (err) { U.showToast(err.message); }
      });
    });

    const formTmAuth = document.getElementById('formTmAuth');
    if (formTmAuth) {
      formTmAuth.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('tmAuthInput').value;
        ui.corporate.authCodeInput = code;
        try {
          ui.corporate.authResult = await Api.authorizeBooking(code);
          await refreshState();
        } catch (err) {
          ui.corporate.authResult = err.payload || { authorized: false, message: err.message };
          renderApp();
        }
      });
    }
  }

  // Global topbar & modal delegation
  function initGlobalEvents() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.activeView = btn.dataset.view;
        renderApp();
      });
    });

    const brandHome = document.getElementById('brandHomeLink');
    if (brandHome) {
      brandHome.addEventListener('click', (e) => {
        e.preventDefault();
        ui.activeView = 'flights';
        renderApp();
      });
    }

    const currencySel = document.getElementById('currencySelect');
    if (currencySel) {
      currencySel.addEventListener('change', () => {
        ui.currency = currencySel.value;
        renderApp();
      });
    }

    const resetBtn = document.getElementById('btnResetDemo');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          await Api.resetDemo();
          U.showToast('Data berhasil di-reset ke kondisi awal.');
          await refreshState();
        } catch (err) {
          U.showToast(err.message);
        }
      });
    }

    const modalBackdrop = document.getElementById('modalBackdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop || e.target.closest('[data-close-modal]')) {
          C.closeModal();
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initGlobalEvents();
    try {
      await refreshState();
    } catch (err) {
      U.showToast('Gagal memuat data dari server: ' + err.message);
    }
  });
})();
