const crypto = require('node:crypto');

const REQUIRED_PROFILE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'identityNumber',
  'birthDate',
  'nationality',
  'frequentFlyerNumber'
];

const FARE_TIERS = {
  Lite: {
    id: 'Lite',
    label: 'Economy Lite',
    multiplier: 0.92,
    extraBagKg: -5,
    refundable: false,
    rescheduleFee: 'Berbayar',
    loungeAccess: false,
    perks: ['7 kg Kabin', 'Kursi Acak Gratis', 'Non-refundable']
  },
  Standard: {
    id: 'Standard',
    label: 'Standard Value',
    multiplier: 1.0,
    extraBagKg: 0,
    refundable: false,
    rescheduleFee: 'Rp 250.000',
    loungeAccess: false,
    perks: ['Bagasi Terdaftar Penuh', 'Pilih Kursi Standar', 'In-flight Meal']
  },
  Flex: {
    id: 'Flex',
    label: 'Flex Plus',
    multiplier: 1.25,
    extraBagKg: 10,
    refundable: true,
    rescheduleFee: 'Gratis 1x Ubah Jadwal',
    loungeAccess: true,
    perks: ['+10 kg Bagasi Ekstra', 'Gratis Pilih Kursi Premium', 'Refundable & Reschedule Gratis', 'Priority Boarding']
  }
};

function calculateInclusiveDays(startDateStr, endDateStr) {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function matchesLocation(flightLocCode, flightCityName, queryValue, airportInfo) {
  if (!queryValue) return true;
  const q = String(queryValue).trim().toLowerCase();
  if (!q) return true;
  if (
    String(flightLocCode).toLowerCase() === q ||
    String(flightCityName).toLowerCase().includes(q)
  ) {
    return true;
  }
  if (airportInfo) {
    return (
      String(airportInfo.name || '').toLowerCase().includes(q) ||
      String(airportInfo.country || '').toLowerCase().includes(q)
    );
  }
  return false;
}

function matchesDepartureTimePreference(flightTime, pref) {
  if (!pref) return true;
  const normalized = String(pref).trim().toLowerCase();
  if (!normalized) return true;

  const [fh, fm] = flightTime.split(':').map(Number);
  const flightMinutes = fh * 60 + fm;

  if (normalized === 'pagi' || normalized === 'morning') {
    return flightMinutes >= 300 && flightMinutes <= 719;
  }
  if (normalized === 'siang' || normalized === 'afternoon') {
    return flightMinutes >= 720 && flightMinutes <= 959;
  }
  if (normalized === 'sore' || normalized === 'evening') {
    return flightMinutes >= 960 && flightMinutes <= 1139;
  }
  if (normalized === 'malam' || normalized === 'night') {
    return flightMinutes >= 1140 || flightMinutes < 300;
  }
  if (normalized.includes('-')) {
    const [startStr, endStr] = normalized.split('-').map((s) => s.trim());
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    if (!Number.isNaN(sh) && !Number.isNaN(eh)) {
      const startMin = sh * 60 + (sm || 0);
      const endMin = eh * 60 + (em || 0);
      return flightMinutes >= startMin && flightMinutes <= endMin;
    }
  }
  if (normalized.includes(':')) {
    const [ph, pm] = normalized.split(':').map(Number);
    if (!Number.isNaN(ph)) {
      const prefMin = ph * 60 + (pm || 0);
      return Math.abs(flightMinutes - prefMin) <= 60;
    }
  }
  return flightTime.startsWith(normalized);
}

function evaluateProfileCompleteness(member) {
  const missingFields = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const val = member[field];
    return val === undefined || val === null || String(val).trim() === '';
  });
  return {
    isProfileComplete: missingFields.length === 0,
    missingFields
  };
}

function generateBookingReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[crypto.randomInt(0, chars.length)];
  }
  return `HLM-${suffix}`;
}

function buildAirlinePriceSummary(flights) {
  const map = new Map();
  for (const f of flights) {
    if (!map.has(f.airline)) {
      map.set(f.airline, {
        airline: f.airline,
        airlineCode: f.airlineCode,
        flightCount: 0,
        lowestPrice: f.price,
        highestPrice: f.price,
        schedules: []
      });
    }
    const entry = map.get(f.airline);
    entry.flightCount += 1;
    entry.lowestPrice = Math.min(entry.lowestPrice, f.price);
    entry.highestPrice = Math.max(entry.highestPrice, f.price);
    entry.schedules.push({
      flightId: f.flightId,
      flightNumber: f.flightNumber,
      origin: f.origin,
      destination: f.destination,
      date: f.date,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      price: f.price
    });
  }
  return Array.from(map.values()).sort((a, b) => a.lowestPrice - b.lowestPrice);
}

function buildEmployeeLeaveSummary(employee, leaveRequests, currentYear, yearFilter) {
  const targetYear = String(yearFilter || currentYear);
  const allEmployeeLeaves = leaveRequests.filter(
    (lv) => lv.employeeId === employee.employeeId
  );

  const approvedLeavesInYear = allEmployeeLeaves.filter(
    (lv) =>
      lv.status === 'approved' &&
      (lv.startDate.startsWith(targetYear) || lv.endDate.startsWith(targetYear))
  );

  const pendingLeavesInYear = allEmployeeLeaves.filter(
    (lv) =>
      lv.status === 'pending' &&
      (lv.startDate.startsWith(targetYear) || lv.endDate.startsWith(targetYear))
  );

  const usedDays = approvedLeavesInYear.reduce((acc, lv) => acc + lv.durationDays, 0);
  const pendingDays = pendingLeavesInYear.reduce((acc, lv) => acc + lv.durationDays, 0);
  const remainingDays = Math.max(0, employee.annualLeaveQuota - usedDays);

  return {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    department: employee.department,
    position: employee.position,
    email: employee.email,
    year: Number(targetYear),
    annualLeaveQuotaDays: employee.annualLeaveQuota,
    usedLeaveDaysCurrentYear: usedDays,
    pendingLeaveDaysCurrentYear: pendingDays,
    remainingLeaveDaysCurrentYear: remainingDays,
    leaveHistory: allEmployeeLeaves.map((lv) => ({
      leaveId: lv.leaveId,
      employeeName: lv.employeeName,
      leaveType: lv.leaveType || 'annual',
      leavePeriod: {
        startDate: lv.startDate,
        endDate: lv.endDate,
        formatted: `${lv.startDate} s/d ${lv.endDate}`
      },
      durationDays: lv.durationDays,
      reason: lv.reason,
      status: lv.status,
      submittedAt: lv.submittedAt,
      reviewedByName: lv.reviewedByName || null,
      reviewedAt: lv.reviewedAt || null,
      decisionNote: lv.decisionNote || null
    }))
  };
}

function normalizeSeatCode(code) {
  if (!code) return '';
  return String(code).trim().toUpperCase().replace(/^0+/, '');
}

function datesOverlap(startA, endA, startB, endB) {
  return String(startA) <= String(endB) && String(endA) >= String(startB);
}

function createHttpError(status, message, extra = {}) {
  const err = new Error(message);
  err.httpStatus = status;
  err.extra = extra;
  return err;
}

function buildCabinSeatMap(flight, bookings) {
  const cabin = String(flight.cabinClass || 'Economy');
  let columns = ['A', 'B', 'C', '', 'D', 'E', 'F'];
  let startRow = 10;
  let endRow = 19;
  let extraLegroomRows = [10, 14];

  if (cabin === 'First') {
    columns = ['A', '', 'F'];
    startRow = 1;
    endRow = 2;
    extraLegroomRows = [1, 2];
  } else if (cabin === 'Business') {
    columns = ['A', '', 'C', 'D', '', 'F'];
    startRow = 1;
    endRow = 4;
    extraLegroomRows = [1];
  } else if (cabin === 'Premium Economy') {
    columns = ['A', 'B', '', 'D', 'E', '', 'G', 'H'];
    startRow = 6;
    endRow = 9;
    extraLegroomRows = [6];
  }

  const bookedSeats = new Set();
  for (const b of bookings) {
    if (b.flightId !== flight.flightId || b.status === 'cancelled') continue;
    if (Array.isArray(b.passengers) && b.passengers.length > 0) {
      for (const p of b.passengers) {
        const code = normalizeSeatCode(p.seatNumber);
        if (code) bookedSeats.add(code);
      }
    }
    if (b.seatNumber) {
      for (const part of String(b.seatNumber).split(',')) {
        const code = normalizeSeatCode(part);
        if (code) bookedSeats.add(code);
      }
    }
  }

  // Kursi terisi bawaan pesawat yang deterministik berdasar flightId
  const hashSeed = flight.flightId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rows = [];

  for (let row = startRow; row <= endRow; row += 1) {
    const seats = [];
    for (const col of columns) {
      if (col === '') {
        seats.push({ isAisle: true });
        continue;
      }
      const seatCode = `${row}${col}`;
      const isSeedOccupied =
        cabin === 'Economy' && ((row * 7 + col.charCodeAt(0) + hashSeed) % 5 === 0);
      const isOccupied = bookedSeats.has(seatCode) || isSeedOccupied;
      const isExtraLegroom = extraLegroomRows.includes(row);
      const seatFee =
        cabin === 'First' || cabin === 'Business' ? 0 : isExtraLegroom ? 185000 : 0;
      seats.push({
        isAisle: false,
        seatCode,
        row,
        col,
        isOccupied,
        isExtraLegroom,
        seatFee
      });
    }
    rows.push({ row, isExitRow: extraLegroomRows.includes(row), seats });
  }

  return {
    flightId: flight.flightId,
    flightNumber: flight.flightNumber,
    cabinClass: cabin,
    aircraft: flight.aircraft || 'Jet Airliner',
    columns,
    rows
  };
}

function computeBookingPricing(flight, fareTierId, seatFeeOrList = 0, passengerCount = 1) {
  const tier = FARE_TIERS[fareTierId] || FARE_TIERS.Standard;
  const baseUnit = Math.round(flight.price * tier.multiplier);
  const taxesAndPSC = flight.isInternational ? 350000 : 125000;
  const count = Math.max(1, Number(passengerCount) || 1);
  const seatFeeTotal = Array.isArray(seatFeeOrList)
    ? seatFeeOrList.reduce((acc, fee) => acc + (Number(fee) || 0), 0)
    : (Number(seatFeeOrList) || 0) * count;
  const totalAmount = (baseUnit + taxesAndPSC) * count + seatFeeTotal;
  return {
    fareTier: tier.id,
    unitFare: baseUnit,
    taxesAndPSC,
    seatFee: seatFeeTotal,
    passengerCount: count,
    totalAmount
  };
}

module.exports = {
  REQUIRED_PROFILE_FIELDS,
  FARE_TIERS,
  calculateInclusiveDays,
  matchesLocation,
  matchesDepartureTimePreference,
  evaluateProfileCompleteness,
  generateBookingReference,
  buildAirlinePriceSummary,
  buildEmployeeLeaveSummary,
  normalizeSeatCode,
  datesOverlap,
  createHttpError,
  buildCabinSeatMap,
  computeBookingPricing
};
