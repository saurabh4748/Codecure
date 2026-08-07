const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const PORT   = 3000;
const DB_FILE = path.join(__dirname, 'sessions.json');

// --- JSON file helpers ---
function load() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Initialise file if missing
if (!fs.existsSync(DB_FILE)) save([]);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// --- API ---

// GET all sessions (newest first)
app.get('/api/sessions', (_req, res) => {
  res.json(load());
});

// POST new session
app.post('/api/sessions', (req, res) => {
  const { name, age, gender, blood, bpm, status, complaint, history } = req.body;
  if (!name || !bpm || !status) return res.status(400).json({ error: 'name, bpm, status required' });

  const sessions = load();
  const nextId   = sessions.length ? Math.max(...sessions.map(s => s.id)) + 1 : 1;
  const entry    = {
    id: nextId,
    ts: new Date().toISOString(),
    name, age: age ?? '--', gender: gender ?? '--', blood: blood ?? '--',
    bpm, status, complaint: complaint ?? '--', history: history ?? '--'
  };

  sessions.unshift(entry);
  save(sessions);
  res.status(201).json({ id: entry.id, ts: entry.ts });
});

// DELETE one session
app.delete('/api/sessions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  save(load().filter(s => s.id !== id));
  res.json({ ok: true });
});

// DELETE all sessions
app.delete('/api/sessions', (_req, res) => {
  save([]);
  res.json({ ok: true });
});

// Catch-all: serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  CodeCure dashboard → http://localhost:${PORT}`);
  console.log(`  Data stored in     → ${DB_FILE}\n`);
});
