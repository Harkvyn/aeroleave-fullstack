const http = require('node:http');
const { handleRequest } = require('./routes');
const store = require('./store');

async function runAutomatedTests() {
  store.resetState();
  const server = http.createServer(handleRequest);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const assert = (condition, label, detail) => {
    if (!condition) {
      throw new Error(`GAGAL [${label}]: ${JSON.stringify(detail)}`);
    }
    console.log(`  [PASS] ${label}`);
  };

  const requestJson = async (method, urlPath, bodyObj) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  console.log('====================================================================');
  console.log('MENJALANKAN END-TO-END TEST BACKEND (US1 - US9 + INTERNATIONAL PRO)');
  console.log('====================================================================');

  try {
    // 0. Hallmark Pre-flight check
    const preflight = await requestJson('GET', '/api/hallmark/preflight');
    assert(
      preflight.status === 200 && preflight.data.skillRepo === 'https://github.com/nutlope/hallmark',
      'Hallmark Pre-flight Contract Endpoint (/api/hallmark/preflight)',
      preflight.data
    );

    // 1. US1: HRD Manajer
    const us1Date = await requestJson('GET', '/api/hr/leaves?day=23&month=11&year=2026');
    assert(
      us1Date.status === 200 && us1Date.data.totalLeaveApplications === 2,
      'US1 Task a: Filter jadwal cuti berdasarkan tanggal, bulan, dan tahun (23-11-2026)',
      us1Date.data
    );

    const us1Period = await requestJson('GET', '/api/hr/leaves?startDate=2026-11-01&endDate=2026-11-30');
    assert(
      us1Period.status === 200 &&
        us1Period.data.leaveApplications.every((l) => l.employeeName && l.leavePeriod && typeof l.durationDays === 'number'),
      'US1 Task b & AC a,b: Pilih periode cuti & tampilkan nama pegawai, periode cuti, dan lama waktu cuti',
      us1Period.data
    );

    const us1History = await requestJson('GET', '/api/hr/employees/Budi%20Santoso/leaves?year=2026');
    assert(
      us1History.status === 200 &&
        us1History.data.usedLeaveDaysCurrentYear === 8 &&
        us1History.data.remainingLeaveDaysCurrentYear === 4 &&
        us1History.data.leaveHistory.length === 3,
      'US1 Task c & AC c: Pilih nama pegawai -> tampilkan riwayat cuti & sisa cuti tahun berjalan (12 - 8 = 4 hari)',
      us1History.data
    );

    // 2. US2: Pengguna
    const us2Search = await requestJson('GET', '/api/flights?destination=DPS&date=2026-11-20');
    assert(
      us2Search.status === 200 &&
        us2Search.data.totalAvailableFlights === 4 &&
        us2Search.data.airlinePriceSummary.length === 4,
      'US2 Task a & AC a,b: Cari jadwal penerbangan sesuai tujuan (DPS) beserta maskapai & harga tiket',
      us2Search.data
    );

    const us2Book = await requestJson('POST', '/api/bookings', {
      userId: 'USR-100',
      passengerName: 'Rizky Pratama',
      passengerEmail: 'rizky@example.id',
      flightId: 'FL-GA402',
      seatNumber: '10A'
    });
    assert(
      us2Book.status === 201 &&
        us2Book.data.booking.bookingReference &&
        us2Book.data.availableRouteTicketOptions.length > 0,
      'US2 Task b & AC c: Pesan tiket pesawat yang diinginkan & tampilkan pilihan tiket beserta maskapai',
      us2Book.data
    );

    const us2Cancel = await requestJson('POST', `/api/bookings/${us2Book.data.booking.bookingId}/cancel`);
    assert(
      us2Cancel.status === 200 &&
        us2Cancel.data.cancelledBooking.status === 'cancelled' &&
        Array.isArray(us2Cancel.data.availableActiveBookings),
      'US2 Task c: Batalkan tiket pesawat & tampilkan data pesanan yang tersedia',
      us2Cancel.data
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
    const us4MultiCity = await requestJson('POST', '/api/frequent-traveller/multi-city', {
      legs: [
        { origin: 'CGK', destination: 'SUB', date: '2026-11-20' },
        { origin: 'SUB', destination: 'DPS', date: '2026-11-21' },
        { origin: 'DPS', destination: 'UPG', date: '2026-11-22' }
      ]
    });
    assert(
      us4MultiCity.status === 200 &&
        us4MultiCity.data.totalLegsRequested === 3 &&
        us4MultiCity.data.multiDestinationItinerariesComparison.length > 0 &&
        us4MultiCity.data.multiDestinationItinerariesComparison[0].totalFlights === 3,
      'US4 Task a,b,c & AC: Pencarian & perbandingan harga/jumlah penerbangan multi-destinasi',
      us4MultiCity.data
    );

    // 5. US5: Profile & ticket validation
    const us5Incomplete = await requestJson('POST', '/api/frequent-traveller/validate-ticket', { memberId: 'FT-002' });
    assert(
      us5Incomplete.status === 400 &&
        us5Incomplete.data.valid === false &&
        us5Incomplete.data.message === 'data profil tidak lengkap',
      'US5 Task c: Validasi tiket dengan profil belum lengkap ditolak dengan pesan "data profil tidak lengkap"',
      us5Incomplete.data
    );

    const us5Update = await requestJson('PUT', '/api/frequent-traveller/profile/FT-002', {
      phone: '+6281987654321',
      identityNumber: '3573022010960002',
      birthDate: '1996-10-20',
      address: 'Jl. Ijen No. 45, Malang'
    });
    assert(
      us5Update.status === 200 && us5Update.data.isProfileComplete === true,
      'US5 Task a & AC a: Update data profil member frequent traveller hingga lengkap',
      us5Update.data
    );

    const us5Valid = await requestJson('POST', '/api/frequent-traveller/validate-ticket', { memberId: 'FT-002' });
    assert(
      us5Valid.status === 200 && us5Valid.data.valid === true,
      'US5 Task b & AC b: Validasi tiket berhasil setelah data profil lengkap',
      us5Valid.data
    );

    // 6. US6: Compare & book
    const us6Compare = await requestJson(
      'GET',
      '/api/frequent-traveller/flights/compare?destination=DPS&date=2026-11-20&departureTime=08:00'
    );
    assert(
      us6Compare.status === 200 &&
        us6Compare.data.comparedFlights.length === 3 &&
        us6Compare.data.comparisonSummary.lowestPrice === 1250000,
      'US6 Task a,b & AC a,b: Lihat & bandingkan harga tiket sesuai tujuan, tanggal, dan jam keberangkatan',
      us6Compare.data
    );

    const us6Book = await requestJson('POST', '/api/frequent-traveller/bookings', {
      memberId: 'FT-001',
      flightId: us6Compare.data.comparedFlights[0].flightId,
      seatNumber: '09C'
    });
    assert(
      us6Book.status === 201 && us6Book.data.bookingPage && us6Book.data.booking.bookingReference,
      'US6 Task c & AC c: Pesan tiket sesuai pilihan & tampilkan data halaman pemesanan',
      us6Book.data
    );

    // 7. US7: Travel Manager status filter
    const us7All = await requestJson('GET', '/api/travel-manager/bookings');
    assert(
      us7All.status === 200 && typeof us7All.data.statusSummaryCounts['waiting for the payment'] === 'number',
      'US7 Task a: Manajer travel melihat semua status booking yang tersedia',
      us7All.data
    );

    const us7Filtered = await requestJson('GET', '/api/travel-manager/bookings?status=waiting%20for%20the%20payment');
    assert(
      us7Filtered.status === 200 &&
        us7Filtered.data.bookings.length >= 1 &&
        us7Filtered.data.bookings.every((b) => b.status === 'waiting for the payment'),
      'US7 Task b & AC: Manajer travel memfilter status booking sesuai preferensi (waiting for the payment)',
      us7Filtered.data
    );

    // 8. US8: Visitor booking + email
    const us8Search = await requestJson('GET', '/api/travel-manager/flights?destination=SUB');
    assert(
      us8Search.status === 200 && us8Search.data.totalFlightsFound >= 2,
      'US8 Task a & AC a: Manajer travel mencari tiket penerbangan ke tujuan tertentu (SUB)',
      us8Search.data
    );

    const us8VisitorBook = await requestJson('POST', '/api/travel-manager/bookings/visitor', {
      visitorId: 'VIS-002',
      visitorName: 'Larasati Putri',
      visitorEmail: 'larasati.putri@visitor.id',
      visitorPhone: '+6281355443322',
      identityNumber: '3171022401990005',
      flightId: 'FL-GA304',
      seatNumber: '07A'
    });
    assert(
      us8VisitorBook.status === 201 && us8VisitorBook.data.eTicketEmailNotification.deliveryStatus === 'DELIVERED',
      'US8 Task b & AC b,d: Manajer travel memesan tiket atas nama pengunjung & mengirim e-tiket ke email',
      us8VisitorBook.data
    );

    const us8VisitorAccount = await requestJson('GET', '/api/visitors/larasati.putri@visitor.id/tickets');
    assert(
      us8VisitorAccount.status === 200 && us8VisitorAccount.data.totalTicketsInAccount >= 1,
      'US8 AC c: Pengunjung dapat melihat tiket yang telah terpesan di akunnya',
      us8VisitorAccount.data
    );

    const us8VisitorEmails = await requestJson('GET', '/api/visitors/larasati.putri@visitor.id/emails');
    assert(
      us8VisitorEmails.status === 200 && us8VisitorEmails.data.totalEmailsReceived >= 1,
      'US8 AC d: Pengunjung menerima e-tiket melalui email yang terdaftar',
      us8VisitorEmails.data
    );

    // 9. US9: Authorization
    const us9Invalid = await requestJson('POST', '/api/travel-manager/authorize', { bookingReference: 'KODE-SALAH-999' });
    assert(
      us9Invalid.status === 404 &&
        us9Invalid.data.message === 'kode booking reference tidak sesuai' &&
        us9Invalid.data.requiresRetry === true,
      'US9 Task b: Input kode booking reference tidak sesuai menampilkan "kode booking reference tidak sesuai" & meminta ulang input',
      us9Invalid.data
    );

    const us9Valid = await requestJson('POST', '/api/travel-manager/authorize', {
      bookingReference: 'HLM-BOOK02',
      action: 'authorize'
    });
    assert(
      us9Valid.status === 200 && us9Valid.data.authorized === true && us9Valid.data.bookingStatus === 'confirmed',
      'US9 Task a & AC a,b: Otorisasi tiket menggunakan kode booking reference valid & tampilkan status booking',
      us9Valid.data
    );

    // 10. PRO INTERNATIONAL FEATURES: Airports, Seat Map, Payment & Boarding Pass
    const airportsRes = await requestJson('GET', '/api/airports');
    assert(
      airportsRes.status === 200 &&
        airportsRes.data.totalAirports >= 14 &&
        airportsRes.data.airports.every((a) => a.imageUrl && a.terminals.length > 0),
      'PRO 1: Katalog 14 bandara internasional & domestik lengkap dengan URL foto & terminal',
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
      'PRO 3: Seat map interaktif & fare tiers (Lite, Standard, Flex) tersedia untuk penerbangan internasional',
      { rows: seatMapRes.data.rows.length }
    );

    const payRes = await requestJson('POST', '/api/bookings/HLM-WAIT03/pay', {
      paymentMethod: 'Visa Corporate Card',
      currency: 'USD'
    });
    assert(
      payRes.status === 200 && payRes.data.booking.status === 'confirmed',
      'PRO 4: Pembayaran checkout mengubah status waiting for the payment -> confirmed',
      payRes.data
    );

    const bpRes = await requestJson('GET', '/api/bookings/HLM-INTL04/boarding-pass');
    assert(
      bpRes.status === 200 && bpRes.data.qrPayload && bpRes.data.originAirport && bpRes.data.destAirport,
      'PRO 5: Endpoint Boarding Pass QR & info bandara asal/tujuan tersedia',
      { qr: bpRes.data.qrPayload }
    );

    console.log('====================================================================');
    console.log('SEMUA 24 PENGUJIAN INTEGRASI (19 US1-US9 + 5 PRO INTL) BERHASIL LULUS!');
    console.log('====================================================================');
  } finally {
    store.resetState();
    server.close();
  }
}

module.exports = { runAutomatedTests };
