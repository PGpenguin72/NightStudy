const ROWS = ['A','B','C','D','E','F','G','H'];
const COLS = [1,2,3,4,5,6];

const MANUAL_OPTIONS = [
  { value: 'PRESENT', label: '✓ 準時抵達' },
  { value: 'LATE',    label: '⏰ 遲到' },
  { value: 'OUT',     label: '🚶 暫時外出' },
  { value: 'EXCUSED', label: '📋 請假' },
  { value: 'ABSENT',  label: '✗ 曠課' },
];

const STATUS_LABEL = {
  PRESENT: '準時抵達', LATE: '遲到', OUT: '外出中',
  EXCUSED: '請假', ABSENT: '曠課', EXPECTED: '應到未到',
};

const ERROR_MSG = {
  SESSION_NOT_OPEN:   '課程尚未開始',
  UNKNOWN_CARD:       '未知卡號',
  NOT_ENROLLED_TODAY: '今日未報名',
};

let state = {
  seats: {},
  teacherMode: false,
  teacherCardId: null,
  sessionOpen: false,
};

let notifTimer   = null;
let cardBuffer   = '';
let bufferTimer  = null;
let notifItems   = [];

// ── 時鐘 ────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2, '0');
    const mm   = String(now.getMinutes()).padStart(2, '0');
    const ss   = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('current-time').textContent = `${hh}：${mm}：${ss}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── 卡機輸入監聽 ─────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const card = cardBuffer.trim();
    cardBuffer = '';
    clearTimeout(bufferTimer);
    if (card.length > 0) processCard(card);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    cardBuffer += e.key;
    clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => { cardBuffer = ''; }, 1500);
  }
});

async function processCard(cardId) {
  try {
    const res  = await fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    });
    const data = await res.json();

    if (data.type === 'SESSION_OPENED') {
      state.teacherCardId = cardId;
      state.sessionOpen   = true;
      document.getElementById('left-panel').classList.add('session-open');
      updateHint('Session 已開啟');
      pushNotif(`✅ Session 開啟 — ${data.teacher.name}`);
      await loadSeats();
    } else if (data.type === 'TEACHER_MODE') {
      state.teacherCardId = cardId;
      toggleTeacherMode(data.teacher.name);
    } else if (data.type === 'STATUS_UPDATED') {
      applySeatUpdate(data.seat, data.new_status, data.student);
      pushNotif(`${data.student.name}　${STATUS_LABEL[data.new_status] ?? data.new_status}`);
      updateStats();
    } else if (data.type === 'NO_CHANGE') {
      pushNotif(`⚠ ${STATUS_LABEL[data.status] ?? data.status} — 狀態無法由刷卡變更`, true);
    } else if (data.error) {
      pushNotif(`⚠ ${ERROR_MSG[data.error] ?? data.error}`, true);
    }
  } catch {
    pushNotif('⚠ 網路錯誤', true);
  }
}

// ── 老師模式 ─────────────────────────────────────────────────
function toggleTeacherMode(teacherName) {
  state.teacherMode = !state.teacherMode;
  document.getElementById('teacher-banner').classList.toggle('visible', state.teacherMode);
  document.querySelectorAll('.seat-card.has-student').forEach(el => {
    el.classList.toggle('teacher-mode', state.teacherMode);
  });
  pushNotif(state.teacherMode ? `🔑 管理模式 — ${teacherName}` : '✓ 退出管理模式');
}

function openMenu(seatId) {
  const seat = state.seats[seatId];
  if (!seat?.student_id) return;

  document.getElementById('menu-title').textContent = `${seat.name}（${seatId}）`;

  const opts = document.getElementById('menu-options');
  opts.innerHTML = '';
  MANUAL_OPTIONS.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.className = 'menu-opt' + (seat.status === value ? ' active' : '');
    btn.textContent = label;
    btn.onclick = async () => {
      closeMenu();
      await applyManual(seat.student_id, value, seatId);
    };
    opts.appendChild(btn);
  });

  document.getElementById('overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('overlay').classList.add('hidden');
}

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeMenu();
});
document.getElementById('menu-cancel').addEventListener('click', closeMenu);

async function applyManual(studentId, newStatus, seatId) {
  try {
    const res  = await fetch('/api/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_card_id: state.teacherCardId,
        student_id: studentId,
        new_status: newStatus,
      }),
    });
    const data = await res.json();
    if (!data.error) {
      if (state.seats[seatId]) state.seats[seatId].status = newStatus;
      renderSeatCard(seatId);
      updateStats();
      pushNotif(`${state.seats[seatId]?.name}  →  ${STATUS_LABEL[newStatus]}`);
    } else {
      pushNotif(`⚠ ${data.error}`, true);
    }
  } catch { pushNotif('⚠ 網路錯誤', true); }
}

// ── 座位格建立 ───────────────────────────────────────────────
function buildGrid() {
  const grid = document.getElementById('seat-grid');
  grid.innerHTML = '';
  ROWS.forEach(row => {
    COLS.forEach(col => {
      const seatId = `${row}${col}`;
      const card   = document.createElement('div');
      card.className   = 'seat-card';
      card.dataset.seat = seatId;
      card.innerHTML = `<span class="seat-id-label">${seatId}</span>`;
      card.addEventListener('click', () => {
        if (state.teacherMode) openMenu(seatId);
      });
      grid.appendChild(card);
    });
  });
}

function renderSeatCard(seatId) {
  const el   = document.querySelector(`[data-seat="${seatId}"]`);
  const seat = state.seats[seatId];
  if (!el) return;

  if (!seat?.student_id) {
    el.className       = 'seat-card';
    el.dataset.status  = '';
    el.innerHTML       = `<span class="seat-id-label">${seatId}</span>`;
    return;
  }

  const status = seat.status ?? 'EXPECTED';
  el.className      = 'seat-card has-student' + (state.teacherMode ? ' teacher-mode' : '');
  el.dataset.status = status;

  const badge = badgeText(status);
  el.innerHTML = `
    <span class="seat-class">${seat.class ?? ''}</span>
    <span class="seat-name">${seat.name ?? ''}</span>
    ${badge ? `<span class="seat-badge">${badge}</span>` : ''}
  `;
}

function applySeatUpdate(seatId, newStatus, student) {
  if (state.seats[seatId]) {
    state.seats[seatId].status = newStatus;
    if (student?.name)  state.seats[seatId].name  = student.name;
    if (student?.class) state.seats[seatId].class = student.class;
  }
  renderSeatCard(seatId);
}

function badgeText(status) {
  return { LATE: '遲到', OUT: '外出中', EXCUSED: '請假', ABSENT: '曠課' }[status] ?? null;
}

// ── 統計 ─────────────────────────────────────────────────────
function updateStats() {
  const all      = Object.values(state.seats).filter(s => s.student_id);
  const expected = all.length;
  const present  = all.filter(s => ['PRESENT','LATE','OUT'].includes(s.status)).length;
  const absent   = all.filter(s => ['EXPECTED','ABSENT'].includes(s.status)).length;

  document.getElementById('stat-expected').textContent = expected;
  document.getElementById('stat-present').textContent  = present;
  document.getElementById('stat-absent').textContent   = absent;
}

// ── 資料載入 ─────────────────────────────────────────────────
async function loadSeats() {
  try {
    const res  = await fetch('/api/seats/today');
    const data = await res.json();

    const d = new Date();
    const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    document.getElementById('current-date').textContent = dateStr;

    state.sessionOpen = data.session_open;
    document.getElementById('left-panel').classList.toggle('session-open', data.session_open);
    updateHint(data.session_open ? null : '請感應卡片簽到');

    (data.seats ?? []).forEach(seat => { state.seats[seat.seat] = seat; });
    ROWS.forEach(r => COLS.forEach(c => renderSeatCard(`${r}${c}`)));
    updateStats();
  } catch {
    // 靜默重試
  }
}

function updateHint(msg) {
  if (msg) document.getElementById('scan-hint').textContent = msg;
}

// ── 通知框 ───────────────────────────────────────────────────
function pushNotif(msg, isError = false) {
  notifItems.unshift({ msg, isError, ts: Date.now() });
  if (notifItems.length > 5) notifItems.pop();

  const box = document.getElementById('notif-content');
  box.innerHTML = notifItems.map(item =>
    `<div class="notif-item${item.isError ? ' error' : ''}">${item.msg}</div>`
  ).join('');
}

// ── 初始化 ───────────────────────────────────────────────────
buildGrid();
startClock();
loadSeats();
setInterval(loadSeats, 10_000);
