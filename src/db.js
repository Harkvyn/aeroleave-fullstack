const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta_kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS airports (
  code TEXT PRIMARY KEY,
  icao TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT NOT NULL,
  timezone TEXT NOT NULL,
  utc_label TEXT NOT NULL,
  primary_terminal TEXT NOT NULL,
  runways INTEGER NOT NULL,
  terminals_json TEXT NOT NULL,
  lounges_json TEXT NOT NULL,
  facilities_json TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  image_url TEXT NOT NULL,
  hero_caption TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  annual_leave_quota INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE IF NOT EXISTS frequent_travellers (
  member_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  identity_number TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  frequent_flyer_number TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'Silver',
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitors (
  visitor_id TEXT PRIMARY KEY,
  visitor_name TEXT NOT NULL,
  visitor_email TEXT UNIQUE NOT NULL,
  visitor_phone TEXT NOT NULL DEFAULT '',
  identity_number TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  visit_purpose TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'hr_manager', 'frequent_traveller', 'travel_manager', 'visitor')),
  role_label TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
  member_id TEXT REFERENCES frequent_travellers(member_id) ON DELETE SET NULL,
  visitor_id TEXT REFERENCES visitors(visitor_id) ON DELETE SET NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
  leave_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'annual',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  decision_note TEXT
);

CREATE TABLE IF NOT EXISTS flights (
  flight_id TEXT PRIMARY KEY,
  flight_number TEXT NOT NULL,
  airline TEXT NOT NULL,
  airline_code TEXT NOT NULL,
  origin TEXT NOT NULL REFERENCES airports(code),
  origin_city TEXT NOT NULL,
  destination TEXT NOT NULL REFERENCES airports(code),
  destination_city TEXT NOT NULL,
  date TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price INTEGER NOT NULL,
  cabin_class TEXT NOT NULL,
  baggage_kg INTEGER NOT NULL,
  seats_available INTEGER NOT NULL,
  aircraft TEXT NOT NULL,
  terminal_origin TEXT,
  terminal_destination TEXT,
  gate TEXT,
  stops INTEGER NOT NULL DEFAULT 0,
  stop_info TEXT,
  amenities_json TEXT NOT NULL,
  is_international INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id TEXT PRIMARY KEY,
  booking_reference TEXT UNIQUE NOT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('user', 'frequent_traveller', 'visitor')),
  travel_purpose TEXT NOT NULL DEFAULT 'business',
  booked_by_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  booked_by_role TEXT,
  user_id TEXT,
  member_id TEXT REFERENCES frequent_travellers(member_id) ON DELETE SET NULL,
  visitor_id TEXT REFERENCES visitors(visitor_id) ON DELETE SET NULL,
  passenger_name TEXT NOT NULL,
  passenger_email TEXT,
  passenger_phone TEXT,
  identity_number TEXT,
  nationality TEXT,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  flight_id TEXT NOT NULL REFERENCES flights(flight_id),
  flight_number TEXT NOT NULL,
  airline TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  date TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  base_price INTEGER,
  price INTEGER NOT NULL,
  cabin_class TEXT NOT NULL,
  fare_tier TEXT NOT NULL DEFAULT 'Standard',
  seat_number TEXT,
  terminal_origin TEXT,
  gate TEXT,
  special_request TEXT,
  payment_method TEXT,
  payment_currency TEXT NOT NULL DEFAULT 'IDR',
  paid_amount INTEGER,
  paid_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'booked', 'waiting for the payment', 'cancelled')),
  authorized_by_travel_manager INTEGER NOT NULL DEFAULT 0,
  authorized_by_user_id TEXT,
  authorized_at TEXT,
  authorization_note TEXT,
  ticket_validated INTEGER NOT NULL DEFAULT 0,
  validated_at TEXT,
  e_ticket_number TEXT,
  miles_earned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS booking_passengers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  passenger_index INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  identity_number TEXT,
  nationality TEXT,
  seat_number TEXT NOT NULL,
  seat_fee INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_notifications (
  email_id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  visitor_id TEXT REFERENCES visitors(visitor_id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  booking_reference TEXT NOT NULL,
  e_ticket_number TEXT,
  sent_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'DELIVERED',
  e_ticket_payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaves_emp_status ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_flights_route_date ON flights(origin, destination, date);
CREATE INDEX IF NOT EXISTS idx_bookings_flight_status ON bookings(flight_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_owner ON bookings(booked_by_user_id, member_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_booking_pax_booking ON booking_passengers(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
`;

function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(SCHEMA_SQL);
  return db;
}

function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  }
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function mapAirportRow(r) {
  return {
    code: r.code,
    icao: r.icao,
    name: r.name,
    shortName: r.short_name,
    city: r.city,
    country: r.country,
    countryCode: r.country_code,
    region: r.region,
    timezone: r.timezone,
    utcLabel: r.utc_label,
    primaryTerminal: r.primary_terminal,
    runways: r.runways,
    terminals: safeJsonParse(r.terminals_json, []),
    lounges: safeJsonParse(r.lounges_json, []),
    facilities: safeJsonParse(r.facilities_json, []),
    coordinates: { lat: r.lat, lng: r.lng },
    imageUrl: r.image_url,
    heroCaption: r.hero_caption
  };
}

function mapEmployeeRow(r) {
  return {
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    department: r.department,
    position: r.position,
    email: r.email,
    annualLeaveQuota: r.annual_leave_quota
  };
}

function mapLeaveRow(r) {
  return {
    leaveId: r.leave_id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    leaveType: r.leave_type || 'annual',
    startDate: r.start_date,
    endDate: r.end_date,
    durationDays: r.duration_days,
    reason: r.reason,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedBy: r.reviewed_by || null,
    reviewedByName: r.reviewed_by_name || null,
    reviewedAt: r.reviewed_at || null,
    decisionNote: r.decision_note || null
  };
}

function mapFlightRow(r) {
  const out = {
    flightId: r.flight_id,
    flightNumber: r.flight_number,
    airline: r.airline,
    airlineCode: r.airline_code,
    origin: r.origin,
    originCity: r.origin_city,
    destination: r.destination,
    destinationCity: r.destination_city,
    date: r.date,
    departureTime: r.departure_time,
    arrivalTime: r.arrival_time,
    durationMinutes: r.duration_minutes,
    price: r.price,
    cabinClass: r.cabin_class,
    baggageKg: r.baggage_kg,
    seatsAvailable: r.seats_available,
    aircraft: r.aircraft,
    terminalOrigin: r.terminal_origin,
    terminalDestination: r.terminal_destination,
    gate: r.gate,
    stops: r.stops,
    amenities: safeJsonParse(r.amenities_json, []),
    isInternational: Boolean(r.is_international)
  };
  if (r.stop_info) out.stopInfo = r.stop_info;
  return out;
}

function mapFtRow(r) {
  return {
    memberId: r.member_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone || '',
    identityNumber: r.identity_number || '',
    birthDate: r.birth_date || '',
    nationality: r.nationality || '',
    address: r.address || '',
    frequentFlyerNumber: r.frequent_flyer_number || '',
    tier: r.tier,
    points: r.points
  };
}

function mapVisitorRow(r) {
  return {
    visitorId: r.visitor_id,
    visitorName: r.visitor_name,
    visitorEmail: r.visitor_email,
    visitorPhone: r.visitor_phone || '',
    identityNumber: r.identity_number || '',
    company: r.company || '',
    visitPurpose: r.visit_purpose || ''
  };
}

function mapBookingRow(r, passengerRows = []) {
  return {
    bookingId: r.booking_id,
    bookingReference: r.booking_reference,
    bookingType: r.booking_type,
    travelPurpose: r.travel_purpose || 'business',
    bookedByUserId: r.booked_by_user_id || null,
    bookedByRole: r.booked_by_role || null,
    userId: r.user_id || null,
    memberId: r.member_id || null,
    visitorId: r.visitor_id || null,
    passengerName: r.passenger_name,
    passengerEmail: r.passenger_email || '',
    passengerPhone: r.passenger_phone || '',
    identityNumber: r.identity_number || '',
    nationality: r.nationality || 'Indonesia',
    passengerCount: r.passenger_count || 1,
    passengers: passengerRows.map((p) => ({
      passengerIndex: p.passenger_index,
      fullName: p.full_name,
      identityNumber: p.identity_number || '',
      nationality: p.nationality || 'Indonesia',
      seatNumber: p.seat_number,
      seatFee: p.seat_fee || 0
    })),
    flightId: r.flight_id,
    flightNumber: r.flight_number,
    airline: r.airline,
    origin: r.origin,
    destination: r.destination,
    date: r.date,
    departureTime: r.departure_time,
    arrivalTime: r.arrival_time,
    basePrice: r.base_price,
    price: r.price,
    cabinClass: r.cabin_class,
    fareTier: r.fare_tier,
    seatNumber: r.seat_number,
    terminalOrigin: r.terminal_origin,
    gate: r.gate,
    specialRequest: r.special_request || '',
    paymentMethod: r.payment_method || null,
    paymentCurrency: r.payment_currency || 'IDR',
    paidAmount: r.paid_amount ?? null,
    paidAt: r.paid_at || null,
    status: r.status,
    authorizedByTravelManager: Boolean(r.authorized_by_travel_manager),
    authorizedByUserId: r.authorized_by_user_id || null,
    authorizedAt: r.authorized_at || null,
    authorizationNote: r.authorization_note || null,
    ticketValidated: Boolean(r.ticket_validated),
    validatedAt: r.validated_at || null,
    eTicketNumber: r.e_ticket_number,
    milesEarned: r.miles_earned || 0,
    createdAt: r.created_at,
    cancelledAt: r.cancelled_at || null
  };
}

function mapEmailRow(r) {
  return {
    emailId: r.email_id,
    recipientEmail: r.recipient_email,
    recipientName: r.recipient_name,
    visitorId: r.visitor_id || null,
    subject: r.subject,
    bookingReference: r.booking_reference,
    eTicketNumber: r.e_ticket_number,
    sentAt: r.sent_at,
    deliveryStatus: r.delivery_status,
    eTicketPayload: safeJsonParse(r.e_ticket_payload_json, {})
  };
}

function mapAuditRow(r) {
  return {
    auditId: r.audit_id,
    actorUserId: r.actor_user_id || null,
    actorName: r.actor_name || 'System',
    actorRole: r.actor_role || 'system',
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    summary: r.summary,
    createdAt: r.created_at
  };
}

function seedDatabase(db, initialState, { preserveSessions = false } = {}) {
  withTransaction(db, () => {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM email_notifications;
      DELETE FROM booking_passengers;
      DELETE FROM bookings;
      DELETE FROM leave_requests;
      DELETE FROM flights;
    `);

    if (!preserveSessions) {
      db.exec('DELETE FROM sessions; DELETE FROM users;');
    } else {
      const seededUserIds = new Set((initialState.users || []).map((u) => u.userId));
      const existingUsers = db.prepare('SELECT user_id FROM users').all();
      for (const row of existingUsers) {
        if (!seededUserIds.has(row.user_id)) {
          db.prepare('DELETE FROM users WHERE user_id = ?').run(row.user_id);
        }
      }
      db.exec('UPDATE users SET employee_id = NULL, member_id = NULL, visitor_id = NULL;');
    }

    db.exec(`
      DELETE FROM visitors;
      DELETE FROM frequent_travellers;
      DELETE FROM employees;
      DELETE FROM airports;
      DELETE FROM meta_kv;
    `);

    const insertMeta = db.prepare('INSERT INTO meta_kv (key, value_json) VALUES (?, ?)');
    insertMeta.run('meta', JSON.stringify(initialState.meta));
    insertMeta.run('currencies', JSON.stringify(initialState.currencies));

    const insertAirport = db.prepare(`
      INSERT INTO airports (
        code, icao, name, short_name, city, country, country_code, region,
        timezone, utc_label, primary_terminal, runways,
        terminals_json, lounges_json, facilities_json, lat, lng, image_url, hero_caption
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of initialState.airports || []) {
      insertAirport.run(
        a.code,
        a.icao,
        a.name,
        a.shortName,
        a.city,
        a.country,
        a.countryCode,
        a.region,
        a.timezone,
        a.utcLabel,
        a.primaryTerminal,
        a.runways,
        JSON.stringify(a.terminals || []),
        JSON.stringify(a.lounges || []),
        JSON.stringify(a.facilities || []),
        a.coordinates.lat,
        a.coordinates.lng,
        a.imageUrl,
        a.heroCaption
      );
    }

    const insertEmp = db.prepare(`
      INSERT INTO employees (employee_id, employee_name, department, position, email, annual_leave_quota)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const e of initialState.employees || []) {
      insertEmp.run(e.employeeId, e.employeeName, e.department, e.position, e.email, e.annualLeaveQuota);
    }

    const insertFt = db.prepare(`
      INSERT INTO frequent_travellers (
        member_id, full_name, email, phone, identity_number, birth_date,
        nationality, address, frequent_flyer_number, tier, points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ft of initialState.frequentTravellers || []) {
      insertFt.run(
        ft.memberId,
        ft.fullName,
        ft.email,
        ft.phone || '',
        ft.identityNumber || '',
        ft.birthDate || '',
        ft.nationality || '',
        ft.address || '',
        ft.frequentFlyerNumber || '',
        ft.tier || 'Silver',
        ft.points || 0
      );
    }

    const insertVisitor = db.prepare(`
      INSERT INTO visitors (visitor_id, visitor_name, visitor_email, visitor_phone, identity_number, company, visit_purpose)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const v of initialState.visitors || []) {
      insertVisitor.run(
        v.visitorId,
        v.visitorName,
        v.visitorEmail,
        v.visitorPhone || '',
        v.identityNumber || '',
        v.company || '',
        v.visitPurpose || ''
      );
    }

    const upsertUser = db.prepare(`
      INSERT INTO users (
        user_id, email, full_name, role, role_label, department,
        employee_id, member_id, visitor_id, password_salt, password_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        role_label = excluded.role_label,
        department = excluded.department,
        employee_id = excluded.employee_id,
        member_id = excluded.member_id,
        visitor_id = excluded.visitor_id,
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash
    `);
    for (const u of initialState.users || []) {
      upsertUser.run(
        u.userId,
        u.email,
        u.fullName,
        u.role,
        u.roleLabel,
        u.department || '',
        u.employeeId || null,
        u.memberId || null,
        u.visitorId || null,
        u.passwordSalt,
        u.passwordHash,
        u.createdAt
      );
    }

    const insertLeave = db.prepare(`
      INSERT INTO leave_requests (
        leave_id, employee_id, employee_name, leave_type, start_date, end_date,
        duration_days, reason, status, submitted_at, reviewed_by, reviewed_by_name,
        reviewed_at, decision_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const lv of initialState.leaveRequests || []) {
      insertLeave.run(
        lv.leaveId,
        lv.employeeId,
        lv.employeeName,
        lv.leaveType || 'annual',
        lv.startDate,
        lv.endDate,
        lv.durationDays,
        lv.reason,
        lv.status,
        lv.submittedAt,
        lv.reviewedBy || null,
        lv.reviewedByName || null,
        lv.reviewedAt || null,
        lv.decisionNote || null
      );
    }

    const insertFlight = db.prepare(`
      INSERT INTO flights (
        flight_id, flight_number, airline, airline_code, origin, origin_city,
        destination, destination_city, date, departure_time, arrival_time,
        duration_minutes, price, cabin_class, baggage_kg, seats_available,
        aircraft, terminal_origin, terminal_destination, gate, stops, stop_info,
        amenities_json, is_international
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const fl of initialState.flights || []) {
      insertFlight.run(
        fl.flightId,
        fl.flightNumber,
        fl.airline,
        fl.airlineCode,
        fl.origin,
        fl.originCity,
        fl.destination,
        fl.destinationCity,
        fl.date,
        fl.departureTime,
        fl.arrivalTime,
        fl.durationMinutes,
        fl.price,
        fl.cabinClass,
        fl.baggageKg,
        fl.seatsAvailable,
        fl.aircraft,
        fl.terminalOrigin || null,
        fl.terminalDestination || null,
        fl.gate || null,
        fl.stops || 0,
        fl.stopInfo || null,
        JSON.stringify(fl.amenities || []),
        fl.isInternational ? 1 : 0
      );
    }

    const insertBooking = db.prepare(`
      INSERT INTO bookings (
        booking_id, booking_reference, booking_type, travel_purpose, booked_by_user_id,
        booked_by_role, user_id, member_id, visitor_id, passenger_name, passenger_email,
        passenger_phone, identity_number, nationality, passenger_count, flight_id,
        flight_number, airline, origin, destination, date, departure_time, arrival_time,
        base_price, price, cabin_class, fare_tier, seat_number, terminal_origin, gate,
        special_request, payment_method, payment_currency, paid_amount, paid_at, status,
        authorized_by_travel_manager, authorized_by_user_id, authorized_at, authorization_note,
        ticket_validated, validated_at, e_ticket_number, miles_earned, created_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBookingPax = db.prepare(`
      INSERT INTO booking_passengers (
        booking_id, passenger_index, full_name, identity_number, nationality, seat_number, seat_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of initialState.bookings || []) {
      insertBooking.run(
        b.bookingId,
        b.bookingReference,
        b.bookingType,
        b.travelPurpose || 'business',
        b.bookedByUserId || null,
        b.bookedByRole || null,
        b.userId || null,
        b.memberId || null,
        b.visitorId || null,
        b.passengerName,
        b.passengerEmail || '',
        b.passengerPhone || '',
        b.identityNumber || '',
        b.nationality || 'Indonesia',
        b.passengerCount || 1,
        b.flightId,
        b.flightNumber,
        b.airline,
        b.origin,
        b.destination,
        b.date,
        b.departureTime,
        b.arrivalTime,
        b.basePrice ?? b.price,
        b.price,
        b.cabinClass,
        b.fareTier || 'Standard',
        b.seatNumber || '',
        b.terminalOrigin || '',
        b.gate || '',
        b.specialRequest || '',
        b.paymentMethod || null,
        b.paymentCurrency || 'IDR',
        b.paidAmount ?? null,
        b.paidAt || null,
        b.status,
        b.authorizedByTravelManager ? 1 : 0,
        b.authorizedByUserId || null,
        b.authorizedAt || null,
        b.authorizationNote || null,
        b.ticketValidated ? 1 : 0,
        b.validatedAt || null,
        b.eTicketNumber || null,
        b.milesEarned || 0,
        b.createdAt,
        b.cancelledAt || null
      );

      const paxList = Array.isArray(b.passengers) && b.passengers.length > 0
        ? b.passengers
        : [{ fullName: b.passengerName, identityNumber: b.identityNumber, nationality: b.nationality, seatNumber: b.seatNumber || '12A', seatFee: 0 }];
      paxList.forEach((p, idx) => {
        insertBookingPax.run(
          b.bookingId,
          idx + 1,
          p.fullName || b.passengerName,
          p.identityNumber || b.identityNumber || '',
          p.nationality || b.nationality || 'Indonesia',
          p.seatNumber || b.seatNumber || '12A',
          p.seatFee || 0
        );
      });
    }

    const insertEmail = db.prepare(`
      INSERT INTO email_notifications (
        email_id, recipient_email, recipient_name, visitor_id, subject,
        booking_reference, e_ticket_number, sent_at, delivery_status, e_ticket_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const eml of initialState.emailNotifications || []) {
      insertEmail.run(
        eml.emailId,
        eml.recipientEmail,
        eml.recipientName,
        eml.visitorId || null,
        eml.subject,
        eml.bookingReference,
        eml.eTicketNumber || null,
        eml.sentAt,
        eml.deliveryStatus || 'DELIVERED',
        JSON.stringify(eml.eTicketPayload || {})
      );
    }

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (
        audit_id, actor_user_id, actor_name, actor_role, action,
        entity_type, entity_id, summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const aud of initialState.auditLogs || []) {
      insertAudit.run(
        aud.auditId,
        aud.actorUserId || null,
        aud.actorName || 'System',
        aud.actorRole || 'system',
        aud.action,
        aud.entityType,
        aud.entityId,
        aud.summary,
        aud.createdAt
      );
    }
  });
}

module.exports = {
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
};
