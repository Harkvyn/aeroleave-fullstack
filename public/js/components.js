/* ============================================================================
   AEROLEAVE GLOBAL — INTERACTIVE COMPONENTS & MODALS
   ============================================================================ */
window.AeroComponents = (() => {
  const U = window.AeroUtils;
  const Api = window.AeroApi;

  function openModal(html) {
    const backdrop = document.getElementById('modalBackdrop');
    const container = document.getElementById('modalContainer');
    container.innerHTML = html;
    backdrop.classList.remove('hidden');
  }

  function closeModal() {
    const backdrop = document.getElementById('modalBackdrop');
    const container = document.getElementById('modalContainer');
    backdrop.classList.add('hidden');
    container.innerHTML = '';
  }

  function renderAirportCard(airport, flights, currency) {
    const inbound = flights.filter((f) => f.destination === airport.code && f.seatsAvailable > 0);
    const outbound = flights.filter((f) => f.origin === airport.code && f.seatsAvailable > 0);
    const minPrice = inbound.length > 0 ? Math.min(...inbound.map((f) => f.price)) : null;
    const localTime = U.getAirportLocalTime(airport.timezone);

    return `
      <article class="airport-card" data-open-airport="${U.escapeHtml(airport.code)}">
        <div class="airport-photo-box">
          <img
            src="${U.escapeHtml(airport.imageUrl)}"
            alt="${U.escapeHtml(airport.name)}"
            loading="lazy"
            onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(airport.code)}', '${U.escapeHtml(airport.city)}')"
          >
          <div class="airport-photo-overlay">
            <div class="airport-photo-top">
              <span class="iata-pill">${U.escapeHtml(airport.code)} · ${U.escapeHtml(airport.icao)}</span>
              <span class="airport-clock-pill">${U.escapeHtml(localTime)} ${U.escapeHtml(airport.utcLabel)}</span>
            </div>
            <div>
              <div style="font-weight:700;font-size:1.05rem;">${U.escapeHtml(airport.city)}, ${U.escapeHtml(airport.country)}</div>
              <div style="font-size:0.76rem;opacity:0.86;">${U.escapeHtml(airport.region)} · ${airport.terminals.length} Terminal</div>
            </div>
          </div>
        </div>
        <div class="airport-card-body">
          <h3>${U.escapeHtml(airport.name)}</h3>
          <p style="margin:0;font-size:0.82rem;color:var(--ink-secondary);">${U.escapeHtml(airport.heroCaption)}</p>
          <div class="amenity-row">
            ${airport.facilities.slice(0, 3).map((fac) => `<span class="amenity-chip">${U.escapeHtml(fac)}</span>`).join('')}
          </div>
          <div class="airport-card-footer">
            <span style="color:var(--ink-muted);">${outbound.length} keberangkatan · ${inbound.length} kedatangan</span>
            <strong style="color:var(--accent-cobalt);">${minPrice ? 'Mulai ' + U.formatMoney(minPrice, currency) : 'Lihat Terminal →'}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function projectCoords(lat, lng, width = 920, height = 380) {
    // Fokus proyeksi wilayah Eropa-Timur Tengah-Asia-Australia agar hub utama terlihat proporsional
    const minLng = -15;
    const maxLng = 165;
    const minLat = -45;
    const maxLat = 62;
    const x = ((lng - minLng) / (maxLng - minLng)) * (width - 80) + 40;
    const y = ((maxLat - lat) / (maxLat - minLat)) * (height - 60) + 30;
    return { x, y };
  }

  function renderWorldRouteMap(airports, flights, selectedCode = null) {
    const width = 920;
    const height = 380;
    const byCode = new Map(airports.map((a) => [a.code, a]));

    const routePairs = new Set();
    const arcs = [];
    for (const f of flights) {
      const key = [f.origin, f.destination].sort().join('-');
      if (routePairs.has(key)) continue;
      routePairs.add(key);
      const a1 = byCode.get(f.origin);
      const a2 = byCode.get(f.destination);
      if (!a1 || !a2) continue;
      const p1 = projectCoords(a1.coordinates.lat, a1.coordinates.lng, width, height);
      const p2 = projectCoords(a2.coordinates.lat, a2.coordinates.lng, width, height);
      const mx = (p1.x + p2.x) / 2;
      const my = Math.min(p1.y, p2.y) - Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.22;
      const isHighlighted = selectedCode && (f.origin === selectedCode || f.destination === selectedCode);
      arcs.push(
        `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" fill="none" stroke="${isHighlighted ? '#fbbf24' : '#60a5fa'}" stroke-width="${isHighlighted ? '2.2' : '1.2'}" stroke-opacity="${isHighlighted ? '0.92' : '0.42'}" stroke-dasharray="${f.isInternational ? 'none' : '4 3'}" />`
      );
    }

    const nodes = airports.map((a) => {
      const p = projectCoords(a.coordinates.lat, a.coordinates.lng, width, height);
      const active = selectedCode === a.code;
      return `
        <g class="map-airport-node" data-open-airport="${U.escapeHtml(a.code)}" style="cursor:pointer;">
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${active ? 7 : 4.8}" fill="${active ? '#fbbf24' : '#ffffff'}" stroke="#1b4ddb" stroke-width="2" />
          <text x="${(p.x + 8).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">${U.escapeHtml(a.code)}</text>
        </g>
      `;
    }).join('');

    // Grid garis lintang/bujur halus
    let gridLines = '';
    for (let gx = 80; gx < width; gx += 120) {
      gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${height}" stroke="rgba(255,255,255,0.06)" />`;
    }
    for (let gy = 60; gy < height; gy += 80) {
      gridLines += `<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="rgba(255,255,255,0.06)" />`;
    }

    return `
      <div class="network-map-wrap">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <strong style="font-size:0.95rem;">Peta Jaringan Rute Global &amp; Domestik</strong>
            <span style="font-size:0.78rem;color:#93c5fd;margin-left:0.5rem;">Klik kode bandara (CGK, SIN, HND, DXB, LHR, dll.) untuk melihat foto terminal &amp; jadwal FIDS</span>
          </div>
          <span class="mono" style="font-size:0.74rem;color:#cbd5e1;">Garis solid: Internasional · Putus-putus: Domestik</span>
        </div>
        <svg class="network-map-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          ${gridLines}
          ${arcs.join('')}
          ${nodes}
        </svg>
      </div>
    `;
  }

  async function openAirportModal(code, appState, currency, onBookFlight, onSearchToAirport) {
    const airport = (appState.airports || []).find((a) => a.code === code);
    if (!airport) return;
    const departures = appState.flights.filter((f) => f.origin === code && f.seatsAvailable > 0);
    const arrivals = appState.flights.filter((f) => f.destination === code && f.seatsAvailable > 0);
    const localTime = U.getAirportLocalTime(airport.timezone);

    openModal(`
      <div class="modal-head">
        <div>
          <span class="iata-pill">${U.escapeHtml(airport.code)} / ${U.escapeHtml(airport.icao)}</span>
          <strong id="modalTitle" style="margin-left:0.5rem;font-size:1.05rem;">${U.escapeHtml(airport.name)}</strong>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Tutup</button>
      </div>
      <div class="modal-body">
        <div class="airport-photo-box" style="height:230px;border-radius:var(--radius-md);margin-bottom:1.1rem;">
          <img
            src="${U.escapeHtml(airport.imageUrl)}"
            alt="${U.escapeHtml(airport.name)}"
            onerror="window.AeroUtils.handleAirportImgError(this, '${U.escapeHtml(airport.code)}', '${U.escapeHtml(airport.city)}')"
          >
          <div class="airport-photo-overlay">
            <div class="airport-photo-top">
              <span class="badge badge-intl">${U.escapeHtml(airport.region)}</span>
              <span class="airport-clock-pill">Waktu Lokal: ${U.escapeHtml(localTime)} (${U.escapeHtml(airport.utcLabel)})</span>
            </div>
            <div>
              <div style="font-size:1.35rem;font-weight:800;">${U.escapeHtml(airport.city)}, ${U.escapeHtml(airport.country)}</div>
              <div style="font-size:0.84rem;opacity:0.9;">${U.escapeHtml(airport.heroCaption)}</div>
            </div>
          </div>
        </div>

        <div class="grid-3 mb-2">
          <div class="panel" style="padding:0.85rem;">
            <div class="metric-label">Terminal (${airport.terminals.length})</div>
            <div style="font-size:0.85rem;margin-top:0.35rem;">${airport.terminals.map((t) => `<div>• ${U.escapeHtml(t)}</div>`).join('')}</div>
          </div>
          <div class="panel" style="padding:0.85rem;">
            <div class="metric-label">Lounges Eksekutif</div>
            <div style="font-size:0.85rem;margin-top:0.35rem;">${airport.lounges.map((l) => `<div>• ${U.escapeHtml(l)}</div>`).join('')}</div>
          </div>
          <div class="panel" style="padding:0.85rem;">
            <div class="metric-label">Fasilitas Utama</div>
            <div class="amenity-row" style="margin-top:0.35rem;">
              ${airport.facilities.map((fac) => `<span class="amenity-chip">${U.escapeHtml(fac)}</span>`).join('')}
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;flex-wrap:wrap;gap:0.5rem;">
          <h4 style="margin:0;color:var(--navy-900);">Papan Informasi Penerbangan (FIDS) — ${U.escapeHtml(airport.code)}</h4>
          <button type="button" class="btn btn-primary btn-sm" id="btnSearchDestFromAirport" data-code="${U.escapeHtml(airport.code)}">
            Cari Semua Tiket ke ${U.escapeHtml(airport.code)}
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
                    <td><strong>${U.escapeHtml(f.flightNumber)}</strong><br><span style="font-size:0.78rem;color:var(--ink-muted);">${U.escapeHtml(f.airline)}</span></td>
                    <td>${U.escapeHtml(f.origin)} → ${U.escapeHtml(f.destination)}<br><span style="font-size:0.76rem;color:var(--ink-muted);">${U.escapeHtml(f.date)}</span></td>
                    <td class="mono">${U.escapeHtml(f.departureTime)}–${U.escapeHtml(f.arrivalTime)}<br><span style="font-size:0.74rem;color:var(--ink-muted);">${U.escapeHtml(f.terminalOrigin || '-')} · Gate ${U.escapeHtml(f.gate || '-')}</span></td>
                    <td class="num"><strong>${U.formatMoney(f.price, currency)}</strong></td>
                    <td class="num">
                      <button type="button" class="btn btn-primary btn-sm" data-modal-book-flight="${U.escapeHtml(f.flightId)}">Pilih</button>
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
        const flight = appState.flights.find((fl) => fl.flightId === btn.dataset.modalBookFlight);
        closeModal();
        if (flight) onBookFlight(flight);
      });
    });
  }

  async function openCheckoutWizard(flight, appState, currency, onComplete) {
    let seatMapData;
    try {
      seatMapData = await Api.getSeatMap(flight.flightId);
    } catch (_) {
      seatMapData = {
        columns: ['A', 'B', 'C', '', 'D', 'E', 'F'],
        rows: [],
        fareTiers: [
          { id: 'Lite', label: 'Economy Lite', multiplier: 0.92, perks: ['7 kg Kabin', 'Non-refundable'] },
          { id: 'Standard', label: 'Standard Value', multiplier: 1.0, perks: ['Bagasi Penuh', 'In-flight Meal'] },
          { id: 'Flex', label: 'Flex Plus', multiplier: 1.25, perks: ['+10 kg Bagasi', 'Free Reschedule'] }
        ]
      };
    }

    const firstFreeSeat =
      seatMapData.rows.flatMap((r) => r.seats).find((s) => !s.isAisle && !s.isOccupied)?.seatCode || '12A';

    const wizard = {
      step: 1,
      fareTier: 'Standard',
      passengerName: 'Farhan Akbar',
      passengerEmail: 'farhan.akbar@example.id',
      passengerPhone: '+6281234567890',
      identityNumber: 'A89201442',
      nationality: 'Indonesia',
      passengerCount: 1,
      specialRequest: '',
      seatNumber: firstFreeSeat,
      seatFee: 0,
      paymentMethod: 'International Card (Visa / Mastercard)',
      payAction: 'pay_now'
    };

    const renderStep = () => {
      const selectedTierObj =
        seatMapData.fareTiers.find((t) => t.id === wizard.fareTier) || seatMapData.fareTiers[1];
      const baseUnit = Math.round(flight.price * selectedTierObj.multiplier);
      const taxes = flight.isInternational ? 350000 : 125000;
      const totalIDR = (baseUnit + taxes + wizard.seatFee) * wizard.passengerCount;

      let stepBody = '';
      if (wizard.step === 1) {
        stepBody = `
          <h4 style="margin:0 0 0.75rem;">1. Pilih Paket Tarif (${U.escapeHtml(flight.cabinClass)})</h4>
          <div class="fare-grid">
            ${seatMapData.fareTiers
              .map((tier) => {
                const tierPrice = Math.round(flight.price * tier.multiplier);
                return `
                  <div class="fare-card ${wizard.fareTier === tier.id ? 'selected' : ''}" data-pick-tier="${U.escapeHtml(tier.id)}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <strong>${U.escapeHtml(tier.label)}</strong>
                      ${tier.id === 'Standard' ? '<span class="badge badge-booked">Populer</span>' : ''}
                    </div>
                    <div style="font-size:1.2rem;font-weight:800;color:var(--navy-900);margin:0.45rem 0;">
                      ${U.formatMoney(tierPrice, currency)}
                    </div>
                    <ul style="margin:0.4rem 0 0;padding-left:1.1rem;font-size:0.8rem;color:var(--ink-secondary);">
                      ${tier.perks.map((p) => `<li>${U.escapeHtml(p)}</li>`).join('')}
                    </ul>
                  </div>`;
              })
              .join('')}
          </div>
        `;
      } else if (wizard.step === 2) {
        stepBody = `
          <h4 style="margin:0 0 0.75rem;">2. Data Penumpang &amp; Dokumen Perjalanan</h4>
          <div class="grid-2">
            <div class="field">
              <label for="wizName">Nama Lengkap (Sesuai Paspor / KTP)</label>
              <input class="input" id="wizName" value="${U.escapeHtml(wizard.passengerName)}" required>
            </div>
            <div class="field">
              <label for="wizEmail">Email Pengiriman E-Tiket</label>
              <input class="input" type="email" id="wizEmail" value="${U.escapeHtml(wizard.passengerEmail)}" required>
            </div>
            <div class="field">
              <label for="wizPhone">Nomor Telepon / WhatsApp</label>
              <input class="input" id="wizPhone" value="${U.escapeHtml(wizard.passengerPhone)}">
            </div>
            <div class="field">
              <label for="wizIdNum">${flight.isInternational ? 'Nomor Paspor' : 'Nomor NIK / Paspor'}</label>
              <input class="input" id="wizIdNum" value="${U.escapeHtml(wizard.identityNumber)}" required>
            </div>
            <div class="field">
              <label for="wizNat">Kewarganegaraan</label>
              <input class="input" id="wizNat" value="${U.escapeHtml(wizard.nationality)}">
            </div>
            <div class="field">
              <label for="wizPaxCount">Jumlah Penumpang</label>
              <select class="select" id="wizPaxCount">
                ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${wizard.passengerCount === n ? 'selected' : ''}>${n} Penumpang</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field mt-1">
            <label for="wizReq">Permintaan Khusus (Opsional)</label>
            <input class="input" id="wizReq" placeholder="Contoh: Halal Meal, Window Seat, Wheelchair Assistance" value="${U.escapeHtml(wizard.specialRequest)}">
          </div>
        `;
      } else if (wizard.step === 3) {
        stepBody = `
          <h4 style="margin:0 0 0.4rem;">3. Pilih Kursi Kabin (${U.escapeHtml(flight.aircraft || flight.cabinClass)})</h4>
          <p style="margin:0 0 0.9rem;font-size:0.83rem;color:var(--ink-secondary);">
            Kursi terpilih: <strong class="mono">${U.escapeHtml(wizard.seatNumber)}</strong>
            ${wizard.seatFee > 0 ? `(+${U.formatMoney(wizard.seatFee, currency)} Extra Legroom)` : '(Gratis)'}
            · Kuning: Exit/Legroom · Abu-abu: Terisi
          </p>
          <div class="cabin-fuselage">
            <div style="text-align:center;font-size:0.72rem;font-family:var(--font-mono);color:var(--ink-muted);margin-bottom:0.75rem;">
              ▲ DEPAN PESAWAT (${U.escapeHtml(flight.cabinClass.toUpperCase())}) ▲
            </div>
            ${seatMapData.rows
              .map(
                (r) => `
              <div class="seat-row">
                <span class="seat-row-num">${r.row}</span>
                ${r.seats
                  .map((s) => {
                    if (s.isAisle) return '<span class="seat-aisle"></span>';
                    const cls = [
                      'seat-btn',
                      s.isOccupied ? 'occupied' : '',
                      s.isExtraLegroom && !s.isOccupied ? 'legroom' : '',
                      wizard.seatNumber === s.seatCode ? 'selected' : ''
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return `<button type="button" class="${cls}" ${s.isOccupied ? 'disabled' : ''} data-pick-seat="${U.escapeHtml(s.seatCode)}" data-seat-fee="${s.seatFee}">${U.escapeHtml(s.col)}</button>`;
                  })
                  .join('')}
              </div>`
              )
              .join('')}
          </div>
        `;
      } else {
        stepBody = `
          <h4 style="margin:0 0 0.75rem;">4. Pembayaran &amp; Konfirmasi Internasional</h4>
          <div class="grid-2">
            <div class="panel" style="background:var(--bg-paper);">
              <div class="metric-label">Ringkasan Penerbangan</div>
              <div style="font-weight:700;margin-top:0.35rem;">${U.escapeHtml(flight.airline)} (${U.escapeHtml(flight.flightNumber)})</div>
              <div class="mono" style="font-size:0.84rem;margin-top:0.2rem;">${U.escapeHtml(flight.origin)} → ${U.escapeHtml(flight.destination)} · ${U.escapeHtml(flight.date)}</div>
              <div style="font-size:0.84rem;color:var(--ink-secondary);margin-top:0.2rem;">Penumpang: ${U.escapeHtml(wizard.passengerName)} (${wizard.passengerCount}x) · Kursi ${U.escapeHtml(wizard.seatNumber)}</div>
              <hr style="border:none;border-top:1px solid var(--border-hairline);margin:0.75rem 0;">
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span>Tarif Dasar (${U.escapeHtml(wizard.fareTier)})</span><span>${U.formatMoney(baseUnit * wizard.passengerCount, currency)}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-top:0.25rem;"><span>Pajak Bandara &amp; PSC</span><span>${U.formatMoney(taxes * wizard.passengerCount, currency)}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-top:0.25rem;"><span>Biaya Kursi</span><span>${U.formatMoney(wizard.seatFee * wizard.passengerCount, currency)}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.08rem;color:var(--navy-900);margin-top:0.6rem;padding-top:0.5rem;border-top:1px solid var(--border-strong);">
                <span>Total</span><span>${U.formatMoney(totalIDR, currency)}</span>
              </div>
            </div>
            <div>
              <div class="field mb-1">
                <label for="wizPayMethod">Metode Pembayaran</label>
                <select class="select" id="wizPayMethod">
                  <option value="International Card (Visa / Mastercard)">Kartu Kredit / Debit Internasional (Visa / Mastercard)</option>
                  <option value="Apple Pay / Google Pay">Apple Pay / Google Pay</option>
                  <option value="QRIS / Virtual Account Bank">QRIS / Virtual Account Bank Indonesia</option>
                  <option value="Corporate Travel Billing">Corporate Travel Billing (Approval Travel Manager)</option>
                </select>
              </div>
              <div class="field">
                <label for="wizPayAction">Status Transaksi</label>
                <select class="select" id="wizPayAction">
                  <option value="pay_now" ${wizard.payAction === 'pay_now' ? 'selected' : ''}>Bayar Sekarang (Terbitkan E-Tiket Confirmed)</option>
                  <option value="hold" ${wizard.payAction === 'hold' ? 'selected' : ''}>Simpan Reservasi (Waiting for the Payment)</option>
                </select>
              </div>
            </div>
          </div>
        `;
      }

      openModal(`
        <div class="modal-head">
          <div>
            <strong id="modalTitle">${U.escapeHtml(flight.airline)} ${U.escapeHtml(flight.flightNumber)} · ${U.escapeHtml(flight.origin)} → ${U.escapeHtml(flight.destination)}</strong>
            <div style="font-size:0.78rem;color:var(--ink-muted);">${U.escapeHtml(flight.date)} · ${U.escapeHtml(flight.departureTime)}–${U.escapeHtml(flight.arrivalTime)} · ${U.escapeHtml(flight.terminalOrigin || '')}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Batal</button>
        </div>
        <div class="modal-body">
          <div class="stepper">
            <div class="step-pill ${wizard.step === 1 ? 'active' : wizard.step > 1 ? 'done' : ''}">1. Paket Tarif</div>
            <div class="step-pill ${wizard.step === 2 ? 'active' : wizard.step > 2 ? 'done' : ''}">2. Penumpang</div>
            <div class="step-pill ${wizard.step === 3 ? 'active' : wizard.step > 3 ? 'done' : ''}">3. Pilih Kursi</div>
            <div class="step-pill ${wizard.step === 4 ? 'active' : ''}">4. Pembayaran</div>
          </div>
          ${stepBody}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-hairline);">
            <div>
              <span style="font-size:0.78rem;color:var(--ink-muted);">Estimasi Total:</span>
              <strong style="font-size:1.15rem;color:var(--navy-900);margin-left:0.35rem;">${U.formatMoney(totalIDR, currency)}</strong>
            </div>
            <div style="display:flex;gap:0.5rem;">
              ${wizard.step > 1 ? '<button type="button" class="btn btn-secondary" id="btnWizPrev">← Kembali</button>' : ''}
              ${
                wizard.step < 4
                  ? '<button type="button" class="btn btn-primary" id="btnWizNext">Lanjutkan →</button>'
                  : '<button type="button" class="btn btn-navy" id="btnWizSubmit">Konfirmasi &amp; Terbitkan Tiket</button>'
              }
            </div>
          </div>
        </div>
      `);

      // Bind step interactions
      document.querySelectorAll('[data-pick-tier]').forEach((el) => {
        el.addEventListener('click', () => {
          wizard.fareTier = el.dataset.pickTier;
          renderStep();
        });
      });

      document.querySelectorAll('[data-pick-seat]').forEach((el) => {
        el.addEventListener('click', () => {
          wizard.seatNumber = el.dataset.pickSeat;
          wizard.seatFee = Number(el.dataset.seatFee || 0);
          renderStep();
        });
      });

      const prevBtn = document.getElementById('btnWizPrev');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          saveStep2Inputs();
          wizard.step -= 1;
          renderStep();
        });
      }

      const nextBtn = document.getElementById('btnWizNext');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (wizard.step === 2) {
            saveStep2Inputs();
            if (!wizard.passengerName.trim()) {
              U.showToast('Nama penumpang wajib diisi');
              return;
            }
          }
          wizard.step += 1;
          renderStep();
        });
      }

      const submitBtn = document.getElementById('btnWizSubmit');
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const pmEl = document.getElementById('wizPayMethod');
          const paEl = document.getElementById('wizPayAction');
          if (pmEl) wizard.paymentMethod = pmEl.value;
          if (paEl) wizard.payAction = paEl.value;

          submitBtn.disabled = true;
          submitBtn.textContent = 'Memproses...';
          try {
            const payload = {
              passengerName: wizard.passengerName.trim(),
              passengerEmail: wizard.passengerEmail.trim(),
              passengerPhone: wizard.passengerPhone.trim(),
              identityNumber: wizard.identityNumber.trim(),
              nationality: wizard.nationality.trim(),
              passengerCount: wizard.passengerCount,
              specialRequest: wizard.specialRequest.trim(),
              flightId: flight.flightId,
              fareTier: wizard.fareTier,
              seatNumber: wizard.seatNumber,
              seatFee: wizard.seatFee,
              paymentMethod: wizard.payAction === 'pay_now' ? wizard.paymentMethod : null,
              status: wizard.payAction === 'pay_now' ? 'confirmed' : 'waiting for the payment'
            };
            const res = await Api.createBooking(payload);
            closeModal();
            U.showToast(`Booking ${res.booking.bookingReference} berhasil dibuat!`);
            if (onComplete) await onComplete(res.booking);
          } catch (err) {
            U.showToast(err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Konfirmasi & Terbitkan Tiket';
          }
        });
      }
    };

    const saveStep2Inputs = () => {
      const n = document.getElementById('wizName');
      if (!n) return;
      wizard.passengerName = n.value;
      wizard.passengerEmail = document.getElementById('wizEmail').value;
      wizard.passengerPhone = document.getElementById('wizPhone').value;
      wizard.identityNumber = document.getElementById('wizIdNum').value;
      wizard.nationality = document.getElementById('wizNat').value;
      wizard.passengerCount = Number(document.getElementById('wizPaxCount').value) || 1;
      wizard.specialRequest = document.getElementById('wizReq').value;
    };

    renderStep();
  }

  async function openBoardingPassModal(bookingIdOrRef, currency) {
    try {
      const data = await Api.getBoardingPass(bookingIdOrRef);
      const b = data.booking;
      const oAir = data.originAirport;
      const dAir = data.destAirport;
      const qrSvg = U.buildQrSvg(data.qrPayload, 132);

      openModal(`
        <div class="modal-head no-print">
          <strong id="modalTitle">E-Tiket &amp; Boarding Pass Resmi — ${U.escapeHtml(b.bookingReference)}</strong>
          <div style="display:flex;gap:0.5rem;">
            <button type="button" class="btn btn-primary btn-sm" id="btnPrintBp">Cetak / Simpan PDF</button>
            <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Tutup</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="boarding-pass">
            <div class="bp-header">
              <div>
                <div style="font-family:var(--font-mono);font-size:0.75rem;opacity:0.82;">BOARDING PASS / E-TICKET</div>
                <div style="font-size:1.25rem;font-weight:800;">${U.escapeHtml(b.airline)} · ${U.escapeHtml(b.flightNumber)}</div>
              </div>
              <div style="text-align:right;">
                <div class="mono" style="font-size:1.05rem;font-weight:700;">PNR: ${U.escapeHtml(b.bookingReference)}</div>
                <div style="font-size:0.78rem;opacity:0.86;">${U.escapeHtml(b.eTicketNumber)}</div>
              </div>
            </div>
            <div class="bp-body">
              <div class="bp-main">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.1rem;">
                  <div>
                    <div class="mono" style="font-size:2rem;font-weight:800;color:var(--navy-900);line-height:1;">${U.escapeHtml(b.origin)}</div>
                    <div style="font-size:0.82rem;color:var(--ink-secondary);">${U.escapeHtml(oAir ? oAir.city : b.origin)}</div>
                    <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${U.escapeHtml(b.terminalOrigin || (oAir ? oAir.primaryTerminal : 'Terminal 3'))}</div>
                  </div>
                  <div style="flex:1;text-align:center;">
                    <div class="mono" style="font-size:0.8rem;color:var(--accent-cobalt);font-weight:700;">${U.escapeHtml(b.departureTime)} → ${U.escapeHtml(b.arrivalTime)}</div>
                    <div class="arc-line"></div>
                    <div style="font-size:0.76rem;color:var(--ink-muted);">${U.escapeHtml(b.date)} · ${U.escapeHtml(b.cabinClass)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="mono" style="font-size:2rem;font-weight:800;color:var(--navy-900);line-height:1;">${U.escapeHtml(b.destination)}</div>
                    <div style="font-size:0.82rem;color:var(--ink-secondary);">${U.escapeHtml(dAir ? dAir.city : b.destination)}</div>
                    <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);">${U.escapeHtml(dAir ? dAir.primaryTerminal : 'Arrival Terminal')}</div>
                  </div>
                </div>

                <div class="grid-4" style="background:var(--bg-paper);padding:0.8rem;border-radius:var(--radius-sm);">
                  <div><div class="metric-label">Penumpang</div><strong style="font-size:0.86rem;">${U.escapeHtml(b.passengerName)}</strong></div>
                  <div><div class="metric-label">Kursi</div><strong class="mono" style="font-size:1rem;color:var(--accent-cobalt);">${U.escapeHtml(b.seatNumber)}</strong></div>
                  <div><div class="metric-label">Gate</div><strong class="mono">${U.escapeHtml(b.gate || 'G12')}</strong></div>
                  <div><div class="metric-label">Status</div><div>${U.statusBadge(b.status)}</div></div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.9rem;font-size:0.8rem;color:var(--ink-secondary);">
                  <span>ID / Paspor: <span class="mono">${U.escapeHtml(b.identityNumber || '-')}</span> · Paket: <strong>${U.escapeHtml(b.fareTier || 'Standard')}</strong></span>
                  <strong>${U.formatMoney(b.price, currency)}</strong>
                </div>
              </div>
              <div class="bp-stub">
                ${qrSvg}
                <div class="mono" style="font-size:0.72rem;color:var(--ink-muted);word-break:break-all;">${U.escapeHtml(b.eTicketNumber)}</div>
                <span class="badge badge-confirmed">SIAP BOARDING</span>
              </div>
            </div>
          </div>
        </div>
      `);

      const printBtn = document.getElementById('btnPrintBp');
      if (printBtn) printBtn.addEventListener('click', () => window.print());
    } catch (err) {
      U.showToast(err.message);
    }
  }

  return {
    openModal,
    closeModal,
    renderAirportCard,
    renderWorldRouteMap,
    openAirportModal,
    openCheckoutWizard,
    openBoardingPassModal
  };
})();
