const STORAGE_KEY = 'timeclock-data';
let state = { employees: [], records: {}, activities: [] };
let currentEmployee = null;

function pad(n) { return String(n).padStart(2, '0'); }

function formatClock(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function formatTime(iso) {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return pad(h) + ':' + pad(d.getMinutes()) + ' ' + ampm;
}

function formatDate(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h + 'h ' + pad(m) + 'm';
}

function parseISO(iso) {
  return new Date(iso);
}

function dayRangeForDate(d) {
  const start = new Date(d);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function overlapDuration(msStart, msEnd, windowStartMs, windowEndMs) {
  const a = Math.max(msStart, windowStartMs);
  const b = Math.min(msEnd, windowEndMs);
  return Math.max(0, b - a);
}

function computeDailyTotalsForDate(date) {
  // returns { employeeName: milliseconds }
  const { start, end } = dayRangeForDate(date);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = Date.now();

  const totals = {};
  state.employees.forEach(name => {
    const recs = getRecords(name);
    let acc = 0;
    recs.forEach(r => {
      const inMs = parseISO(r.timeIn).getTime();
      const outMs = r.timeOut ? parseISO(r.timeOut).getTime() : nowMs;
      acc += overlapDuration(inMs, outMs, startMs, endMs);
    });
    totals[name] = acc;
  });
  return totals;
}

function tickClock() {
  const now = new Date();
  document.getElementById('headerClock').textContent = formatClock(now);
  document.getElementById('liveClock').textContent = formatClock(now);
}
setInterval(tickClock, 1000);
tickClock();

function getSupabaseHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

function getSupabaseBaseUrl() {
  return (SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
}

function getSupabaseTableUrl() {
  return `${getSupabaseBaseUrl()}/rest/v1/${SUPABASE_TABLE}`;
}

async function loadState() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('YOUR_') || SUPABASE_ANON_KEY.includes('YOUR_')) {
    state = { employees: [], records: {} };
    showError('Set your Supabase URL and anon key in supabase-config.js');
    return;
  }

  try {
    const response = await fetch(`${getSupabaseTableUrl()}?select=state_json&id=eq.1`, {
      headers: getSupabaseHeaders()
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`Unable to load data (${response.status}): ${responseText}`);

    const rows = responseText ? JSON.parse(responseText) : [];
    if (rows && rows.length > 0) {
      const parsed = JSON.parse(rows[0].state_json);
      state = parsed;
    } else {
      state = { employees: [], records: {} };
    }

    if (!state.employees) state.employees = [];
    if (!state.records) state.records = {};
    if (!state.activities) state.activities = [];
  } catch (e) {
    state = { employees: [], records: {} };
    showError('Could not load data from Supabase.', e.message);
  }
}

async function saveState() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('YOUR_') || SUPABASE_ANON_KEY.includes('YOUR_')) {
    showError('Set your Supabase URL and anon key in supabase-config.js');
    return;
  }

  try {
    const response = await fetch(`${getSupabaseTableUrl()}?id=eq.1`, {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: 1, state_json: JSON.stringify(state) })
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`Unable to save data (${response.status}): ${responseText}`);
  } catch (e) {
    showError('Could not save to Supabase. Try again.', e.message);
  }
}

function showError(msg, details) {
  const el = document.getElementById('errorMsg');
  const message = details ? `${msg}: ${details}` : msg;
  el.textContent = message;
  console.error(message);
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function getRecords(name) {
  if (!state.records[name]) state.records[name] = [];
  return state.records[name];
}

function getActivities() {
  if (!state.activities) state.activities = [];
  return state.activities;
}

function addActivity(type, employee, extra = {}) {
  getActivities().push({
    type,
    employee,
    timestamp: new Date().toISOString(),
    ...extra
  });
}

function getOpenEntry(name) {
  const recs = getRecords(name);
  const last = recs[recs.length - 1];
  return (last && !last.timeOut) ? last : null;
}

function populateEmployeeSelect() {
  const sel = document.getElementById('employeeSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  if (state.employees.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No employees yet — add one below';
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
    currentEmployee = null;
    return;
  }
  state.employees.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if (prev && state.employees.includes(prev)) {
    sel.value = prev;
  } else {
    sel.value = state.employees[0];
  }
  currentEmployee = sel.value;
}

function updateDeleteButtonState() {
  const btn = document.getElementById('deleteEmployeeBtn');
  btn.disabled = !currentEmployee || !state.employees.includes(currentEmployee);
}

function renderPunchCard() {
  const nameEl = document.getElementById('punchEmployeeName');
  const statusEl = document.getElementById('punchStatus');
  const btn = document.getElementById('punchBtn');

  if (!currentEmployee) {
    nameEl.textContent = '—';
    statusEl.textContent = 'Select an employee to begin';
    statusEl.className = 'status-line';
    btn.disabled = true;
    btn.textContent = 'Punch in';
    btn.className = 'punch-btn punch-in';
    return;
  }

  nameEl.textContent = currentEmployee;
  const open = getOpenEntry(currentEmployee);
  btn.disabled = false;

  if (open) {
    statusEl.textContent = 'Clocked in since ' + formatTime(open.timeIn);
    statusEl.className = 'status-line in';
    btn.textContent = 'Punch out';
    btn.className = 'punch-btn punch-out';
  } else {
    statusEl.textContent = 'Currently clocked out';
    statusEl.className = 'status-line';
    btn.textContent = 'Punch in';
    btn.className = 'punch-btn punch-in';
  }
}

function renderBoard() {
  const board = document.getElementById('board');
  if (state.employees.length === 0) {
    board.innerHTML = '<div class="empty">No employees yet</div>';
    return;
  }
  board.innerHTML = '';
  const todayTotals = computeDailyTotalsForDate(new Date());
  state.employees.forEach(name => {
    const open = getOpenEntry(name);
    const row = document.createElement('div');
    row.className = 'board-row';
    const todayMs = todayTotals[name] || 0;
    const todayText = todayMs > 0 ? ' • Today: ' + formatDuration(todayMs) : '';
    row.innerHTML = `
      <span class="board-name">${escapeHtml(name)}</span>
      <span class="board-status ${open ? 'in' : 'out'}">${open ? 'In since ' + formatTime(open.timeIn) : 'Out'}<span class="board-today">${todayText}</span></span>
    `;
    board.appendChild(row);
  });
}

let weekOffset = 0;

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekRange(offset) {
  const base = new Date();
  base.setDate(base.getDate() + offset * 7);
  const start = startOfWeek(base);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function formatWeekLabel(start, end) {
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  const opts = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = lastDay.toLocaleDateString('en-US', opts);
  const year = lastDay.getFullYear();
  return startStr + ' – ' + endStr + ', ' + year;
}

function populateHistoryEmployeeSelect() {
  const sel = document.getElementById('historyEmployeeSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="__all__">All employees</option>';
  state.employees.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if (prev && (prev === '__all__' || state.employees.includes(prev))) {
    sel.value = prev;
  }
}

function renderHistory() {
  const { start, end } = getWeekRange(weekOffset);
  document.getElementById('weekLabel').textContent = formatWeekLabel(start, end);
  document.getElementById('weekNextBtn').disabled = weekOffset >= 0;

  const filterName = document.getElementById('historyEmployeeSelect').value;
  const namesToShow = filterName === '__all__' ? state.employees : [filterName];

  const entriesByDay = {};
  let weekTotalMs = 0;

  getActivities().forEach(activity => {
    const t = new Date(activity.timestamp);
    if (t >= start && t < end) {
      const dayKey = formatDate(activity.timestamp);
      if (!entriesByDay[dayKey]) entriesByDay[dayKey] = { sortTime: t, items: [], totals: {} };
      if (filterName === '__all__' || activity.employee === filterName) {
        entriesByDay[dayKey].items.push({ kind: 'activity', ...activity });
      }
    }
  });

  namesToShow.forEach(name => {
    getRecords(name).forEach(r => {
      const t = new Date(r.timeIn);
      if (t >= start && t < end) {
        const dayKey = formatDate(r.timeIn);
        if (!entriesByDay[dayKey]) entriesByDay[dayKey] = { sortTime: t, items: [], totals: {} };
        entriesByDay[dayKey].items.push({ kind: 'punch', name, ...r });
        // include open entries (count until now) and partial overlaps with the day
        const { start: dayStart, end: dayEnd } = dayRangeForDate(t);
        const inMs = parseISO(r.timeIn).getTime();
        const outMs = r.timeOut ? parseISO(r.timeOut).getTime() : Date.now();
        const overlap = overlapDuration(inMs, outMs, dayStart.getTime(), dayEnd.getTime());
        if (overlap > 0) {
          weekTotalMs += overlap;
          entriesByDay[dayKey].totals[name] = (entriesByDay[dayKey].totals[name] || 0) + overlap;
        }
      }
    });
  });

  const dayKeys = Object.keys(entriesByDay).sort(
    (a, b) => entriesByDay[b].sortTime - entriesByDay[a].sortTime
  );

  const container = document.getElementById('historyDays');
  const emptyMsg = document.getElementById('historyEmptyMsg');
  const totalEl = document.getElementById('weekTotal');

  totalEl.textContent = weekTotalMs > 0 ? 'Week total: ' + formatDuration(weekTotalMs) : '';

  if (dayKeys.length === 0) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  container.innerHTML = '';

  dayKeys.forEach(dayKey => {
    const group = entriesByDay[dayKey];
    const items = group.items.slice().sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn));
    let dayTotalMs = 0;
    items.forEach(it => { if (it.timeIn) {
      const inMs = parseISO(it.timeIn).getTime();
      const outMs = it.timeOut ? parseISO(it.timeOut).getTime() : Date.now();
      const { start: dayStart, end: dayEnd } = dayRangeForDate(new Date(group.sortTime));
      dayTotalMs += overlapDuration(inMs, outMs, dayStart.getTime(), dayEnd.getTime());
    }});

    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-group';

    const heading = document.createElement('div');
    heading.className = 'day-heading';
    heading.innerHTML = `<span>${dayKey}</span><span class="day-total">${dayTotalMs > 0 ? formatDuration(dayTotalMs) : ''}</span>`;
    dayDiv.appendChild(heading);

    const summary = document.createElement('div');
    summary.className = 'day-summary';
    const summaryItems = Object.entries(group.totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([employee, total]) => `
        <div class="day-summary-item">
          <span>${escapeHtml(employee)}</span>
          <span>${formatDuration(total)}</span>
        </div>
      `)
      .join('');
    summary.innerHTML = summaryItems || '<div class="day-summary-item"><span>No time</span><span>—</span></div>';
    dayDiv.appendChild(summary);

    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'entry-row';

      if (it.kind === 'activity') {
        const actionLabel = it.type === 'employee_added'
          ? 'Employee added'
          : it.type === 'punch_in'
            ? 'Punch in'
            : 'Punch out';
        row.innerHTML = `
          <span class="entry-name">${escapeHtml(it.employee)}</span>
          <span class="entry-times">${actionLabel}</span>
          <span class="entry-duration">${formatTime(it.timestamp)}</span>
        `;
      } else {
        const namePart = filterName === '__all__' ? `<span class="entry-name">${escapeHtml(it.name)}</span>` : '';
        const timesPart = `<span class="entry-times">${formatTime(it.timeIn)} – ${it.timeOut ? formatTime(it.timeOut) : 'open'}</span>`;
        const durationPart = `<span class="entry-duration">${it.timeOut ? formatDuration(new Date(it.timeOut) - new Date(it.timeIn)) : 'Open'}</span>`;
        row.innerHTML = filterName === '__all__' ? namePart + timesPart + durationPart : timesPart + durationPart;
      }

      dayDiv.appendChild(row);
    });

    container.appendChild(dayDiv);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  updateDeleteButtonState();
  renderPunchCard();
  renderBoard();
  populateHistoryEmployeeSelect();
  renderHistory();
}

function switchTab(tab) {
  document.getElementById('pageClock').classList.toggle('active', tab === 'clock');
  document.getElementById('pageHistory').classList.toggle('active', tab === 'history');
  document.getElementById('tabClockBtn').classList.toggle('active', tab === 'clock');
  document.getElementById('tabHistoryBtn').classList.toggle('active', tab === 'history');
  if (tab === 'history') renderHistory();
}

document.getElementById('tabClockBtn').addEventListener('click', () => switchTab('clock'));
document.getElementById('tabHistoryBtn').addEventListener('click', () => switchTab('history'));
document.getElementById('exportPdfBtn').addEventListener('click', () => window.print());

document.getElementById('historyEmployeeSelect').addEventListener('change', renderHistory);

document.getElementById('weekPrevBtn').addEventListener('click', () => {
  weekOffset -= 1;
  renderHistory();
});

document.getElementById('weekNextBtn').addEventListener('click', () => {
  if (weekOffset < 0) {
    weekOffset += 1;
    renderHistory();
  }
});

document.getElementById('employeeSelect').addEventListener('change', (e) => {
  currentEmployee = e.target.value;
  renderAll();
});

document.getElementById('deleteEmployeeBtn').addEventListener('click', async () => {
  if (!currentEmployee) return;
  const confirmed = window.confirm(`Delete ${currentEmployee}?`);
  if (!confirmed) return;

  state.employees = state.employees.filter(name => name !== currentEmployee);
  delete state.records[currentEmployee];
  currentEmployee = state.employees.length > 0 ? state.employees[0] : null;

  await saveState();
  populateEmployeeSelect();
  renderAll();
});

document.getElementById('addEmployeeBtn').addEventListener('click', async () => {
  const input = document.getElementById('newEmployeeInput');
  const name = input.value.trim();
  if (!name) { showError('Enter a name first.'); return; }
  if (state.employees.includes(name)) { showError('That employee already exists.'); return; }
  state.employees.push(name);
  state.records[name] = [];
  addActivity('employee_added', name);
  input.value = '';
  await saveState();
  populateEmployeeSelect();
  document.getElementById('employeeSelect').value = name;
  currentEmployee = name;
  renderAll();
});

document.getElementById('newEmployeeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addEmployeeBtn').click();
});

document.getElementById('punchBtn').addEventListener('click', async () => {
  if (!currentEmployee) return;
  const recs = getRecords(currentEmployee);
  const open = getOpenEntry(currentEmployee);
  const now = new Date().toISOString();

  if (open) {
    open.timeOut = now;
    addActivity('punch_out', currentEmployee);
  } else {
    recs.push({ timeIn: now, timeOut: null });
    addActivity('punch_in', currentEmployee);
  }

  await saveState();
  renderAll();
});

async function init() {
  await loadState();
  populateEmployeeSelect();
  renderAll();
}

init();
