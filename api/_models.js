// api/_models.js — единый реестр моделей (серверная сторона).
// ВАЖНО: этот список дублируется на фронтенде в public/app.js (MODELS).
// При добавлении модели правь оба места.
//
// provider — какой адаптер использовать (api/_providers.js);
// vision   — принимает ли модель изображения (false → вложения отклоняются);
// mult     — множитель расхода дневного лимита (в токенах) за запрос.
//            Лёгкие модели ×1, флагманы — дороже (до ×3).

export const GUEST_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_MODEL = 'gemini-2.5-flash';

export const MODELS = {
  // ---- Google Gemini (нативный API, ротация APIKEY1..APIKEY5) ----
  'gemini-2.5-flash':      { provider: 'google', vision: true,  mult: 1,   label: 'Gemini 2.5 Flash' },
  'gemini-2.5-flash-lite': { provider: 'google', vision: true,  mult: 1,   label: 'Gemini 2.5 Flash Lite' },
  'gemini-3.5-flash':      { provider: 'google', vision: true,  mult: 1.5, label: 'Gemini 3.5 Flash' },
  'gemini-3.5-flash-lite': { provider: 'google', vision: true,  mult: 1.5, label: 'Gemini 3.5 Flash Lite' },
  'gemini-3.6-flash':      { provider: 'google', vision: true,  mult: 3,   label: 'Gemini 3.6 Flash' },
  'gemini-3.7-flash':      { provider: 'google', vision: true,  mult: 3,   label: 'Gemini 3.7 Flash' },
  'gemini-3.8-flash':      { provider: 'google', vision: true,  mult: 3,   label: 'Gemini 3.8 Flash' },

  // ---- NeutralBeats ([OI]-совместимый API, ключ NEUTRALBEATS_API_KEY) ----
  'deepseek-v4.1-flash':   { provider: 'neutralbeats', vision: true,  mult: 1, label: 'DeepSeek V4.1 Flash' },
  'deepseek-v4-pro':       { provider: 'neutralbeats', vision: false, mult: 2, label: 'DeepSeek V4 Pro' },
  'glm-5.3-flash':         { provider: 'neutralbeats', vision: true,  mult: 1, label: 'GLM 5.3 Flash' },
  'kimi-k3':               { provider: 'neutralbeats', vision: true,  mult: 3, label: 'Kimi K3' },
};

export const isAllowed = (id) => Object.prototype.hasOwnProperty.call(MODELS, id);
export const modelInfo = (id) => MODELS[id] || null;
