// api/keys.js — управление API-ключами аккаунта (для интерфейса).
// Требуется вход (cookie-сессия); сами ключи нужны для публичного API /api/v1.
//
//   GET    /api/keys            → { enabled, keys: [{ id, name, prefix, createdAt, lastUsed }] }
//   POST   /api/keys  {name}    → { key, secret }   (secret показывается один раз)
//   DELETE /api/keys?id=...     → { ok: true }
import { readSession } from './_session.js';
import { listApiKeys, createApiKey, revokeApiKey } from './_apikeys.js';

export const config = { runtime: 'edge' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export default async function handler(req) {
  const env = process.env;
  const user = await readSession(req, env);
  if (!user || !user.id) return json({ error: 'auth_required' }, 401);

  try {
    if (req.method === 'GET') {
      return json(await listApiKeys(env, user.id));
    }
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { body = {}; }
      const r = await createApiKey(env, user.id, body && body.name);
      if (r.error === 'limit') return json({ error: 'limit' }, 400);
      if (r.error) return json({ error: r.error }, 500);
      return json(r);
    }
    if (req.method === 'DELETE') {
      const id = new URL(req.url).searchParams.get('id') || '';
      if (!id) return json({ error: 'no_id' }, 400);
      const r = await revokeApiKey(env, user.id, id);
      if (r.error) return json({ error: r.error }, 500);
      return json({ ok: true });
    }
  } catch {
    return json({ error: 'storage_error' }, 500);
  }
  return json({ error: 'method' }, 405);
}
