// api/auth.js — вход через Google / GitHub (OAuth 2.0) и Telegram (Login Widget).
// Маршруты (см. rewrites в vercel.json):
//   GET  /api/auth/me                  → { user, providers, telegramBotId }
//   GET  /api/auth/start/:provider     → редирект на Google / GitHub
//   GET  /api/auth/callback/:provider  → обмен code на профиль, выдача сессии
//   POST /api/auth/telegram            → проверка подписи Telegram, выдача сессии
//   POST /api/auth/logout              → удаление сессии
import { signSession, readSession, setCookie, getCookie, SESSION_COOKIE } from './_session.js';

export const config = { runtime: 'edge' };

const STATE_COOKIE = 'kulsh_oauth_state';
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function origin(req, env) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

// Куда вернуть пользователя после входа. Принимаем только локальные пути.
function safeNext(raw) {
  const s = String(raw || '');
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '';
  if (!/^\/[\x20-\x7E]*$/.test(s)) return '';
  return s.slice(0, 300);
}
// Добавляет параметр к пути, сохраняя query и hash.
function withParam(path, key, value) {
  const [base, hash] = String(path).split('#');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${key}=${encodeURIComponent(value)}${hash ? '#' + hash : ''}`;
}

const PROVIDERS = {
  google: {
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    extra: { scope: 'openid profile email', prompt: 'select_account' },
    async profile(code, redirect, id, secret) {
      const t = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
      }).then((r) => r.json());
      if (!t.access_token) throw new Error('google_token');
      const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${t.access_token}` },
      }).then((r) => r.json());
      if (!u.sub) throw new Error('google_profile');
      // handle: для Google показываем e-mail, для остальных — @username.
      return { id: `google:${u.sub}`, name: u.name || 'Google user', avatar: u.picture || '', provider: 'google', handle: u.email || '' };
    },
  },
  github: {
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    authUrl: 'https://github.com/login/oauth/authorize',
    extra: { scope: 'read:user' },
    async profile(code, redirect, id, secret) {
      const t = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, client_id: id, client_secret: secret, redirect_uri: redirect }),
      }).then((r) => r.json());
      if (!t.access_token) throw new Error('github_token');
      const u = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${t.access_token}`, 'User-Agent': 'kulshgpt', Accept: 'application/vnd.github+json' },
      }).then((r) => r.json());
      if (!u.id) throw new Error('github_profile');
      return { id: `github:${u.id}`, name: u.name || u.login, avatar: u.avatar_url || '', provider: 'github', handle: u.login ? `@${u.login}` : '' };
    },
  },
};

const creds = (p, env) => PROVIDERS[p].env.map((k) => (env[k] || '').trim());
const isOn = (p, env) => !!env.AUTH_SECRET && creds(p, env).every(Boolean);
const tgOn = (env) => !!env.AUTH_SECRET && !!(env.TELEGRAM_BOT_TOKEN || '').includes(':');

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

function redirect(to, cookies = []) {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
}

async function verifyTelegram(data, token) {
  const { hash, ...rest } = data || {};
  if (!hash || !rest.id || !rest.auth_date) return false;
  if (Date.now() / 1000 - Number(rest.auth_date) > 86400) return false;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, enc.encode(check)));
  if (sig.length !== String(hash).length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ String(hash).charCodeAt(i);
  return diff === 0;
}

export default async function handler(req) {
  const env = process.env;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || url.pathname.split('/')[3] || '';
  const provider = url.searchParams.get('provider') || url.pathname.split('/')[4] || '';

  if (action === 'me') {
    return json({
      user: await readSession(req, env),
      providers: { google: isOn('google', env), github: isOn('github', env), telegram: tgOn(env) },
      telegramBotId: tgOn(env) ? env.TELEGRAM_BOT_TOKEN.split(':')[0] : null,
    });
  }

  if (action === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESSION_COOKIE, '', { maxAge: 0, req }) });
  }

  if (action === 'telegram' && req.method === 'POST') {
    if (!tgOn(env)) return json({ error: 'telegram_off' }, 400);
    let data; try { data = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    if (!(await verifyTelegram(data, env.TELEGRAM_BOT_TOKEN.trim()))) return json({ error: 'bad_signature' }, 401);
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Telegram user';
    const user = { id: `telegram:${data.id}`, name, avatar: data.photo_url || '', provider: 'telegram', handle: data.username ? `@${data.username}` : '' };
    return json({ user }, 200, { 'Set-Cookie': setCookie(SESSION_COOKIE, await signSession(user, env.AUTH_SECRET), { req }) });
  }

  const P = PROVIDERS[provider];
  const nextFromQuery = safeNext(url.searchParams.get('next'));
  if (!P || !isOn(provider, env)) return redirect(withParam(nextFromQuery || '/', 'auth_error', 'provider_off'));
  const [clientId, clientSecret] = creds(provider, env);
  const redirectUri = `${origin(req, env)}/api/auth/callback/${provider}`;

  if (action === 'start') {
    const state = b64rand();
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, ...P.extra });
    // next храним вместе со state, чтобы вернуть человека на исходную страницу.
    return redirect(`${P.authUrl}?${q}`, [setCookie(STATE_COOKIE, `${state}|${nextFromQuery}`, { maxAge: 600, req })]);
  }

  if (action === 'callback') {
    const clear = setCookie(STATE_COOKIE, '', { maxAge: 0, req });
    const [cookieState, cookieNext] = (getCookie(req, STATE_COOKIE) || '').split('|');
    const next = safeNext(cookieNext);
    const code = url.searchParams.get('code');
    if (!code || !url.searchParams.get('state') || url.searchParams.get('state') !== cookieState) {
      return redirect(withParam(next || '/', 'auth_error', 'state'), [clear]);
    }
    try {
      const user = await P.profile(code, redirectUri, clientId, clientSecret);
      return redirect(next || '/', [clear, setCookie(SESSION_COOKIE, await signSession(user, env.AUTH_SECRET), { req })]);
    } catch (e) {
      return redirect(withParam(next || '/', 'auth_error', e.message || 'failed'), [clear]);
    }
  }

  return json({ error: 'not_found' }, 404);
}

function b64rand() {
  const a = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
