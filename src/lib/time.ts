const TW_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTaiwanDate(): Date {
  return new Date(Date.now() + TW_OFFSET_MS);
}

export function getTodayString(): string {
  return getTaiwanDate().toISOString().slice(0, 10);
}

export function getTodayWeekday(): string {
  const day = getTaiwanDate().getDay();
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
}

export function getCurrentTimeString(): string {
  return getTaiwanDate().toISOString().slice(11, 19);
}

export function getNowISO(): string {
  return new Date().toISOString();
}
