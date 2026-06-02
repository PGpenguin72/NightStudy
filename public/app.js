const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLS = [1, 2, 3, 4, 5, 6];

const STATUS_LABELS = {
  PRESENT: '準時抵達',
  LATE:    '遲到',
  OUT:     '外出中',
  EXCUSED: '請假',
  ABSENT:  '曠課',
};

const MANUAL_OPTIONS = [
  { value: 'PRESENT', label: '✓ 準時抵達' },
  { value: 'LATE',    label: '⏰ 遲到' },
  { value: 'OUT',     label: '🚶 暫時外出' },
  { value: 'EXCUSED', label: '📋 請假' },
  { value: 'ABSENT',  label: '✗ 曠課' },
];

const ERROR_MSGS = {
  SESSION_NOT_OPEN:  '課程尚未開始',
  UNKNOWN_CARD:      '未知卡號',
  NOT_ENROLLED_TODAY:'今日未報名',
};

let state = {
  seats: {},
  teacherMode: false,
  teacherCardId: null,
  sessionOpen: false,
};

let notifTimer = null;
let cardBuffer = '';
let cardTimer = null;

// ─── Card Reader ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const card = cardBuffer.trim();
    cardBuffer = '';
    clearTimeout(cardTimer);
    if (card.length > 0) processCard(card);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    cardBuffer += e.key;
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => { cardBuffer = ''; }, 1500);
  }
});

async function processCard(cardId) {
  try {
    const res = await fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    });
    const data = await res.json();

    if (data.type === 'SESSION_OPENED') {
      state.teacherCardId = cardId;
      state.sessionOpen = true;
      updateSessionBadge(true);
      showNotif(`Session 開啟 — ${data.teacher.name}`);
      await loadSeats();
    } else if (data.type === 'TEACHER_MODE') {
      state.teacherCardId = cardId;
      toggleTeacherMode();
    } else if (data.type === 'STATUS_UPDATED') {
      updateSeat(data.seat, data.new_status, data.student);
      showNotif(`${data.student.name}  ${STATUS_LABELS[data.new_status] ?? data.new_status}`);
    } else if (data.type === 'NO_CHANGE') {
      showNotif(`${data.status} — 無法由刷卡變更`, true);
    } else if (data.error) {
      showNotif(`⚠ ${ERROR_MSGS[data.error] ?? data.error}`, true);
    }
  } catch {
    showNotif('⚠ 網路錯誤', true);
  }
}

// ─── Teacher Mode ──────────────────────────────────────────
function toggleTeacherMode() {
  state.teacherMode = !state.teacherMode;
  const banner = document.getElementById('teacher-banner');
  banner.classList.toggle('visible', state.teacherMode);

  document.querySelectorAll('.seat-card').forEach((el) => {
    el.classList.toggle('teacher-mode', state.teacherMode);
  });

  showNotif(state.teacherMode ? '🔑 已進入管理模式' : '✓ 已退出管理模式');
}

function openStatusMenu(seatId) {
  const seat = state.seats[seatId];
  if (!seat || !seat.student_id) return;

  document.getElementById('menu-seat-label').textContent = `${seat.name}（${seatId}）`;

  const btnContainer = document.getElementById('menu-buttons');
  btnContainer.innerHTML = '';

  MANUAL_OPTIONS.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.className = 'menu-btn' + (seat.status === value ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      closeStatusMenu();
      await setManualStatus(seat.student_id, value, seatId);
    });
    btnContainer.appendChild(btn);
  });

  const overlay = document.getElementById('status-menu-overlay');
  overlay.classList.remove('hidden');
}

function closeStatusMenu() {
  document.getElementById('status-menu-overlay').classList.add('hidden');
}

document.getElementById('menu-close').addEventListener('click', closeStatusMenu);
document.getElementById('status-menu-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeStatusMenu();
});

async function setManualStatus(studentId, newStatus, seatId) {
  try {
    const res = await fetch('/api/manual', {
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
      const seat = state.seats[seatId];
      if (seat) seat.status = newStatus;
      updateSeatCard(seatId, newStatus);
      showNotif(`${state.seats[seatId]?.name}  →  ${STATUS_LABELS[newStatus] ?? newStatus}`);
    } else {
      showNotif(`⚠ ${data.error}`, true);
    }
  } catch {
    showNotif('⚠ 網路錯誤', true);
  }
}

// ─── Seat Rendering ────────────────────────────────────────
function buildGrid() {
  const grid = document.getElementById('seat-grid');
  grid.innerHTML = '';

  ROWS.forEach((row) => {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'row-label';
    rowLabel.textContent = row;
    grid.appendChild(rowLabel);

    COLS.forEach((col) => {
      const seatId = `${row}${col}`;
      const card = document.createElement('div');
      card.className = 'seat-card empty';
      card.dataset.seat = seatId;
      card.innerHTML = `<span class="seat-id">${seatId}</span>`;
      card.addEventListener('click', () => {
        if (state.teacherMode) openStatusMenu(seatId);
      });
      grid.appendChild(card);
    });
  });
}

function renderSeats(seats) {
  seats.forEach((seat) => {
    state.seats[seat.seat] = seat;
    updateSeatCard(seat.seat, seat.status, seat);
  });
}

function updateSeat(seatId, newStatus, student) {
  if (state.seats[seatId]) {
    state.seats[seatId].status = newStatus;
    if (student) {
      state.seats[seatId].name = student.name;
      state.seats[seatId].class = student.class;
    }
  }
  updateSeatCard(seatId, newStatus);
}

function updateSeatCard(seatId, status, seatData) {
  const el = document.querySelector(`[data-seat="${seatId}"]`);
  if (!el) return;

  const seat = seatData ?? state.seats[seatId];
  if (!seat) return;

  if (!seat.student_id) {
    el.className = 'seat-card empty';
    el.dataset.status = '';
    el.innerHTML = `<span class="seat-id">${seatId}</span>`;
    return;
  }

  el.className = 'seat-card' + (state.teacherMode ? ' teacher-mode' : '');
  el.dataset.status = status ?? 'EXPECTED';

  const badge = badgeFor(status, seat.checkin_at);
  el.innerHTML = `
    <span class="seat-id">${seatId}</span>
    <span class="seat-name">${seat.name ?? ''}</span>
    <span class="seat-class">${seat.class ?? ''}</span>
    ${badge ? `<span class="seat-badge">${badge}</span>` : ''}
    ${seat.checkin_at ? `<span class="seat-time">${seat.checkin_at.slice(0, 5)}</span>` : ''}
  `;
}

function badgeFor(status) {
  const map = {
    LATE:    '遲到',
    OUT:     '外出中',
    EXCUSED: '請假',
    ABSENT:  '曠課',
  };
  return map[status] ?? null;
}

// ─── Data Loading ──────────────────────────────────────────
async function loadSeats() {
  try {
    const res = await fetch('/api/seats/today');
    const data = await res.json();

    document.getElementById('current-date').textContent = data.date ?? '—';
    document.getElementById('current-weekday').textContent = data.weekday ?? '—';

    state.sessionOpen = data.session_open;
    updateSessionBadge(data.session_open);
    renderSeats(data.seats ?? []);
  } catch {
    // silent — will retry on next poll
  }
}

function updateSessionBadge(open) {
  document.getElementById('session-status').textContent = open ? '🟢 進行中' : '⚪ 未開始';
}

// ─── Notification ──────────────────────────────────────────
function showNotif(msg, isError = false) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.style.borderColor = isError ? '#dc2626' : '#334155';
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), isError ? 4000 : 2500);
}

// ─── Init ──────────────────────────────────────────────────
buildGrid();
loadSeats();
setInterval(loadSeats, 10_000);
