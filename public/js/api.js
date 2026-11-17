/* ============================================================================
   AEROLEAVE GLOBAL — REST API CLIENT
   ============================================================================ */
window.AeroApi = (() => {
  async function request(url, options = {}) {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
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

  return {
    getState: () => request('/api/state'),
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
    authorizeBooking: (bookingReference) =>
      request('/api/travel-manager/authorize', {
        method: 'POST',
        body: { bookingReference, action: 'authorize' }
      })
  };
})();
