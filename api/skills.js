// api/skills.js — личные скиллы пользователя (markdown), хранятся в Upstash Redis.
// Встроенный каталог лежит в репозитории как статика (public/skills/*), а сюда
// попадает только то, что пользователь добавил сам.
//
//   GET    /api/skills            → { skills: [{ id, title, content, createdAt }] }
//   POST   /api/skills  {title, content} → { skill }
//   DELETE /api/skills?id=...     → { ok: true }
//
// Требуется вход: у гостя личных скиллов нет.
import { readSession } from './_session.js';
import { backend, pipeline } from './_store.js';

export const config = { runtime: 'edge' };

const MAX_SKILLS = 20;
const MAX_TITLE = 60;
const MAX_CONTENT = 8000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const skillsKey = (id) => `kulsh:u:${id}:skills`;
const newId = () => 's_' + Math.random().toString(36).slice(2, 10);

async function readSkills(b, id) {
  const [raw] = await pipeline(b, [['GET', skillsKey(id)]]);
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

async function writeSkills(b, id, arr) {
  await pipeline(b, [['SET', skillsKey(id), JSON.stringify(arr)]]);
}

export default async function handler(req) {
  const env = process.env;
  const user = await readSession(req, env);
  if (!user || !user.id) return json({ error: 'auth_required' }, 401);

  const b = backend(env);
  if (!b) return json({ error: 'storage_off', skills: [] }, 200);

  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      return json({ skills: await readSkills(b, user.id) });
    }

    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
      const title = String(body && body.title || '').trim().slice(0, MAX_TITLE);
      const content = String(body && body.content || '').trim().slice(0, MAX_CONTENT);
      if (!title || !content) return json({ error: 'empty' }, 400);

      const list = await readSkills(b, user.id);
      const skill = { id: newId(), title, content, createdAt: Date.now() };
      const next = [skill, ...list].slice(0, MAX_SKILLS);
      await writeSkills(b, user.id, next);
      return json({ skill });
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      if (!id) return json({ error: 'no_id' }, 400);
      const list = await readSkills(b, user.id);
      await writeSkills(b, user.id, list.filter((s) => s.id !== id));
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: 'storage_error' }, 500);
  }

  return json({ error: 'method' }, 405);
}
