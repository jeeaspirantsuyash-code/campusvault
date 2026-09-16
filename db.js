const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'campusvault.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const isNewDb = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    roll_no TEXT NOT NULL UNIQUE,
    enrollment_id TEXT NOT NULL,
    department TEXT NOT NULL,
    program TEXT NOT NULL,
    year INTEGER NOT NULL,
    section TEXT NOT NULL,
    cgpa REAL NOT NULL,
    attendance REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    student_count INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// default backup PIN
const pinRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_pin');
if (!pinRow) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('backup_pin', '1234');
}

function logAction(action, details) {
  db.prepare('INSERT INTO audit_log (action, details) VALUES (?, ?)').run(
    action,
    details ? JSON.stringify(details) : null
  );
}

const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', programs: ['B.Tech - AI & ML', 'B.Tech - Full Stack', 'B.Tech - Cyber Security'] },
  { name: 'Electronics & Communication', programs: ['B.Tech - VLSI Design', 'B.Tech - Embedded Systems'] },
  { name: 'Business Administration', programs: ['MBA - Financial Systems', 'MBA - Marketing'] },
  { name: 'Mechanical Engineering', programs: ['B.Tech - Mechatronics', 'B.Tech - Thermal'] },
  { name: 'Civil Engineering', programs: ['B.Tech - Structural', 'B.Tech - Environmental'] },
  { name: 'Data Science & AI', programs: ['B.Tech - NLP & Semantic Web', 'B.Tech - Applied Statistics'] },
  { name: 'Biotechnology', programs: ['B.Tech - Gene Tech', 'B.Tech - Bioinformatics'] },
];

const FIRST_NAMES = ['Aarav', 'Priya', 'Rohan', 'Sofia', 'Julian', 'Tariq', 'Lin', 'Maya', 'Elena', 'Marcus', 'Ryan', 'Ananya', 'Kabir', 'Zara', 'Ishaan', 'Neha', 'Wei', 'Diego', 'Fatima', 'Arjun', 'Meera', 'Suyash', 'Kavya', 'Dev', 'Riya'];
const LAST_NAMES = ['Sharma', 'Chandran', 'Mendoza', 'Sterling', 'Al-Mansoor', 'Chen', 'Lin-Hernandez', 'Thorne', 'Adebayo', 'Wei-Chen', 'Iyer', 'Verma', 'Okonjo', 'Ramesh', 'Nair', 'Gupta', 'Reddy', 'Singh', 'Patel', 'Bose'];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO students
      (full_name, email, roll_no, enrollment_id, department, program, year, section, cgpa, attendance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let rollCounter = 100;
  const insertMany = db.createSession ? null : null; // not needed, loop is fine for ~180 rows

  for (let i = 0; i < 180; i++) {
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const program = dept.programs[i % dept.programs.length];
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const fullName = `${first} ${last}`;
    const year = 1 + (i % 4);
    const section = ['A', 'B', 'C'][i % 3];
    const cgpa = Math.round((6 + Math.random() * 4) * 100) / 100;
    const attendance = Math.round((55 + Math.random() * 45) * 10) / 10;
    const status = attendance < 65 ? 'Low Attendance' : (Math.random() < 0.05 ? 'On Leave' : 'Active');
    rollCounter += 1;
    const rollNo = `STJ-22-${rollCounter}`;
    const enrollmentId = `EN-2024-${dept.name.slice(0, 3).toUpperCase()}-${1000 + i}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i}@stjude.edu`;

    insert.run(fullName, email, rollNo, enrollmentId, dept.name, program, year, section, cgpa, attendance, status);
  }

  logAction('SEED_COMPLETE', { studentsCreated: 180 });
}

seed();

if (isNewDb) {
  logAction('DATABASE_INITIALIZED', { path: DB_PATH });
}

module.exports = { db, logAction, DEPARTMENTS, DB_PATH, BACKUP_DIR, DATA_DIR };
