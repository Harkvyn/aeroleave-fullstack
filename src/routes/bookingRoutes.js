const store = require('../store');
const { canAccessBooking } = require('../auth');
const { buildAirlinePriceSummary } = require('../helpers');
const { sendJson, parseJsonBody, requireAuth, requireRoles } = require('../http');

async function handleBookingRoutes(req, res, pathname, query) {
  if (req.method === 'POST' && pathname === '/api/bookings') {
    const user = requireRoles(req, res, ['visitor', 'frequent_traveller', 'employee', 'hr_manager', 'travel_manager']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const { booking, pricing, flight } = store.createUserBooking(user, body);
    const routeFlights = store
      .listFlights()
      .filter((f) => f.origin === flight.origin && f.destination === flight.destination && f.seatsAvailable > 0);

    return sendJson(res, 201, {
      message: 'Pemesanan tiket berhasil dibuat',
      booking,
      pricing,
      availableRouteTicketOptions: buildAirlinePriceSummary(routeFlights)
    });
  }

  if (req.method === 'GET' && pathname === '/api/bookings') {
    const user = requireAuth(req, res);
    if (!user) return true;

    const { userId, status } = query;
    if (user.role !== 'travel_manager' && userId && userId !== user.userId) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Anda tidak dapat melihat booking pengguna lain.' });
    }

    let list = store.listAllBookings();
    if (user.role !== 'travel_manager') {
      list = list.filter((b) => canAccessBooking(user, b));
    } else if (userId) {
      list = list.filter((b) => b.userId === userId || b.bookedByUserId === userId);
    }

    if (status) {
      list = list.filter((b) => b.status.toLowerCase() === String(status).toLowerCase());
    }

    return sendJson(res, 200, { totalBookings: list.length, bookings: list });
  }

  const payBookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);
  if (req.method === 'POST' && payBookingMatch) {
    const user = requireAuth(req, res);
    if (!user) return true;
    const idOrRef = decodeURIComponent(payBookingMatch[1]);
    const body = await parseJsonBody(req);
    const { booking, emailNotification } = store.payBooking(user, idOrRef, body);
    return sendJson(res, 200, {
      message: `Pembayaran berhasil. E-Tiket ${booking.eTicketNumber} telah aktif.`,
      booking,
      emailNotification
    });
  }

  const cancelBookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)(?:\/cancel)?$/);
  if (
    cancelBookingMatch &&
    ((req.method === 'POST' && pathname.endsWith('/cancel')) || req.method === 'DELETE')
  ) {
    const user = requireAuth(req, res);
    if (!user) return true;
    const idOrRef = decodeURIComponent(cancelBookingMatch[1]);
    const cancelledBooking = store.cancelBooking(user, idOrRef);
    const availableActiveBookings = store
      .listAllBookings()
      .filter((b) => b.status !== 'cancelled' && (user.role === 'travel_manager' || canAccessBooking(user, b)));

    return sendJson(res, 200, {
      message: 'Tiket berhasil dibatalkan',
      cancelledBooking,
      availableActiveBookings
    });
  }

  const boardingPassMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/boarding-pass$/);
  if (req.method === 'GET' && boardingPassMatch) {
    const user = requireAuth(req, res);
    if (!user) return true;
    const idOrRef = decodeURIComponent(boardingPassMatch[1]);
    const booking = store.findBookingByIdOrRef(idOrRef);
    if (!booking) {
      return sendJson(res, 404, { error: 'Booking tidak ditemukan', message: 'Booking tidak ditemukan' });
    }
    if (!canAccessBooking(user, booking)) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Anda tidak berwenang melihat boarding pass ini.' });
    }
    const flight = store.getFlight(booking.flightId);
    const originAirport = store.getAirport(booking.origin);
    const destAirport = store.getAirport(booking.destination);
    return sendJson(res, 200, {
      booking,
      flight,
      originAirport,
      destAirport,
      qrPayload: `AEROLEAVE|${booking.bookingReference}|${booking.eTicketNumber}|${booking.flightNumber}|${booking.origin}-${booking.destination}|SEAT:${booking.seatNumber}|STATUS:${booking.status}`
    });
  }

  return false;
}

module.exports = { handleBookingRoutes };
