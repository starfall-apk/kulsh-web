// api/skills.js — личные скиллы пользователя (markdown), хранятся в Upstash Redis.
// Встроенный каталог лежит в репозитории как статика (public/skills/*), а сюда
// попадает только то, что пользователь добавил сам.
//
//   GET    /api/skills              → { skills: [{ id, title, desc, content, createdAt }] }
//   POST   /api/skills  {id, title, desc?, content} → { skill }
//   DELETE /api/skills?id=...       → { ok: true }
//
// id — короткий идентификатор для вызова через @ в чате. Без пробелов и
// служебных символов (@, /, : и т.п.); буквы (в т.ч. кириллица), цифры, _ - .
// Требуется вход: у гостя личных скиллов нет.
import { readSession } from './_session.js';
import { backend, pipeline } from './_store.js';

export const config = { runtime: 'edge' };

const MAX_SKILLS = 20;
const MAX_TITLE = 60;
const MAX_DESC = 160;
const MAX_CONTENT = 20000;

// Русские буквы + любые \p{L}; запрещаем пробелы, @, /, :, кавычки и прочую служебку.
const ID_RE = /^[\p{L}\p{N}_.-]{1,32}$/u;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const skillsKey = (id) => `kulsh:u:${id}:skills`;

async function readSkills(b, id) {
  const [raw] = await pipeline(b, [['GET', skillsKey(id)]]);
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

async function writeSkills(b, id, arr) {
  await pipeline(b, [['SET', skillsKey(id), JSON.stringify(arr)]]);
}

// Приводим id к допустимому виду; если не выходит — берём из заголовка или рандом.
function normalizeId(raw, title, taken) {
  let id = String(raw || '').trim();
  if (!ID_RE.test(id)) {
    id = String(title || '').trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_.-]+/gu, '')
      .slice(0, 32);
  }
  if (!id || !ID_RE.test(id)) id = 'skill';
  if (taken.has(id)) {
    let i = 2;
    while (taken.has(`${id}-${i}`)) i++;
    id = `${id}-${i}`.slice(0, 32);
  }
  return id;
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
      const desc = String(body && body.desc || '').trim().slice(0, MAX_DESC);
      const content = String(body && body.content || '').trim().slice(0, MAX_CONTENT);
      if (!title || !content) return json({ error: 'empty' }, 400);

      const list = await readSkills(b, user.id);
      const taken = new Set(list.map((s) => s.id));
      const id = normalizeId(body && body.id, title, taken);
      const skill = { id, title, desc, content, createdAt: Date.now() };
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
