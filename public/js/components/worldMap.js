/* ============================================================================
   AEROLEAVE GLOBAL — GEOGRAPHIC WORLD ROUTE MAP SVG
   ============================================================================ */
import { escapeHtml, getAirportLocalTime } from '../utils.js';

export function projectCoords(lat, lng, width = 920, height = 380) {
  const minLng = -15;
  const maxLng = 165;
  const minLat = -45;
  const maxLat = 62;
  const x = ((lng - minLng) / (maxLng - minLng)) * (width - 80) + 40;
  const y = ((maxLat - lat) / (maxLat - minLat)) * (height - 60) + 30;
  return { x, y };
}

const LANDMASS_POLYGONS = [
  // Great Britain & Ireland
  [[50.1, -5.6], [54.5, -5.8], [58.6, -5.0], [58.5, -2.5], [53.0, 1.5], [51.0, 1.4]],
  // Continental Europe
  [
    [36.1, -8.8], [43.5, -9.2], [48.7, -4.4], [51.5, 2.2], [54.2, 8.2],
    [59.8, 10.5], [60.8, 32.0], [55.0, 42.0], [45.0, 40.0], [41.0, 29.0],
    [38.0, 24.0], [40.2, 18.2], [44.5, 12.4], [43.4, 5.2], [41.3, 2.2], [36.5, -4.8]
  ],
  // Africa & Red Sea Rim
  [
    [35.8, -5.8], [37.0, 10.2], [31.5, 32.3], [12.0, 43.4], [11.8, 51.2],
    [-12.0, 40.5], [-26.0, 32.9], [-34.5, 20.0], [-34.0, 18.2], [-18.0, 11.8],
    [4.5, 9.5], [5.2, -4.0], [14.7, -15.0], [27.5, -13.2]
  ],
  // Arabian Peninsula & Levant
  [[37.2, 27.0], [38.8, 48.0], [30.0, 48.5], [25.2, 55.4], [22.4, 59.8], [12.8, 45.0], [12.7, 43.3], [30.0, 32.6]],
  // Mainland Asia (South, Southeast, East Asia & Korea)
  [
    [60.5, 40.0], [61.0, 142.0], [52.0, 141.0], [43.0, 134.0], [38.0, 128.5],
    [35.1, 129.0], [34.8, 126.2], [38.8, 121.6], [31.2, 121.8], [22.3, 114.2],
    [20.8, 106.7], [12.0, 109.2], [10.4, 104.2], [13.5, 100.6], [1.3, 103.9],
    [6.5, 100.1], [16.5, 97.6], [22.2, 91.8], [8.1, 77.5], [22.8, 69.0],
    [25.2, 62.0], [26.8, 56.5], [30.0, 49.0], [38.8, 48.0], [45.0, 40.0]
  ],
  // Japanese Archipelago
  [[31.5, 130.5], [34.2, 131.0], [35.6, 140.8], [41.5, 141.5], [44.8, 145.0], [43.0, 140.5], [37.5, 137.0], [34.4, 135.2], [33.0, 132.5]],
  // Sumatra & Java & Bali
  [[5.5, 95.3], [1.2, 102.5], [-5.8, 105.8], [-7.5, 114.4], [-8.8, 115.6], [-8.9, 114.0], [-7.8, 106.4], [-5.5, 104.2], [1.5, 98.5]],
  // Borneo
  [[6.8, 117.2], [1.1, 118.9], [-3.5, 116.1], [-3.4, 110.2], [1.8, 109.2]],
  // Sulawesi
  [[1.4, 121.0], [1.6, 125.2], [-5.4, 122.4], [-5.6, 119.4], [-1.0, 119.3]],
  // Australia
  [[-12.2, 130.8], [-11.0, 142.5], [-26.0, 153.2], [-37.6, 149.8], [-38.3, 141.2], [-32.2, 132.4], [-34.8, 115.0], [-21.8, 114.0], [-14.8, 125.5]]
];

function buildLandmassPaths(width, height) {
  return LANDMASS_POLYGONS.map((poly) => {
    const pts = poly.map(([lat, lng]) => {
      const p = projectCoords(lat, lng, width, height);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });
    return `<polygon points="${pts.join(' ')}" fill="rgba(148, 163, 184, 0.16)" stroke="rgba(148, 163, 184, 0.28)" stroke-width="1" stroke-linejoin="round" />`;
  }).join('');
}

export function renderWorldRouteMap(airports, flights, selectedCode = null) {
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
      `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" fill="none" stroke="${isHighlighted ? '#fbbf24' : '#60a5fa'}" stroke-width="${isHighlighted ? '2.4' : '1.15'}" stroke-opacity="${isHighlighted ? '0.95' : '0.38'}" stroke-dasharray="${f.isInternational ? 'none' : '4 3'}" />`
    );
  }

  const nodes = airports
    .map((a) => {
      const p = projectCoords(a.coordinates.lat, a.coordinates.lng, width, height);
      const active = selectedCode === a.code;
      return `
        <g class="map-airport-node" data-select-map-hub="${escapeHtml(a.code)}" style="cursor:pointer;">
          ${active ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="rgba(251, 191, 36, 0.24)" stroke="#fbbf24" stroke-width="1" />` : ''}
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${active ? 6.8 : 4.6}" fill="${active ? '#fbbf24' : '#ffffff'}" stroke="#1b4ddb" stroke-width="2" />
          <text x="${(p.x + 8).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" fill="${active ? '#fde68a' : '#e2e8f0'}" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">${escapeHtml(a.code)}</text>
        </g>
      `;
    })
    .join('');

  let gridLines = '';
  for (let gx = 80; gx < width; gx += 120) {
    gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${height}" stroke="rgba(255,255,255,0.05)" />`;
  }
  for (let gy = 60; gy < height; gy += 80) {
    gridLines += `<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="rgba(255,255,255,0.05)" />`;
  }

  const activeHub = selectedCode ? byCode.get(selectedCode) : null;
  const activeDepartures = activeHub
    ? flights.filter((f) => f.origin === activeHub.code && f.seatsAvailable > 0).length
    : 0;
  const activeArrivals = activeHub
    ? flights.filter((f) => f.destination === activeHub.code && f.seatsAvailable > 0).length
    : 0;

  return `
    <div class="network-map-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
        <div>
          <strong style="font-size:0.95rem;">Peta Jaringan Rute Global &amp; Domestik</strong>
          <span style="font-size:0.78rem;color:#93c5fd;margin-left:0.5rem;">Pilih hub untuk menyorot rute aktif, lalu buka detail terminal &amp; FIDS.</span>
        </div>
        <span class="mono" style="font-size:0.74rem;color:#cbd5e1;">Solid: Internasional · Putus-putus: Domestik</span>
      </div>

      <div class="hub-pill-bar">
        ${airports
          .map(
            (a) =>
              `<button type="button" class="hub-mini-pill ${selectedCode === a.code ? 'active' : ''}" data-select-map-hub="${escapeHtml(a.code)}">${escapeHtml(a.code)}</button>`
          )
          .join('')}
      </div>

      <svg class="network-map-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="margin-top:0.45rem;">
        ${gridLines}
        ${buildLandmassPaths(width, height)}
        ${arcs.join('')}
        ${nodes}
      </svg>

      ${
        activeHub
          ? `<div class="hub-selected-bar">
              <div>
                <div class="mono" style="font-size:0.74rem;color:#fbbf24;">HUB TERPILIH · ${escapeHtml(activeHub.code)} (${escapeHtml(activeHub.icao)}) · ${escapeHtml(getAirportLocalTime(activeHub.timezone))} ${escapeHtml(activeHub.utcLabel)}</div>
                <strong style="font-size:0.96rem;">${escapeHtml(activeHub.name)}</strong>
                <span style="font-size:0.82rem;color:#cbd5e1;margin-left:0.5rem;">${activeDepartures} keberangkatan · ${activeArrivals} kedatangan</span>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-open-airport="${escapeHtml(activeHub.code)}">
                Buka Panduan Terminal &amp; FIDS →
              </button>
            </div>`
          : ''
      }
    </div>
  `;
}
