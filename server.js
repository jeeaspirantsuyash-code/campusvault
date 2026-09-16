const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { db, logAction, DEPARTMENTS, DB_PATH, BACKUP_DIR } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  const root = path.resolve(PUBLIC_DIR);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function getDashboardStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  const avgCgpa = db.prepare('SELECT ROUND(AVG(cgpa), 2) AS a FROM students').get().a || 0;
  const avgAttendance = db.prepare('SELECT ROUND(AVG(attendance), 1) AS a FROM students').get().a || 0;
  const lowAttendanceCount = db.prepare('SELECT COUNT(*) AS c FROM students WHERE attendance < 65').get().c;
  const deptRows = db.prepare(`
    SELECT department, COUNT(*) AS count, ROUND(AVG(cgpa), 2) AS avgCgpa
    FROM students GROUP BY department ORDER BY count DESC
  `).all();
  const maxDeptCount = Math.max(1, ...deptRows.map((d) => d.count));
  const departments = deptRows.map((d) => ({ ...d, capacityPct: Math.round((d.count / maxDeptCount) * 100) }));
  const recent = db.prepare(`
    SELECT id, full_name, roll_no, department, program, year, section, status, created_at
    FROM students ORDER BY created_at DESC, id DESC LIMIT 6
  `).all();
  const lastBackup = db.prepare('SELECT created_at FROM backups ORDER BY id DESC LIMIT 1').get();
  return { totalStudents: total, departmentCount: DEPARTMENTS.length, avgCgpa, avgAttendance, lowAttendanceCount, departments, recent, lastBackupAt: lastBackup ? lastBackup.created_at : null };
}

function listStudents(query) {
  const clauses = [];
  const params = [];
  if (query.search) {
    clauses.push('(full_name LIKE ? OR roll_no LIKE ? OR email LIKE ? OR enrollment_id LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term, term, term);
  }
  if (query.department) { clauses.push('department = ?'); params.push(query.department); }
  if (query.year) { clauses.push('year = ?'); params.push(Number(query.year)); }
  if (query.section) { clauses.push('section = ?'); params.push(query.section); }
  if (query.status) { clauses.push('status = ?'); params.push(query.status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
  const offset = (page - 1) * perPage;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM students ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM students ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  return { rows, total, page, perPage };
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'GET' && pathname === '/api/dashboard') return sendJson(res, 200, getDashboardStats());
  if (req.method === 'GET' && pathname === '/api/departments') return sendJson(res, 200, DEPARTMENTS);
  if (req.method === 'GET' && pathname === '/api/students') return sendJson(res, 200, listStudents(query));

  if (req.method === 'POST' && pathname === '/api/students') {
    const body = await readBody(req);
    const required = ['full_name','email','roll_no','enrollment_id','department','program','year','section','cgpa','attendance'];
    for (const f of required) {
      if (body[f] === undefined || body[f] === '') return sendJson(res, 400, { error: `Missing field: ${f}` });
    }
    try {
      const status = Number(body.attendance) < 65 ? 'Low Attendance' : (body.status || 'Active');
      const info = db.prepare(`INSERT INTO students (full_name,email,roll_no,enrollment_id,department,program,year,section,cgpa,attendance,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(body.full_name, body.email, body.roll_no, body.enrollment_id, body.department, body.program, Number(body.year), body.section, Number(body.cgpa), Number(body.attendance), status);
      logAction('STUDENT_CREATED', { id: Number(info.lastInsertRowid), roll_no: body.roll_no });
      return sendJson(res, 201, db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid));
    } catch (e) {
      return sendJson(res, 400, { error: e.message.includes('UNIQUE') ? 'Roll number already exists' : e.message });
    }
  }

  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (req.method === 'PUT' && studentMatch) {
    const id = Number(studentMatch[1]);
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Student not found' });
    const body = await readBody(req);
    const merged = { ...existing, ...body };
    merged.status = Number(merged.attendance) < 65 ? 'Low Attendance' : (body.status || (existing.status === 'Low Attendance' ? 'Active' : existing.status));
    try {
      db.prepare(`UPDATE students SET full_name=?,email=?,roll_no=?,enrollment_id=?,department=?,program=?,year=?,section=?,cgpa=?,attendance=?,status=? WHERE id=?`).run(merged.full_name, merged.email, merged.roll_no, merged.enrollment_id, merged.department, merged.program, Number(merged.year), merged.section, Number(merged.cgpa), Number(merged.attendance), merged.status, id);
      logAction('STUDENT_UPDATED', { id });
      return sendJson(res, 200, db.prepare('SELECT * FROM students WHERE id = ?').get(id));
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (req.method === 'DELETE' && studentMatch) {
    const id = Number(studentMatch[1]);
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    if (!existing) return sendJson(res, 404, { error: 'Student not found' });
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    logAction('STUDENT_DELETED', { id, roll_no: existing.roll_no });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/audit') return sendJson(res, 200, db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all());
  if (req.method === 'GET' && pathname === '/api/backups') return sendJson(res, 200, db.prepare('SELECT * FROM backups ORDER BY id DESC').all());

  if (req.method === 'POST' && pathname === '/api/backups') {
    const body = await readBody(req);
    const pinRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_pin');
    if (!body.pin || body.pin !== pinRow.value) { logAction('BACKUP_PIN_FAILED', {}); return sendJson(res, 401, { error: 'Incorrect security PIN' }); }
    const students = db.prepare('SELECT * FROM students').all();
    const filename = `CV_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const payload = JSON.stringify({ createdAt: new Date().toISOString(), students }, null, 2);
    fs.writeFileSync(filePath, payload);
    const info = db.prepare('INSERT INTO backups (filename, student_count, size_bytes) VALUES (?, ?, ?)').run(filename, students.length, Buffer.byteLength(payload));
    logAction('BACKUP_CREATED', { filename, studentCount: students.length });
    return sendJson(res, 201, db.prepare('SELECT * FROM backups WHERE id = ?').get(info.lastInsertRowid));
  }

  const restoreMatch = pathname.match(/^\/api\/backups\/(\d+)\/restore$/);
  if (req.method === 'POST' && restoreMatch) {
    const id = Number(restoreMatch[1]);
    const body = await readBody(req);
    const pinRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_pin');
    if (!body.pin || body.pin !== pinRow.value) { logAction('RESTORE_PIN_FAILED', { backupId: id }); return sendJson(res, 401, { error: 'Incorrect security PIN' }); }
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
    if (!backup) return sendJson(res, 404, { error: 'Backup not found' });
    const filePath = path.join(BACKUP_DIR, backup.filename);
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Backup file missing on disk' });
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    db.prepare('DELETE FROM students').run();
    const insert = db.prepare(`INSERT INTO students (id,full_name,email,roll_no,enrollment_id,department,program,year,section,cgpa,attendance,status,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const s of payload.students) insert.run(s.id,s.full_name,s.email,s.roll_no,s.enrollment_id,s.department,s.program,s.year,s.section,s.cgpa,s.attendance,s.status,s.created_at);
    logAction('BACKUP_RESTORED', { backupId: id, filename: backup.filename, studentCount: payload.students.length });
    return sendJson(res, 200, { ok: true, restoredCount: payload.students.length });
  }

  if (req.method === 'POST' && pathname === '/api/security/verify-pin') {
    const body = await readBody(req);
    const pinRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_pin');
    const ok = body.pin === pinRow.value;
    logAction(ok ? 'PIN_VERIFICATION_PASSED' : 'PIN_VERIFICATION_FAILED', {});
    return sendJson(res, ok ? 200 : 401, { ok });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname, parsed.query);
    else serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`CampusVault running at http://localhost:${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
});
