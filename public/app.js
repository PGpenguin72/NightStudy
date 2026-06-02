'use strict';

const ROWS = ['A','B','C','D','E','F','G','H'];
const COLS = [1,2,3,4,5,6];

const MANUAL_OPTS = [
  { v: 'PRESENT', label: '✓ 準時抵達' },
  { v: 'LATE',    label: '⏰ 遲到'     },
  { v: 'OUT',     label: '🚶 暫時外出' },
  { v: 'EXCUSED', label: '📋 請假'     },
  { v: 'ABSENT',  label: '✗ 曠課'      },
];

const STATUS_TXT = {
  PRESENT:'準時抵達', LATE:'遲到', OUT:'外出中',
  EXCUSED:'請假', ABSENT:'曠課', EXPECTED:'應到未到',
};

const BADGE_TXT = { LATE:'遲到', OUT:'外出中', EXCUSED:'請假', ABSENT:'曠課' };

const ERR_TXT = {
  SESSION_NOT_OPEN:'課程尚未開始',
  UNKNOWN_CARD:'未知卡號',
  NOT_ENROLLED_TODAY:'今日未報名',
};

// ── state ──────────────────────────────────────────────────
const S = { seats:{}, teacherMode:false, teacherCardId:null, logs:[] };

// ── DOM refs ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const leftPanel   = $('left-panel');
const sessionDot  = $('session-dot');
const dateLine    = $('date-line');
const timeLine    = $('time-line');
const hintBar     = $('hint-bar');
const logList     = $('log-list');
const teacherBar  = $('teacher-bar');
const sExpected   = $('s-expected');
const sPresent    = $('s-present');
const sAbsent     = $('s-absent');
const overlay     = $('overlay');
const menuTitle   = $('menu-title');
const menuOpts    = $('menu-opts');

// ── 時鐘 ────────────────────────────────────────────────────
(function clock() {
  const pad = n => String(n).padStart(2,'0');
  function tick() {
    const t  = new Date();
    const y  = t.getFullYear();
    const mo = pad(t.getMonth()+1);
    const d  = pad(t.getDate());
    const wk = ['日','一','二','三','四','五','六'][t.getDay()];
    dateLine.textContent = `${y}/${mo}/${d}（星期${wk}）`;
    timeLine.textContent = `${pad(t.getHours())}：${pad(t.getMinutes())}：${pad(t.getSeconds())}`;
  }
  tick();
  setInterval(tick, 1000);
})();

// ── 卡機輸入 ─────────────────────────────────────────────────
let buf = '', bufTimer = null;
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const card = buf.trim();
    buf = '';
    clearTimeout(bufTimer);
    if (card) processCard(card);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    buf += e.key;
    clearTimeout(bufTimer);
    bufTimer = setTimeout(() => { buf = ''; }, 1500);
  }
});

async function processCard(cardId) {
  try {
    const r = await fetch('/api/swipe', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ card_id: cardId }),
    });
    const d = await r.json();

    if (d.type === 'SESSION_OPENED') {
      S.teacherCardId = cardId;
      setSessionOpen(true);
      log(`✅ Session 開啟 — ${d.teacher.name}`);
      await loadSeats();

    } else if (d.type === 'TEACHER_MODE') {
      S.teacherCardId = cardId;
      toggleTeacher(d.teacher.name);

    } else if (d.type === 'STATUS_UPDATED') {
      mergeSeat(d.seat, { status: d.new_status, ...d.student });
      renderCard(d.seat);
      refreshStats();
      log(`${d.student.name}（${d.seat}） ${STATUS_TXT[d.new_status] ?? d.new_status}`);

    } else if (d.type === 'NO_CHANGE') {
      log(`⚠ 無法變更（${STATUS_TXT[d.status]}）`, true);

    } else if (d.error) {
      log(`⚠ ${ERR_TXT[d.error] ?? d.error}`, true);
    }
  } catch {
    log('⚠ 網路錯誤', true);
  }
}

// ── Session ──────────────────────────────────────────────────
function setSessionOpen(open) {
  leftPanel.classList.toggle('on', open);
  sessionDot.classList.toggle('active', open);
  if (!open) hintBar.textContent = '請感應卡片簽到';
}

// ── 老師模式 ─────────────────────────────────────────────────
function toggleTeacher(name) {
  S.teacherMode = !S.teacherMode;
  teacherBar.classList.toggle('hidden', !S.teacherMode);
  document.querySelectorAll('.sc.occupied').forEach(el => {
    el.classList.toggle('clickable', S.teacherMode);
  });
  log(S.teacherMode ? `🔑 管理模式 — ${name}` : '✓ 退出管理模式');
}

// ── 座位 CRUD ────────────────────────────────────────────────
function mergeSeat(seatId, data) {
  if (!S.seats[seatId]) S.seats[seatId] = { seat: seatId };
  Object.assign(S.seats[seatId], data);
}

function renderCard(seatId) {
  const el   = document.querySelector(`[data-id="${seatId}"]`);
  const seat = S.seats[seatId];
  if (!el) return;

  if (!seat?.student_id) {
    el.className   = 'sc';
    el.dataset.s   = '';
    el.innerHTML   = `<span class="sc-empty-id">${seatId}</span>`;
    return;
  }

  const st = seat.status ?? 'EXPECTED';
  el.dataset.s = st;
  el.className = 'sc occupied' + (S.teacherMode ? ' clickable' : '');
  const badge  = BADGE_TXT[st] ? `<span class="sc-badge">${BADGE_TXT[st]}</span>` : '';

  el.innerHTML = `
    <span class="sc-seat-id">${seatId}</span>
    <span class="sc-class">${seat.class ?? ''}</span>
    <span class="sc-name">${seat.name ?? ''}</span>
    ${badge}
  `;
}

function renderAll() {
  ROWS.forEach(r => COLS.forEach(c => renderCard(`${r}${c}`)));
}

function refreshStats() {
  const all  = Object.values(S.seats).filter(s => s.student_id);
  const pres = all.filter(s => ['PRESENT','LATE','OUT'].includes(s.status)).length;
  const abs  = all.filter(s => ['EXPECTED','ABSENT'].includes(s.status)).length;
  sExpected.textContent = all.length;
  sPresent.textContent  = pres;
  sAbsent.textContent   = abs;
}

// ── 格子建立 ─────────────────────────────────────────────────
function buildGrid() {
  const grid = $('seat-grid');
  grid.innerHTML = '';
  ROWS.forEach(r => {
    COLS.forEach(c => {
      const id  = `${r}${c}`;
      const div = document.createElement('div');
      div.className  = 'sc';
      div.dataset.id = id;
      div.innerHTML  = `<span class="sc-empty-id">${id}</span>`;
      div.addEventListener('click', () => { if (S.teacherMode) openMenu(id); });
      grid.appendChild(div);
    });
  });
}

// ── 選單 ─────────────────────────────────────────────────────
function openMenu(seatId) {
  const seat = S.seats[seatId];
  if (!seat?.student_id) return;
  menuTitle.textContent = `${seat.name}（${seatId} · ${seat.class}）`;
  menuOpts.innerHTML = '';
  MANUAL_OPTS.forEach(({ v, label }) => {
    const btn = document.createElement('button');
    btn.className = 'mopt' + (seat.status === v ? ' current' : '');
    btn.textContent = label;
    btn.onclick = async () => { closeMenu(); await applyManual(seat.student_id, v, seatId); };
    menuOpts.appendChild(btn);
  });
  overlay.classList.remove('hidden');
}

function closeMenu() { overlay.classList.add('hidden'); }
overlay.addEventListener('click', e => { if (e.target === overlay) closeMenu(); });
$('menu-cancel').addEventListener('click', closeMenu);

async function applyManual(studentId, newStatus, seatId) {
  try {
    const r = await fetch('/api/manual', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ teacher_card_id: S.teacherCardId, student_id: studentId, new_status: newStatus }),
    });
    const d = await r.json();
    if (!d.error) {
      mergeSeat(seatId, { status: newStatus });
      renderCard(seatId);
      refreshStats();
      log(`${S.seats[seatId]?.name}（${seatId}） → ${STATUS_TXT[newStatus]}`);
    } else { log(`⚠ ${d.error}`, true); }
  } catch { log('⚠ 網路錯誤', true); }
}

// ── 通知 ─────────────────────────────────────────────────────
function log(msg, err = false) {
  S.logs.unshift({ msg, err });
  if (S.logs.length > 6) S.logs.pop();
  logList.innerHTML = S.logs
    .map(l => `<div class="log-row${l.err?' err':''}">${l.msg}</div>`)
    .join('');
}

// ── 資料載入 ─────────────────────────────────────────────────
async function loadSeats() {
  try {
    const r = await fetch('/api/seats/today');
    const d = await r.json();
    setSessionOpen(d.session_open);
    (d.seats ?? []).forEach(s => mergeSeat(s.seat, s));
    renderAll();
    refreshStats();
  } catch { /* 靜默重試 */ }
}

// ── 啟動 ─────────────────────────────────────────────────────
buildGrid();
loadSeats();
setInterval(loadSeats, 10_000);
