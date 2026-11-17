/* ============================================================================
   AEROLEAVE GLOBAL — VIEW 4: FREQUENT FLYER CLUB (US4, US5, US6)
   ============================================================================ */
import { Api } from '../api.js';
import {
  escapeHtml,
  formatMoney,
  formatDuration,
  matchesDepartureTimePreference,
  renderAirportOptions,
  showToast
} from '../utils.js';
import { getAppState, ui } from '../state.js';
import { openBoardingPassModal } from '../components/boardingPass.js';

function evaluateFtProfile(member) {
  const req = ['fullName', 'email', 'phone', 'identityNumber', 'birthDate', 'nationality', 'frequentFlyerNumber'];
  const missing = req.filter((k) => !member[k] || String(member[k]).trim() === '');
  return { isComplete: missing.length === 0, missing };
}

export function renderClubView() {
  const appState = getAppState();
  const user = appState.currentUser;

  if (!user || user.role !== 'frequent_traveller') {
    return `
      <div class="container">
        <div class="panel" style="text-align:center;padding:2.5rem;">
          <h2 class="section-title">Portal Khusus Anggota Frequent Flyer</h2>
          <p class="section-sub" style="margin:0.5rem auto 1.25rem;max-width:56ch;">
            Masuk sebagai <strong>Raka Mahendra (Platinum)</strong> atau <strong>Nadia Kusuma (Gold)</strong> untuk mengakses perencana Multi-City, komparasi miles, dan validasi profil paspor.
          </p>
          <button type="button" class="btn btn-primary" data-open-auth>Masuk sebagai Frequent Traveller</button>
        </div>
      </div>
    `;
  }

  const c = ui.club;
  const member =
    (appState.frequentTravellers || []).find((m) => m.memberId === user.memberId) ||
    (appState.frequentTravellers || [])[0];
  if (!member) {
    return '<div class="container"><div class="panel">Data member Frequent Traveller tidak ditemukan.</div></div>';
  }
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
            <div class="field"><label>Segmen ${idx + 1} Asal</label><select class="select club-leg-origin" data-idx="${idx}">${renderAirportOptions(appState.airports, leg.origin)}</select></div>
            <div class="field"><label>Tujuan</label><select class="select club-leg-dest" data-idx="${idx}">${renderAirportOptions(appState.airports, leg.destination)}</select></div>
            <div class="field"><label>Tanggal</label><input type="date" class="input club-leg-date" data-idx="${idx}" value="${escapeHtml(leg.date)}"></div>
            <div>${c.legs.length > 1 ? `<button type="button" class="btn btn-danger btn-sm" data-club-del-leg="${idx}">Hapus</button>` : ''}</div>
          </div>`
          )
          .join('')}
        <button type="button" class="btn btn-primary mt-1" id="btnClubSearchMulti">Cari &amp; Bandingkan Multi-City</button>

        ${
          c.multiResult
            ? `<div class="table-wrap mt-2">
                <table>
                  <thead><tr><th>Opsi Paket</th><th>Rute Segmen &amp; Maskapai</th><th class="num">Segmen</th><th class="num">Total Durasi</th><th class="num">Total Tarif</th></tr></thead>
                  <tbody>
                    ${
                      c.multiResult.multiDestinationItinerariesComparison.length === 0
                        ? '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);">Tidak ada kombinasi penuh untuk semua segmen tanggal tersebut.</td></tr>'
                        : c.multiResult.multiDestinationItinerariesComparison
                            .map((it, i) => {
                              const routeChain = (it.segments || []).map((s) => `${s.origin}→${s.destination} (${s.flightNumber})`).join(' · ');
                              return `
                            <tr>
                              <td><strong>${escapeHtml(it.itineraryOptionId)}</strong> ${i === 0 ? '<span class="badge badge-confirmed">Termurah</span>' : ''}</td>
                              <td>
                                <div class="mono" style="font-size:0.8rem;">${escapeHtml(routeChain)}</div>
                                <div style="font-size:0.75rem;color:var(--ink-muted);">${escapeHtml((it.airlines || []).join(', '))}</div>
                              </td>
                              <td class="num">${it.totalFlights}</td>
                              <td class="num">${formatDuration(it.totalDurationMinutes)}</td>
                              <td class="num"><strong>${formatMoney(it.totalPrice, ui.currency)}</strong></td>
                            </tr>`;
                            })
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
    const matched = (appState.flights || [])
      .filter((fl) => {
        const origOk = !c.compareOrigin || fl.origin === c.compareOrigin;
        const destOk = !c.compareDest || fl.destination === c.compareDest;
        const dateOk = !c.compareDate || fl.date === c.compareDate;
        const timeOk = matchesDepartureTimePreference(fl.departureTime, c.compareTime);
        return origOk && destOk && dateOk && timeOk && fl.seatsAvailable > 0;
      })
      .sort((a, b) => a.price - b.price);
    const minP = matched.length > 0 ? matched[0].price : 0;

    tabHtml = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Komparasi Tarif Member &amp; Perolehan Miles</h3>
            <p class="panel-desc">Bandingkan tarif berdasarkan rute, tanggal, serta jam preferensi (contoh: <code class="mono">08:00</code>, <code class="mono">pagi</code>, <code class="mono">07:00-10:00</code>).</p>
          </div>
        </div>
        <div class="grid-4 mb-2">
          <div class="field"><label for="clubCmpOrig">Asal</label><select id="clubCmpOrig" class="select">${renderAirportOptions(appState.airports, c.compareOrigin, 'Semua')}</select></div>
          <div class="field"><label for="clubCmpDest">Tujuan</label><select id="clubCmpDest" class="select">${renderAirportOptions(appState.airports, c.compareDest, 'Semua')}</select></div>
          <div class="field"><label for="clubCmpDate">Tanggal</label><input type="date" id="clubCmpDate" class="input" value="${escapeHtml(c.compareDate)}"></div>
          <div class="field"><label for="clubCmpTime">Jam Preferensi</label><input type="text" id="clubCmpTime" class="input" value="${escapeHtml(c.compareTime)}" placeholder="Semua / 08:00 / pagi"></div>
        </div>

        ${
          c.bookingConfirmation
            ? `<div class="banner banner-success">
                <div>
                  <strong>Konfirmasi Pemesanan Member: ${escapeHtml(c.bookingConfirmation.bookingReference)}</strong><br>
                  <span>${escapeHtml(c.bookingConfirmation.flightDetails.airline)} ${escapeHtml(c.bookingConfirmation.flightDetails.flightNumber)} (${escapeHtml(c.bookingConfirmation.flightDetails.route)}) · Kursi ${escapeHtml(c.bookingConfirmation.flightDetails.seatNumber)} · +${c.bookingConfirmation.memberSummary.milesEarnedThisFlight} Miles (Total: ${c.bookingConfirmation.memberSummary.updatedTotalPoints.toLocaleString('id-ID')} pts)</span>
                </div>
                <button type="button" class="btn btn-primary btn-sm" data-club-view-bp="${escapeHtml(c.bookingConfirmation.bookingReference)}">Lihat Boarding Pass</button>
              </div>`
            : ''
        }

        <div class="table-wrap">
          <table>
            <thead><tr><th>Maskapai</th><th>Rute &amp; Jam</th><th class="num">Miles</th><th class="num">Selisih Termurah</th><th class="num">Tarif</th><th class="num">Aksi</th></tr></thead>
            <tbody>
              ${matched
                .map(
                  (fl, idx) => `
                <tr>
                  <td><strong>${escapeHtml(fl.airline)}</strong> <span class="mono">${escapeHtml(fl.flightNumber)}</span> ${idx === 0 ? '<span class="badge badge-confirmed">Terhemat</span>' : ''}</td>
                  <td class="mono">${escapeHtml(fl.origin)}→${escapeHtml(fl.destination)} · ${escapeHtml(fl.date)} · ${escapeHtml(fl.departureTime)}</td>
                  <td class="num">+${Math.round(fl.price / 1000)} pts</td>
                  <td class="num">${idx === 0 ? 'Termurah' : '+' + formatMoney(fl.price - minP, ui.currency)}</td>
                  <td class="num"><strong>${formatMoney(fl.price, ui.currency)}</strong></td>
                  <td class="num"><button type="button" class="btn btn-primary btn-sm" data-club-book="${escapeHtml(fl.flightId)}">Pesan Member</button></td>
                </tr>`
                )
                .join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Tidak ada jadwal yang cocok dengan filter waktu/rute.</td></tr>'}
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
              <div class="field"><label for="ftName">Nama Lengkap</label><input class="input" id="ftName" value="${escapeHtml(member.fullName)}" required></div>
              <div class="field"><label for="ftEmail">Email</label><input class="input" id="ftEmail" value="${escapeHtml(member.email)}" required></div>
              <div class="field"><label for="ftPhone">Nomor Telepon</label><input class="input" id="ftPhone" value="${escapeHtml(member.phone)}" placeholder="+628..."></div>
              <div class="field"><label for="ftIdNum">Nomor KTP / Paspor</label><input class="input" id="ftIdNum" value="${escapeHtml(member.identityNumber)}" placeholder="Wajib diisi"></div>
              <div class="field"><label for="ftBirth">Tanggal Lahir</label><input type="date" class="input" id="ftBirth" value="${escapeHtml(member.birthDate)}"></div>
              <div class="field"><label for="ftNat">Kewarganegaraan</label><input class="input" id="ftNat" value="${escapeHtml(member.nationality)}"></div>
            </div>
            <div class="field mt-1"><label for="ftAddr">Alamat Domisili</label><input class="input" id="ftAddr" value="${escapeHtml(member.address)}"></div>
            <div class="field mt-1 mb-2"><label for="ftFfn">Nomor Frequent Flyer</label><input class="input mono" id="ftFfn" value="${escapeHtml(member.frequentFlyerNumber)}"></div>
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
                    <strong>${escapeHtml(c.validationResult.valid ? 'VALIDASI BERHASIL' : 'VALIDASI DITOLAK')}</strong><br>
                    <span>${escapeHtml(c.validationResult.message)}</span>
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
            <div class="mono" style="font-size:0.75rem;color:#93c5fd;">AEROLEAVE LOYALTY CLUB · ${escapeHtml(member.tier.toUpperCase())} TIER</div>
            <h1 style="margin:0.2rem 0;font-family:var(--font-display);font-size:2.1rem;font-weight:400;">${escapeHtml(member.fullName)}</h1>
            <div class="mono" style="font-size:0.84rem;opacity:0.86;">${escapeHtml(member.frequentFlyerNumber)} · ${member.points.toLocaleString('id-ID')} Miles</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-open-auth>Ganti Akun Member / Aktor</button>
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

export function bindClubEvents({ renderApp, refreshState }) {
  const appState = getAppState();
  const user = appState.currentUser;
  if (!user || user.role !== 'frequent_traveller') return;

  document.querySelectorAll('[data-club-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.club.subtab = btn.dataset.clubTab;
      renderApp();
    });
  });

  document.querySelectorAll('.club-leg-origin').forEach((el) =>
    el.addEventListener('change', () => {
      ui.club.legs[Number(el.dataset.idx)].origin = el.value;
    })
  );
  document.querySelectorAll('.club-leg-dest').forEach((el) =>
    el.addEventListener('change', () => {
      ui.club.legs[Number(el.dataset.idx)].destination = el.value;
    })
  );
  document.querySelectorAll('.club-leg-date').forEach((el) =>
    el.addEventListener('change', () => {
      ui.club.legs[Number(el.dataset.idx)].date = el.value;
    })
  );

  const btnAddLeg = document.getElementById('btnClubAddLeg');
  if (btnAddLeg) {
    btnAddLeg.addEventListener('click', () => {
      ui.club.legs.push({ origin: 'CGK', destination: 'SIN', date: '2026-11-20' });
      renderApp();
    });
  }

  document.querySelectorAll('[data-club-del-leg]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.club.legs.splice(Number(btn.dataset.clubDelLeg), 1);
      renderApp();
    })
  );

  const btnSearchMulti = document.getElementById('btnClubSearchMulti');
  if (btnSearchMulti) {
    btnSearchMulti.addEventListener('click', async () => {
      try {
        ui.club.multiResult = await Api.searchMultiCity(ui.club.legs);
        renderApp();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  const clubCmpOrig = document.getElementById('clubCmpOrig');
  const clubCmpDest = document.getElementById('clubCmpDest');
  const clubCmpDate = document.getElementById('clubCmpDate');
  const clubCmpTime = document.getElementById('clubCmpTime');
  const syncCompare = (refocusTime = false) => {
    if (clubCmpOrig) ui.club.compareOrigin = clubCmpOrig.value;
    if (clubCmpDest) ui.club.compareDest = clubCmpDest.value;
    if (clubCmpDate) ui.club.compareDate = clubCmpDate.value;
    if (clubCmpTime) ui.club.compareTime = clubCmpTime.value;
    renderApp();
    if (refocusTime) {
      const el = document.getElementById('clubCmpTime');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  };
  [clubCmpOrig, clubCmpDest, clubCmpDate].forEach((el) => {
    if (el) el.addEventListener('change', () => syncCompare(false));
  });
  if (clubCmpTime) {
    clubCmpTime.addEventListener('input', () => syncCompare(true));
  }

  document.querySelectorAll('[data-club-book]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await Api.bookFtFlight({ memberId: user.memberId, flightId: btn.dataset.clubBook });
        ui.club.bookingConfirmation = res.bookingPage;
        showToast(
          `Booking Member ${res.booking.bookingReference} dibuat (+${res.bookingPage.memberSummary.milesEarnedThisFlight} miles)`
        );
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll('[data-club-view-bp]').forEach((btn) => {
    btn.addEventListener('click', () => openBoardingPassModal(btn.dataset.clubViewBp, ui.currency));
  });

  const formFtProfile = document.getElementById('formFtProfile');
  if (formFtProfile) {
    formFtProfile.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.updateFtProfile(user.memberId, {
          fullName: document.getElementById('ftName').value,
          email: document.getElementById('ftEmail').value,
          phone: document.getElementById('ftPhone').value,
          identityNumber: document.getElementById('ftIdNum').value,
          birthDate: document.getElementById('ftBirth').value,
          nationality: document.getElementById('ftNat').value,
          address: document.getElementById('ftAddr').value,
          frequentFlyerNumber: document.getElementById('ftFfn').value
        });
        ui.club.validationResult = null;
        showToast('Profil member berhasil diperbarui.');
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  const btnFtValidate = document.getElementById('btnFtValidate');
  if (btnFtValidate) {
    btnFtValidate.addEventListener('click', async () => {
      try {
        ui.club.validationResult = await Api.validateFtTicket(user.memberId);
      } catch (err) {
        ui.club.validationResult = err.payload || { valid: false, message: err.message };
      }
      renderApp();
    });
  }
}
