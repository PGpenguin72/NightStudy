import { Env } from './types';
import { handleSwipe } from './api/swipe';
import { handleGetSeats } from './api/seats';
import { handleManual } from './api/manual';
import { handleGetSession } from './api/session';
import { handleSync } from './api/sync';
import { handleSyncTeachers } from './api/syncTeachers';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(url.pathname, request.method, request, env);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleSync(null, env));
  },
};

async function handleApi(
  path: string,
  method: string,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    let res: Response;

    if (path === '/api/swipe' && method === 'POST') {
      res = await handleSwipe(request, env);
    } else if (path === '/api/seats/today' && method === 'GET') {
      res = await handleGetSeats(request, env);
    } else if (path === '/api/manual' && method === 'POST') {
      res = await handleManual(request, env);
    } else if (path === '/api/session/today' && method === 'GET') {
      res = await handleGetSession(request, env);
    } else if (path === '/api/sync' && method === 'POST') {
      res = await handleSync(request, env);
    } else if (path === '/api/admin/sync-teachers' && method === 'POST') {
      res = await handleSyncTeachers(request, env);
    } else {
      return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: CORS });
    }

    const headers = new Headers(res.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: 'INTERNAL_ERROR', detail: String(err) },
      { status: 500, headers: CORS },
    );
  }
}
