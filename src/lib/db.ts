import { Student, Teacher, Session, Attendance, SeatRow } from '../types';

export function findStudentByCard(db: D1Database, cardId: string): Promise<Student | null> {
  return db.prepare('SELECT * FROM students WHERE card_id = ?').bind(cardId).first<Student>();
}

export function findTeacherByCard(db: D1Database, cardId: string): Promise<Teacher | null> {
  return db.prepare('SELECT * FROM teachers WHERE card_id = ?').bind(cardId).first<Teacher>();
}

export function getSession(db: D1Database, date: string): Promise<Session | null> {
  return db.prepare('SELECT * FROM sessions WHERE date = ?').bind(date).first<Session>();
}

export async function createSession(
  db: D1Database,
  date: string,
  weekday: string,
  teacherCardId: string,
  openedAt: string,
  deadline: string,
): Promise<void> {
  await db.prepare(`
    INSERT INTO sessions (date, weekday, teacher_id, opened_at, checkin_deadline)
    VALUES (?, ?, ?, ?, ?)
  `).bind(date, weekday, teacherCardId, openedAt, deadline).run();
}

export function getAttendance(
  db: D1Database,
  date: string,
  studentId: string,
): Promise<Attendance | null> {
  return db
    .prepare('SELECT * FROM attendance WHERE date = ? AND student_id = ?')
    .bind(date, studentId)
    .first<Attendance>();
}

export async function updateAttendanceStatus(
  db: D1Database,
  date: string,
  studentId: string,
  status: string,
  checkinAt: string | null,
): Promise<void> {
  if (checkinAt) {
    await db
      .prepare('UPDATE attendance SET status = ?, checkin_at = ? WHERE date = ? AND student_id = ?')
      .bind(status, checkinAt, date, studentId)
      .run();
  } else {
    await db
      .prepare('UPDATE attendance SET status = ? WHERE date = ? AND student_id = ?')
      .bind(status, date, studentId)
      .run();
  }
}

export async function insertEvent(
  db: D1Database,
  date: string,
  studentId: string | null,
  eventType: string,
  triggeredBy: string,
  teacherId: string | null,
  oldStatus: string | null,
  newStatus: string | null,
  note: string | null,
  createdAt: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO events
        (date, student_id, event_type, triggered_by, teacher_id, old_status, new_status, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(date, studentId, eventType, triggeredBy, teacherId, oldStatus, newStatus, note, createdAt)
    .run();
}

export async function initTodayAttendance(
  db: D1Database,
  date: string,
  weekday: string,
): Promise<void> {
  const assignments = await db
    .prepare('SELECT * FROM seat_assignments WHERE weekday = ? AND student_id IS NOT NULL')
    .bind(weekday)
    .all<{ weekday: string; seat: string; student_id: string }>();

  const stmts = assignments.results.map((a) =>
    db
      .prepare(`
        INSERT OR IGNORE INTO attendance (date, student_id, seat, status)
        VALUES (?, ?, ?, 'EXPECTED')
      `)
      .bind(date, a.student_id, a.seat),
  );

  if (stmts.length > 0) await db.batch(stmts);
}

export async function getTodaySeats(
  db: D1Database,
  date: string,
  weekday: string,
): Promise<SeatRow[]> {
  const result = await db
    .prepare(`
      SELECT
        sa.seat,
        sa.student_id,
        s.name,
        s.class,
        a.status,
        a.checkin_at
      FROM seat_assignments sa
      LEFT JOIN students s ON sa.student_id = s.id
      LEFT JOIN attendance a
        ON sa.student_id IS NOT NULL
        AND a.student_id = sa.student_id
        AND a.date = ?
      WHERE sa.weekday = ?
      ORDER BY sa.seat
    `)
    .bind(date, weekday)
    .all<SeatRow>();

  return result.results;
}
