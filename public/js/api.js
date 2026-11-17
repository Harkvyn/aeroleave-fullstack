/* ============================================================================
   AEROLEAVE GLOBAL — REST API CLIENT (ES MODULE)
   ============================================================================ */
async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Permintaan gagal');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const Api = {
  getState: () => request('/api/state'),
  getActors: () => request('/api/auth/actors'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  demoLogin: (userId) => request('/api/auth/demo-login', { method: 'POST', body: { userId } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  resetDemo: () => request('/api/testing/reset', { method: 'POST' }),
  getAirportDetail: (code) => request(`/api/airports/${encodeURIComponent(code)}`),
  getSeatMap: (flightId) => request(`/api/flights/${encodeURIComponent(flightId)}/seats`),
  createBooking: (payload) => request('/api/bookings', { method: 'POST', body: payload }),
  payBooking: (idOrRef, payload) =>
    request(`/api/bookings/${encodeURIComponent(idOrRef)}/pay`, { method: 'POST', body: payload }),
  cancelBooking: (idOrRef) =>
    request(`/api/bookings/${encodeURIComponent(idOrRef)}/cancel`, { method: 'POST' }),
  getBoardingPass: (idOrRef) =>
    request(`/api/bookings/${encodeURIComponent(idOrRef)}/boarding-pass`),
  createLeave: (payload) => request('/api/hr/leaves', { method: 'POST', body: payload }),
  decideLeave: (leaveId, decision, note) =>
    request(`/api/hr/leaves/${encodeURIComponent(leaveId)}/decision`, {
      method: 'POST',
      body: { decision, note }
    }),
  searchMultiCity: (legs) =>
    request('/api/frequent-traveller/multi-city', { method: 'POST', body: { legs } }),
  updateFtProfile: (memberId, payload) =>
    request(`/api/frequent-traveller/profile/${encodeURIComponent(memberId)}`, {
      method: 'PUT',
      body: payload
    }),
  validateFtTicket: (memberId) =>
    request('/api/frequent-traveller/validate-ticket', { method: 'POST', body: { memberId } }),
  bookFtFlight: (payload) =>
    request('/api/frequent-traveller/bookings', { method: 'POST', body: payload }),
  bookVisitorFlight: (payload) =>
    request('/api/travel-manager/bookings/visitor', { method: 'POST', body: payload }),
  authorizeBooking: (bookingReference, action = 'authorize', note = '') =>
    request('/api/travel-manager/authorize', {
      method: 'POST',
      body: { bookingReference, action, note }
    })
};
