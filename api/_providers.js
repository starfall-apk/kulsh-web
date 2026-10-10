// api/_providers.js — адаптеры LLM-провайдеров для api/chat.js.
//
// Единый контракт, чтобы chat.js не знал деталей каждого сервиса:
//   keys(env)  → массив API-ключей провайдера (для ротации);
//   open(ctx)  → Promise<Response> со стримом (SSE);
//   parseEvent(data) → { text, finish, blocked } из одного распарсенного SSE-события.
//
// chat.js сам нормализует поток и шлёт клиенту события { delta } / { done } / { error }.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const NEUTRALBEATS_BASE = 'https://api.neutralbeats.com/v1';

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

const isImage = (mime) => /^image\//i.test(mime || '');
const isText = (mime) => /^text\//i.test(mime || '') || /(json|xml|javascript|x-yaml|csv|markdown)/i.test(mime || '');

function b64ToText(b64) {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return ''; }
}

// ---- Google Gemini (нативный API) ----
function geminiContent(m) {
  const parts = [];
  if (m.text && m.text.trim()) parts.push({ text: m.text });
  for (const a of m.media) {
    parts.push({ inline_data: { mime_type: a.mimeType, data: a.data } });
  }
  if (!parts.length) return null;
  return { role: m.role === 'assistant' ? 'model' : 'user', parts };
}

const google = {
  id: 'google',
  envKeys: ['APIKEY1', 'APIKEY2', 'APIKEY3', 'APIKEY4', 'APIKEY5'],
  keys(env) {
    const out = [];
    for (const name of this.envKeys) { const k = (env[name] || '').trim(); if (k) out.push(k); }
    return out;
  },
  async open({ model, key, messages, systemText, temperature, signal }) {
    const contents = messages.map(geminiContent).filter(Boolean);
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    return fetch(url, {
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
  },
  parseEvent(data) {
    const br = data && data.promptFeedback && data.promptFeedback.blockReason;
    const cand = data && data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    let blocked = br || null;
    if (cand && cand.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS' && !text) {
      blocked = blocked || cand.finishReason;
    }
    return { text, finish: cand && cand.finishReason, blocked };
  },
};

// ---- NeutralBeats (OpenAI-совместимый API) ----
function openaiMessage(m) {
  const images = m.media.filter((a) => isImage(a.mimeType));
  const texts = m.media.filter((a) => !isImage(a.mimeType) && isText(a.mimeType));
  if (!images.length && !texts.length) return { role: m.role, content: m.text };
  const parts = [];
  if (m.text && m.text.trim()) parts.push({ type: 'text', text: m.text });
  for (const a of texts) {
    const t = b64ToText(a.data);
    if (t) parts.push({ type: 'text', text: `\n\n[Файл: ${a.name || 'файл'}]\n${t}` });
  }
  for (const a of images) {
    parts.push({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${a.data}` } });
  }
  return { role: m.role, content: parts };
}

const openaiCompat = {
  id: 'neutralbeats',
  envKeys: ['NEUTRALBEATS_API_KEY'],
  keys(env) {
    const out = [];
    for (const name of this.envKeys) { const k = (env[name] || '').trim(); if (k) out.push(k); }
    return out;
  },
  async open({ model, key, messages, systemText, temperature, signal, env }) {
    const base = (env.NEUTRALBEATS_BASE_URL || NEUTRALBEATS_BASE).replace(/\/+$/, '');
    const msgs = [{ role: 'system', content: systemText }, ...messages.map(openaiMessage)];
    return fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal,
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature,
        stream: true,
        max_tokens: 8192,
      }),
    });
  },
  parseEvent(data) {
    const ch = data && data.choices && data.choices[0];
    const d = ch && ch.delta;
    let text = '';
    if (d) {
      if (typeof d.content === 'string') text = d.content;
      else if (Array.isArray(d.content)) text = d.content.map((p) => (p && p.text) || '').join('');
    }
    return { text, finish: ch && ch.finish_reason, blocked: null };
  },
};

export const PROVIDERS = { google, neutralbeats: openaiCompat };

// Приводим входные сообщения клиента к общему виду { role, text, media[] }.
export function canonicalMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = m.content ? String(m.content) : '';
    const media = Array.isArray(m.attachments)
      ? m.attachments.filter((a) => a && a.data && a.mimeType)
      : [];
    if (!text.trim() && !media.length) continue;
    out.push({ role: m.role, text, media });
  }
  return out;
}
