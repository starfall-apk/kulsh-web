// app.js — KulshAI front-end logic
(function () {
  'use strict';

  // ============================================================
  // MODELS
  // ============================================================
  const MODELS = [
    // ---- Google Gemini ----
    { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'google', vision: true,  mult: 1,   icon: 'bolt',         tone: 'amber', desc: { ru: 'Стабильная, быстрая модель', en: 'Stable, fast model' } },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google', vision: true,  mult: 1,   icon: 'flash_on',     tone: 'sky',   desc: { ru: 'Самая быстрая и лёгкая', en: 'Fastest and lightest' } },
    { id: 'gemini-3.5-flash',      name: 'Gemini 3.5 Flash',      provider: 'google', vision: true,  mult: 1.5, icon: 'auto_awesome', tone: 'mint',  desc: { ru: 'Баланс скорости и качества', en: 'Balance of speed and quality' } },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', provider: 'google', vision: true,  mult: 1.5, icon: 'speed',        tone: 'sky',   desc: { ru: 'Облегчённая версия 3.5', en: 'Lightweight 3.5 variant' } },
    { id: 'gemini-3.6-flash',      name: 'Gemini 3.6 Flash',      provider: 'google', vision: true,  mult: 3,   icon: 'auto_awesome', tone: 'mint',  desc: { ru: 'Улучшенное рассуждение', en: 'Improved reasoning' } },
    { id: 'gemini-3.7-flash',      name: 'Gemini 3.7 Flash',      provider: 'google', vision: true,  mult: 3,   icon: 'auto_awesome', tone: 'rose',  desc: { ru: 'Новее и точнее', en: 'Newer and more accurate' } },
    { id: 'gemini-3.8-flash',      name: 'Gemini 3.8 Flash',      provider: 'google', vision: true,  mult: 3,   icon: 'auto_awesome', tone: 'rose',  desc: { ru: 'Самая новая модель линейки', en: 'The newest in the lineup' } },
    // ---- NeutralBeats ----
    { id: 'deepseek-v4.1-flash',   name: 'DeepSeek V4.1 Flash',   provider: 'neutralbeats', vision: true,  mult: 1, icon: 'psychology', tone: 'mint',  desc: { ru: 'Выгодная и умная, большой контекст', en: 'Great value, large context' } },
    { id: 'deepseek-v4-pro',       name: 'DeepSeek V4 Pro',       provider: 'neutralbeats', vision: false, mult: 2, icon: 'neurology',  tone: 'sky',   desc: { ru: 'Усиленное рассуждение, без зрения', en: 'Strong reasoning, no vision' } },
    { id: 'glm-5.3-flash',         name: 'GLM 5.3 Flash',         provider: 'neutralbeats', vision: true,  mult: 1, icon: 'bolt',       tone: 'mint',  desc: { ru: 'Быстрая и аккуратная', en: 'Fast and precise' } },
    { id: 'kimi-k3',               name: 'Kimi K3',               provider: 'neutralbeats', vision: true,  mult: 3, icon: 'star',       tone: 'amber', desc: { ru: 'Сильна в длинных текстах', en: 'Strong with long text' } },
  ];

  // Человекочитаемые названия провайдеров для группировки в списке моделей.
  const PROVIDER_LABELS = { google: 'Google Gemini', neutralbeats: 'NeutralBeats' };
  const PROVIDER_ORDER = ['google', 'neutralbeats'];
  const modelById = (id) => MODELS.find((m) => m.id === id) || null;


  // Уровни усилий.
  const EFFORTS = [
    { id: 'low',    icon: 'bolt',       tone: 'sky'  },
    { id: 'medium', icon: 'balance',    tone: 'mint' },
    { id: 'high',   icon: 'psychology', tone: 'rose' },
  ];

  // Маскот пустого чата — моаи (четыре версии анимации)
  const LOTTIES = ['moai', 'moai2', 'freedom', 'wine'];

  const ACCENTS = ['violet', 'rose', 'teal', 'amber'];

  // ============================================================
  // STORAGE
  // ============================================================
  const STORE_KEY = 'kulshgpt.chats.v1';
  const SETTINGS_KEY = 'kulshgpt.settings.v1';

  function loadChats() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveChats(chats) {
    try { if (window.KulshSync) window.KulshSync.chatsChanged(chats); } catch {}
    try { localStorage.setItem(STORE_KEY, JSON.stringify(chats)); } catch {}
  }
  function loadSettings() {
    const defaults = {
      lang: (function () { try { const n = (navigator.language || 'ru').toLowerCase(); return n.indexOf('ru') === 0 ? 'ru' : 'en'; } catch { return 'ru'; } })(),
      theme: 'dark',
      accent: 'violet',
      animatedBg: true,
      fontSize: 'md',
      sendOnEnter: true,
      defaultModel: 'gemini-2.5-flash',
      voiceAutoplay: false,
      voiceRate: 1,
      voiceURI: '',
      autoScroll: true,
      showHint: true,
      temperature: 0.9,
      customPrompt: '',
      chatWidth: 'normal',
      density: 'normal',
      fontFamily: 'gsans',
      reduceMotion: false,
      effort: 'medium',
      skills: [],
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const st = raw ? Object.assign(defaults, JSON.parse(raw)) : defaults;
      if (st.fontFamily === 'roboto') st.fontFamily = 'gsans';
      else if (st.fontFamily === 'flex') st.fontFamily = 'rflex';
      if (!st.effort) st.effort = 'medium';
      delete st.showAvatars; delete st.showNames; delete st.lottie;
      return st;
    } catch { return defaults; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
    try { if (window.KulshSync) window.KulshSync.settingsChanged(s); } catch {}
  }

  // ============================================================
  // STATE
  // ============================================================
  const AppState = {
    chats: loadChats(),
    activeChatId: null,
    settings: loadSettings(),
    pendingAttachments: [],
    isStreaming: false,
    stoppedByUser: false,
  };
  window.AppState = AppState;

  let currentAbort = null;

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function getActiveChat() {
    return AppState.chats.find((c) => c.id === AppState.activeChatId) || null;
  }

  function createChat() {
    const chat = {
      id: uid(),
      title: null,
      model: AppState.settings.defaultModel,
      messages: [],
      createdAt: Date.now(),
    };
    AppState.chats.unshift(chat);
    AppState.activeChatId = chat.id;
    saveChats(AppState.chats);
    return chat;
  }

  // ============================================================
  // DOM REFS
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    app: $('#app'),
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebarToggle'),
    sidebarOpenBtn: $('#sidebarOpenBtn'),
    sidebarBackdrop: $('#sidebarBackdrop'),
    newChatBtn: $('#newChatBtn'),
    chatSearch: $('#chatSearch'),
    chatList: $('#chatList'),
    settingsBtn: $('#settingsBtn'),

    modelPicker: $('#modelPicker'),
    modelPickerBtn: $('#modelPickerBtn'),
    modelPickerName: $('#modelPickerName'),
    modelPickerMenu: $('#modelPickerMenu'),

    chatScroll: $('#chatScroll'),
    emptyState: $('#emptyState'),
    emptyLottie: $('#emptyLottie'),
    suggestionGrid: $('#suggestionGrid'),
    messages: $('#messages'),

    attachmentTray: $('#attachmentTray'),
    attachBtn: $('#attachBtn'),
    fileInput: $('#fileInput'),
    composerInput: $('#composerInput'),
    micBtn: $('#micBtn'),
    sendBtn: $('#sendBtn'),

    settingsBackdrop: $('#settingsBackdrop'),
    settingsDialog: $('#settingsDialog'),
    settingsCloseBtn: $('#settingsCloseBtn'),
    settingsTabs: $('#settingsTabs'),

    langSegmented: $('#langSegmented'),
    defaultModelSelect: $('#defaultModelSelect'),
    sendOnEnterSwitch: $('#sendOnEnterSwitch'),
    themeSegmented: $('#themeSegmented'),
    accentSwatches: $('#accentSwatches'),
    animatedBgSwitch: $('#animatedBgSwitch'),
    fontSizeSegmented: $('#fontSizeSegmented'),
    autoplaySwitch: $('#autoplaySwitch'),
    voiceSelect: $('#voiceSelect'),
    voiceRate: $('#voiceRate'),
    exportChatsBtn: $('#exportChatsBtn'),
    clearChatsBtn: $('#clearChatsBtn'),

    skillsBackdrop: $('#skillsBackdrop'),
    skillsDialog: $('#skillsDialog'),
    skillsCloseBtn: $('#skillsCloseBtn'),
    skillsBuiltin: $('#skillsBuiltin'),
    skillsMine: $('#skillsMine'),
    skillsAddBtn: $('#skillsAddBtn'),
    skillsUploadBtn: $('#skillsUploadBtn'),
    skillsFile: $('#skillsFile'),
    skillsForm: $('#skillsForm'),
    skillTitle: $('#skillTitle'),
    skillId: $('#skillId'),
    skillContent: $('#skillContent'),
    skillCancelBtn: $('#skillCancelBtn'),
    skillSaveBtn: $('#skillSaveBtn'),
    skillsGuestHint: $('#skillsGuestHint'),
    skillsError: $('#skillsError'),

    mentionMenu: $('#mentionMenu'),
    previewDialog: $('#previewDialog'),
    previewBackdrop: $('#previewBackdrop'),

    apiDialog: $('#apiDialog'),
    apiBackdrop: $('#apiBackdrop'),
    apiCloseBtn: $('#apiCloseBtn'),
    apiList: $('#apiList'),
    apiBase: $('#apiBase'),
    apiBaseCopy: $('#apiBaseCopy'),
    apiCreateBtn: $('#apiCreateBtn'),
    apiForm: $('#apiForm'),
    apiName: $('#apiName'),
    apiCancelBtn: $('#apiCancelBtn'),
    apiCreateSubmit: $('#apiCreateSubmit'),
    apiSecret: $('#apiSecret'),
    apiError: $('#apiError'),
  };

  // ============================================================
  // THEME / SETTINGS APPLICATION
  // ============================================================
  function effectiveTheme() {
    if (AppState.settings.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return AppState.settings.theme;
  }

  function updateSliderFill(rangeEl) {
    if (!rangeEl) return;
    const min = parseFloat(rangeEl.min) || 0;
    const max = parseFloat(rangeEl.max) || 100;
    const val = parseFloat(rangeEl.value) || 0;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    rangeEl.style.setProperty('--slider-pct', pct + '%');
  }

  function refreshAllSliderFills() {
    document.querySelectorAll('.slider').forEach(updateSliderFill);
  }

  function applySettingsToDOM() {
    const root = document.documentElement;
    root.setAttribute('data-theme', effectiveTheme());
    root.setAttribute('data-accent', AppState.settings.accent);
    root.setAttribute('data-fontsize', AppState.settings.fontSize);
    root.setAttribute('data-animated-bg', AppState.settings.animatedBg ? 'on' : 'off');
    const S = AppState.settings;
    root.setAttribute('data-width', S.chatWidth);
    root.setAttribute('data-density', S.density);
    root.setAttribute('data-font', S.fontFamily);
    root.setAttribute('data-hint', S.showHint ? 'on' : 'off');
    root.setAttribute('data-motion', S.reduceMotion ? 'reduce' : 'full');
    window.applyI18n(AppState.settings.lang);
    const setSeg = (id, key) => $$('#' + id + ' .segmented-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.v === S[key]));
    setSeg('chatWidthSeg', 'chatWidth'); setSeg('densitySeg', 'density'); setSeg('fontFamilySeg', 'fontFamily');
    const setSw = (id, val) => { const n = document.getElementById(id); if (n) n.setAttribute('aria-checked', String(!!val)); };
    setSw('autoScrollSwitch', S.autoScroll); setSw('showHintSwitch', S.showHint); setSw('reduceMotionSwitch', S.reduceMotion);
    const tr = document.getElementById('tempRange'); if (tr) { tr.value = S.temperature; document.getElementById('tempVal').textContent = Number(S.temperature).toFixed(2).replace(/0$/, ''); }
    const cp = document.getElementById('customPrompt'); if (cp && document.activeElement !== cp) cp.value = S.customPrompt || '';

    $$('#langSegmented .segmented-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === AppState.settings.lang));
    $$('#themeSegmented .segmented-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.theme === AppState.settings.theme));
    $$('#fontSizeSegmented .segmented-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.size === AppState.settings.fontSize));
    el.sendOnEnterSwitch.setAttribute('aria-checked', String(AppState.settings.sendOnEnter));
    el.animatedBgSwitch.setAttribute('aria-checked', String(AppState.settings.animatedBg));
    el.autoplaySwitch.setAttribute('aria-checked', String(AppState.settings.voiceAutoplay));
    el.voiceRate.value = AppState.settings.voiceRate;
    renderAccentSwatches();
    renderModelPicker();
    renderSuggestions();
    refreshAllSliderFills();
  }

  function renderAccentSwatches() {
    const colors = { violet: '#A75FFF', rose: '#FF6FA5', teal: '#3FC6BA', amber: '#F0A93C' };
    el.accentSwatches.innerHTML = '';
    ACCENTS.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (AppState.settings.accent === a ? ' is-active' : '');
      b.style.background = colors[a];
      b.setAttribute('aria-label', a);
      b.addEventListener('click', () => {
        AppState.settings.accent = a;
        saveSettings(AppState.settings);
        applySettingsToDOM();
      });
      el.accentSwatches.appendChild(b);
    });
  }

  // ============================================================
  // SIDEBAR / CHAT LIST
  // ============================================================
  function renderChatList(filter) {
    const q = (filter || '').trim().toLowerCase();
    el.chatList.innerHTML = '';
    const chats = AppState.chats.filter((c) => !q || (c.title || '').toLowerCase().includes(q));

    if (chats.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:var(--md-on-surface-variant);font-size:.82rem;text-align:center;';
      empty.textContent = window.t('sidebar.noChats');
      el.chatList.appendChild(empty);
      return;
    }

    chats.forEach((chat) => {
      const item = document.createElement('div');
      item.className = 'chat-list-item' + (chat.id === AppState.activeChatId ? ' is-active' : '');
      item.innerHTML = `
        <span class="material-symbols-rounded">chat_bubble</span>
        <span class="chat-title"></span>
        <button class="chat-delete" aria-label="delete"><span class="material-symbols-rounded">delete</span></button>
      `;
      item.querySelector('.chat-title').textContent = chat.title || window.t('chat.newChatTitle');
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-delete')) return;
        switchToChat(chat.id);
      });
      item.querySelector('.chat-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });
      el.chatList.appendChild(item);
    });
  }

  function switchToChat(id) {
    AppState.activeChatId = id;
    renderChatList(el.chatSearch.value);
    renderMessages();
    closeSidebarOnMobile();
  }

  function deleteChat(id) {
    AppState.chats = AppState.chats.filter((c) => c.id !== id);
    saveChats(AppState.chats);
    if (AppState.activeChatId === id) {
      AppState.activeChatId = AppState.chats[0]?.id || null;
    }
    renderChatList(el.chatSearch.value);
    renderMessages();
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) {
      el.app.classList.add('sidebar-collapsed');
    }
  }

  // ============================================================
  // MODEL & EFFORT PICKER
  // ============================================================
  function renderModelPicker() {
    const chat = getActiveChat();
    const KA = window.KulshAuth;
    const currentModelId = KA.guest ? KA.GUEST_MODEL : (chat ? chat.model : AppState.settings.defaultModel);
    const current = MODELS.find((m) => m.id === currentModelId) || MODELS[0];
    el.modelPickerName.textContent = current.name.replace(/^Gemini\s*/i, '');
    const chip = document.getElementById('emptyModel');
    if (chip) chip.textContent = current.id;

    el.modelPickerMenu.innerHTML = '';
    const lang = AppState.settings.lang;
    PROVIDER_ORDER.forEach((prov) => {
      const list = MODELS.filter((m) => m.provider === prov);
      if (!list.length) return;
      const head = document.createElement('div');
      head.className = 'model-menu-section';
      head.textContent = PROVIDER_LABELS[prov] || prov;
      el.modelPickerMenu.appendChild(head);

      list.forEach((m) => {
        const locked = KA.guest && m.id !== KA.GUEST_MODEL;
        const opt = document.createElement('button');
        opt.className = 'model-option' + (m.id === currentModelId ? ' is-selected' : '') + (locked ? ' is-locked' : '');
        opt.setAttribute('role', 'option');
        opt.innerHTML = `
          <span class="model-option-icon tone-${m.tone || 'mint'}"><span class="material-symbols-rounded">${m.icon}</span></span>
          <span class="model-option-text">
            <span class="model-option-name">${m.name}</span>
            <span class="model-option-desc">${m.desc[lang] || m.desc.ru}</span>
          </span>
          ${locked ? '<span class="lock">' + KA.ICON.lock + '</span>' : (m.id === currentModelId ? '<span class="material-symbols-rounded check">check</span>' : '')}
        `;
        opt.addEventListener('click', () => {
          if (locked) { closeModelPicker(); KA.open(KA.t().lockedModel); return; }
          const c = getActiveChat();
          if (c) { c.model = m.id; saveChats(AppState.chats); }
          else { AppState.settings.defaultModel = m.id; saveSettings(AppState.settings); }
          renderModelPicker();
          closeModelPicker();
        });
        el.modelPickerMenu.appendChild(opt);
      });
    });

    const divider = document.createElement('div');
    divider.className = 'model-menu-section';
    divider.textContent = window.t('effort.title');
    el.modelPickerMenu.appendChild(divider);

    EFFORTS.forEach((e) => {
      const selected = (AppState.settings.effort || 'medium') === e.id;
      const opt = document.createElement('button');
      opt.className = 'model-option' + (selected ? ' is-selected' : '');
      opt.setAttribute('role', 'option');
      opt.innerHTML = `
        <span class="model-option-icon tone-${e.tone}"><span class="material-symbols-rounded">${e.icon}</span></span>
        <span class="model-option-text">
          <span class="model-option-name">${window.t('effort.' + e.id)}</span>
          <span class="model-option-desc">${window.t('effort.' + e.id + '.desc')}</span>
        </span>
        ${selected ? '<span class="material-symbols-rounded check">check</span>' : ''}
      `;
      opt.addEventListener('click', () => {
        AppState.settings.effort = e.id;
        saveSettings(AppState.settings);
        renderModelPicker();
      });
      el.modelPickerMenu.appendChild(opt);
    });
  }

  function toggleModelPicker() {
    el.modelPicker.classList.toggle('is-open');
    el.modelPickerBtn.setAttribute('aria-expanded', el.modelPicker.classList.contains('is-open'));
  }
  function closeModelPicker() {
    el.modelPicker.classList.remove('is-open');
    el.modelPickerBtn.setAttribute('aria-expanded', 'false');
  }

  // ============================================================
  // EMPTY STATE / LOTTIE / SUGGESTIONS
  // ============================================================
  let lottieInstance = null;

  function showRandomLottie(force) {
    if (lottieInstance) { lottieInstance.destroy(); lottieInstance = null; }
    el.emptyLottie.innerHTML = '';
    const pick = force || LOTTIES[Math.floor(Math.random() * LOTTIES.length)];
    el.emptyLottie.dataset.pick = pick;
    if (window.lottie) {
      lottieInstance = window.lottie.loadAnimation({
        container: el.emptyLottie,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: `/lotties/${pick}.json`,
        rendererSettings: { progressiveLoad: true },
      });
    }
  }

  function renderSuggestions() {
    const lang = AppState.settings.lang;
    const items = [
      { icon: 'lightbulb', key: 'empty.suggest1' },
      { icon: 'code', key: 'empty.suggest2' },
      { icon: 'description', key: 'empty.suggest3' },
      { icon: 'forum', key: 'empty.suggest4' },
    ];
    el.suggestionGrid.innerHTML = '';
    items.forEach((it) => {
      const card = document.createElement('button');
      card.className = 'suggestion-card';
      card.innerHTML = `<span class="material-symbols-rounded">${it.icon}</span><span class="txt"></span>`;
      card.querySelector('.txt').textContent = window.t(it.key, lang);
      card.addEventListener('click', () => {
        el.composerInput.value = window.t(it.key, lang);
        el.composerInput.focus();
        autoGrow();
      });
      el.suggestionGrid.appendChild(card);
    });
  }

  // ============================================================
  // MARKDOWN RENDERING
  // ============================================================
  function cleanRecall(t) { return String(t || '').replace(/[ \t]*!recall_media\b/gi, ''); }

  function escapeAttr(v) { return escapeHtml(v).replace(/"/g, '&quot;'); }

  // ---------- Формулы (KaTeX) ----------
  const mathCache = new Map();
  function renderMath(tex, display) {
    const key = (display ? 'D' : 'I') + tex;
    if (mathCache.has(key)) return mathCache.get(key);
    let html;
    if (window.katex) {
      try {
        html = window.katex.renderToString(tex.trim(), { displayMode: display, throwOnError: false, strict: 'ignore', trust: false });
      } catch (e) { html = '<span class="math-err">' + escapeHtml(tex) + '</span>'; }
    } else {
      html = '<code>' + escapeHtml(tex) + '</code>';
    }
    if (display) html = '<div class="math-block">' + html + '</div>';
    if (mathCache.size > 400) mathCache.clear();
    mathCache.set(key, html);
    return html;
  }
  const MATH_INLINE = /(?<![\\$\w])\$(?![\s$])((?:[^$\n\\]|\\.)+?)(?<![\s\\])\$(?![\d$\w])/g;
  const MATH_ENV = /\\begin\{(equation\*?|align\*?|aligned|gather\*?|cases|pmatrix|bmatrix|vmatrix|matrix)\}[\s\S]+?\\end\{\1\}/g;

  function mathPass(seg, isLast, opts, tok) {
    seg = seg
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => tok(renderMath(t, true)))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => tok(renderMath(t, true)))
      .replace(MATH_ENV, (m) => tok(renderMath(m, true)))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => tok(renderMath(t, false)))
      .replace(MATH_INLINE, (_, t) => tok(renderMath(t, false)));
    if (opts.streaming && isLast) {
      const k = seg.search(/\$\$|\\\[|\\begin\{/);
      if (k >= 0) {
        seg = seg.slice(0, k) + tok('<div class="math-pending"><span class="material-symbols-rounded">functions</span><span>' + window.t('math.pending') + '</span></div>');
      }
    }
    return seg;
  }

  // ---------- Чек-листы ----------
  const TODO_STATUS = { ' ': 'todo', x: 'done', X: 'done', '~': 'active', '>': 'active', '!': 'fail' };
  const todoSeen = new Map();

  function parseTodo(body) {
    const items = []; let title = '';
    body.split('\n').forEach((line) => {
      const t = line.match(/^\s*(?:title|заголовок)\s*:\s*(.+)$/i);
      if (t && !items.length) { title = t[1].trim(); return; }
      const m = line.match(/^\s*[-*+]\s*\[([ xX~>!])\]\s+(.+?)\s*$/);
      if (m) items.push({ status: TODO_STATUS[m[1]], text: m[2] });
    });
    return { title, items };
  }

  const TODO_CHECK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path class="tk" d="M4 9.5l3.5 3.5L14 5.5"/><path class="tx" d="M5 5l8 8M13 5l-8 8"/></svg>';

  function todoInline(t) {
    return escapeHtml(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }

  function buildTodoCard(g, ctx) {
    const ov = (ctx.msg && ctx.msg.todoOverrides && ctx.msg.todoOverrides[g.key]) || {};
    const items = g.items.map((it, i) => {
      const o = ov[i];
      return { text: it.text, base: it.status, status: (o && o.base === it.status) ? o.to : it.status };
    });
    const total = items.length;
    const done = items.filter((i) => i.status === 'done').length;
    const pct = total ? Math.round((done * 100) / total) : 0;
    const complete = total > 0 && done === total;

    const now = Date.now();
    const seenKey = (ctx.msgId || '') + '|' + g.key;
    const rec = todoSeen.get(seenKey);
    const at = items.map((it, i) => (rec ? (rec.st[i] !== it.status ? now : rec.at[i]) : 0));
    todoSeen.set(seenKey, { st: items.map((i) => i.status), at });
    const FRESH_MS = 700;
    const fresh = (i) => !!rec && at[i] > 0 && now - at[i] < FRESH_MS;
    const ad = (i) => (fresh(i) ? ' style="--ad:-' + (now - at[i]) + 'ms"' : '');

    const cls = (st) => 'is-' + st;
    const segs = items.map((it, i) => '<span class="todo-seg ' + cls(it.status) + (fresh(i) ? ' is-new' : '') + '"' + ad(i) + '></span>').join('');
    const rows = items.map((it, i) =>
      '<li><button type="button" class="todo-item ' + cls(it.status) + (fresh(i) ? ' is-new' : '') + '" role="checkbox" aria-checked="' + (it.status === 'done') + '"'
      + ' data-i="' + i + '" data-base="' + it.base + '"' + ad(i) + '><span class="todo-box">' + TODO_CHECK + '</span><span class="todo-text">' + todoInline(it.text) + '</span></button></li>'
    ).join('');

    return '<div class="todo' + (complete ? ' is-complete' : '') + '" data-key="' + escapeAttr(g.key) + '" style="--spin-d:-' + (now % 900) + 'ms;--pulse-d:-' + (now % 1400) + 'ms">'
      + '<div class="todo-head"><span class="todo-ico"><span class="material-symbols-rounded">' + (complete ? 'done_all' : 'checklist') + '</span></span>'
      + '<span class="todo-title">' + escapeHtml(g.title || window.t('todo.defaultTitle')) + '</span>'
      + '<span class="todo-count"><b>' + done + '</b>/' + total + '</span><span class="todo-pct">' + pct + '%</span></div>'
      + (total ? '<div class="todo-bar" style="--n:' + total + '">' + segs + '</div>' : '')
      + '<ul class="todo-list">' + rows + '</ul></div>';
  }

  // ---------- Файлы от бота ----------
  function parseFileAttrs(s) {
    const attrs = {};
    if (!s) return attrs;
    const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = m[2];
    return attrs;
  }

  function fileIconName(name) {
    const n = String(name || '').toLowerCase();
    const ext = n.includes('.') ? n.split('.').pop() : '';
    if (['zip','rar','7z','tar','gz','bz2','xz'].includes(ext)) return 'folder_zip';
    if (['png','jpg','jpeg','gif','webp','svg','bmp','ico','avif'].includes(ext)) return 'image';
    if (['json','xml','yaml','yml','toml'].includes(ext)) return 'data_object';
    if (['md','txt','log','rst'].includes(ext)) return 'description';
    if (['py','js','mjs','ts','tsx','jsx','html','htm','css','scss','java','go','rs','c','h','cpp','hpp','rb','php','sh','bash','zsh','sql'].includes(ext)) return 'code';
    return 'description';
  }

  function formatBytes(n) {
    const b = Math.max(0, n | 0);
    if (b < 1024) return b + ' Б';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace('.0', '') + ' КБ';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1).replace('.0', '') + ' МБ';
    return (b / 1024 / 1024 / 1024).toFixed(2) + ' ГБ';
  }

  function buildFileCard(attrs, content) {
    const name = (attrs.name || attrs.filename || 'file.txt').trim();
    const encoding = ((attrs.encoding || 'text').toLowerCase() === 'base64') ? 'base64' : 'text';
    const bytes = encoding === 'base64'
      ? Math.floor((content.replace(/\s+/g, '').length * 3) / 4)
      : new Blob([content]).size;
    const icon = fileIconName(name);
    const dlLabel = (AppState.settings.lang === 'en') ? 'Download' : 'Скачать';
    return '<div class="file-card" data-name="' + escapeAttr(name) + '" data-encoding="' + encoding + '">'
      + '<span class="file-card-icon material-symbols-rounded">' + icon + '</span>'
      + '<div class="file-card-meta">'
      +   '<span class="file-card-name">' + escapeHtml(name) + '</span>'
      +   '<span class="file-card-size">' + formatBytes(bytes) + '</span>'
      + '</div>'
      + '<button type="button" class="file-card-dl">'
      +   '<span class="material-symbols-rounded">download</span>'
      +   '<span>' + dlLabel + '</span>'
      + '</button>'
      + '<textarea class="file-card-content" hidden>' + escapeHtml(content) + '</textarea>'
      + '</div>';
  }

  function downloadFileCard(card) {
    if (!card) return;
    const name = card.dataset.name || 'file';
    const encoding = card.dataset.encoding;
    const ta = card.querySelector('.file-card-content');
    const content = ta ? ta.value : '';
    let blob;
    try {
      if (encoding === 'base64') {
        const clean = content.replace(/\s+/g, '');
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: 'application/octet-stream' });
      } else {
        blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      }
    } catch (e) {
      console.error('[file] decode failed', e);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ---------- Копирование с визуальной отдачей ----------
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove(); resolve();
      } catch (e) { reject(e); }
    });
  }
  function flashCopied(btn, text) {
    copyText(text).catch(() => {});
    const parent = btn.parentNode;
    if (!parent) return;
    let flash = parent.querySelector('.copy-flash');
    if (!flash) {
      flash = document.createElement('span');
      flash.className = 'copy-flash';
      parent.insertBefore(flash, btn.nextSibling);
    }
    flash.textContent = window.t('chat.copied');
    flash.classList.add('is-on');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => flash.classList.remove('is-on'), 1500);
  }

  // ---------- Безопасная отрисовка HTML (превью скиллов/файлов) ----------
  function sanitizeHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach((n) => n.remove());
    tpl.content.querySelectorAll('*').forEach((n) => {
      for (const a of Array.from(n.attributes)) {
        const nm = a.name.toLowerCase();
        if (nm.startsWith('on')) n.removeAttribute(a.name);
        else if ((nm === 'href' || nm === 'src' || nm === 'xlink:href') && /^\s*(javascript|data:text\/html)/i.test(a.value)) n.removeAttribute(a.name);
      }
    });
    return tpl.innerHTML;
  }
  function renderSafeMarkdown(md) {
    if (!window.marked) return '<pre class="preview-plain">' + escapeHtml(md || '') + '</pre>';
    window.marked.setOptions({ breaks: true, gfm: true });
    try { return sanitizeHTML(window.marked.parse(md || '')); } catch { return '<pre class="preview-plain">' + escapeHtml(md || '') + '</pre>'; }
  }

  // ---------- ZIP на клиенте (store, без сжатия — зато всегда валидный) ----------
  let crcTableCache = null;
  function crc32(bytes) {
    if (!crcTableCache) {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
      crcTableCache = t;
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTableCache[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function buildZip(files) {
    const enc = new TextEncoder();
    const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data || new Uint8Array(0);
      const crc = crc32(data);
      const size = data.length;
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
      ]);
      parts.push(local, nameBytes, data);
      const localOff = offset;
      offset += local.length + nameBytes.length + data.length;
      central.push(new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
        ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(localOff),
      ]), nameBytes);
    }
    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(cdSize), ...u32(offset), ...u16(0),
    ]);
    return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
  }
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function fileCardBytes(card) {
    const encoding = card.dataset.encoding;
    const content = (card.querySelector('.file-card-content') || {}).value || '';
    if (encoding === 'base64') {
      try {
        const bin = atob(content.replace(/\s+/g, ''));
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
      } catch { return new Uint8Array(0); }
    }
    return new TextEncoder().encode(content);
  }
  function downloadMessageZip(node) {
    const cards = node ? node.querySelectorAll('.file-card') : [];
    if (cards.length < 2) return;
    const files = Array.from(cards).map((c) => ({ name: c.dataset.name || 'file', data: fileCardBytes(c) }));
    let blob;
    try { blob = buildZip(files); } catch (e) { console.error('[zip] failed', e); return; }
    const chat = getActiveChat();
    const base = (chat && chat.title ? chat.title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40) : '') || 'kulsh-files';
    triggerDownload(blob, base + '.zip');
  }

  // ---------- Универсальный предпросмотр (скиллы и файлы) ----------
  const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', pdf: 'application/pdf', zip: 'application/zip' };
  const CODE_EXT = ['py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'htm', 'css', 'scss', 'less', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'sh', 'bash', 'zsh', 'ps1', 'sql', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml', 'svg', 'txt', 'log', 'csv', 'md', 'markdown', 'bat', 'cmd', 'kt', 'swift', 'dart', 'lua', 'r', 'pl'];
  function fileKind(name) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
    if (CODE_EXT.includes(ext)) return 'code';
    return 'binary';
  }
  function decodeBase64Blob(content, mime) {
    try {
      const bin = atob(String(content).replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime || 'application/octet-stream' });
    } catch { return null; }
  }

  const Preview = {
    state: null,
    els: null,
    ensure() {
      if (this.els) return this.els;
      const E = {
        backdrop: $('#previewBackdrop'), dialog: $('#previewDialog'),
        title: $('#previewTitle'), subtitle: $('#previewSubtitle'), icon: $('#previewIcon'),
        seg: $('#previewSeg'), body: $('#previewBody'), download: $('#previewDownload'), close: $('#previewClose'),
      };
      if (!E.dialog) return null;
      E.close.addEventListener('click', () => this.close());
      E.backdrop.addEventListener('click', () => this.close());
      E.seg.addEventListener('click', (e) => {
        const b = e.target.closest('.segmented-btn');
        if (b && this.state) this.render(b.dataset.view);
      });
      E.download.addEventListener('click', () => { if (this.state && this.state.download) this.state.download(); });
      this.els = E;
      return E;
    },
    open(state) {
      const E = this.ensure();
      if (!E) return;
      this.state = state;
      E.icon.textContent = state.icon || 'description';
      E.title.textContent = state.title || '';
      E.subtitle.textContent = state.subtitle || '';
      const toggle = state.kind === 'md' || state.kind === 'html';
      E.seg.hidden = !toggle;
      E.download.hidden = !state.download;
      this.render(toggle ? (state.initial || 'render') : 'code');
      E.backdrop.classList.add('is-open');
      E.dialog.classList.add('is-open');
    },
    render(view) {
      const E = this.els, s = this.state;
      if (!E || !s) return;
      Array.from(E.seg.querySelectorAll('.segmented-btn')).forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
      E.body.innerHTML = '';
      if (view === 'render' && s.kind === 'md') {
        E.body.innerHTML = '<div class="md-preview">' + renderSafeMarkdown(s.code || '') + '</div>';
      } else if (view === 'render' && s.kind === 'html') {
        const frame = document.createElement('iframe');
        frame.className = 'html-preview';
        frame.setAttribute('sandbox', '');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.srcdoc = s.code || '';
        E.body.appendChild(frame);
      } else if (s.kind === 'image') {
        const img = document.createElement('img');
        img.className = 'image-preview';
        img.alt = s.title || '';
        img.src = s.objectUrl || '';
        E.body.appendChild(img);
      } else if (s.kind === 'binary') {
        const note = document.createElement('div');
        note.className = 'preview-note';
        note.innerHTML = '<span class="material-symbols-rounded">info</span><span>' + escapeHtml(window.t('preview.none')) + '</span>';
        E.body.appendChild(note);
      } else {
        const pre = document.createElement('pre');
        pre.className = 'preview-code';
        const code = document.createElement('code');
        code.textContent = s.code || '';
        pre.appendChild(code);
        E.body.appendChild(pre);
      }
    },
    close() {
      const E = this.els;
      if (!E) return;
      E.backdrop.classList.remove('is-open');
      E.dialog.classList.remove('is-open');
      if (this.state && this.state.objectUrl) { try { URL.revokeObjectURL(this.state.objectUrl); } catch {} }
      this.state = null;
      E.body.innerHTML = '';
    },
  };

  function openFilePreview(card) {
    if (!card) return;
    const name = card.dataset.name || 'file';
    const encoding = card.dataset.encoding;
    const content = (card.querySelector('.file-card-content') || {}).value || '';
    const kind = fileKind(name);
    const download = () => downloadFileCard(card);
    if (encoding === 'base64') {
      const ext = (name.split('.').pop() || '').toLowerCase();
      const blob = decodeBase64Blob(content, MIME_BY_EXT[ext]);
      if (kind === 'image' && blob) {
        Preview.open({ title: name, subtitle: formatBytes(blob.size), icon: 'image', kind: 'image', objectUrl: URL.createObjectURL(blob), download });
      } else {
        Preview.open({ title: name, subtitle: window.t('preview.binary'), icon: 'folder_zip', kind: 'binary', download });
      }
      return;
    }
    const k = (kind === 'md' || kind === 'html') ? kind : 'code';
    Preview.open({
      title: name, subtitle: window.t('preview.text'), icon: fileIconName(name),
      kind: k, code: content, initial: (kind === 'md' || kind === 'html') ? 'render' : 'code', download,
    });
  }

  // ============================================================
  // API-КЛЮЧИ (публичный API /api/v1)
  // ============================================================
  let apiKeys = [];

  const apiBaseUrl = () => (location.origin || 'https://kulsh.vercel.app') + '/api/v1';

  async function loadApiKeys() {
    try {
      const j = await fetch('/api/keys', { cache: 'no-store' }).then((r) => r.json());
      apiKeys = Array.isArray(j.keys) ? j.keys : [];
    } catch { apiKeys = []; }
    return apiKeys;
  }

  function renderApiKeys() {
    if (!el.apiList) return;
    if (el.apiBase) el.apiBase.textContent = apiBaseUrl();
    if (!apiKeys.length) {
      el.apiList.innerHTML = `<p class="skills-empty">${escapeHtml(window.t('api.empty'))}</p>`;
      return;
    }
    el.apiList.innerHTML = apiKeys.map((k) => `
      <div class="skills-item" data-key="${escapeAttr(k.id)}">
        <span class="skills-ico"><span class="material-symbols-rounded">key</span></span>
        <span class="skills-txt">
          <span class="skills-name">${escapeHtml(k.name)}</span>
          <span class="skills-desc"><code>${escapeHtml(k.prefix)}</code></span>
        </span>
        <button class="skills-del" type="button" data-revoke="${escapeAttr(k.id)}" aria-label="${escapeAttr(window.t('api.revoke'))}"><span class="material-symbols-rounded">delete</span></button>
      </div>`).join('');
  }

  async function openApi() {
    if (!el.apiDialog) return;
    el.apiBackdrop.classList.add('is-open');
    el.apiDialog.classList.add('is-open');
    el.apiForm.hidden = true;
    el.apiSecret.hidden = true;
    el.apiError.hidden = true;
    await loadApiKeys();
    renderApiKeys();
  }
  function closeApi() {
    if (!el.apiDialog) return;
    el.apiBackdrop.classList.remove('is-open');
    el.apiDialog.classList.remove('is-open');
    el.apiForm.hidden = true;
    el.apiSecret.hidden = true;
    el.apiError.hidden = true;
  }
  function showApiError(msg) { if (el.apiError) { el.apiError.textContent = msg; el.apiError.hidden = false; } }

  function showApiSecret(secret) {
    if (!el.apiSecret) return;
    el.apiSecret.hidden = false;
    el.apiSecret.innerHTML = `<div class="api-secret-warn"><span class="material-symbols-rounded">warning</span><span>${escapeHtml(window.t('api.secretWarn'))}</span></div>
      <div class="api-secret-row"><code class="api-secret-key">${escapeHtml(secret)}</code>
      <button class="btn btn-tonal btn-sm" id="apiSecretCopy" type="button"><span class="material-symbols-rounded">content_copy</span><span>${escapeHtml(window.t('chat.copy'))}</span></button></div>`;
    el.apiSecret.querySelector('#apiSecretCopy').addEventListener('click', (e) => flashCopied(e.currentTarget, secret));
  }

  async function createApiKey() {
    const name = (el.apiName.value || '').trim();
    el.apiCreateSubmit.disabled = true;
    try {
      const r = await fetch('/api/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok || !j.secret) throw new Error((j && j.error) || 'fail');
      apiKeys = [j.key, ...apiKeys];
      el.apiName.value = '';
      el.apiForm.hidden = true;
      el.apiError.hidden = true;
      renderApiKeys();
      showApiSecret(j.secret);
    } catch {
      showApiError(window.t('api.error'));
    } finally {
      el.apiCreateSubmit.disabled = false;
    }
  }

  async function revokeApiKey(id) {
    try { await fetch('/api/keys?id=' + encodeURIComponent(id), { method: 'DELETE' }); } catch {}
    apiKeys = apiKeys.filter((k) => k.id !== id);
    renderApiKeys();
  }

  // ---------- Markdown ----------
  function renderMarkdown(text, opts) {
    opts = opts || {};
    text = cleanRecall(text);
    if (!window.marked) return escapeHtml(text);

    const store = [];
    const tok = (html) => { store.push(html); return '\uE000' + (store.length - 1) + '\uE001'; };
    const groups = new Map();

    const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/);
    const out = parts.map((part, i) => {
      if (i % 2 === 0) return mathPass(part, i === parts.length - 1, opts, tok);

      // 1) Блок файла: ```file name="..." encoding="..."
      // Требуем закрывающий ```, иначе во время стрима показываем обычный код.
      const fileM = part.match(/^```file\b([^\n]*)\n?([\s\S]*?)\n?```\s*$/i);
      if (fileM) {
        const attrs = parseFileAttrs(fileM[1]);
        let body = fileM[2] || '';
        if (body.endsWith('\n')) body = body.slice(0, -1);
        return '\n\n' + tok(buildFileCard(attrs, body)) + '\n\n';
      }

      // 2) Блок чек-листа
      const fm = part.match(/^```[ \t]*(?:todo|checklist|tasks)\b[^\n]*\n?([\s\S]*?)(?:\n?```)?$/i);
      if (!fm) return part;
      const parsed = parseTodo(fm[1]);
      const closed = /\n```\s*$/.test(part);
      const key = (parsed.title || '').trim().toLowerCase();
      const g = groups.get(key);
      if (!g) {
        const ti = store.push('') - 1;
        groups.set(key, { key, title: parsed.title, items: parsed.items, ti });
        return '\n\n\uE000' + ti + '\uE001\n\n';
      }
      if (closed || parsed.items.length >= g.items.length) {
        g.items = parsed.items;
        if (parsed.title) g.title = parsed.title;
      }
      return '';
    });
    groups.forEach((g) => { store[g.ti] = buildTodoCard(g, opts); });

    window.marked.setOptions({ breaks: true, gfm: true });
    let html = window.marked.parse(out.join(''));
    html = html.replace(/<p>\s*(\uE000\d+\uE001)\s*<\/p>/g, '$1');
    html = html.replace(/\uE000(\d+)\uE001/g, (_, i) => store[+i] || '');
    html = html.replace(/<table>/g, '<div class="table-wrap"><div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div></div>');
    return html;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function enhanceCodeBlocks(container) {
    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.dataset.enhanced) return;
      pre.dataset.enhanced = '1';

      if (!pre.querySelector('.pre-scroll')) {
        const scrollWrap = document.createElement('div');
        scrollWrap.className = 'pre-scroll';
        while (pre.firstChild) scrollWrap.appendChild(pre.firstChild);
        pre.appendChild(scrollWrap);
      }

      const codeEl = pre.querySelector('code');
      const lm = codeEl && /language-([\w+#.-]+)/.exec(codeEl.className || '');
      if (lm) {
        const lang = document.createElement('span');
        lang.className = 'code-lang';
        lang.textContent = lm[1];
        pre.appendChild(lang);
      }

      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.innerHTML = `<span class="material-symbols-rounded">content_copy</span><span>${window.t('chat.copy')}</span>`;
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(() => {
          btn.innerHTML = `<span class="material-symbols-rounded">check</span><span>${window.t('chat.copied')}</span>`;
          setTimeout(() => {
            btn.innerHTML = `<span class="material-symbols-rounded">content_copy</span><span>${window.t('chat.copy')}</span>`;
          }, 1600);
        });
      });
      pre.appendChild(btn);
    });
  }

  // ============================================================
  // MESSAGE RENDERING
  // ============================================================
  function isNearBottom() {
    const el2 = el.chatScroll;
    return el2.scrollHeight - el2.scrollTop - el2.clientHeight < 120;
  }

  function renderMessages() {
    const chat = getActiveChat();

    if (!chat || chat.messages.length === 0) {
      el.messages.innerHTML = '';
      const wasHidden = el.emptyState.style.display !== 'flex';
      el.emptyState.style.display = 'flex';
      if (wasHidden || !lottieInstance) {
        el.emptyState.classList.remove('is-entering');
        void el.emptyState.offsetWidth;
        el.emptyState.classList.add('is-entering');
        showRandomLottie();
      }
      renderModelPicker();
      return;
    }
    el.emptyState.style.display = 'none';

    const lastMsg = chat.messages[chat.messages.length - 1];
    const existingNodes = el.messages.children;
    if (existingNodes.length === chat.messages.length && lastMsg) {
      const lastNode = existingNodes[existingNodes.length - 1];
      if (lastNode && lastNode.dataset.id === lastMsg.id) {
        const wasNearBottom = isNearBottom();
        patchMessageNode(lastNode, lastMsg);
        enhanceCodeBlocks(lastNode);
        if (wasNearBottom && AppState.settings.autoScroll) scrollToBottom();
        renderModelPicker();
        return;
      }
    }

    const wasNearBottom = isNearBottom();
    el.messages.innerHTML = '';
    chat.messages.forEach((m) => renderOneMessage(m));
    enhanceCodeBlocks(el.messages);
    if (wasNearBottom) scrollToBottom();
    renderModelPicker();
  }

  // ---------- Маскот-Моаи ----------
  function mascotSVG(state) {
    return '<svg class="mascot" data-state="' + state + '" viewBox="0 0 64 72" aria-hidden="true" focusable="false">'
      + '<ellipse class="mc-shade" cx="32" cy="69" rx="18" ry="2.2"/>'
      + '<path class="mc-drop" d="M52 10c-2.2 3.2-3.4 4.8-3.4 6.4a3.4 3.4 0 0 0 6.8 0c0-1.6-1.2-3.2-3.4-6.4z"/>'
      + '<g class="mc-head">'
      + '<path class="mc-body" d="M14 9C14 3.5 18.5 1 25 1C30 1 34 1 39 1C45.5 1 50 3.5 50 9L52 42C52 48 50 52 46 55L45 66H19L18 55C14 52 12 48 12 42Z"/>'
      + '<path class="mc-shade" d="M14 9C14 3.5 18.5 1 25 1C30 1 34 1 39 1C45.5 1 50 3.5 50 9L50.5 15H13.5Z" opacity=".28"/>'
      + '<path class="mc-ink" d="M12 21Q32 17 52 21L52.5 26Q32 22 11.5 26Z" opacity=".92"/>'
      + '<path class="mc-shade" d="M12 20.3Q32 16.5 52 20.3L52 21Q32 17.2 12 21Z" opacity=".5"/>'
      + '<g class="mc-eye"><ellipse class="mc-ink" cx="21.5" cy="32" rx="6" ry="3.8"/><circle class="mc-pupil" cx="21.5" cy="32" r="2.1"/><path class="mc-x" d="M18 29.25l7 5.5M25 29.25l-7 5.5"/></g>'
      + '<g class="mc-eye"><ellipse class="mc-ink" cx="42.5" cy="32" rx="6" ry="3.8"/><circle class="mc-pupil" cx="42.5" cy="32" r="2.1"/><path class="mc-x" d="M39 29.25l7 5.5M46 29.25l-7 5.5"/></g>'
      + '<path class="mc-ink" d="M29 26.5L35 26.5L36.5 48.5Q32 50.5 27.5 48.5Z" opacity=".9"/>'
      + '<path class="mc-shade" d="M29.2 27L32 27L32 49.5Q29.8 49.4 27.5 48.5Z" opacity=".55"/>'
      + '<rect class="mc-ink mc-mouth-ok" x="22" y="55.5" width="20" height="2.2" rx="1.1"/>'
      + '<path class="mc-line mc-mouth-bad" d="M22 57.5q2.5-3 5 0t5 0t5 0t5 0"/>'
      + '<path class="mc-line mc-crack" d="M30.5 3l-2.5 7 3.5 4-2 6" style="stroke-width:1.6"/>'
      + '<path class="mc-line" d="M45 13l-2 4 2 3.5" style="stroke-width:1.4;opacity:.55"/>'
      + '<path class="mc-line" d="M19.5 43l1.8 4-1 4" style="stroke-width:1.4;opacity:.55"/>'
      + '</g></svg>';
  }

  function mascotState(m) { return m.error ? 'oops' : (m.pending || m.streaming) ? 'think' : 'idle'; }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString(AppState.settings.lang === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  function fillContent(content, m) {
    if (m.pending) {
      content.innerHTML = '<div class="typing"><span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label"></span></div>';
      content.querySelector('.typing-label').textContent = window.t('chat.thinking');
    } else if (m.error) {
      content.innerHTML = '<div class="error-banner"><div class="error-mascot">' + mascotSVG('oops') + '</div>'
        + '<div class="error-text"><span class="error-title"></span><span class="error-msg"></span>'
        + '<button type="button" class="btn error-retry"><span class="material-symbols-rounded">replay</span><span class="error-retry-label"></span></button></div></div>';
      content.querySelector('.error-title').textContent = window.t('error.title');
      content.querySelector('.error-msg').textContent = m.text;
      content.querySelector('.error-retry-label').textContent = window.t('error.retry');
    } else {
      content.innerHTML = renderMarkdown(m.text, { streaming: !!m.streaming, msg: m, msgId: m.id });
    }
  }

  function patchMessageNode(node, m) {
    const content = node.querySelector('.msg-content');
    if (!content) return;
    node.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant')
      + (m.streaming ? ' is-streaming' : '')
      + (m.stopped ? ' is-stopped' : '');
    const mc = node.querySelector('.msg-avatar .mascot');
    if (mc) mc.dataset.state = mascotState(m);
    fillContent(content, m);

    if (!m.pending && !m.streaming) {
      const needsRebuild = !node.querySelector('.msg-actions')
        || (m.truncated && !node.querySelector('.msg-continue'))
        || (!m.truncated && node.querySelector('.msg-continue'));
      if (needsRebuild) {
        const fresh = buildMessageNode(m);
        fresh.style.animation = 'none';
        node.replaceWith(fresh);
        enhanceCodeBlocks(fresh);
      }
    }
  }

  function toggleTodo(item) {
    const chat = getActiveChat();
    const node = item.closest('.msg');
    const card = item.closest('.todo');
    if (!chat || !node || !card) return;
    const m = chat.messages.find((x) => x.id === node.dataset.id);
    if (!m) return;
    const key = card.dataset.key;
    const i = item.dataset.i;
    const next = item.classList.contains('is-done') ? 'todo' : 'done';
    m.todoOverrides = m.todoOverrides || {};
    (m.todoOverrides[key] = m.todoOverrides[key] || {})[i] = { to: next, base: item.dataset.base };
    saveChats(AppState.chats);
    fillContent(node.querySelector('.msg-content'), m);
    enhanceCodeBlocks(node);
  }

  function attachmentIcon(mimeType) {
    if (mimeType && mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') return 'folder_zip';
    if (mimeType === 'application/json') return 'data_object';
    return 'description';
  }

  function renderOneMessage(m) {
    el.messages.appendChild(buildMessageNode(m));
  }

  function buildMessageNode(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant')
      + (m.streaming ? ' is-streaming' : '')
      + (m.stopped ? ' is-stopped' : '');
    wrap.dataset.id = m.id;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = m.role === 'user'
      ? '<span class="material-symbols-rounded">person</span>'
      : mascotSVG(mascotState(m));

    const body = document.createElement('div');
    body.className = 'msg-body';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = m.role === 'user' ? window.t('chat.you') : 'KulshAI';
    meta.appendChild(name);
    if (m.role !== 'user' && m.model) {
      const mod = document.createElement('span');
      mod.className = 'msg-model';
      mod.textContent = String(m.model).replace(/^gemini-/, '');
      meta.appendChild(mod);
    }
    if (m.ts) {
      const tm = document.createElement('span');
      tm.className = 'msg-time';
      tm.textContent = fmtTime(m.ts);
      meta.appendChild(tm);
    }
    body.appendChild(meta);

    if (m.attachments && m.attachments.length) {
      const tray = document.createElement('div');
      tray.className = 'msg-attachments';
      m.attachments.forEach((a) => {
        const chip = document.createElement('div');
        chip.className = 'msg-attachment-chip';
        if (a.mimeType && a.mimeType.startsWith('image/') && a.data) {
          chip.innerHTML = `<img src="data:${a.mimeType};base64,${a.data}" alt="" /><span class="chip-name"></span>`;
        } else {
          chip.innerHTML = `<span class="material-symbols-rounded">${attachmentIcon(a.mimeType)}</span><span class="chip-name"></span>`;
        }
        chip.querySelector('.chip-name').textContent = a.name;
        tray.appendChild(chip);
      });
      body.appendChild(tray);
    }

    const content = document.createElement('div');
    content.className = 'msg-content';
    fillContent(content, m);
    body.appendChild(content);

    if (m.stopped) {
      const stopped = document.createElement('div');
      stopped.className = 'msg-stopped';
      stopped.textContent = window.t('chat.stopped');
      body.appendChild(stopped);
    }

    // Файловая панель: несколько файлов — предлагаем скачать одним архивом.
    const fileCards = content.querySelectorAll('.file-card');
    if (fileCards.length >= 2) {
      const bar = document.createElement('div');
      bar.className = 'msg-files-bar';
      const zipBtn = document.createElement('button');
      zipBtn.type = 'button';
      zipBtn.className = 'btn btn-tonal btn-sm';
      zipBtn.innerHTML = `<span class="material-symbols-rounded">folder_zip</span><span>${window.t('chat.downloadZip')} (${fileCards.length})</span>`;
      zipBtn.addEventListener('click', () => downloadMessageZip(wrap));
      bar.appendChild(zipBtn);
      body.appendChild(bar);
    }

    if (m.truncated) {
      const cont = document.createElement('button');
      cont.type = 'button';
      cont.className = 'btn btn-outline btn-sm msg-continue';
      cont.innerHTML = `<span class="material-symbols-rounded">play_arrow</span><span>${window.t('chat.continue')}</span>`;
      cont.addEventListener('click', () => continueMessage(m));
      body.appendChild(cont);
    }

    if (!m.pending) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '<span class="material-symbols-rounded">content_copy</span>';
      copyBtn.title = window.t('chat.copy');
      copyBtn.addEventListener('click', () => flashCopied(copyBtn, cleanRecall(m.text || '')));
      actions.appendChild(copyBtn);

      if (m.role === 'user') {
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<span class="material-symbols-rounded">edit</span>';
        editBtn.title = window.t('chat.edit');
        editBtn.addEventListener('click', () => startEditMessage(wrap, m));
        actions.appendChild(editBtn);
      }

      if (m.role === 'assistant') {
        const speakBtn = document.createElement('button');
        speakBtn.innerHTML = '<span class="material-symbols-rounded">volume_up</span>';
        speakBtn.addEventListener('click', () => speakText(m.text));
        actions.appendChild(speakBtn);

        const regenBtn = document.createElement('button');
        regenBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span>';
        regenBtn.title = window.t('chat.regenerate');
        regenBtn.addEventListener('click', () => regenerateFrom(m.id));
        actions.appendChild(regenBtn);
      }
      body.appendChild(actions);
    }

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    return wrap;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
    });
  }

  // ============================================================
  // ATTACHMENTS
  // ============================================================
  function renderAttachmentTray() {
    el.attachmentTray.innerHTML = '';
    AppState.pendingAttachments.forEach((a, idx) => {
      const item = document.createElement('div');
      item.className = 'attachment-item';
      if (a.mimeType && a.mimeType.startsWith('image/')) {
        item.innerHTML = `<img class="thumb" src="data:${a.mimeType};base64,${a.data}" alt="" />`;
      } else {
        item.innerHTML = `<span class="material-symbols-rounded file-icon">${attachmentIcon(a.mimeType)}</span>`;
      }
      const nameSpan = document.createElement('span');
      nameSpan.className = 'att-name';
      nameSpan.textContent = a.name;
      item.appendChild(nameSpan);

      const rm = document.createElement('button');
      rm.className = 'att-remove';
      rm.innerHTML = '<span class="material-symbols-rounded">close</span>';
      rm.addEventListener('click', () => {
        AppState.pendingAttachments.splice(idx, 1);
        renderAttachmentTray();
      });
      item.appendChild(rm);

      el.attachmentTray.appendChild(item);
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList) {
    if (window.KulshAuth.guest) { window.KulshAuth.toast(); return; }
    for (const file of Array.from(fileList)) {
      if (file.size > 15 * 1024 * 1024) {
        alert(`${file.name}: файл слишком большой (макс. 15 МБ)`);
        continue;
      }
      try {
        const data = await fileToBase64(file);
        AppState.pendingAttachments.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data,
        });
      } catch (e) { /* ignore */ }
    }
    renderAttachmentTray();
  }

  // ============================================================
  // SENDING / STREAMING
  // ============================================================
  function autoGrow() {
    el.composerInput.style.height = 'auto';
    el.composerInput.style.height = Math.min(el.composerInput.scrollHeight, 200) + 'px';
  }

  function setSendingState(isSending) {
    AppState.isStreaming = isSending;
    el.sendBtn.innerHTML = isSending
      ? '<span class="material-symbols-rounded">stop</span>'
      : '<span class="material-symbols-rounded">arrow_upward</span>';
    el.sendBtn.classList.toggle('is-stop', isSending);
    el.sendBtn.setAttribute('aria-label', isSending ? window.t('composer.stop') : window.t('composer.send'));
  }

  function stopStreaming() {
    AppState.stoppedByUser = true;
    if (currentAbort) {
      try { currentAbort.abort(); } catch {}
      currentAbort = null;
    }
    AppState.isStreaming = false;
    setSendingState(false);
  }

  async function sendMessage() {
    const text = el.composerInput.value.trim();
    if (!text && AppState.pendingAttachments.length === 0) return;
    if (AppState.isStreaming) return;

    let chat = getActiveChat();
    if (!chat) chat = createChat();

    const userMsg = {
      id: uid(),
      role: 'user',
      text,
      ts: Date.now(),
      attachments: AppState.pendingAttachments.slice(),
    };
    chat.messages.push(userMsg);

    if (!chat.title) {
      chat.title = text.slice(0, 48) || (userMsg.attachments[0] && userMsg.attachments[0].name) || window.t('chat.newChatTitle');
    }

    AppState.pendingAttachments = [];
    renderAttachmentTray();
    el.composerInput.value = '';
    autoGrow();
    hideMentionMenu();

    saveChats(AppState.chats);
    renderChatList(el.chatSearch.value);
    renderMessages();

    await requestAssistantReply(chat);
  }

  async function animateTyping(chat, msgId, fullText) {
    const msg = chat.messages.find((m) => m.id === msgId);
    if (!msg) return;

    const total = fullText.length;
    if (total === 0) return;
    const duration = Math.min(2400, Math.max(500, total * 9));
    const stepMs = 16;
    const chunk = Math.max(1, Math.ceil(total / Math.max(1, Math.floor(duration / stepMs))));

    for (let i = 0; i < total; i += chunk) {
      if (!AppState.isStreaming) return;
      msg.text = fullText.slice(0, Math.min(total, i + chunk));
      renderMessages();
      await new Promise((r) => setTimeout(r, stepMs));
    }
    msg.text = fullText;
    delete msg.streaming;
    renderMessages();
  }

  const hasMedia = (m) => !!(m.attachments && m.attachments.some((a) => a && a.data));

  function buildPayload(chat, pendingId, recall) {
    const msgs = chat.messages.filter((m) => m.id !== pendingId && !m.error && (m.text || (m.attachments && m.attachments.length)));
    let lastUser = -1;
    msgs.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
    const oldMediaIdx = [];
    msgs.forEach((m, i) => { if (i < lastUser && m.role === 'user' && hasMedia(m)) oldMediaIdx.push(i); });
    const recallIdx = new Set(oldMediaIdx.slice(-4));
    const newMedia = lastUser >= 0 && hasMedia(msgs[lastUser]);

    const messages = msgs.map((m, i) => {
      const atts = m.attachments || [];
      const keep = i === lastUser || (recall && recallIdx.has(i));
      let content = cleanRecall(m.text || '');
      if (!keep && atts.length) {
        const note = '[Вложения (содержимое сейчас не передаётся): ' + atts.map((a) => a.name).join(', ') + ']';
        content = content ? content + '\n' + note : note;
      }
      return { role: m.role, content, attachments: keep ? atts : [] };
    });
    return { messages, hasOldMedia: oldMediaIdx.length > 0, canRecall: oldMediaIdx.length > 0 && !newMedia };
  }

  function effortPrefix() {
    const e = AppState.settings.effort || 'medium';
    if (e === 'low')    return 'СТИЛЬ ОТВЕТА: отвечай кратко и по существу, без лишних деталей и вступлений.';
    if (e === 'high')   return 'СТИЛЬ ОТВЕТА: рассуждай тщательно, раскрывай детали, приводи примеры и крайние случаи.';
    return '';
  }

  async function requestAssistantReply(chat, opts) {
    opts = opts || {};
    const pendingMsg = { id: uid(), role: 'assistant', text: '', pending: true, ts: Date.now(), model: chat.model };
    chat.messages.push(pendingMsg);
    renderMessages();
    setSendingState(true);

    const abort = new AbortController();
    currentAbort = abort;
    AppState.stoppedByUser = false;

    const getMsg = () => chat.messages.find((m) => m.id === pendingMsg.id);
    let fullText = '';
    let gotError = '';
    let deltaCount = 0;
    let failedHttp = false;
    let gotTruncated = false;

    let cp = window.KulshAuth.guest ? '' : (AppState.settings.customPrompt || '');
    const ep = effortPrefix();
    if (ep) cp = ep + (cp ? '\n' + cp : '');
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user' && m.id !== pendingMsg.id);
    const skillsPrompt = await skillsPromptForText(lastUser ? lastUser.text : '');

    try {
      let recallPass = false;
      for (let pass = 0; pass < 2; pass++) {
        const payload = buildPayload(chat, pendingMsg.id, recallPass);
        fullText = ''; gotError = ''; deltaCount = 0;
        let recallAsked = false;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            messages: payload.messages,
            model: window.KulshAuth.guest ? window.KulshAuth.GUEST_MODEL : chat.model,
            temperature: AppState.settings.temperature,
            customPrompt: cp,
            skillsPrompt,
            recall: recallPass,
            hasOldMedia: payload.hasOldMedia,
            isContinue: !!opts.isContinue,
          }),
        });

        if (!res.ok || !res.body) { failedHttp = true; break; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

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
            let obj;
            try { obj = JSON.parse(jsonStr); } catch { continue; }
            if (obj.recall) recallAsked = true;
            if (obj.truncated) gotTruncated = true;
            if (obj.error && !fullText) { gotError = obj.error; continue; }
            if (obj.delta) {
              deltaCount++;
              fullText += obj.delta;
              const msg = getMsg();
              if (msg) {
                msg.text = fullText;
                msg.pending = false;
                msg.streaming = true;
                scheduleStreamRender();
              }
            }
          }
        }

        if (recallAsked && !recallPass && payload.canRecall && !AppState.stoppedByUser && !fullText.trim()) {
          recallPass = true;
          const msg = getMsg();
          if (msg) { msg.text = ''; msg.pending = true; delete msg.streaming; renderMessages(); }
          continue;
        }
        break;
      }
    } catch (e) {
      if (!(e && e.name === 'AbortError')) {
        console.error('[chat] request failed', e);
      }
    }

    currentAbort = null;
    fullText = cleanRecall(fullText);

    const msg = getMsg();
    if (msg) {
      if (failedHttp) {
        Object.assign(msg, { text: window.t('error.generic'), error: true });
        delete msg.pending; delete msg.streaming;
      } else if (fullText.trim()) {
        if (deltaCount <= 1 && fullText.length > 24 && !AppState.stoppedByUser) {
          msg.text = '';
          msg.pending = false;
          msg.streaming = true;
          renderMessages();
          await animateTyping(chat, pendingMsg.id, fullText);
        }
        const cur = getMsg();
        if (cur) {
          cur.text = cleanRecall(cur.text || fullText).trim();
          cur.stopped = !!AppState.stoppedByUser;
          if (gotTruncated && !AppState.stoppedByUser) cur.truncated = true;
          delete cur.pending; delete cur.streaming;
          if (AppState.settings.voiceAutoplay && !AppState.stoppedByUser) speakText(cur.text);
        }
      } else if (AppState.stoppedByUser) {
        chat.messages.splice(chat.messages.indexOf(msg), 1);
      } else {
        Object.assign(msg, { text: gotError || window.t('error.generic'), error: true });
        delete msg.pending; delete msg.streaming;
      }
    }

    saveChats(AppState.chats);
    renderMessages();
    setSendingState(false);
  }

  function regenerateFrom(msgId) {
    const chat = getActiveChat();
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    chat.messages.splice(idx, 1);
    saveChats(AppState.chats);
    requestAssistantReply(chat);
  }

  // Инлайновое редактирование сообщения.
  function startEditMessage(node, m) {
    if (!node || AppState.isStreaming) return;
    const content = node.querySelector('.msg-content');
    if (!content || node.querySelector('.msg-edit')) return;
    const isUser = m.role === 'user';

    const box = document.createElement('div');
    box.className = 'msg-edit';
    const ta = document.createElement('textarea');
    ta.className = 'msg-edit-input';
    ta.value = m.text || '';
    box.appendChild(ta);

    const actions = document.createElement('div');
    actions.className = 'msg-edit-actions';
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'btn btn-filled btn-sm'; save.textContent = window.t('chat.save');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-sm'; cancel.textContent = window.t('chat.cancel');
    actions.append(save, cancel);
    box.appendChild(actions);

    content.style.display = 'none';
    content.after(box);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    autoGrowEl(ta);

    const close = (saveIt) => {
      box.remove();
      content.style.display = '';
      if (!saveIt) return;
      const chat = getActiveChat();
      const mm = chat && chat.messages.find((x) => x.id === m.id);
      if (!mm) { renderMessages(); return; }
      mm.text = ta.value;
      if (isUser) {
        // Обрезаем всё после правки и генерируем ответ заново.
        const idx = chat.messages.indexOf(mm);
        chat.messages = chat.messages.slice(0, idx + 1);
        saveChats(AppState.chats);
        renderMessages();
        if (mm.text.trim() || (mm.attachments && mm.attachments.length)) requestAssistantReply(chat);
        return;
      }
      saveChats(AppState.chats);
      renderMessages();
    };
    save.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(true); }
    });
  }

  function autoGrowEl(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 360) + 'px';
  }

  function continueMessage(m) {
    const chat = getActiveChat();
    if (!chat || AppState.isStreaming) return;
    delete m.truncated;
    saveChats(AppState.chats);
    renderMessages();
    requestAssistantReply(chat, { isContinue: true });
  }

  // Отрисовка во время стрима — не чаще одного кадра. Это сохраняет видимый
  // поток (текст появляется постепенно), но не пересобирает markdown на каждый
  // чанк, поэтому длинные ответы с кодом больше не подлагивают.
  let streamRenderQueued = false;
  function scheduleStreamRender() {
    if (streamRenderQueued) return;
    streamRenderQueued = true;
    requestAnimationFrame(() => { streamRenderQueued = false; renderMessages(); });
  }

  // ============================================================
  // VOICE
  // ============================================================
  let recognition = null;
  let isListening = false;

  function setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { el.micBtn.style.display = 'none'; return; }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = AppState.settings.lang === 'ru' ? 'ru-RU' : 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      el.composerInput.value = transcript;
      autoGrow();
    };
    recognition.onend = () => {
      isListening = false;
      el.micBtn.classList.remove('is-listening');
    };
    recognition.onerror = () => {
      isListening = false;
      el.micBtn.classList.remove('is-listening');
    };
  }

  function toggleListening() {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      isListening = false;
      el.micBtn.classList.remove('is-listening');
    } else {
      recognition.lang = AppState.settings.lang === 'ru' ? 'ru-RU' : 'en-US';
      try {
        recognition.start();
        isListening = true;
        el.micBtn.classList.add('is-listening');
      } catch (e) {}
    }
  }

  function populateVoiceList() {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    el.voiceSelect.innerHTML = '<option value="">По умолчанию</option>';
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === AppState.settings.voiceURI) opt.selected = true;
      el.voiceSelect.appendChild(opt);
    });
  }

  function speakText(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`_>~\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = AppState.settings.voiceRate || 1;
    utter.lang = AppState.settings.lang === 'ru' ? 'ru-RU' : 'en-US';
    if (AppState.settings.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === AppState.settings.voiceURI);
      if (voice) utter.voice = voice;
    }
    window.speechSynthesis.speak(utter);
  }

  // ============================================================
  // SETTINGS DIALOG
  // ============================================================
  function openSettings() {
    el.settingsBackdrop.classList.add('is-open');
    el.settingsDialog.classList.add('is-open');
    requestAnimationFrame(refreshAllSliderFills);
  }
  function closeSettings() {
    el.settingsBackdrop.classList.remove('is-open');
    el.settingsDialog.classList.remove('is-open');
  }

  function switchSettingsTab(tab, btn) {
    $$('.dialog-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    $$('.settings-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tab));
    if (btn && typeof btn.blur === 'function') btn.blur();
    requestAnimationFrame(refreshAllSliderFills);
  }

  function populateModelSelect() {
    el.defaultModelSelect.innerHTML = '';
    PROVIDER_ORDER.forEach((prov) => {
      const list = MODELS.filter((m) => m.provider === prov);
      if (!list.length) return;
      const group = document.createElement('optgroup');
      group.label = PROVIDER_LABELS[prov] || prov;
      list.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === AppState.settings.defaultModel) opt.selected = true;
        group.appendChild(opt);
      });
      el.defaultModelSelect.appendChild(group);
    });
  }

  // Принимает ли текущая модель вложения (DeepSeek V4 Pro — без зрения).
  function currentModelHasVision() {
    const chat = getActiveChat();
    const id = chat ? chat.model : AppState.settings.defaultModel;
    const m = modelById(id);
    return !m || m.vision !== false;
  }

  // ============================================================
  // SKILLS (встроенные из /skills/manifest.json + личные из /api/skills)
  // ============================================================
  let skillsCatalog = null;   // встроенные (статика репозитория)
  let userSkills = [];        // личные (Upstash Redis через /api/skills)
  const skillCache = new Map();

  const curLang = () => AppState.settings.lang;
  const pickLang = (obj) => !obj ? '' : (curLang() === 'en' ? (obj.en || obj.ru) : (obj.ru || obj.en));

  async function loadCatalog() {
    if (skillsCatalog) return skillsCatalog;
    try {
      const j = await fetch('/skills/manifest.json', { cache: 'force-cache' }).then((r) => r.json());
      skillsCatalog = (j && Array.isArray(j.skills)) ? j.skills : [];
    } catch { skillsCatalog = []; }
    return skillsCatalog;
  }

  async function loadUserSkills() {
    if (window.KulshAuth.guest) { userSkills = []; return userSkills; }
    try {
      const j = await fetch('/api/skills', { cache: 'no-store' }).then((r) => r.json());
      userSkills = Array.isArray(j.skills) ? j.skills : [];
    } catch { userSkills = []; }
    return userSkills;
  }

  // Текст скилла: встроенный — из .md файла, личный — из своего содержимого.
  async function skillContent(id) {
    if (skillCache.has(id)) return skillCache.get(id);
    let text = '';
    const meta = (await loadCatalog()).find((s) => s.id === id);
    if (meta) { try { text = await fetch('/skills/' + meta.file).then((r) => r.text()); } catch {} }
    else { const us = userSkills.find((s) => s.id === id); text = us ? us.content : ''; }
    skillCache.set(id, text);
    return text;
  }

  // Скиллы не «включаются» глобально — их вызывают в тексте сообщения через @id.
  function parseMentions(text) {
    const out = [];
    const re = /(^|\s)@([^\s@/]{1,48})/g;
    let m;
    while ((m = re.exec(text || ''))) {
      const id = m[2].replace(/[.,;:!?)\]}»"']+$/u, '');
      if (id) out.push(id);
    }
    return [...new Set(out)];
  }

  // Собираем контент скиллов, вызванных через @, в один блок инструкций.
  async function skillsPromptForText(text) {
    if (window.KulshAuth.guest) return '';
    const ids = parseMentions(text);
    if (!ids.length) return '';
    await Promise.all([loadCatalog(), loadUserSkills()]);
    const parts = [];
    for (const raw of ids) {
      const low = raw.toLowerCase();
      const us = userSkills.find((s) => String(s.id).toLowerCase() === low);
      if (us) { if (us.content) parts.push(us.content.trim()); continue; }
      const meta = (skillsCatalog || []).find((s) => String(s.id).toLowerCase() === low);
      if (meta) { const c = await skillContent(meta.id); if (c) parts.push(c.trim()); }
    }
    return parts.join('\n\n---\n\n').slice(0, 6000);
  }

  // Единый список скиллов (личные + встроенные) для меню @.
  function allSkills() {
    const mine = userSkills.map((s) => ({ id: s.id, title: s.title, desc: s.desc || '', icon: 'extension' }));
    const builtin = (skillsCatalog || []).map((s) => ({ id: s.id, title: pickLang(s.title), desc: pickLang(s.desc), icon: s.icon || 'bolt' }));
    return [...mine, ...builtin];
  }

  function skillRowHTML(id, icon, title, desc, mine) {
    return `<div class="skills-item" data-open="${escapeAttr(id)}">
      <span class="skills-ico"><span class="material-symbols-rounded">${escapeHtml(icon)}</span></span>
      <span class="skills-txt">
        <span class="skills-name">${escapeHtml(title)}</span>
        ${desc ? `<span class="skills-desc">${escapeHtml(desc)}</span>` : ''}
        <span class="skills-id">@${escapeHtml(id)}</span>
      </span>
      ${mine
        ? `<button class="skills-del" type="button" data-del="${escapeAttr(id)}" aria-label="${escapeAttr(window.t('skills.delete'))}"><span class="material-symbols-rounded">delete</span></button>`
        : ''}
    </div>`;
  }

  function renderSkills() {
    if (!el.skillsBuiltin) return;
    const cat = skillsCatalog || [];
    el.skillsBuiltin.innerHTML = cat.map((s) =>
      skillRowHTML(s.id, s.icon || 'bolt', pickLang(s.title), pickLang(s.desc), false)).join('');
    el.skillsMine.innerHTML = userSkills.length
      ? userSkills.map((s) => skillRowHTML(s.id, 'extension', s.title, s.desc || (s.content || '').replace(/\s+/g, ' ').slice(0, 100), true)).join('')
      : `<p class="skills-empty">${escapeHtml(window.t('skills.empty'))}</p>`;
    const guest = window.KulshAuth.guest;
    if (el.skillsGuestHint) el.skillsGuestHint.hidden = !guest;
    if (el.skillsAddBtn) el.skillsAddBtn.hidden = guest;
    if (el.skillsUploadBtn) el.skillsUploadBtn.hidden = guest;
  }

  async function openSkills() {
    if (!el.skillsDialog) return;
    el.skillsBackdrop.classList.add('is-open');
    el.skillsDialog.classList.add('is-open');
    el.skillsError.hidden = true;
    await Promise.all([loadCatalog(), loadUserSkills()]);
    renderSkills();
  }
  function closeSkills() {
    if (!el.skillsDialog) return;
    el.skillsBackdrop.classList.remove('is-open');
    el.skillsDialog.classList.remove('is-open');
    el.skillsForm.hidden = true;
    el.skillsError.hidden = true;
  }
  function showSkillError(msg) {
    if (!el.skillsError) return;
    el.skillsError.textContent = msg;
    el.skillsError.hidden = false;
  }

  // Показываем содержимое скилла с красивой отрисовкой markdown.
  async function openSkillPreview(id) {
    await Promise.all([loadCatalog(), loadUserSkills()]);
    const meta = (skillsCatalog || []).find((s) => s.id === id);
    const mine = userSkills.find((s) => s.id === id);
    const title = meta ? pickLang(meta.title) : (mine ? mine.title : id);
    const content = mine ? mine.content : (meta ? await skillContent(meta.id) : '');
    Preview.open({ title, subtitle: '@' + id, icon: (meta && meta.icon) || 'extension', code: content, kind: 'md', initial: 'render' });
  }

  function slugId(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_.-]+/gu, '').slice(0, 32);
  }

  // Разбираем SKILL.md: frontmatter (name/description) + тело.
  function parseSkillMarkdown(text, filename) {
    let body = String(text || '');
    let name = '', desc = '';
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (fm) {
      fm[1].split('\n').forEach((line) => {
        const m = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
        if (!m) return;
        const k = m[1].toLowerCase();
        const v = m[2].trim().replace(/^["']|["']$/g, '');
        if (k === 'name') name = v;
        else if (k === 'description' || k === 'desc') desc = v;
      });
      body = body.slice(fm[0].length);
    }
    const base = String(filename || '').replace(/\.[^.]+$/, '');
    const title = name || base || 'Skill';
    return { title, id: slugId(name || base), desc, content: body.trim() };
  }

  async function handleSkillFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSkillMarkdown(text, file.name);
      el.skillTitle.value = parsed.title;
      if (el.skillId) el.skillId.value = parsed.id;
      el.skillContent.value = parsed.content;
      el.skillsForm.hidden = false;
      el.skillsError.hidden = true;
      el.skillTitle.focus();
    } catch {
      showSkillError(window.t('skills.uploadError'));
    }
  }

  async function saveSkill() {
    const title = (el.skillTitle.value || '').trim();
    const idRaw = (el.skillId ? el.skillId.value : '').trim();
    const content = (el.skillContent.value || '').trim();
    if (!title || !content) return showSkillError(window.t('skills.needFields'));
    if (userSkills.length >= 20) return showSkillError(window.t('skills.limit'));
    const desc = content.replace(/^#+\s*/, '').replace(/\s+/g, ' ').slice(0, 160);
    el.skillSaveBtn.disabled = true;
    try {
      const r = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idRaw, title, desc, content }),
      });
      const j = await r.json();
      if (!r.ok || !j.skill) throw new Error((j && j.error) || 'fail');
      userSkills = [j.skill, ...userSkills].slice(0, 20);
      skillCache.set(j.skill.id, content);
      el.skillTitle.value = '';
      if (el.skillId) el.skillId.value = '';
      el.skillContent.value = '';
      el.skillsForm.hidden = true;
      el.skillsError.hidden = true;
      renderSkills();
    } catch {
      showSkillError(window.t('skills.error'));
    } finally {
      el.skillSaveBtn.disabled = false;
    }
  }

  async function deleteSkill(id) {
    try { await fetch('/api/skills?id=' + encodeURIComponent(id), { method: 'DELETE' }); } catch {}
    userSkills = userSkills.filter((s) => s.id !== id);
    skillCache.delete(id);
    renderSkills();
  }

  // ---------- Меню @-упоминаний в поле ввода ----------
  let mentionItems = [];
  let mentionActive = 0;

  function mentionQuery() {
    const ta = el.composerInput;
    if (!ta) return null;
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(^|\s)@([^\s@/]{0,48})$/);
    return m ? { query: m[2], start: before.length - m[2].length - 1 } : null;
  }

  async function updateMentionMenu() {
    if (!el.mentionMenu) return;
    if (window.KulshAuth.guest) return hideMentionMenu();
    const q = mentionQuery();
    if (!q) return hideMentionMenu();
    await Promise.all([loadCatalog(), loadUserSkills()]);
    const needle = q.query.toLowerCase();
    const list = allSkills().filter((s) =>
      !needle || s.id.toLowerCase().includes(needle) || (s.title || '').toLowerCase().includes(needle)
    ).slice(0, 8);
    if (!list.length) return hideMentionMenu();
    mentionItems = list;
    mentionActive = 0;
    el.mentionMenu.innerHTML = list.map((s, i) =>
      `<button type="button" class="mention-item${i === 0 ? ' is-active' : ''}" data-i="${i}">
        <span class="material-symbols-rounded">${escapeHtml(s.icon)}</span>
        <span class="mention-txt"><span class="mention-name">${escapeHtml(s.title)}</span><span class="mention-id">@${escapeHtml(s.id)}</span></span>
      </button>`).join('');
    el.mentionMenu.classList.add('is-open');
  }

  function hideMentionMenu() {
    if (el.mentionMenu) el.mentionMenu.classList.remove('is-open');
    mentionItems = [];
    mentionActive = 0;
  }
  const mentionOpen = () => !!(el.mentionMenu && el.mentionMenu.classList.contains('is-open'));

  function applyMention(i) {
    const s = mentionItems[i];
    const q = mentionQuery();
    if (!s || !q) return;
    const ta = el.composerInput;
    const after = ta.value.slice(ta.selectionStart);
    const head = ta.value.slice(0, q.start);
    ta.value = head + '@' + s.id + ' ' + after;
    const pos = head.length + s.id.length + 2;
    ta.setSelectionRange(pos, pos);
    hideMentionMenu();
    autoGrow();
    ta.focus();
  }

  function highlightMention(i) {
    if (!el.mentionMenu) return;
    mentionActive = (i + mentionItems.length) % mentionItems.length;
    Array.from(el.mentionMenu.children).forEach((c, idx) => c.classList.toggle('is-active', idx === mentionActive));
  }

  // ============================================================
  // EVENT WIRING
  // ============================================================
  function wireEvents() {
    window.addEventListener('kulsh-auth', () => { renderModelPicker(); renderChatList(); });

    // Действия из объединённого меню аккаунта (auth.js).
    window.addEventListener('kulsh-open-settings', () => { populateModelSelect(); openSettings(); });
    window.addEventListener('kulsh-open-skills', () => { openSkills(); });
    window.addEventListener('kulsh-open-api', () => { openApi(); });
    // Смена языка из меню: auth.js пишет настройку в localStorage напрямую,
    // поэтому перечитываем её и заново применяем к интерфейсу.
    window.addEventListener('kulsh-lang-change', () => {
      AppState.settings = loadSettings();
      applySettingsToDOM();
      renderChatList(el.chatSearch.value);
      renderMessages();
    });
    el.newChatBtn.addEventListener('click', () => {
      if (window.KulshAuth.guest) { window.KulshAuth.toast(); return; }
      createChat();
      renderChatList();
      renderMessages();
      closeSidebarOnMobile();
    });

    el.sidebarToggle.addEventListener('click', () => el.app.classList.add('sidebar-collapsed'));
    el.sidebarOpenBtn.addEventListener('click', () => el.app.classList.remove('sidebar-collapsed'));
    el.sidebarBackdrop.addEventListener('click', () => el.app.classList.add('sidebar-collapsed'));

    el.chatSearch.addEventListener('input', () => renderChatList(el.chatSearch.value));

    el.modelPickerBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleModelPicker(); });
    document.addEventListener('click', (e) => {
      if (!el.modelPicker.contains(e.target)) closeModelPicker();
    });

    el.attachBtn.addEventListener('click', () => {
      if (window.KulshAuth.guest) return window.KulshAuth.toast();
      if (!currentModelHasVision()) return alert(window.t('attach.noVision'));
      el.fileInput.click();
    });
    el.fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      el.fileInput.value = '';
    });

    el.chatScroll.addEventListener('dragover', (e) => e.preventDefault());
    el.chatScroll.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        if (!currentModelHasVision()) return alert(window.t('attach.noVision'));
        handleFiles(e.dataTransfer.files);
      }
    });

    el.composerInput.addEventListener('input', () => { autoGrow(); updateMentionMenu(); });
    el.composerInput.addEventListener('blur', () => setTimeout(hideMentionMenu, 150));
    el.composerInput.addEventListener('keydown', (e) => {
      if (mentionOpen()) {
        if (e.key === 'ArrowDown') { e.preventDefault(); highlightMention(mentionActive + 1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); highlightMention(mentionActive - 1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionActive); return; }
        if (e.key === 'Escape') { e.preventDefault(); hideMentionMenu(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && AppState.settings.sendOnEnter) {
        e.preventDefault();
        if (!AppState.isStreaming) sendMessage();
      }
    });
    if (el.mentionMenu) el.mentionMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.mention-item');
      if (item) applyMention(Number(item.dataset.i));
    });

    el.sendBtn.addEventListener('click', () => {
      if (AppState.isStreaming) {
        stopStreaming();
      } else {
        sendMessage();
      }
    });

    el.micBtn.addEventListener('click', toggleListening);

    el.messages.addEventListener('click', (e) => {
      const item = e.target.closest('.todo-item');
      if (item) { toggleTodo(item); return; }
      const dl = e.target.closest('.file-card-dl');
      if (dl) { downloadFileCard(dl.closest('.file-card')); return; }
      const card = e.target.closest('.file-card');
      if (card) { openFilePreview(card); return; }
      const retry = e.target.closest('.error-retry');
      if (retry) {
        const node = retry.closest('.msg');
        if (node && !AppState.isStreaming) regenerateFrom(node.dataset.id);
      }
    });

    el.emptyLottie.addEventListener('click', () => {
      const cur = el.emptyLottie.dataset.pick;
      const other = LOTTIES.find((n) => n !== cur) || cur;
      showRandomLottie(other);
    });

    // Кнопка «Настройки» в чате теперь заменена объединённым меню аккаунта
    // (auth.js), но оставляем fallback на случай, если она где-то осталась.
    if (el.settingsBtn) el.settingsBtn.addEventListener('click', () => { populateModelSelect(); openSettings(); });
    el.settingsCloseBtn.addEventListener('click', closeSettings);
    el.settingsBackdrop.addEventListener('click', closeSettings);

    // Skills dialog
    if (el.skillsCloseBtn) el.skillsCloseBtn.addEventListener('click', closeSkills);
    if (el.skillsBackdrop) el.skillsBackdrop.addEventListener('click', closeSkills);
    const onSkillListClick = (e) => {
      const d = e.target.closest('[data-del]');
      if (d) { e.stopPropagation(); deleteSkill(d.dataset.del); return; }
      const open = e.target.closest('[data-open]');
      if (open) openSkillPreview(open.dataset.open);
    };
    if (el.skillsBuiltin) el.skillsBuiltin.addEventListener('click', onSkillListClick);
    if (el.skillsMine) el.skillsMine.addEventListener('click', onSkillListClick);
    if (el.skillsAddBtn) el.skillsAddBtn.addEventListener('click', () => {
      el.skillsForm.hidden = false;
      el.skillsError.hidden = true;
      el.skillTitle.focus();
    });
    if (el.skillsUploadBtn && el.skillsFile) {
      el.skillsUploadBtn.addEventListener('click', () => el.skillsFile.click());
      el.skillsFile.addEventListener('change', (e) => {
        handleSkillFile(e.target.files && e.target.files[0]);
        el.skillsFile.value = '';
      });
    }
    if (el.skillCancelBtn) el.skillCancelBtn.addEventListener('click', () => {
      el.skillsForm.hidden = true; el.skillsError.hidden = true;
    });
    if (el.skillSaveBtn) el.skillSaveBtn.addEventListener('click', saveSkill);

    // API-ключи
    if (el.apiCloseBtn) el.apiCloseBtn.addEventListener('click', closeApi);
    if (el.apiBackdrop) el.apiBackdrop.addEventListener('click', closeApi);
    if (el.apiBaseCopy) el.apiBaseCopy.addEventListener('click', (e) => flashCopied(e.currentTarget, apiBaseUrl()));
    if (el.apiCreateBtn) el.apiCreateBtn.addEventListener('click', () => {
      el.apiForm.hidden = false; el.apiError.hidden = true; el.apiName.focus();
    });
    if (el.apiCancelBtn) el.apiCancelBtn.addEventListener('click', () => { el.apiForm.hidden = true; el.apiError.hidden = true; });
    if (el.apiCreateSubmit) el.apiCreateSubmit.addEventListener('click', createApiKey);
    if (el.apiList) el.apiList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-revoke]');
      if (b) revokeApiKey(b.dataset.revoke);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (el.apiDialog && el.apiDialog.classList.contains('is-open')) closeApi();
      else if (el.skillsDialog && el.skillsDialog.classList.contains('is-open')) closeSkills();
      else if (el.previewDialog && el.previewDialog.classList.contains('is-open')) Preview.close();
    });

    el.settingsTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.dialog-tab');
      if (btn) switchSettingsTab(btn.dataset.tab, btn);
    });

    el.langSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      AppState.settings.lang = btn.dataset.lang;
      saveSettings(AppState.settings);
      applySettingsToDOM();
      window.dispatchEvent(new CustomEvent('kulsh-lang-change'));
      renderChatList(el.chatSearch.value);
      renderMessages();
    });

    el.themeSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      AppState.settings.theme = btn.dataset.theme;
      saveSettings(AppState.settings);
      applySettingsToDOM();
    });

    el.fontSizeSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      AppState.settings.fontSize = btn.dataset.size;
      saveSettings(AppState.settings);
      applySettingsToDOM();
    });

    el.animatedBgSwitch.addEventListener('click', () => {
      AppState.settings.animatedBg = !AppState.settings.animatedBg;
      saveSettings(AppState.settings);
      applySettingsToDOM();
    });

    el.sendOnEnterSwitch.addEventListener('click', () => {
      AppState.settings.sendOnEnter = !AppState.settings.sendOnEnter;
      saveSettings(AppState.settings);
      applySettingsToDOM();
    });

    el.autoplaySwitch.addEventListener('click', () => {
      AppState.settings.voiceAutoplay = !AppState.settings.voiceAutoplay;
      saveSettings(AppState.settings);
      applySettingsToDOM();
    });

    const bindSeg = (id, key) => {
      const n = document.getElementById(id);
      if (!n) return;
      n.addEventListener('click', (e) => {
        const b = e.target.closest('.segmented-btn');
        if (!b) return;
        AppState.settings[key] = b.dataset.v;
        saveSettings(AppState.settings);
        applySettingsToDOM();
      });
    };
    bindSeg('chatWidthSeg', 'chatWidth');
    bindSeg('densitySeg', 'density');
    bindSeg('fontFamilySeg', 'fontFamily');

    const bindSw = (id, key) => {
      const n = document.getElementById(id);
      if (!n) return;
      n.addEventListener('click', () => {
        AppState.settings[key] = !AppState.settings[key];
        saveSettings(AppState.settings);
        applySettingsToDOM();
      });
    };
    bindSw('autoScrollSwitch', 'autoScroll');
    bindSw('showHintSwitch', 'showHint');
    bindSw('reduceMotionSwitch', 'reduceMotion');

    const tr = document.getElementById('tempRange');
    if (tr) {
      updateSliderFill(tr);
      tr.addEventListener('input', () => {
        AppState.settings.temperature = parseFloat(tr.value);
        document.getElementById('tempVal').textContent = Number(tr.value).toFixed(2).replace(/0$/, '');
        updateSliderFill(tr);
        saveSettings(AppState.settings);
      });
    }

    const cp = document.getElementById('customPrompt');
    if (cp) cp.addEventListener('input', () => { AppState.settings.customPrompt = cp.value.slice(0, 1500); saveSettings(AppState.settings); });

    el.voiceRate.addEventListener('input', () => {
      AppState.settings.voiceRate = parseFloat(el.voiceRate.value);
      updateSliderFill(el.voiceRate);
      saveSettings(AppState.settings);
    });

    el.defaultModelSelect.addEventListener('change', () => {
      AppState.settings.defaultModel = el.defaultModelSelect.value;
      saveSettings(AppState.settings);
    });

    el.voiceSelect.addEventListener('change', () => {
      AppState.settings.voiceURI = el.voiceSelect.value;
      saveSettings(AppState.settings);
    });

    el.exportChatsBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(AppState.chats, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kulshgpt-chats.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    el.clearChatsBtn.addEventListener('click', () => {
      if (confirm(window.t('confirm.clearChats'))) {
        AppState.chats = [];
        AppState.activeChatId = null;
        saveChats(AppState.chats);
        renderChatList();
        renderMessages();
        closeSettings();
      }
    });

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (AppState.settings.theme === 'system') applySettingsToDOM();
    });

    window.addEventListener('resize', () => {
      requestAnimationFrame(refreshAllSliderFills);
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  // Перечитывает чаты и настройки из localStorage после синхронизации с аккаунтом.
  function reloadFromStorage() {
    if (AppState.isStreaming) return;
    AppState.chats = loadChats();
    AppState.settings = loadSettings();
    if (!getActiveChat()) AppState.activeChatId = AppState.chats[0] ? AppState.chats[0].id : null;
    applySettingsToDOM();
    renderChatList(el.chatSearch ? el.chatSearch.value : undefined);
    renderMessages();
    renderModelPicker();
  }

  async function init() {
    if (window.KulshSync) {
      try { await window.KulshSync.start(); } catch {}
      AppState.chats = loadChats();
      AppState.settings = loadSettings();
    }
    window.addEventListener('kulsh-synced', reloadFromStorage);
    applySettingsToDOM();
    setupSpeechRecognition();
    populateVoiceList();
    wireEvents();

    if (AppState.chats.length > 0) {
      AppState.activeChatId = AppState.chats[0].id;
    }
    renderChatList();
    renderMessages();

    if (window.innerWidth <= 900) {
      el.app.classList.add('sidebar-collapsed');
    }

    refreshAllSliderFills();

    // Открытие нужного диалога, если пришли по ссылке (/chat/#settings, /chat/#skills).
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'settings') { populateModelSelect(); openSettings(); }
    else if (hash === 'skills') { openSkills(); }
    else if (hash === 'api') { openApi(); }
    if (hash) { try { history.replaceState(null, '', location.pathname); } catch {} }

    // Снимаем скелетон после того, как интерфейс полностью отрисован.
    document.body.classList.remove('is-booting');
  }

  document.addEventListener('DOMContentLoaded', () => window.KulshAuth.ready.then(init, init).then(() => renderModelPicker()));
})();
