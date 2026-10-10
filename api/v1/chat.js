// api/v1/chat.js — публичный API: стриминг ответа модели (Server-Sent Events).
//
//   POST /api/v1/chat
//   Authorization: Bearer kulsh_sk_...
//   { "model": "deepseek-v4.1-flash", "messages": [{ "role": "user", "content": "..." }],
//     "temperature": 0.9 }
//
// Ответ — поток `data: {...}` событий: { delta }, затем { done, usage } либо { error }.
// Лимиты общие с веб-чатом (см. api/_usage.js).
import { resolveApiKey, touchApiKey } from '../_apikeys.js';
import { runChat } from '../_chat-core.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) return json({ error: 'missing_key', message: 'Provide header: Authorization: Bearer <API_KEY>' }, 401);
  const userId = await resolveApiKey(process.env, raw);
  if (!userId) return json({ error: 'invalid_key', message: 'API key is invalid or revoked.' }, 401);

  touchApiKey(process.env, userId, raw).catch(() => {});

  const res = await runChat(req, { user: { id: userId }, api: true });
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
