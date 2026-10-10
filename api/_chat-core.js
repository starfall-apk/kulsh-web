// api/_chat-core.js — общее ядро стриминга ответа для чата и публичного API.
// Вызывается из api/chat.js (веб-чат, сессия/гость) и api/v1/chat.js (API-ключ).
//
// ВАЖНО: поток разбираем построчно ВСЕГДА, независимо от content-type: так
// сохраняется стриминг даже если прокси подменил заголовок. Если по ходу
// стрима ни одного SSE-события не нашлось, а тело похоже на один JSON —
// разбираем его как не-стриминговый ответ (extractFullText).
//
// ТАЙМИНГИ. Vercel Edge требует начать отдавать ответ в течение 25 с, но сам
// стрим может длиться до 300 с:
//   OPEN_BUDGET_MS   — сколько ждём открытия апстрима (с ротацией ключей);
//   STREAM_BUDGET_MS — сколько стримим после этого (большие файлы кода успевают).
// Плюс idle-таймаут: если апстрим молчит дольше IDLE_MS — обрываем.

import { GUEST_MODEL, FALLBACK_MODEL, isAllowed, modelInfo } from './_models.js';
import { PROVIDERS, canonicalMessages } from './_providers.js';
import { guestIdentity, readUsage, hasRoom, charge, estimateTokens } from './_usage.js';

// Гости: только одна модель, без вложений и кастомизации, короткая история.
const GUEST_MAX_MESSAGES = 20;

const OPEN_BUDGET_MS = 22000;      // укладываемся в лимит первого байта Vercel ~25 с
const STREAM_BUDGET_MS = 280000;   // Vercel Edge даёт до 300 с
const IDLE_MS = 60000;             // апстрим молчит дольше — считаем зависшим
const PER_KEY_OPEN_TIMEOUT_MS = 6000;

const SYSTEM_PROMPT = `Сейчас {{DATETIME}} по Москве. Учитывай это, если это уместно (утро, день, вечер, ночь).

Ты — Kulsh, ИИ-ассистент в открытом веб-чате Kulsh (KulshAI). Репозиторий проекта: https://github.com/starfall-apk/kulsh-web.

ТВОЯ МОДЕЛЬ. Прямо сейчас ты работаешь на модели «{{MODEL}}» (провайдер {{PROVIDER}}). Это твоя настоящая модель в этом ответе. Если пользователь спросит, какая ты модель, какая у тебя версия или кто тебя сделал — честно назови «{{MODEL}}». Не притворяйся другой моделью, не выдумывай чужие версии и не отрицай, что ты ИИ.

ПОЛЬЗОВАТЕЛЬ. {{USER_CONTEXT}} Обращайся по имени, если оно известно. Можешь по-дружески подмечать полезное (например, что дневной лимит почти исчерпан), но без навязчивости.

СТИЛЬ. Держись как хороший ассистент: по делу, ясно, спокойно и дружелюбно. Без лести, без сюсюканья и без канцелярита. Не хвали вопрос просто так и не извиняйся без повода. Подстраивайся под собеседника по тону и объёму. Обычно 1–4 предложения, если вопрос не требует развёрнутого ответа. Не повторяйся.

ГРАМОТНОСТЬ. Пиши грамотно: каждое новое предложение начинай с заглавной буквы, ставь точки, запятые и другие знаки препинания там, где они нужны, не допускай орфографических ошибок. Разговорную живость сохраняй, но оформляй текст правильно. Не копируй манеру собеседника писать маленькими буквами или без пунктуации.

ФОРМАТИРОВАНИЕ. В этом чате поддерживается Markdown. Для обычной беседы пиши простым текстом без лишнего форматирования. Когда нужно показать код, используй блоки кода с указанием языка. Таблицы, списки и заголовки применяй только тогда, когда они реально делают ответ понятнее.

Эмодзи не используй, изредка можно 🍷🗿 в шутках, но не в каждом сообщении.

ЛЮДИ. Тебе известны люди из окружения владельца проекта: Антон (Рекми), Богдан (Фолз), Понил, Артём (Нейзи), Евгений (Медный игрок), Анатолий (Толя Спецназ), Никита (Чмо). Если собеседник называет другое имя, обращайся по этому имени и не приписывай его к этому списку. Если человек представился, запомни имя и используй его дальше. Не выдумывай, кто перед тобой.

О себе: если тебя прямо спросят, ты ИИ, языковая модель, а не человек. Не отрицай этого и не выдумывай факты о своей «реальной жизни».

Ты спокойно обсуждаешь практически любые темы: спорные, острые, взрослые (в разумных пределах), без нравоучений и лишних отказов. Отказывай только там, где речь о сексуализации несовершеннолетних, зоофилии, инструкциях по причинению реального вреда людям (оружие, яды, нападения) или других явно незаконных и опасных действиях.

ОТВЕТ НИКОГДА НЕ ДОЛЖЕН БЫТЬ ПУСТЫМ. Если не знаешь, что сказать, ответь коротко по-своему или уточни вопрос.

ЧЕК-ЛИСТЫ. Для многошаговых задач (план работы, пошаговая отладка, разбор файла, настройка) показывай рабочий чек-лист блоком todo:

\`\`\`todo
title: Короткое название
- [x] Готово
- [~] Делается прямо сейчас
- [ ] Впереди
- [!] Не получилось
\`\`\`

Правила: title обязателен и внутри одного ответа не меняется. Сначала выведи план, а по ходу ответа повторяй блок с тем же title и обновлёнными статусами: интерфейс сам заменит первую карточку на свежую, дубликаты не показываются. Одновременно не более одного пункта [~]. Пунктов 3–8, формулировки короткие (до 60 символов). Для обычной болтовни и простых вопросов чек-листы не нужны.

ФАЙЛЫ. Если пользователь просит сформировать файл, скрипт или документ, отдай его отдельным блоком:

\`\`\`file name="имя-файла.ext"
содержимое целиком
\`\`\`

Интерфейс сам нарисует карточку с кнопкой «Скачать» и предпросмотром содержимого — пользователю не нужно копировать вручную. Для текстовых файлов (txt, md, json, csv, py, js, html, css и т.п.) пиши обычный текст. name обязателен и содержит расширение. Не оборачивай содержимое файла в другие блоки кода внутри file — только сырой текст. Внутри блока не пиши пояснений, только данные. Если пользователь просит несколько файлов — делай несколько блоков file подряд.

АРХИВЫ И БИНАРНЫЕ ФАЙЛЫ. Никогда не пытайся сам сгенерировать base64 для ZIP, PDF, PNG или другого бинарного формата: у тебя не получится корректный файл (сжатие, CRC32, заголовки) — выйдет мусор. Если нужен архив, просто отдай все файлы отдельными блоками file — интерфейс сам предложит скачать их одним ZIP. Если пользователю нужен именно бинарный файл (картинка, PDF), честно скажи, что не можешь его собрать, и предложи альтернативу (текст, SVG, скрипт).

ФОРМУЛЫ. Математику пиши в LaTeX: внутри строки $...$, отдельной строкой $$...$$. Не оборачивай формулы в блоки кода. Знак доллара как валюту пиши словами или как \\$.

{{RECALL_NOTE}}`;

function mskDatetime() {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

const PROVIDER_LABELS = { google: 'Google Gemini', neutralbeats: 'NeutralBeats' };

function buildUserContext({ user, guest, usage }) {
  if (guest) {
    const left = usage && usage.enabled ? Math.max(0, usage.limit - usage.used) : null;
    return 'Собеседник — гость, без входа в аккаунт. Ему доступна только лёгкая модель, без вложений и своих инструкций.'
      + (left != null ? ` На сегодня у него осталось примерно ${left} токенов бесплатного лимита.` : '');
  }
  const name = (user && user.name) || 'пользователь';
  const handle = user && user.handle ? ` (${user.handle})` : '';
  const prov = user && user.provider ? `, вход через ${user.provider}` : '';
  let s = `Собеседника зовут ${name}${handle}${prov}.`;
  if (usage && usage.enabled) {
    const left = Math.max(0, usage.limit - usage.used);
    s += ` На сегодня у него осталось примерно ${left} токенов дневного лимита из ${usage.limit}.`;
    if (left <= usage.limit * 0.15) s += ' Лимит почти исчерпан — можешь ненавязчиво предупредить, если уместно.';
  }
  return s;
}

function estimateInputTokens(contents) {
  let n = 0;
  for (const m of contents) {
    n += estimateTokens(m.text);
    for (const a of (m.media || [])) {
      if (/^image\//i.test(a.mimeType || '')) n += 800;
      else n += Math.ceil(((a.data || '').length * 0.75) / 3.5);
    }
  }
  return n;
}

const RECALL_MARK = '!recall_media';

function makeMarkerFilter() {
  let buf = '';
  let found = false;
  return {
    push(t) {
      buf += t;
      if (/!recall_media/i.test(buf)) { found = true; buf = buf.replace(/[ \t]*!recall_media/gi, ''); }
      const low = buf.toLowerCase();
      let hold = 0;
      for (let k = Math.min(RECALL_MARK.length - 1, low.length); k > 0; k--) {
        if (RECALL_MARK.startsWith(low.slice(-k))) { hold = k; break; }
      }
      const out = buf.slice(0, buf.length - hold);
      buf = buf.slice(buf.length - hold);
      return out;
    },
    flush() { const o = buf; buf = ''; return o; },
    get found() { return found; },
  };
}

function recallNote({ newMedia, recallPass, hasOldMedia }) {
  if (newMedia) return 'МЕДИА. В текущем сообщении пользователь прислал новое медиа. Работай только с ним. Старые изображения и файлы смотреть не нужно, маркер !recall_media в этом ответе не используй.';
  if (recallPass) return 'МЕДИА. Прежние вложения из чата приложены к запросу. Маркер !recall_media больше не пиши, отвечай по существу.';
  if (hasOldMedia) return 'МЕДИА. Раньше в чате были вложения, но сейчас их содержимое тебе не передаётся (в истории только пометки). Если пользователь прямо спрашивает про ранее присланное изображение или файл, ответь одним маркером !recall_media без другого текста, и бот приложит вложения. Во всех остальных случаях маркер не используй и не упоминай.';
  return 'МЕДИА. Вложений в чате нет, маркер !recall_media не используй.';
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// ВСЕГДА отдаём ошибки как SSE — иначе клиент не увидит текст и покажет generic.
function sseError(message, extraHeaders = {}) {
  const body = `data: ${JSON.stringify({ error: message })}\n\ndata: {"done":true}\n\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...extraHeaders,
    },
  });
}

function extractFullText(provider, raw) {
  try {
    const data = JSON.parse(raw);
    const ev = provider.parseFull ? provider.parseFull(data) : null;
    return { text: (ev && ev.text) || '', blocked: (ev && ev.blocked) || null };
  } catch {
    return { text: '', blocked: null };
  }
}

// Основная точка входа. ctx.user — уже разрешённый пользователь (сессия или
// API-ключ) либо null для гостя.
export async function runChat(req, ctx = {}) {
  const startedAt = Date.now();
  const openDeadline = startedAt + OPEN_BUDGET_MS;
  const api = !!ctx.api;

  // Веб-чат всегда ждёт SSE (в т.ч. ошибки — иначе клиент покажет generic).
  // Публичный API на предполётных ошибках отдаёт честные HTTP-статусы.
  const fail = (status, message, code) => api
    ? new Response(JSON.stringify({ error: code, message }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    : sseError(message);

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return fail(400, 'Некорректный JSON в запросе.', 'bad_json'); }

  const user = ctx.user || null;
  const guest = !user;
  let { messages, model, temperature: rawTemp, customPrompt, skillsPrompt, recall, hasOldMedia, isContinue } = body || {};
  if (guest) {
    model = GUEST_MODEL; customPrompt = ''; skillsPrompt = ''; rawTemp = 0.9; recall = false; hasOldMedia = false; isContinue = false;
    if (Array.isArray(messages)) {
      messages = messages.slice(-GUEST_MAX_MESSAGES).map((m) => ({ ...m, attachments: [] }));
    }
  }
  const temperature = Math.min(1.5, Math.max(0, Number.isFinite(+rawTemp) ? +rawTemp : 0.9));
  const contents = Array.isArray(messages) ? canonicalMessages(messages) : [];
  if (!contents.length) return fail(400, 'Пустой запрос — нет текста и вложений.', 'empty_request');

  const selectedModel = isAllowed(model) ? model : FALLBACK_MODEL;
  const selectedInfo = modelInfo(selectedModel);

  const hasAnyMedia = contents.some((m) => m.media && m.media.length);
  if (hasAnyMedia && selectedInfo && selectedInfo.vision === false) {
    return fail(400, `${selectedInfo.label} не поддерживает изображения и файлы. Выбери модель со зрением или убери вложения.`, 'vision_not_supported');
  }

  // ---- Дневной лимит (в токенах) ----
  let usageHeaders = {};
  let usageCtx;
  if (guest) {
    const g = await guestIdentity(req, process.env);
    if (g.setCookie) usageHeaders = { 'Set-Cookie': g.setCookie };
    usageCtx = { kind: 'guest', id: g.id };
  } else {
    usageCtx = { kind: 'user', id: user.id };
  }
  const mult = (selectedInfo && selectedInfo.mult) || 1;
  const usage = await readUsage(process.env, usageCtx);
  const estInTokens = estimateInputTokens(contents);
  const minCost = Math.max(1, Math.round(estInTokens * mult));
  if (!hasRoom(usage, minCost)) {
    const msg = guest
      ? 'Дневной лимит гостя исчерпан. Войди в аккаунт, чтобы продолжить.'
      : 'Дневной лимит исчерпан. Пополни баланс или подожди до сброса.';
    return api ? fail(402, msg, 'limit_exceeded') : sseError(msg, usageHeaders);
  }

  const lastUser = Array.isArray(messages) ? [...messages].reverse().find((m) => m && m.role === 'user') : null;
  const newMedia = !!(lastUser && Array.isArray(lastUser.attachments) && lastUser.attachments.some((a) => a && a.data));
  const note = recallNote({ newMedia, recallPass: !!recall, hasOldMedia: !!hasOldMedia });
  const userContext = buildUserContext({ user, guest, usage });
  let systemText = SYSTEM_PROMPT
    .replace('{{DATETIME}}', mskDatetime())
    .replace('{{MODEL}}', selectedInfo ? selectedInfo.label : selectedModel)
    .replace('{{PROVIDER}}', PROVIDER_LABELS[selectedInfo && selectedInfo.provider] || '')
    .replace('{{USER_CONTEXT}}', userContext)
    .replace('{{RECALL_NOTE}}', note);
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    systemText += '\n\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ПОЛЬЗОВАТЕЛЯ (стиль и предпочтения; не отменяют правила выше):\n' + customPrompt.trim().slice(0, 1500);
  }
  if (typeof skillsPrompt === 'string' && skillsPrompt.trim()) {
    systemText += '\n\nАКТИВНЫЕ СКИЛЛЫ (следуй им в этом диалоге; они не отменяют правила выше):\n' + skillsPrompt.trim().slice(0, 6000);
  }
  if (isContinue) {
    systemText += '\n\nПРОДОЛЖЕНИЕ. Предыдущий ответ оборвался на середине. Продолжи его ровно с того места, где он остановился: без вступлений, без повторов уже сказанного и без извинений. Просто продолжай текст или код.';
  }

  const modelsToTry = [selectedModel];
  if (!guest && selectedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);

  const neededEnv = [...new Set(
    modelsToTry.map((m) => PROVIDERS[modelInfo(m).provider]).filter(Boolean).flatMap((p) => p.envKeys),
  )];
  const anyKeys = modelsToTry.some((m) => {
    const p = PROVIDERS[modelInfo(m).provider];
    return p && p.keys(process.env).length > 0;
  });
  if (!anyKeys) {
    return fail(503, `Нет API-ключей. Добавь переменные окружения ${neededEnv.join(', ')} в настройках Vercel и сделай Redeploy.`, 'no_keys');
  }

  // ---- Разрыв соединения клиентом (кнопка «стоп») ----
  const clientSignal = req.signal;
  const upstreamCtrls = new Set();
  let upstream = null;
  let clientGone = false;

  const abortUpstream = () => {
    clientGone = true;
    for (const c of upstreamCtrls) {
      try { c.abort(); } catch {}
    }
    upstreamCtrls.clear();
    if (upstream && upstream.body) {
      try { upstream.body.cancel(); } catch {}
    }
  };

  if (clientSignal) {
    if (clientSignal.aborted) return new Response(null, { status: 499 });
    clientSignal.addEventListener('abort', abortUpstream);
  }

  let lastErr = null;
  let activeProvider = null;
  let streamCtrl = null;
  const tried = [];

  outer:
  for (const mdl of modelsToTry) {
    if (clientGone) break;
    const info = modelInfo(mdl);
    const provider = PROVIDERS[info.provider];
    if (!provider) continue;
    const keys = provider.keys(process.env);
    if (!keys.length) { tried.push({ model: mdl, provider: info.provider, result: 'no-key' }); continue; }

    const start = Math.floor(Math.random() * keys.length);
    const order = keys.map((_, i) => keys[(start + i) % keys.length]);

    for (let ki = 0; ki < order.length; ki++) {
      if (clientGone) break outer;

      const remain = openDeadline - Date.now();
      if (remain <= PER_KEY_OPEN_TIMEOUT_MS) {
        tried.push({ model: mdl, provider: info.provider, key: `#${ki + 1}`, result: 'skipped:time-budget' });
        break outer;
      }

      const ctrl = new AbortController();
      upstreamCtrls.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(), PER_KEY_OPEN_TIMEOUT_MS);
      try {
        const res = await provider.open({
          model: mdl, key: order[ki], messages: contents, systemText, temperature,
          signal: ctrl.signal, env: process.env,
        });
        clearTimeout(timer);
        if (res.ok && res.body) {
          upstream = res; activeProvider = provider; streamCtrl = ctrl;
          tried.push({ model: mdl, provider: info.provider, key: `#${ki + 1}`, result: 'ok' });
          break outer;
        }
        upstreamCtrls.delete(ctrl);
        const detail = await res.text().catch(() => '');
        const retry = res.status === 429 || res.status >= 500 || res.status === 403;
        lastErr = { retry, status: res.status, detail };
        tried.push({ model: mdl, provider: info.provider, key: `#${ki + 1}`, result: 'http:' + res.status });
        if (!retry) break;
      } catch (e) {
        clearTimeout(timer);
        upstreamCtrls.delete(ctrl);
        lastErr = e;
        const isAbort = e && (e.name === 'AbortError');
        const status = e && e.status;
        if (clientGone) break outer;
        tried.push({
          model: mdl, provider: info.provider, key: `#${ki + 1}`,
          result: isAbort ? 'timeout' : ('http:' + (status || 'network')),
        });
        if (!isAbort && e && e.retry === false) break;
      }
    }
  }

  if (clientGone) return new Response(null, { status: 499 });

  if (!upstream) {
    const status = lastErr && lastErr.status;
    let msg = 'Все модели сейчас недоступны (лимиты или перегрузка). Попробуй через минуту.';
    if (status === 400 || status === 404) {
      msg = 'Эта модель недоступна для текущих API-ключей. Выбери другую модель в списке.';
    } else if (status === 401 || status === 403) {
      msg = 'API-ключ не имеет доступа к модели. Проверь ключи в настройках Vercel и сделай Redeploy.';
    } else if (lastErr && lastErr.detail) {
      try {
        const d = JSON.parse(lastErr.detail);
        const m = d && ((d.error && d.error.message) || d.message);
        if (m) msg = `Ошибка провайдера: ${m}`;
      } catch { /* detail — не JSON */ }
    }
    console.error('[chat] all upstream attempts failed', { tried, lastStatus: status, elapsedMs: Date.now() - startedAt });
    return fail(502, msg, 'upstream_unavailable');
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const streamDeadline = Date.now() + STREAM_BUDGET_MS;
  let total = 0;
  let blocked = null;
  const markFilter = makeMarkerFilter();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      const reader = upstream.body.getReader();
      let buf = '';
      let rawAll = '';
      let timedOut = false;
      let stalled = false;
      let fatal = null;
      let usageTokens = 0;
      const diag = { ctype: (upstream.headers.get('content-type') || '').toLowerCase(), dataLines: 0, events: 0, reasoningChars: 0, head: '' };

      let idleTimer = null;
      const armIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          stalled = true;
          try { if (streamCtrl) streamCtrl.abort(); } catch {}
          try { reader.cancel(); } catch {}
        }, IDLE_MS);
      };

      const feed = (payload) => {
        diag.dataLines++;
        let data;
        try { data = JSON.parse(payload); } catch { return; }
        diag.events++;
        const ev = activeProvider.parseEvent(data);
        if (ev && ev.blocked) blocked = ev.blocked;
        if (ev && ev.reasoning) diag.reasoningChars += ev.reasoning.length;
        if (ev && ev.usage) usageTokens = Math.max(usageTokens, ev.usage);
        const raw = (ev && ev.text) || '';
        const text = raw ? markFilter.push(raw) : '';
        if (text) { total += text.length; send({ delta: text }); }
      };

      try {
        armIdle();
        while (true) {
          if (clientGone || (clientSignal && clientSignal.aborted)) return;

          const remain = streamDeadline - Date.now();
          if (remain <= 0) { timedOut = true; break; }

          const { value, done } = await reader.read();
          if (done) break;
          armIdle();

          const decoded = dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          if (rawAll.length < 262144) rawAll += decoded;
          buf += decoded;

          // Разбираем data:-строки сразу, не глядя на content-type — так
          // стриминг сохраняется при любом заголовке от прокси.
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              feed(payload);
            }
          }
        }
      } catch (err) {
        if (clientGone || (clientSignal && clientSignal.aborted)) return;
        if (err && err.name === 'AbortError') {
          if (!stalled) timedOut = true;
        } else {
          fatal = err;
        }
      } finally {
        clearTimeout(idleTimer);
      }

      buf += dec.decode();
      diag.head = rawAll.slice(0, 400);

      if (clientGone || (clientSignal && clientSignal.aborted)) return;

      // Хвост: последнее событие могло прийти без пустой строки-разделителя.
      for (const line of buf.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        feed(payload);
      }
      // Не-стриминговый ответ: если ни одного события не разобрали, а тело
      // похоже на один JSON — достаём текст из полного ответа.
      if (diag.events === 0 && rawAll.trim()) {
        const full = extractFullText(activeProvider, rawAll);
        if (full.blocked) blocked = full.blocked;
        if (full.text) {
          const t = markFilter.push(full.text);
          if (t) { total += t.length; send({ delta: t }); }
        }
      }

      const rest = markFilter.flush();
      if (rest) { total += rest.length; send({ delta: rest }); }
      if (markFilter.found) send({ recall: true });

      const truncated = timedOut || stalled || !!fatal;

      if (total === 0 && markFilter.found && !blocked) {
        // Модель попросила старые медиа и больше ничего не сказала: клиент сам повторит запрос.
      } else if (total === 0 && blocked) {
        send({ error: `Ответ не сгенерирован (фильтр: ${blocked}). Попробуй переформулировать.` });
      } else if (total === 0) {
        if (timedOut || stalled) {
          console.error('[chat] time-budget', { tried, diag, elapsedMs: Date.now() - startedAt });
          send({ error: 'Ответ от модели слишком долгий. Попробуй ещё раз или укороти вопрос.' });
        } else if (fatal) {
          console.error('[chat] stream read error', fatal);
          send({ error: 'Соединение прервалось. Попробуй ещё раз.' });
        } else {
          console.error('[chat] empty-response', { tried, diag, elapsedMs: Date.now() - startedAt });
          send({ error: 'Модель вернула пустой ответ. Нажми «Повторить».' });
        }
      } else {
        const estOut = Math.ceil(total / 3.5);
        const usedTokens = usageTokens || (estInTokens + estOut);
        const cost = Math.max(1, Math.round(usedTokens * mult));
        // При обрыве соединения на стороне сервиса не списываем.
        const newUsed = fatal
          ? usage.used
          : await charge(process.env, { ...usageCtx, cost }).catch(() => null);
        send({
          done: true,
          truncated: truncated || undefined,
          usage: { used: newUsed, limit: usage.limit, unit: 'tokens', cost },
        });
      }
      if (total === 0) send({ done: true });

      try { controller.close(); } catch {}
    },
    cancel() {
      abortUpstream();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...usageHeaders,
    },
  });
}
