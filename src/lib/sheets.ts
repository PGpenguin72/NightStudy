import { Env } from '../types';

export interface AttendanceRecord {
  date: string;
  student_id: string;
  seat: string;
  status: string;
  checkin_at: string | null;
  name: string;
  class: string;
  class_no: number;
  card_id: string;
}

export async function syncToSheets(env: Env, records: AttendanceRecord[], date: string): Promise<void> {
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, records }),
    redirect: 'follow',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script error ${res.status}: ${text}`);
  }

  const data = await res.json<{ success?: boolean; error?: string }>();
  if (data.error) throw new Error(`Apps Script: ${data.error}`);
}
