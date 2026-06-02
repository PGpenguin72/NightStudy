'use strict';

// 橫排字母（A-H，左→右），豎排數字（1-6，上→下）
const LETTERS  = ['A','B','C','D','E','F','G','H'];
const NUMBERS  = [1,2,3,4,5,6];
const WK   = ['日','一','二','三','四','五','六'];

const MANUAL_OPTS = [
  {v:'PRESENT', label:'✓ 準時抵達'},
  {v:'LATE',    label:'⏰ 遲到'},
  {v:'OUT',     label:'🚶 暫時外出'},
  {v:'EXCUSED', label:'📋 請假'},
  {v:'ABSENT',  label:'✗ 曠課'},
];

const S_TXT  = {PRESENT:'準時抵達',LATE:'遲到',OUT:'外出中',EXCUSED:'請假',ABSENT:'曠課',EXPECTED:'應到未到'};
const BADGE  = {LATE:'遲到',OUT:'外出中',EXCUSED:'請假',ABSENT:'曠課'};
const ERR_TXT= {SESSION_NOT_OPEN:'課程尚未開始',UNKNOWN_CARD:'未知卡號',NOT_ENROLLED_TODAY:'今日未報名'};

const S = { seats:{}, teacherMode:false, teacherCardId:null, logs:[] };

// ── DOM ─────────────────────────────────────────────────────
const $     = id => document.getElementById(id);
const panel = $('panel'), pil = $('status-pill'), hint = $('p-hint');
const pTime = $('p-time'), pDate = $('p-date');
const nExp  = $('n-expected'), nPres = $('n-present'), nAbs = $('n-absent');
const logList = $('p-log-list'), teacherBar = $('p-teacher');
const overlay = $('overlay'), smTitle = $('smenu-title'), smOpts = $('smenu-opts');
const btnRefresh = $('btn-refresh'), btnSyncTeachers = $('btn-sync-teachers');

// ── 時鐘 ─────────────────────────────────────────────────────
(function clock() {
  const pad = n => String(n).padStart(2,'0');
  function tick() {
    const t = new Date();
    pDate.textContent = `${t.getFullYear()}/${pad(t.getMonth()+1)}/${pad(t.getDate())} 星期${WK[t.getDay()]}`;
    pTime.textContent = `${pad(t.getHours())} : ${pad(t.getMinutes())} : ${pad(t.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);
})();

// ── 卡機輸入 ─────────────────────────────────────────────────
let buf='', bt=null;
document.addEventListener('keydown', e => {
  if (e.key==='Enter') {
    const c = buf.trim(); buf=''; clearTimeout(bt);
    if (c) processCard(c);
  } else if (e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    buf += e.key;
    clearTimeout(bt); bt = setTimeout(()=>{ buf=''; }, 1500);
  }
});

// ── 刷卡處理 ─────────────────────────────────────────────────
async function processCard(cardId) {
  try {
    const r = await fetch('/api/swipe',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({card_id: cardId}),
    });
    const d = await r.json();

    if (d.type === 'SESSION_OPENED') {
      S.teacherCardId = cardId;
      setSession(true);
      pushLog(`✅ Session 開啟 — ${d.teacher.name}`);
      await loadSeats();

    } else if (d.type === 'TEACHER_MODE') {
      S.teacherCardId = cardId;
      toggleTeacher(d.teacher.name);

    } else if (d.type === 'STATUS_UPDATED') {
      mergeSeat(d.seat, {status: d.new_status, name: d.student.name, class: d.student.class});
      drawCard(d.seat);
      calcStats();
      pushLog(`${d.student.name}（${d.seat}）  ${S_TXT[d.new_status]??d.new_status}`);

    } else if (d.error) {
      pushLog(`⚠ ${ERR_TXT[d.error]??d.error}`, true);
    }
  } catch { pushLog('⚠ 網路錯誤', true); }
}

// ── Session ──────────────────────────────────────────────────
function setSession(on) {
  panel.classList.toggle('on', on);
  pil.className = on ? 'online' : 'offline';
  pil.textContent = on ? '進行中' : '未開始';
  if (!on) hint.textContent = '感應卡片以簽到';
}

// ── 老師模式 ─────────────────────────────────────────────────
function toggleTeacher(name) {
  S.teacherMode = !S.teacherMode;
  teacherBar.classList.toggle('hidden', !S.teacherMode);
  document.querySelectorAll('.sc.occ').forEach(el =>
    el.classList.toggle('clickable', S.teacherMode)
  );
  pushLog(S.teacherMode ? `🔑 管理模式 — ${name}` : '✓ 退出管理模式');
}

// ── 座位資料 ─────────────────────────────────────────────────
function mergeSeat(id, data) {
  if (!S.seats[id]) S.seats[id] = {seat: id};
  Object.assign(S.seats[id], data);
}

function drawCard(id) {
  const el   = document.querySelector(`[data-id="${id}"]`);
  const seat = S.seats[id];
  if (!el) return;

  if (!seat?.student_id) {
    el.className       = 'sc empty';
    el.dataset.s       = '';
    el.innerHTML       = `<span class="sc-id-big">${id}</span>`;
    return;
  }

  const st  = seat.status ?? 'EXPECTED';
  const bdg = BADGE[st] ? `<span class="sc-badge">${BADGE[st]}</span>` : '';
  el.className  = 'sc occ' + (S.teacherMode ? ' clickable' : '');
  el.dataset.s  = st;
  el.innerHTML  = `
    <span class="sc-seatid">${id}</span>
    <span class="sc-class">${seat.class??''}</span>
    <span class="sc-name">${seat.name??''}</span>
    ${bdg}
  `;
}

function drawAll() {
  NUMBERS.forEach(n => LETTERS.forEach(l => drawCard(`${l}${n}`)));
}

function calcStats() {
  const all  = Object.values(S.seats).filter(s => s.student_id);
  const pres = all.filter(s => ['PRESENT','LATE','OUT'].includes(s.status)).length;
  const abs  = all.filter(s => ['EXPECTED','ABSENT'].includes(s.status)).length;
  nExp.textContent  = all.length;
  nPres.textContent = pres;
  nAbs.textContent  = abs;
}

// ── 格子建立 ─────────────────────────────────────────────────
function buildGrid() {
  const grid = $('seat-grid');
  grid.innerHTML = '';
  // 橫排字母（A-H），豎排數字（1-6）
  // DOM 順序：A1 B1 C1 D1 E1 F1 G1 H1 → A2 B2 … → A6 B6…H6
  NUMBERS.forEach(n => LETTERS.forEach(l => {
    const id  = `${l}${n}`;
    const div = document.createElement('div');
    div.className   = 'sc empty';
    div.dataset.id  = id;
    div.innerHTML   = `<span class="sc-id-big">${id}</span>`;
    div.addEventListener('click', () => { if (S.teacherMode) openMenu(id); });
    grid.appendChild(div);
  }));
}

// ── 選單 ─────────────────────────────────────────────────────
function openMenu(id) {
  const seat = S.seats[id];
  if (!seat?.student_id) return;
  smTitle.textContent = `${seat.name}（${id} · ${seat.class??''}班）`;
  smOpts.innerHTML = '';
  MANUAL_OPTS.forEach(({v, label}) => {
    const b = document.createElement('button');
    b.className = 'mopt' + (seat.status===v?' cur':'');
    b.textContent = label;
    b.onclick = async () => { closeMenu(); await applyManual(seat.student_id, v, id); };
    smOpts.appendChild(b);
  });
  overlay.classList.remove('hidden');
}

function closeMenu() { overlay.classList.add('hidden'); }
overlay.addEventListener('click', e => { if (e.target===overlay) closeMenu(); });
$('smenu-cancel').addEventListener('click', closeMenu);

async function applyManual(studentId, newStatus, id) {
  try {
    const r = await fetch('/api/manual',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({teacher_card_id: S.teacherCardId, student_id: studentId, new_status: newStatus}),
    });
    const d = await r.json();
    if (!d.error) {
      mergeSeat(id, {status: newStatus});
      drawCard(id); calcStats();
      pushLog(`${S.seats[id]?.name}（${id}）→ ${S_TXT[newStatus]}`);
    } else { pushLog(`⚠ ${d.error}`, true); }
  } catch { pushLog('⚠ 網路錯誤', true); }
}

// ── 通知 ─────────────────────────────────────────────────────
function pushLog(msg, err=false) {
  S.logs.unshift({msg, err});
  if (S.logs.length > 7) S.logs.pop();
  logList.innerHTML = S.logs
    .map(l => `<div class="log-row${l.err?' err':''}">${l.msg}</div>`)
    .join('');
}

// ── 資料載入 ─────────────────────────────────────────────────
async function loadSeats() {
  try {
    const r = await fetch('/api/seats/today');
    const d = await r.json();
    setSession(d.session_open);
    (d.seats??[]).forEach(s => mergeSeat(s.seat, s));
    drawAll(); calcStats();
  } catch {}
}

// ── 管理按鈕 ─────────────────────────────────────────────────
btnRefresh.addEventListener('click', async () => {
  btnRefresh.classList.add('loading');
  btnRefresh.textContent = '更新中…';
  await loadSeats();
  btnRefresh.classList.remove('loading');
  btnRefresh.textContent = '⟳ 立即更新';
  pushLog('✅ 座位資料已更新');
});

btnSyncTeachers.addEventListener('click', async () => {
  btnSyncTeachers.classList.add('loading');
  btnSyncTeachers.textContent = '同步中…';
  try {
    const r = await fetch('/api/admin/sync-teachers', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({teacher_card_id: S.teacherCardId}),
    });
    const d = await r.json();
    if (d.error) { pushLog(`⚠ 同步失敗：${d.error}`, true); }
    else { pushLog(`✅ 教師名單已同步（${d.synced} 筆）`); }
  } catch { pushLog('⚠ 同步失敗：網路錯誤', true); }
  btnSyncTeachers.classList.remove('loading');
  btnSyncTeachers.textContent = '☁ 同步教師名單';
});

// ── 啟動 ─────────────────────────────────────────────────────
buildGrid();
loadSeats();
setInterval(loadSeats, 10_000);
