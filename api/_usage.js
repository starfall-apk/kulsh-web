// api/_usage.js — дневной лимит в токенах и задел под баланс.
//
// У каждого аккаунта одна общая шкала на сутки, измеряемая в токенах.
// Каждая модель «тратит» её по-разному (см. mult в api/_models.js).
// Гость получает маленький дневной бюджет и одну модель.
// Хранение — Upstash Redis:
//   kulsh:u:{id}:usage:{YYYY-MM-DD}  → INCRBY, TTL 2 суток (само сбрасывается)
//   kulsh:u:{id}:balance             → целое, копейки (задел под платные тарифы)
//   kulsh:g:{guestId}:usage:{day}    → то же для гостя (id в подписанной cookie)
//
// Списание делается только после успешного ответа (см. api/chat.js).
// Если у провайдера нет точного usage, токены оцениваются по длине текста.

import { getCookie, setCookie, signValue, readValue } from './_session.js';
import { backend, pipeline } from './_store.js';

export const GUEST_TOKEN_LIMIT = 15000;    // токенов в сутки для гостя
export const USER_TOKEN_LIMIT = 100000;    // токенов в сутки для залогиненного
export const GUEST_COOKIE = 'kulsh_guest';

// Грубая, но безопасная оценка: ~4 символа на токен (латиница/код),
// кириллица плотнее — поэтому делим на 3.5 и округляем вверх.
export function estimateTokens(text) {
  const n = String(text || '').length;
  return n ? Math.ceil(n / 3.5) : 0;
}

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
const limitFor = (kind) => kind === 'guest' ? GUEST_TOKEN_LIMIT : USER_TOKEN_LIMIT;

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
  const base = { used: 0, limit, unit: 'tokens', resetsAt: resetsAt(), balance: 0, guest: kind === 'guest', enabled: false };
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

// Хватает ли токенов на запрос.
export function hasRoom(usage, cost) {
  if (!usage.enabled) return true;           // базы нет — не ограничиваем
  return usage.used + Math.max(0, cost) <= usage.limit;
}

// Списать токены после успешного ответа. Возвращает новое значение used.
export async function charge(env, { kind, id, cost }) {
  const b = backend(env);
  if (!b || !id) return null;
  const day = todayKey();
  const key = usageKey(kind, id, day);
  const amount = Math.max(0, Math.round(cost));
  try {
    const [used] = await pipeline(b, [['INCRBY', key, String(amount)], ['EXPIRE', key, '172800']]);
    return Number(used) || 0;
  } catch {
    return null;
  }
}
