const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const store = require('./store');
const {
  FARE_TIERS,
  calculateInclusiveDays,
  matchesLocation,
  matchesDepartureTimePreference,
  evaluateProfileCompleteness,
  generateBookingReference,
  buildAirlinePriceSummary,
  buildEmployeeLeaveSummary,
  buildCabinSeatMap,
  computeBookingPricing
} = require('./helpers');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Payload terlalu besar'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Format JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function tryServeStatic(req, res, pathname, query) {
  if (req.method !== 'GET' || query.format === 'json') return false;
  if (pathname.startsWith('/api')) return false;

  const requestedPath =
    pathname === '' || pathname === '/' || pathname === '/index.html' || pathname === '/aeroleave-hallmark.html'
      ? '/index.html'
      : pathname;

  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, `.${safePath}`);

  if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath)) {
    return false;
  }
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) return false;

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(fullPath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(content);
  return true;
}

function airportForCode(state, code) {
  return (state.airports || []).find((a) => a.code === code) || null;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(parsedUrl.searchParams.entries());
  const state = store.getState();

  try {
    // ------------------------------------------------------------------------
    // 0. STATIC ASSETS & FRONTEND ENTRYPOINT
    // ------------------------------------------------------------------------
    if (tryServeStatic(req, res, pathname, query)) {
      return;
    }

    // ------------------------------------------------------------------------
    // 1. STATE SYNC, HEALTH CHECK & HALLMARK PREFLIGHT
    // ------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/state') {
      return sendJson(res, 200, state);
    }

    if (req.method === 'PUT' && pathname === '/api/state') {
      const body = await parseJsonBody(req);
      if (body && Array.isArray(body.flights) && Array.isArray(body.bookings)) {
        store.setState(body);
        return sendJson(res, 200, { status: 'synced', updatedAt: new Date().toISOString() });
      }
      return sendJson(res, 400, { error: 'Struktur state tidak valid' });
    }

    if (req.method === 'GET' && (pathname === '' || pathname === '/' || pathname === '/api/health')) {
      return sendJson(res, 200, {
        status: 'ok',
        service: state.meta.systemName,
        version: state.meta.version,
        hallmarkSkillRef: state.meta.hallmarkReference,
        airportsCount: (state.airports || []).length,
        flightsCount: state.flights.length
      });
    }

    if (req.method === 'GET' && pathname === '/api/hallmark/preflight') {
      return sendJson(res, 200, {
        hallmarkVersion: '2.0.0',
        skillRepo: 'https://github.com/nutlope/hallmark',
        principle: 'Built from the job · Nothing is invented',
        recommendedGenre: 'modern-minimal',
        recommendedMacrostructures: ['05-workbench', 'index-first'],
        realMaterialInventory: {
          employeeCount: state.employees.length,
          leaveRequestCount: state.leaveRequests.length,
          flightScheduleCount: state.flights.length,
          frequentTravellerCount: state.frequentTravellers.length,
          visitorCount: state.visitors.length,
          activeBookingCount: state.bookings.filter((b) => b.status !== 'cancelled').length,
          airlines: Array.from(new Set(state.flights.map((f) => f.airline))),
          airports: (state.airports || []).map((a) => `${a.code} (${a.city})`)
        }
      });
    }

    if (req.method === 'POST' && pathname === '/api/testing/reset') {
      store.resetState();
      return sendJson(res, 200, { status: 'reset_ok', message: 'Database state di-reset ke seed awal.' });
    }

    // ------------------------------------------------------------------------
    // 2. KATALOG BANDARA INTERNASIONAL, SEAT MAP, PAYMENT & BOARDING PASS
    // ------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/airports') {
      const { region, q } = query;
      let list = [...(state.airports || [])];
      if (region && region !== 'ALL') {
        list = list.filter((a) => a.region.toLowerCase() === region.toLowerCase());
      }
      if (q) {
        const needle = q.trim().toLowerCase();
        list = list.filter(
          (a) =>
            a.code.toLowerCase().includes(needle) ||
            a.city.toLowerCase().includes(needle) ||
            a.country.toLowerCase().includes(needle) ||
            a.name.toLowerCase().includes(needle)
        );
      }
      const enriched = list.map((airport) => {
        const departures = state.flights.filter((f) => f.origin === airport.code && f.seatsAvailable > 0);
        const arrivals = state.flights.filter((f) => f.destination === airport.code && f.seatsAvailable > 0);
        const lowestInboundPrice = arrivals.length > 0 ? Math.min(...arrivals.map((f) => f.price)) : null;
        return {
          ...airport,
          departuresCount: departures.length,
          arrivalsCount: arrivals.length,
          lowestInboundPrice
        };
      });
      return sendJson(res, 200, {
        totalAirports: enriched.length,
        airports: enriched
      });
    }

    const airportDetailMatch = pathname.match(/^\/api\/airports\/([^/]+)$/);
    if (req.method === 'GET' && airportDetailMatch) {
      const code = decodeURIComponent(airportDetailMatch[1]).trim().toUpperCase();
      const airport = airportForCode(state, code);
      if (!airport) {
        return sendJson(res, 404, { error: 'Bandara tidak ditemukan', code });
      }
      const departures = state.flights.filter((f) => f.origin === code);
      const arrivals = state.flights.filter((f) => f.destination === code);
      return sendJson(res, 200, {
        airport,
        departures,
        arrivals
      });
    }

    const seatMapMatch = pathname.match(/^\/api\/flights\/([^/]+)\/seats$/);
    if (req.method === 'GET' && seatMapMatch) {
      const flightId = decodeURIComponent(seatMapMatch[1]).trim();
      const flight = state.flights.find((f) => f.flightId === flightId);
      if (!flight) {
        return sendJson(res, 404, { error: 'Penerbangan tidak ditemukan', flightId });
      }
      return sendJson(res, 200, {
        ...buildCabinSeatMap(flight, state.bookings),
        fareTiers: Object.values(FARE_TIERS)
      });
    }

    const payBookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);
    if (req.method === 'POST' && payBookingMatch) {
      const idOrRef = decodeURIComponent(payBookingMatch[1]).trim().toLowerCase();
      const target = state.bookings.find(
        (b) => b.bookingId.toLowerCase() === idOrRef || b.bookingReference.toLowerCase() === idOrRef
      );
      if (!target) {
        return sendJson(res, 404, { error: 'Booking tidak ditemukan', identifier: idOrRef });
      }
      if (target.status === 'cancelled') {
        return sendJson(res, 400, { error: 'Booking yang sudah dibatalkan tidak dapat dibayar' });
      }
      const body = await parseJsonBody(req);
      target.status = 'confirmed';
      target.paymentMethod = body.paymentMethod || 'International Card (Visa/Mastercard)';
      target.paymentCurrency = body.currency || 'IDR';
      target.paidAmount = body.paidAmount || target.price;
      target.paidAt = new Date().toISOString();
      target.authorizedByTravelManager = true;
      target.authorizedAt = target.authorizedAt || target.paidAt;
      target.ticketValidated = true;

      if (target.passengerEmail) {
        state.emailNotifications.push({
          emailId: `EML-${state.meta.currentYear}-${String(state.emailNotifications.length + 1).padStart(3, '0')}`,
          recipientEmail: target.passengerEmail,
          recipientName: target.passengerName,
          visitorId: target.visitorId || null,
          subject: `Konfirmasi E-Tiket & Boarding Pass ${target.airline} ${target.flightNumber} (${target.bookingReference})`,
          bookingReference: target.bookingReference,
          eTicketNumber: target.eTicketNumber,
          sentAt: target.paidAt,
          deliveryStatus: 'DELIVERED',
          eTicketPayload: {
            bookingReference: target.bookingReference,
            eTicketNumber: target.eTicketNumber,
            passengerName: target.passengerName,
            flightNumber: target.flightNumber,
            airline: target.airline,
            route: `${target.origin} -> ${target.destination}`,
            date: target.date,
            departureTime: target.departureTime,
            arrivalTime: target.arrivalTime,
            seatNumber: target.seatNumber,
            status: target.status
          }
        });
      }

      store.saveState();
      return sendJson(res, 200, {
        message: 'Pembayaran berhasil dikonfirmasi dan e-tiket aktif',
        booking: target
      });
    }

    const boardingPassMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/boarding-pass$/);
    if (req.method === 'GET' && boardingPassMatch) {
      const idOrRef = decodeURIComponent(boardingPassMatch[1]).trim().toLowerCase();
      const target = state.bookings.find(
        (b) => b.bookingId.toLowerCase() === idOrRef || b.bookingReference.toLowerCase() === idOrRef
      );
      if (!target) {
        return sendJson(res, 404, { error: 'Booking tidak ditemukan' });
      }
      const flight = state.flights.find((f) => f.flightId === target.flightId) || {};
      const originAirport = airportForCode(state, target.origin);
      const destAirport = airportForCode(state, target.destination);
      return sendJson(res, 200, {
        booking: target,
        flight,
        originAirport,
        destAirport,
        qrPayload: `AEROLEAVE|${target.bookingReference}|${target.eTicketNumber}|${target.flightNumber}|${target.origin}-${target.destination}|${target.seatNumber}|${target.passengerName}`
      });
    }

    // ------------------------------------------------------------------------
    // 3. USER STORY 1 (US1): HRD MANAJER
    // ------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/hr/leaves') {
      const { day, month, year, date, startDate, endDate, employeeId, employeeName, status } = query;
      let filtered = [...state.leaveRequests];

      if (date) {
        filtered = filtered.filter((lv) => lv.startDate <= date && lv.endDate >= date);
      } else if (day || month || year) {
        filtered = filtered.filter((lv) => {
          const [sYear, sMonth] = lv.startDate.split('-').map(Number);
          const [eYear, eMonth] = lv.endDate.split('-').map(Number);
          if (year && sYear !== Number(year) && eYear !== Number(year)) return false;
          if (month && sMonth !== Number(month) && eMonth !== Number(month)) return false;
          if (day) {
            const targetYear = year ? Number(year) : sYear;
            const targetMonth = month ? Number(month) : sMonth;
            const paddedDate = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
            return lv.startDate <= paddedDate && lv.endDate >= paddedDate;
          }
          return true;
        });
      }

      if (startDate || endDate) {
        const rangeStart = startDate || '0000-01-01';
        const rangeEnd = endDate || '9999-12-31';
        filtered = filtered.filter((lv) => lv.startDate <= rangeEnd && lv.endDate >= rangeStart);
      }
      if (employeeId) {
        filtered = filtered.filter((lv) => lv.employeeId.toLowerCase() === String(employeeId).toLowerCase());
      }
      if (employeeName) {
        const qName = String(employeeName).toLowerCase();
        filtered = filtered.filter((lv) => lv.employeeName.toLowerCase().includes(qName));
      }
      if (status) {
        filtered = filtered.filter((lv) => lv.status.toLowerCase() === String(status).toLowerCase());
      }

      const formattedLeaves = filtered.map((lv) => {
        const emp = state.employees.find((e) => e.employeeId === lv.employeeId);
        const empSummary = emp
          ? buildEmployeeLeaveSummary(emp, state.leaveRequests, state.meta.currentYear, year || state.meta.currentYear)
          : null;
        return {
          leaveId: lv.leaveId,
          employeeId: lv.employeeId,
          employeeName: lv.employeeName,
          department: emp ? emp.department : null,
          leavePeriod: {
            startDate: lv.startDate,
            endDate: lv.endDate,
            formatted: `${lv.startDate} s/d ${lv.endDate}`
          },
          durationDays: lv.durationDays,
          durationLabel: `${lv.durationDays} hari`,
          reason: lv.reason,
          status: lv.status,
          remainingLeaveDaysCurrentYear: empSummary ? empSummary.remainingLeaveDaysCurrentYear : null,
          submittedAt: lv.submittedAt
        };
      });

      return sendJson(res, 200, {
        userStory: 'US1',
        selectedFilter: {
          day: day || null,
          month: month || null,
          year: year || null,
          date: date || null,
          startDate: startDate || null,
          endDate: endDate || null,
          employeeId: employeeId || null,
          employeeName: employeeName || null
        },
        totalLeaveApplications: formattedLeaves.length,
        totalLeaveDaysRequested: formattedLeaves.reduce((sum, item) => sum + item.durationDays, 0),
        leaveApplications: formattedLeaves
      });
    }

    if (req.method === 'POST' && pathname === '/api/hr/leaves') {
      const body = await parseJsonBody(req);
      const { employeeId, startDate, endDate, reason, status } = body;
      const emp = state.employees.find((e) => e.employeeId === employeeId);
      if (!emp) {
        return sendJson(res, 404, { error: 'Pegawai tidak ditemukan', employeeId });
      }
      const durationDays = calculateInclusiveDays(startDate, endDate);
      if (!durationDays) {
        return sendJson(res, 400, { error: 'Periode tanggal mulai dan selesai cuti tidak valid', startDate, endDate });
      }

      const newLeave = {
        leaveId: `LV-${state.meta.currentYear}-${String(state.leaveRequests.length + 1).padStart(3, '0')}`,
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        startDate,
        endDate,
        durationDays,
        reason: reason || 'Pengajuan cuti tahunan',
        status: status || 'pending',
        submittedAt: new Date().toISOString()
      };

      state.leaveRequests.push(newLeave);
      store.saveState();

      return sendJson(res, 201, {
        userStory: 'US1',
        message: 'Permohonan cuti berhasil diajukan',
        leaveApplication: {
          ...newLeave,
          leavePeriod: {
            startDate: newLeave.startDate,
            endDate: newLeave.endDate,
            formatted: `${newLeave.startDate} s/d ${newLeave.endDate}`
          }
        },
        employeeSummary: buildEmployeeLeaveSummary(emp, state.leaveRequests, state.meta.currentYear, state.meta.currentYear)
      });
    }

    if (req.method === 'GET' && pathname === '/api/hr/employees') {
      const year = query.year || state.meta.currentYear;
      const employeesWithLeave = state.employees.map((emp) =>
        buildEmployeeLeaveSummary(emp, state.leaveRequests, state.meta.currentYear, year)
      );
      return sendJson(res, 200, {
        userStory: 'US1',
        year: Number(year),
        totalEmployees: employeesWithLeave.length,
        employees: employeesWithLeave
      });
    }

    const hrEmpMatch = pathname.match(/^\/api\/hr\/employees\/([^/]+)\/leaves$/);
    if (req.method === 'GET' && hrEmpMatch) {
      const identifier = decodeURIComponent(hrEmpMatch[1]).trim().toLowerCase();
      const emp = state.employees.find(
        (e) =>
          e.employeeId.toLowerCase() === identifier ||
          e.employeeName.toLowerCase() === identifier ||
          e.employeeName.toLowerCase().includes(identifier)
      );
      if (!emp) {
        return sendJson(res, 404, { userStory: 'US1', error: 'Data pegawai tidak ditemukan', searchedEmployee: decodeURIComponent(hrEmpMatch[1]) });
      }
      return sendJson(res, 200, {
        userStory: 'US1',
        ...buildEmployeeLeaveSummary(emp, state.leaveRequests, state.meta.currentYear, query.year || state.meta.currentYear)
      });
    }

    // ------------------------------------------------------------------------
    // 4. USER STORY 2 & 3 (US2 & US3): FLIGHTS & BOOKINGS
    // ------------------------------------------------------------------------
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/flights/multi-destination') {
      const body = req.method === 'POST' ? await parseJsonBody(req) : {};
      const rawDestinations =
        body.destinations ||
        (query.destinations ? query.destinations.split(',').map((s) => s.trim()) : []);
      const originFilter = body.origin || query.origin;
      const dateFilter = body.date || query.date;

      if (!Array.isArray(rawDestinations) || rawDestinations.length === 0) {
        return sendJson(res, 400, {
          userStory: 'US3',
          error: 'Parameter destinations wajib diisi (contoh: ?destinations=DPS,SUB,YIA)'
        });
      }

      const resultsByDestination = rawDestinations.map((destQuery) => {
        const matchedFlights = state.flights.filter((f) => {
          const destOk = matchesLocation(f.destination, f.destinationCity, destQuery, airportForCode(state, f.destination));
          const origOk = matchesLocation(f.origin, f.originCity, originFilter, airportForCode(state, f.origin));
          const dateOk = !dateFilter || f.date === dateFilter;
          return destOk && origOk && dateOk && f.seatsAvailable > 0;
        });

        return {
          requestedDestination: destQuery,
          totalFlightsAvailable: matchedFlights.length,
          airlinePriceSummary: buildAirlinePriceSummary(matchedFlights),
          flights: matchedFlights
        };
      });

      const flatFlights = resultsByDestination.flatMap((group) => group.flights);
      return sendJson(res, 200, {
        userStory: 'US3',
        requestedDestinations: rawDestinations,
        originFilter: originFilter || null,
        dateFilter: dateFilter || null,
        totalMatchingFlights: flatFlights.length,
        resultsByDestination,
        flights: flatFlights
      });
    }

    if (req.method === 'GET' && pathname === '/api/flights') {
      const { destination, destinations, origin, date, airline, cabinClass, maxPrice, departureTime, scope } = query;
      const destList = destinations
        ? destinations.split(',').map((d) => d.trim()).filter(Boolean)
        : destination
          ? [destination.trim()]
          : [];

      let matched = state.flights.filter((f) => f.seatsAvailable > 0);
      if (destList.length > 0) {
        matched = matched.filter((f) =>
          destList.some((d) => matchesLocation(f.destination, f.destinationCity, d, airportForCode(state, f.destination)))
        );
      }
      if (origin) {
        matched = matched.filter((f) => matchesLocation(f.origin, f.originCity, origin, airportForCode(state, f.origin)));
      }
      if (date) {
        matched = matched.filter((f) => f.date === date);
      }
      if (airline) {
        const qAirline = airline.toLowerCase();
        matched = matched.filter((f) => f.airline.toLowerCase().includes(qAirline) || f.airlineCode.toLowerCase() === qAirline);
      }
      if (cabinClass) {
        matched = matched.filter((f) => f.cabinClass.toLowerCase() === cabinClass.toLowerCase());
      }
      if (scope === 'international') {
        matched = matched.filter((f) => f.isInternational);
      } else if (scope === 'domestic') {
        matched = matched.filter((f) => !f.isInternational);
      }
      if (maxPrice && !Number.isNaN(Number(maxPrice))) {
        matched = matched.filter((f) => f.price <= Number(maxPrice));
      }
      if (departureTime) {
        matched = matched.filter((f) => matchesDepartureTimePreference(f.departureTime, departureTime));
      }

      return sendJson(res, 200, {
        userStory: destList.length > 1 ? 'US3' : 'US2',
        filtersApplied: {
          destination: destination || null,
          destinations: destList.length > 0 ? destList : null,
          origin: origin || null,
          date: date || null,
          airline: airline || null,
          cabinClass: cabinClass || null,
          maxPrice: maxPrice ? Number(maxPrice) : null,
          departureTime: departureTime || null
        },
        totalAvailableFlights: matched.length,
        airlinePriceSummary: buildAirlinePriceSummary(matched),
        flights: matched
      });
    }

    if (req.method === 'POST' && pathname === '/api/bookings') {
      const body = await parseJsonBody(req);
      const {
        userId,
        passengerName,
        passengerEmail,
        passengerPhone,
        identityNumber,
        nationality,
        flightId,
        seatNumber,
        cabinClass,
        fareTier,
        seatFee,
        passengerCount,
        paymentMethod,
        specialRequest,
        status
      } = body;

      if (!flightId || !passengerName) {
        return sendJson(res, 400, {
          userStory: 'US2',
          error: 'Parameter flightId dan passengerName wajib diisi untuk pemesanan tiket'
        });
      }

      const flight = state.flights.find((f) => f.flightId === flightId);
      if (!flight) {
        return sendJson(res, 404, { userStory: 'US2', error: 'Jadwal penerbangan tidak ditemukan', flightId });
      }
      const paxCount = Math.max(1, Number(passengerCount) || 1);
      if (flight.seatsAvailable < paxCount) {
        return sendJson(res, 400, { userStory: 'US2', error: 'Kursi penerbangan sudah penuh', flightId });
      }

      flight.seatsAvailable -= paxCount;
      const pricing = computeBookingPricing(flight, fareTier || 'Standard', seatFee || 0, paxCount);
      const bookingReference = generateBookingReference();
      const chosenStatus = status || (paymentMethod ? 'confirmed' : 'booked');

      const newBooking = {
        bookingId: `BK-${state.meta.currentYear}-${String(state.bookings.length + 1).padStart(3, '0')}`,
        bookingReference,
        bookingType: 'user',
        userId: userId || 'USR-GUEST',
        memberId: null,
        visitorId: null,
        passengerName,
        passengerEmail: passengerEmail || 'user@example.id',
        passengerPhone: passengerPhone || '+628100000000',
        identityNumber: identityNumber || '3500000000000001',
        nationality: nationality || 'Indonesia',
        passengerCount: paxCount,
        flightId: flight.flightId,
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        origin: flight.origin,
        destination: flight.destination,
        date: flight.date,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        price: pricing.totalAmount,
        basePrice: flight.price,
        cabinClass: cabinClass || flight.cabinClass,
        fareTier: pricing.fareTier,
        seatNumber: seatNumber || `${Math.floor(Math.random() * 10) + 10}A`,
        terminalOrigin: flight.terminalOrigin || 'Terminal 3',
        gate: flight.gate || 'G12',
        specialRequest: specialRequest || null,
        paymentMethod: paymentMethod || null,
        status: chosenStatus,
        authorizedByTravelManager: chosenStatus === 'confirmed',
        authorizedAt: chosenStatus === 'confirmed' ? new Date().toISOString() : null,
        ticketValidated: chosenStatus === 'confirmed',
        eTicketNumber: `ETKT-${flight.airlineCode}-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString()
      };

      state.bookings.push(newBooking);
      if (chosenStatus === 'confirmed' && newBooking.passengerEmail) {
        state.emailNotifications.push({
          emailId: `EML-${state.meta.currentYear}-${String(state.emailNotifications.length + 1).padStart(3, '0')}`,
          recipientEmail: newBooking.passengerEmail,
          recipientName: newBooking.passengerName,
          visitorId: null,
          subject: `E-Tiket & Boarding Pass ${flight.airline} ${flight.flightNumber} (${bookingReference})`,
          bookingReference,
          eTicketNumber: newBooking.eTicketNumber,
          sentAt: new Date().toISOString(),
          deliveryStatus: 'DELIVERED',
          eTicketPayload: {
            bookingReference,
            eTicketNumber: newBooking.eTicketNumber,
            passengerName: newBooking.passengerName,
            flightNumber: flight.flightNumber,
            airline: flight.airline,
            route: `${flight.origin} -> ${flight.destination}`,
            date: flight.date,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            seatNumber: newBooking.seatNumber,
            status: newBooking.status
          }
        });
      }
      store.saveState();

      const sameRouteOptions = state.flights
        .filter((f) => f.origin === flight.origin && f.destination === flight.destination)
        .map((f) => ({
          flightId: f.flightId,
          flightNumber: f.flightNumber,
          airline: f.airline,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          price: f.price
        }));

      return sendJson(res, 201, {
        userStory: 'US2',
        message: 'Tiket pesawat berhasil dipesan sesuai preferensi',
        booking: newBooking,
        selectedTicketAndAirline: {
          flightId: flight.flightId,
          flightNumber: flight.flightNumber,
          airline: flight.airline,
          route: `${flight.origin} (${flight.originCity}) -> ${flight.destination} (${flight.destinationCity})`,
          date: flight.date,
          schedule: `${flight.departureTime} - ${flight.arrivalTime}`,
          price: newBooking.price
        },
        availableRouteTicketOptions: sameRouteOptions
      });
    }

    if (req.method === 'GET' && pathname === '/api/bookings') {
      const { userId, status } = query;
      let list = [...state.bookings];
      if (userId) list = list.filter((b) => b.userId === userId);
      if (status) list = list.filter((b) => b.status.toLowerCase() === status.toLowerCase());
      return sendJson(res, 200, {
        userStory: 'US2',
        totalBookings: list.length,
        availableActiveBookingsCount: list.filter((b) => b.status !== 'cancelled').length,
        bookings: list
      });
    }

    const cancelMatch =
      pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/) ||
      (req.method === 'DELETE' ? pathname.match(/^\/api\/bookings\/([^/]+)$/) : null);

    if ((req.method === 'POST' || req.method === 'DELETE') && cancelMatch) {
      const idOrRef = decodeURIComponent(cancelMatch[1]).trim();
      const targetBooking = state.bookings.find(
        (b) =>
          b.bookingId.toLowerCase() === idOrRef.toLowerCase() ||
          b.bookingReference.toLowerCase() === idOrRef.toLowerCase()
      );
      if (!targetBooking) {
        return sendJson(res, 404, { userStory: 'US2', error: 'Data pesanan tiket tidak ditemukan', searchedIdentifier: idOrRef });
      }
      if (targetBooking.status !== 'cancelled') {
        targetBooking.status = 'cancelled';
        targetBooking.cancelledAt = new Date().toISOString();
        const flight = state.flights.find((f) => f.flightId === targetBooking.flightId);
        if (flight) {
          flight.seatsAvailable += targetBooking.passengerCount || 1;
        }
        store.saveState();
      }
      return sendJson(res, 200, {
        userStory: 'US2',
        message: 'Pesanan tiket pesawat berhasil dibatalkan',
        cancelledBooking: targetBooking,
        availableActiveBookings: state.bookings.filter((b) => b.status !== 'cancelled')
      });
    }

    // ------------------------------------------------------------------------
    // 5. USER STORY 4, 5, 6 (US4 - US6): FREQUENT TRAVELLER
    // ------------------------------------------------------------------------
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/frequent-traveller/multi-city') {
      const body = req.method === 'POST' ? await parseJsonBody(req) : {};
      let requestedLegs = Array.isArray(body.legs) ? body.legs : [];
      if (requestedLegs.length === 0) {
        const dates = body.dates || (query.dates ? query.dates.split(',') : query.date ? [query.date] : []);
        const origins = body.origins || (query.origins ? query.origins.split(',') : query.origin ? [query.origin] : []);
        const destinations =
          body.destinations ||
          (query.destinations ? query.destinations.split(',') : query.destination ? [query.destination] : []);
        const maxLen = Math.max(dates.length, origins.length, destinations.length);
        for (let i = 0; i < maxLen; i += 1) {
          requestedLegs.push({
            origin: origins[i] ? String(origins[i]).trim() : null,
            destination: destinations[i] ? String(destinations[i]).trim() : null,
            date: dates[i] ? String(dates[i]).trim() : null
          });
        }
      }

      if (requestedLegs.length === 0) {
        return sendJson(res, 400, {
          userStory: 'US4',
          error: 'Masukkan kriteria multi-destinasi melalui array legs [{ origin, destination, date }]'
        });
      }

      const legSearchResults = requestedLegs.map((leg, idx) => {
        const matchingFlights = state.flights
          .filter((f) => {
            const origOk = !leg.origin || matchesLocation(f.origin, f.originCity, leg.origin, airportForCode(state, f.origin));
            const destOk = !leg.destination || matchesLocation(f.destination, f.destinationCity, leg.destination, airportForCode(state, f.destination));
            const dateOk = !leg.date || f.date === leg.date;
            return origOk && destOk && dateOk && f.seatsAvailable > 0;
          })
          .sort((a, b) => a.price - b.price);

        return {
          legIndex: idx + 1,
          criteria: { origin: leg.origin || 'ANY', destination: leg.destination || 'ANY', date: leg.date || 'ANY' },
          availableFlightsCount: matchingFlights.length,
          lowestLegPrice: matchingFlights.length > 0 ? matchingFlights[0].price : null,
          flights: matchingFlights
        };
      });

      let combinedItineraries = [[]];
      for (const legGroup of legSearchResults) {
        if (legGroup.flights.length === 0) {
          combinedItineraries = [];
          break;
        }
        const nextCombos = [];
        for (const prefix of combinedItineraries) {
          for (const flight of legGroup.flights.slice(0, 3)) {
            nextCombos.push([...prefix, flight]);
          }
        }
        combinedItineraries = nextCombos.slice(0, 12);
      }

      const formattedItineraries = combinedItineraries
        .map((segments, index) => ({
          itineraryId: `MC-ITIN-${index + 1}`,
          totalFlights: segments.length,
          totalPrice: segments.reduce((sum, s) => sum + s.price, 0),
          totalDurationMinutes: segments.reduce((sum, s) => sum + s.durationMinutes, 0),
          airlinesInvolved: Array.from(new Set(segments.map((s) => s.airline))),
          routeSummary: segments.map((s) => `${s.origin}->${s.destination} (${s.date})`).join(' | '),
          segments
        }))
        .sort((a, b) => a.totalPrice - b.totalPrice);

      return sendJson(res, 200, {
        userStory: 'US4',
        searchCriteria: requestedLegs,
        totalLegsRequested: requestedLegs.length,
        totalAvailableFlightsAcrossLegs: legSearchResults.reduce((sum, l) => sum + l.availableFlightsCount, 0),
        legBreakdown: legSearchResults,
        multiDestinationItinerariesComparison: formattedItineraries
      });
    }

    const ftProfileMatch = pathname.match(/^\/api\/frequent-traveller\/profile\/([^/]+)$/);
    if (req.method === 'GET' && ftProfileMatch) {
      const memberId = decodeURIComponent(ftProfileMatch[1]).trim();
      const member = state.frequentTravellers.find((m) => m.memberId.toLowerCase() === memberId.toLowerCase());
      if (!member) {
        return sendJson(res, 404, { userStory: 'US5', error: 'Member frequent traveller tidak ditemukan', memberId });
      }
      return sendJson(res, 200, { userStory: 'US5', profile: member, ...evaluateProfileCompleteness(member) });
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && ftProfileMatch) {
      const memberId = decodeURIComponent(ftProfileMatch[1]).trim();
      const member = state.frequentTravellers.find((m) => m.memberId.toLowerCase() === memberId.toLowerCase());
      if (!member) {
        return sendJson(res, 404, { userStory: 'US5', error: 'Member frequent traveller tidak ditemukan', memberId });
      }
      const body = await parseJsonBody(req);
      const updatableFields = ['fullName', 'email', 'phone', 'identityNumber', 'birthDate', 'nationality', 'address', 'frequentFlyerNumber'];
      for (const field of updatableFields) {
        if (body[field] !== undefined) member[field] = body[field];
      }
      member.updatedAt = new Date().toISOString();
      store.saveState();
      return sendJson(res, 200, {
        userStory: 'US5',
        message: 'Data profil member frequent traveller berhasil diperbarui',
        profile: member,
        ...evaluateProfileCompleteness(member)
      });
    }

    if (req.method === 'POST' && pathname === '/api/frequent-traveller/validate-ticket') {
      const body = await parseJsonBody(req);
      const { memberId, bookingReference, bookingId } = body;
      const member = state.frequentTravellers.find((m) => m.memberId.toLowerCase() === String(memberId || '').toLowerCase());
      if (!member) {
        return sendJson(res, 404, { userStory: 'US5', valid: false, error: 'Member frequent traveller tidak ditemukan', memberId });
      }
      const completeness = evaluateProfileCompleteness(member);
      if (!completeness.isProfileComplete) {
        return sendJson(res, 400, {
          userStory: 'US5',
          valid: false,
          status: 'REJECTED_INCOMPLETE_PROFILE',
          message: 'data profil tidak lengkap',
          missingFields: completeness.missingFields,
          memberId: member.memberId,
          instruction: 'Silakan lengkapi seluruh field data profil terlebih dahulu sebelum melakukan validasi tiket.'
        });
      }

      let targetBooking = null;
      if (bookingReference || bookingId) {
        targetBooking = state.bookings.find(
          (b) =>
            (bookingReference && b.bookingReference.toLowerCase() === String(bookingReference).toLowerCase()) ||
            (bookingId && b.bookingId.toLowerCase() === String(bookingId).toLowerCase())
        );
      } else {
        targetBooking = state.bookings.find((b) => b.memberId === member.memberId);
      }
      if (targetBooking) {
        targetBooking.ticketValidated = true;
        targetBooking.validatedAt = new Date().toISOString();
        store.saveState();
      }

      return sendJson(res, 200, {
        userStory: 'US5',
        valid: true,
        status: 'VALIDATED',
        message: 'Validasi tiket berhasil dilakukan berdasarkan data profil yang lengkap',
        validationCode: `VAL-${member.memberId}-${Date.now().toString().slice(-5)}`,
        validatedAt: new Date().toISOString(),
        memberProfile: member,
        validatedTicket: targetBooking || {
          memberId: member.memberId,
          passengerName: member.fullName,
          identityNumber: member.identityNumber,
          frequentFlyerNumber: member.frequentFlyerNumber,
          ticketStatus: 'READY_FOR_BOARDING'
        }
      });
    }

    if (req.method === 'GET' && pathname === '/api/frequent-traveller/flights/compare') {
      const { destination, origin, date, departureTime } = query;
      let matched = state.flights.filter((f) => f.seatsAvailable > 0);
      if (destination) matched = matched.filter((f) => matchesLocation(f.destination, f.destinationCity, destination));
      if (origin) matched = matched.filter((f) => matchesLocation(f.origin, f.originCity, origin));
      if (date) matched = matched.filter((f) => f.date === date);
      if (departureTime) matched = matched.filter((f) => matchesDepartureTimePreference(f.departureTime, departureTime));

      const sortedByPrice = [...matched].sort((a, b) => a.price - b.price);
      const lowestPrice = sortedByPrice.length > 0 ? sortedByPrice[0].price : null;
      const highestPrice = sortedByPrice.length > 0 ? sortedByPrice[sortedByPrice.length - 1].price : null;
      const averagePrice =
        sortedByPrice.length > 0
          ? Math.round(sortedByPrice.reduce((sum, f) => sum + f.price, 0) / sortedByPrice.length)
          : null;

      const comparedFlights = sortedByPrice.map((f, index) => ({
        rankByPrice: index + 1,
        flightId: f.flightId,
        flightNumber: f.flightNumber,
        airline: f.airline,
        origin: f.origin,
        originCity: f.originCity,
        destination: f.destination,
        destinationCity: f.destinationCity,
        date: f.date,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        durationMinutes: f.durationMinutes,
        cabinClass: f.cabinClass,
        baggageKg: f.baggageKg,
        price: f.price,
        priceDifferenceFromCheapest: lowestPrice !== null ? f.price - lowestPrice : 0,
        isCheapestOption: index === 0,
        frequentFlyerMilesEarned: Math.round(f.price / 1000),
        seatsAvailable: f.seatsAvailable
      }));

      return sendJson(res, 200, {
        userStory: 'US6',
        preferences: {
          origin: origin || 'ANY',
          destination: destination || 'ANY',
          date: date || 'ANY',
          departureTime: departureTime || 'ANY'
        },
        comparisonSummary: {
          totalOptions: comparedFlights.length,
          lowestPrice,
          highestPrice,
          averagePrice,
          cheapestFlight: comparedFlights[0] || null
        },
        comparedFlights
      });
    }

    if (req.method === 'POST' && pathname === '/api/frequent-traveller/bookings') {
      const body = await parseJsonBody(req);
      const { memberId, flightId, seatNumber, specialRequest } = body;
      const member = state.frequentTravellers.find((m) => m.memberId.toLowerCase() === String(memberId || 'FT-001').toLowerCase());
      if (!member) {
        return sendJson(res, 404, { userStory: 'US6', error: 'Member frequent traveller tidak ditemukan', memberId });
      }
      const flight = state.flights.find((f) => f.flightId === flightId);
      if (!flight) {
        return sendJson(res, 404, { userStory: 'US6', error: 'Penerbangan yang dipilih tidak ditemukan', flightId });
      }
      if (flight.seatsAvailable <= 0) {
        return sendJson(res, 400, { userStory: 'US6', error: 'Kursi pada penerbangan pilihan sudah habis', flightId });
      }

      flight.seatsAvailable -= 1;
      const milesEarned = Math.round(flight.price / 1000);
      member.points += milesEarned;
      const bookingReference = generateBookingReference();

      const newBooking = {
        bookingId: `BK-${state.meta.currentYear}-${String(state.bookings.length + 1).padStart(3, '0')}`,
        bookingReference,
        bookingType: 'frequent_traveller',
        userId: null,
        memberId: member.memberId,
        visitorId: null,
        passengerName: member.fullName,
        passengerEmail: member.email,
        passengerPhone: member.phone || '+628110000000',
        identityNumber: member.identityNumber || '-',
        flightId: flight.flightId,
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        origin: flight.origin,
        destination: flight.destination,
        date: flight.date,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        price: flight.price,
        cabinClass: flight.cabinClass,
        fareTier: 'Standard',
        seatNumber: seatNumber || '11A',
        terminalOrigin: flight.terminalOrigin || 'Terminal 3',
        gate: flight.gate || 'G12',
        specialRequest: specialRequest || null,
        status: 'booked',
        authorizedByTravelManager: false,
        authorizedAt: null,
        ticketValidated: evaluateProfileCompleteness(member).isProfileComplete,
        eTicketNumber: `ETKT-${flight.airlineCode}-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString()
      };

      state.bookings.push(newBooking);
      store.saveState();

      return sendJson(res, 201, {
        userStory: 'US6',
        message: 'Pemesanan tiket member frequent traveller berhasil dibuat',
        booking: newBooking,
        bookingPage: {
          pageTitle: `Konfirmasi Pemesanan Frequent Traveller - ${bookingReference}`,
          memberSummary: {
            memberId: member.memberId,
            fullName: member.fullName,
            tier: member.tier,
            milesEarnedThisFlight: milesEarned,
            totalMilesBalance: member.points
          },
          flightSummary: {
            flightNumber: flight.flightNumber,
            airline: flight.airline,
            route: `${flight.origin} (${flight.originCity}) -> ${flight.destination} (${flight.destinationCity})`,
            date: flight.date,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            seatNumber: newBooking.seatNumber,
            totalPriceIDR: flight.price
          },
          paymentAndStatus: {
            bookingReference,
            currentStatus: newBooking.status,
            nextStep: 'Menunggu otorisasi manajer travel atau konfirmasi pembayaran'
          }
        }
      });
    }

    // ------------------------------------------------------------------------
    // 6. USER STORY 7, 8, 9 (US7 - US9): TRAVEL MANAGER & VISITOR
    // ------------------------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/travel-manager/bookings') {
      const { status } = query;
      const statusCounts = {
        confirmed: state.bookings.filter((b) => b.status === 'confirmed').length,
        booked: state.bookings.filter((b) => b.status === 'booked').length,
        'waiting for the payment': state.bookings.filter((b) => b.status === 'waiting for the payment').length,
        cancelled: state.bookings.filter((b) => b.status === 'cancelled').length
      };
      let filteredBookings = [...state.bookings];
      if (status && status.toLowerCase() !== 'all') {
        const normalizedStatus = status.trim().toLowerCase();
        filteredBookings = filteredBookings.filter((b) => b.status.toLowerCase() === normalizedStatus);
      }
      return sendJson(res, 200, {
        userStory: 'US7',
        selectedStatusFilter: status || 'ALL',
        availableStatuses: ['confirmed', 'booked', 'waiting for the payment'],
        statusSummaryCounts: statusCounts,
        totalDisplayedBookings: filteredBookings.length,
        bookings: filteredBookings
      });
    }

    if (req.method === 'GET' && pathname === '/api/travel-manager/flights') {
      const { destination, origin, date, airline } = query;
      let matched = state.flights.filter((f) => f.seatsAvailable > 0);
      if (destination) matched = matched.filter((f) => matchesLocation(f.destination, f.destinationCity, destination));
      if (origin) matched = matched.filter((f) => matchesLocation(f.origin, f.originCity, origin));
      if (date) matched = matched.filter((f) => f.date === date);
      if (airline) matched = matched.filter((f) => f.airline.toLowerCase().includes(airline.toLowerCase()));
      return sendJson(res, 200, {
        userStory: 'US8',
        role: 'travel_manager',
        searchCriteria: { destination: destination || 'ANY', origin: origin || 'ANY', date: date || 'ANY', airline: airline || 'ANY' },
        totalFlightsFound: matched.length,
        flights: matched
      });
    }

    if (req.method === 'POST' && pathname === '/api/travel-manager/bookings/visitor') {
      const body = await parseJsonBody(req);
      const { visitorId, visitorName, visitorEmail, visitorPhone, identityNumber, flightId, seatNumber, status } = body;
      if (!flightId || (!visitorId && (!visitorName || !visitorEmail))) {
        return sendJson(res, 400, {
          userStory: 'US8',
          error: 'Parameter flightId serta data pengunjung (visitorId atau pasangan visitorName & visitorEmail) wajib diisi'
        });
      }
      const flight = state.flights.find((f) => f.flightId === flightId);
      if (!flight) {
        return sendJson(res, 404, { userStory: 'US8', error: 'Jadwal penerbangan tidak ditemukan', flightId });
      }
      if (flight.seatsAvailable <= 0) {
        return sendJson(res, 400, { userStory: 'US8', error: 'Kursi penerbangan sudah penuh', flightId });
      }

      let visitor = state.visitors.find(
        (v) =>
          (visitorId && v.visitorId.toLowerCase() === String(visitorId).toLowerCase()) ||
          (visitorEmail && v.visitorEmail.toLowerCase() === String(visitorEmail).toLowerCase())
      );
      if (!visitor) {
        visitor = {
          visitorId: visitorId || `VIS-${String(state.visitors.length + 1).padStart(3, '0')}`,
          visitorName: visitorName || 'Pengunjung Terdaftar',
          visitorEmail: visitorEmail || 'visitor@example.id',
          visitorPhone: visitorPhone || '+628120000000',
          identityNumber: identityNumber || '3500000000009999'
        };
        state.visitors.push(visitor);
      } else {
        if (visitorName) visitor.visitorName = visitorName;
        if (visitorEmail) visitor.visitorEmail = visitorEmail;
        if (visitorPhone) visitor.visitorPhone = visitorPhone;
        if (identityNumber) visitor.identityNumber = identityNumber;
      }

      flight.seatsAvailable -= 1;
      const bookingReference = generateBookingReference();
      const eTicketNumber = `ETKT-${flight.airlineCode}-${Date.now().toString().slice(-6)}`;

      const visitorBooking = {
        bookingId: `BK-${state.meta.currentYear}-${String(state.bookings.length + 1).padStart(3, '0')}`,
        bookingReference,
        bookingType: 'visitor',
        bookedByRole: 'travel_manager',
        userId: null,
        memberId: null,
        visitorId: visitor.visitorId,
        passengerName: visitor.visitorName,
        passengerEmail: visitor.visitorEmail,
        passengerPhone: visitor.visitorPhone,
        identityNumber: visitor.identityNumber,
        flightId: flight.flightId,
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        origin: flight.origin,
        destination: flight.destination,
        date: flight.date,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        price: flight.price,
        cabinClass: flight.cabinClass,
        fareTier: 'Standard',
        seatNumber: seatNumber || '15A',
        terminalOrigin: flight.terminalOrigin || 'Terminal 3',
        gate: flight.gate || 'G12',
        status: status || 'confirmed',
        authorizedByTravelManager: true,
        authorizedAt: new Date().toISOString(),
        ticketValidated: true,
        eTicketNumber,
        createdAt: new Date().toISOString()
      };

      state.bookings.push(visitorBooking);
      const emailRecord = {
        emailId: `EML-${state.meta.currentYear}-${String(state.emailNotifications.length + 1).padStart(3, '0')}`,
        recipientEmail: visitor.visitorEmail,
        recipientName: visitor.visitorName,
        visitorId: visitor.visitorId,
        subject: `E-Tiket Penerbangan ${flight.airline} ${flight.flightNumber} (Kode Booking: ${bookingReference})`,
        bookingReference,
        eTicketNumber,
        sentAt: new Date().toISOString(),
        deliveryStatus: 'DELIVERED',
        eTicketPayload: {
          eTicketNumber,
          bookingReference,
          visitorId: visitor.visitorId,
          passengerName: visitor.visitorName,
          passengerEmail: visitor.visitorEmail,
          identityNumber: visitor.identityNumber,
          airline: flight.airline,
          flightNumber: flight.flightNumber,
          origin: `${flight.origin} (${flight.originCity})`,
          destination: `${flight.destination} (${flight.destinationCity})`,
          date: flight.date,
          departureTime: flight.departureTime,
          arrivalTime: flight.arrivalTime,
          seatNumber: visitorBooking.seatNumber,
          priceIDR: flight.price,
          status: visitorBooking.status
        }
      };
      state.emailNotifications.push(emailRecord);
      store.saveState();

      return sendJson(res, 201, {
        userStory: 'US8',
        message: 'Tiket penerbangan atas nama pengunjung berhasil dipesan oleh Manajer Travel dan e-tiket telah dikirim ke email pengunjung',
        visitorAccount: visitor,
        booking: visitorBooking,
        eTicketEmailNotification: emailRecord
      });
    }

    const visitorTicketsMatch = pathname.match(/^\/api\/visitors\/([^/]+)\/tickets$/);
    if (req.method === 'GET' && visitorTicketsMatch) {
      const idOrEmail = decodeURIComponent(visitorTicketsMatch[1]).trim().toLowerCase();
      const visitor = state.visitors.find(
        (v) => v.visitorId.toLowerCase() === idOrEmail || v.visitorEmail.toLowerCase() === idOrEmail
      );
      const tickets = state.bookings.filter(
        (b) =>
          (b.visitorId && b.visitorId.toLowerCase() === idOrEmail) ||
          (b.passengerEmail && b.passengerEmail.toLowerCase() === idOrEmail) ||
          (visitor && b.visitorId === visitor.visitorId)
      );
      return sendJson(res, 200, {
        userStory: 'US8',
        visitor: visitor || { identifier: idOrEmail },
        totalTicketsInAccount: tickets.length,
        tickets
      });
    }

    const visitorEmailsMatch = pathname.match(/^\/api\/visitors\/([^/]+)\/emails$/);
    if (req.method === 'GET' && visitorEmailsMatch) {
      const idOrEmail = decodeURIComponent(visitorEmailsMatch[1]).trim().toLowerCase();
      const emails = state.emailNotifications.filter(
        (e) =>
          (e.visitorId && e.visitorId.toLowerCase() === idOrEmail) ||
          (e.recipientEmail && e.recipientEmail.toLowerCase() === idOrEmail)
      );
      return sendJson(res, 200, {
        userStory: 'US8',
        recipientIdentifier: decodeURIComponent(visitorEmailsMatch[1]),
        totalEmailsReceived: emails.length,
        emails
      });
    }

    const authGetMatch = pathname.match(/^\/api\/travel-manager\/authorize\/([^/]+)$/);
    if (
      (req.method === 'POST' && pathname === '/api/travel-manager/authorize') ||
      (req.method === 'GET' && authGetMatch)
    ) {
      const body = req.method === 'POST' ? await parseJsonBody(req) : {};
      const rawRef = authGetMatch
        ? decodeURIComponent(authGetMatch[1])
        : body.bookingReference || query.bookingReference || '';
      const bookingReference = String(rawRef).trim();
      const action = body.action || query.action || 'authorize';

      const targetBooking = state.bookings.find(
        (b) => b.bookingReference.toLowerCase() === bookingReference.toLowerCase()
      );
      if (!bookingReference || !targetBooking) {
        return sendJson(res, 404, {
          userStory: 'US9',
          authorized: false,
          validReference: false,
          inputBookingReference: bookingReference || null,
          message: 'kode booking reference tidak sesuai',
          retryPrompt: 'Kode booking reference tidak sesuai. Silakan ulangi input kode booking reference yang valid.',
          requiresRetry: true
        });
      }

      if (action === 'authorize' || action === 'confirm') {
        targetBooking.authorizedByTravelManager = true;
        targetBooking.authorizedAt = new Date().toISOString();
        if (targetBooking.status === 'booked' || targetBooking.status === 'waiting for the payment') {
          targetBooking.status = body.targetStatus || 'confirmed';
        }
        store.saveState();
      }

      return sendJson(res, 200, {
        userStory: 'US9',
        authorized: targetBooking.authorizedByTravelManager,
        validReference: true,
        bookingReference: targetBooking.bookingReference,
        bookingStatus: targetBooking.status,
        authorizedAt: targetBooking.authorizedAt,
        message: 'Otorisasi tiket berhasil diverifikasi sesuai kode booking reference',
        bookingDetails: targetBooking
      });
    }

    return sendJson(res, 404, {
      error: 'Endpoint tidak ditemukan',
      method: req.method,
      path: pathname
    });
  } catch (err) {
    return sendJson(res, 500, {
      error: 'Terjadi kesalahan pada server',
      details: err.message
    });
  }
}

module.exports = { handleRequest };
