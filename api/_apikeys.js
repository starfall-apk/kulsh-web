// api/_apikeys.js — API-ключи аккаунта (для публичного API /api/v1).
//
// Ключ имеет вид `kulsh_sk_<base64url>`. В базе храним только SHA-256 хеш ключа
// (сам ключ показывается один раз при создании), поэтому утечка Redis не даёт
// доступа к API.
//
//   kulsh:u:{userId}:apikeys → JSON [{ id, name, prefix, hash, createdAt, lastUsed }]
//   kulsh:key:{hash}         → userId (для быстрого поиска по ключу)
import { backend, pipeline } from './_store.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashKey(key) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(String(key || '')));
  return hex(d);
}

export function newApiKey() {
  const a = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'kulsh_sk_' + b64;
}

const listKey = (id) => `kulsh:u:${id}:apikeys`;
const mapKey = (hash) => `kulsh:key:${hash}`;

async function readList(b, userId) {
  const [raw] = await pipeline(b, [['GET', listKey(userId)]]);
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

// Публичное представление ключа (без хеша) — для интерфейса.
const publicKey = (k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsed: k.lastUsed || 0 });

export async function listApiKeys(env, userId) {
  const b = backend(env);
  if (!b) return { enabled: false, keys: [] };
  try {
    const list = await readList(b, userId);
    return { enabled: true, keys: list.map(publicKey) };
  } catch {
    return { enabled: false, keys: [] };
  }
}

export async function createApiKey(env, userId, name) {
  const b = backend(env);
  if (!b) return { error: 'storage_off' };
  const list = await readList(b, userId);
  if (list.length >= 10) return { error: 'limit' };

  const raw = newApiKey();
  const hash = await hashKey(raw);
  const rec = {
    id: 'k_' + Math.random().toString(36).slice(2, 10),
    name: String(name || 'Ключ').trim().slice(0, 40) || 'Ключ',
    prefix: raw.slice(0, 14) + '…',
    hash,
    createdAt: Date.now(),
    lastUsed: 0,
  };
  const next = [rec, ...list];
  await pipeline(b, [
    ['SET', listKey(userId), JSON.stringify(next)],
    ['SET', mapKey(hash), userId],
  ]);
  // Сам ключ отдаём один раз — потом его не восстановить.
  return { key: publicKey(rec), secret: raw };
}

export async function revokeApiKey(env, userId, keyId) {
  const b = backend(env);
  if (!b) return { error: 'storage_off' };
  const list = await readList(b, userId);
  const rec = list.find((k) => k.id === keyId);
  const next = list.filter((k) => k.id !== keyId);
  const cmds = [['SET', listKey(userId), JSON.stringify(next)]];
  if (rec && rec.hash) cmds.push(['DEL', mapKey(rec.hash)]);
  await pipeline(b, cmds);
  return { ok: true };
}

// Разрешает ключ в userId. Возвращает null, если ключ неверный/отозван.
export async function resolveApiKey(env, rawKey) {
  const key = String(rawKey || '').trim();
  if (!key.startsWith('kulsh_sk_')) return null;
  const b = backend(env);
  if (!b) return null;
  try {
    const hash = await hashKey(key);
    const [userId] = await pipeline(b, [['GET', mapKey(hash)]]);
    return userId || null;
  } catch {
    return null;
  }
}

// Отметка «последнее использование» — не критично, обновляем best-effort.
export async function touchApiKey(env, userId, rawKey) {
  const b = backend(env);
  if (!b) return;
  try {
    const hash = await hashKey(rawKey);
    const list = await readList(b, userId);
    const rec = list.find((k) => k.hash === hash);
    if (!rec) return;
    rec.lastUsed = Date.now();
    await pipeline(b, [['SET', listKey(userId), JSON.stringify(list)]]);
  } catch { /* не критично */ }
}
