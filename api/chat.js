// api/chat.js — эндпоинт веб-чата (Vercel Edge Function).
// Аутентификация: подписанная cookie-сессия; без неё — гость с урезанными правами.
// Вся логика стриминга живёт в api/_chat-core.js (общая с публичным API).
import { readSession } from './_session.js';
import { runChat } from './_chat-core.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const user = await readSession(req);
  return runChat(req, { user });
}
