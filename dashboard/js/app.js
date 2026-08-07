/* =============================================
   CodeCure Dashboard — app.js
   ThingSpeak Channel: 3446548 | Field: 1 (BPM)
   ESP32 upload interval: 15 seconds
   ============================================= */

const TS = {
  CHANNEL: 3446548,
  READ_KEY: '5OX6UHRP93RQ1MTV',
  last()       { return `https://api.thingspeak.com/channels/${this.CHANNEL}/fields/1/last.json?api_key=${this.READ_KEY}`; },
  feeds(n = 50){ return `https://api.thingspeak.com/channels/${this.CHANNEL}/feeds.json?api_key=${this.READ_KEY}&results=${n}`; }
};

/* ---- Helpers ---- */
function bpmStatus(bpm) {
  if (bpm < 60)  return 'LOW';
  if (bpm <= 100) return 'NORMAL';
  return 'HIGH';
}

function statusColor(s) {
  return { NORMAL: '#00ff88', LOW: '#ffaa00', HIGH: '#ff4466' }[s] ?? '#5a7090';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ============================================
   Session Storage — SQLite via local API
   Falls back to localStorage if server is down
   ============================================ */
const Sessions = {
  async all() {
    try {
      const r = await fetch('/api/sessions');
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      return JSON.parse(localStorage.getItem('codecure_v1_sessions') ?? '[]');
    }
  },

  async add(s) {
    try {
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      s.id = Date.now(); s.ts = new Date().toISOString();
      const a = JSON.parse(localStorage.getItem('codecure_v1_sessions') ?? '[]');
      a.unshift(s);
      localStorage.setItem('codecure_v1_sessions', JSON.stringify(a));
      return s;
    }
  },

  async remove(id) {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch {
      const a = JSON.parse(localStorage.getItem('codecure_v1_sessions') ?? '[]');
      localStorage.setItem('codecure_v1_sessions', JSON.stringify(a.filter(s => s.id !== id)));
    }
  },

  async clear() {
    try {
      await fetch('/api/sessions', { method: 'DELETE' });
    } catch {
      localStorage.removeItem('codecure_v1_sessions');
    }
  }
};

/* ============================================
   Chart Manager
   ============================================ */
const Charts = {
  trend: null, dist: null, status: null,

  init() {
    Chart.defaults.color        = '#5a7090';
    Chart.defaults.borderColor  = '#1a2a4a';
    Chart.defaults.font.family  = "'Share Tech Mono', monospace";

    this.trend = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'BPM', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,.06)',
            borderWidth: 2, pointRadius: 4, pointBackgroundColor: [], fill: true, tension: .4 },
          { label: 'Low  60', data: [], borderColor: '#ffaa00', borderDash: [5,5], borderWidth: 1, pointRadius: 0, fill: false },
          { label: 'High 100', data: [], borderColor: '#ff4466', borderDash: [5,5], borderWidth: 1, pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
        scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { min: 40, max: 160 } }
      }
    });

    this.dist = new Chart(document.getElementById('distChart'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Count', data: [], backgroundColor: [] }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });

    this.status = new Chart(document.getElementById('statusChart'), {
      type: 'doughnut',
      data: {
        labels: ['Normal (60–100)', 'Low <60', 'High >100'],
        datasets: [{ data: [0,0,0], backgroundColor: ['#00ff88','#ffaa00','#ff4466'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
      }
    });
  },

  updateTrend(feeds) {
    const labels = feeds.map(f => fmtTime(f.created_at));
    const vals   = feeds.map(f => parseFloat(f.field1));
    const colors = vals.map(v => statusColor(bpmStatus(v)));

    this.trend.data.labels                             = labels;
    this.trend.data.datasets[0].data                  = vals;
    this.trend.data.datasets[0].pointBackgroundColor  = colors;
    this.trend.data.datasets[1].data                  = Array(vals.length).fill(60);
    this.trend.data.datasets[2].data                  = Array(vals.length).fill(100);
    this.trend.update();
  },

  updateDist(vals) {
    const bins = [
      { l: '<50',    lo: 0,   hi: 50  },
      { l: '50–60',  lo: 50,  hi: 60  },
      { l: '60–70',  lo: 60,  hi: 70  },
      { l: '70–80',  lo: 70,  hi: 80  },
      { l: '80–90',  lo: 80,  hi: 90  },
      { l: '90–100', lo: 90,  hi: 100 },
      { l: '100–110',lo: 100, hi: 110 },
      { l: '>110',   lo: 110, hi: 999 }
    ];
    this.dist.data.labels                        = bins.map(b => b.l);
    this.dist.data.datasets[0].data              = bins.map(b => vals.filter(v => v >= b.lo && v < b.hi).length);
    this.dist.data.datasets[0].backgroundColor   = bins.map(b => b.hi <= 60 ? '#ffaa00' : b.lo >= 100 ? '#ff4466' : '#00d4ff');
    this.dist.update();
  },

  updateStatus(vals) {
    this.status.data.datasets[0].data = [
      vals.filter(v => v >= 60 && v <= 100).length,
      vals.filter(v => v < 60).length,
      vals.filter(v => v > 100).length
    ];
    this.status.update();
  }
};

/* ============================================
   App
   ============================================ */
const app = {
  _scanPoll:   null,
  _autoRefresh: null,
  _scanStart:   null,
  _lastResult:  null,

  /* ---- Init ---- */
  async init() {
    Charts.init();
    await this.refreshSidebarStats();
    await this.renderSessionsTable();
    await this._doRefresh();
    // Auto-refresh every 15 s matching ESP32 upload cadence
    this._autoRefresh = setInterval(() => this._doRefresh(), 15000);
  },

  /* ---- Navigation ---- */
  navigate(page) {
    document.querySelectorAll('.page').forEach(p   => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
  },

  /* ---- ThingSpeak API ---- */
  async fetchLast() {
    try {
      const r = await fetch(TS.last());
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const bpm = parseFloat(d.field1);
      if (!bpm || bpm <= 0) return null;
      return { bpm, time: d.created_at };
    } catch { return null; }
  },

  async fetchFeeds(n = 50) {
    try {
      const r = await fetch(TS.feeds(n));
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return (d.feeds ?? []).filter(f => f.field1 && parseFloat(f.field1) > 0);
    } catch { return []; }
  },

  /* ---- Dashboard Refresh ---- */
  async refreshDashboard() {
    const feeds = await this.fetchFeeds(50);

    if (!feeds.length) { this.setOnline(false); return; }
    this.setOnline(true);

    const vals = feeds.map(f => parseFloat(f.field1));
    const last = vals.at(-1);
    const avg  = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const min  = Math.min(...vals);
    const max  = Math.max(...vals);
    const st   = bpmStatus(last);

    /* Triage page live display */
    this.setLiveBPM(last, st);

    /* Dashboard stats */
    document.getElementById('dCurrent').textContent      = last;
    document.getElementById('dCurrentStatus').textContent = st;
    document.getElementById('dAvg').textContent           = avg;
    document.getElementById('dMin').textContent           = min;
    document.getElementById('dMax').textContent           = max;

    /* Charts */
    Charts.updateTrend(feeds);
    Charts.updateDist(vals);
    Charts.updateStatus(vals);

    /* Recent readings list */
    this.renderRecentReadings(feeds.slice(-10).reverse());

    /* Sidebar avg */
    document.getElementById('sidebarAvg').textContent = avg;
    document.getElementById('lastUpdateTime').textContent = new Date().toLocaleTimeString('en-IN');
  },

  setLiveBPM(bpm, st) {
    document.getElementById('liveBPM').textContent     = bpm;
    const badge = document.getElementById('triageStatusBadge');
    badge.className = `status-badge ${st}`;
    document.getElementById('triageStatusText').textContent = st;
    document.getElementById('heartIcon').classList.add('beating');
  },

  setOnline(online) {
    const dot  = document.getElementById('statusDot');
    const txt  = document.getElementById('systemStatusText');
    dot.className = `status-dot ${online ? 'online' : 'offline'}`;
    txt.textContent = online ? 'SYSTEM ONLINE' : 'NO DATA';
  },

  renderRecentReadings(feeds) {
    const el = document.getElementById('recentReadings');
    if (!feeds.length) { el.innerHTML = '<div style="color:var(--text-dim);font-family:var(--mono);font-size:12px;padding:20px;text-align:center">No readings</div>'; return; }
    el.innerHTML = feeds.map(f => {
      const bpm = parseFloat(f.field1);
      const st  = bpmStatus(bpm);
      return `<div class="reading-row ${st}">
        <span class="reading-bpm">${bpm}</span>
        <span class="reading-time">${fmtTime(f.created_at)}</span>
        <span class="reading-s ${st}">${st}</span>
      </div>`;
    }).join('');
  },

  /* ---- Scan ---- */
  async startScan() {
    const name = document.getElementById('patientName').value.trim();
    if (!name) {
      const inp = document.getElementById('patientName');
      inp.classList.add('error');
      inp.focus();
      setTimeout(() => inp.classList.remove('error'), 2000);
      return;
    }

    this._lastResult = null;
    this._scanStart  = Date.now();

    document.getElementById('scanBtn').style.display  = 'none';
    document.getElementById('stopBtn').style.display  = 'flex';
    document.getElementById('saveBtn').style.display  = 'none';
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('liveBPM').textContent = '...';
    document.getElementById('bpmWrap').classList.add('scanning');
    document.getElementById('heartIcon').classList.add('beating');

    // Poll immediately then every 5 s
    await this._pollScan();
    this._scanPoll = setInterval(() => this._pollScan(), 5000);
  },

  async _pollScan() {
    const data = await this.fetchLast();
    if (!data) return;

    // Accept the reading (ESP32 sends latest value; show it immediately)
    const st = bpmStatus(data.bpm);
    this.setLiveBPM(data.bpm, st);
    this._lastResult = { bpm: data.bpm, status: st, time: data.time };
    this.showTriageResult();
    this.stopScan(true);
  },

  stopScan(hasResult = false) {
    clearInterval(this._scanPoll);
    document.getElementById('bpmWrap').classList.remove('scanning');
    document.getElementById('scanBtn').style.display = 'flex';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = hasResult ? 'flex' : 'none';
  },

  showTriageResult() {
    if (!this._lastResult) return;

    const { bpm, status } = this._lastResult;
    const name      = esc(document.getElementById('patientName').value.trim());
    const age       = esc(document.getElementById('patientAge').value   || '--');
    const gender    = esc(document.getElementById('patientGender').value || '--');
    const blood     = esc(document.getElementById('patientBlood').value  || 'UNKNOWN');
    const complaint = esc(document.getElementById('patientComplaint').value);

    const INFO = {
      NORMAL: {
        priority: 'NON-URGENT',
        msg: 'Heart rate is within normal range (60–100 BPM). No immediate intervention required.',
        rec: 'Continue monitoring. Proceed with standard assessment.'
      },
      LOW: {
        priority: 'URGENT',
        msg: 'Bradycardia detected — Heart rate below 60 BPM. May indicate a cardiac conduction issue.',
        rec: 'Physician evaluation recommended. Assess for dizziness, fatigue, or syncope.'
      },
      HIGH: {
        priority: 'IMMEDIATE',
        msg: 'Tachycardia detected — Heart rate above 100 BPM. Possible cardiac stress or arrhythmia.',
        rec: 'Immediate physician evaluation required. Monitor for chest pain or breathlessness.'
      }
    };

    const info = INFO[status];
    const col  = statusColor(status);

    document.getElementById('resultContent').innerHTML = `
      <div class="result-meta-grid">
        <div class="result-item">
          <span class="result-label">PATIENT NAME</span>
          <span class="result-val">${name}</span>
        </div>
        <div class="result-item">
          <span class="result-label">AGE / GENDER</span>
          <span class="result-val">${age} ${gender !== '--' ? '/ ' + gender : ''}</span>
        </div>
        <div class="result-item">
          <span class="result-label">BLOOD GROUP</span>
          <span class="result-val">${blood}</span>
        </div>
        <div class="result-item">
          <span class="result-label">MEASURED BPM</span>
          <span class="result-val" style="color:${col}">${bpm} BPM</span>
        </div>
        <div class="result-item">
          <span class="result-label">TRIAGE PRIORITY</span>
          <span class="result-val" style="color:${col}">${info.priority}</span>
        </div>
      </div>
      <div class="result-classification ${status}">
        <div class="class-label">AI CLASSIFICATION</div>
        <div class="class-msg">${info.msg}</div>
        <div class="class-rec">REC: ${info.rec}</div>
        ${complaint ? `<div class="class-complaint">COMPLAINT: ${complaint}</div>` : ''}
      </div>`;

    const card = document.getElementById('resultCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  /* ---- Save Session ---- */
  async saveSession() {
    if (!this._lastResult) return;

    await Sessions.add({
      name:      document.getElementById('patientName').value.trim(),
      age:       document.getElementById('patientAge').value       || '--',
      gender:    document.getElementById('patientGender').value    || '--',
      blood:     document.getElementById('patientBlood').value     || '--',
      complaint: document.getElementById('patientComplaint').value || '--',
      history:   document.getElementById('patientHistory').value   || '--',
      bpm:       this._lastResult.bpm,
      status:    this._lastResult.status
    });

    await this.renderSessionsTable();
    await this.refreshSidebarStats();

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = '✓ SAVED';
    saveBtn.disabled = true;

    setTimeout(() => {
      document.getElementById('patientForm').reset();
      document.getElementById('resultCard').style.display = 'none';
      document.getElementById('liveBPM').textContent = '--';
      const badge = document.getElementById('triageStatusBadge');
      badge.className = 'status-badge';
      document.getElementById('triageStatusText').textContent = 'STANDBY';
      document.getElementById('heartIcon').classList.remove('beating');
      saveBtn.textContent = '✓ SAVE RECORD';
      saveBtn.disabled = false;
      saveBtn.style.display = 'none';
      this._lastResult = null;
    }, 1600);
  },

  /* ---- Sessions Table ---- */
  async renderSessionsTable() {
    let list = await Sessions.all();

    const search  = (document.getElementById('searchInput')?.value ?? '').toLowerCase();
    const stFilter = document.getElementById('statusFilter')?.value ?? '';

    if (search)   list = list.filter(s => s.name.toLowerCase().includes(search) || s.complaint.toLowerCase().includes(search));
    if (stFilter) list = list.filter(s => s.status === stFilter);

    const tbody = document.getElementById('sessionsBody');
    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No sessions found.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((s, i) => `
      <tr>
        <td style="font-family:var(--mono);color:var(--text-dim)">${i + 1}</td>
        <td style="font-family:var(--mono);font-size:11px">${fmtDateTime(s.ts)}</td>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.age)}</td>
        <td style="font-family:var(--mono);font-size:18px;color:var(--accent)">${s.bpm}</td>
        <td><span class="badge ${s.status}">${s.status}</span></td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.complaint)}">${esc(s.complaint)}</td>
        <td><button class="del-btn" onclick="app.deleteSession(${s.id})" title="Delete">✕</button></td>
      </tr>`).join('');
  },

  filterSessions() { this.renderSessionsTable(); },

  async deleteSession(id) {
    await Sessions.remove(id);
    await this.renderSessionsTable();
    await this.refreshSidebarStats();
  },

  async clearAllSessions() {
    if (!confirm('Delete all session records? This cannot be undone.')) return;
    await Sessions.clear();
    await this.renderSessionsTable();
    await this.refreshSidebarStats();
  },

  async exportCSV() {
    const list = await Sessions.all();
    if (!list.length) return;

    const header = ['#','Date/Time','Name','Age','Gender','Blood','BPM','Status','Complaint','History'];
    const rows   = list.map((s, i) => [
      i + 1, `"${fmtDateTime(s.ts)}"`, `"${s.name}"`,
      s.age, s.gender, s.blood, s.bpm, s.status,
      `"${s.complaint}"`, `"${s.history}"`
    ]);

    const csv  = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `codecure_sessions_${new Date().toISOString().slice(0, 10)}.csv`
    });
    a.click();
    URL.revokeObjectURL(a.href);
  },

  async refreshSidebarStats() {
    const all    = await Sessions.all();
    const today  = new Date().toDateString();
    const tod    = all.filter(s => new Date(s.ts).toDateString() === today);

    document.getElementById('sidebarSessions').textContent = tod.length;
    document.getElementById('sidebarCritical').textContent = tod.filter(s => s.status === 'HIGH').length;
  },

  /* Called from refresh button on dashboard page — proxied to _doRefresh */
  async refreshDashboard() { return app._doRefresh(); }
};

app._doRefresh = async function() {
  const feeds = await app.fetchFeeds(50);
  if (!feeds.length) { app.setOnline(false); return; }
  app.setOnline(true);
  const vals = feeds.map(f => parseFloat(f.field1));
  const last = vals.at(-1), avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  const st   = bpmStatus(last);

  app.setLiveBPM(last, st);
  document.getElementById('dCurrent').textContent       = last;
  document.getElementById('dCurrentStatus').textContent = st;
  document.getElementById('dAvg').textContent           = avg;
  document.getElementById('dMin').textContent           = Math.min(...vals);
  document.getElementById('dMax').textContent           = Math.max(...vals);

  Charts.updateTrend(feeds);
  Charts.updateDist(vals);
  Charts.updateStatus(vals);
  app.renderRecentReadings(feeds.slice(-10).reverse());

  document.getElementById('sidebarAvg').textContent     = avg;
  document.getElementById('lastUpdateTime').textContent = new Date().toLocaleTimeString('en-IN');
};

document.addEventListener('DOMContentLoaded', () => app.init());
