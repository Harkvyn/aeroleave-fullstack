const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'aeroleave_session';
const SESSION_TTL_HOURS = 24;
const DEMO_DEFAULT_PASSWORD = 'aeroleave123';

const ROLE_DEFINITIONS = {
  visitor: {
    role: 'visitor',
    title: 'Pengguna / Pelanggan (Visitor)',
    badge: 'Customer',
    summary: 'Pelanggan umum yang dapat mencari & memesan tiket pesawat langsung secara online, membayar/membatalkan tiket sendiri, serta melihat tiket yang dipesankan agen secara offline.',
    permissions: [
      'Cari & pesan tiket pesawat online (multi-penumpang + pilih kursi)',
      'Bayar reservasi tertunda, cetak boarding pass & batalkan tiket sendiri',
      'Lihat tiket & inbox e-tiket yang diterbitkan agen/Travel Manager',
      'Jelajahi panduan 14 bandara & jadwal FIDS'
    ]
  },
  frequent_traveller: {
    role: 'frequent_traveller',
    title: 'Frequent Traveller (Member Club)',
    badge: 'Club Member',
    summary: 'Pelanggan anggota loyalitas dengan fitur booking penuh plus rute Multi-City, komparasi tarif + kumpul miles, kelengkapan profil paspor/FFN, dan validasi tiket.',
    permissions: [
      'Semua kemampuan pemesanan tiket pelanggan',
      'Perencanaan & perbandingan rute Multi-City',
      'Komparasi tarif termurah + kalkulasi & pengembalian miles',
      'Kelola profil paspor/FFN & validasi kesiapan tiket'
    ]
  },
  employee: {
    role: 'employee',
    title: 'Karyawan / Agen Tiket (Employee)',
    badge: 'Staff / Agen',
    summary: 'Karyawan internal perusahaan travel: dapat mengajukan cuti ke HRD dan melayani pemesanan tiket pelanggan secara offline (loket / walk-in).',
    permissions: [
      'Lihat sisa kuota & ajukan cuti pribadi ke HRD',
      'Pesankan tiket pesawat untuk pelanggan secara offline & kirim e-tiket',
      'Pesan & kelola tiket milik sendiri',
      'Tidak dapat menyetujui cuti HR atau mengotorisasi PNR manajer'
    ]
  },
  hr_manager: {
    role: 'hr_manager',
    title: 'HRD Manajer',
    badge: 'HR Manager',
    summary: 'Manajer SDM internal perusahaan yang mengelola jadwal cuti seluruh karyawan, menyetujui/menolak pengajuan cuti dengan validasi kuota, dan memantau audit HR.',
    permissions: [
      'Lihat & filter jadwal cuti seluruh karyawan perusahaan',
      'Setujui / tolak pengajuan cuti dengan validasi kuota & bentrok tanggal',
      'Pantau sisa kuota cuti seluruh pegawai & log audit HR',
      'Pemesanan tiket pribadi'
    ]
  },
  travel_manager: {
    role: 'travel_manager',
    title: 'Manajer Travel',
    badge: 'Travel Manager',
    summary: 'Manajer operasional travel yang memantau semua status booking online/offline, menerbitkan tiket untuk pengunjung, dan mengotorisasi PNR (HLM-*).',
    permissions: [
      'Monitor semua status booking pelanggan (online & offline)',
      'Otorisasi / tolak kode booking reference (PNR HLM-*)',
      'Pesan tiket untuk Visitor & kirim e-tiket email',
      'Audit trail penuh transaksi & otorisasi travel'
    ]
  }
};

let cachedDemoCreds = null;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

function getDemoCredentials() {
  if (!cachedDemoCreds) {
    cachedDemoCreds = hashPassword(DEMO_DEFAULT_PASSWORD, 'aeroleave-demo-salt-2026');
  }
  return cachedDemoCreds;
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const computed = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(cookieHeader) {
  const map = {};
  if (!cookieHeader) return map;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      map[key] = decodeURIComponent(val);
    } catch (_) {
      map[key] = val;
    }
  }
  return map;
}

function extractSessionToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && String(authHeader).startsWith('Bearer ')) {
    const token = String(authHeader).slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function buildSessionCookie(token, maxAgeSeconds = SESSION_TTL_HOURS * 3600) {
  if (!token) {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function sanitizeUser(row) {
  if (!row) return null;
  const roleInfo = ROLE_DEFINITIONS[row.role] || {
    role: row.role,
    title: row.role_label || row.role,
    badge: row.role,
    summary: '',
    permissions: []
  };
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    roleLabel: row.role_label || roleInfo.title,
    roleBadge: roleInfo.badge,
    roleSummary: roleInfo.summary,
    permissions: roleInfo.permissions,
    department: row.department || '',
    employeeId: row.employee_id || null,
    memberId: row.member_id || null,
    visitorId: row.visitor_id || null
  };
}

function canAccessBooking(user, booking) {
  if (!user || !booking) return false;
  if (user.role === 'travel_manager') return true;
  if (booking.bookedByUserId && booking.bookedByUserId === user.userId) return true;
  if (booking.userId && booking.userId === user.userId) return true;
  if (user.memberId && booking.memberId && booking.memberId === user.memberId) return true;
  if (user.visitorId && booking.visitorId && booking.visitorId === user.visitorId) return true;
  if (
    user.email &&
    booking.passengerEmail &&
    String(booking.passengerEmail).toLowerCase() === String(user.email).toLowerCase()
  ) {
    return true;
  }
  return false;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_HOURS,
  DEMO_DEFAULT_PASSWORD,
  ROLE_DEFINITIONS,
  hashPassword,
  getDemoCredentials,
  verifyPassword,
  hashToken,
  generateSessionToken,
  extractSessionToken,
  buildSessionCookie,
  sanitizeUser,
  canAccessBooking
};
