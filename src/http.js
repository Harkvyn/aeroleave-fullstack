const store = require('./store');
const { extractSessionToken } = require('./auth');

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  });
  res.end(body);
  return true;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Payload terlalu besar'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Format JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function getAuthenticatedUser(req) {
  const token = extractSessionToken(req);
  if (!token) return null;
  return store.getUserByToken(token);
}

function requireAuth(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, {
      error: 'Autentikasi diperlukan',
      message: 'Silakan masuk atau pilih aktor terlebih dahulu untuk mengakses fitur ini.'
    });
    return null;
  }
  return user;
}

function requireRoles(req, res, allowedRoles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) {
    sendJson(res, 403, {
      error: 'Akses ditolak',
      message: `Peran ${user.roleLabel} (${user.role}) tidak memiliki izin untuk operasi ini.`,
      requiredRoles: allowedRoles,
      currentRole: user.role
    });
    return null;
  }
  return user;
}

function handleRouteError(res, err) {
  if (res.headersSent || res.writableEnded) {
    return true;
  }
  if (err && err.httpStatus) {
    return sendJson(res, err.httpStatus, {
      error: err.message,
      message: err.message,
      ...(err.extra || {})
    });
  }
  const msg = err && err.message ? err.message : 'Terjadi kesalahan server';
  const status = msg.includes('JSON') || msg.includes('Payload') ? 400 : 500;
  return sendJson(res, status, { error: msg, message: msg });
}

module.exports = {
  sendJson,
  parseJsonBody,
  getAuthenticatedUser,
  requireAuth,
  requireRoles,
  handleRouteError
};
