import { Env } from '../types';
import { findTeacherByCard } from '../lib/db';

interface TeacherRow {
  card_id: string;
  name: string;
}

export async function handleSyncTeachers(request: Request, env: Env): Promise<Response> {
  // 驗證：必須是老師才能觸發同步
  const body = await request.json<{ teacher_card_id?: string }>();
  if (!body.teacher_card_id) {
    return Response.json({ error: 'MISSING_TEACHER_CARD' }, { status: 400 });
  }

  const teacher = await findTeacherByCard(env.DB, body.teacher_card_id);
  if (!teacher) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 403 });
  }

  // 從 Apps Script 取得最新教師名單
  const url = `${env.APPS_SCRIPT_URL}?action=teachers`;
  const res = await fetch(url, { redirect: 'follow' });

  if (!res.ok) {
    return Response.json({ error: 'APPS_SCRIPT_ERROR', status: res.status }, { status: 502 });
  }

  const data = await res.json<{ teachers?: TeacherRow[]; error?: string }>();

  if (data.error) {
    return Response.json({ error: data.error }, { status: 502 });
  }

  const teachers = data.teachers ?? [];
  if (teachers.length === 0) {
    return Response.json({ error: 'EMPTY_TEACHER_LIST' }, { status: 400 });
  }

  // 清空舊資料並重新寫入（保留目前操作者，避免把自己刪掉）
  await env.DB.prepare('DELETE FROM teachers').run();

  const stmts = teachers.map((t) =>
    env.DB.prepare('INSERT OR REPLACE INTO teachers VALUES (?, ?)').bind(t.card_id, t.name),
  );
  await env.DB.batch(stmts);

  return Response.json({ synced: teachers.length, teachers });
}
