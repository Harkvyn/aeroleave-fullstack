const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const store = require('./store');
const {
  sendJson,
  getAuthenticatedUser,
  requireRoles,
  handleRouteError
} = require('./http');
const { handleAuthRoutes } = require('./routes/authRoutes');
const { handleCatalogRoutes } = require('./routes/catalogRoutes');
const { handleHrRoutes } = require('./routes/hrRoutes');
const { handleBookingRoutes } = require('./routes/bookingRoutes');
const { handleFtRoutes } = require('./routes/ftRoutes');
const { handleTravelManagerRoutes } = require('./routes/travelManagerRoutes');

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

  try {
    if (tryServeStatic(req, res, pathname, query)) {
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const user = getAuthenticatedUser(req);
      return sendJson(res, 200, store.getScopedState(user));
    }

    if (req.method === 'POST' && pathname === '/api/testing/reset') {
      const user = requireRoles(req, res, ['employee', 'hr_manager', 'frequent_traveller', 'travel_manager']);
      if (!user) return;
      store.resetState({ preserveSessions: true });
      return sendJson(res, 200, { status: 'reset', resetAt: new Date().toISOString() });
    }

    const handlers = [
      handleAuthRoutes,
      handleCatalogRoutes,
      handleHrRoutes,
      handleBookingRoutes,
      handleFtRoutes,
      handleTravelManagerRoutes
    ];

    for (const handler of handlers) {
      const handled = await handler(req, res, pathname, query);
      if (handled) return;
    }

    return sendJson(res, 404, {
      error: 'Endpoint tidak ditemukan',
      method: req.method,
      path: pathname
    });
  } catch (err) {
    return handleRouteError(res, err);
  }
}

module.exports = { handleRequest };
