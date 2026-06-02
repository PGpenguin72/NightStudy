import { Env, AttendanceStatus } from '../types';
import { findTeacherByCard, getAttendance, getSession, updateAttendanceStatus, insertEvent } from '../lib/db';
import { getTodayString, getCurrentTimeString, getNowISO } from '../lib/time';

const VALID_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'OUT', 'EXCUSED', 'ABSENT', 'EXPECTED'];

export async function handleManual(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    teacher_card_id?: string;
    student_id?: string;
    new_status?: AttendanceStatus;
    note?: string;
  }>();

  const { teacher_card_id, student_id, new_status, note } = body;
  if (!teacher_card_id || !student_id || !new_status) {
    return Response.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(new_status)) {
    return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const teacher = await findTeacherByCard(env.DB, teacher_card_id);
  if (!teacher) return Response.json({ error: 'UNAUTHORIZED' }, { status: 403 });

  const today = getTodayString();
  const now = getNowISO();
  const currentTime = getCurrentTimeString();

  const [session, attendance] = await Promise.all([
    getSession(env.DB, today),
    getAttendance(env.DB, today, student_id),
  ]);

  if (!session) return Response.json({ error: 'NO_SESSION' }, { status: 403 });
  if (!attendance) return Response.json({ error: 'NOT_ENROLLED' }, { status: 404 });

  const oldStatus = attendance.status;
  const isFirstCheckin =
    !attendance.checkin_at && (new_status === 'PRESENT' || new_status === 'LATE');

  await updateAttendanceStatus(env.DB, today, student_id, new_status, isFirstCheckin ? currentTime : null);
  await insertEvent(
    env.DB, today, student_id, 'MANUAL_OVERRIDE', 'teacher',
    teacher_card_id, oldStatus, new_status, note ?? null, now,
  );

  return Response.json({ student_id, old_status: oldStatus, new_status, updated_by: teacher.name });
}
