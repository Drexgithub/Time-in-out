const STORAGE_KEY = 'timeclock-data';
let state = { employees: [], records: {} };
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

function tickClock() {
  const now = new Date();
  document.getElementById('headerClock').textContent = formatClock(now);
  document.getElementById('liveClock').textContent = formatClock(now);
}
setInterval(tickClock, 1000);
tickClock();

async function loadState() {
  try {
    const response = await fetch('api.php?action=get');
    if (!response.ok) throw new Error('Unable to load data');
    const result = await response.json();
    if (result && result.state) {
      state = result.state;
      if (!state.employees) state.employees = [];
      if (!state.records) state.records = {};
    }
  } catch (e) {
    state = { employees: [], records: {} };
  }
}

async function saveState() {
  try {
    const response = await fetch('api.php?action=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!response.ok) throw new Error('Unable to save data');
  } catch (e) {
    showError('Could not save. Try again.');
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function getRecords(name) {
  if (!state.records[name]) state.records[name] = [];
  return state.records[name];
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
  state.employees.forEach(name => {
    const open = getOpenEntry(name);
    const row = document.createElement('div');
    row.className = 'board-row';
    row.innerHTML = `
      <span class="board-name">${escapeHtml(name)}</span>
      <span class="board-status ${open ? 'in' : 'out'}">${open ? 'In since ' + formatTime(open.timeIn) : 'Out'}</span>
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

  namesToShow.forEach(name => {
    getRecords(name).forEach(r => {
      const t = new Date(r.timeIn);
      if (t >= start && t < end) {
        const dayKey = formatDate(r.timeIn);
        if (!entriesByDay[dayKey]) entriesByDay[dayKey] = { sortTime: t, items: [], totals: {} };
        entriesByDay[dayKey].items.push({ name, ...r });
        if (r.timeOut) {
          const duration = new Date(r.timeOut) - new Date(r.timeIn);
          weekTotalMs += duration;
          entriesByDay[dayKey].totals[name] = (entriesByDay[dayKey].totals[name] || 0) + duration;
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
    items.forEach(it => { if (it.timeOut) dayTotalMs += new Date(it.timeOut) - new Date(it.timeIn); });

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
      const namePart = filterName === '__all__' ? `<span class="entry-name">${escapeHtml(it.name)}</span>` : '';
      const timesPart = `<span class="entry-times">${formatTime(it.timeIn)} – ${it.timeOut ? formatTime(it.timeOut) : 'open'}</span>`;
      const durationPart = `<span class="entry-duration">${it.timeOut ? formatDuration(new Date(it.timeOut) - new Date(it.timeIn)) : 'Open'}</span>`;
      row.innerHTML = filterName === '__all__' ? namePart + timesPart + durationPart : timesPart + durationPart;
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
  } else {
    recs.push({ timeIn: now, timeOut: null });
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
