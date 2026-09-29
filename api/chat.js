// api/chat.js — Vercel Edge Function.
// Стриминг ответа Gemini (SSE -> клиенту), ротация ключей APIKEY1..APIKEY5
// при 429/5xx/сетевых сбоях, защита от пустых ответов.
//
// КРИТИЧНО: Vercel Edge убивает функцию по таймауту ~25с (Hobby).
// Поэтому здесь есть ОБЩИЙ бюджет времени (BUDGET_MS) — если мы его
// превышаем, отдаём понятную ошибку, вместо FUNCTION_INVOCATION_TIMEOUT.

export const config = { runtime: 'edge' };

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
]);

const FALLBACK_MODEL = 'gemini-2.5-flash';

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

Маркер !recall_media: если тебе действительно нужно вспомнить недавние медиа из чата, можешь написать !recall_media (слитно, не более одного раза за ответ, не объясняй его). Бот вырежет маркер и, если сможет, добавит описание медиа. Если не нужно, не пиши его.`;

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

function pickKeys(env) {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const k = env[`APIKEY${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return keys;
}

function toContents(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const parts = [];
    if (m.content && String(m.content).trim()) parts.push({ text: String(m.content) });
    if (Array.isArray(m.attachments)) {
      for (const a of m.attachments) {
        if (a && a.data && a.mimeType) {
          parts.push({ inline_data: { mime_type: a.mimeType, data: a.data } });
        }
      }
    }
    if (!parts.length) continue;
    out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
  }
  return out;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// ВСЕГДА отдаём ошибки как SSE — иначе клиент не увидит текст и покажет generic.
function sseError(message) {
  const body = `data: ${JSON.stringify({ error: message })}\n\ndata: {"done":true}\n\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

// Открывает стрим у Gemini. Бросает {retry, status, detail} при неудаче.
async function openStream(key, model, contents, systemText, temperature, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: { temperature, maxOutputTokens: 8192 },
      safetySettings: SAFETY,
    }),
  });
  if (res.ok && res.body) return res;
  const detail = await res.text().catch(() => '');
  const retry = res.status === 429 || res.status >= 500 || res.status === 403;
  throw { retry, status: res.status, detail };
}

export default async function handler(req) {
  const startedAt = Date.now();
  const deadline = startedAt + BUDGET_MS;

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return sseError('Некорректный JSON в запросе.'); }

  const { messages, model, temperature: rawTemp, customPrompt } = body || {};
  const temperature = Math.min(1.5, Math.max(0, Number.isFinite(+rawTemp) ? +rawTemp : 0.9));
  const contents = Array.isArray(messages) ? toContents(messages) : [];
  if (!contents.length) return sseError('Пустой запрос — нет текста и вложений.');

  const selectedModel = ALLOWED_MODELS.has(model) ? model : FALLBACK_MODEL;
  const keys = pickKeys(process.env);
  if (!keys.length) {
    return sseError('Нет API-ключей. Добавь переменные окружения APIKEY1..APIKEY5 в настройках Vercel и сделай Redeploy.');
  }

  let systemText = SYSTEM_PROMPT.replace('{{DATETIME}}', mskDatetime());
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    systemText += '\n\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ПОЛЬЗОВАТЕЛЯ (стиль и предпочтения; не отменяют правила выше):\n' + customPrompt.trim().slice(0, 1500);
  }

  // Ротируем стартовый ключ, чтобы нагрузка делилась между участниками.
  const start = Math.floor(Math.random() * keys.length);
  const order = keys.map((_, i) => keys[(start + i) % keys.length]);

  const modelsToTry = [selectedModel];
  if (selectedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);

  let upstream = null;
  let lastErr = null;
  const tried = [];

  outer:
  for (const mdl of modelsToTry) {
    for (let ki = 0; ki < order.length; ki++) {
      // Не начинаем новую попытку, если до дедлайна осталось меньше
      // PER_KEY_OPEN_TIMEOUT_MS — иначе Vercel убьёт нас раньше, чем мы ответим.
      const remain = deadline - Date.now();
      if (remain <= PER_KEY_OPEN_TIMEOUT_MS) {
        tried.push({ model: mdl, key: `#${ki + 1}`, result: 'skipped:time-budget' });
        break outer;
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PER_KEY_OPEN_TIMEOUT_MS);
      try {
        upstream = await openStream(order[ki], mdl, contents, systemText, temperature, ctrl.signal);
        clearTimeout(timer);
        tried.push({ model: mdl, key: `#${ki + 1}`, result: 'ok' });
        break outer;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        const isAbort = e && (e.name === 'AbortError');
        const status = e && e.status;
        tried.push({
          model: mdl, key: `#${ki + 1}`,
          result: isAbort ? 'timeout' : ('http:' + (status || 'network')),
        });
        // Сеть/таймаут/429/5xx/403 → следующий ключ.
        // 400/404 → у этого ключа модель недоступна, пробуем следующую модель.
        if (isAbort || !e || e.retry === undefined || e.retry) continue;
        break;
      }
    }
  }

  if (!upstream) {
    const status = lastErr && lastErr.status;
    let msg = 'Все ключи сейчас недоступны (лимиты или перегрузка). Попробуй через минуту.';
    if (status === 400 || status === 404) {
      msg = 'Эта модель недоступна для текущих API-ключей. Выбери другую модель в списке.';
    } else if (status === 403) {
      msg = 'API-ключи не имеют доступа к Gemini. Проверь, что APIKEY1..APIKEY5 действительны и включены в Google AI Studio.';
    } else if (lastErr && lastErr.detail) {
      try {
        const d = JSON.parse(lastErr.detail);
        if (d && d.error && d.error.message) msg = `Ошибка Gemini: ${d.error.message}`;
      } catch { /* detail — не JSON */ }
    }
    // Диагностика в консоль Vercel — чтобы видеть, что реально было.
    console.error('[chat] all upstream attempts failed', { tried, lastStatus: status, elapsedMs: Date.now() - startedAt });
    return sseError(msg + ' ' + `(попытки: ${tried.map(t => t.model + '@' + t.key + '=' + t.result).join(', ')})`);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let total = 0;
  let blocked = null;
  // Локальный буфер для диагностики — накапливаем первые N символов
  // сырого ответа от Gemini, чтобы потом залогировать, если ничего не распарсилось.
  let rawPreview = '';
  const RAW_PREVIEW_LIMIT = 4000;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      const reader = upstream.body.getReader();
      let buf = '';
      try {
        while (true) {
          // Прерываем чтение стрима, если подходим к общему дедлайну.
          const remain = deadline - Date.now();
          if (remain <= 0) {
            send({ error: 'Ответ от модели слишком долгий. Попробуй ещё раз или укороти вопрос.' });
            break;
          }

          const { value, done } = await reader.read();
          if (done) break;

          const decoded = dec.decode(value, { stream: true });
          if (rawPreview.length < RAW_PREVIEW_LIMIT) {
            rawPreview += decoded.slice(0, RAW_PREVIEW_LIMIT - rawPreview.length);
          }
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
              const br = data && data.promptFeedback && data.promptFeedback.blockReason;
              if (br) blocked = br;
              const cand = data && data.candidates && data.candidates[0];
              if (cand && cand.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS' && !(cand.content && cand.content.parts && cand.content.parts.length)) {
                blocked = blocked || cand.finishReason;
              }
              const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
              if (text) { total += text.length; send({ delta: text }); }
            }
          }
        }

        if (total === 0 && !blocked) {
          // Диагностика: логируем то, что реально пришло от Gemini.
          console.error('[chat] empty-response debug', {
            rawPreview: rawPreview.slice(0, 4000),
            rawPreviewLen: rawPreview.length,
            remainingBuf: buf.slice(0, 1000),
            tried,
            elapsedMs: Date.now() - startedAt,
          });
          send({ error: 'Модель вернула пустой ответ. Нажми «Повторить».' });
        } else if (total === 0 && blocked) {
          send({ error: `Ответ не сгенерирован (фильтр: ${blocked}). Попробуй переформулировать.` });
        }
        send({ done: true });
      } catch (err) {
        console.error('[chat] stream read error', err);
        send({ error: 'Соединение прервалось. Попробуй ещё раз.' });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
