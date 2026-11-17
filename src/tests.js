const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { handleRequest } = require('./routes');
const store = require('./store');

async function runAutomatedTests() {
  const customDb = Boolean(process.env.DB_FILE);
  const testDbPath =
    process.env.DB_FILE || path.join(os.tmpdir(), `aeroleave-test-${process.pid}-${Date.now()}.db`);

  if (!customDb) {
    store.setDbFile(testDbPath);
  }
  store.loadState();
  store.resetState();

  const server = http.createServer(handleRequest);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  const assert = (condition, label, detail) => {
    if (!condition) {
      throw new Error(`GAGAL [${label}]: ${JSON.stringify(detail)}`);
    }
    passed += 1;
    console.log(`  [PASS ${String(passed).padStart(2, '0')}] ${label}`);
  };

  const requestJson = async (method, urlPath, bodyObj, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  const loginAs = async (email, password = 'aeroleave123') => {
    const res = await requestJson('POST', '/api/auth/login', { email, password });
    if (res.status !== 200 || !res.data.token) {
      throw new Error(`Login gagal untuk ${email}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  };

  console.log('====================================================================');
  console.log('TEST INTEGRASI SQLITE + 5-AKTOR RBAC + US1-US9 + INTERNATIONAL PRO');
  console.log('====================================================================');

  try {
    // 0. Hallmark Pre-flight & Health
    const preflight = await requestJson('GET', '/api/hallmark/preflight');
    assert(
      preflight.status === 200 && preflight.data.skillRepo === 'https://github.com/nutlope/hallmark',
      'Hallmark Pre-flight Contract Endpoint (/api/hallmark/preflight)',
      preflight.data
    );

    const actorsRes = await requestJson('GET', '/api/auth/actors');
    assert(
      actorsRes.status === 200 && actorsRes.data.actors.length >= 9,
      'Daftar aktor demo korporat tersedia (/api/auth/actors)',
      actorsRes.data
    );

    // Unauthenticated RBAC checks + Scoped /api/state
    const guestState = await requestJson('GET', '/api/state');
    assert(
      guestState.status === 200 &&
        guestState.data.currentUser === null &&
        guestState.data.leaveRequests.length === 0 &&
        guestState.data.bookings.length === 0,
      'RBAC Guest Isolation: /api/state tidak membocorkan data cuti/booking sebelum login',
      { leaves: guestState.data.leaveRequests.length, bookings: guestState.data.bookings.length }
    );

    const unauthHr = await requestJson('GET', '/api/hr/leaves');
    assert(unauthHr.status === 401, 'RBAC Guard: akses /api/hr/leaves tanpa sesi ditolak (401)', unauthHr);

    const unauthTm = await requestJson('GET', '/api/travel-manager/bookings');
    assert(unauthTm.status === 401, 'RBAC Guard: akses /api/travel-manager/bookings tanpa sesi ditolak (401)', unauthTm);

    // Login all 5 real-world actors
    const hrSession = await loginAs('dewi.lestari@ooalah.id');
    const empSession = await loginAs('budi.santoso@ooalah.id');
    const ft1Session = await loginAs('raka.mahendra@example.id');
    const ft2Session = await loginAs('nadia.kusuma@example.id');
    const tmSession = await loginAs('travel.manager@ooalah.id');
    const vis2Session = await loginAs('larasati.putri@visitor.id');

    const hrToken = hrSession.token;
    const empToken = empSession.token;
    const ft1Token = ft1Session.token;
    const ft2Token = ft2Session.token;
    const tmToken = tmSession.token;
    const vis2Token = vis2Session.token;

    // Cross-role RBAC enforcement checks
    const empApproveAttempt = await requestJson(
      'POST',
      '/api/hr/leaves/LV-2026-004/decision',
      { decision: 'approved' },
      empToken
    );
    assert(empApproveAttempt.status === 403, 'RBAC Guard: Employee dilarang menyetujui cuti (403)', empApproveAttempt);

    const empAuthAttempt = await requestJson(
      'POST',
      '/api/travel-manager/authorize',
      { bookingReference: 'HLM-BOOK02' },
      empToken
    );
    assert(empAuthAttempt.status === 403, 'RBAC Guard: Employee dilarang mengotorisasi booking (403)', empAuthAttempt);

    const visHrAttempt = await requestJson('GET', '/api/hr/leaves', null, vis2Token);
    assert(visHrAttempt.status === 403, 'RBAC Guard: Visitor dilarang mengakses data cuti HR (403)', visHrAttempt);

    const visTmAttempt = await requestJson('GET', '/api/travel-manager/bookings', null, vis2Token);
    assert(visTmAttempt.status === 403, 'RBAC Guard: Visitor dilarang mengakses konsol Travel Manager (403)', visTmAttempt);

    const ftCrossEdit = await requestJson(
      'PUT',
      '/api/frequent-traveller/profile/FT-002',
      { phone: '+628111' },
      ft1Token
    );
    assert(ftCrossEdit.status === 403, 'RBAC Guard: FT-001 dilarang mengubah profil FT-002 (403)', ftCrossEdit);

    const visCrossEmail = await requestJson('GET', '/api/visitors/VIS-001/emails', null, vis2Token);
    assert(visCrossEmail.status === 403, 'RBAC Guard: Visitor 2 dilarang mengintip inbox Visitor 1 (403)', visCrossEmail);

    // 1. US1: HRD Manajer + Approval & Quota Validation
    const us1Date = await requestJson('GET', '/api/hr/leaves?day=23&month=11&year=2026', null, hrToken);
    assert(
      us1Date.status === 200 && us1Date.data.totalLeaveApplications === 2,
      'US1 Task a: Filter jadwal cuti berdasarkan tanggal, bulan, dan tahun (23-11-2026)',
      us1Date.data
    );

    const us1Period = await requestJson('GET', '/api/hr/leaves?startDate=2026-11-01&endDate=2026-11-30', null, hrToken);
    assert(
      us1Period.status === 200 &&
        us1Period.data.leaveApplications.every((l) => l.employeeName && l.leavePeriod && typeof l.durationDays === 'number'),
      'US1 Task b & AC a,b: Pilih periode cuti & tampilkan nama pegawai, periode cuti, dan lama waktu cuti',
      us1Period.data
    );

    const us1History = await requestJson('GET', '/api/hr/employees/Budi%20Santoso/leaves?year=2026', null, hrToken);
    assert(
      us1History.status === 200 &&
        us1History.data.usedLeaveDaysCurrentYear === 8 &&
        us1History.data.remainingLeaveDaysCurrentYear === 4 &&
        us1History.data.leaveHistory.length === 3,
      'US1 Task c & AC c: Riwayat cuti & sisa cuti Budi Santoso (12 - 8 = 4 hari)',
      us1History.data
    );

    const hrApprove = await requestJson(
      'POST',
      '/api/hr/leaves/LV-2026-004/decision',
      { decision: 'approved', note: 'Disetujui untuk koordinasi tim' },
      hrToken
    );
    assert(
      hrApprove.status === 200 &&
        hrApprove.data.leaveApplication.status === 'approved' &&
        hrApprove.data.employeeLeaveSummary.remainingLeaveDaysCurrentYear === 9,
      'Real-World HR Workflow: HRD Manajer menyetujui cuti pending LV-2026-004 & memperbarui sisa kuota (12 - 3 = 9)',
      hrApprove.data
    );

    const empOverQuota = await requestJson(
      'POST',
      '/api/hr/leaves',
      {
        employeeId: 'EMP-001',
        startDate: '2026-12-10',
        endDate: '2026-12-20',
        reason: 'Liburan panjang melebihi sisa kuota'
      },
      empToken
    );
    assert(
      empOverQuota.status === 400,
      'Real-World HR Validation: Pengajuan cuti melebihi sisa kuota (11 > 4 hari) ditolak (400)',
      empOverQuota.data
    );

    const empOverlap = await requestJson(
      'POST',
      '/api/hr/leaves',
      {
        employeeId: 'EMP-001',
        startDate: '2026-11-21',
        endDate: '2026-11-22',
        reason: 'Bentrok cuti'
      },
      empToken
    );
    assert(
      empOverlap.status === 409,
      'Real-World HR Validation: Pengajuan cuti bentrok tanggal dengan cuti existing ditolak (409)',
      empOverlap.data
    );

    // 2. US2: Visitor / Pengguna Booking Online Multi-Pax, Seat Collision, Hold->Pay & Cancel
    const us2Search = await requestJson('GET', '/api/flights?destination=DPS&date=2026-11-20');
    assert(
      us2Search.status === 200 &&
        us2Search.data.totalAvailableFlights === 4 &&
        us2Search.data.airlinePriceSummary.length === 4,
      'US2 Task a & AC a,b: Cari jadwal penerbangan sesuai tujuan (DPS) beserta maskapai & harga tiket',
      us2Search.data
    );

    const ga402Seats = await requestJson('GET', '/api/flights/FL-GA402/seats');
    const ga402Free = ga402Seats.data.rows
      .flatMap((r) => r.seats)
      .filter((s) => !s.isAisle && !s.isOccupied)
      .map((s) => s.seatCode);

    const us2Book = await requestJson(
      'POST',
      '/api/bookings',
      {
        passengerName: 'Larasati Putri',
        passengerEmail: 'larasati.putri@visitor.id',
        flightId: 'FL-GA402',
        status: 'waiting for the payment',
        passengers: [
          { fullName: 'Larasati Putri', identityNumber: '3171022401990005', nationality: 'Indonesia', seatNumber: ga402Free[0] },
          { fullName: 'Tamu Pendamping', identityNumber: '3171022401990009', nationality: 'Indonesia', seatNumber: ga402Free[1] }
        ]
      },
      vis2Token
    );
    assert(
      us2Book.status === 201 &&
        us2Book.data.booking.bookingReference &&
        us2Book.data.booking.passengerCount === 2 &&
        us2Book.data.booking.passengers.length === 2 &&
        us2Book.data.booking.status === 'waiting for the payment' &&
        us2Book.data.availableRouteTicketOptions.length > 0,
      `US2 Task b + Visitor Booking: Visitor pesan 2 penumpang & 2 kursi (${ga402Free[0]}, ${ga402Free[1]})`,
      us2Book.data
    );

    const seatCollision = await requestJson(
      'POST',
      '/api/bookings',
      {
        passengerName: 'Budi Santoso',
        flightId: 'FL-GA402',
        seatNumber: ga402Free[0]
      },
      empToken
    );
    assert(
      seatCollision.status === 409,
      `SQL Transaction Integrity: Double-booking kursi terisi ${ga402Free[0]} ditolak (409 Conflict)`,
      seatCollision.data
    );

    const visPayOwn = await requestJson(
      'POST',
      `/api/bookings/${us2Book.data.booking.bookingId}/pay`,
      { paymentMethod: 'QRIS / Virtual Account Bank' },
      vis2Token
    );
    assert(
      visPayOwn.status === 200 && visPayOwn.data.booking.status === 'confirmed',
      'Visitor Checkout: Visitor dapat membayar reservasi miliknya sendiri hingga confirmed',
      visPayOwn.data
    );

    const us2Cancel = await requestJson(
      'POST',
      `/api/bookings/${us2Book.data.booking.bookingId}/cancel`,
      null,
      vis2Token
    );
    assert(
      us2Cancel.status === 200 &&
        us2Cancel.data.cancelledBooking.status === 'cancelled' &&
        Array.isArray(us2Cancel.data.availableActiveBookings),
      'US2 Task c: Visitor membatalkan tiket miliknya sendiri & memulihkan kursi tersedia',
      us2Cancel.data
    );

    // Employee offline desk booking for walk-in customer
    const empOfflineBook = await requestJson(
      'POST',
      '/api/travel-manager/bookings/visitor',
      {
        visitorName: 'Rendi Walkin',
        visitorEmail: 'rendi.walkin@example.id',
        visitorPhone: '+628123450000',
        flightId: 'FL-GA304'
      },
      empToken
    );
    assert(
      empOfflineBook.status === 201 &&
        empOfflineBook.data.booking.bookedByRole === 'employee' &&
        empOfflineBook.data.eTicketEmailNotification.deliveryStatus === 'DELIVERED',
      'Employee Offline Desk: Karyawan agen dapat memesankan tiket walk-in pelanggan & kirim e-tiket',
      empOfflineBook.data
    );

    // 3. US3: Multi-destination
    const us3MultiDest = await requestJson('GET', '/api/flights/multi-destination?destinations=DPS,SUB,YIA');
    assert(
      us3MultiDest.status === 200 &&
        us3MultiDest.data.resultsByDestination.length === 3 &&
        us3MultiDest.data.totalMatchingFlights >= 6,
      'US3 Task & AC a,b: Cari jadwal penerbangan untuk beberapa tujuan (DPS, SUB, YIA)',
      us3MultiDest.data
    );

    // 4. US4: Frequent Traveller Multi-city
    const us4MultiCity = await requestJson(
      'POST',
      '/api/frequent-traveller/multi-city',
      {
        legs: [
          { origin: 'CGK', destination: 'SUB', date: '2026-11-20' },
          { origin: 'SUB', destination: 'DPS', date: '2026-11-21' },
          { origin: 'DPS', destination: 'UPG', date: '2026-11-22' }
        ]
      },
      ft1Token
    );
    assert(
      us4MultiCity.status === 200 &&
        us4MultiCity.data.totalLegsRequested === 3 &&
        us4MultiCity.data.multiDestinationItinerariesComparison.length > 0 &&
        us4MultiCity.data.multiDestinationItinerariesComparison[0].totalFlights === 3,
      'US4 Task a,b,c & AC: Pencarian & perbandingan harga/jumlah penerbangan multi-destinasi',
      us4MultiCity.data
    );

    // 5. US5: Profile & ticket validation (FT-002 owns FT-002!)
    const us5Incomplete = await requestJson(
      'POST',
      '/api/frequent-traveller/validate-ticket',
      { memberId: 'FT-002' },
      ft2Token
    );
    assert(
      us5Incomplete.status === 400 &&
        us5Incomplete.data.valid === false &&
        us5Incomplete.data.message === 'data profil tidak lengkap',
      'US5 Task c: Validasi tiket dengan profil belum lengkap ditolak ("data profil tidak lengkap")',
      us5Incomplete.data
    );

    const us5Update = await requestJson(
      'PUT',
      '/api/frequent-traveller/profile/FT-002',
      {
        phone: '+6281987654321',
        identityNumber: '3573022010960002',
        birthDate: '1996-10-20',
        address: 'Jl. Ijen No. 45, Malang'
      },
      ft2Token
    );
    assert(
      us5Update.status === 200 && us5Update.data.isProfileComplete === true,
      'US5 Task a & AC a: Update data profil member frequent traveller hingga lengkap',
      us5Update.data
    );

    const us5Valid = await requestJson(
      'POST',
      '/api/frequent-traveller/validate-ticket',
      { memberId: 'FT-002' },
      ft2Token
    );
    assert(
      us5Valid.status === 200 && us5Valid.data.valid === true,
      'US5 Task b & AC b: Validasi tiket berhasil setelah data profil lengkap',
      us5Valid.data
    );

    // 6. US6: Compare & book + miles reversal on cancel
    const us6Compare = await requestJson(
      'GET',
      '/api/frequent-traveller/flights/compare?destination=DPS&date=2026-11-20&departureTime=08:00',
      null,
      ft1Token
    );
    assert(
      us6Compare.status === 200 &&
        us6Compare.data.comparedFlights.length === 3 &&
        us6Compare.data.comparisonSummary.lowestPrice === 1250000,
      'US6 Task a,b & AC a,b: Lihat & bandingkan harga tiket sesuai tujuan, tanggal, dan jam keberangkatan',
      us6Compare.data
    );

    const ftSeatsRes = await requestJson('GET', `/api/flights/${us6Compare.data.comparedFlights[0].flightId}/seats`);
    const ftFreeSeat = ftSeatsRes.data.rows.flatMap((r) => r.seats).find((s) => !s.isAisle && !s.isOccupied).seatCode;

    const beforePts = store.getFrequentTraveller('FT-001').points;
    const us6Book = await requestJson(
      'POST',
      '/api/frequent-traveller/bookings',
      {
        memberId: 'FT-001',
        flightId: us6Compare.data.comparedFlights[0].flightId,
        seatNumber: ftFreeSeat
      },
      ft1Token
    );
    assert(
      us6Book.status === 201 &&
        us6Book.data.bookingPage &&
        us6Book.data.booking.bookingReference &&
        us6Book.data.bookingPage.memberSummary.updatedTotalPoints > beforePts,
      'US6 Task c & AC c: Pesan tiket sesuai pilihan, tampilkan bookingPage & tambah miles',
      us6Book.data
    );

    const ftCancelRes = await requestJson(
      'POST',
      `/api/bookings/${us6Book.data.booking.bookingReference}/cancel`,
      null,
      ft1Token
    );
    assert(
      ftCancelRes.status === 200 && store.getFrequentTraveller('FT-001').points === beforePts,
      'Real-World Club Integrity: Pembatalan booking FT mengembalikan poin miles ke saldo awal',
      { beforePts, afterCancel: store.getFrequentTraveller('FT-001').points }
    );

    // 7. US7: Travel Manager status filter
    const us7All = await requestJson('GET', '/api/travel-manager/bookings', null, tmToken);
    assert(
      us7All.status === 200 && typeof us7All.data.statusSummaryCounts['waiting for the payment'] === 'number',
      'US7 Task a: Manajer travel melihat semua status booking yang tersedia',
      us7All.data.statusSummaryCounts
    );

    const us7Filtered = await requestJson(
      'GET',
      '/api/travel-manager/bookings?status=waiting%20for%20the%20payment',
      null,
      tmToken
    );
    assert(
      us7Filtered.status === 200 &&
        us7Filtered.data.bookings.length >= 1 &&
        us7Filtered.data.bookings.every((b) => b.status === 'waiting for the payment'),
      'US7 Task b & AC: Manajer travel memfilter status booking (waiting for the payment)',
      us7Filtered.data
    );

    // 8. US8: Visitor booking + email (Travel Manager issues, Visitor views own)
    const us8Search = await requestJson('GET', '/api/travel-manager/flights?destination=SUB', null, tmToken);
    assert(
      us8Search.status === 200 && us8Search.data.totalFlightsFound >= 2,
      'US8 Task a & AC a: Manajer travel mencari tiket penerbangan ke tujuan tertentu (SUB)',
      us8Search.data
    );

    const ga304Seats = await requestJson('GET', '/api/flights/FL-GA304/seats');
    const ga304FreeSeat = ga304Seats.data.rows.flatMap((r) => r.seats).find((s) => !s.isAisle && !s.isOccupied).seatCode;

    const us8VisitorBook = await requestJson(
      'POST',
      '/api/travel-manager/bookings/visitor',
      {
        visitorId: 'VIS-002',
        visitorName: 'Larasati Putri',
        visitorEmail: 'larasati.putri@visitor.id',
        visitorPhone: '+6281355443322',
        identityNumber: '3171022401990005',
        flightId: 'FL-GA304',
        seatNumber: ga304FreeSeat
      },
      tmToken
    );
    assert(
      us8VisitorBook.status === 201 && us8VisitorBook.data.eTicketEmailNotification.deliveryStatus === 'DELIVERED',
      'US8 Task b & AC b,d: Manajer travel memesan tiket visitor & mengirim e-tiket ke email',
      us8VisitorBook.data
    );

    const us8VisitorAccount = await requestJson(
      'GET',
      '/api/visitors/larasati.putri@visitor.id/tickets',
      null,
      vis2Token
    );
    assert(
      us8VisitorAccount.status === 200 && us8VisitorAccount.data.totalTicketsInAccount >= 1,
      'US8 AC c: Pengunjung melihat tiket yang terpesan di akunnya sendiri',
      us8VisitorAccount.data
    );

    const us8VisitorEmails = await requestJson(
      'GET',
      '/api/visitors/larasati.putri@visitor.id/emails',
      null,
      vis2Token
    );
    assert(
      us8VisitorEmails.status === 200 && us8VisitorEmails.data.totalEmailsReceived >= 1,
      'US8 AC d: Pengunjung menerima & membaca e-tiket melalui email terdaftar',
      us8VisitorEmails.data
    );

    // 9. US9: Authorization (POST only, GET rejected 405)
    const us9GetBlocked = await requestJson('GET', '/api/travel-manager/authorize/HLM-BOOK02', null, tmToken);
    assert(us9GetBlocked.status === 405, 'Security Fix: GET /api/travel-manager/authorize/:ref ditolak (405)', us9GetBlocked);

    const us9Invalid = await requestJson(
      'POST',
      '/api/travel-manager/authorize',
      { bookingReference: 'KODE-SALAH-999' },
      tmToken
    );
    assert(
      us9Invalid.status === 404 &&
        us9Invalid.data.message === 'kode booking reference tidak sesuai' &&
        us9Invalid.data.requiresRetry === true,
      'US9 Task b: Input kode booking reference tidak sesuai menampilkan pesan & requiresRetry',
      us9Invalid.data
    );

    const us9Valid = await requestJson(
      'POST',
      '/api/travel-manager/authorize',
      { bookingReference: 'HLM-BOOK02', action: 'authorize' },
      tmToken
    );
    assert(
      us9Valid.status === 200 && us9Valid.data.authorized === true && us9Valid.data.bookingStatus === 'confirmed',
      'US9 Task a & AC a,b: Otorisasi tiket menggunakan kode booking reference valid & tampilkan status booking',
      us9Valid.data
    );

    // 10. PRO INTERNATIONAL FEATURES + Audit + SQLite Persistence Check
    const airportsRes = await requestJson('GET', '/api/airports');
    assert(
      airportsRes.status === 200 &&
        airportsRes.data.totalAirports >= 14 &&
        airportsRes.data.airports.every((a) => a.imageUrl && a.terminals.length > 0),
      'PRO 1: Katalog 14 bandara internasional & domestik lengkap',
      { totalAirports: airportsRes.data.totalAirports }
    );

    const intlFlights = await requestJson('GET', '/api/flights?scope=international&destination=SIN');
    assert(
      intlFlights.status === 200 && intlFlights.data.totalAvailableFlights >= 2,
      'PRO 2: Pencarian rute penerbangan internasional (CGK -> SIN)',
      { total: intlFlights.data.totalAvailableFlights }
    );

    const seatMapRes = await requestJson('GET', '/api/flights/FL-SQ953/seats');
    assert(
      seatMapRes.status === 200 && seatMapRes.data.rows.length > 0 && seatMapRes.data.fareTiers.length === 3,
      'PRO 3: Seat map interaktif & fare tiers tersedia',
      { rows: seatMapRes.data.rows.length }
    );

    const payRes = await requestJson(
      'POST',
      '/api/bookings/HLM-WAIT03/pay',
      { paymentMethod: 'Visa Corporate Card', currency: 'USD' },
      tmToken
    );
    assert(
      payRes.status === 200 && payRes.data.booking.status === 'confirmed',
      'PRO 4: Pembayaran checkout mengubah waiting for the payment -> confirmed',
      payRes.data
    );

    const bpRes = await requestJson('GET', '/api/bookings/HLM-INTL04/boarding-pass', null, ft1Token);
    assert(
      bpRes.status === 200 && bpRes.data.qrPayload && bpRes.data.originAirport && bpRes.data.destAirport,
      'PRO 5: Endpoint Boarding Pass QR & info bandara tersedia untuk pemilik tiket',
      { qr: bpRes.data.qrPayload }
    );

    const bpForbidden = await requestJson('GET', '/api/bookings/HLM-INTL04/boarding-pass', null, empToken);
    assert(
      bpForbidden.status === 403,
      'RBAC Guard: Boarding pass milik user lain tidak dapat diakses (403)',
      bpForbidden.data
    );

    // SQLite Persistence Verification across DB close & reopen
    store.closeStore();
    store.loadState();
    const persistedBooking = store.findBookingByIdOrRef('HLM-WAIT03');
    const persistedLeave = store.listLeaveRequests().find((l) => l.leaveId === 'LV-2026-004');
    assert(
      persistedBooking && persistedBooking.status === 'confirmed' && persistedLeave && persistedLeave.status === 'approved',
      'SQLite Persistence: Perubahan data bertahan setelah koneksi database ditutup & dibuka ulang',
      { bookingStatus: persistedBooking?.status, leaveStatus: persistedLeave?.status }
    );

    const auditRes = await requestJson('GET', '/api/audit-logs', null, tmToken);
    assert(
      auditRes.status === 200 && auditRes.data.logs.length >= 6,
      'Audit Trail: Catatan aktivitas aktor terekam di SQLite audit_logs',
      { totalLogs: auditRes.data.logs.length }
    );

    console.log('====================================================================');
    console.log(`SEMUA ${passed} PENGUJIAN INTEGRASI SQLITE, RBAC, US1-US9 & PRO LULUS!`);
    console.log('====================================================================');
  } finally {
    server.close();
    if (customDb) {
      store.resetState();
    } else {
      store.closeStore();
      for (const suffix of ['', '-wal', '-shm']) {
        const f = `${testDbPath}${suffix}`;
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      }
    }
  }
}

module.exports = { runAutomatedTests };
