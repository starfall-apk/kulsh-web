// api/_usage.js — бесплатный лимит (Usage) и задел под баланс.
//
// Одна общая шкала очков на аккаунт, но каждая модель «тратит» её по-разному
// (см. points в api/_models.js). Гость ограничен 10 сообщениями в сутки и одной
// моделью. Хранение — Upstash Redis:
//   kulsh:u:{id}:usage:{YYYY-MM-DD}  → INCRBY, TTL 2 суток (само сбрасывается)
//   kulsh:u:{id}:balance             → целое, копейки (задел под платные тарифы)
//   kulsh:g:{guestId}:usage:{day}    → то же для гостя (id в подписанной cookie)
//
// Списание делается только после успешного ответа (см. api/chat.js).

import { getCookie, setCookie, signValue, readValue } from './_session.js';
import { backend, pipeline } from './_store.js';

export const GUEST_LIMIT = 10;    // сообщений в сутки для гостя
export const USER_LIMIT = 300;   // очков в сутки для залогиненного
export const GUEST_COOKIE = 'kulsh_guest';

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
// Ближайшая полночь по UTC — момент сброса лимита.
export function resetsAt() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

const usageKey = (kind, id, day) => kind === 'guest' ? `kulsh:g:${id}:usage:${day}` : `kulsh:u:${id}:usage:${day}`;
const balanceKey = (id) => `kulsh:u:${id}:balance`;
const limitFor = (kind) => kind === 'guest' ? GUEST_LIMIT : USER_LIMIT;

// Определяет id гостя по подписанной cookie; если её нет — создаёт новый id
// и возвращает строку Set-Cookie, которую нужно приложить к ответу.
export async function guestIdentity(req, env = process.env) {
  const secret = env.AUTH_SECRET || 'kulsh-guest-dev';
  const raw = getCookie(req, GUEST_COOKIE);
  let id = await readValue(raw, secret);
  if (id) return { id, setCookie: null };
  id = crypto.randomUUID();
  const value = await signValue(id, secret, 365);
  return { id, setCookie: setCookie(GUEST_COOKIE, value, { maxAge: 365 * 86400, req }) };
}

// Текущее состояние лимита. Если база не подключена — отдаём «безлимит»,
// чтобы сайт работал как раньше (только с локальной историей).
export async function readUsage(env, { kind, id }) {
  const limit = limitFor(kind);
  const base = { used: 0, limit, resetsAt: resetsAt(), balance: 0, guest: kind === 'guest', enabled: false };
  const b = backend(env);
  if (!b || !id) return base;
  try {
    const day = todayKey();
    const [usedRaw, balRaw] = await pipeline(b, [['GET', usageKey(kind, id, day)], ['GET', balanceKey(id)]]);
    return {
      ...base,
      enabled: true,
      used: Number(usedRaw) || 0,
      balance: Number(balRaw) || 0,
    };
  } catch {
    return base;
  }
}

// Хватает ли очков на запрос.
export function hasRoom(usage, points) {
  if (!usage.enabled) return true;           // базы нет — не ограничиваем
  return usage.used + points <= usage.limit;
}

// Списать очки после успешного ответа. Возвращает новое значение used.
export async function charge(env, { kind, id, points }) {
  const b = backend(env);
  if (!b || !id) return null;
  const day = todayKey();
  const key = usageKey(kind, id, day);
  try {
    const [used] = await pipeline(b, [['INCRBY', key, String(points)], ['EXPIRE', key, '172800']]);
    return Number(used) || 0;
  } catch {
    return null;
  }
}
