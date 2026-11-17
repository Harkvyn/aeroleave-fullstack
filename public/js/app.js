/* ============================================================================
   AEROLEAVE GLOBAL — SLIM APPLICATION CONTROLLER (ES MODULE)
   ============================================================================ */
import { Api } from './api.js';
import { showToast } from './utils.js';
import { ui, getAppState, setAppState, getAllowedViewsForUser } from './state.js';
import { initModalAccessibility, openConfirmModal } from './components/modal.js';
import { openAuthModal } from './components/authModal.js';
import { openAirportModal } from './components/airportModal.js';
import { openCheckoutWizard } from './components/checkoutWizard.js';
import { openBoardingPassModal } from './components/boardingPass.js';
import { renderFlightsView, bindFlightsEvents } from './views/flightsView.js';
import { renderAirportsView, bindAirportsEvents } from './views/airportsView.js';
import { renderTripsView, bindTripsEvents } from './views/tripsView.js';
import { renderClubView, bindClubEvents } from './views/clubView.js';
import { renderCorporateView, bindCorporateEvents } from './views/corporateView.js';

const NAV_CATALOG = [
  { id: 'flights', label: 'Penerbangan' },
  { id: 'airports', label: 'Bandara & Hub' },
  { id: 'trips', label: 'Perjalanan Saya' },
  { id: 'club', label: 'Frequent Flyer' },
  { id: 'corporate', label: 'Corporate & HR' }
];

function updateTopbarChrome(appState) {
  const user = appState.currentUser;
  const allowedViews = getAllowedViewsForUser(user);
  if (!allowedViews.includes(ui.activeView)) {
    ui.activeView = allowedViews[0];
  }

  const navEl = document.getElementById('primaryNav');
  if (navEl) {
    navEl.innerHTML = NAV_CATALOG.filter((item) => allowedViews.includes(item.id))
      .map((item) => {
        const label =
          item.id === 'corporate' && user?.role === 'employee'
            ? 'Loket &amp; Cuti'
            : item.id === 'trips' && user?.role === 'visitor'
            ? 'Tiket &amp; Inbox Saya'
            : item.label;
        return `<button type="button" class="nav-btn ${ui.activeView === item.id ? 'active' : ''}" data-view="${item.id}">${label}</button>`;
      })
      .join('');

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.activeView = btn.dataset.view;
        renderApp();
      });
    });
  }

  const actorBtn = document.getElementById('btnActorSwitcher');
  const actorLabel = document.getElementById('actorChipLabel');
  if (actorBtn && actorLabel) {
    if (user) {
      actorBtn.classList.add('signed-in');
      actorLabel.textContent = `${user.fullName} · ${user.roleBadge}`;
    } else {
      actorBtn.classList.remove('signed-in');
      actorLabel.textContent = 'Masuk / Pilih Aktor';
    }
  }

  const resetBtn = document.getElementById('btnResetDemo');
  if (resetBtn) {
    const canReset = Boolean(user && user.role !== 'visitor');
    resetBtn.classList.toggle('hidden', !canReset);
  }
}

async function refreshState() {
  const nextState = await Api.getState();
  setAppState(nextState);
  const statusEl = document.getElementById('footerSyncStatus');
  if (statusEl) {
    const actorTag = nextState.currentUser
      ? `${nextState.currentUser.fullName} (${nextState.currentUser.roleBadge})`
      : 'Guest';
    statusEl.textContent = `SQLite aktif · ${actorTag} · ${(nextState.airports || []).length} Bandara · ${(nextState.flights || []).length} Jadwal`;
  }
  renderApp();
}

function promptAuthSwitcher({ redirectByRole = true, onSuccess = null } = {}) {
  openAuthModal(getAppState(), async (user) => {
    if (redirectByRole && user) {
      if (user.role === 'frequent_traveller') ui.activeView = 'club';
      else if (user.role === 'hr_manager' || user.role === 'travel_manager' || user.role === 'employee') {
        ui.activeView = 'corporate';
      }
    }
    await refreshState();
    if (onSuccess && user) await onSuccess(user);
  });
}

function handleBookFlight(flightOrId) {
  const appState = getAppState();
  const flight =
    typeof flightOrId === 'string'
      ? appState.flights.find((x) => x.flightId === flightOrId)
      : flightOrId;
  if (!flight) return;

  openCheckoutWizard(
    flight,
    appState,
    ui.currency,
    async (booking) => {
      await refreshState();
      openBoardingPassModal(booking.bookingReference, ui.currency);
    },
    () =>
      promptAuthSwitcher({
        redirectByRole: false,
        onSuccess: () => handleBookFlight(flight.flightId)
      })
  );
}

function handleOpenAirport(code) {
  const appState = getAppState();
  openAirportModal(
    code,
    appState,
    ui.currency,
    (flight) => handleBookFlight(flight),
    (destCode) => {
      ui.activeView = 'flights';
      ui.flights.tripMode = 'single';
      ui.flights.origin = '';
      ui.flights.destination = destCode;
      ui.flights.date = '';
      renderApp();
    }
  );
}

function bindSharedDynamicEvents() {
  document.querySelectorAll('[data-open-airport]').forEach((el) => {
    el.addEventListener('click', () => handleOpenAirport(el.dataset.openAirport));
  });

  document.querySelectorAll('[data-view-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.activeView = btn.dataset.viewJump;
      renderApp();
    });
  });

  document.querySelectorAll('[data-open-auth]').forEach((btn) => {
    btn.addEventListener('click', () => promptAuthSwitcher({ redirectByRole: true }));
  });
}

function renderApp() {
  const appState = getAppState();
  if (!appState) return;

  updateTopbarChrome(appState);

  const root = document.getElementById('appRoot');
  if (!root) return;

  if (ui.activeView === 'flights') root.innerHTML = renderFlightsView();
  else if (ui.activeView === 'airports') root.innerHTML = renderAirportsView();
  else if (ui.activeView === 'trips') root.innerHTML = renderTripsView();
  else if (ui.activeView === 'club') root.innerHTML = renderClubView();
  else if (ui.activeView === 'corporate') root.innerHTML = renderCorporateView();

  bindSharedDynamicEvents();
  if (ui.activeView === 'flights') bindFlightsEvents({ renderApp, onBookFlight: handleBookFlight });
  else if (ui.activeView === 'airports') bindAirportsEvents({ renderApp, onOpenAirport: handleOpenAirport });
  else if (ui.activeView === 'trips') bindTripsEvents({ renderApp, refreshState });
  else if (ui.activeView === 'club') bindClubEvents({ renderApp, refreshState });
  else if (ui.activeView === 'corporate') bindCorporateEvents({ renderApp, refreshState });
}

function initGlobalEvents() {
  initModalAccessibility();

  const brandHome = document.getElementById('brandHomeLink');
  if (brandHome) {
    brandHome.addEventListener('click', (e) => {
      e.preventDefault();
      ui.activeView = 'flights';
      renderApp();
    });
  }

  const currencySel = document.getElementById('currencySelect');
  if (currencySel) {
    currencySel.addEventListener('change', () => {
      ui.currency = currencySel.value;
      renderApp();
    });
  }

  const actorBtn = document.getElementById('btnActorSwitcher');
  if (actorBtn) {
    actorBtn.addEventListener('click', () => promptAuthSwitcher({ redirectByRole: true }));
  }

  const resetBtn = document.getElementById('btnResetDemo');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Reset Data Demo SQLite?',
        message: 'Seluruh perubahan cuti, reservasi baru, otorisasi, dan log audit akan dikembalikan ke data awal demo.',
        confirmLabel: 'Ya, Reset Data Demo',
        confirmVariant: 'btn-danger',
        onConfirm: async () => {
          try {
            await Api.resetDemo();
            ui.club.multiResult = null;
            ui.club.validationResult = null;
            ui.club.bookingConfirmation = null;
            ui.corporate.authResult = null;
            showToast('Database SQLite berhasil di-reset ke kondisi awal.');
            await refreshState();
          } catch (err) {
            showToast(err.message);
          }
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initGlobalEvents();
  try {
    await refreshState();
  } catch (err) {
    showToast('Gagal memuat data dari server: ' + err.message);
  }
});
