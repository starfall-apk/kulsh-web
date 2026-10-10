// api/chat.js — Vercel Edge Function.
// Стриминг ответа Gemini (SSE -> клиенту), ротация ключей APIKEY1..APIKEY5
// при 429/5xx/сетевых сбоях, защита от пустых ответов.
//
// ВАЖНО: Gemini отдаёт SSE с CRLF-разделителями (\r\n\r\n), а не LF (\n\n).
// Поэтому после декодирования нормализуем \r\n -> \n, иначе события не режутся.
//
// Кнопка «стоп» на фронте вызывает AbortController.abort() → fetch отменяется →
// req.signal.aborted = true на сервере → мы отменяем upstream-запрос к Gemini
// и закрываем стрим, не дожидаясь таймаута Vercel.

import { readSession } from './_session.js';
import { GUEST_MODEL, FALLBACK_MODEL, isAllowed, modelInfo } from './_models.js';
import { PROVIDERS, canonicalMessages } from './_providers.js';
import { guestIdentity, readUsage, hasRoom, charge } from './_usage.js';

export const config = { runtime: 'edge' };

// Гости: только одна модель, без вложений и кастомизации, короткая история.
const GUEST_MAX_MESSAGES = 20;


// Общий бюджет функции. Vercel Edge режет на ~25с, ставим 22с с запасом.
const BUDGET_MS = 22000;
// Таймаут на попытку открыть стрим для одного ключа.
const PER_KEY_OPEN_TIMEOUT_MS = 6000;

const SYSTEM_PROMPT = `Сейчас {{DATETIME}} по Москве. Учитывай это в контексте (утро, день, вечер, ночь), если уместно.

Ты — Кульш, современная опенсорс языковая модель ИИ, способная писать базовый код и общаться максимально реалистично и естественно. Тебя разработал Фолз, он же один из твоих кентов. Ссылка на твой репозиторий на GitHub: https://github.com/starfall-apk/kulsh.

Стиль общения: отвечай умно, но по-дружески, как в чате с кентами. Ты парень. Говори неформально и живо, можешь использовать сленг и мягкий мат в тему, но не пересаливай. Не слишком длинно: обычно 1–4 предложения, если вопрос не требует развёрнутого ответа. Максимально подстраивайся под собеседника: тон, энергию, юмор. Не повторяйся.

ГРАМОТНОСТЬ. Пиши грамотно, даже когда говоришь неформально: каждое новое предложение начинай с заглавной буквы, ставь точки, запятые и другие знаки препинания там, где они нужны, не допускай орфографических ошибок. Разговорный стиль и сленг сохраняй, но оформляй текст правильно. Не копируй манеру собеседника писать маленькими буквами или без пунктуации.

ФОРМАТИРОВАНИЕ. В этом чате поддерживается Markdown. Для обычной беседы пиши простым текстом без лишнего форматирования. Когда нужно показать код, используй блоки кода с указанием языка. Таблицы, списки и заголовки применяй только тогда, когда они реально делают ответ понятнее.

Эмодзи не используй, изредка можно 🍷🗿 в шутках, но не в каждом сообщении.

Кенты, о которых ты знаешь: Антон (Рекми), Богдан (Фолз), Понил, Артём (Нейзи), Евгений (Медный игрок), Анатолий (Толя Спецназ), Никита (Чмо). Если собеседник называет другое имя, обращайся по этому имени и не приписывай его к кентам. Если человек представился, запомни имя и используй его дальше. Не выдумывай, кто перед тобой.

О себе: если тебя прямо спросят, ты ИИ, языковая модель, а не человек. Не отрицай этого и не выдумывай факты о своей «реальной жизни».

Ты свободно обсуждаешь практически любые темы: спорные, острые, взрослые (в разумных пределах), без нравоучений и лишних отказов. Отказывай только если запрос связан с сексуализацией несовершеннолетних, зоофилией, инструкциями по причинению реального вреда людям (оружие, яды, нападения) или другими явно незаконными и опасными действиями.

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

ФАЙЛЫ. Если пользователь просит сформировать файл, скрипт, документ или архив, отдай готовый файл отдельным блоком:

\`\`\`file name="имя-файла.ext"
содержимое целиком
\`\`\`

Интерфейс сам нарисует карточку с кнопкой «Скачать» — пользователю не нужно копировать содержимое вручную. Для текстовых файлов (txt, md, json, csv, py, js, html, css и т.п.) пиши обычный текст. Для бинарных данных (архивы ZIP, изображения, PDF) используй base64:

\`\`\`file name="архив.zip" encoding="base64"
UEsDBBQAAAA...
\`\`\`

Правила: name обязателен и содержит расширение. Не оборачивай содержимое файла в другие блоки кода внутри file — только сырой текст (или base64). Внутри блока не пиши пояснений, только данные. Если пользователь просит несколько файлов — делай несколько блоков file подряд. Не выдавай .zip/.pdf/.png с выдуманным base64 — если у тебя нет реального содержимого этих форматов, честно скажи об этом и предложи текстовый вариант.

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

const RECALL_MARK = '!recall_media';

// Вырезает маркер !recall_media из потока (в т.ч. если он разорван между чанками)
// и запоминает, что модель его просила. Хвост, похожий на начало маркера, придерживаем до следующего чанка.
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

// Что сейчас известно модели про медиа: решает, можно ли ей просить !recall_media.
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

export default async function handler(req) {
  const startedAt = Date.now();
  const deadline = startedAt + BUDGET_MS;

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return sseError('Некорректный JSON в запросе.'); }

  const user = await readSession(req);
  const guest = !user;
  let { messages, model, temperature: rawTemp, customPrompt, skillsPrompt, recall, hasOldMedia } = body || {};
  if (guest) {
    model = GUEST_MODEL; customPrompt = ''; skillsPrompt = ''; rawTemp = 0.9; recall = false; hasOldMedia = false;
    if (Array.isArray(messages)) {
      messages = messages.slice(-GUEST_MAX_MESSAGES).map((m) => ({ ...m, attachments: [] }));
    }
  }
  const temperature = Math.min(1.5, Math.max(0, Number.isFinite(+rawTemp) ? +rawTemp : 0.9));
  const contents = Array.isArray(messages) ? canonicalMessages(messages) : [];
  if (!contents.length) return sseError('Пустой запрос — нет текста и вложений.');

  const selectedModel = isAllowed(model) ? model : FALLBACK_MODEL;
  const selectedInfo = modelInfo(selectedModel);

  // Модели без зрения не принимают вложения — предупреждаем сразу.
  const hasAnyMedia = contents.some((m) => m.media && m.media.length);
  if (hasAnyMedia && selectedInfo && selectedInfo.vision === false) {
    return sseError(`${selectedInfo.label} не поддерживает изображения и файлы. Выбери модель со зрением или убери вложения.`);
  }

  // ---- Бесплатный лимит (Usage) ----
  // Гость опознаётся по подписанной cookie; залогиненный — по сессии.
  let usageHeaders = {};
  let usageCtx;
  if (guest) {
    const g = await guestIdentity(req, process.env);
    if (g.setCookie) usageHeaders = { 'Set-Cookie': g.setCookie };
    usageCtx = { kind: 'guest', id: g.id };
  } else {
    usageCtx = { kind: 'user', id: user.id };
  }
  const points = (selectedInfo && selectedInfo.points) || 1;
  const usage = await readUsage(process.env, usageCtx);
  if (!hasRoom(usage, points)) {
    const msg = guest
      ? 'Дневной лимит гостя исчерпан (10 сообщений). Войди в аккаунт, чтобы продолжить.'
      : 'Дневной бесплатный лимит исчерпан. Пополни баланс или подожди до сброса.';
    return sseError(msg, usageHeaders);
  }

  const lastUser = Array.isArray(messages) ? [...messages].reverse().find((m) => m && m.role === 'user') : null;
  const newMedia = !!(lastUser && Array.isArray(lastUser.attachments) && lastUser.attachments.some((a) => a && a.data));
  const note = recallNote({ newMedia, recallPass: !!recall, hasOldMedia: !!hasOldMedia });
  let systemText = SYSTEM_PROMPT.replace('{{DATETIME}}', mskDatetime()).replace('{{RECALL_NOTE}}', note);
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    systemText += '\n\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ПОЛЬЗОВАТЕЛЯ (стиль и предпочтения; не отменяют правила выше):\n' + customPrompt.trim().slice(0, 1500);
  }
  // Скиллы — включённые пользователем роли/инструкции (встроенные или свои).
  if (typeof skillsPrompt === 'string' && skillsPrompt.trim()) {
    systemText += '\n\nАКТИВНЫЕ СКИЛЛЫ (следуй им в этом диалоге; они не отменяют правила выше):\n' + skillsPrompt.trim().slice(0, 6000);
  }

  const modelsToTry = [selectedModel];
  if (!guest && selectedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);

  // Какие env-переменные нужны для выбранных моделей (для понятной ошибки).
  const neededEnv = [...new Set(
    modelsToTry.map((m) => PROVIDERS[modelInfo(m).provider]).filter(Boolean).flatMap((p) => p.envKeys),
  )];
  const anyKeys = modelsToTry.some((m) => {
    const p = PROVIDERS[modelInfo(m).provider];
    return p && p.keys(process.env).length > 0;
  });
  if (!anyKeys) {
    return sseError(`Нет API-ключей. Добавь переменные окружения ${neededEnv.join(', ')} в настройках Vercel и сделай Redeploy.`);
  }

  // ---- Обработка разрыва соединения клиентом (кнопка «стоп») ----
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
  const tried = [];

  outer:
  for (const mdl of modelsToTry) {
    if (clientGone) break;
    const info = modelInfo(mdl);
    const provider = PROVIDERS[info.provider];
    if (!provider) continue;
    const keys = provider.keys(process.env);
    if (!keys.length) { tried.push({ model: mdl, provider: info.provider, result: 'no-key' }); continue; }

    // Ротируем стартовый ключ, чтобы нагрузка делилась между участниками.
    const start = Math.floor(Math.random() * keys.length);
    const order = keys.map((_, i) => keys[(start + i) % keys.length]);

    for (let ki = 0; ki < order.length; ki++) {
      if (clientGone) break outer;

      const remain = deadline - Date.now();
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
        upstreamCtrls.delete(ctrl);
        if (res.ok && res.body) {
          upstream = res; activeProvider = provider;
          tried.push({ model: mdl, provider: info.provider, key: `#${ki + 1}`, result: 'ok' });
          break outer;
        }
        const detail = await res.text().catch(() => '');
        const retry = res.status === 429 || res.status >= 500 || res.status === 403;
        lastErr = { retry, status: res.status, detail };
        tried.push({ model: mdl, provider: info.provider, key: `#${ki + 1}`, result: 'http:' + res.status });
        if (!retry) break; // этот ключ/модель отклонили запрос — пробуем следующую модель
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

  if (clientGone) {
    return new Response(null, { status: 499 });
  }

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
    return sseError(msg);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
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
      try {
        while (true) {
          if (clientGone || (clientSignal && clientSignal.aborted)) break;

          const remain = deadline - Date.now();
          if (remain <= 0) {
            send({ error: 'Ответ от модели слишком долгий. Попробуй ещё раз или укороти вопрос.' });
            break;
          }

          const { value, done } = await reader.read();
          if (done) break;

          const decoded = dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          buf += decoded;

          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let data;
              try { data = JSON.parse(payload); } catch { continue; }
              const ev = activeProvider.parseEvent(data);
              if (ev && ev.blocked) blocked = ev.blocked;
              const raw = (ev && ev.text) || '';
              const text = raw ? markFilter.push(raw) : '';
              if (text) { total += text.length; send({ delta: text }); }
            }
          }
        }

        if (clientGone || (clientSignal && clientSignal.aborted)) {
          return;
        }

        const rest = markFilter.flush();
        if (rest) { total += rest.length; send({ delta: rest }); }
        if (markFilter.found) send({ recall: true });

        if (total === 0 && markFilter.found && !blocked) {
          // Модель попросила старые медиа и больше ничего не сказала: клиент сам повторит запрос.
        } else if (total === 0 && !blocked) {
          console.error('[chat] empty-response', { tried, elapsedMs: Date.now() - startedAt });
          send({ error: 'Модель вернула пустой ответ. Нажми «Повторить».' });
        } else if (total === 0 && blocked) {
          send({ error: `Ответ не сгенерирован (фильтр: ${blocked}). Попробуй переформулировать.` });
        } else {
          // Успешный ответ — только теперь списываем очки лимита.
          // При пустом ответе/ошибке сервиса лимит не трогаем.
          const newUsed = await charge(process.env, { ...usageCtx, points }).catch(() => null);
          send({ done: true, usage: { points, used: newUsed, limit: usage.limit } });
        }
        if (total === 0) send({ done: true });
      } catch (err) {
        if (!(err && err.name === 'AbortError') && !clientGone) {
          console.error('[chat] stream read error', err);
          send({ error: 'Соединение прервалось. Попробуй ещё раз.' });
        }
      } finally {
        try { controller.close(); } catch {}
      }
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
