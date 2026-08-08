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

// ===================== TIMELINE =====================
const TIMELINE_FILE = path.join(__dirname, 'timeline.json');
if (!fs.existsSync(TIMELINE_FILE)) fs.writeFileSync(TIMELINE_FILE, '[]');
function loadTL()  { try { return JSON.parse(fs.readFileSync(TIMELINE_FILE, 'utf8')); } catch { return []; } }
function saveTL(d) { fs.writeFileSync(TIMELINE_FILE, JSON.stringify(d, null, 2)); }

app.get('/api/timeline', (_req, res) => res.json(loadTL()));

app.post('/api/timeline', (req, res) => {
  const { sessionId, type, note } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  const tl   = loadTL();
  const entry = { id: tl.length ? Math.max(...tl.map(t => t.id)) + 1 : 1, ts: new Date().toISOString(), sessionId, type, note: note ?? '' };
  tl.unshift(entry);
  saveTL(tl);
  res.status(201).json(entry);
});

// ===================== ALERTS =====================
const ALERTS_FILE = path.join(__dirname, 'alerts.json');
if (!fs.existsSync(ALERTS_FILE)) fs.writeFileSync(ALERTS_FILE, '[]');
function loadAL()  { try { return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); } catch { return []; } }
function saveAL(d) { fs.writeFileSync(ALERTS_FILE, JSON.stringify(d, null, 2)); }

app.get('/api/alerts', (_req, res) => res.json(loadAL()));

app.post('/api/alerts', (req, res) => {
  const { sessionId, patientName, bpm, severity, message } = req.body;
  if (!severity) return res.status(400).json({ error: 'severity required' });
  const alerts = loadAL();
  const entry  = {
    id: alerts.length ? Math.max(...alerts.map(a => a.id)) + 1 : 1,
    ts: new Date().toISOString(),
    sessionId, patientName, bpm, severity,
    message: message ?? '', status: 'pending', retries: 0
  };
  alerts.unshift(entry);
  saveAL(alerts);
  res.status(201).json(entry);
});

app.patch('/api/alerts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const alerts = loadAL();
  const idx    = alerts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  Object.assign(alerts[idx], req.body);
  saveAL(alerts);
  res.json(alerts[idx]);
});

// ===================== FHIR =====================
app.get('/api/fhir/Patient/:id', (req, res) => {
  const s = load().find(x => x.id === parseInt(req.params.id, 10));
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({
    resourceType: 'Patient', id: String(s.id),
    name: [{ use: 'official', text: s.name }],
    gender: s.gender === 'Male' ? 'male' : s.gender === 'Female' ? 'female' : 'unknown',
    extension: [
      { url: 'http://codecure.local/blood-group', valueString: s.blood },
      { url: 'http://codecure.local/age', valueInteger: parseInt(s.age) || 0 }
    ],
    meta: { lastUpdated: s.ts }
  });
});

app.get('/api/fhir/Observation/:id', (req, res) => {
  const s = load().find(x => x.id === parseInt(req.params.id, 10));
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({
    resourceType: 'Observation', id: `obs-${s.id}`, status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
    subject: { reference: `Patient/${s.id}`, display: s.name },
    effectiveDateTime: s.ts,
    valueQuantity: { value: s.bpm, unit: 'bpm', system: 'http://unitsofmeasure.org', code: '/min' },
    interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: s.status === 'NORMAL' ? 'N' : s.status === 'LOW' ? 'L' : 'H' }] }]
  });
});

app.get('/api/fhir/Bundle', (_req, res) => {
  const sessions = load();
  res.json({
    resourceType: 'Bundle', type: 'collection', total: sessions.length,
    entry: sessions.map(s => ({
      resource: {
        resourceType: 'Observation', id: `obs-${s.id}`, status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
        subject: { reference: `Patient/${s.id}`, display: s.name },
        effectiveDateTime: s.ts,
        valueQuantity: { value: s.bpm, unit: 'bpm', system: 'http://unitsofmeasure.org', code: '/min' }
      }
    }))
  });
});

// Catch-all: serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  CodeCure dashboard → http://localhost:${PORT}`);
  console.log(`  Data stored in     → ${DB_FILE}\n`);
});
