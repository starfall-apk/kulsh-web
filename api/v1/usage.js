// api/v1/usage.js — публичный API: состояние дневного лимита аккаунта.
//   GET /api/v1/usage   (Authorization: Bearer kulsh_sk_...)
import { resolveApiKey } from '../_apikeys.js';
import { readUsage } from '../_usage.js';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const userId = raw ? await resolveApiKey(process.env, raw) : null;
  if (!userId) return json({ error: 'invalid_key', message: 'API key is invalid or missing.' }, 401);

  const usage = await readUsage(process.env, { kind: 'user', id: userId });
  return json(usage);
}
