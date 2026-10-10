// api/_store.js — тонкая прослойка над Upstash Redis (REST, без зависимостей).
// Всё общение с базой идёт через неё, поэтому хранилище при желании можно
// заменить (например, на Postgres), не трогая бизнес-логику.
//
// Подключение на Vercel: Project → Storage → Marketplace → Upstash Redis → Connect.
// Vercel сам добавит KV_REST_API_URL и KV_REST_API_TOKEN (или UPSTASH_* аналоги).

export function backend(env = process.env) {
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url, token } : null;
}

export async function pipeline(b, cmds) {
  const r = await fetch(`${b.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis_' + r.status);
  const out = await r.json();
  return out.map((x) => { if (x && x.error) throw new Error(x.error); return x ? x.result : null; });
}
