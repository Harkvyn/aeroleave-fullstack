const store = require('../store');
const {
  FARE_TIERS,
  matchesLocation,
  matchesDepartureTimePreference,
  buildAirlinePriceSummary,
  buildCabinSeatMap
} = require('../helpers');
const { sendJson, parseJsonBody } = require('../http');

async function handleCatalogRoutes(req, res, pathname, query) {
  if (req.method === 'GET' && (pathname === '' || pathname === '/' || pathname === '/api/health')) {
    const meta = store.getMeta();
    return sendJson(res, 200, {
      status: 'ok',
      service: meta.systemName,
      version: meta.version,
      storage: 'sqlite (node:sqlite)',
      airportsCount: store.listAirports().length,
      flightsCount: store.listFlights().length
    });
  }

  if (req.method === 'GET' && pathname === '/api/hallmark/preflight') {
    const meta = store.getMeta();
    return sendJson(res, 200, {
      skillRepo: meta.hallmarkReference,
      purpose: 'Visual & structural quality baseline using Hallmark + SQLite + Real-World RBAC',
      status: 'ready',
      supportedUserStories: ['US1', 'US2', 'US3', 'US4', 'US5', 'US6', 'US7', 'US8', 'US9'],
      proFeatures: [
        '14 International & Domestic Airport Guides',
        'Multi-Currency Price Conversion (IDR, USD, SGD, JPY, EUR, GBP, AUD)',
        'Interactive Multi-Passenger Cabin Seat Map',
        'SQLite Transactional Persistence & Audit Trail',
        '5-Actor Real-World RBAC & Approval Workflows'
      ],
      inventory: {
        airports: store.listAirports().length,
        employees: store.listEmployees().length,
        flights: store.listFlights().length,
        frequentTravellers: store.listFrequentTravellers().length,
        visitors: store.listVisitors().length
      }
    });
  }

  if (req.method === 'GET' && pathname === '/api/airports') {
    const { region, q } = query;
    const airports = store.listAirports();
    const flights = store.listFlights();
    let list = [...airports];

    if (region && region !== 'ALL') {
      list = list.filter((a) => a.region.toLowerCase() === String(region).toLowerCase());
    }
    if (q) {
      const term = String(q).trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.code.toLowerCase().includes(term) ||
          a.city.toLowerCase().includes(term) ||
          a.country.toLowerCase().includes(term) ||
          a.name.toLowerCase().includes(term)
      );
    }

    const enriched = list.map((a) => {
      const departuresCount = flights.filter((f) => f.origin === a.code && f.seatsAvailable > 0).length;
      const arrivals = flights.filter((f) => f.destination === a.code && f.seatsAvailable > 0);
      const lowestInboundPrice = arrivals.length > 0 ? Math.min(...arrivals.map((f) => f.price)) : null;
      return { ...a, departuresCount, arrivalsCount: arrivals.length, lowestInboundPrice };
    });

    return sendJson(res, 200, { totalAirports: enriched.length, airports: enriched });
  }

  const airportDetailMatch = pathname.match(/^\/api\/airports\/([^/]+)$/);
  if (req.method === 'GET' && airportDetailMatch) {
    const code = decodeURIComponent(airportDetailMatch[1]).toUpperCase();
    const airport = store.getAirport(code);
    if (!airport) {
      return sendJson(res, 404, { error: 'Bandara tidak ditemukan', message: 'Bandara tidak ditemukan' });
    }
    const flights = store.listFlights();
    return sendJson(res, 200, {
      airport,
      departures: flights.filter((f) => f.origin === code && f.seatsAvailable > 0),
      arrivals: flights.filter((f) => f.destination === code && f.seatsAvailable > 0)
    });
  }

  const seatMapMatch = pathname.match(/^\/api\/flights\/([^/]+)\/seats$/);
  if (req.method === 'GET' && seatMapMatch) {
    const flightId = decodeURIComponent(seatMapMatch[1]);
    const flight = store.getFlight(flightId);
    if (!flight) {
      return sendJson(res, 404, { error: 'Penerbangan tidak ditemukan', message: 'Penerbangan tidak ditemukan' });
    }
    const activeBookings = store.listFlightActiveBookings(flight.flightId);
    const seatMap = buildCabinSeatMap(flight, activeBookings);
    return sendJson(res, 200, {
      ...seatMap,
      fareTiers: Object.values(FARE_TIERS)
    });
  }

  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/flights/multi-destination') {
    const body = req.method === 'POST' ? await parseJsonBody(req) : {};
    const rawDest = body.destinations || query.destinations || '';
    const destinations = Array.isArray(rawDest)
      ? rawDest.map((d) => String(d).trim()).filter(Boolean)
      : String(rawDest)
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);

    if (destinations.length === 0) {
      return sendJson(res, 400, { error: 'Parameter destinations wajib diisi' });
    }

    const originFilter = body.origin || query.origin || '';
    const dateFilter = body.date || query.date || '';
    const flights = store.listFlights();

    const resultsByDestination = destinations.map((dest) => {
      const destAirport = store.getAirport(dest.toUpperCase());
      const matched = flights
        .filter((f) => {
          if (f.seatsAvailable <= 0) return false;
          if (!matchesLocation(f.destination, f.destinationCity, dest, destAirport)) return false;
          if (originFilter && !matchesLocation(f.origin, f.originCity, originFilter, store.getAirport(f.origin))) {
            return false;
          }
          if (dateFilter && f.date !== dateFilter) return false;
          return true;
        })
        .sort((a, b) => a.price - b.price);

      return {
        destination: dest,
        totalFlights: matched.length,
        airlinePriceSummary: buildAirlinePriceSummary(matched),
        flights: matched
      };
    });

    return sendJson(res, 200, {
      requestedDestinations: destinations,
      totalMatchingFlights: resultsByDestination.reduce((sum, r) => sum + r.totalFlights, 0),
      resultsByDestination
    });
  }

  if (req.method === 'GET' && pathname === '/api/flights') {
    const { destination, destinations, origin, date, airline, cabinClass, scope, maxPrice, departureTime } = query;
    const destList = destinations
      ? String(destinations)
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : destination
      ? [String(destination).trim()]
      : [];

    const flights = store.listFlights();
    const matched = flights
      .filter((f) => {
        if (f.seatsAvailable <= 0) return false;
        if (destList.length > 0) {
          const hit = destList.some((d) =>
            matchesLocation(f.destination, f.destinationCity, d, store.getAirport(f.destination))
          );
          if (!hit) return false;
        }
        if (origin && !matchesLocation(f.origin, f.originCity, origin, store.getAirport(f.origin))) {
          return false;
        }
        if (date && f.date !== date) return false;
        if (airline && !f.airline.toLowerCase().includes(String(airline).toLowerCase())) return false;
        if (cabinClass && cabinClass !== 'ALL' && f.cabinClass.toLowerCase() !== String(cabinClass).toLowerCase()) {
          return false;
        }
        if (scope === 'international' && !f.isInternational) return false;
        if (scope === 'domestic' && f.isInternational) return false;
        if (maxPrice && f.price > Number(maxPrice)) return false;
        if (departureTime && !matchesDepartureTimePreference(f.departureTime, departureTime)) return false;
        return true;
      })
      .sort((a, b) => a.price - b.price);

    return sendJson(res, 200, {
      totalAvailableFlights: matched.length,
      airlinePriceSummary: buildAirlinePriceSummary(matched),
      flights: matched
    });
  }

  return false;
}

module.exports = { handleCatalogRoutes };
