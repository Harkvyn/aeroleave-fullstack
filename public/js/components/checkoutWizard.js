/* ============================================================================
   AEROLEAVE GLOBAL — MULTI-PASSENGER 4-STEP CHECKOUT & SEAT MAP WIZARD
   ============================================================================ */
import { Api } from '../api.js';
import { escapeHtml, formatMoney, showToast } from '../utils.js';
import { openModal, closeModal } from './modal.js';

export async function openCheckoutWizard(flight, appState, currency, onComplete, onRequireAuth) {
  const user = appState?.currentUser || null;
  if (!user) {
    showToast('Silakan masuk atau pilih akun (misal Visitor / Customer) untuk memesan tiket.');
    if (onRequireAuth) onRequireAuth();
    return;
  }

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

  const allSeats = seatMapData.rows.flatMap((r) => r.seats).filter((s) => !s.isAisle);
  const freeSeats = allSeats.filter((s) => !s.isOccupied);

  const ftProfile =
    user.memberId && Array.isArray(appState.frequentTravellers)
      ? appState.frequentTravellers.find((m) => m.memberId === user.memberId)
      : null;

  const visProfile =
    user.visitorId && Array.isArray(appState.visitors)
      ? appState.visitors.find((v) => v.visitorId === user.visitorId)
      : null;

  const isStaffDesk = user.role === 'employee' || user.role === 'travel_manager';

  const wizard = {
    step: 1,
    fareTier: 'Standard',
    bookingChannel: 'online', // 'online' | 'offline_desk'
    passengerEmail: ftProfile?.email || visProfile?.visitorEmail || user.email || '',
    passengerPhone: ftProfile?.phone || visProfile?.visitorPhone || '+6281234567890',
    passengerCount: 1,
    activePaxSlot: 0,
    passengers: [
      {
        fullName: ftProfile?.fullName || visProfile?.visitorName || user.fullName || '',
        identityNumber: ftProfile?.identityNumber || visProfile?.identityNumber || '3273010101970001',
        nationality: ftProfile?.nationality || 'Indonesia',
        seatNumber: freeSeats[0]?.seatCode || '',
        seatFee: freeSeats[0]?.seatFee || 0
      }
    ],
    specialRequest: '',
    paymentMethod: 'QRIS / Virtual Account Bank',
    payAction: 'pay_now'
  };

  const syncPassengerArrayLength = (nextCount) => {
    const clamped = Math.max(1, Math.min(4, Math.min(nextCount, flight.seatsAvailable || 4)));
    wizard.passengerCount = clamped;
    while (wizard.passengers.length < clamped) {
      const taken = new Set(wizard.passengers.map((p) => p.seatNumber));
      const nextFree = freeSeats.find((s) => !taken.has(s.seatCode));
      wizard.passengers.push({
        fullName: '',
        identityNumber: '',
        nationality: 'Indonesia',
        seatNumber: nextFree ? nextFree.seatCode : '',
        seatFee: nextFree ? nextFree.seatFee : 0
      });
    }
    if (wizard.passengers.length > clamped) {
      wizard.passengers = wizard.passengers.slice(0, clamped);
    }
    if (wizard.activePaxSlot >= clamped) {
      wizard.activePaxSlot = clamped - 1;
    }
  };

  const saveStep2Inputs = () => {
    const emailEl = document.getElementById('wizEmail');
    if (!emailEl) return;
    wizard.passengerEmail = emailEl.value;
    wizard.passengerPhone = document.getElementById('wizPhone')?.value || '';
    wizard.specialRequest = document.getElementById('wizReq')?.value || '';
    const chEl = document.getElementById('wizChannel');
    if (chEl) wizard.bookingChannel = chEl.value;
    wizard.passengers.forEach((p, idx) => {
      const nEl = document.getElementById(`wizPaxName-${idx}`);
      const idEl = document.getElementById(`wizPaxId-${idx}`);
      const natEl = document.getElementById(`wizPaxNat-${idx}`);
      if (nEl) p.fullName = nEl.value;
      if (idEl) p.identityNumber = idEl.value;
      if (natEl) p.nationality = natEl.value;
    });
  };

  const renderStep = () => {
    const selectedTierObj =
      seatMapData.fareTiers.find((t) => t.id === wizard.fareTier) || seatMapData.fareTiers[1];
    const baseUnit = Math.round(flight.price * selectedTierObj.multiplier);
    const taxes = flight.isInternational ? 350000 : 125000;
    const totalSeatFees = wizard.passengers.reduce((sum, p) => sum + (Number(p.seatFee) || 0), 0);
    const totalIDR = (baseUnit + taxes) * wizard.passengerCount + totalSeatFees;
    const maxSelectablePax = Math.min(4, Math.max(1, flight.seatsAvailable));

    let stepBody = '';
    if (wizard.step === 1) {
      stepBody = `
        <h4 style="margin:0 0 0.75rem;">1. Pilih Paket Tarif (${escapeHtml(flight.cabinClass)})</h4>
        <div class="fare-grid">
          ${seatMapData.fareTiers
            .map((tier) => {
              const tierPrice = Math.round(flight.price * tier.multiplier);
              return `
                <div class="fare-card ${wizard.fareTier === tier.id ? 'selected' : ''}" data-pick-tier="${escapeHtml(tier.id)}">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${escapeHtml(tier.label)}</strong>
                    ${tier.id === 'Standard' ? '<span class="badge badge-booked">Populer</span>' : ''}
                  </div>
                  <div style="font-size:1.2rem;font-weight:800;color:var(--navy-900);margin:0.45rem 0;">
                    ${formatMoney(tierPrice, currency)}
                  </div>
                  <ul style="margin:0.4rem 0 0;padding-left:1.1rem;font-size:0.8rem;color:var(--ink-secondary);">
                    ${tier.perks.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
                  </ul>
                </div>`;
            })
            .join('')}
        </div>
      `;
    } else if (wizard.step === 2) {
      stepBody = `
        <h4 style="margin:0 0 0.75rem;">2. Data Penumpang &amp; Dokumen Perjalanan (${wizard.passengerCount} Orang)</h4>
        <div class="grid-2 mb-1">
          ${
            isStaffDesk
              ? `<div class="field">
                  <label for="wizChannel">Kanal Pemesanan</label>
                  <select class="select" id="wizChannel">
                    <option value="online" ${wizard.bookingChannel === 'online' ? 'selected' : ''}>Pemesanan Akun Sendiri (Online)</option>
                    <option value="offline_desk" ${wizard.bookingChannel === 'offline_desk' ? 'selected' : ''}>Pesankan Pelanggan Offline (Loket Agen)</option>
                  </select>
                </div>`
              : ''
          }
          <div class="field">
            <label for="wizPaxCount">Jumlah Penumpang</label>
            <select class="select" id="wizPaxCount">
              ${Array.from({ length: maxSelectablePax }, (_, i) => i + 1)
                .map((n) => `<option value="${n}" ${wizard.passengerCount === n ? 'selected' : ''}>${n} Penumpang</option>`)
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="wizEmail">Email Pengiriman E-Tiket</label>
            <input class="input" type="email" id="wizEmail" value="${escapeHtml(wizard.passengerEmail)}" required>
          </div>
          <div class="field">
            <label for="wizPhone">Nomor Telepon / WhatsApp</label>
            <input class="input" id="wizPhone" value="${escapeHtml(wizard.passengerPhone)}">
          </div>
        </div>

        ${wizard.passengers
          .map(
            (p, idx) => `
          <div class="pax-row-card">
            <div style="font-size:0.78rem;font-weight:700;color:var(--navy-900);margin-bottom:0.45rem;">
              Penumpang ${idx + 1} ${idx === 0 ? '(Penumpang Utama)' : ''}
            </div>
            <div class="grid-3">
              <div class="field">
                <label for="wizPaxName-${idx}">Nama Lengkap</label>
                <input class="input" id="wizPaxName-${idx}" value="${escapeHtml(p.fullName)}" placeholder="Sesuai KTP / Paspor" required>
              </div>
              <div class="field">
                <label for="wizPaxId-${idx}">${flight.isInternational ? 'Nomor Paspor' : 'NIK / Paspor'}</label>
                <input class="input" id="wizPaxId-${idx}" value="${escapeHtml(p.identityNumber)}" placeholder="Nomor identitas">
              </div>
              <div class="field">
                <label for="wizPaxNat-${idx}">Kewarganegaraan</label>
                <input class="input" id="wizPaxNat-${idx}" value="${escapeHtml(p.nationality)}">
              </div>
            </div>
          </div>`
          )
          .join('')}

        <div class="field mt-1">
          <label for="wizReq">Permintaan Khusus (Opsional)</label>
          <input class="input" id="wizReq" placeholder="Contoh: Halal Meal, Window Seat, Wheelchair Assistance" value="${escapeHtml(wizard.specialRequest)}">
        </div>
      `;
    } else if (wizard.step === 3) {
      const selectedByPax = new Map();
      wizard.passengers.forEach((p, idx) => {
        if (p.seatNumber) selectedByPax.set(p.seatNumber, idx);
      });

      stepBody = `
        <h4 style="margin:0 0 0.45rem;">3. Pilih Kursi untuk ${wizard.passengerCount} Penumpang (${escapeHtml(flight.aircraft || flight.cabinClass)})</h4>
        <p style="margin:0 0 0.65rem;font-size:0.82rem;color:var(--ink-secondary);">
          Klik slot penumpang di bawah lalu pilih kursi di peta kabin. Kuning: Extra Legroom · Abu-abu: Terisi.
        </p>

        <div class="pax-seat-slots">
          ${wizard.passengers
            .map(
              (p, idx) => `
            <button type="button" class="pax-slot-pill ${wizard.activePaxSlot === idx ? 'active' : ''}" data-pax-slot="${idx}">
              <span>P${idx + 1}: ${escapeHtml(p.fullName || `Penumpang ${idx + 1}`)}</span>
              <span class="iata-pill">${escapeHtml(p.seatNumber || 'Pilih')}</span>
            </button>`
            )
            .join('')}
        </div>

        <div class="cabin-fuselage">
          <div style="text-align:center;font-size:0.72rem;font-family:var(--font-mono);color:var(--ink-muted);margin-bottom:0.75rem;">
            ▲ DEPAN PESAWAT (${escapeHtml(flight.cabinClass.toUpperCase())}) ▲
          </div>
          ${seatMapData.rows
            .map(
              (r) => `
            <div class="seat-row">
              <span class="seat-row-num">${r.row}</span>
              ${r.seats
                .map((s) => {
                  if (s.isAisle) return '<span class="seat-aisle"></span>';
                  const ownerIdx = selectedByPax.get(s.seatCode);
                  const isSelected = ownerIdx !== undefined;
                  const cls = [
                    'seat-btn',
                    s.isOccupied ? 'occupied' : '',
                    s.isExtraLegroom && !s.isOccupied && !isSelected ? 'legroom' : '',
                    isSelected ? 'selected' : ''
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const label = isSelected ? `P${ownerIdx + 1}` : s.col;
                  return `<button type="button" class="${cls}" ${s.isOccupied ? 'disabled' : ''} data-pick-seat="${escapeHtml(s.seatCode)}" data-seat-fee="${s.seatFee}" title="Kursi ${escapeHtml(s.seatCode)}${s.seatFee > 0 ? ' (+Extra Legroom)' : ''}">${escapeHtml(label)}</button>`;
                })
                .join('')}
            </div>`
            )
            .join('')}
        </div>
      `;
    } else {
      const seatSummary = wizard.passengers.map((p) => p.seatNumber).join(', ');
      stepBody = `
        <h4 style="margin:0 0 0.75rem;">4. Pembayaran &amp; Konfirmasi Tiket</h4>
        <div class="grid-2">
          <div class="panel" style="background:var(--bg-paper);">
            <div class="metric-label">Ringkasan Penerbangan</div>
            <div style="font-weight:700;margin-top:0.35rem;">${escapeHtml(flight.airline)} (${escapeHtml(flight.flightNumber)})</div>
            <div class="mono" style="font-size:0.84rem;margin-top:0.2rem;">${escapeHtml(flight.origin)} → ${escapeHtml(flight.destination)} · ${escapeHtml(flight.date)}</div>
            <div style="font-size:0.82rem;color:var(--ink-secondary);margin-top:0.3rem;">
              ${wizard.passengers.map((p, i) => `<div>P${i + 1}: ${escapeHtml(p.fullName)} · Kursi <span class="mono">${escapeHtml(p.seatNumber)}</span></div>`).join('')}
            </div>
            <hr style="border:none;border-top:1px solid var(--border-hairline);margin:0.75rem 0;">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span>Tarif Dasar (${escapeHtml(wizard.fareTier)} × ${wizard.passengerCount})</span><span>${formatMoney(baseUnit * wizard.passengerCount, currency)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-top:0.25rem;"><span>Pajak Bandara &amp; PSC (× ${wizard.passengerCount})</span><span>${formatMoney(taxes * wizard.passengerCount, currency)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-top:0.25rem;"><span>Total Biaya Kursi (${escapeHtml(seatSummary)})</span><span>${formatMoney(totalSeatFees, currency)}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.08rem;color:var(--navy-900);margin-top:0.6rem;padding-top:0.5rem;border-top:1px solid var(--border-strong);">
              <span>Total</span><span>${formatMoney(totalIDR, currency)}</span>
            </div>
          </div>
          <div>
            <div class="field mb-1">
              <label for="wizPayMethod">Metode Pembayaran</label>
              <select class="select" id="wizPayMethod">
                <option value="QRIS / Virtual Account Bank" ${wizard.paymentMethod === 'QRIS / Virtual Account Bank' ? 'selected' : ''}>QRIS / Virtual Account Bank Indonesia</option>
                <option value="International Card (Visa / Mastercard)" ${wizard.paymentMethod === 'International Card (Visa / Mastercard)' ? 'selected' : ''}>Kartu Kredit / Debit (Visa / Mastercard)</option>
                <option value="Apple Pay / Google Pay" ${wizard.paymentMethod === 'Apple Pay / Google Pay' ? 'selected' : ''}>Apple Pay / Google Pay</option>
                ${isStaffDesk ? `<option value="Tunai / EDC Loket Agen" ${wizard.paymentMethod === 'Tunai / EDC Loket Agen' ? 'selected' : ''}>Tunai / EDC Loket Agen Offline</option>` : ''}
              </select>
            </div>
            <div class="field">
              <label for="wizPayAction">Status Transaksi</label>
              <select class="select" id="wizPayAction">
                <option value="pay_now" ${wizard.payAction === 'pay_now' ? 'selected' : ''}>Bayar Sekarang (Terbitkan E-Tiket Confirmed)</option>
                <option value="hold" ${wizard.payAction === 'hold' ? 'selected' : ''}>Bayar Nanti (Status: Waiting for the Payment)</option>
                <option value="booked" ${wizard.payAction === 'booked' ? 'selected' : ''}>Simpan Reservasi (Status: Booked)</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }

    openModal(`
      <div class="modal-head">
        <div>
          <strong id="modalTitle">${escapeHtml(flight.airline)} ${escapeHtml(flight.flightNumber)} · ${escapeHtml(flight.origin)} → ${escapeHtml(flight.destination)}</strong>
          <div style="font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(flight.date)} · ${escapeHtml(flight.departureTime)}–${escapeHtml(flight.arrivalTime)} · ${escapeHtml(flight.terminalOrigin || '')}</div>
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-hairline);flex-wrap:wrap;gap:0.75rem;">
          <div>
            <span style="font-size:0.78rem;color:var(--ink-muted);">Estimasi Total (${wizard.passengerCount} pax):</span>
            <strong style="font-size:1.15rem;color:var(--navy-900);margin-left:0.35rem;">${formatMoney(totalIDR, currency)}</strong>
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

    document.querySelectorAll('[data-pick-tier]').forEach((el) => {
      el.addEventListener('click', () => {
        wizard.fareTier = el.dataset.pickTier;
        renderStep();
      });
    });

    const paxCountEl = document.getElementById('wizPaxCount');
    if (paxCountEl) {
      paxCountEl.addEventListener('change', () => {
        saveStep2Inputs();
        syncPassengerArrayLength(Number(paxCountEl.value) || 1);
        renderStep();
      });
    }

    const chEl = document.getElementById('wizChannel');
    if (chEl) {
      chEl.addEventListener('change', () => {
        saveStep2Inputs();
        if (wizard.bookingChannel === 'offline_desk') {
          wizard.passengers[0].fullName = '';
          wizard.passengerEmail = '';
          wizard.paymentMethod = 'Tunai / EDC Loket Agen';
        }
        renderStep();
      });
    }

    document.querySelectorAll('[data-pax-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        wizard.activePaxSlot = Number(btn.dataset.paxSlot);
        renderStep();
      });
    });

    document.querySelectorAll('[data-pick-seat]').forEach((el) => {
      el.addEventListener('click', () => {
        const seatCode = el.dataset.pickSeat;
        const seatFee = Number(el.dataset.seatFee || 0);
        const existingOwner = wizard.passengers.findIndex((p) => p.seatNumber === seatCode);

        if (existingOwner >= 0) {
          wizard.passengers[existingOwner].seatNumber = '';
          wizard.passengers[existingOwner].seatFee = 0;
          wizard.activePaxSlot = existingOwner;
        } else {
          wizard.passengers[wizard.activePaxSlot].seatNumber = seatCode;
          wizard.passengers[wizard.activePaxSlot].seatFee = seatFee;
          const nextEmpty = wizard.passengers.findIndex((p) => !p.seatNumber);
          if (nextEmpty >= 0) wizard.activePaxSlot = nextEmpty;
        }
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
          const missingName = wizard.passengers.findIndex((p) => !String(p.fullName || '').trim());
          if (missingName >= 0) {
            showToast(`Nama Penumpang ${missingName + 1} wajib diisi.`);
            return;
          }
        }
        if (wizard.step === 3) {
          const missingSeat = wizard.passengers.findIndex((p) => !p.seatNumber);
          if (missingSeat >= 0) {
            wizard.activePaxSlot = missingSeat;
            showToast(`Pilih kursi untuk Penumpang ${missingSeat + 1}.`);
            renderStep();
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
          const statusValue =
            wizard.payAction === 'pay_now'
              ? 'confirmed'
              : wizard.payAction === 'hold'
              ? 'waiting for the payment'
              : 'booked';

          const payload = {
            passengerName: wizard.passengers[0].fullName.trim(),
            passengerEmail: wizard.passengerEmail.trim(),
            passengerPhone: wizard.passengerPhone.trim(),
            identityNumber: wizard.passengers[0].identityNumber.trim(),
            nationality: wizard.passengers[0].nationality.trim(),
            passengerCount: wizard.passengerCount,
            passengers: wizard.passengers.map((p) => ({
              fullName: p.fullName.trim(),
              identityNumber: p.identityNumber.trim(),
              nationality: p.nationality.trim(),
              seatNumber: p.seatNumber
            })),
            specialRequest: wizard.specialRequest.trim(),
            flightId: flight.flightId,
            fareTier: wizard.fareTier,
            bookingChannel: wizard.bookingChannel,
            paymentMethod: wizard.payAction === 'pay_now' ? wizard.paymentMethod : null,
            status: statusValue
          };
          const res = await Api.createBooking(payload);
          closeModal();
          showToast(`Booking ${res.booking.bookingReference} berhasil dibuat (${res.booking.status})!`);
          if (onComplete) await onComplete(res.booking);
        } catch (err) {
          showToast(err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Konfirmasi & Terbitkan Tiket';
        }
      });
    }
  };

  renderStep();
}
