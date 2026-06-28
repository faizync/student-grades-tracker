const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-Memory Data Store ───────────────────────────────────────────────────
let students = [
  {
    id: '1',
    name: 'Ali Hassan',
    grades: [
      { id: 'g1', subject: 'Mathematics', score: 88, date: '2025-01-10' },
      { id: 'g2', subject: 'Physics',     score: 76, date: '2025-01-12' },
      { id: 'g3', subject: 'English',     score: 91, date: '2025-01-14' },
    ],
  },
  {
    id: '2',
    name: 'Sara Ahmed',
    grades: [
      { id: 'g4', subject: 'Mathematics', score: 95, date: '2025-01-10' },
      { id: 'g5', subject: 'Physics',     score: 89, date: '2025-01-12' },
    ],
  },
  {
    id: '3',
    name: 'Umar Khan',
    grades: [
      { id: 'g6', subject: 'Mathematics', score: 72, date: '2025-01-10' },
      { id: 'g7', subject: 'English',     score: 65, date: '2025-01-14' },
    ],
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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

function enrichStudent(student) {
  const avg = calcAverage(student.grades);
  return {
    ...student,
    average: avg,
    letterGrade: getLetterGrade(avg),
    totalGrades: student.grades.length,
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Health check (EB pings this)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET  /api/students  — list all students with averages
app.get('/api/students', (req, res) => {
  const enriched = students.map(enrichStudent);
  res.json({ success: true, data: enriched });
});

// GET  /api/students/:id  — single student
app.get('/api/students/:id', (req, res) => {
  const student = students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  res.json({ success: true, data: enrichStudent(student) });
});

// POST /api/students  — create a new student
app.post('/api/students', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Student name is required' });
  }

  const duplicate = students.find(
    s => s.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (duplicate) {
    return res.status(409).json({ success: false, message: 'A student with this name already exists' });
  }

  const newStudent = { id: generateId(), name: name.trim(), grades: [] };
  students.push(newStudent);
  res.status(201).json({ success: true, data: enrichStudent(newStudent) });
});

// DELETE /api/students/:id  — remove a student
app.delete('/api/students/:id', (req, res) => {
  const index = students.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Student not found' });
  const [removed] = students.splice(index, 1);
  res.json({ success: true, data: removed });
});

// POST /api/students/:id/grades  — add a grade to a student
app.post('/api/students/:id/grades', (req, res) => {
  const student = students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const { subject, score } = req.body;
  if (!subject || !subject.trim()) {
    return res.status(400).json({ success: false, message: 'Subject is required' });
  }
  const parsedScore = parseFloat(score);
  if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
    return res.status(400).json({ success: false, message: 'Score must be a number between 0 and 100' });
  }

  const newGrade = {
    id: generateId(),
    subject: subject.trim(),
    score: parsedScore,
    date: new Date().toISOString().split('T')[0],
  };
  student.grades.push(newGrade);
  res.status(201).json({ success: true, data: enrichStudent(student) });
});

// DELETE /api/students/:id/grades/:gradeId  — remove a specific grade
app.delete('/api/students/:id/grades/:gradeId', (req, res) => {
  const student = students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const gradeIndex = student.grades.findIndex(g => g.id === req.params.gradeId);
  if (gradeIndex === -1) return res.status(404).json({ success: false, message: 'Grade not found' });

  student.grades.splice(gradeIndex, 1);
  res.json({ success: true, data: enrichStudent(student) });
});

// GET /api/stats  — class-level statistics
app.get('/api/stats', (req, res) => {
  if (!students.length) {
    return res.json({ success: true, data: null });
  }

  const averages = students.map(s => calcAverage(s.grades)).filter(a => a > 0);
  const classAverage = averages.length
    ? parseFloat((averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(1))
    : 0;

  const allScores = students.flatMap(s => s.grades.map(g => g.score));
  const highest = allScores.length ? Math.max(...allScores) : 0;
  const lowest  = allScores.length ? Math.min(...allScores) : 0;

  const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  students.forEach(s => {
    const letter = getLetterGrade(calcAverage(s.grades));
    if (s.grades.length) gradeDist[letter]++;
  });

  res.json({
    success: true,
    data: {
      totalStudents: students.length,
      classAverage,
      classLetterGrade: getLetterGrade(classAverage),
      highest,
      lowest,
      totalGradesRecorded: allScores.length,
      gradeDistribution: gradeDist,
    },
  });
});

// Serve frontend for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Student Grades Tracker running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
