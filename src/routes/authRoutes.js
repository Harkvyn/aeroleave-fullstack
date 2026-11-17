const store = require('../store');
const {
  ROLE_DEFINITIONS,
  DEMO_DEFAULT_PASSWORD,
  extractSessionToken,
  buildSessionCookie
} = require('../auth');
const { sendJson, parseJsonBody, getAuthenticatedUser } = require('../http');

async function handleAuthRoutes(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/auth/actors') {
    return sendJson(res, 200, {
      actors: store.listDemoActors(),
      roleDefinitions: ROLE_DEFINITIONS,
      demoPasswordHint: DEMO_DEFAULT_PASSWORD
    });
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(req);
    return sendJson(res, 200, {
      authenticated: Boolean(user),
      user
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseJsonBody(req);
    const { email, password } = body;
    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email dan password wajib diisi', message: 'Email dan password wajib diisi' });
    }
    const session = store.authenticateWithPassword(email, password);
    return sendJson(
      res,
      200,
      {
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: session.user
      },
      { 'Set-Cookie': buildSessionCookie(session.token) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/demo-login') {
    const body = await parseJsonBody(req);
    if (!body.userId) {
      return sendJson(res, 400, { error: 'userId wajib diisi', message: 'userId wajib diisi' });
    }
    const session = store.authenticateDemoUser(body.userId);
    return sendJson(
      res,
      200,
      {
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: session.user
      },
      { 'Set-Cookie': buildSessionCookie(session.token) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = extractSessionToken(req);
    store.revokeSession(token);
    return sendJson(
      res,
      200,
      { authenticated: false, message: 'Berhasil keluar dari sesi.' },
      { 'Set-Cookie': buildSessionCookie(null) }
    );
  }

  return false;
}

module.exports = { handleAuthRoutes };
