/* ============================================================================
   AEROLEAVE GLOBAL — DOMAIN & UI UTILITIES
   ============================================================================ */
window.AeroUtils = (() => {
  const CURRENCY_CONFIG = {
    IDR: { code: 'IDR', locale: 'id-ID', rate: 1, decimals: 0 },
    USD: { code: 'USD', locale: 'en-US', rate: 1 / 15800, decimals: 0 },
    SGD: { code: 'SGD', locale: 'en-SG', rate: 1 / 11800, decimals: 0 },
    JPY: { code: 'JPY', locale: 'ja-JP', rate: 1 / 104, decimals: 0 },
    EUR: { code: 'EUR', locale: 'de-DE', rate: 1 / 16900, decimals: 0 },
    GBP: { code: 'GBP', locale: 'en-GB', rate: 1 / 20100, decimals: 0 },
    AUD: { code: 'AUD', locale: 'en-AU', rate: 1 / 10400, decimals: 0 }
  };

  const AIRLINE_COLORS = {
    SQ: '#1d3661',
    GA: '#006a99',
    NH: '#004098',
    EK: '#c8102e',
    QR: '#5c0632',
    KE: '#00256c',
    QF: '#e40000',
    MH: '#003876',
    ID: '#8b1d41',
    QG: '#008b47',
    JT: '#c8102e'
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(amountIDR, currencyCode = 'IDR') {
    const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR;
    const converted = (Number(amountIDR) || 0) * cfg.rate;
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code,
      maximumFractionDigits: cfg.decimals
    }).format(converted);
  }

  function formatDuration(minutes) {
    const m = Number(minutes) || 0;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}j ${rem}m`;
  }

  function getAirportLocalTime(timezone) {
    if (!timezone) return '--:--';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date());
    } catch (_) {
      return '--:--';
    }
  }

  function getAirlineColor(code) {
    return AIRLINE_COLORS[String(code || '').toUpperCase()] || '#162e61';
  }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'confirmed' || s === 'approved' || s === 'delivered') {
      return `<span class="badge badge-confirmed">${escapeHtml(status)}</span>`;
    }
    if (s === 'booked' || s === 'pending') {
      return `<span class="badge badge-booked">${escapeHtml(status)}</span>`;
    }
    if (s === 'waiting for the payment') {
      return `<span class="badge badge-waiting">${escapeHtml(status)}</span>`;
    }
    return `<span class="badge badge-danger">${escapeHtml(status)}</span>`;
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function handleAirportImgError(imgEl, code, city) {
    if (!imgEl || !imgEl.parentNode) return;
    const fallback = document.createElement('div');
    fallback.className = 'airport-fallback-art';
    fallback.innerHTML = `<div style="font-size:1.35rem;font-weight:800;letter-spacing:0.06em;">${escapeHtml(code)}</div><div style="font-size:0.75rem;opacity:0.8;">${escapeHtml(city)}</div>`;
    imgEl.replaceWith(fallback);
  }

  function buildQrSvg(text, size = 128) {
    const grid = 21;
    let hash = 2166136261;
    const str = String(text || 'AEROLEAVE');
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const isFinder = (r, c) =>
      (r < 7 && c < 7) || (r < 7 && c >= grid - 7) || (r >= grid - 7 && c < 7);

    const finderCell = (r, c, ox, oy) => {
      const lr = r - ox;
      const lc = c - oy;
      if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
      if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
      return false;
    };

    const cellSize = size / grid;
    let rects = '';
    for (let r = 0; r < grid; r += 1) {
      for (let c = 0; c < grid; c += 1) {
        let on = false;
        if (r < 7 && c < 7) on = finderCell(r, c, 0, 0);
        else if (r < 7 && c >= grid - 7) on = finderCell(r, c, 0, grid - 7);
        else if (r >= grid - 7 && c < 7) on = finderCell(r, c, grid - 7, 0);
        else if (!isFinder(r, c)) {
          const seed = Math.imul(hash ^ (r * 31 + c * 17), 2654435761) >>> 0;
          on = (seed & 3) === 0 || (seed & 7) === 3;
        }
        if (on) {
          rects += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#081226"/>`;
        }
      }
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Boarding Pass"><rect width="${size}" height="${size}" fill="#ffffff"/>${rects}</svg>`;
  }

  return {
    CURRENCY_CONFIG,
    escapeHtml,
    formatMoney,
    formatDuration,
    getAirportLocalTime,
    getAirlineColor,
    statusBadge,
    showToast,
    handleAirportImgError,
    buildQrSvg
  };
})();
