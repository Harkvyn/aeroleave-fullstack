/* ============================================================================
   AEROLEAVE GLOBAL — CENTRALIZED UI STATE (CLEANED)
   ============================================================================ */
let appState = null;

export const ui = {
  activeView: 'flights', // 'flights' | 'airports' | 'trips' | 'club' | 'corporate'
  currency: 'IDR',
  flights: {
    tripMode: 'single', // 'single' | 'multi'
    origin: 'CGK',
    destination: 'SIN',
    date: '',
    cabin: 'ALL',
    scope: 'ALL',
    stops: 'ALL',
    airlines: [],
    sortBy: 'cheapest',
    multiDestinations: ['SIN', 'HND', 'DPS', 'LHR']
  },
  airports: {
    region: 'ALL',
    query: '',
    selectedCode: 'CGK'
  },
  trips: {
    statusFilter: 'ALL',
    searchQuery: ''
  },
  club: {
    subtab: 'multicity', // 'multicity' | 'compare' | 'profile'
    legs: [
      { origin: 'CGK', destination: 'SUB', date: '2026-11-20' },
      { origin: 'SUB', destination: 'DPS', date: '2026-11-21' },
      { origin: 'DPS', destination: 'UPG', date: '2026-11-22' }
    ],
    multiResult: null,
    validationResult: null,
    bookingConfirmation: null,
    compareOrigin: 'CGK',
    compareDest: 'DPS',
    compareDate: '2026-11-20',
    compareTime: ''
  },
  corporate: {
    subtab: 'hr', // 'hr' | 'tm_status' | 'tm_visitor' | 'tm_auth' | 'audit'
    hr: {
      day: '',
      month: '',
      year: '2026',
      startDate: '',
      endDate: '',
      statusFilter: 'ALL',
      selectedEmployeeId: 'EMP-001',
      decisionNote: ''
    },
    tmStatusFilter: 'ALL',
    tmSearchDest: '',
    selectedVisitorId: 'VIS-002',
    visitorPreviewId: 'VIS-001',
    authCodeInput: '',
    authResult: null
  }
};

export function getAppState() {
  return appState;
}

export function setAppState(nextState) {
  appState = nextState;
}

export function getAirport(code) {
  if (!appState || !code) return null;
  return (appState.airports || []).find((a) => a.code === code) || null;
}

export function getAllowedViewsForUser(user) {
  if (!user) return ['flights', 'airports'];
  if (user.role === 'visitor') return ['flights', 'airports', 'trips'];
  if (user.role === 'frequent_traveller') return ['flights', 'airports', 'trips', 'club'];
  if (user.role === 'employee') return ['flights', 'airports', 'trips', 'corporate'];
  if (user.role === 'hr_manager' || user.role === 'travel_manager') {
    return ['flights', 'airports', 'trips', 'corporate'];
  }
  return ['flights', 'airports'];
}
