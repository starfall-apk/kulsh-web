// api/usage.js — состояние бесплатного лимита текущего пользователя.
//   GET /api/usage → { enabled, used, limit, resetsAt, balance, guest }
import { readSession } from './_session.js';
import { guestIdentity, readUsage } from './_usage.js';

export const config = { runtime: 'edge' };

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

export default async function handler(req) {
  const env = process.env;
  if (req.method !== 'GET') return json({ error: 'method' }, 405);

  const user = await readSession(req, env);
  let usage;
  let setCookie = null;
  if (user && user.id) {
    usage = await readUsage(env, { kind: 'user', id: user.id });
  } else {
    const g = await guestIdentity(req, env);
    setCookie = g.setCookie;
    usage = await readUsage(env, { kind: 'guest', id: g.id });
  }

  const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
  return json(usage, 200, headers);
}
