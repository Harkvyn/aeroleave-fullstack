const fs = require('node:fs');
const path = require('node:path');
const { AIRPORTS } = require('./data/airports');
const { CURRENCIES, createInternationalFlights, createInitialState } = require('./data/seed');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data_store.json');

let state = createInitialState();

function upgradeLoadedState(loaded) {
  const fresh = createInitialState();
  const upgraded = { ...fresh, ...loaded };

  // Pastikan katalog bandara & kurs selalu terbaru
  upgraded.airports = AIRPORTS;
  upgraded.currencies = CURRENCIES;
  upgraded.meta = { ...fresh.meta, ...(loaded.meta || {}), version: '2.0.0' };

  // Tambahkan rute internasional baru jika data_store.json masih versi v1.0.0
  const existingFlightIds = new Set((upgraded.flights || []).map((f) => f.flightId));
  const seedFlightsById = new Map(fresh.flights.map((f) => [f.flightId, f]));

  upgraded.flights = (upgraded.flights || []).map((f) => {
    const seedMatch = seedFlightsById.get(f.flightId);
    return seedMatch ? { ...seedMatch, ...f } : f;
  });

  for (const intlFlight of createInternationalFlights()) {
    if (!existingFlightIds.has(intlFlight.flightId)) {
      upgraded.flights.push(intlFlight);
    }
  }

  return upgraded;
}

function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = upgradeLoadedState(parsed);
      saveState();
    } else {
      state = createInitialState();
      saveState();
    }
  } catch (err) {
    state = createInitialState();
  }
  return state;
}

function saveState() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {
    // Abaikan jika filesystem read-only
  }
}

function resetState() {
  state = createInitialState();
  saveState();
  return state;
}

function getState() {
  return state;
}

function setState(nextState) {
  state = upgradeLoadedState(nextState);
  saveState();
  return state;
}

module.exports = {
  DB_FILE,
  getState,
  setState,
  loadState,
  saveState,
  resetState
};
