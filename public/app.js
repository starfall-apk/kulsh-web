// app.js — KulshGPT front-end logic
(function () {
  'use strict';

  // ============================================================
  // MODELS
  // ============================================================
  const MODELS = [
    { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      icon: 'bolt',        tone: 'amber', desc: { ru: 'Стабильная, быстрая модель', en: 'Stable, fast model' } },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', icon: 'flash_on',    tone: 'sky',   desc: { ru: 'Самая быстрая и лёгкая', en: 'Fastest and lightest' } },
    { id: 'gemini-3.5-flash',      name: 'Gemini 3.5 Flash',      icon: 'auto_awesome', tone: 'mint', desc: { ru: 'Баланс скорости и качества', en: 'Balance of speed and quality' } },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', icon: 'speed', tone: 'sky', desc: { ru: 'Облегчённая версия 3.5', en: 'Lightweight 3.5 variant' } },
    { id: 'gemini-3.6-flash',      name: 'Gemini 3.6 Flash',      icon: 'auto_awesome', tone: 'mint', desc: { ru: 'Улучшенное рассуждение', en: 'Improved reasoning' } },
    { id: 'gemini-3.7-flash',      name: 'Gemini 3.7 Flash',      icon: 'auto_awesome', tone: 'rose', desc: { ru: 'Новее и точнее', en: 'Newer and more accurate' } },
    { id: 'gemini-3.8-flash',      name: 'Gemini 3.8 Flash',      icon: 'auto_awesome', tone: 'rose', desc: { ru: 'Самая новая модель линейки', en: 'The newest in the lineup' } },
  ];

  // Маскот пустого чата — моаи (две версии анимации)
  const LOTTIES = ['moai', 'moai2'];

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
    try { localStorage.setItem(STORE_KEY, JSON.stringify(chats)); } catch {}
  }
  function loadSettings() {
    const defaults = {
      lang: 'ru',
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
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const st = raw ? Object.assign(defaults, JSON.parse(raw)) : defaults;
      // Миграция: старые значения шрифта (roboto/flex) и удалённые настройки
      if (st.fontFamily === 'roboto') st.fontFamily = 'gsans';
      else if (st.fontFamily === 'flex') st.fontFamily = 'rflex';
      delete st.showAvatars; delete st.showNames; delete st.lottie;
      return st;
    } catch { return defaults; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
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

  // Активный AbortController текущего запроса — нужен кнопке «стоп».
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
  // MODEL PICKER
  // ============================================================
  function renderModelPicker() {
    const chat = getActiveChat();
    const currentModelId = chat ? chat.model : AppState.settings.defaultModel;
    const current = MODELS.find((m) => m.id === currentModelId) || MODELS[0];
    el.modelPickerName.textContent = current.name.replace(/^Gemini\s*/i, '');
    const chip = document.getElementById('emptyModel');
    if (chip) chip.textContent = current.id;

    el.modelPickerMenu.innerHTML = '';
    MODELS.forEach((m) => {
      const opt = document.createElement('button');
      opt.className = 'model-option' + (m.id === currentModelId ? ' is-selected' : '');
      opt.setAttribute('role', 'option');
      const lang = AppState.settings.lang;
      opt.innerHTML = `
        <span class="model-option-icon tone-${m.tone || 'mint'}"><span class="material-symbols-rounded">${m.icon}</span></span>
        <span class="model-option-text">
          <span class="model-option-name">${m.name}</span>
          <span class="model-option-desc">${m.desc[lang] || m.desc.ru}</span>
        </span>
        ${m.id === currentModelId ? '<span class="material-symbols-rounded check">check</span>' : ''}
      `;
      opt.addEventListener('click', () => {
        const c = getActiveChat();
        if (c) { c.model = m.id; saveChats(AppState.chats); }
        else { AppState.settings.defaultModel = m.id; saveSettings(AppState.settings); }
        renderModelPicker();
        closeModelPicker();
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
        path: `lotties/${pick}.json`,
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
  // Маркер !recall_media обрабатывает сервер; здесь страховка для старых сообщений из истории.
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
    // Пока формула дописывается стримом — вместо сырого LaTeX показываем заглушку
    if (opts.streaming && isLast) {
      const k = seg.search(/\$\$|\\\[|\\begin\{/);
      if (k >= 0) {
        seg = seg.slice(0, k) + tok('<div class="math-pending"><span class="material-symbols-rounded">functions</span><span>' + window.t('math.pending') + '</span></div>');
      }
    }
    return seg;
  }

  // ---------- Чек-листы ----------
  // Блок ```todo  title: …  - [x] готово  - [~] в работе  - [ ] впереди  - [!] не вышло
  const TODO_STATUS = { ' ': 'todo', x: 'done', X: 'done', '~': 'active', '>': 'active', '!': 'fail' };
  const todoSeen = new Map(); // msgId|key -> прошлые статусы (чтобы анимировать только изменившееся)

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
    // Ручная правка пользователя действует, пока модель не изменила этот пункт
    const items = g.items.map((it, i) => {
      const o = ov[i];
      return { text: it.text, base: it.status, status: (o && o.base === it.status) ? o.to : it.status };
    });
    const total = items.length;
    const done = items.filter((i) => i.status === 'done').length;
    const pct = total ? Math.round((done * 100) / total) : 0;
    const complete = total > 0 && done === total;

    // Перерисовка идёт на каждом чанке стрима. Чтобы анимации не перезапускались,
    // у изменившихся пунктов считаем возраст изменения, а у бесконечных (спиннер, пульс)
    // фазу берём от часов — анимация продолжается ровно с того же места.
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

  // ---------- Markdown ----------
  function renderMarkdown(text, opts) {
    opts = opts || {};
    text = cleanRecall(text);
    if (!window.marked) return escapeHtml(text);

    const store = [];
    const tok = (html) => { store.push(html); return '\uE000' + (store.length - 1) + '\uE001'; };
    const groups = new Map();

    // Код не трогаем: формулы и чек-листы ищем только вне ``` и `…`
    const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/);
    const out = parts.map((part, i) => {
      if (i % 2 === 0) return mathPass(part, i === parts.length - 1, opts, tok);
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
      // Повторный блок с тем же title обновляет первую карточку. Недописанный
      // (стримится) блок не должен «сжимать» уже показанный список.
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

  // ---------- Маскот ----------
  // Один SVG, три состояния: idle (моргает), think (щурится по сторонам, пока ИИ печатает), oops (ошибка).
  function mascotSVG(state) {
    return '<svg class="mascot" data-state="' + state + '" viewBox="0 0 64 72" aria-hidden="true" focusable="false">'
      + '<ellipse class="mc-shade" cx="32" cy="69" rx="19" ry="2.4"/>'
      + '<path class="mc-drop" d="M51 10c-2.2 3.2-3.4 4.8-3.4 6.4a3.4 3.4 0 0 0 6.8 0c0-1.6-1.2-3.2-3.4-6.4z"/>'
      + '<g class="mc-head">'
      + '<path class="mc-body" d="M16 4H48A6 6 0 0 1 54 10V44C54 49 51 52 48 54V66H16V54C13 52 10 49 10 44V10A6 6 0 0 1 16 4Z"/>'
      + '<rect class="mc-ink" x="10" y="20" width="44" height="3" opacity=".9"/>'
      + '<rect class="mc-shade" x="10" y="23" width="44" height="4"/>'
      + '<path class="mc-ink" d="M29 30h6l1.6 22H27.4z" opacity=".88"/>'
      + '<g class="mc-eye"><rect class="mc-ink" x="14" y="28" width="14" height="10" rx="5"/><circle class="mc-pupil" cx="21" cy="33" r="2.4"/><path class="mc-x" d="M18.5 30.5l5 5M23.5 30.5l-5 5"/></g>'
      + '<g class="mc-eye"><rect class="mc-ink" x="36" y="28" width="14" height="10" rx="5"/><circle class="mc-pupil" cx="43" cy="33" r="2.4"/><path class="mc-x" d="M40.5 30.5l5 5M45.5 30.5l-5 5"/></g>'
      + '<rect class="mc-ink mc-mouth-ok" x="22" y="57" width="20" height="3" rx="1.5"/>'
      + '<path class="mc-line mc-mouth-bad" d="M22 59q2.5-3 5 0t5 0t5 0t5 0"/>'
      + '<path class="mc-line mc-crack" d="M30 4l-3 8 4 5-3 6" style="stroke-width:1.8"/>'
      + '</g></svg>';
  }

  function mascotState(m) { return m.error ? 'oops' : (m.pending || m.streaming) ? 'think' : 'idle'; }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString(AppState.settings.lang === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  // Содержимое пузыря: индикатор набора / ошибка / разметка
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

    if (!m.pending && !m.streaming && !node.querySelector('.msg-actions')) {
      const fresh = buildMessageNode(m);
      fresh.style.animation = 'none';
      node.replaceWith(fresh);
      enhanceCodeBlocks(fresh);
    }
  }

  // Клик по пункту чек-листа: пользователь может поправить статус вручную.
  // Правка действует, пока модель сама не изменит этот пункт.
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

    // Мета-строка: имя · модель · время (модель и время — моноширинным Google Sans Code)
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = m.role === 'user' ? window.t('chat.you') : 'KulshGPT';
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

    // Пометка «остановлено» — маленькая, серым, под контентом.
    if (m.stopped) {
      const stopped = document.createElement('div');
      stopped.className = 'msg-stopped';
      stopped.textContent = window.t('chat.stopped');
      body.appendChild(stopped);
    }

    if (!m.pending) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '<span class="material-symbols-rounded">content_copy</span>';
      copyBtn.title = window.t('chat.copy');
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(cleanRecall(m.text || '')));
      actions.appendChild(copyBtn);

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
  // SENDING / STREAMING (fallback: animate typing if not streamed)
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

  // Полная остановка текущего запроса и/или fallback-анимации печати.
  function stopStreaming() {
    AppState.stoppedByUser = true;
    if (currentAbort) {
      try { currentAbort.abort(); } catch {}
      currentAbort = null;
    }
    // Флаг isStreaming сбрасываем сразу — это заставит и цикл animateTyping,
    // и UI моментально вернуться в нормальное состояние.
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

    saveChats(AppState.chats);
    renderChatList(el.chatSearch.value);
    renderMessages();

    await requestAssistantReply(chat);
  }

  // Fallback: если стриминг не пришёл (одним куском), анимируем печать посимвольно.
  // Уважает флаг AppState.isStreaming — прерывается, если пользователь нажал «стоп».
  async function animateTyping(chat, msgId, fullText) {
    const msg = chat.messages.find((m) => m.id === msgId);
    if (!msg) return;

    const total = fullText.length;
    if (total === 0) return;
    const duration = Math.min(2400, Math.max(500, total * 9));
    const stepMs = 16;
    const chunk = Math.max(1, Math.ceil(total / Math.max(1, Math.floor(duration / stepMs))));

    for (let i = 0; i < total; i += chunk) {
      if (!AppState.isStreaming) return; // пользователь остановил — остаётся уже набранный префикс
      msg.text = fullText.slice(0, Math.min(total, i + chunk));
      renderMessages();
      await new Promise((r) => setTimeout(r, stepMs));
    }
    msg.text = fullText;
    delete msg.streaming;
    renderMessages();
  }

  const hasMedia = (m) => !!(m.attachments && m.attachments.some((a) => a && a.data));

  // Вложения уходят в модель только из ТЕКУЩЕГО сообщения пользователя.
  // Старые изображения не пересылаются (экономит трафик и токены и не отвлекает модель),
  // вместо них в историю попадает короткая пометка. Если модель попросила !recall_media,
  // клиент один раз повторяет запрос с последними старыми вложениями (recall = true).
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

  async function requestAssistantReply(chat) {
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
            model: chat.model,
            temperature: AppState.settings.temperature,
            customPrompt: AppState.settings.customPrompt || '',
            recall: recallPass,
            hasOldMedia: payload.hasOldMedia,
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
            if (obj.error && !fullText) { gotError = obj.error; continue; }
            if (obj.delta) {
              deltaCount++;
              fullText += obj.delta;
              const msg = getMsg();
              if (msg) {
                msg.text = fullText;
                msg.pending = false;
                msg.streaming = true;
                renderMessages();
              }
            }
          }
        }

        // Модель попросила старые медиа и (кроме маркера) ничего не ответила: повторяем один раз с вложениями.
        if (recallAsked && !recallPass && payload.canRecall && !AppState.stoppedByUser && !fullText.trim()) {
          recallPass = true;
          const msg = getMsg();
          if (msg) { msg.text = ''; msg.pending = true; delete msg.streaming; renderMessages(); }
          continue;
        }
        break;
      }
    } catch (e) {
      // AbortError при нажатии «стоп» — это НЕ ошибка, обрабатываем как нормальную остановку.
      if (!(e && e.name === 'AbortError')) {
        console.error('[chat] request failed', e);
      }
    }

    currentAbort = null;
    fullText = cleanRecall(fullText);

    // ---- Финализация сообщения ----
    const msg = getMsg();
    if (msg) {
      if (failedHttp) {
        Object.assign(msg, { text: window.t('error.generic'), error: true });
        delete msg.pending; delete msg.streaming;
      } else if (fullText.trim()) {
        // Если стрим не сработал (всё одним куском) — анимируем печать.
        // Но только если пользователь ещё не нажал «стоп».
        if (deltaCount <= 1 && fullText.length > 24 && !AppState.stoppedByUser) {
          msg.text = '';
          msg.pending = false;
          msg.streaming = true;
          renderMessages();
          await animateTyping(chat, pendingMsg.id, fullText);
        }
        const cur = getMsg();
        if (cur) {
          // cur.text — то, что успело набраться (может быть префиксом, если остановили).
          cur.text = cleanRecall(cur.text || fullText).trim();
          cur.stopped = !!AppState.stoppedByUser;
          delete cur.pending; delete cur.streaming;
          if (AppState.settings.voiceAutoplay && !AppState.stoppedByUser) speakText(cur.text);
        }
      } else if (AppState.stoppedByUser) {
        // Ничего не успело прийти и пользователь остановил — удаляем пустой пузырь.
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

  // ============================================================
  // VOICE — Web Speech API (STT + TTS), free & browser-native
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
    MODELS.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === AppState.settings.defaultModel) opt.selected = true;
      el.defaultModelSelect.appendChild(opt);
    });
  }

  // ============================================================
  // EVENT WIRING
  // ============================================================
  function wireEvents() {
    el.newChatBtn.addEventListener('click', () => {
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

    el.attachBtn.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      el.fileInput.value = '';
    });

    el.chatScroll.addEventListener('dragover', (e) => e.preventDefault());
    el.chatScroll.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    el.composerInput.addEventListener('input', autoGrow);
    el.composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && AppState.settings.sendOnEnter) {
        e.preventDefault();
        // Во время стриминга Enter ничего не должен делать — только кнопка «стоп».
        if (!AppState.isStreaming) sendMessage();
      }
    });

    // Кнопка отправки/остановки: два разных действия в зависимости от состояния.
    el.sendBtn.addEventListener('click', () => {
      if (AppState.isStreaming) {
        stopStreaming();
      } else {
        sendMessage();
      }
    });

    el.micBtn.addEventListener('click', toggleListening);

    // Делегирование: пункты чек-листов и кнопка «Повторить» в карточке ошибки
    el.messages.addEventListener('click', (e) => {
      const item = e.target.closest('.todo-item');
      if (item) { toggleTodo(item); return; }
      const retry = e.target.closest('.error-retry');
      if (retry) {
        const node = retry.closest('.msg');
        if (node && !AppState.isStreaming) regenerateFrom(node.dataset.id);
      }
    });

    // Маскот в пустом чате отзывается на тап: меняет версию анимации
    el.emptyLottie.addEventListener('click', () => {
      const cur = el.emptyLottie.dataset.pick;
      const other = LOTTIES.find((n) => n !== cur) || cur;
      showRandomLottie(other);
    });

    el.settingsBtn.addEventListener('click', () => { populateModelSelect(); openSettings(); });
    el.settingsCloseBtn.addEventListener('click', closeSettings);
    el.settingsBackdrop.addEventListener('click', closeSettings);

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
  function init() {
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
  }

  document.addEventListener('DOMContentLoaded', init);
})();
