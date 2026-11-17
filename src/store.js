const crypto = require('node:crypto');
const path = require('node:path');
const {
  openDatabase,
  withTransaction,
  seedDatabase,
  mapAirportRow,
  mapEmployeeRow,
  mapLeaveRow,
  mapFlightRow,
  mapFtRow,
  mapVisitorRow,
  mapBookingRow,
  mapEmailRow,
  mapAuditRow
} = require('./db');
const { createInitialState } = require('./data/seed');
const {
  ROLE_DEFINITIONS,
  SESSION_TTL_HOURS,
  verifyPassword,
  hashToken,
  generateSessionToken,
  sanitizeUser,
  canAccessBooking
} = require('./auth');
const {
  calculateInclusiveDays,
  evaluateProfileCompleteness,
  generateBookingReference,
  buildEmployeeLeaveSummary,
  buildCabinSeatMap,
  computeBookingPricing,
  normalizeSeatCode,
  datesOverlap,
  createHttpError
} = require('./helpers');

let activeDbPath = process.env.DB_FILE || path.join(__dirname, '..', 'aeroleave.db');
let dbInstance = null;

function getDbPath() {
  return activeDbPath;
}

function getDb() {
  if (!dbInstance) {
    loadState();
  }
  return dbInstance;
}

function closeStore() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {
      // ignore close errors
    }
    dbInstance = null;
  }
}

function setDbFile(nextPath) {
  closeStore();
  activeDbPath = nextPath;
}

function loadState() {
  const targetPath = process.env.DB_FILE || activeDbPath;
  if (dbInstance && targetPath !== activeDbPath) {
    closeStore();
    activeDbPath = targetPath;
  } else {
    activeDbPath = targetPath;
  }

  if (!dbInstance) {
    dbInstance = openDatabase(activeDbPath);
  }

  const hasMeta = dbInstance.prepare("SELECT key FROM meta_kv WHERE key = 'meta'").get();
  if (!hasMeta) {
    seedDatabase(dbInstance, createInitialState(), { preserveSessions: false });
  }
  return dbInstance;
}

function resetState({ preserveSessions = false } = {}) {
  const db = getDb();
  seedDatabase(db, createInitialState(), { preserveSessions });
  return true;
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(100, 999)}`;
}

function recordAudit(db, actor, action, entityType, entityId, summary) {
  db.prepare(`
    INSERT INTO audit_logs (
      audit_id, actor_user_id, actor_name, actor_role, action,
      entity_type, entity_id, summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextId('AUD'),
    actor ? actor.userId : null,
    actor ? actor.fullName : 'System',
    actor ? actor.role : 'system',
    action,
    entityType,
    entityId,
    summary,
    new Date().toISOString()
  );
}

// ---------------------------------------------------------------------------
// READ HELPERS
// ---------------------------------------------------------------------------
function getMeta() {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM meta_kv WHERE key = 'meta'").get();
  return row ? JSON.parse(row.value_json) : createInitialState().meta;
}

function getCurrencies() {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM meta_kv WHERE key = 'currencies'").get();
  return row ? JSON.parse(row.value_json) : createInitialState().currencies;
}

function listAirports() {
  return getDb().prepare('SELECT * FROM airports ORDER BY code ASC').all().map(mapAirportRow);
}

function getAirport(code) {
  const row = getDb().prepare('SELECT * FROM airports WHERE code = ?').get(String(code || '').toUpperCase());
  return row ? mapAirportRow(row) : null;
}

function listFlights() {
  return getDb().prepare('SELECT * FROM flights ORDER BY date ASC, departure_time ASC').all().map(mapFlightRow);
}

function getFlight(flightId) {
  const row = getDb().prepare('SELECT * FROM flights WHERE flight_id = ?').get(flightId);
  return row ? mapFlightRow(row) : null;
}

function listEmployees() {
  return getDb().prepare('SELECT * FROM employees ORDER BY employee_id ASC').all().map(mapEmployeeRow);
}

function getEmployeeById(employeeId) {
  const row = getDb().prepare('SELECT * FROM employees WHERE employee_id = ?').get(employeeId);
  return row ? mapEmployeeRow(row) : null;
}

function listLeaveRequests() {
  return getDb().prepare('SELECT * FROM leave_requests ORDER BY submitted_at DESC').all().map(mapLeaveRow);
}

function listFrequentTravellers() {
  return getDb().prepare('SELECT * FROM frequent_travellers ORDER BY member_id ASC').all().map(mapFtRow);
}

function getFrequentTraveller(memberId) {
  const row = getDb().prepare('SELECT * FROM frequent_travellers WHERE member_id = ?').get(memberId);
  return row ? mapFtRow(row) : null;
}

function listVisitors() {
  return getDb().prepare('SELECT * FROM visitors ORDER BY visitor_id ASC').all().map(mapVisitorRow);
}

function hydrateBookings(db, bookingRows) {
  if (!bookingRows.length) return [];
  const paxStmt = db.prepare(
    'SELECT * FROM booking_passengers WHERE booking_id = ? ORDER BY passenger_index ASC'
  );
  return bookingRows.map((row) => mapBookingRow(row, paxStmt.all(row.booking_id)));
}

function listAllBookings() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return hydrateBookings(db, rows);
}

function listFlightActiveBookings(flightId) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM bookings WHERE flight_id = ? AND status != 'cancelled'")
    .all(flightId);
  return hydrateBookings(db, rows);
}

function findBookingByIdOrRef(idOrRef) {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM bookings WHERE booking_id = ? OR booking_reference = ?')
    .get(idOrRef, idOrRef);
  return row ? hydrateBookings(db, [row])[0] : null;
}

function listEmailNotifications() {
  return getDb()
    .prepare('SELECT * FROM email_notifications ORDER BY sent_at DESC')
    .all()
    .map(mapEmailRow);
}

function listAuditLogs(limit = 50) {
  return getDb()
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .map(mapAuditRow);
}

// ---------------------------------------------------------------------------
// AUTH & SESSIONS
// ---------------------------------------------------------------------------
function listDemoActors() {
  const rows = getDb()
    .prepare(
      `SELECT user_id, email, full_name, role, role_label, department,
              employee_id, member_id, visitor_id
       FROM users
       ORDER BY CASE role
         WHEN 'employee' THEN 1
         WHEN 'hr_manager' THEN 2
         WHEN 'frequent_traveller' THEN 3
         WHEN 'travel_manager' THEN 4
         WHEN 'visitor' THEN 5
         ELSE 6
       END, user_id ASC`
    )
    .all();
  return rows.map(sanitizeUser);
}

function createSessionForUser(db, userRow) {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash,
    userRow.user_id,
    now.toISOString(),
    expiresAt
  );

  return { token: rawToken, expiresAt, user: sanitizeUser(userRow) };
}

function authenticateWithPassword(email, password) {
  const db = getDb();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (!userRow || !verifyPassword(password, userRow.password_salt, userRow.password_hash)) {
    throw createHttpError(401, 'Email atau kata sandi tidak valid.');
  }
  const session = createSessionForUser(db, userRow);
  recordAudit(db, session.user, 'LOGIN', 'session', session.user.userId, `${session.user.fullName} (${session.user.role}) masuk ke sistem.`);
  return session;
}

function authenticateDemoUser(userId) {
  const db = getDb();
  const userRow = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!userRow) {
    throw createHttpError(404, 'Akun demo aktor tidak ditemukan.');
  }
  const session = createSessionForUser(db, userRow);
  recordAudit(db, session.user, 'LOGIN_DEMO', 'session', session.user.userId, `Switch aktor demo ke ${session.user.fullName} (${session.user.role}).`);
  return session;
}

function getUserByToken(rawToken) {
  if (!rawToken) return null;
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return sanitizeUser(row);
}

function revokeSession(rawToken) {
  if (!rawToken) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
}

// ---------------------------------------------------------------------------
// SCOPED WORKBENCH STATE FOR UI
// ---------------------------------------------------------------------------
function getScopedState(user) {
  const meta = getMeta();
  const currencies = getCurrencies();
  const airports = listAirports();
  const flights = listFlights();
  const demoActors = listDemoActors();

  if (!user) {
    return {
      meta,
      currencies,
      airports,
      flights,
      currentUser: null,
      roleDefinitions: ROLE_DEFINITIONS,
      demoActors,
      employees: [],
      leaveRequests: [],
      frequentTravellers: [],
      visitors: [],
      bookings: [],
      emailNotifications: [],
      auditLogs: []
    };
  }

  let employees = [];
  let leaveRequests = [];
  let frequentTravellers = [];
  let visitors = [];
  let bookings = [];
  let emailNotifications = [];
  let auditLogs = [];

  const allBookings = listAllBookings();

  if (user.role === 'hr_manager') {
    employees = listEmployees();
    leaveRequests = listLeaveRequests();
    bookings = allBookings.filter((b) => canAccessBooking(user, b));
    auditLogs = listAuditLogs(60).filter(
      (a) => a.entityType === 'leave_request' || a.actorUserId === user.userId
    );
  } else if (user.role === 'employee') {
    if (user.employeeId) {
      const emp = getEmployeeById(user.employeeId);
      if (emp) employees = [emp];
      leaveRequests = listLeaveRequests().filter((lv) => lv.employeeId === user.employeeId);
    }
    visitors = listVisitors();
    bookings = allBookings.filter((b) => canAccessBooking(user, b));
    const issuedRefs = new Set(bookings.map((b) => b.bookingReference));
    emailNotifications = listEmailNotifications().filter((e) => issuedRefs.has(e.bookingReference));
  } else if (user.role === 'frequent_traveller') {
    if (user.memberId) {
      const ft = getFrequentTraveller(user.memberId);
      if (ft) frequentTravellers = [ft];
    }
    bookings = allBookings.filter((b) => canAccessBooking(user, b));
  } else if (user.role === 'travel_manager') {
    bookings = allBookings;
    visitors = listVisitors();
    emailNotifications = listEmailNotifications();
    auditLogs = listAuditLogs(60);
  } else if (user.role === 'visitor') {
    if (user.visitorId) {
      const vis = listVisitors().find((v) => v.visitorId === user.visitorId);
      if (vis) visitors = [vis];
    }
    bookings = allBookings.filter((b) => canAccessBooking(user, b));
    emailNotifications = listEmailNotifications().filter(
      (e) =>
        (user.visitorId && e.visitorId === user.visitorId) ||
        String(e.recipientEmail).toLowerCase() === String(user.email).toLowerCase()
    );
  }

  return {
    meta,
    currencies,
    airports,
    flights,
    currentUser: user,
    roleDefinitions: ROLE_DEFINITIONS,
    demoActors,
    employees,
    leaveRequests,
    frequentTravellers,
    visitors,
    bookings,
    emailNotifications,
    auditLogs
  };
}

// ---------------------------------------------------------------------------
// DOMAIN MUTATIONS (TRANSACTIONAL SQL)
// ---------------------------------------------------------------------------
function submitLeaveRequest(actor, payload) {
  const db = getDb();
  const meta = getMeta();
  const requestedEmpId = payload.employeeId || actor.employeeId;

  if (!requestedEmpId || !payload.startDate || !payload.endDate || !String(payload.reason || '').trim()) {
    throw createHttpError(400, 'employeeId, startDate, endDate, dan reason wajib diisi');
  }

  if (actor.role !== 'hr_manager' && requestedEmpId !== actor.employeeId) {
    throw createHttpError(403, 'Karyawan hanya dapat mengajukan cuti untuk akun dirinya sendiri.');
  }

  const durationDays = calculateInclusiveDays(payload.startDate, payload.endDate);
  if (!durationDays || durationDays <= 0) {
    throw createHttpError(400, 'Rentang tanggal cuti tidak valid (endDate harus >= startDate).');
  }

  const leaveType = ['annual', 'sick', 'personal', 'business_trip_leave'].includes(payload.leaveType)
    ? payload.leaveType
    : 'annual';

  return withTransaction(db, () => {
    const empRow = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(requestedEmpId);
    if (!empRow) {
      throw createHttpError(404, 'Pegawai tidak ditemukan');
    }
    const employee = mapEmployeeRow(empRow);
    const empLeaves = db
      .prepare('SELECT * FROM leave_requests WHERE employee_id = ?')
      .all(requestedEmpId)
      .map(mapLeaveRow);

    const overlapping = empLeaves.find(
      (lv) => lv.status !== 'rejected' && datesOverlap(payload.startDate, payload.endDate, lv.startDate, lv.endDate)
    );
    if (overlapping) {
      throw createHttpError(
        409,
        `Tanggal cuti bentrok dengan pengajuan ${overlapping.leaveId} (${overlapping.startDate} s/d ${overlapping.endDate}).`
      );
    }

    if (leaveType === 'annual') {
      const targetYear = String(payload.startDate).slice(0, 4) || String(meta.currentYear);
      const summary = buildEmployeeLeaveSummary(employee, empLeaves, meta.currentYear, targetYear);
      if (durationDays > summary.remainingLeaveDaysCurrentYear) {
        throw createHttpError(
          400,
          `Sisa kuota cuti tahunan tidak mencukupi (tersisa ${summary.remainingLeaveDaysCurrentYear} hari, diajukan ${durationDays} hari).`
        );
      }
    }

    const leaveId = `LV-${meta.currentYear}-${String(Date.now()).slice(-5)}`;
    const nowIso = new Date().toISOString();
    const initialStatus = 'pending';

    db.prepare(`
      INSERT INTO leave_requests (
        leave_id, employee_id, employee_name, leave_type, start_date, end_date,
        duration_days, reason, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      leaveId,
      employee.employeeId,
      employee.employeeName,
      leaveType,
      payload.startDate,
      payload.endDate,
      durationDays,
      String(payload.reason).trim(),
      initialStatus,
      nowIso
    );

    const created = mapLeaveRow(db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId));
    recordAudit(
      db,
      actor,
      'LEAVE_SUBMITTED',
      'leave_request',
      leaveId,
      `${actor.fullName} mengajukan cuti ${employee.employeeName} (${durationDays} hari: ${payload.startDate} s/d ${payload.endDate}).`
    );

    const updatedLeaves = db
      .prepare('SELECT * FROM leave_requests WHERE employee_id = ?')
      .all(requestedEmpId)
      .map(mapLeaveRow);

    return {
      leaveApplication: created,
      employeeLeaveSummary: buildEmployeeLeaveSummary(employee, updatedLeaves, meta.currentYear)
    };
  });
}

function decideLeaveRequest(actor, leaveId, decision, note = '') {
  if (actor.role !== 'hr_manager') {
    throw createHttpError(403, 'Hanya HRD Manajer yang berwenang menyetujui atau menolak pengajuan cuti.');
  }
  const normalizedDecision = String(decision || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalizedDecision)) {
    throw createHttpError(400, 'Keputusan cuti harus berupa approved atau rejected.');
  }

  const db = getDb();
  const meta = getMeta();

  return withTransaction(db, () => {
    const lvRow = db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId);
    if (!lvRow) {
      throw createHttpError(404, 'Data pengajuan cuti tidak ditemukan.');
    }
    if (lvRow.status !== 'pending') {
      throw createHttpError(400, `Pengajuan cuti ${leaveId} sudah berstatus ${lvRow.status}.`);
    }

    const empRow = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(lvRow.employee_id);
    if (!empRow) {
      throw createHttpError(404, 'Pegawai terkait tidak ditemukan.');
    }
    const employee = mapEmployeeRow(empRow);

    if (normalizedDecision === 'approved' && (lvRow.leave_type || 'annual') === 'annual') {
      const targetYear = String(lvRow.start_date).slice(0, 4) || String(meta.currentYear);
      const empLeaves = db
        .prepare('SELECT * FROM leave_requests WHERE employee_id = ?')
        .all(lvRow.employee_id)
        .map(mapLeaveRow);
      const summary = buildEmployeeLeaveSummary(employee, empLeaves, meta.currentYear, targetYear);
      if (lvRow.duration_days > summary.remainingLeaveDaysCurrentYear) {
        throw createHttpError(
          400,
          `Tidak dapat menyetujui: sisa kuota cuti ${employee.employeeName} hanya ${summary.remainingLeaveDaysCurrentYear} hari.`
        );
      }
    }

    const nowIso = new Date().toISOString();
    const cleanNote = String(note || '').trim() || (normalizedDecision === 'approved' ? 'Disetujui HRD.' : 'Ditolak HRD.');

    db.prepare(`
      UPDATE leave_requests
      SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?, decision_note = ?
      WHERE leave_id = ?
    `).run(normalizedDecision, actor.userId, actor.fullName, nowIso, cleanNote, leaveId);

    const updated = mapLeaveRow(db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId));
    recordAudit(
      db,
      actor,
      normalizedDecision === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      'leave_request',
      leaveId,
      `${actor.fullName} ${normalizedDecision === 'approved' ? 'menyetujui' : 'menolak'} cuti ${employee.employeeName} (${lvRow.duration_days} hari).`
    );

    const allEmpLeaves = db
      .prepare('SELECT * FROM leave_requests WHERE employee_id = ?')
      .all(lvRow.employee_id)
      .map(mapLeaveRow);

    return {
      leaveApplication: updated,
      employeeLeaveSummary: buildEmployeeLeaveSummary(employee, allEmpLeaves, meta.currentYear)
    };
  });
}

function validateAndCollectSeatSelection(db, flight, rawPassengers, fallbackName, fallbackIdNum, fallbackNat, fallbackSeats) {
  const existingFlightBookings = listFlightActiveBookingsForDb(db, flight.flightId);
  const seatMap = buildCabinSeatMap(flight, existingFlightBookings);
  const seatLookup = new Map();
  for (const row of seatMap.rows) {
    for (const s of row.seats) {
      if (!s.isAisle) {
        seatLookup.set(normalizeSeatCode(s.seatCode), s);
      }
    }
  }

  let paxInputs = Array.isArray(rawPassengers) && rawPassengers.length > 0 ? rawPassengers : null;
  const seatList = Array.isArray(fallbackSeats)
    ? fallbackSeats.map(normalizeSeatCode).filter(Boolean)
    : String(fallbackSeats || '')
        .split(',')
        .map(normalizeSeatCode)
        .filter(Boolean);

  if (!paxInputs) {
    const count = Math.max(1, seatList.length || 1);
    paxInputs = Array.from({ length: count }, (_, idx) => ({
      fullName: idx === 0 ? fallbackName : `${fallbackName} (${idx + 1})`,
      identityNumber: fallbackIdNum || '',
      nationality: fallbackNat || 'Indonesia',
      seatNumber: seatList[idx] || ''
    }));
  }

  const seenSeats = new Set();
  const normalizedPassengers = [];

  for (let idx = 0; idx < paxInputs.length; idx += 1) {
    const p = paxInputs[idx];
    const fullName = String(p.fullName || fallbackName || '').trim();
    if (!fullName) {
      throw createHttpError(400, `Nama penumpang ke-${idx + 1} wajib diisi.`);
    }

    let chosenSeat = normalizeSeatCode(p.seatNumber || seatList[idx]);
    if (!chosenSeat) {
      const firstFree = Array.from(seatLookup.values()).find(
        (s) => !s.isOccupied && !seenSeats.has(s.seatCode)
      );
      if (!firstFree) {
        throw createHttpError(409, 'Tidak ada kursi kosong tersisa pada kabin ini.');
      }
      chosenSeat = firstFree.seatCode;
    }

    if (seenSeats.has(chosenSeat)) {
      throw createHttpError(400, `Kursi ${chosenSeat} dipilih lebih dari satu penumpang.`);
    }
    seenSeats.add(chosenSeat);

    const seatMeta = seatLookup.get(chosenSeat);
    if (seatMeta && seatMeta.isOccupied) {
      throw createHttpError(409, `Kursi ${chosenSeat} sudah terisi. Silakan pilih kursi lain.`);
    }

    normalizedPassengers.push({
      passengerIndex: idx + 1,
      fullName,
      identityNumber: String(p.identityNumber ?? fallbackIdNum ?? '').trim(),
      nationality: String(p.nationality || fallbackNat || 'Indonesia').trim(),
      seatNumber: chosenSeat,
      seatFee: seatMeta ? seatMeta.seatFee : 0
    });
  }

  return normalizedPassengers;
}

function listFlightActiveBookingsForDb(db, flightId) {
  const rows = db
    .prepare("SELECT * FROM bookings WHERE flight_id = ? AND status != 'cancelled'")
    .all(flightId);
  return hydrateBookings(db, rows);
}

function appendEmailNotification(db, { recipientEmail, recipientName, visitorId, booking, statusLabel }) {
  const emailId = nextId('EML');
  const nowIso = new Date().toISOString();
  const payload = {
    bookingReference: booking.bookingReference,
    eTicketNumber: booking.eTicketNumber,
    passengerName: booking.passengerName,
    flightNumber: booking.flightNumber,
    airline: booking.airline,
    route: `${booking.origin} -> ${booking.destination}`,
    date: booking.date,
    departureTime: booking.departureTime,
    arrivalTime: booking.arrivalTime,
    seatNumber: booking.seatNumber,
    status: statusLabel || booking.status
  };

  db.prepare(`
    INSERT INTO email_notifications (
      email_id, recipient_email, recipient_name, visitor_id, subject,
      booking_reference, e_ticket_number, sent_at, delivery_status, e_ticket_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    emailId,
    recipientEmail,
    recipientName,
    visitorId || null,
    `E-Tiket Penerbangan ${booking.airline} ${booking.flightNumber} (Kode Booking: ${booking.bookingReference})`,
    booking.bookingReference,
    booking.eTicketNumber,
    nowIso,
    'DELIVERED',
    JSON.stringify(payload)
  );

  return mapEmailRow(db.prepare('SELECT * FROM email_notifications WHERE email_id = ?').get(emailId));
}

function createUserBooking(actor, payload) {
  const db = getDb();
  const meta = getMeta();
  if (!payload.flightId) {
    throw createHttpError(400, 'flightId wajib diisi');
  }

  const primaryName = String(payload.passengerName || actor.fullName || '').trim();
  const primaryEmail = String(payload.passengerEmail || actor.email || '').trim();
  if (!primaryName) {
    throw createHttpError(400, 'passengerName wajib diisi');
  }

  return withTransaction(db, () => {
    const flightRow = db.prepare('SELECT * FROM flights WHERE flight_id = ?').get(payload.flightId);
    if (!flightRow) {
      throw createHttpError(404, 'Penerbangan tidak ditemukan');
    }
    const flight = mapFlightRow(flightRow);

    const paxCountRequested = Math.max(
      1,
      Array.isArray(payload.passengers) && payload.passengers.length > 0
        ? payload.passengers.length
        : Number(payload.passengerCount) || 1
    );

    if (flight.seatsAvailable < paxCountRequested) {
      throw createHttpError(400, 'Kursi tersedia tidak mencukupi');
    }

    const passengers = validateAndCollectSeatSelection(
      db,
      flight,
      Array.isArray(payload.passengers) && payload.passengers.length > 0
        ? payload.passengers
        : Array.from({ length: paxCountRequested }, (_, idx) => ({
            fullName: idx === 0 ? primaryName : `${primaryName} (${idx + 1})`,
            identityNumber: payload.identityNumber || '',
            nationality: payload.nationality || 'Indonesia',
            seatNumber: Array.isArray(payload.seatNumbers)
              ? payload.seatNumbers[idx]
              : idx === 0
              ? payload.seatNumber
              : ''
          })),
      primaryName,
      payload.identityNumber,
      payload.nationality,
      payload.seatNumbers || payload.seatNumber
    );

    const paxCount = passengers.length;
    const seatFees = passengers.map((p) => p.seatFee);
    const pricing = computeBookingPricing(flight, payload.fareTier || 'Standard', seatFees, paxCount);

    const travelPurpose = payload.bookingChannel || payload.travelPurpose || 'online';
    const isDirectSelfPay =
      Boolean(payload.paymentMethod) &&
      payload.status !== 'waiting for the payment' &&
      payload.status !== 'booked';

    let finalStatus = 'booked';
    let authorized = 0;
    let authorizedAt = null;
    let authorizedBy = null;
    let authNote = null;
    let ticketValidated = 0;
    let validatedAt = null;
    let paidAmount = null;
    let paidAt = null;
    const paymentMethod = payload.paymentMethod || null;
    const nowIso = new Date().toISOString();

    if (isDirectSelfPay) {
      finalStatus = 'confirmed';
      authorized = 1;
      authorizedBy = actor.role === 'travel_manager' ? actor.userId : null;
      authorizedAt = nowIso;
      authNote = 'Pembayaran online terkonfirmasi.';
      ticketValidated = 1;
      validatedAt = nowIso;
      paidAmount = pricing.totalAmount;
      paidAt = nowIso;
    } else if (payload.status === 'waiting for the payment') {
      finalStatus = 'waiting for the payment';
      authorized = 0;
      authNote = 'Reservasi tersimpan, menunggu pelunasan pembayaran.';
    } else {
      finalStatus = 'booked';
      authorized = 0;
      authNote = 'Reservasi tersimpan (booked), menunggu pembayaran atau otorisasi Travel Manager.';
    }

    const bookingId = nextId('BK');
    const bookingReference = generateBookingReference();
    const eTicketNumber = `ETKT-${flight.flightNumber.replace('-', '')}-${String(Date.now()).slice(-4)}`;
    const seatSummary = passengers.map((p) => p.seatNumber).join(', ');
    const memberId = actor.role === 'frequent_traveller' ? actor.memberId : null;
    const visitorId = actor.role === 'visitor' ? actor.visitorId : null;
    const bookingType = memberId ? 'frequent_traveller' : visitorId ? 'visitor' : 'user';
    const milesEarned = memberId ? Math.round(pricing.totalAmount / 1000) : 0;

    db.prepare(`
      INSERT INTO bookings (
        booking_id, booking_reference, booking_type, travel_purpose, booked_by_user_id,
        booked_by_role, user_id, member_id, visitor_id, passenger_name, passenger_email,
        passenger_phone, identity_number, nationality, passenger_count, flight_id,
        flight_number, airline, origin, destination, date, departure_time, arrival_time,
        base_price, price, cabin_class, fare_tier, seat_number, terminal_origin, gate,
        special_request, payment_method, payment_currency, paid_amount, paid_at, status,
        authorized_by_travel_manager, authorized_by_user_id, authorized_at, authorization_note,
        ticket_validated, validated_at, e_ticket_number, miles_earned, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId,
      bookingReference,
      bookingType,
      travelPurpose,
      actor.userId,
      actor.role,
      payload.userId || actor.userId,
      memberId,
      visitorId,
      primaryName,
      primaryEmail,
      String(payload.passengerPhone || '').trim(),
      String(payload.identityNumber || passengers[0].identityNumber || '').trim(),
      String(payload.nationality || passengers[0].nationality || 'Indonesia').trim(),
      paxCount,
      flight.flightId,
      flight.flightNumber,
      flight.airline,
      flight.origin,
      flight.destination,
      flight.date,
      flight.departureTime,
      flight.arrivalTime,
      flight.price,
      pricing.totalAmount,
      flight.cabinClass,
      pricing.fareTier,
      seatSummary,
      flight.terminalOrigin || '',
      flight.gate || '',
      String(payload.specialRequest || '').trim(),
      paymentMethod,
      payload.paymentCurrency || meta.currency || 'IDR',
      paidAmount,
      paidAt,
      finalStatus,
      authorized,
      authorizedBy,
      authorizedAt,
      authNote,
      ticketValidated,
      validatedAt,
      eTicketNumber,
      milesEarned,
      nowIso
    );

    const insertPax = db.prepare(`
      INSERT INTO booking_passengers (
        booking_id, passenger_index, full_name, identity_number, nationality, seat_number, seat_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of passengers) {
      insertPax.run(bookingId, p.passengerIndex, p.fullName, p.identityNumber, p.nationality, p.seatNumber, p.seatFee);
    }

    db.prepare('UPDATE flights SET seats_available = seats_available - ? WHERE flight_id = ?').run(
      paxCount,
      flight.flightId
    );

    if (memberId && milesEarned > 0) {
      db.prepare('UPDATE frequent_travellers SET points = points + ? WHERE member_id = ?').run(
        milesEarned,
        memberId
      );
    }

    const createdBooking = findBookingByIdOrRef(bookingId);
    if (finalStatus === 'confirmed' && primaryEmail) {
      appendEmailNotification(db, {
        recipientEmail: primaryEmail,
        recipientName: primaryName,
        visitorId,
        booking: createdBooking,
        statusLabel: finalStatus
      });
    }

    recordAudit(
      db,
      actor,
      'BOOKING_CREATED',
      'booking',
      bookingReference,
      `${actor.fullName} memesan ${flight.flightNumber} (${flight.origin} -> ${flight.destination}, ${paxCount} pax, kursi ${seatSummary}) [${finalStatus}].`
    );

    return {
      booking: createdBooking,
      pricing,
      flight
    };
  });
}

function payBooking(actor, idOrRef, payload = {}) {
  const db = getDb();
  const meta = getMeta();
  return withTransaction(db, () => {
    const booking = findBookingByIdOrRef(idOrRef);
    if (!booking) {
      throw createHttpError(404, 'Booking tidak ditemukan');
    }
    if (!canAccessBooking(actor, booking)) {
      throw createHttpError(403, 'Anda tidak berwenang membayar reservasi ini.');
    }
    if (booking.status === 'cancelled') {
      throw createHttpError(400, 'Booking sudah dibatalkan dan tidak dapat dibayar');
    }

    const nowIso = new Date().toISOString();
    const paymentMethod = payload.paymentMethod || booking.paymentMethod || 'International Card (Visa / Mastercard)';
    const paymentCurrency = payload.currency || booking.paymentCurrency || meta.currency || 'IDR';
    const paidAmount = booking.price;

    db.prepare(`
      UPDATE bookings
      SET status = 'confirmed',
          payment_method = ?,
          payment_currency = ?,
          paid_amount = ?,
          paid_at = ?,
          authorized_by_travel_manager = 1,
          authorized_at = COALESCE(authorized_at, ?),
          ticket_validated = 1,
          validated_at = ?
      WHERE booking_id = ?
    `).run(paymentMethod, paymentCurrency, paidAmount, nowIso, nowIso, nowIso, booking.bookingId);

    const updated = findBookingByIdOrRef(booking.bookingId);
    let emailNotification = null;
    if (updated.passengerEmail) {
      emailNotification = appendEmailNotification(db, {
        recipientEmail: updated.passengerEmail,
        recipientName: updated.passengerName,
        visitorId: updated.visitorId,
        booking: updated,
        statusLabel: 'confirmed'
      });
    }

    recordAudit(
      db,
      actor,
      'BOOKING_PAID',
      'booking',
      updated.bookingReference,
      `${actor.fullName} menyelesaikan pembayaran ${updated.bookingReference} (${paymentMethod}).`
    );

    return { booking: updated, emailNotification };
  });
}

function cancelBooking(actor, idOrRef) {
  const db = getDb();
  return withTransaction(db, () => {
    const booking = findBookingByIdOrRef(idOrRef);
    if (!booking) {
      throw createHttpError(404, 'Data pemesanan tidak ditemukan');
    }
    if (!canAccessBooking(actor, booking)) {
      throw createHttpError(403, 'Anda tidak berwenang membatalkan reservasi ini.');
    }
    if (booking.status === 'cancelled') {
      throw createHttpError(400, 'Booking sudah berstatus cancelled.');
    }

    const nowIso = new Date().toISOString();
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE booking_id = ?").run(
      nowIso,
      booking.bookingId
    );
    db.prepare('UPDATE flights SET seats_available = seats_available + ? WHERE flight_id = ?').run(
      booking.passengerCount || 1,
      booking.flightId
    );

    if (booking.bookingType === 'frequent_traveller' && booking.memberId && booking.milesEarned > 0) {
      db.prepare('UPDATE frequent_travellers SET points = MAX(0, points - ?) WHERE member_id = ?').run(
        booking.milesEarned,
        booking.memberId
      );
    }

    const cancelledBooking = findBookingByIdOrRef(booking.bookingId);
    recordAudit(
      db,
      actor,
      'BOOKING_CANCELLED',
      'booking',
      cancelledBooking.bookingReference,
      `${actor.fullName} membatalkan reservasi ${cancelledBooking.bookingReference}.`
    );

    return cancelledBooking;
  });
}

function updateFrequentTravellerProfile(actor, memberId, payload) {
  if (actor.role !== 'frequent_traveller' || actor.memberId !== memberId) {
    throw createHttpError(403, 'Anda hanya dapat memperbarui profil Frequent Traveller milik sendiri.');
  }
  const db = getDb();
  return withTransaction(db, () => {
    const existing = getFrequentTraveller(memberId);
    if (!existing) {
      throw createHttpError(404, 'Member frequent traveller tidak ditemukan');
    }
    const merged = {
      fullName: payload.fullName !== undefined ? String(payload.fullName) : existing.fullName,
      email: payload.email !== undefined ? String(payload.email) : existing.email,
      phone: payload.phone !== undefined ? String(payload.phone) : existing.phone,
      identityNumber: payload.identityNumber !== undefined ? String(payload.identityNumber) : existing.identityNumber,
      birthDate: payload.birthDate !== undefined ? String(payload.birthDate) : existing.birthDate,
      nationality: payload.nationality !== undefined ? String(payload.nationality) : existing.nationality,
      address: payload.address !== undefined ? String(payload.address) : existing.address,
      frequentFlyerNumber:
        payload.frequentFlyerNumber !== undefined ? String(payload.frequentFlyerNumber) : existing.frequentFlyerNumber
    };

    db.prepare(`
      UPDATE frequent_travellers
      SET full_name = ?, email = ?, phone = ?, identity_number = ?,
          birth_date = ?, nationality = ?, address = ?, frequent_flyer_number = ?
      WHERE member_id = ?
    `).run(
      merged.fullName,
      merged.email,
      merged.phone,
      merged.identityNumber,
      merged.birthDate,
      merged.nationality,
      merged.address,
      merged.frequentFlyerNumber,
      memberId
    );

    const updated = getFrequentTraveller(memberId);
    const check = evaluateProfileCompleteness(updated);
    recordAudit(
      db,
      actor,
      'FT_PROFILE_UPDATED',
      'frequent_traveller',
      memberId,
      `${actor.fullName} memperbarui profil member ${memberId} (lengkap: ${check.isProfileComplete}).`
    );
    return { member: updated, ...check };
  });
}

function validateFrequentTravellerTicket(actor, memberId, bookingReference) {
  if (actor.role !== 'frequent_traveller' || actor.memberId !== memberId) {
    throw createHttpError(403, 'Anda hanya dapat memvalidasi tiket untuk akun Frequent Traveller milik sendiri.');
  }
  const db = getDb();
  return withTransaction(db, () => {
    const member = getFrequentTraveller(memberId);
    if (!member) {
      throw createHttpError(404, 'Member frequent traveller tidak ditemukan');
    }
    const check = evaluateProfileCompleteness(member);
    if (!check.isProfileComplete) {
      throw createHttpError(400, 'data profil tidak lengkap', {
        valid: false,
        memberId: member.memberId,
        missingFields: check.missingFields
      });
    }

    let validatedBooking = null;
    if (bookingReference) {
      const target = findBookingByIdOrRef(bookingReference);
      if (target && target.memberId === memberId) {
        db.prepare('UPDATE bookings SET ticket_validated = 1, validated_at = ? WHERE booking_id = ?').run(
          new Date().toISOString(),
          target.bookingId
        );
        validatedBooking = findBookingByIdOrRef(target.bookingId);
      }
    }

    recordAudit(
      db,
      actor,
      'FT_TICKET_VALIDATED',
      'frequent_traveller',
      memberId,
      `${actor.fullName} memvalidasi kesiapan tiket untuk ${member.fullName}.`
    );

    return {
      valid: true,
      validationStatus: 'VALIDATED',
      message: 'Validasi tiket berhasil',
      memberId: member.memberId,
      memberName: member.fullName,
      booking: validatedBooking
    };
  });
}

function createFrequentTravellerBooking(actor, payload) {
  const memberId = payload.memberId || actor.memberId;
  if (actor.role !== 'frequent_traveller' || actor.memberId !== memberId) {
    throw createHttpError(403, 'Hanya pemilik akun Frequent Traveller yang dapat memesan tiket member ini.');
  }
  if (!payload.flightId) {
    throw createHttpError(400, 'flightId wajib diisi');
  }

  const db = getDb();
  return withTransaction(db, () => {
    const member = getFrequentTraveller(memberId);
    if (!member) {
      throw createHttpError(404, 'Member frequent traveller tidak ditemukan');
    }
    const flight = getFlight(payload.flightId);
    if (!flight) {
      throw createHttpError(404, 'Penerbangan tidak ditemukan');
    }
    if (flight.seatsAvailable < 1) {
      throw createHttpError(400, 'Kursi tersedia tidak mencukupi');
    }

    const passengers = validateAndCollectSeatSelection(
      db,
      flight,
      null,
      member.fullName,
      member.identityNumber,
      member.nationality || 'Indonesia',
      payload.seatNumber
    );

    const seatNumber = passengers[0].seatNumber;
    const seatFee = passengers[0].seatFee || 0;
    const totalPrice = flight.price + seatFee;
    const milesEarned = Math.round(totalPrice / 1000);
    const nowIso = new Date().toISOString();
    const bookingId = nextId('BK');
    const bookingReference = generateBookingReference();
    const eTicketNumber = `ETKT-${flight.flightNumber.replace('-', '')}-${String(Date.now()).slice(-4)}`;

    db.prepare(`
      INSERT INTO bookings (
        booking_id, booking_reference, booking_type, travel_purpose, booked_by_user_id,
        booked_by_role, user_id, member_id, visitor_id, passenger_name, passenger_email,
        passenger_phone, identity_number, nationality, passenger_count, flight_id,
        flight_number, airline, origin, destination, date, departure_time, arrival_time,
        base_price, price, cabin_class, fare_tier, seat_number, terminal_origin, gate,
        payment_method, payment_currency, status, authorized_by_travel_manager,
        ticket_validated, e_ticket_number, miles_earned, created_at
      ) VALUES (?, ?, 'frequent_traveller', 'business', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Standard', ?, ?, ?, 'Corporate Travel Billing', 'IDR', 'booked', 0, 0, ?, ?, ?)
    `).run(
      bookingId,
      bookingReference,
      actor.userId,
      actor.role,
      actor.userId,
      member.memberId,
      member.fullName,
      member.email,
      member.phone,
      member.identityNumber,
      member.nationality || 'Indonesia',
      flight.flightId,
      flight.flightNumber,
      flight.airline,
      flight.origin,
      flight.destination,
      flight.date,
      flight.departureTime,
      flight.arrivalTime,
      flight.price,
      totalPrice,
      flight.cabinClass,
      seatNumber,
      flight.terminalOrigin || '',
      flight.gate || '',
      eTicketNumber,
      milesEarned,
      nowIso
    );

    db.prepare(`
      INSERT INTO booking_passengers (
        booking_id, passenger_index, full_name, identity_number, nationality, seat_number, seat_fee
      ) VALUES (?, 1, ?, ?, ?, ?, ?)
    `).run(bookingId, member.fullName, member.identityNumber, member.nationality || 'Indonesia', seatNumber, seatFee);

    db.prepare('UPDATE flights SET seats_available = seats_available - 1 WHERE flight_id = ?').run(flight.flightId);
    db.prepare('UPDATE frequent_travellers SET points = points + ? WHERE member_id = ?').run(milesEarned, member.memberId);

    const createdBooking = findBookingByIdOrRef(bookingId);
    const updatedMember = getFrequentTraveller(member.memberId);
    recordAudit(
      db,
      actor,
      'FT_BOOKING_CREATED',
      'booking',
      bookingReference,
      `${member.fullName} memesan ${flight.flightNumber} (kursi ${seatNumber}, +${milesEarned} miles).`
    );

    return {
      booking: createdBooking,
      updatedMember,
      milesEarned
    };
  });
}

function createVisitorBooking(actor, payload) {
  if (!['travel_manager', 'employee'].includes(actor.role)) {
    throw createHttpError(403, 'Hanya Karyawan Agen atau Manajer Travel yang dapat memesankan tiket offline untuk pelanggan/visitor.');
  }
  const { visitorId, visitorName, visitorEmail, visitorPhone, identityNumber, flightId } = payload;
  if (!flightId || (!visitorId && (!visitorName || !visitorEmail))) {
    throw createHttpError(400, 'flightId dan identitas visitor (visitorId atau visitorName + visitorEmail) wajib diisi');
  }

  const db = getDb();
  return withTransaction(db, () => {
    const flight = getFlight(flightId);
    if (!flight) {
      throw createHttpError(404, 'Penerbangan tidak ditemukan');
    }
    if (flight.seatsAvailable < 1) {
      throw createHttpError(400, 'Kursi penerbangan tidak mencukupi');
    }

    let visitorRow = visitorId
      ? db.prepare('SELECT * FROM visitors WHERE visitor_id = ?').get(visitorId)
      : null;
    if (!visitorRow && visitorEmail) {
      visitorRow = db
        .prepare('SELECT * FROM visitors WHERE LOWER(visitor_email) = ?')
        .get(String(visitorEmail).trim().toLowerCase());
    }

    if (!visitorRow) {
      const newVisitorId = visitorId || nextId('VIS');
      db.prepare(`
        INSERT INTO visitors (visitor_id, visitor_name, visitor_email, visitor_phone, identity_number, company, visit_purpose)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newVisitorId,
        String(visitorName).trim(),
        String(visitorEmail).trim(),
        String(visitorPhone || '').trim(),
        String(identityNumber || '').trim(),
        String(payload.company || 'Tamu Perusahaan').trim(),
        String(payload.visitPurpose || 'Kunjungan Bisnis').trim()
      );
      visitorRow = db.prepare('SELECT * FROM visitors WHERE visitor_id = ?').get(newVisitorId);
    } else if (visitorName || visitorEmail || visitorPhone || identityNumber) {
      db.prepare(`
        UPDATE visitors
        SET visitor_name = COALESCE(NULLIF(?, ''), visitor_name),
            visitor_email = COALESCE(NULLIF(?, ''), visitor_email),
            visitor_phone = COALESCE(NULLIF(?, ''), visitor_phone),
            identity_number = COALESCE(NULLIF(?, ''), identity_number)
        WHERE visitor_id = ?
      `).run(
        String(visitorName || '').trim(),
        String(visitorEmail || '').trim(),
        String(visitorPhone || '').trim(),
        String(identityNumber || '').trim(),
        visitorRow.visitor_id
      );
      visitorRow = db.prepare('SELECT * FROM visitors WHERE visitor_id = ?').get(visitorRow.visitor_id);
    }

    const visitor = mapVisitorRow(visitorRow);
    const linkedUser = db
      .prepare('SELECT user_id FROM users WHERE visitor_id = ? OR LOWER(email) = ?')
      .get(visitor.visitorId, visitor.visitorEmail.toLowerCase());

    const passengers = validateAndCollectSeatSelection(
      db,
      flight,
      null,
      visitor.visitorName,
      visitor.identityNumber,
      'Indonesia',
      payload.seatNumber
    );
    const seatNumber = passengers[0].seatNumber;
    const seatFee = passengers[0].seatFee || 0;
    const totalPrice = flight.price + seatFee;
    const nowIso = new Date().toISOString();
    const bookingId = nextId('BK');
    const bookingReference = generateBookingReference();
    const eTicketNumber = `ETKT-${flight.flightNumber.replace('-', '')}-${String(Date.now()).slice(-4)}`;
    const status = ['confirmed', 'booked', 'waiting for the payment'].includes(payload.status)
      ? payload.status
      : 'confirmed';

    const isManager = actor.role === 'travel_manager';
    const paymentLabel = payload.paymentMethod || (isManager ? 'Loket Agen / Travel Desk' : 'Loket Offline (Staff Agen)');
    const authNote = isManager
      ? 'Diterbitkan langsung oleh Manajer Travel.'
      : `Dipesankan di loket offline oleh ${actor.fullName}.`;

    db.prepare(`
      INSERT INTO bookings (
        booking_id, booking_reference, booking_type, travel_purpose, booked_by_user_id,
        booked_by_role, user_id, member_id, visitor_id, passenger_name, passenger_email,
        passenger_phone, identity_number, nationality, passenger_count, flight_id,
        flight_number, airline, origin, destination, date, departure_time, arrival_time,
        base_price, price, cabin_class, fare_tier, seat_number, terminal_origin, gate,
        payment_method, payment_currency, paid_amount, paid_at, status,
        authorized_by_travel_manager, authorized_by_user_id, authorized_at, authorization_note,
        ticket_validated, validated_at, e_ticket_number, created_at
      ) VALUES (?, ?, 'visitor', 'offline_desk', ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'Indonesia', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Standard', ?, ?, ?, ?, 'IDR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId,
      bookingReference,
      actor.userId,
      actor.role,
      linkedUser ? linkedUser.user_id : null,
      visitor.visitorId,
      visitor.visitorName,
      visitor.visitorEmail,
      visitor.visitorPhone,
      visitor.identityNumber,
      flight.flightId,
      flight.flightNumber,
      flight.airline,
      flight.origin,
      flight.destination,
      flight.date,
      flight.departureTime,
      flight.arrivalTime,
      flight.price,
      totalPrice,
      flight.cabinClass,
      seatNumber,
      flight.terminalOrigin || '',
      flight.gate || '',
      paymentLabel,
      status === 'confirmed' ? totalPrice : null,
      status === 'confirmed' ? nowIso : null,
      status,
      isManager ? 1 : 0,
      isManager ? actor.userId : null,
      isManager ? nowIso : null,
      authNote,
      status === 'confirmed' ? 1 : 0,
      status === 'confirmed' ? nowIso : null,
      eTicketNumber,
      nowIso
    );

    db.prepare(`
      INSERT INTO booking_passengers (
        booking_id, passenger_index, full_name, identity_number, nationality, seat_number, seat_fee
      ) VALUES (?, 1, ?, ?, 'Indonesia', ?, ?)
    `).run(bookingId, visitor.visitorName, visitor.identityNumber, seatNumber, seatFee);

    db.prepare('UPDATE flights SET seats_available = seats_available - 1 WHERE flight_id = ?').run(flight.flightId);

    const createdBooking = findBookingByIdOrRef(bookingId);
    const emailRecord = appendEmailNotification(db, {
      recipientEmail: visitor.visitorEmail,
      recipientName: visitor.visitorName,
      visitorId: visitor.visitorId,
      booking: createdBooking,
      statusLabel: status
    });

    recordAudit(
      db,
      actor,
      'VISITOR_BOOKED',
      'booking',
      bookingReference,
      `${actor.fullName} memesan tiket ${flight.flightNumber} untuk visitor ${visitor.visitorName} & mengirim e-tiket ke ${visitor.visitorEmail}.`
    );

    return {
      visitor,
      booking: createdBooking,
      eTicketEmailNotification: emailRecord
    };
  });
}

function authorizeOrRejectBooking(actor, bookingReference, action = 'authorize', targetStatus = 'confirmed', note = '') {
  if (actor.role !== 'travel_manager') {
    throw createHttpError(403, 'Hanya Manajer Travel yang berwenang melakukan otorisasi booking.');
  }
  if (!bookingReference) {
    throw createHttpError(400, 'bookingReference wajib diisi');
  }

  const db = getDb();
  return withTransaction(db, () => {
    const booking = findBookingByIdOrRef(String(bookingReference).trim());
    if (!booking) {
      throw createHttpError(404, 'kode booking reference tidak sesuai', {
        authorized: false,
        requiresRetry: true,
        inputReference: bookingReference
      });
    }

    if (booking.status === 'cancelled') {
      throw createHttpError(400, `Booking ${booking.bookingReference} sudah dibatalkan.`);
    }

    const nowIso = new Date().toISOString();
    const normalizedAction = String(action || 'authorize').toLowerCase();

    if (normalizedAction === 'reject' || normalizedAction === 'cancel') {
      db.prepare(
        "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, authorization_note = ? WHERE booking_id = ?"
      ).run(nowIso, note || 'Ditolak oleh Travel Manager.', booking.bookingId);
      db.prepare('UPDATE flights SET seats_available = seats_available + ? WHERE flight_id = ?').run(
        booking.passengerCount || 1,
        booking.flightId
      );
      if (booking.bookingType === 'frequent_traveller' && booking.memberId && booking.milesEarned > 0) {
        db.prepare('UPDATE frequent_travellers SET points = MAX(0, points - ?) WHERE member_id = ?').run(
          booking.milesEarned,
          booking.memberId
        );
      }
      const rejected = findBookingByIdOrRef(booking.bookingId);
      recordAudit(
        db,
        actor,
        'BOOKING_REJECTED',
        'booking',
        rejected.bookingReference,
        `${actor.fullName} menolak otorisasi ${rejected.bookingReference}.`
      );
      return {
        authorized: false,
        rejected: true,
        message: `Otorisasi booking ${rejected.bookingReference} ditolak`,
        bookingReference: rejected.bookingReference,
        bookingStatus: rejected.status,
        booking: rejected
      };
    }

    const nextStatus =
      booking.status === 'booked' || booking.status === 'waiting for the payment'
        ? targetStatus === 'waiting for the payment'
          ? 'waiting for the payment'
          : 'confirmed'
        : booking.status;

    db.prepare(`
      UPDATE bookings
      SET authorized_by_travel_manager = 1,
          authorized_by_user_id = ?,
          authorized_at = ?,
          authorization_note = ?,
          status = ?,
          ticket_validated = CASE WHEN ? = 'confirmed' THEN 1 ELSE ticket_validated END,
          validated_at = CASE WHEN ? = 'confirmed' THEN COALESCE(validated_at, ?) ELSE validated_at END,
          paid_amount = CASE WHEN ? = 'confirmed' AND paid_amount IS NULL THEN price ELSE paid_amount END,
          paid_at = CASE WHEN ? = 'confirmed' AND paid_at IS NULL THEN ? ELSE paid_at END
      WHERE booking_id = ?
    `).run(
      actor.userId,
      nowIso,
      note || 'Diotorisasi oleh Travel Manager.',
      nextStatus,
      nextStatus,
      nextStatus,
      nowIso,
      nextStatus,
      nextStatus,
      nowIso,
      booking.bookingId
    );

    const authorizedBooking = findBookingByIdOrRef(booking.bookingId);
    recordAudit(
      db,
      actor,
      'BOOKING_AUTHORIZED',
      'booking',
      authorizedBooking.bookingReference,
      `${actor.fullName} mengotorisasi ${authorizedBooking.bookingReference} -> ${authorizedBooking.status}.`
    );

    return {
      authorized: true,
      message: `Otorisasi tiket berhasil untuk ${authorizedBooking.bookingReference}`,
      bookingReference: authorizedBooking.bookingReference,
      bookingStatus: authorizedBooking.status,
      authorizedAt: authorizedBooking.authorizedAt,
      booking: authorizedBooking
    };
  });
}

module.exports = {
  getDbPath,
  setDbFile,
  closeStore,
  getDb,
  loadState,
  resetState,
  getMeta,
  getCurrencies,
  listAirports,
  getAirport,
  listFlights,
  getFlight,
  listEmployees,
  getEmployeeById,
  listLeaveRequests,
  listFrequentTravellers,
  getFrequentTraveller,
  listVisitors,
  listAllBookings,
  listFlightActiveBookings,
  findBookingByIdOrRef,
  listEmailNotifications,
  listAuditLogs,
  listDemoActors,
  authenticateWithPassword,
  authenticateDemoUser,
  getUserByToken,
  revokeSession,
  getScopedState,
  submitLeaveRequest,
  decideLeaveRequest,
  createUserBooking,
  payBooking,
  cancelBooking,
  updateFrequentTravellerProfile,
  validateFrequentTravellerTicket,
  createFrequentTravellerBooking,
  createVisitorBooking,
  authorizeOrRejectBooking
};
