const store = require('../store');
const { matchesLocation } = require('../helpers');
const { sendJson, parseJsonBody, requireRoles } = require('../http');

async function handleTravelManagerRoutes(req, res, pathname, query) {
  if (req.method === 'GET' && pathname === '/api/travel-manager/bookings') {
    const user = requireRoles(req, res, ['travel_manager']);
    if (!user) return true;

    const statusFilter = query.status ? String(query.status).trim().toLowerCase() : '';
    const allBookings = store.listAllBookings();
    const statusSummaryCounts = {
      confirmed: 0,
      booked: 0,
      'waiting for the payment': 0,
      cancelled: 0
    };
    for (const b of allBookings) {
      statusSummaryCounts[b.status] = (statusSummaryCounts[b.status] || 0) + 1;
    }

    const filtered = statusFilter
      ? allBookings.filter((b) => b.status.toLowerCase() === statusFilter)
      : allBookings;

    return sendJson(res, 200, {
      availableStatuses: store.getMeta().validBookingStatuses,
      statusSummaryCounts,
      totalMatchedBookings: filtered.length,
      bookings: filtered
    });
  }

  if (req.method === 'GET' && pathname === '/api/travel-manager/flights') {
    const user = requireRoles(req, res, ['travel_manager']);
    if (!user) return true;

    const { destination, origin, date, airline } = query;
    const matched = store
      .listFlights()
      .filter((f) => {
        if (f.seatsAvailable <= 0) return false;
        if (destination && !matchesLocation(f.destination, f.destinationCity, destination, store.getAirport(f.destination))) {
          return false;
        }
        if (origin && !matchesLocation(f.origin, f.originCity, origin, store.getAirport(f.origin))) return false;
        if (date && f.date !== date) return false;
        if (airline && !f.airline.toLowerCase().includes(String(airline).toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.price - b.price);

    return sendJson(res, 200, { totalFlightsFound: matched.length, flights: matched });
  }

  if (req.method === 'POST' && pathname === '/api/travel-manager/bookings/visitor') {
    const user = requireRoles(req, res, ['travel_manager', 'employee']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const result = store.createVisitorBooking(user, body);
    return sendJson(res, 201, {
      message: 'Tiket untuk pengunjung berhasil dipesan dan e-tiket terkirim ke email',
      ...result
    });
  }

  const visTicketsMatch = pathname.match(/^\/api\/visitors\/([^/]+)\/tickets$/);
  if (req.method === 'GET' && visTicketsMatch) {
    const user = requireRoles(req, res, ['travel_manager', 'visitor']);
    if (!user) return true;
    const idOrEmail = decodeURIComponent(visTicketsMatch[1]).toLowerCase();

    if (
      user.role === 'visitor' &&
      user.visitorId.toLowerCase() !== idOrEmail &&
      user.email.toLowerCase() !== idOrEmail
    ) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Visitor hanya dapat melihat tiket miliknya sendiri.' });
    }

    const visitor = store
      .listVisitors()
      .find((v) => v.visitorId.toLowerCase() === idOrEmail || v.visitorEmail.toLowerCase() === idOrEmail);

    const tickets = store.listAllBookings().filter(
      (b) =>
        (b.visitorId && b.visitorId.toLowerCase() === idOrEmail) ||
        (b.passengerEmail && b.passengerEmail.toLowerCase() === idOrEmail) ||
        (visitor && b.visitorId === visitor.visitorId)
    );

    return sendJson(res, 200, {
      visitor: visitor || { identifier: idOrEmail },
      totalTicketsInAccount: tickets.length,
      tickets
    });
  }

  const visEmailsMatch = pathname.match(/^\/api\/visitors\/([^/]+)\/emails$/);
  if (req.method === 'GET' && visEmailsMatch) {
    const user = requireRoles(req, res, ['travel_manager', 'visitor']);
    if (!user) return true;
    const idOrEmail = decodeURIComponent(visEmailsMatch[1]).toLowerCase();

    if (
      user.role === 'visitor' &&
      user.visitorId.toLowerCase() !== idOrEmail &&
      user.email.toLowerCase() !== idOrEmail
    ) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Visitor hanya dapat melihat inbox email miliknya sendiri.' });
    }

    const visitor = store
      .listVisitors()
      .find((v) => v.visitorId.toLowerCase() === idOrEmail || v.visitorEmail.toLowerCase() === idOrEmail);

    const emails = store.listEmailNotifications().filter(
      (e) =>
        (e.visitorId && e.visitorId.toLowerCase() === idOrEmail) ||
        e.recipientEmail.toLowerCase() === idOrEmail ||
        (visitor && e.visitorId === visitor.visitorId)
    );

    return sendJson(res, 200, {
      recipient: visitor ? visitor.visitorEmail : idOrEmail,
      totalEmailsReceived: emails.length,
      emails
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/travel-manager/authorize/')) {
    return sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Gunakan POST /api/travel-manager/authorize untuk melakukan otorisasi booking.'
    });
  }

  if (req.method === 'POST' && pathname === '/api/travel-manager/authorize') {
    const user = requireRoles(req, res, ['travel_manager']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const result = store.authorizeOrRejectBooking(
      user,
      body.bookingReference,
      body.action || 'authorize',
      body.targetStatus || 'confirmed',
      body.note || ''
    );
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && pathname === '/api/audit-logs') {
    const user = requireRoles(req, res, ['hr_manager', 'travel_manager']);
    if (!user) return true;
    let logs = store.listAuditLogs(100);
    if (user.role === 'hr_manager') {
      logs = logs.filter((l) => l.entityType === 'leave_request' || l.actorUserId === user.userId);
    }
    return sendJson(res, 200, { totalLogs: logs.length, logs });
  }

  return false;
}

module.exports = { handleTravelManagerRoutes };
