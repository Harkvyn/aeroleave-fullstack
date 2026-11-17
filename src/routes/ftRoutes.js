const store = require('../store');
const {
  matchesLocation,
  matchesDepartureTimePreference,
  evaluateProfileCompleteness
} = require('../helpers');
const { sendJson, parseJsonBody, requireRoles } = require('../http');

async function handleFtRoutes(req, res, pathname, query) {
  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/frequent-traveller/multi-city') {
    const user = requireRoles(req, res, ['frequent_traveller', 'travel_manager']);
    if (!user) return true;

    const body = req.method === 'POST' ? await parseJsonBody(req) : {};
    let legs = Array.isArray(body.legs) ? body.legs : [];

    if (legs.length === 0 && query.origins && query.destinations) {
      const origArr = String(query.origins).split(',').map((s) => s.trim());
      const destArr = String(query.destinations).split(',').map((s) => s.trim());
      const dateArr = query.dates ? String(query.dates).split(',').map((s) => s.trim()) : [];
      legs = origArr.map((o, idx) => ({
        origin: o,
        destination: destArr[idx] || '',
        date: dateArr[idx] || ''
      }));
    }

    if (legs.length === 0) {
      return sendJson(res, 400, { error: 'Minimal 1 leg rute multi-city harus diberikan' });
    }

    const flights = store.listFlights();
    const legFlightOptions = legs.map((leg, idx) => {
      const matched = flights
        .filter((f) => {
          if (f.seatsAvailable <= 0) return false;
          if (leg.origin && !matchesLocation(f.origin, f.originCity, leg.origin, store.getAirport(f.origin))) {
            return false;
          }
          if (
            leg.destination &&
            !matchesLocation(f.destination, f.destinationCity, leg.destination, store.getAirport(f.destination))
          ) {
            return false;
          }
          if (leg.date && f.date !== leg.date) return false;
          return true;
        })
        .sort((a, b) => a.price - b.price);

      return {
        legNumber: idx + 1,
        origin: leg.origin,
        destination: leg.destination,
        date: leg.date || null,
        availableFlights: matched
      };
    });

    let combined = [[]];
    for (const leg of legFlightOptions) {
      if (leg.availableFlights.length === 0) {
        combined = [];
        break;
      }
      const next = [];
      for (const prefix of combined) {
        for (const fl of leg.availableFlights) {
          next.push([...prefix, fl]);
        }
      }
      combined = next;
    }

    const multiDestinationItinerariesComparison = combined
      .map((combo, idx) => ({
        itineraryOptionId: `MC-${idx + 1}`,
        totalFlights: combo.length,
        totalPrice: combo.reduce((sum, fl) => sum + fl.price, 0),
        totalDurationMinutes: combo.reduce((sum, fl) => sum + fl.durationMinutes, 0),
        airlines: [...new Set(combo.map((fl) => fl.airline))],
        segments: combo.map((fl) => ({
          flightId: fl.flightId,
          flightNumber: fl.flightNumber,
          airline: fl.airline,
          origin: fl.origin,
          destination: fl.destination,
          date: fl.date,
          departureTime: fl.departureTime,
          arrivalTime: fl.arrivalTime,
          price: fl.price
        }))
      }))
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, 12);

    return sendJson(res, 200, {
      totalLegsRequested: legs.length,
      legFlightOptions,
      multiDestinationItinerariesComparison
    });
  }

  const ftProfileMatch = pathname.match(/^\/api\/frequent-traveller\/profile\/([^/]+)$/);
  if (ftProfileMatch && (req.method === 'GET' || req.method === 'PUT' || req.method === 'PATCH')) {
    const user = requireRoles(req, res, ['frequent_traveller']);
    if (!user) return true;
    const memberId = decodeURIComponent(ftProfileMatch[1]);
    if (user.memberId !== memberId) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Anda hanya dapat mengakses profil member milik sendiri.' });
    }

    if (req.method === 'GET') {
      const member = store.getFrequentTraveller(memberId);
      if (!member) {
        return sendJson(res, 404, { error: 'Member frequent traveller tidak ditemukan' });
      }
      return sendJson(res, 200, { member, ...evaluateProfileCompleteness(member) });
    }

    const body = await parseJsonBody(req);
    const updated = store.updateFrequentTravellerProfile(user, memberId, body);
    return sendJson(res, 200, {
      message: 'Profil frequent traveller berhasil diperbarui',
      ...updated
    });
  }

  if (req.method === 'POST' && pathname === '/api/frequent-traveller/validate-ticket') {
    const user = requireRoles(req, res, ['frequent_traveller']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const targetMemberId = body.memberId || user.memberId;
    const result = store.validateFrequentTravellerTicket(user, targetMemberId, body.bookingReference);
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && pathname === '/api/frequent-traveller/flights/compare') {
    const user = requireRoles(req, res, ['frequent_traveller', 'travel_manager']);
    if (!user) return true;

    const { destination, origin, date, departureTime } = query;
    const matched = store
      .listFlights()
      .filter((f) => {
        if (f.seatsAvailable <= 0) return false;
        if (destination && !matchesLocation(f.destination, f.destinationCity, destination, store.getAirport(f.destination))) {
          return false;
        }
        if (origin && !matchesLocation(f.origin, f.originCity, origin, store.getAirport(f.origin))) return false;
        if (date && f.date !== date) return false;
        if (departureTime && !matchesDepartureTimePreference(f.departureTime, departureTime)) return false;
        return true;
      })
      .sort((a, b) => a.price - b.price);

    const lowestPrice = matched.length > 0 ? matched[0].price : null;
    const highestPrice = matched.length > 0 ? matched[matched.length - 1].price : null;

    return sendJson(res, 200, {
      filters: { destination, origin, date, departureTime },
      comparisonSummary: {
        totalOptions: matched.length,
        lowestPrice,
        highestPrice,
        cheapestFlightId: matched[0] ? matched[0].flightId : null
      },
      comparedFlights: matched.map((f, idx) => ({
        rank: idx + 1,
        ...f,
        priceDifferenceFromCheapest: lowestPrice !== null ? f.price - lowestPrice : 0,
        frequentFlyerMilesEarned: Math.round(f.price / 1000)
      }))
    });
  }

  if (req.method === 'POST' && pathname === '/api/frequent-traveller/bookings') {
    const user = requireRoles(req, res, ['frequent_traveller']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const { booking, updatedMember, milesEarned } = store.createFrequentTravellerBooking(user, body);

    return sendJson(res, 201, {
      message: 'Pemesanan tiket frequent traveller berhasil',
      booking,
      bookingPage: {
        pageTitle: 'Halaman Konfirmasi Pemesanan Frequent Traveller',
        bookingReference: booking.bookingReference,
        eTicketNumber: booking.eTicketNumber,
        flightDetails: {
          flightNumber: booking.flightNumber,
          airline: booking.airline,
          route: `${booking.origin} -> ${booking.destination}`,
          date: booking.date,
          departureTime: booking.departureTime,
          arrivalTime: booking.arrivalTime,
          seatNumber: booking.seatNumber
        },
        memberSummary: {
          memberId: updatedMember.memberId,
          fullName: updatedMember.fullName,
          tier: updatedMember.tier,
          milesEarnedThisFlight: milesEarned,
          updatedTotalPoints: updatedMember.points
        },
        status: booking.status
      }
    });
  }

  return false;
}

module.exports = { handleFtRoutes };
