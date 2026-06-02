import { Env } from '../types';
import { getSession } from '../lib/db';
import { getTodayString } from '../lib/time';

export async function handleGetSession(_req: Request, env: Env): Promise<Response> {
  const today = getTodayString();
  const session = await getSession(env.DB, today);
  return Response.json({ session });
}
