// api/_session.js — подписанные сессии без базы данных (HMAC-SHA256 в cookie).
// Файлы с "_" в api/ Vercel не превращает в endpoint — это просто модуль.

const enc = new TextEncoder();
const COOKIE = 'kulsh_session';
const DAY = 86400;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(user, secret, days = 30) {
  const payload = b64u(enc.encode(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + days * DAY })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64u(sig)}`;
}

export function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Возвращает объект пользователя или null (гость).
export async function readSession(req, env = process.env) {
  const secret = env.AUTH_SECRET;
  const raw = getCookie(req, COOKIE);
  if (!secret || !raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data.u || null;
  } catch { return null; }
}

export function setCookie(name, value, { maxAge = 30 * DAY, req } = {}) {
  const secure = req && new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Универсальная подпись произвольного значения (используется для id гостя и т.п.).
export async function signValue(value, secret, days = 365) {
  const payload = b64u(enc.encode(JSON.stringify({ v: value, exp: Math.floor(Date.now() / 1000) + days * DAY })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64u(sig)}`;
}

export async function readValue(raw, secret) {
  if (!secret || !raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data.v ?? null;
  } catch { return null; }
}

export const SESSION_COOKIE = COOKIE;
