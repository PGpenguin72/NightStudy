CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  card_id       TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  class         TEXT NOT NULL,
  class_no      INTEGER NOT NULL,
  enrolled_days TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  card_id TEXT PRIMARY KEY,
  name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  weekday    TEXT NOT NULL,
  seat       TEXT NOT NULL,
  student_id TEXT REFERENCES students(id),
  PRIMARY KEY (weekday, seat)
);

CREATE TABLE IF NOT EXISTS sessions (
  date             TEXT PRIMARY KEY,
  weekday          TEXT NOT NULL,
  teacher_id       TEXT NOT NULL,
  opened_at        TEXT NOT NULL,
  closed_at        TEXT,
  checkin_deadline TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  date       TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id),
  seat       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'EXPECTED',
  checkin_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, student_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  student_id   TEXT REFERENCES students(id),
  event_type   TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  teacher_id   TEXT,
  old_status   TEXT,
  new_status   TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_date    ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_events_date        ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_student     ON events(student_id);
CREATE INDEX IF NOT EXISTS idx_seat_weekday       ON seat_assignments(weekday);
