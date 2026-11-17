const store = require('../store');
const { buildEmployeeLeaveSummary } = require('../helpers');
const { sendJson, parseJsonBody, requireRoles } = require('../http');

async function handleHrRoutes(req, res, pathname, query) {
  if (req.method === 'GET' && pathname === '/api/hr/leaves') {
    const user = requireRoles(req, res, ['hr_manager', 'employee']);
    if (!user) return true;

    const { day, month, year, date, startDate, endDate, employeeId, employeeName, status } = query;
    if (user.role === 'employee') {
      if (employeeId && employeeId !== user.employeeId) {
        return sendJson(res, 403, { error: 'Akses ditolak', message: 'Karyawan hanya dapat melihat data cuti sendiri.' });
      }
      if (employeeName && !user.fullName.toLowerCase().includes(String(employeeName).trim().toLowerCase())) {
        return sendJson(res, 403, { error: 'Akses ditolak', message: 'Karyawan hanya dapat melihat data cuti sendiri.' });
      }
    }

    const meta = store.getMeta();
    const employees = store.listEmployees();
    const allLeaves = store.listLeaveRequests();
    let results = [...allLeaves];

    if (user.role === 'employee') {
      results = results.filter((lv) => lv.employeeId === user.employeeId);
    }

    let exactDate = date || '';
    if (!exactDate && day && month && year) {
      const dd = String(day).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      exactDate = `${year}-${mm}-${dd}`;
    }

    if (exactDate) {
      results = results.filter((lv) => lv.startDate <= exactDate && lv.endDate >= exactDate);
    } else {
      if (year && !month && !day && !startDate && !endDate) {
        results = results.filter((lv) => lv.startDate.startsWith(year) || lv.endDate.startsWith(year));
      }
      if (month && year && !day && !startDate && !endDate) {
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        results = results.filter((lv) => lv.startDate.startsWith(prefix) || lv.endDate.startsWith(prefix));
      }
    }

    if (startDate || endDate) {
      const rangeStart = startDate || '0000-01-01';
      const rangeEnd = endDate || '9999-12-31';
      results = results.filter((lv) => lv.startDate <= rangeEnd && lv.endDate >= rangeStart);
    }
    if (employeeId) {
      results = results.filter((lv) => lv.employeeId === employeeId);
    }
    if (employeeName) {
      const needle = String(employeeName).trim().toLowerCase();
      results = results.filter((lv) => lv.employeeName.toLowerCase().includes(needle));
    }
    if (status) {
      results = results.filter((lv) => lv.status.toLowerCase() === String(status).toLowerCase());
    }

    const formatted = results.map((lv) => {
      const emp = employees.find((e) => e.employeeId === lv.employeeId);
      const summary = emp
        ? buildEmployeeLeaveSummary(emp, allLeaves, meta.currentYear, year || meta.currentYear)
        : null;
      return {
        leaveId: lv.leaveId,
        employeeId: lv.employeeId,
        employeeName: lv.employeeName,
        department: emp ? emp.department : '',
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
        reviewedByName: lv.reviewedByName,
        reviewedAt: lv.reviewedAt,
        decisionNote: lv.decisionNote,
        remainingLeaveDaysCurrentYear: summary ? summary.remainingLeaveDaysCurrentYear : null
      };
    });

    return sendJson(res, 200, {
      filtersApplied: { day, month, year, exactDate: exactDate || null, startDate, endDate, employeeId, employeeName, status },
      totalLeaveApplications: formatted.length,
      leaveApplications: formatted
    });
  }

  if (req.method === 'POST' && pathname === '/api/hr/leaves') {
    const user = requireRoles(req, res, ['hr_manager', 'employee']);
    if (!user) return true;
    const body = await parseJsonBody(req);
    const created = store.submitLeaveRequest(user, body);
    return sendJson(res, 201, {
      message: 'Pengajuan cuti berhasil disimpan dan menunggu persetujuan HRD.',
      ...created
    });
  }

  const leaveDecisionMatch = pathname.match(/^\/api\/hr\/leaves\/([^/]+)\/decision$/);
  if (req.method === 'POST' && leaveDecisionMatch) {
    const user = requireRoles(req, res, ['hr_manager']);
    if (!user) return true;
    const leaveId = decodeURIComponent(leaveDecisionMatch[1]);
    const body = await parseJsonBody(req);
    const result = store.decideLeaveRequest(user, leaveId, body.decision, body.note);
    return sendJson(res, 200, {
      message: `Pengajuan cuti ${leaveId} telah di-${result.leaveApplication.status}.`,
      ...result
    });
  }

  if (req.method === 'GET' && pathname === '/api/hr/employees') {
    const user = requireRoles(req, res, ['hr_manager']);
    if (!user) return true;
    const meta = store.getMeta();
    const allLeaves = store.listLeaveRequests();
    const employees = store.listEmployees().map((emp) =>
      buildEmployeeLeaveSummary(emp, allLeaves, meta.currentYear, query.year)
    );
    return sendJson(res, 200, { totalEmployees: employees.length, employees });
  }

  const hrEmpLeavesMatch = pathname.match(/^\/api\/hr\/employees\/([^/]+)\/leaves$/);
  if (req.method === 'GET' && hrEmpLeavesMatch) {
    const user = requireRoles(req, res, ['hr_manager', 'employee']);
    if (!user) return true;

    const identifier = decodeURIComponent(hrEmpLeavesMatch[1]).toLowerCase();
    const employees = store.listEmployees();
    const emp = employees.find(
      (e) =>
        e.employeeId.toLowerCase() === identifier ||
        e.employeeName.toLowerCase() === identifier ||
        e.employeeName.toLowerCase().includes(identifier)
    );
    if (!emp) {
      return sendJson(res, 404, { error: 'Pegawai tidak ditemukan', message: 'Pegawai tidak ditemukan' });
    }
    if (user.role === 'employee' && emp.employeeId !== user.employeeId) {
      return sendJson(res, 403, { error: 'Akses ditolak', message: 'Anda hanya dapat melihat riwayat cuti pribadi.' });
    }
    const meta = store.getMeta();
    return sendJson(
      res,
      200,
      buildEmployeeLeaveSummary(emp, store.listLeaveRequests(), meta.currentYear, query.year)
    );
  }

  return false;
}

module.exports = { handleHrRoutes };
