// app.js — KulshGPT front-end logic
(function () {
  'use strict';

  // ============================================================
  // MODELS
  // ============================================================
  const MODELS = [
    { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      icon: 'bolt',        desc: { ru: 'Стабильная, быстрая модель', en: 'Stable, fast model' } },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', icon: 'flash_on',    desc: { ru: 'Самая быстрая и лёгкая', en: 'Fastest and lightest' } },
    { id: 'gemini-3.5-flash',      name: 'Gemini 3.5 Flash',      icon: 'auto_awesome',desc: { ru: 'Баланс скорости и качества', en: 'Balance of speed and quality' } },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', icon: 'speed',       desc: { ru: 'Облегчённая версия 3.5', en: 'Lightweight 3.5 variant' } },
    { id: 'gemini-3.6-flash',      name: 'Gemini 3.6 Flash',      icon: 'auto_awesome',desc: { ru: 'Улучшенное рассуждение', en: 'Improved reasoning' } },
    { id: 'gemini-3.7-flash',      name: 'Gemini 3.7 Flash',      icon: 'auto_awesome',desc: { ru: 'Новее и точнее', en: 'Newer and more accurate' } },
    { id: 'gemini-3.8-flash',      name: 'Gemini 3.8 Flash',      icon: 'auto_awesome',desc: { ru: 'Самая новая модель линейки', en: 'The newest in the lineup' } },
  ];

  const LOTTIES = ['freedom', 'moai', 'moai2', 'octopus', 'sakura', 'wine'];

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
      fontFamily: 'roboto',
      showAvatars: true,
      showNames: true,
      reduceMotion: false,
      lottie: true,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign(defaults, JSON.parse(raw)) : defaults;
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
    root.setAttribute('data-avatars', S.showAvatars ? 'on' : 'off');
    root.setAttribute('data-names', S.showNames ? 'on' : 'off');
    root.setAttribute('data-hint', S.showHint ? 'on' : 'off');
    root.setAttribute('data-motion', S.reduceMotion ? 'reduce' : 'full');
    root.setAttribute('data-lottie', S.lottie ? 'on' : 'off');
    window.applyI18n(AppState.settings.lang);
    const setSeg = (id, key) => $$('#' + id + ' .segmented-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.v === S[key]));
    setSeg('chatWidthSeg', 'chatWidth'); setSeg('densitySeg', 'density'); setSeg('fontFamilySeg', 'fontFamily');
    const setSw = (id, val) => { const n = document.getElementById(id); if (n) n.setAttribute('aria-checked', String(!!val)); };
    setSw('autoScrollSwitch', S.autoScroll); setSw('showHintSwitch', S.showHint); setSw('showAvatarsSwitch', S.showAvatars);
    setSw('showNamesSwitch', S.showNames); setSw('reduceMotionSwitch', S.reduceMotion); setSw('lottieSwitch', S.lottie);
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

    el.modelPickerMenu.innerHTML = '';
    MODELS.forEach((m) => {
      const opt = document.createElement('button');
      opt.className = 'model-option' + (m.id === currentModelId ? ' is-selected' : '');
      opt.setAttribute('role', 'option');
      const lang = AppState.settings.lang;
      opt.innerHTML = `
        <span class="model-option-icon"><span class="material-symbols-rounded">${m.icon}</span></span>
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

  function showRandomLottie() {
    if (lottieInstance) { lottieInstance.destroy(); lottieInstance = null; }
    el.emptyLottie.innerHTML = '';
    const pick = LOTTIES[Math.floor(Math.random() * LOTTIES.length)];
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
  function renderMarkdown(text) {
    if (!window.marked) return escapeHtml(text);
    window.marked.setOptions({ breaks: true, gfm: true });
    let html = window.marked.parse(text || '');
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

  function patchMessageNode(node, m) {
    const content = node.querySelector('.msg-content');
    if (!content) return;
    node.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant')
      + (m.streaming ? ' is-streaming' : '')
      + (m.stopped ? ' is-stopped' : '');

    if (m.pending) {
      content.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    } else if (m.error) {
      content.innerHTML = `<div class="error-banner"><span class="material-symbols-rounded">error</span><span></span></div>`;
      content.querySelector('.error-banner span:last-child').textContent = m.text;
    } else {
      content.innerHTML = renderMarkdown(m.text);
    }

    if (!m.pending && !m.streaming && !node.querySelector('.msg-actions')) {
      const fresh = buildMessageNode(m);
      fresh.style.animation = 'none';
      node.replaceWith(fresh);
      enhanceCodeBlocks(fresh);
    }
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
    if (m.role === 'user') {
      avatar.innerHTML = '<span class="material-symbols-rounded">person</span>';
    } else {
      avatar.innerHTML = '<img src="assets/logo.png" alt="" />';
    }

    const body = document.createElement('div');
    body.className = 'msg-body';

    const name = document.createElement('div');
    name.className = 'msg-name';
    name.textContent = m.role === 'user' ? window.t('chat.you') : 'KulshGPT';
    body.appendChild(name);

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
    if (m.pending) {
      content.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    } else if (m.error) {
      content.innerHTML = `<div class="error-banner"><span class="material-symbols-rounded">error</span><span></span></div>`;
      content.querySelector('.error-banner span:last-child').textContent = m.text;
    } else {
      content.innerHTML = renderMarkdown(m.text);
    }
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
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(m.text || ''));
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
  async function animateTyping(msgId, fullText) {
    const chat = getActiveChat();
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;

    const total = fullText.length;
    if (total === 0) return;
    const duration = Math.min(2400, Math.max(500, total * 9));
    const stepMs = 16;
    const chunk = Math.max(1, Math.ceil(total / Math.max(1, Math.floor(duration / stepMs))));

    for (let i = 0; i < total; i += chunk) {
      if (!AppState.isStreaming) {
        // Пользователь остановил — оставляем уже набранный префикс.
        return;
      }
      const end = Math.min(total, i + chunk);
      chat.messages[idx].text = fullText.slice(0, end);
      renderMessages();
      await new Promise((r) => setTimeout(r, stepMs));
    }
    chat.messages[idx] = { id: msgId, role: 'assistant', text: fullText };
    renderMessages();
  }

  async function requestAssistantReply(chat) {
    const pendingMsg = { id: uid(), role: 'assistant', text: '', pending: true };
    chat.messages.push(pendingMsg);
    renderMessages();
    setSendingState(true);

    const abort = new AbortController();
    currentAbort = abort;
    AppState.stoppedByUser = false;

    const idxOf = () => chat.messages.findIndex((m) => m.id === pendingMsg.id);
    let fullText = '';
    let gotError = '';
    let firstChunk = true;
    let deltaCount = 0;

    try {
      const payloadMessages = chat.messages
        .filter((m) => m.id !== pendingMsg.id && !m.error && (m.text || (m.attachments && m.attachments.length)))
        .map((m) => ({ role: m.role, content: m.text, attachments: m.attachments || [] }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          messages: payloadMessages,
          model: chat.model,
          temperature: AppState.settings.temperature,
          customPrompt: AppState.settings.customPrompt || '',
        }),
      });

      if (!res.ok || !res.body) {
        const idx = idxOf();
        if (idx !== -1) chat.messages[idx] = { id: pendingMsg.id, role: 'assistant', text: window.t('error.generic'), error: true };
        saveChats(AppState.chats); renderMessages(); setSendingState(false);
        currentAbort = null;
        return;
      }

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
          if (obj.error && !fullText) { gotError = obj.error; continue; }
          if (obj.delta) {
            deltaCount++;
            fullText += obj.delta;
            const idx = idxOf();
            if (idx !== -1) {
              if (firstChunk) {
                chat.messages[idx] = { id: pendingMsg.id, role: 'assistant', text: fullText, pending: false, streaming: true };
                firstChunk = false;
              } else {
                chat.messages[idx].text = fullText;
              }
              renderMessages();
            }
          }
        }
      }
    } catch (e) {
      // AbortError при нажатии «стоп» — это НЕ ошибка, обрабатываем как нормальную остановку.
      if (!(e && e.name === 'AbortError')) {
        console.error('[chat] request failed', e);
      }
    }

    currentAbort = null;

    // ---- Финализация сообщения ----
    const idx = idxOf();
    if (idx !== -1) {
      if (fullText) {
        // Если стрим не сработал (всё одним куском) — анимируем печать.
        // Но только если пользователь ещё не нажал «стоп».
        if (deltaCount <= 1 && fullText.length > 24 && !AppState.stoppedByUser) {
          chat.messages[idx] = { id: pendingMsg.id, role: 'assistant', text: '', streaming: true };
          renderMessages();
          await animateTyping(pendingMsg.id, fullText);
        }

        const idx2 = idxOf();
        if (idx2 !== -1) {
          const cur = chat.messages[idx2] || {};
          // cur.text — то, что успело набраться (может быть префиксом, если остановили).
          const finalText = cur.text || fullText;
          chat.messages[idx2] = {
            id: pendingMsg.id,
            role: 'assistant',
            text: finalText,
            stopped: !!AppState.stoppedByUser,
          };
          if (AppState.settings.voiceAutoplay && !AppState.stoppedByUser) speakText(finalText);
        }
      } else if (AppState.stoppedByUser) {
        // Ничего не успело прийти и пользователь остановил — удаляем пустой пузырь.
        chat.messages.splice(idx, 1);
      } else {
        chat.messages[idx] = { id: pendingMsg.id, role: 'assistant', text: gotError || window.t('error.generic'), error: true };
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
    bindSw('showAvatarsSwitch', 'showAvatars');
    bindSw('showNamesSwitch', 'showNames');
    bindSw('reduceMotionSwitch', 'reduceMotion');
    bindSw('lottieSwitch', 'lottie');

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
