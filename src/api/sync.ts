import { Env } from '../types';
import { getTodayString, getNowISO } from '../lib/time';
import { syncToSheets, AttendanceRecord } from '../lib/sheets';

export async function handleSync(_req: Request | null, env: Env): Promise<Response> {
  const today = getTodayString();
  const now = getNowISO();

  await env.DB.prepare(`
    UPDATE attendance SET status = 'ABSENT'
    WHERE date = ? AND status = 'EXPECTED' AND synced = 0
  `).bind(today).run();

  await env.DB.prepare(`
    UPDATE sessions SET closed_at = ? WHERE date = ? AND closed_at IS NULL
  `).bind(now, today).run();

  const result = await env.DB.prepare(`
    SELECT
      a.date, a.student_id, a.seat, a.status, a.checkin_at,
      s.name, s.class, s.class_no, s.card_id
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    WHERE a.date = ? AND a.synced = 0
  `).bind(today).all<AttendanceRecord>();

  if (result.results.length === 0) {
    return Response.json({ message: 'Nothing to sync' });
  }

  try {
    await syncToSheets(env, result.results);
    await env.DB.prepare(`
      UPDATE attendance SET synced = 1 WHERE date = ? AND synced = 0
    `).bind(today).run();
    return Response.json({ message: 'Sync complete', count: result.results.length });
  } catch (err) {
    console.error('Sync failed:', err);
    return Response.json({ error: 'SYNC_FAILED', detail: String(err) }, { status: 500 });
  }
}
