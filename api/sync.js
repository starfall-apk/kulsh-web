// api/sync.js — хранение чатов и настроек в аккаунте (а не в браузере).
// Хранилище: Upstash Redis через REST (без зависимостей). Подключается на Vercel:
//   Project → Storage → Marketplace → Upstash Redis → Connect.
// Vercel сам добавит KV_REST_API_URL и KV_REST_API_TOKEN (или UPSTASH_REDIS_REST_URL/TOKEN).
//
//   GET  /api/sync → { enabled, chats:[...], deleted:{id:ts}, settings, settingsAt }
//   POST /api/sync ← { chats:[...], deleted:{id:ts}, settings?, settingsAt? }
import { readSession } from './_session.js';
import { backend, pipeline } from './_store.js';

export const config = { runtime: 'edge' };

const MAX_BODY = 900 * 1024;      // лимит тела запроса Upstash (free) — 1 МБ
const MAX_SETTINGS = 20 * 1024;
const MAX_CHATS = 500;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// HGETALL в REST приходит плоским массивом [поле, значение, ...]
const toObj = (a) => {
  if (!a) return {};
  if (!Array.isArray(a)) return a;
  const o = {};
  for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1];
  return o;
};

export default async function handler(req) {
  const env = process.env;
  const b = backend(env);
  if (!b) return json({ enabled: false });
  const user = await readSession(req, env);
  if (!user || !user.id) return json({ error: 'unauthorized' }, 401);
  const base = `kulsh:u:${user.id}`;
  const CH = `${base}:chats`, META = `${base}:meta`;

  try {
    if (req.method === 'GET') {
      const [chatsRaw, metaRaw] = await pipeline(b, [['HGETALL', CH], ['HGETALL', META]]);
      const chats = [], meta = toObj(metaRaw), deleted = {};
      for (const v of Object.values(toObj(chatsRaw))) { try { chats.push(typeof v === 'string' ? JSON.parse(v) : v); } catch {} }
      for (const [k, v] of Object.entries(meta)) if (k.startsWith('del:')) deleted[k.slice(4)] = Number(v);
      let settings = null; try { settings = meta.settings ? JSON.parse(meta.settings) : null; } catch {}
      return json({ enabled: true, chats, deleted, settings, settingsAt: Number(meta.settingsAt) || 0 });
    }

    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
      let d; try { d = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
      const cmds = [];
      for (const c of Array.isArray(d.chats) ? d.chats.slice(0, 50) : []) {
        if (!c || !ID_RE.test(String(c.id))) continue;
        cmds.push(['HSET', CH, c.id, JSON.stringify(c)], ['HDEL', META, `del:${c.id}`]);
      }
      for (const [id, ts] of Object.entries(d.deleted && typeof d.deleted === 'object' ? d.deleted : {}).slice(0, 200)) {
        if (!ID_RE.test(id)) continue;
        cmds.push(['HDEL', CH, id], ['HSET', META, `del:${id}`, String(Number(ts) || Date.now())]);
      }
      if (d.settings && typeof d.settings === 'object') {
        const s = JSON.stringify(d.settings);
        if (s.length <= MAX_SETTINGS) cmds.push(['HSET', META, 'settings', s, 'settingsAt', String(Number(d.settingsAt) || Date.now())]);
      }
      if (cmds.length) await pipeline(b, cmds);
      const [n] = await pipeline(b, [['HLEN', CH]]);
      if (n > MAX_CHATS) return json({ ok: true, warning: 'too_many_chats' });
      return json({ ok: true });
    }
    return json({ error: 'method' }, 405);
  } catch (e) {
    return json({ error: 'storage', detail: String(e.message || e).slice(0, 120) }, 502);
  }
}
