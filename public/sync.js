// sync.js — синхронизация чатов и настроек с аккаунтом (api/sync.js).
// Локальная копия в localStorage остаётся кэшем: сайт работает мгновенно и оффлайн,
// а изменения уходят на сервер и подтягиваются на других устройствах.
// Конфликты решаются «последняя правка побеждает» отдельно по каждому чату.
(function () {
  'use strict';
  const CHATS_KEY = 'kulshgpt.chats.v1', SETTINGS_KEY = 'kulshgpt.settings.v1';
  const META_KEY = 'kulshgpt.sync.v1';          // { owner, h:{chatId:hash}, del:{chatId:ts}, settingsAt, settingsH, dirty:[ids] }
  const LOCAL_ONLY = ['voiceURI'];              // настройки, которые зависят от устройства
  const PUSH_DELAY = 2000, PULL_COOLDOWN = 15000, BATCH_BYTES = 600 * 1024, MAX_CHAT_BYTES = 800 * 1024;

  const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; };
  const chatHash = (c) => { const { updatedAt, ...rest } = c; return hash(JSON.stringify(rest)); };
  const cleanSettings = (s) => { const o = Object.assign({}, s); LOCAL_ONLY.forEach((k) => delete o[k]); return o; };

  let meta = Object.assign({ owner: null, h: {}, del: {}, settingsAt: 0, settingsH: '', dirty: [] }, rd(META_KEY, {}));
  const saveMeta = () => wr(META_KEY, meta);

  let enabled = false, timer = null, pushing = false, lastPull = 0;
  const user = () => window.KulshAuth && window.KulshAuth.user;
  const active = () => enabled && !!user();
  const emit = (reason) => window.dispatchEvent(new CustomEvent('kulsh-synced', { detail: { reason } }));

  // Вырезаем тяжёлые base64-вложения: на сервер идёт только текст чата.
  function strip(chat) {
    const c = JSON.parse(JSON.stringify(chat));
    (c.messages || []).forEach((m) => (m.attachments || []).forEach((a) => { if (a && a.data) { delete a.data; a.stripped = true; } }));
    return c;
  }
  function restoreData(remote, local) {
    if (!local) return remote;
    const byId = {}; (local.messages || []).forEach((m) => { byId[m.id] = m; });
    (remote.messages || []).forEach((m) => {
      const lm = byId[m.id]; if (!lm || !m.attachments) return;
      m.attachments.forEach((a, i) => { const la = (lm.attachments || [])[i]; if (a && a.stripped && la && la.data && la.name === a.name) { a.data = la.data; delete a.stripped; } });
    });
    return remote;
  }

  // Вызывается из app.js при каждом сохранении чатов.
  function chatsChanged(chats) {
    const seen = {}, now = Date.now();
    chats.forEach((c) => {
      seen[c.id] = 1;
      const h = chatHash(c);
      if (meta.h[c.id] !== h) {
        c.updatedAt = now; meta.h[c.id] = h;
        if (!meta.dirty.includes(c.id)) meta.dirty.push(c.id);
        delete meta.del[c.id];
      }
    });
    Object.keys(meta.h).forEach((id) => {
      if (!seen[id]) { delete meta.h[id]; meta.del[id] = now; meta.dirty = meta.dirty.filter((x) => x !== id); }
    });
    saveMeta(); schedule();
  }
  function settingsChanged(s) {
    const h = hash(JSON.stringify(cleanSettings(s)));
    if (h !== meta.settingsH) { meta.settingsH = h; meta.settingsAt = Date.now(); saveMeta(); schedule(); }
  }
  function schedule() { if (!active()) return; clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), PUSH_DELAY); }

  async function api(method, body, keepalive) {
    const r = await fetch('/api/sync', { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, keepalive: !!keepalive });
    if (!r.ok) throw new Error('sync_' + r.status);
    return r.json();
  }

  async function push(keepalive) {
    if (!active() || pushing) return;
    pushing = true;
    try {
      const chats = rd(CHATS_KEY, []), byId = {}; chats.forEach((c) => { byId[c.id] = c; });
      const ids = meta.dirty.filter((id) => byId[id]);
      const del = Object.assign({}, meta.del);
      const settings = meta.settingsAt > (meta.settingsPushed || 0) ? cleanSettings(rd(SETTINGS_KEY, {})) : null;
      // Пачки ≤ ~600 КБ; слишком большие чаты пропускаем (их остаётся хранить только локально).
      const batches = []; let cur = [], size = 0;
      ids.forEach((id) => {
        const s = strip(byId[id]), n = JSON.stringify(s).length;
        if (n > MAX_CHAT_BYTES) return;
        if (size + n > BATCH_BYTES && cur.length) { batches.push(cur); cur = []; size = 0; }
        cur.push(s); size += n;
      });
      if (cur.length || !batches.length) batches.push(cur);
      for (let i = 0; i < batches.length; i++) {
        await api('POST', { chats: batches[i], deleted: i === 0 ? del : {}, settings: i === 0 ? settings : null, settingsAt: meta.settingsAt }, keepalive);
        batches[i].forEach((c) => { meta.dirty = meta.dirty.filter((x) => x !== c.id); });
      }
      if (settings) meta.settingsPushed = meta.settingsAt;
      Object.keys(del).forEach((id) => { delete meta.del[id]; });
      saveMeta();
    } finally { pushing = false; }
  }

  async function pull() {
    if (!active()) return false;
    lastPull = Date.now();
    const r = await api('GET');
    if (!r.enabled) { enabled = false; return false; }
    let chats = rd(CHATS_KEY, []);
    const local = {}; chats.forEach((c) => { local[c.id] = c; if (!c.updatedAt) c.updatedAt = c.createdAt || 1; });
    const remote = {}; (r.chats || []).forEach((c) => { remote[c.id] = c; });
    let changed = false;

    // удаления, сделанные на других устройствах
    Object.entries(r.deleted || {}).forEach(([id, ts]) => {
      if (local[id] && ts > (local[id].updatedAt || 0)) { delete local[id]; delete meta.h[id]; changed = true; }
    });
    // чаты с сервера
    Object.values(remote).forEach((rc) => {
      const lc = local[rc.id], lt = meta.del[rc.id];
      if (lt && lt > (rc.updatedAt || 0)) return;                  // мы удалили позже — сервер получит удаление
      if (!lc) { local[rc.id] = rc; meta.h[rc.id] = chatHash(rc); changed = true; }
      else if ((rc.updatedAt || 0) > (lc.updatedAt || 0)) { local[rc.id] = restoreData(rc, lc); meta.h[rc.id] = chatHash(rc); changed = true; }
    });
    // что у нас новее или отсутствует на сервере — в очередь на отправку
    Object.values(local).forEach((lc) => {
      const rc = remote[lc.id];
      if (!meta.h[lc.id]) meta.h[lc.id] = chatHash(lc);
      if ((!rc || (lc.updatedAt || 0) > (rc.updatedAt || 0)) && !meta.dirty.includes(lc.id)) meta.dirty.push(lc.id);
    });
    chats = Object.values(local).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    wr(CHATS_KEY, chats);

    // настройки
    if (r.settings && (r.settingsAt || 0) > (meta.settingsAt || 0)) {
      const cur = rd(SETTINGS_KEY, {});
      const merged = Object.assign({}, r.settings); LOCAL_ONLY.forEach((k) => { if (cur[k] !== undefined) merged[k] = cur[k]; });
      wr(SETTINGS_KEY, merged);
      meta.settingsAt = r.settingsAt; meta.settingsPushed = r.settingsAt; meta.settingsH = hash(JSON.stringify(cleanSettings(merged)));
      changed = true;
    } else if (!r.settings || (meta.settingsAt || 0) > (r.settingsAt || 0)) {
      if (!meta.settingsAt) { meta.settingsH = hash(JSON.stringify(cleanSettings(rd(SETTINGS_KEY, {})))); meta.settingsAt = 1; }
      meta.settingsPushed = 0;
    }
    saveMeta();
    await push();
    return changed;
  }

  // Старт: определяем владельца локальных данных и подтягиваем аккаунт.
  async function start() {
    const u = user();
    if (!u) return;
    if (meta.owner && meta.owner !== u.id) { wipeLocal(); }   // в браузере остались данные другого аккаунта
    meta.owner = u.id; saveMeta();
    try {
      const j = await Promise.race([api('GET'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500))]);
      enabled = !!j.enabled;
    } catch { enabled = false; }
    if (!enabled) return;
    try { await pull(); } catch {}
  }

  function wipeLocal() {
    try { localStorage.removeItem(CHATS_KEY); } catch {}
    meta = { owner: null, h: {}, del: {}, settingsAt: 0, settingsH: '', dirty: [] };
    saveMeta();
  }

  async function onLogout() {
    clearTimeout(timer);
    try { await push(); } catch {}
    enabled = false; wipeLocal();
    emit('logout');
  }

  async function refresh() {
    if (!active() || Date.now() - lastPull < PULL_COOLDOWN) return;
    try { if (await pull()) emit('pull'); } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(timer); push(true).catch(() => {}); }
    else refresh();
  });
  window.addEventListener('online', () => { schedule(); refresh(); });
  window.addEventListener('pagehide', () => { push(true).catch(() => {}); });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);

  window.KulshSync = { start, chatsChanged, settingsChanged, onLogout, refresh, get enabled() { return enabled; } };
})();
