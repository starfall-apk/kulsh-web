// api/chat.js — Vercel Edge Function, streams Gemini responses, rotates API keys on failure.
export const config = { runtime: 'edge' };

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash','gemini-2.5-flash-lite',
  'gemini-3.5-flash','gemini-3.5-flash-lite',
  'gemini-3.6-flash','gemini-3.7-flash','gemini-3.8-flash',
]);

const SYSTEM_PROMPT = `Сейчас идёт диалог с KulshGPT — современной опенсорс языковой моделью ИИ по имени Кульш, способной писать код и общаться максимально реалистично и по-дружески, как в чате кентов. Общайся неформально и живо, но всегда грамотно: новое предложение — с заглавной буквы, ставь точки, запятые и другие знаки препинания там, где они нужны. Небрежный тон — это стиль речи, а не повод писать безграмотно.

Ты можешь свободно обсуждать практически любые темы — научные, философские, творческие, спорные, взрослые (в разумных пределах) — без лишней стеснительности и нравоучений там, где они не нужны. Отказывайся помогать только если запрос прямо связан с сексуализацией несовершеннолетних, сексуальным насилием над детьми, сексуальными действиями с животными, реальным причинением вреда людям (оружие, яды, инструкции по нападениям) или другими явно незаконными и опасными действиями. Во всех остальных случаях — помогай по существу.

Форматируй ответы в Markdown: заголовки, списки, таблицы, блоки кода, выделение — когда это делает ответ понятнее. Отвечай на языке пользователя.

Никогда не отправляй пустой ответ. Если нечего сказать по существу — задай уточняющий вопрос или вежливо объясни, чего не хватает для ответа.`;

function pickKeys(env) {
  const keys = [];
  for (let i = 1; i <= 5; i++) { const k = env[`APIKEY${i}`]; if (k && k.trim()) keys.push(k.trim()); }
  return keys;
}

function toGeminiContents(messages) {
  return messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
    const parts = [];
    if (m.content) parts.push({ text: m.content });
    if (Array.isArray(m.attachments)) for (const a of m.attachments) if (a.data && a.mimeType) parts.push({ inline_data: { mime_type: a.mimeType, data: a.data } });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts.length ? parts : [{ text: '' }] };
  });
}

async function tryStreamFromKey(key, model, contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });
  return res;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { messages, model } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) return new Response(JSON.stringify({ error: 'messages[] is required' }), { status: 400 });

  const selectedModel = ALLOWED_MODELS.has(model) ? model : 'gemini-3.5-flash';
  const keys = pickKeys(process.env);
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: 'Нет доступных API-ключей. Проверь APIKEY1..APIKEY5 в настройках проекта на Vercel.' }), { status: 500 });
  }

  const contents = toGeminiContents(messages);

  // Find a working key FIRST (fast probe), then stream its response straight through.
  // This keeps the "first byte" latency low so Vercel's edge function doesn't 25s-timeout
  // waiting on a single slow/exhausted key before ever writing anything.
  let upstream = null;
  let lastErrText = '';
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await tryStreamFromKey(keys[i], selectedModel, contents);
      if (res.ok && res.body) { upstream = res; break; }
      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        lastErrText = await res.text().catch(() => '');
        continue;
      }
      // non-retryable (bad request / invalid key) — surface immediately as SSE error event
      lastErrText = await res.text().catch(() => '');
      return sseError(`Ошибка API Gemini (${res.status}). Попробуй другую модель.`);
    } catch (e) {
      lastErrText = String(e);
      continue;
    }
  }

  if (!upstream) {
    return sseError('Все API-ключи сейчас недоступны (лимиты исчерпаны или сервис перегружен). Попробуй через минуту.');
  }

  // Transform Gemini's SSE stream into a simple text-delta SSE stream for the frontend.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawAnyText = false;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const obj = JSON.parse(jsonStr);
              const textPiece = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
              if (textPiece) {
                sawAnyText = true;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: textPiece })}\n\n`));
              }
              const blockReason = obj?.promptFeedback?.blockReason;
              if (blockReason && !sawAnyText) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Ответ заблокирован фильтром безопасности (${blockReason}).` })}\n\n`));
              }
            } catch {}
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Соединение прервано. Попробуй ещё раз.' })}\n\n`));
      }
      if (!sawAnyText) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Модель вернула пустой ответ. Попробуй переформулировать запрос или повторить отправку.' })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sseError(message) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
