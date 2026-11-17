/* ============================================================================
   AEROLEAVE GLOBAL — VIEW 5: STAFF OFFLINE DESK, HR LEAVE & TRAVEL MANAGER OPS
   ============================================================================ */
import { Api } from '../api.js';
import {
  escapeHtml,
  formatMoney,
  formatShortTimestamp,
  statusBadge,
  renderAirportOptions,
  showToast
} from '../utils.js';
import { getAppState, ui } from '../state.js';
import { openBoardingPassModal } from '../components/boardingPass.js';

function filterLeavesForUi(leaveRequests, h) {
  let leaves = [...leaveRequests];
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
    leaves = leaves.filter(
      (lv) => lv.startDate <= (h.endDate || '9999-12-31') && lv.endDate >= (h.startDate || '0000-01-01')
    );
  }
  if (h.statusFilter && h.statusFilter !== 'ALL') {
    leaves = leaves.filter((lv) => lv.status === h.statusFilter);
  }
  return leaves;
}

function renderVisitorOfflineDeskPanel(appState, corp) {
  const visitors = appState.visitors || [];
  const visFlights = (appState.flights || []).filter(
    (fl) => fl.seatsAvailable > 0 && (!corp.tmSearchDest || fl.destination === corp.tmSearchDest)
  );
  const previewVis = visitors.find((v) => v.visitorId === corp.visitorPreviewId) || visitors[0];
  const visTickets = previewVis
    ? (appState.bookings || []).filter(
        (b) => b.visitorId === previewVis.visitorId || b.passengerEmail === previewVis.visitorEmail
      )
    : [];
  const visEmails = previewVis
    ? (appState.emailNotifications || []).filter(
        (e) => e.visitorId === previewVis.visitorId || e.recipientEmail === previewVis.visitorEmail
      )
    : [];

  return `
    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">Loket Pesan Offline — Pesankan Tiket Pelanggan / Visitor</h3>
        <p class="panel-desc mb-1">Pilih pelanggan terdaftar atau masukkan data pelanggan walk-in baru, lalu terbitkan tiket &amp; kirim e-tiket ke emailnya.</p>
        <div class="grid-2 mt-1 mb-1">
          <div class="field">
            <label for="tmVisitorSelect">Pelanggan / Visitor</label>
            <select id="tmVisitorSelect" class="select">
              ${visitors.map((v) => `<option value="${escapeHtml(v.visitorId)}" ${v.visitorId === corp.selectedVisitorId ? 'selected' : ''}>${escapeHtml(v.visitorName)} (${escapeHtml(v.visitorEmail)})</option>`).join('')}
              <option value="__NEW__" ${corp.selectedVisitorId === '__NEW__' ? 'selected' : ''}>+ Pelanggan Baru (Walk-in Offline)</option>
            </select>
          </div>
          <div class="field">
            <label for="tmSearchDest">Filter Tujuan</label>
            <select id="tmSearchDest" class="select">${renderAirportOptions(appState.airports, corp.tmSearchDest, 'Semua Tujuan')}</select>
          </div>
        </div>

        ${
          corp.selectedVisitorId === '__NEW__'
            ? `<div class="grid-3 mb-1" style="background:var(--bg-paper);padding:0.7rem;border-radius:var(--radius-sm);border:1px solid var(--border-hairline);">
                <div class="field"><label for="walkinName">Nama Pelanggan</label><input id="walkinName" class="input" placeholder="Nama lengkap"></div>
                <div class="field"><label for="walkinEmail">Email E-Tiket</label><input id="walkinEmail" type="email" class="input" placeholder="nama@email.id"></div>
                <div class="field"><label for="walkinPhone">Telepon / WA</label><input id="walkinPhone" class="input" placeholder="+62812..."></div>
              </div>`
            : ''
        }

        <div class="table-wrap">
          <table>
            <thead><tr><th>Maskapai</th><th>Rute</th><th class="num">Tarif</th><th class="num">Aksi</th></tr></thead>
            <tbody>
              ${visFlights
                .slice(0, 6)
                .map(
                  (fl) => `
                <tr>
                  <td><strong>${escapeHtml(fl.airline)}</strong><br><span class="mono" style="font-size:0.75rem;">${escapeHtml(fl.flightNumber)}</span></td>
                  <td>${escapeHtml(fl.origin)}→${escapeHtml(fl.destination)} (${escapeHtml(fl.date)})</td>
                  <td class="num">${formatMoney(fl.price, ui.currency)}</td>
                  <td class="num"><button type="button" class="btn btn-primary btn-sm" data-tm-book-visitor="${escapeHtml(fl.flightId)}">Pesan &amp; Kirim</button></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">Akun Pelanggan &amp; Inbox E-Tiket Email</h3>
        <div class="field mt-1 mb-1">
          <label for="tmVisPreviewSelect">Lihat Akun Pelanggan / Visitor</label>
          <select id="tmVisPreviewSelect" class="select">${visitors.map((v) => `<option value="${escapeHtml(v.visitorId)}" ${v.visitorId === previewVis?.visitorId ? 'selected' : ''}>${escapeHtml(v.visitorName)} — ${escapeHtml(v.visitorEmail)}</option>`).join('')}</select>
        </div>
        <h4 style="margin:0.5rem 0;">Tiket Terpesan (${visTickets.length})</h4>
        ${visTickets.map((t) => `<div style="padding:0.5rem;border:1px solid var(--border-hairline);border-radius:var(--radius-sm);margin-bottom:0.4rem;font-size:0.84rem;"><strong>${escapeHtml(t.bookingReference)}</strong> · ${escapeHtml(t.airline)} ${escapeHtml(t.flightNumber)} (${escapeHtml(t.origin)}→${escapeHtml(t.destination)}) ${statusBadge(t.status)}</div>`).join('') || '<div style="color:var(--ink-muted);font-size:0.84rem;">Belum ada tiket.</div>'}
        <h4 style="margin:0.85rem 0 0.5rem;">Kotak Masuk Email (${visEmails.length})</h4>
        ${visEmails.map((em) => `<div style="padding:0.55rem;background:var(--bg-paper);border-radius:var(--radius-sm);margin-bottom:0.4rem;font-size:0.82rem;"><strong>${escapeHtml(em.subject)}</strong><div style="color:var(--ink-muted);">Ke: ${escapeHtml(em.recipientEmail)} · ${statusBadge(em.deliveryStatus)}</div></div>`).join('') || '<div style="color:var(--ink-muted);font-size:0.84rem;">Belum ada email.</div>'}
      </div>
    </div>
  `;
}

function renderEmployeeSelfLeavePanel(appState, user) {
  const emp = (appState.employees || [])[0] || {
    employeeId: user.employeeId,
    employeeName: user.fullName,
    department: user.department,
    annualLeaveQuota: 12
  };
  const currentYear = String(appState.meta?.currentYear || 2026);
  const myLeaves = appState.leaveRequests || [];
  const usedDays = myLeaves
    .filter(
      (l) =>
        l.status === 'approved' &&
        (l.startDate.startsWith(currentYear) || l.endDate.startsWith(currentYear)) &&
        (l.leaveType || 'annual') === 'annual'
    )
    .reduce((acc, l) => acc + l.durationDays, 0);
  const pendingDays = myLeaves
    .filter(
      (l) =>
        l.status === 'pending' &&
        (l.startDate.startsWith(currentYear) || l.endDate.startsWith(currentYear))
    )
    .reduce((acc, l) => acc + l.durationDays, 0);
  const remDays = Math.max(0, emp.annualLeaveQuota - usedDays);

  return `
    <div class="metric-strip">
      <div class="metric-card"><div class="metric-label">Kuota Tahunan ${currentYear}</div><div class="metric-val">${emp.annualLeaveQuota} hari</div></div>
      <div class="metric-card"><div class="metric-label">Cuti Disetujui</div><div class="metric-val">${usedDays} hari</div></div>
      <div class="metric-card"><div class="metric-label">Menunggu HRD</div><div class="metric-val" style="color:var(--accent-amber);">${pendingDays} hari</div></div>
      <div class="metric-card"><div class="metric-label">Sisa Kuota Tersedia</div><div class="metric-val" style="color:var(--accent-cobalt);">${remDays} hari</div></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">Riwayat Pengajuan Cuti Saya</h3>
        <div class="table-wrap mt-1">
          <table>
            <thead><tr><th>Periode</th><th class="num">Durasi</th><th>Tipe &amp; Alasan</th><th>Status &amp; Catatan HRD</th></tr></thead>
            <tbody>
              ${myLeaves
                .map(
                  (l) => `
                <tr>
                  <td class="mono">${escapeHtml(l.startDate)} s/d ${escapeHtml(l.endDate)}</td>
                  <td class="num">${l.durationDays}h</td>
                  <td><strong>${escapeHtml(l.leaveType || 'annual')}</strong><br><span style="font-size:0.8rem;color:var(--ink-secondary);">${escapeHtml(l.reason)}</span></td>
                  <td>
                    ${statusBadge(l.status)}
                    ${l.decisionNote ? `<div style="font-size:0.74rem;color:var(--ink-muted);margin-top:0.2rem;">${escapeHtml(l.reviewedByName || 'HRD')}: ${escapeHtml(l.decisionNote)}</div>` : ''}
                  </td>
                </tr>`
                )
                .join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);">Belum ada pengajuan cuti.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">Ajukan Cuti Baru ke HRD</h3>
        <p class="panel-desc mb-1">Sistem otomatis memvalidasi sisa kuota tahunan dan bentrok tanggal.</p>
        <form id="formCorpLeave">
          <input type="hidden" id="newLvEmp" value="${escapeHtml(emp.employeeId)}">
          <div class="field mb-1">
            <label for="newLvType">Jenis Cuti</label>
            <select id="newLvType" class="select">
              <option value="annual">Cuti Tahunan (Annual Leave)</option>
              <option value="sick">Cuti Sakit (Sick Leave)</option>
              <option value="personal">Izin Keperluan Pribadi</option>
            </select>
          </div>
          <div class="grid-2 mb-1">
            <div class="field"><label for="newLvStart">Tanggal Mulai</label><input type="date" id="newLvStart" class="input" value="2026-12-07" required></div>
            <div class="field"><label for="newLvEnd">Tanggal Selesai</label><input type="date" id="newLvEnd" class="input" value="2026-12-08" required></div>
          </div>
          <div class="field mb-2"><label for="newLvReason">Alasan</label><input type="text" id="newLvReason" class="input" placeholder="Contoh: Acara keluarga / Istirahat" required></div>
          <button type="submit" class="btn btn-primary">Kirim Pengajuan ke HRD</button>
        </form>
      </div>
    </div>
  `;
}

function renderAuditLogPanel(auditLogs) {
  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Audit Trail Aktivitas SQLite</h3>
          <p class="panel-desc">Catatan kronologis persetujuan HRD, otorisasi Manajer Travel, dan transaksi tiket.</p>
        </div>
      </div>
      ${
        (auditLogs || []).length === 0
          ? '<div style="color:var(--ink-muted);">Belum ada catatan audit.</div>'
          : auditLogs
              .map(
                (a) => `
              <div class="audit-row">
                <div>
                  <span class="iata-pill">${escapeHtml(a.action)}</span>
                  <strong style="margin-left:0.4rem;color:var(--navy-900);">${escapeHtml(a.actorName)}</strong>
                  <span style="font-size:0.78rem;color:var(--ink-muted);">(${escapeHtml(a.actorRole)})</span>
                  <div style="color:var(--ink-secondary);margin-top:0.2rem;">${escapeHtml(a.summary)}</div>
                </div>
                <div class="mono" style="font-size:0.74rem;color:var(--ink-muted);white-space:nowrap;">${escapeHtml(formatShortTimestamp(a.createdAt))}</div>
              </div>`
              )
              .join('')
      }
    </div>
  `;
}

export function renderCorporateView() {
  const appState = getAppState();
  const user = appState.currentUser;

  if (!user || !['employee', 'hr_manager', 'travel_manager'].includes(user.role)) {
    return `
      <div class="container">
        <div class="panel" style="text-align:center;padding:2.5rem;">
          <h2 class="section-title">Akses Terbatas — Portal Internal Perusahaan &amp; Loket Agen</h2>
          <p class="section-sub" style="margin:0.5rem auto 1.25rem;max-width:58ch;">
            Silakan masuk sebagai <strong>Employee</strong> (loket pesan offline pelanggan &amp; pengajuan cuti pribadi), <strong>HRD Manajer</strong> (manajemen cuti karyawan), atau <strong>Manajer Travel</strong> (monitor semua booking &amp; otorisasi PNR).
          </p>
          <button type="button" class="btn btn-primary" data-open-auth>Masuk / Pilih Aktor</button>
        </div>
      </div>
    `;
  }

  const corp = ui.corporate;
  const availableTabs =
    user.role === 'employee'
      ? [
          { id: 'emp_desk', label: 'Loket Pesan Offline' },
          { id: 'emp_leave', label: 'Cuti Saya' }
        ]
      : user.role === 'hr_manager'
      ? [
          { id: 'hr', label: 'Manajemen & Persetujuan Cuti HR' },
          { id: 'audit', label: 'Log Audit HR' }
        ]
      : [
          { id: 'tm_status', label: 'Monitor Semua Booking' },
          { id: 'tm_visitor', label: 'Loket Pengunjung & E-Tiket' },
          { id: 'tm_auth', label: 'Otorisasi PNR' },
          { id: 'audit', label: 'Log Audit Travel' }
        ];

  if (!availableTabs.some((t) => t.id === corp.subtab)) {
    corp.subtab = availableTabs[0].id;
  }

  let bodyHtml = '';
  if (corp.subtab === 'emp_desk' || corp.subtab === 'tm_visitor') {
    bodyHtml = renderVisitorOfflineDeskPanel(appState, corp);
  } else if (corp.subtab === 'emp_leave') {
    bodyHtml = renderEmployeeSelfLeavePanel(appState, user);
  } else if (corp.subtab === 'hr') {
    const h = corp.hr;
    const leaves = filterLeavesForUi(appState.leaveRequests || [], h);
    const emp = (appState.employees || []).find((e) => e.employeeId === h.selectedEmployeeId) || appState.employees[0];
    const empLeaves = (appState.leaveRequests || []).filter((l) => l.employeeId === emp.employeeId);
    const targetYear = String(h.year || 2026);
    const usedDays = empLeaves
      .filter((l) => l.status === 'approved' && (l.startDate.startsWith(targetYear) || l.endDate.startsWith(targetYear)))
      .reduce((acc, l) => acc + l.durationDays, 0);
    const remDays = Math.max(0, emp.annualLeaveQuota - usedDays);

    bodyHtml = `
      <div class="panel mb-2">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Jadwal, Filter &amp; Persetujuan Cuti Karyawan</h3>
            <p class="panel-desc">Filter pengajuan cuti berdasarkan tanggal, periode mulai–selesai, status, dan setujui atau tolak pengajuan pending.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btnHrReset">Reset Filter</button>
        </div>
        <div class="grid-3 mb-1">
          <div class="field"><label for="hrDay">Tanggal (1–31)</label><input type="number" min="1" max="31" id="hrDay" class="input" value="${escapeHtml(h.day)}" placeholder="Semua"></div>
          <div class="field"><label for="hrMonth">Bulan</label><select id="hrMonth" class="select"><option value="">Semua</option>${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((m, i) => `<option value="${i + 1}" ${Number(h.month) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          <div class="field"><label for="hrYear">Tahun</label><select id="hrYear" class="select"><option value="">Semua</option><option value="2025" ${h.year === '2025' ? 'selected' : ''}>2025</option><option value="2026" ${h.year === '2026' ? 'selected' : ''}>2026</option></select></div>
        </div>
        <div class="grid-3 mb-2">
          <div class="field"><label for="hrStart">Periode Mulai</label><input type="date" id="hrStart" class="input" value="${escapeHtml(h.startDate)}"></div>
          <div class="field"><label for="hrEnd">Periode Selesai</label><input type="date" id="hrEnd" class="input" value="${escapeHtml(h.endDate)}"></div>
          <div class="field">
            <label for="hrStatus">Status Pengajuan</label>
            <select id="hrStatus" class="select">
              <option value="ALL" ${h.statusFilter === 'ALL' ? 'selected' : ''}>Semua Status</option>
              <option value="pending" ${h.statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${h.statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${h.statusFilter === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr><th>Pegawai</th><th>Periode Cuti</th><th class="num">Durasi</th><th>Alasan</th><th>Status</th><th class="num">Keputusan HRD</th></tr></thead>
            <tbody>
              ${leaves
                .map(
                  (lv) => `
                <tr>
                  <td><strong>${escapeHtml(lv.employeeName)}</strong><br><span class="mono" style="font-size:0.74rem;color:var(--ink-muted);">${escapeHtml(lv.leaveId)}</span></td>
                  <td class="mono">${escapeHtml(lv.startDate)} s/d ${escapeHtml(lv.endDate)}</td>
                  <td class="num">${lv.durationDays} hari</td>
                  <td>${escapeHtml(lv.reason)}</td>
                  <td>${statusBadge(lv.status)}</td>
                  <td class="num">
                    ${
                      lv.status === 'pending'
                        ? `<div style="display:inline-flex;gap:0.35rem;">
                            <button type="button" class="btn btn-success btn-sm" data-hr-decide="approved" data-leave-id="${escapeHtml(lv.leaveId)}">Setujui</button>
                            <button type="button" class="btn btn-danger btn-sm" data-hr-decide="rejected" data-leave-id="${escapeHtml(lv.leaveId)}">Tolak</button>
                          </div>`
                        : `<span style="font-size:0.76rem;color:var(--ink-muted);">${escapeHtml(lv.reviewedByName || 'HRD')}</span>`
                    }
                  </td>
                </tr>`
                )
                .join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Tidak ada data cuti sesuai filter.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3 class="panel-title">Riwayat &amp; Sisa Kuota Cuti Pegawai</h3>
          <div class="field mt-1 mb-1">
            <label for="hrEmpSelect">Pilih Pegawai</label>
            <select id="hrEmpSelect" class="select">
              ${appState.employees.map((e) => `<option value="${escapeHtml(e.employeeId)}" ${e.employeeId === emp.employeeId ? 'selected' : ''}>${escapeHtml(e.employeeName)} — ${escapeHtml(e.department)}</option>`).join('')}
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
                ${empLeaves.map((l) => `<tr><td class="mono">${escapeHtml(l.startDate)} → ${escapeHtml(l.endDate)}</td><td class="num">${l.durationDays} hari</td><td>${statusBadge(l.status)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">Catat Pengajuan Cuti Pegawai</h3>
          <form id="formCorpLeave" class="mt-1">
            <div class="field mb-1"><label for="newLvEmp">Pegawai</label><select id="newLvEmp" class="select">${appState.employees.map((e) => `<option value="${escapeHtml(e.employeeId)}">${escapeHtml(e.employeeName)}</option>`).join('')}</select></div>
            <div class="field mb-1">
              <label for="newLvType">Jenis Cuti</label>
              <select id="newLvType" class="select">
                <option value="annual">Cuti Tahunan</option>
                <option value="sick">Cuti Sakit</option>
                <option value="personal">Izin Pribadi</option>
              </select>
            </div>
            <div class="grid-2 mb-1">
              <div class="field"><label for="newLvStart">Tanggal Mulai</label><input type="date" id="newLvStart" class="input" value="2026-12-07" required></div>
              <div class="field"><label for="newLvEnd">Tanggal Selesai</label><input type="date" id="newLvEnd" class="input" value="2026-12-08" required></div>
            </div>
            <div class="field mb-2"><label for="newLvReason">Alasan</label><input type="text" id="newLvReason" class="input" placeholder="Alasan pengajuan cuti" required></div>
            <button type="submit" class="btn btn-primary">Simpan Pengajuan Cuti</button>
          </form>
        </div>
      </div>
    `;
  } else if (corp.subtab === 'tm_status') {
    const allBookings = appState.bookings || [];
    const list =
      corp.tmStatusFilter === 'ALL' ? allBookings : allBookings.filter((b) => b.status === corp.tmStatusFilter);

    bodyHtml = `
      <div class="metric-strip">
        <div class="metric-card"><div class="metric-label">Confirmed</div><div class="metric-val">${allBookings.filter((b) => b.status === 'confirmed').length}</div></div>
        <div class="metric-card"><div class="metric-label">Booked (Perlu Otorisasi)</div><div class="metric-val" style="color:var(--accent-cobalt);">${allBookings.filter((b) => b.status === 'booked').length}</div></div>
        <div class="metric-card"><div class="metric-label">Waiting Payment</div><div class="metric-val" style="color:var(--accent-amber);">${allBookings.filter((b) => b.status === 'waiting for the payment').length}</div></div>
        <div class="metric-card"><div class="metric-label">Cancelled</div><div class="metric-val">${allBookings.filter((b) => b.status === 'cancelled').length}</div></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div><h3 class="panel-title">Monitor Semua Status Booking Pelanggan</h3><p class="panel-desc">Filter transaksi online &amp; loket offline lalu otorisasi reservasi berstatus booked.</p></div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;">
          ${['ALL', 'confirmed', 'booked', 'waiting for the payment', 'cancelled']
            .map((st) => `<button type="button" class="btn btn-sm ${corp.tmStatusFilter === st ? 'btn-primary' : 'btn-secondary'}" data-tm-status="${escapeHtml(st)}">${st === 'ALL' ? 'Semua' : escapeHtml(st)}</button>`)
            .join('')}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>PNR</th><th>Penumpang &amp; Tipe</th><th>Rute &amp; Maskapai</th><th class="num">Tarif</th><th>Status</th><th class="num">Aksi</th></tr></thead>
            <tbody>
              ${list
                .map(
                  (b) => `
                <tr>
                  <td class="mono"><strong>${escapeHtml(b.bookingReference)}</strong></td>
                  <td>${escapeHtml(b.passengerName)}<br><span style="font-size:0.75rem;color:var(--ink-muted);">${escapeHtml(b.bookingType)} · ${escapeHtml(b.passengerEmail)}</span></td>
                  <td>${escapeHtml(b.origin)}→${escapeHtml(b.destination)} · ${escapeHtml(b.airline)} ${escapeHtml(b.flightNumber)}</td>
                  <td class="num">${formatMoney(b.price, ui.currency)}</td>
                  <td>${statusBadge(b.status)}</td>
                  <td class="num">
                    <div style="display:inline-flex;gap:0.35rem;">
                      ${b.status === 'booked' ? `<button type="button" class="btn btn-success btn-sm" data-tm-quick-auth="${escapeHtml(b.bookingReference)}">Otorisasi</button>` : ''}
                      <button type="button" class="btn btn-secondary btn-sm" data-view-bp="${escapeHtml(b.bookingReference)}">E-Tiket</button>
                    </div>
                  </td>
                </tr>`
                )
                .join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">Tidak ada booking dengan status ini.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (corp.subtab === 'tm_auth') {
    bodyHtml = `
      <div class="panel" style="max-width:680px;">
        <h3 class="panel-title">Otorisasi atau Penolakan Tiket via Booking Reference (PNR)</h3>
        <p class="panel-desc mb-1">Masukkan kode booking reference (misal <code class="mono">HLM-BOOK02</code>) untuk memverifikasi dan mengotorisasi tiket.</p>
        <form id="formTmAuth" style="display:flex;gap:0.65rem;align-items:flex-end;flex-wrap:wrap;">
          <div class="field" style="flex:1;min-width:220px;">
            <label for="tmAuthInput">Booking Reference</label>
            <input id="tmAuthInput" class="input mono" placeholder="Contoh: HLM-BOOK02" value="${escapeHtml(corp.authCodeInput)}">
          </div>
          <button type="submit" class="btn btn-primary" data-auth-action="authorize">Verifikasi &amp; Otorisasi</button>
          <button type="button" class="btn btn-danger" id="btnTmRejectPnr">Tolak Reservasi</button>
        </form>
        ${
          corp.authResult
            ? `<div class="banner mt-2 ${corp.authResult.authorized ? 'banner-success' : 'banner-danger'}">
                <div>
                  <strong>${escapeHtml(corp.authResult.authorized ? 'Otorisasi Berhasil' : corp.authResult.rejected ? 'Reservasi Ditolak' : 'Otorisasi Gagal')}</strong><br>
                  <span>${escapeHtml(corp.authResult.message)}</span>
                </div>
              </div>`
            : ''
        }
      </div>
    `;
  } else {
    bodyHtml = renderAuditLogPanel(appState.auditLogs || []);
  }

  const headerTitle =
    user.role === 'employee'
      ? 'Portal Karyawan — Loket Pesan Offline &amp; Cuti Saya'
      : user.role === 'hr_manager'
      ? 'Konsol HRD — Manajemen &amp; Persetujuan Cuti Karyawan'
      : 'Konsol Manajer Travel — Monitor &amp; Otorisasi Tiket';

  return `
    <div class="container">
      <div class="section-header" style="margin-top:0;">
        <div>
          <h1 class="section-title">${headerTitle}</h1>
          <p class="section-sub">Masuk sebagai <strong>${escapeHtml(user.fullName)}</strong> (${escapeHtml(user.roleLabel)})</p>
        </div>
      </div>
      <div class="segmented mb-2">
        ${availableTabs
          .map(
            (t) => `<button type="button" class="seg-btn ${corp.subtab === t.id ? 'active' : ''}" data-corp-tab="${t.id}">${escapeHtml(t.label)}</button>`
          )
          .join('')}
      </div>
      ${bodyHtml}
    </div>
  `;
}

export function bindCorporateEvents({ renderApp, refreshState }) {
  const appState = getAppState();
  const user = appState.currentUser;
  if (!user) return;

  document.querySelectorAll('[data-corp-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.corporate.subtab = btn.dataset.corpTab;
      renderApp();
    });
  });

  const hrDay = document.getElementById('hrDay');
  const hrMonth = document.getElementById('hrMonth');
  const hrYear = document.getElementById('hrYear');
  const hrStart = document.getElementById('hrStart');
  const hrEnd = document.getElementById('hrEnd');
  const hrStatus = document.getElementById('hrStatus');
  const hrEmpSel = document.getElementById('hrEmpSelect');

  [hrDay, hrMonth, hrYear, hrStart, hrEnd, hrStatus].forEach((el) => {
    if (el) {
      el.addEventListener('change', () => {
        ui.corporate.hr.day = hrDay ? hrDay.value : '';
        ui.corporate.hr.month = hrMonth ? hrMonth.value : '';
        ui.corporate.hr.year = hrYear ? hrYear.value : '';
        ui.corporate.hr.startDate = hrStart ? hrStart.value : '';
        ui.corporate.hr.endDate = hrEnd ? hrEnd.value : '';
        ui.corporate.hr.statusFilter = hrStatus ? hrStatus.value : 'ALL';
        renderApp();
      });
    }
  });
  if (hrEmpSel) {
    hrEmpSel.addEventListener('change', () => {
      ui.corporate.hr.selectedEmployeeId = hrEmpSel.value;
      renderApp();
    });
  }

  const btnHrReset = document.getElementById('btnHrReset');
  if (btnHrReset) {
    btnHrReset.addEventListener('click', () => {
      ui.corporate.hr = {
        ...ui.corporate.hr,
        day: '',
        month: '',
        year: '2026',
        startDate: '',
        endDate: '',
        statusFilter: 'ALL'
      };
      renderApp();
    });
  }

  document.querySelectorAll('[data-hr-decide]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const leaveId = btn.dataset.leaveId;
      const decision = btn.dataset.hrDecide;
      try {
        await Api.decideLeave(leaveId, decision, '');
        showToast(`Pengajuan cuti ${leaveId} telah di-${decision}.`);
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  const formCorpLeave = document.getElementById('formCorpLeave');
  if (formCorpLeave) {
    formCorpLeave.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.createLeave({
          employeeId: document.getElementById('newLvEmp').value,
          leaveType: document.getElementById('newLvType')?.value || 'annual',
          startDate: document.getElementById('newLvStart').value,
          endDate: document.getElementById('newLvEnd').value,
          reason: document.getElementById('newLvReason').value
        });
        showToast('Pengajuan cuti tersimpan (status: pending persetujuan HRD).');
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  document.querySelectorAll('[data-tm-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.corporate.tmStatusFilter = btn.dataset.tmStatus;
      renderApp();
    });
  });

  document.querySelectorAll('[data-tm-quick-auth]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await Api.authorizeBooking(btn.dataset.tmQuickAuth, 'authorize');
        showToast(res.message);
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelectorAll('[data-view-bp]').forEach((btn) => {
    btn.addEventListener('click', () => openBoardingPassModal(btn.dataset.viewBp, ui.currency));
  });

  const tmVisSel = document.getElementById('tmVisitorSelect');
  const tmDestSel = document.getElementById('tmSearchDest');
  const tmVisPrevSel = document.getElementById('tmVisPreviewSelect');
  if (tmVisSel) {
    tmVisSel.addEventListener('change', () => {
      ui.corporate.selectedVisitorId = tmVisSel.value;
      renderApp();
    });
  }
  if (tmDestSel) {
    tmDestSel.addEventListener('change', () => {
      ui.corporate.tmSearchDest = tmDestSel.value;
      renderApp();
    });
  }
  if (tmVisPrevSel) {
    tmVisPrevSel.addEventListener('change', () => {
      ui.corporate.visitorPreviewId = tmVisPrevSel.value;
      renderApp();
    });
  }

  document.querySelectorAll('[data-tm-book-visitor]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      let visitorPayload;
      if (ui.corporate.selectedVisitorId === '__NEW__') {
        const name = document.getElementById('walkinName')?.value.trim();
        const email = document.getElementById('walkinEmail')?.value.trim();
        const phone = document.getElementById('walkinPhone')?.value.trim() || '';
        if (!name || !email) {
          showToast('Nama dan email pelanggan baru wajib diisi.');
          return;
        }
        visitorPayload = { visitorName: name, visitorEmail: email, visitorPhone: phone };
      } else {
        const vis = (appState.visitors || []).find((v) => v.visitorId === ui.corporate.selectedVisitorId);
        if (!vis) return;
        visitorPayload = vis;
      }

      try {
        const res = await Api.bookVisitorFlight({ ...visitorPayload, flightId: btn.dataset.tmBookVisitor });
        if (res.visitor?.visitorId) {
          ui.corporate.selectedVisitorId = res.visitor.visitorId;
          ui.corporate.visitorPreviewId = res.visitor.visitorId;
        }
        showToast(`E-Tiket ${res.booking.bookingReference} dikirim ke ${res.visitor.visitorEmail}`);
        await refreshState();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  const formTmAuth = document.getElementById('formTmAuth');
  if (formTmAuth) {
    formTmAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('tmAuthInput').value;
      ui.corporate.authCodeInput = code;
      try {
        ui.corporate.authResult = await Api.authorizeBooking(code, 'authorize');
        await refreshState();
      } catch (err) {
        ui.corporate.authResult = err.payload || { authorized: false, message: err.message };
        renderApp();
      }
    });
  }

  const btnRejectPnr = document.getElementById('btnTmRejectPnr');
  if (btnRejectPnr) {
    btnRejectPnr.addEventListener('click', async () => {
      const code = document.getElementById('tmAuthInput')?.value || '';
      ui.corporate.authCodeInput = code;
      try {
        ui.corporate.authResult = await Api.authorizeBooking(code, 'reject');
        await refreshState();
      } catch (err) {
        ui.corporate.authResult = err.payload || { authorized: false, message: err.message };
        renderApp();
      }
    });
  }
}
