/* ── API Helpers ──────────────────────────────────────────────────────────── */
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Request failed');
  return data.data;
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ── Score Helpers ────────────────────────────────────────────────────────── */
function letterFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
function scoreClass(score) { return 'score-' + letterFor(score); }

/* ── Stats ────────────────────────────────────────────────────────────────── */
async function refreshStats() {
  try {
    const s = await api('GET', '/stats');
    if (!s) return;
    document.getElementById('statTotal').textContent  = s.totalStudents;
    document.getElementById('statAvg').textContent    = s.classAverage ? `${s.classAverage}%` : '—';
    document.getElementById('statHigh').textContent   = s.highest ? `${s.highest}%` : '—';
    document.getElementById('statLow').textContent    = s.lowest  ? `${s.lowest}%`  : '—';
    document.getElementById('statGrades').textContent = s.totalGradesRecorded;
  } catch {/* silently ignore */}
}

/* ── Render ───────────────────────────────────────────────────────────────── */
function renderStudents(students) {
  const grid = document.getElementById('studentsGrid');
  const countEl = document.getElementById('studentCount');

  countEl.textContent = `${students.length} student${students.length !== 1 ? 's' : ''}`;

  if (!students.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No students yet. Add one above!</p>
      </div>`;
    return;
  }

  grid.innerHTML = students.map(s => {
    const initial = s.name.charAt(0).toUpperCase();
    const gradeClass = `grade-${s.letterGrade}`;
    const gradeItems = s.grades.length
      ? s.grades.map(g => `
          <li class="grade-item">
            <span class="grade-subject">${escHtml(g.subject)}</span>
            <span class="grade-score ${scoreClass(g.score)}">${g.score}%</span>
            <button class="delete-grade-btn" title="Remove grade"
              data-sid="${s.id}" data-gid="${g.id}">✕</button>
          </li>`).join('')
      : `<li class="no-grades">No grades recorded yet</li>`;

    return `
      <div class="student-card" id="sc-${s.id}">
        <div class="student-card-header">
          <div class="student-info">
            <div class="avatar">${initial}</div>
            <div>
              <div class="student-name">${escHtml(s.name)}</div>
              <div class="student-meta">${s.totalGrades} grade${s.totalGrades !== 1 ? 's' : ''} recorded</div>
            </div>
          </div>
          <div class="grade-badge ${gradeClass}">
            <span class="grade-letter">${s.totalGrades ? s.letterGrade : '—'}</span>
            <span class="grade-avg">${s.totalGrades ? s.average + '%' : 'no data'}</span>
          </div>
        </div>

        <div class="student-card-body">
          <ul class="grades-list">${gradeItems}</ul>
        </div>

        <div class="student-card-footer">
          <button class="btn btn-primary btn-sm add-grade-btn"
            data-sid="${s.id}" data-sname="${escHtml(s.name)}">+ Add Grade</button>
          <button class="btn btn-danger btn-sm delete-student-btn"
            data-sid="${s.id}" data-sname="${escHtml(s.name)}">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');

  // Attach events after render
  grid.querySelectorAll('.add-grade-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.sid, btn.dataset.sname));
  });
  grid.querySelectorAll('.delete-student-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteStudent(btn.dataset.sid, btn.dataset.sname));
  });
  grid.querySelectorAll('.delete-grade-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteGrade(btn.dataset.sid, btn.dataset.gid));
  });
}

/* ── Load All Students ────────────────────────────────────────────────────── */
async function loadStudents() {
  try {
    const students = await api('GET', '/students');
    renderStudents(students);
    refreshStats();
  } catch (err) {
    document.getElementById('studentsGrid').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

/* ── Add Student ──────────────────────────────────────────────────────────── */
document.getElementById('addStudentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('studentNameInput');
  const name = input.value.trim();
  if (!name) return;

  try {
    await api('POST', '/students', { name });
    input.value = '';
    showToast(`✅ ${name} added!`, 'success');
    loadStudents();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  }
});

/* ── Delete Student ───────────────────────────────────────────────────────── */
async function deleteStudent(id, name) {
  if (!confirm(`Remove "${name}" and all their grades? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/students/${id}`);
    showToast(`🗑 ${name} removed`, 'default');
    loadStudents();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  }
}

/* ── Modal: Add Grade ─────────────────────────────────────────────────────── */
function openModal(studentId, studentName) {
  document.getElementById('modalStudentId').value = studentId;
  document.getElementById('modalStudentName').textContent = `Student: ${studentName}`;
  document.getElementById('subjectInput').value = '';
  document.getElementById('scoreInput').value = '';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('subjectInput').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelModal').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('addGradeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id      = document.getElementById('modalStudentId').value;
  const subject = document.getElementById('subjectInput').value.trim();
  const score   = parseFloat(document.getElementById('scoreInput').value);

  try {
    await api('POST', `/students/${id}/grades`, { subject, score });
    closeModal();
    showToast(`✅ Grade saved!`, 'success');
    loadStudents();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  }
});

/* ── Delete Grade ─────────────────────────────────────────────────────────── */
async function deleteGrade(studentId, gradeId) {
  try {
    await api('DELETE', `/students/${studentId}/grades/${gradeId}`);
    showToast('Grade removed', 'default');
    loadStudents();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  }
}

/* ── XSS guard ────────────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
loadStudents();
