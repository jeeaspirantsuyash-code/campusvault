const content = document.getElementById('content');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

const state = {
  page: 'dashboard',
  students: { rows: [], total: 0, page: 1, perPage: 10 },
  filters: { search: '', department: '', year: '', section: '', status: '' },
  departments: [],
};

// ---------- helpers ----------
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => (toastEl.className = 'toast'), 2600);
}

async function api(pathAndQuery, options = {}) {
  const res = await fetch(pathAndQuery, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function statusPill(status) {
  const map = { Active: 'green', 'Low Attendance': 'red', 'On Leave': 'amber' };
  return `<span class="pill ${map[status] || 'gray'}">${status}</span>`;
}

// ---------- navigation ----------
document.querySelectorAll('.nav-link').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});
document.getElementById('refresh-btn').addEventListener('click', () => navigate(state.page, true));

function navigate(page, force = false) {
  if (state.page === page && !force) return;
  state.page = page;
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  render();
}

function render() {
  if (state.page === 'dashboard') return renderDashboard();
  if (state.page === 'students') return renderStudents();
  if (state.page === 'security') return renderSecurity();
}

// ================= DASHBOARD =================
async function renderDashboard() {
  content.innerHTML = `<div class="page-head"><h1>Dashboard</h1><p>Live overview of enrolled students and departmental distribution.</p></div>
    <div id="dash-body">Loading…</div>`;

  let stats;
  try {
    stats = await api('/api/dashboard');
  } catch (e) {
    document.getElementById('dash-body').innerHTML = `<div class="empty-state">${e.message}</div>`;
    return;
  }

  const lastBackup = stats.lastBackupAt
    ? new Date(stats.lastBackupAt + 'Z').toLocaleString()
    : 'No backups yet';

  document.getElementById('dash-body').innerHTML = `
    <div class="stat-grid">
      <div class="card stat-card">
        <div class="stat-label">TOTAL ENROLLED STUDENTS</div>
        <div class="stat-value">${stats.totalStudents.toLocaleString()}</div>
        <div class="stat-note">Live count from database</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">DEPARTMENTS</div>
        <div class="stat-value">${stats.departmentCount}</div>
        <div class="stat-note">Academic divisions</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">AVERAGE ATTENDANCE</div>
        <div class="stat-value">${stats.avgAttendance}%</div>
        <div class="stat-note ${stats.avgAttendance >= 75 ? 'up' : 'warn'}">${stats.avgAttendance >= 75 ? 'Healthy benchmark (>75%)' : 'Below healthy benchmark'}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">AVERAGE CGPA</div>
        <div class="stat-value">${stats.avgCgpa} <span style="font-size:14px;color:var(--ink-400);font-weight:500;">/ 10.0</span></div>
        <div class="stat-note">${stats.lowAttendanceCount} students flagged low attendance</div>
      </div>
    </div>

    <div class="two-col">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>Departmental Distribution</h2><p>Live enrollment share across academic departments</p></div>
        </div>
        ${stats.departments.map((d) => `
          <div class="dept-row">
            <div class="dept-top">
              <span class="dept-name">${d.department}</span>
              <span class="dept-count">${d.count} students · avg CGPA ${d.avgCgpa}</span>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${d.capacityPct}%"></div></div>
          </div>
        `).join('')}
      </div>

      <div class="card panel">
        <div class="panel-head"><div><h2>Vault Health</h2></div></div>
        <div class="dept-row">
          <div class="dept-top"><span class="dept-name">Last backup</span></div>
          <div class="stat-note" style="margin-top:2px;">${lastBackup}</div>
        </div>
        <div class="dept-row">
          <div class="dept-top"><span class="dept-name">Low attendance alerts</span><span class="dept-count">${stats.lowAttendanceCount} students</span></div>
        </div>
        <div class="dept-row">
          <div class="dept-top"><span class="dept-name">Storage</span></div>
          <div class="stat-note" style="margin-top:2px;">SQLite database file on server disk</div>
        </div>
        <button class="btn primary" style="width:100%;margin-top:6px;" onclick="navigate('security')">Go to Security &amp; Backup</button>
      </div>
    </div>

    <div class="card panel">
      <div class="panel-head">
        <div><h2>Recently Added Students</h2><p>Newest records in the directory</p></div>
        <button class="btn small" onclick="navigate('students')">View all</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Roll No</th><th>Department</th><th>Year / Section</th><th>Status</th></tr></thead>
          <tbody>
            ${stats.recent.map((s) => `
              <tr>
                <td class="name-cell"><span class="avatar-chip">${initials(s.full_name)}</span>${s.full_name}</td>
                <td>${s.roll_no}</td>
                <td>${s.department}</td>
                <td>Y${s.year} · Sec ${s.section}</td>
                <td>${statusPill(s.status)}</td>
              </tr>
            `).join('') || `<tr><td colspan="5" class="empty-state">No students yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ================= STUDENTS DIRECTORY =================
async function loadStudents() {
  const q = new URLSearchParams();
  if (state.filters.search) q.set('search', state.filters.search);
  if (state.filters.department) q.set('department', state.filters.department);
  if (state.filters.year) q.set('year', state.filters.year);
  if (state.filters.section) q.set('section', state.filters.section);
  if (state.filters.status) q.set('status', state.filters.status);
  q.set('page', state.students.page);
  q.set('perPage', state.students.perPage);

  const data = await api('/api/students?' + q.toString());
  state.students = { ...state.students, ...data };
}

async function renderStudents() {
  if (!state.departments.length) {
    state.departments = await api('/api/departments');
  }
  content.innerHTML = `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1>Students Directory</h1>
        <p>Search, filter, and manage enrolled student records.</p>
      </div>
      <button class="btn primary" id="add-student-btn">+ Add Student</button>
    </div>

    <div class="card" style="padding:16px 18px;">
      <div class="filter-bar">
        <input type="text" id="f-search" placeholder="Search by name, roll no, email, or enrollment ID..." value="${state.filters.search}" />
        <select id="f-dept"><option value="">All Departments</option>
          ${state.departments.map((d) => `<option value="${d.name}" ${state.filters.department === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
        </select>
        <select id="f-year"><option value="">All Years</option>
          ${[1,2,3,4].map((y) => `<option value="${y}" ${String(state.filters.year) === String(y) ? 'selected' : ''}>Year ${y}</option>`).join('')}
        </select>
        <select id="f-section"><option value="">All Sections</option>
          ${['A','B','C'].map((s) => `<option value="${s}" ${state.filters.section === s ? 'selected' : ''}>Section ${s}</option>`).join('')}
        </select>
        <select id="f-status"><option value="">All Statuses</option>
          ${['Active','Low Attendance','On Leave'].map((s) => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div id="students-table-wrap">Loading…</div>
    </div>
  `;

  document.getElementById('add-student-btn').addEventListener('click', () => openStudentModal());

  const bindFilter = (id, key) => {
    document.getElementById(id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      state.students.page = 1;
      refreshStudentsTable();
    });
  };
  document.getElementById('f-search').addEventListener('input', debounce((e) => {
    state.filters.search = e.target.value;
    state.students.page = 1;
    refreshStudentsTable();
  }, 350));
  bindFilter('f-dept', 'department');
  bindFilter('f-year', 'year');
  bindFilter('f-section', 'section');
  bindFilter('f-status', 'status');

  await refreshStudentsTable();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function refreshStudentsTable() {
  const wrap = document.getElementById('students-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = 'Loading…';
  try {
    await loadStudents();
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state">${e.message}</div>`;
    return;
  }
  const { rows, total, page, perPage } = state.students;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Student</th><th>Roll No</th><th>Department</th><th>Program</th>
          <th>Year/Sec</th><th>CGPA</th><th>Attendance</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((s) => `
            <tr>
              <td class="name-cell"><span class="avatar-chip">${initials(s.full_name)}</span>
                <span class="meta"><span class="fname">${s.full_name}</span><span class="fmail">${s.email}</span></span>
              </td>
              <td>${s.roll_no}</td>
              <td>${s.department}</td>
              <td>${s.program}</td>
              <td>Y${s.year} · ${s.section}</td>
              <td>${s.cgpa.toFixed(2)}</td>
              <td>${s.attendance}%</td>
              <td>${statusPill(s.status)}</td>
              <td>
                <button class="btn small" data-edit="${s.id}">Edit</button>
                <button class="btn small danger" data-del="${s.id}">Delete</button>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="9"><div class="empty-state"><div class="es-title">No students found</div>Try adjusting your filters or add a new student.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span>Showing ${rows.length ? (page - 1) * perPage + 1 : 0}–${(page - 1) * perPage + rows.length} of ${total} students</span>
      <div class="controls">
        <button id="pg-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span style="padding:0 8px;line-height:28px;">Page ${page} / ${totalPages}</span>
        <button id="pg-next" ${page >= totalPages ? 'disabled' : ''}>›</button>
      </div>
    </div>
  `;

  wrap.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const student = rows.find((r) => r.id === Number(btn.dataset.edit));
      openStudentModal(student);
    })
  );
  wrap.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', () => deleteStudent(Number(btn.dataset.del)))
  );
  const prev = document.getElementById('pg-prev');
  const next = document.getElementById('pg-next');
  if (prev) prev.addEventListener('click', () => { state.students.page--; refreshStudentsTable(); });
  if (next) next.addEventListener('click', () => { state.students.page++; refreshStudentsTable(); });
}

async function deleteStudent(id) {
  if (!confirm('Remove this student record? This cannot be undone.')) return;
  try {
    await api(`/api/students/${id}`, { method: 'DELETE' });
    toast('Student removed');
    refreshStudentsTable();
  } catch (e) {
    toast(e.message, true);
  }
}

function openStudentModal(student = null) {
  const isEdit = !!student;
  const depts = state.departments;
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="overlay">
      <div class="modal">
        <h3>${isEdit ? 'Edit Student' : 'Add New Student'}</h3>
        <p class="modal-sub">${isEdit ? 'Update this student\u2019s record.' : 'Create a new student record in the directory.'}</p>
        <div class="form-grid">
          <div class="field full"><label>Full Name</label><input id="m-name" value="${student?.full_name || ''}" /></div>
          <div class="field full"><label>Email</label><input id="m-email" value="${student?.email || ''}" /></div>
          <div class="field"><label>Roll No</label><input id="m-roll" value="${student?.roll_no || ''}" /></div>
          <div class="field"><label>Enrollment ID</label><input id="m-enroll" value="${student?.enrollment_id || ''}" /></div>
          <div class="field full"><label>Department</label>
            <select id="m-dept">${depts.map((d) => `<option ${student?.department === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}</select>
          </div>
          <div class="field full"><label>Program</label><input id="m-program" value="${student?.program || (depts[0]?.programs[0] || '')}" /></div>
          <div class="field"><label>Year</label>
            <select id="m-year">${[1,2,3,4].map((y) => `<option value="${y}" ${student?.year === y ? 'selected' : ''}>Year ${y}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Section</label>
            <select id="m-section">${['A','B','C'].map((s) => `<option ${student?.section === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="field"><label>CGPA</label><input id="m-cgpa" type="number" step="0.01" min="0" max="10" value="${student?.cgpa ?? ''}" /></div>
          <div class="field"><label>Attendance %</label><input id="m-att" type="number" step="0.1" min="0" max="100" value="${student?.attendance ?? ''}" /></div>
        </div>
        <div id="m-error" class="modal-error"></div>
        <div class="modal-actions">
          <button class="btn" id="m-cancel">Cancel</button>
          <button class="btn primary" id="m-save">${isEdit ? 'Save Changes' : 'Create Student'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('m-cancel').addEventListener('click', closeModal);
  document.getElementById('m-save').addEventListener('click', async () => {
    const payload = {
      full_name: document.getElementById('m-name').value.trim(),
      email: document.getElementById('m-email').value.trim(),
      roll_no: document.getElementById('m-roll').value.trim(),
      enrollment_id: document.getElementById('m-enroll').value.trim(),
      department: document.getElementById('m-dept').value,
      program: document.getElementById('m-program').value.trim(),
      year: Number(document.getElementById('m-year').value),
      section: document.getElementById('m-section').value,
      cgpa: Number(document.getElementById('m-cgpa').value),
      attendance: Number(document.getElementById('m-att').value),
    };
    const errBox = document.getElementById('m-error');
    try {
      if (isEdit) {
        await api(`/api/students/${student.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Student updated');
      } else {
        await api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
        toast('Student added');
      }
      closeModal();
      refreshStudentsTable();
    } catch (e) {
      errBox.textContent = e.message;
    }
  });
}

function closeModal() { modalRoot.innerHTML = ''; }

// ================= SECURITY & BACKUP =================
async function renderSecurity() {
  content.innerHTML = `<div class="page-head"><h1>Security &amp; Backup</h1><p>Create and restore database backups, and review the audit trail.</p></div>
    <div id="sec-body">Loading…</div>`;

  let backups, audit;
  try {
    [backups, audit] = await Promise.all([api('/api/backups'), api('/api/audit')]);
  } catch (e) {
    document.getElementById('sec-body').innerHTML = `<div class="empty-state">${e.message}</div>`;
    return;
  }

  document.getElementById('sec-body').innerHTML = `
    <div class="security-grid">
      <div class="card security-card">
        <div class="sc-label">DATABASE</div>
        <div class="sc-title">SQLite (Node built-in)</div>
        <div class="sc-sub">Live student records persist to a real .db file on the server.</div>
      </div>
      <div class="card security-card">
        <div class="sc-label">PRIVILEGE BOUNDARY</div>
        <div class="sc-title">Security PIN required</div>
        <div class="sc-sub">Backups and restores require the 4-digit registrar PIN (default: 1234).</div>
      </div>
    </div>

    <div class="two-col">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>Backup Snapshots</h2><p>${backups.length} snapshot${backups.length === 1 ? '' : 's'} stored</p></div>
          <button class="btn primary small" id="create-backup-btn">Create Backup</button>
        </div>
        <div id="backup-list">
          ${backups.length ? backups.map((b) => `
            <div class="backup-row">
              <div>
                <div class="b-name">${b.filename}</div>
                <div class="b-meta">${b.student_count} students · ${(b.size_bytes / 1024).toFixed(1)} KB · ${new Date(b.created_at + 'Z').toLocaleString()}</div>
              </div>
              <button class="btn small" data-restore="${b.id}">Restore</button>
            </div>
          `).join('') : `<div class="empty-state"><div class="es-title">No backups yet</div>Create your first snapshot of the student database.</div>`}
        </div>
      </div>

      <div class="card panel">
        <div class="panel-head"><div><h2>Audit Trail</h2><p>Most recent 50 actions</p></div></div>
        <div id="audit-list" style="max-height:420px;overflow-y:auto;">
          ${audit.length ? audit.map((a) => `
            <div class="audit-row">
              <div class="audit-dot"></div>
              <div>
                <div class="a-action">${a.action.replaceAll('_', ' ')}</div>
                <div class="a-time">${new Date(a.created_at + 'Z').toLocaleString()}</div>
                ${a.details ? `<div class="a-details">${a.details}</div>` : ''}
              </div>
            </div>
          `).join('') : `<div class="empty-state">No actions logged yet</div>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById('create-backup-btn').addEventListener('click', () => promptPin(async (pin) => {
    const b = await api('/api/backups', { method: 'POST', body: JSON.stringify({ pin }) });
    toast(`Backup created: ${b.filename}`);
    renderSecurity();
  }));

  document.querySelectorAll('[data-restore]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!confirm('Restoring will replace all current student records with this snapshot. Continue?')) return;
      promptPin(async (pin) => {
        const r = await api(`/api/backups/${btn.dataset.restore}/restore`, { method: 'POST', body: JSON.stringify({ pin }) });
        toast(`Restored ${r.restoredCount} student records`);
        renderSecurity();
      });
    })
  );
}

function promptPin(onVerified) {
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="overlay">
      <div class="modal" style="width:360px;">
        <h3>Security PIN Required</h3>
        <p class="modal-sub">Enter the 4-digit registrar PIN to continue.</p>
        <div class="pin-prompt">
          <input id="pin-input" type="password" maxlength="4" placeholder="••••" autofocus />
          <button class="btn primary" id="pin-submit">Verify</button>
        </div>
        <div id="pin-error" class="modal-error"></div>
        <div class="modal-actions"><button class="btn" id="pin-cancel">Cancel</button></div>
      </div>
    </div>
  `;
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('pin-cancel').addEventListener('click', closeModal);
  const submit = async () => {
    const pin = document.getElementById('pin-input').value;
    try {
      await onVerified(pin);
      closeModal();
    } catch (e) {
      document.getElementById('pin-error').textContent = e.message;
    }
  };
  document.getElementById('pin-submit').addEventListener('click', submit);
  document.getElementById('pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ---------- boot ----------
window.navigate = navigate;
navigate('dashboard');
