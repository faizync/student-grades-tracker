const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Directory where the PersistentVolume is mounted.
// Kubernetes: /data   |   Local dev: ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'students.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
// Seed data — written once, only when the volume is empty
// ─────────────────────────────────────────────────────────────
const SEED = [
  {
    id: '1',
    name: 'Ali Hassan',
    grades: [
      { id: 'g1', subject: 'Mathematics', score: 88, date: '2025-01-10' },
      { id: 'g2', subject: 'Physics', score: 76, date: '2025-01-12' },
      { id: 'g3', subject: 'English', score: 91, date: '2025-01-14' },
    ],
  },
  {
    id: '2',
    name: 'Sara Ahmed',
    grades: [
      { id: 'g4', subject: 'Mathematics', score: 95, date: '2025-01-10' },
      { id: 'g5', subject: 'Physics', score: 89, date: '2025-01-12' },
    ],
  },
  {
    id: '3',
    name: 'Umar Khan',
    grades: [
      { id: 'g6', subject: 'Mathematics', score: 72, date: '2025-01-10' },
      { id: 'g7', subject: 'English', score: 65, date: '2025-01-14' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Persistence layer
// ─────────────────────────────────────────────────────────────
let students = [];

function loadStudents() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    students = SEED;
    saveStudents();
    console.log(`[storage] Seeded fresh volume at ${DATA_FILE}`);
    return;
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  students = JSON.parse(raw);
  console.log(`[storage] Loaded ${students.length} students from ${DATA_FILE}`);
}

// Atomic write: write to a temp file, then rename.
// rename() is atomic on Linux, so a crash mid-write can never
// leave a half-written students.json behind.
function saveStudents() {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(students, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function calcAverage(grades) {
  if (!grades.length) return 0;
  const sum = grades.reduce((acc, g) => acc + g.score, 0);
  return parseFloat((sum / grades.length).toFixed(1));
}

function getLetterGrade(avg) {
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  if (avg >= 60) return 'D';
  return 'F';
}

function enrich(student) {
  const avg = calcAverage(student.grades);
  return {
    ...student,
    average: avg,
    letterGrade: getLetterGrade(avg),
    totalGrades: student.grades.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Health check — used by readinessProbe and livenessProbe.
// Verifies the mounted volume is actually readable and writable,
// not just that the process is alive.
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  try {
    fs.accessSync(DATA_FILE, fs.constants.R_OK | fs.constants.W_OK);
    res.status(200).json({
      status: 'ok',
      storage: 'writable',
      dataFile: DATA_FILE,
      students: students.length,
      hostname: process.env.HOSTNAME || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      storage: 'unwritable',
      error: err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────────────────────
app.get('/api/students', (req, res) => {
  res.json({ success: true, data: students.map(enrich) });
});

app.get('/api/students/:id', (req, res) => {
  const student = students.find((s) => s.id === req.params.id);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }
  res.json({ success: true, data: enrich(student) });
});

app.post('/api/students', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Student name is required' });
    }

    const duplicate = students.find(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicate) {
      return res
        .status(409)
        .json({ success: false, message: 'A student with this name already exists' });
    }

    const newStudent = { id: generateId(), name: name.trim(), grades: [] };
    students.push(newStudent);
    saveStudents();

    res.status(201).json({ success: true, data: enrich(newStudent) });
  } catch (err) {
    console.error('[error] POST /api/students:', err.message);
    res.status(500).json({ success: false, message: 'Failed to persist student' });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const index = students.findIndex((s) => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const [removed] = students.splice(index, 1);
    saveStudents();

    res.json({ success: true, data: removed });
  } catch (err) {
    console.error('[error] DELETE /api/students/:id:', err.message);
    res.status(500).json({ success: false, message: 'Failed to persist deletion' });
  }
});

app.post('/api/students/:id/grades', (req, res) => {
  try {
    const student = students.find((s) => s.id === req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const { subject, score } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const parsedScore = parseFloat(score);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      return res
        .status(400)
        .json({ success: false, message: 'Score must be a number between 0 and 100' });
    }

    student.grades.push({
      id: generateId(),
      subject: subject.trim(),
      score: parsedScore,
      date: new Date().toISOString().split('T')[0],
    });
    saveStudents();

    res.status(201).json({ success: true, data: enrich(student) });
  } catch (err) {
    console.error('[error] POST grade:', err.message);
    res.status(500).json({ success: false, message: 'Failed to persist grade' });
  }
});

app.delete('/api/students/:id/grades/:gradeId', (req, res) => {
  try {
    const student = students.find((s) => s.id === req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const gradeIndex = student.grades.findIndex((g) => g.id === req.params.gradeId);
    if (gradeIndex === -1) {
      return res.status(404).json({ success: false, message: 'Grade not found' });
    }

    student.grades.splice(gradeIndex, 1);
    saveStudents();

    res.json({ success: true, data: enrich(student) });
  } catch (err) {
    console.error('[error] DELETE grade:', err.message);
    res.status(500).json({ success: false, message: 'Failed to persist deletion' });
  }
});

app.get('/api/stats', (req, res) => {
  if (!students.length) {
    return res.json({ success: true, data: null });
  }

  const averages = students.map((s) => calcAverage(s.grades)).filter((a) => a > 0);
  const classAverage = averages.length
    ? parseFloat((averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(1))
    : 0;

  const allScores = students.flatMap((s) => s.grades.map((g) => g.score));

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  students.forEach((s) => {
    if (s.grades.length) {
      gradeDistribution[getLetterGrade(calcAverage(s.grades))]++;
    }
  });

  res.json({
    success: true,
    data: {
      totalStudents: students.length,
      classAverage,
      classLetterGrade: getLetterGrade(classAverage),
      highest: allScores.length ? Math.max(...allScores) : 0,
      lowest: allScores.length ? Math.min(...allScores) : 0,
      totalGradesRecorded: allScores.length,
      gradeDistribution,
    },
  });
});

// SPA fallback — any unmatched route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────────────────────
// Startup
// Load BEFORE listening. If the volume is missing or read-only,
// the process exits and the pod enters CrashLoopBackOff — which
// is visible. Serving an empty app silently would not be.
// ─────────────────────────────────────────────────────────────
try {
  loadStudents();
} catch (err) {
  console.error('[fatal] Could not initialise storage:', err.message);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`[server] Student Grades Tracker listening on port ${PORT}`);
  console.log(`[server] Data file: ${DATA_FILE}`);
});

// Graceful shutdown — Kubernetes sends SIGTERM before killing a pod.
// Finish in-flight requests instead of dropping them.
function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down gracefully`);
  server.close(() => {
    console.log('[server] Closed remaining connections');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
