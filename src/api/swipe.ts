import { Env } from '../types';
import {
  findStudentByCard,
  findTeacherByCard,
  getSession,
  createSession,
  getAttendance,
  updateAttendanceStatus,
  insertEvent,
  initTodayAttendance,
} from '../lib/db';
import { getTodayString, getTodayWeekday, getCurrentTimeString, getNowISO } from '../lib/time';
import { getStatusAfterSwipe, getEventType } from '../lib/stateMachine';

export async function handleSwipe(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ card_id?: string }>();
  if (!body.card_id) return Response.json({ error: 'MISSING_CARD_ID' }, { status: 400 });

  const today = getTodayString();
  const weekday = getTodayWeekday();
  const currentTime = getCurrentTimeString();
  const now = getNowISO();
  const cardId = body.card_id;

  const teacher = await findTeacherByCard(env.DB, cardId);
  if (teacher) {
    const session = await getSession(env.DB, today);

    if (!session) {
      await createSession(env.DB, today, weekday, cardId, currentTime, env.CHECKIN_DEADLINE);
      await initTodayAttendance(env.DB, today, weekday);
      await insertEvent(env.DB, today, null, 'SESSION_OPEN', 'card', cardId, null, null, null, now);
      return Response.json({ type: 'SESSION_OPENED', teacher, date: today, weekday });
    }

    await insertEvent(env.DB, today, null, 'SESSION_OPEN', 'card', cardId, null, null, 'teacher_mode_toggle', now);
    return Response.json({ type: 'TEACHER_MODE', teacher });
  }

  const student = await findStudentByCard(env.DB, cardId);
  if (!student) return Response.json({ error: 'UNKNOWN_CARD' }, { status: 404 });

  const session = await getSession(env.DB, today);
  if (!session || session.closed_at) {
    return Response.json({ error: 'SESSION_NOT_OPEN' }, { status: 403 });
  }

  const attendance = await getAttendance(env.DB, today, student.id);
  if (!attendance) return Response.json({ error: 'NOT_ENROLLED_TODAY' }, { status: 403 });

  const oldStatus = attendance.status;
  const newStatus = getStatusAfterSwipe(attendance, session.checkin_deadline, currentTime);

  if (newStatus === oldStatus) {
    return Response.json({ type: 'NO_CHANGE', student, seat: attendance.seat, status: oldStatus });
  }

  const eventType = getEventType(oldStatus, newStatus);
  const isFirstCheckin = eventType === 'CHECKIN' && !attendance.checkin_at;

  await updateAttendanceStatus(env.DB, today, student.id, newStatus, isFirstCheckin ? currentTime : null);
  await insertEvent(env.DB, today, student.id, eventType, 'card', null, oldStatus, newStatus, null, now);

  return Response.json({
    type: 'STATUS_UPDATED',
    student: { id: student.id, name: student.name, class: student.class },
    seat: attendance.seat,
    old_status: oldStatus,
    new_status: newStatus,
  });
}
