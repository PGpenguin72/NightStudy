import { Env, SeatRow } from '../types';
import { getTodaySeats, getSession } from '../lib/db';
import { getTodayString, getTodayWeekday } from '../lib/time';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLS = [1, 2, 3, 4, 5, 6];

export async function handleGetSeats(_req: Request, env: Env): Promise<Response> {
  const today = getTodayString();
  const weekday = getTodayWeekday();

  const [rawSeats, session] = await Promise.all([
    getTodaySeats(env.DB, today, weekday),
    getSession(env.DB, today),
  ]);

  const seatMap = new Map<string, SeatRow>(rawSeats.map((s) => [s.seat, s]));

  const seats = ROWS.flatMap((row) =>
    COLS.map((col) => {
      const id = `${row}${col}`;
      const s = seatMap.get(id);
      return {
        seat: id,
        student_id: s?.student_id ?? null,
        name: s?.name ?? null,
        class: s?.class ?? null,
        status: s?.student_id ? (s?.status ?? 'EXPECTED') : null,
        checkin_at: s?.checkin_at ?? null,
      };
    }),
  );

  return Response.json({
    date: today,
    weekday,
    session_open: !!session && !session.closed_at,
    seats,
  });
}
