// auth.js — вход через Google / GitHub / Telegram, диалог и состояние гостя.
// Подключается ДО app.js. app.js использует window.KulshAuth.
(function () {
  'use strict';
  const GUEST_MODEL = 'gemini-3.5-flash-lite';

  const T = {
    ru: {
      login: 'Войти', account: 'Аккаунт', title: 'Добро пожаловать в Кульш', sub: 'Войди через сервис — без паролей и почты.',
      google: 'Продолжить с Google', github: 'Продолжить с GitHub', telegram: 'Продолжить с Telegram',
      perksTitle: 'После входа', perks: ['Все модели Gemini', 'Новые чаты и история', 'Фото и файлы во вложениях', 'Свои инструкции и креативность'],
      guest: 'Без входа: только Gemini 3.5 Flash Lite, один чат, без вложений.',
      none: 'Вход пока не настроен. Владелец сайта: см. README.',
      logout: 'Выйти', via: 'Вход через', popup: 'Разреши всплывающие окна и попробуй ещё раз.',
      cTitle: 'Добро пожаловать!', cSub: 'Прежде чем начать, ознакомься с тем, как работает Кульш и как мы обращаемся с данными.', cPolicy: 'Политика конфиденциальности',
      cItems: ['Чаты и настройки сохраняются в твоём аккаунте и доступны на всех устройствах', 'Сообщения отправляются нейросети Gemini для ответа', 'При входе мы получаем только имя и аватар — без почты и паролей', 'Выйти и очистить данные можно в любой момент'],
      cText: 'Нажимая «Принять», ты соглашаешься с', cAccept: 'Принять', cLater: 'Не сейчас', lockedModel: 'Нужен вход', lockedFeature: 'Эта функция доступна после входа.',
      menuSettings: 'Настройки', menuLang: 'Язык', menuSkills: 'Скиллы', menuSupport: 'Поддержать',
      menuDetails: 'Подробнее', menuAbout: 'О Kulsh', menuPrivacy: 'Политика конфиденциальности', menuPrivacySettings: 'Настройки конфиденциальности',
      usageTitle: 'Дневной лимит', usageResets: 'Сброс', balance: 'Баланс', balanceSoon: 'Пополнение скоро',
      usageGuest: 'Гостевой лимит', usageLogin: 'Войти, чтобы больше', skillsSoon: 'Каталог скиллов появится здесь совсем скоро.',
      errors: { provider_off: 'Этот способ входа отключён.', state: 'Сессия входа устарела. Попробуй ещё раз.', bad_signature: 'Telegram не подтвердил вход.', failed: 'Не удалось войти. Попробуй ещё раз.', cancelled: 'Вход отменён.' },
    },
    en: {
      login: 'Sign in', account: 'Account', title: 'Welcome to Kulsh', sub: 'Sign in with a service — no passwords, no email.',
      google: 'Continue with Google', github: 'Continue with GitHub', telegram: 'Continue with Telegram',
      perksTitle: 'After signing in', perks: ['All Gemini models', 'New chats and history', 'Photo and file attachments', 'Custom instructions and creativity'],
      guest: 'Signed out: Gemini 3.5 Flash Lite only, one chat, no attachments.',
      none: 'Sign-in is not configured yet. Site owner: see README.',
      logout: 'Sign out', via: 'Signed in with', popup: 'Allow pop-ups and try again.',
      cTitle: 'Welcome!', cSub: 'Before you start, here is how Kulsh works and how we handle your data.', cPolicy: 'Privacy Policy',
      cItems: ['Chats and settings are saved to your account and available on all your devices', 'Messages are sent to Gemini to generate replies', 'Signing in gives us only your name and avatar — no email or passwords', 'You can sign out and clear your data at any time'],
      cText: 'By tapping “Accept” you agree to the', cAccept: 'Accept', cLater: 'Not now', lockedModel: 'Sign-in required', lockedFeature: 'This feature is available after signing in.',
      menuSettings: 'Settings', menuLang: 'Language', menuSkills: 'Skills', menuSupport: 'Support',
      menuDetails: 'More', menuAbout: 'About Kulsh', menuPrivacy: 'Privacy Policy', menuPrivacySettings: 'Privacy settings',
      usageTitle: 'Daily limit', usageResets: 'Resets', balance: 'Balance', balanceSoon: 'Top-up coming soon',
      usageGuest: 'Guest limit', usageLogin: 'Sign in for more', skillsSoon: 'The skills catalog will land here very soon.',
      errors: { provider_off: 'This sign-in method is disabled.', state: 'Sign-in session expired. Try again.', bad_signature: 'Telegram did not confirm the sign-in.', failed: 'Could not sign in. Try again.', cancelled: 'Sign-in cancelled.' },
    },
  };
  const lang = () => { try { return JSON.parse(localStorage.getItem('kulshgpt.settings.v1')).lang === 'en' ? 'en' : 'ru'; } catch { return 'ru'; } };
  const tr = () => T[lang()];

  const ICON = {
    google: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.8 2.3 2.6 6.5 2.6 11.8S6.8 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/></svg>',
    github: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#29A9EB"/><path fill="#fff" d="M5.4 11.8l11.2-4.3c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.8-2.1-1.4 1.3c-.1.2-.3.3-.6.3l.2-2.9 5.2-4.7c.2-.2 0-.3-.3-.1l-6.4 4-2.8-.9c-.6-.2-.6-.6.1-.9z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const USER_KEY = 'kulsh.user.v1', CONSENT_KEY = 'kulsh.privacy.v1', POLICY_VER = '2026-10';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const cachedUser = () => { try { return JSON.parse(store.get(USER_KEY)); } catch { return null; } };
  const hasConsent = () => store.get(CONSENT_KEY) === POLICY_VER;

  const A = (window.KulshAuth = {
    GUEST_MODEL, ICON, user: cachedUser(), providers: {}, telegramBotId: null, loaded: false,
    get guest() { return !this.user; },
    t: () => tr(),
    open, close,
    toast(msg) { open(msg || tr().lockedFeature); },
  });

  document.documentElement.dataset.guest = A.user ? 'off' : 'on';
  let tgLoading = null;
  function loadTelegram() {
    if (window.Telegram && window.Telegram.Login) return Promise.resolve();
    if (!tgLoading) tgLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://telegram.org/js/telegram-widget.js?22';
      s.onload = res; s.onerror = () => { tgLoading = null; rej(new Error('failed')); };
      document.head.appendChild(s);
    });
    return tgLoading;
  }

  // ---------- DOM ----------
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop'; backdrop.id = 'authBackdrop';
  const dlg = document.createElement('div');
  dlg.className = 'dialog auth-dialog'; dlg.id = 'authDialog';
  dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
  document.addEventListener('DOMContentLoaded', () => { document.body.append(menuBackdrop, menu, backdrop, dlg); mountAccountBtn(); render(); setTimeout(maybeConsent, 700); });

  let accountBtn = null;
  function mountAccountBtn() {
    const settings = document.getElementById('settingsBtn');
    const slot = document.getElementById('accountSlot');
    if (!settings && !slot) return;
    const host = settings ? settings.parentNode : slot.parentNode;
    const inSidebar = !!(host && host.classList && host.classList.contains('sidebar-bottom'));
    accountBtn = document.createElement('button');
    accountBtn.type = 'button';
    // В сайдбаре берём тот же класс .sidebar-user, чтобы кнопка совпадала по
    // отступам/высоте/цвету с прежними «Поддержать» и «Настройки».
    accountBtn.className = (inSidebar ? 'sidebar-user ' : '') + 'account-btn';
    accountBtn.id = 'accountBtn';
    accountBtn.addEventListener('click', () => {
      // Гость → окно входа. Залогиненный → объединённое меню аккаунта и настроек.
      if (!A.user) { open(); return; }
      toggleMenu();
    });
    if (settings) settings.parentNode.insertBefore(accountBtn, settings); else slot.replaceWith(accountBtn);
    renderAccountBtn();
  }
  function avatarHTML(u, cls) {
    return u.avatar
      ? `<img class="${cls}" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} av-fallback',textContent:'${esc((u.name || '?')[0].toUpperCase())}'}))">`
      : `<span class="${cls} av-fallback">${esc((u.name || '?')[0].toUpperCase())}</span>`;
  }
  function renderAccountBtn() {
    if (!accountBtn) return;
    const s = tr();
    // И гостевую иконку, и аватар кладём в один слот .acc-slot фиксированного
    // размера (24×24) — так кнопка совпадает с «Поддержать» и «Настройки»
    // и когда ты гость, и когда авторизован.
    accountBtn.innerHTML = A.user
      ? `<span class="acc-slot">${avatarHTML(A.user, 'account-av')}</span><span class="account-name">${esc(A.user.name)}</span>`
      : `<span class="acc-slot"><span class="material-symbols-rounded">person</span></span><span>${esc(s.login)}</span>`;
    document.documentElement.dataset.guest = A.user ? 'off' : 'on';
  }

  // ============================================================
  // ОБЪЕДИНЁННОЕ МЕНЮ «АККАУНТ + НАСТРОЙКИ»
  // ============================================================
  const menu = document.createElement('div');
  menu.className = 'acct-menu';
  menu.id = 'acctMenu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'false');
  const menuBackdrop = document.createElement('div');
  menuBackdrop.className = 'acct-backdrop';

  let usage = null;
  const fmtPts = (n) => (Math.round(Number(n) * 10) / 10).toString();

  function usageHTML() {
    const s = tr();
    const u = usage || { used: 0, limit: 300, guest: !A.user };
    const pct = Math.max(0, Math.min(100, u.limit ? (u.used / u.limit) * 100 : 0));
    const left = Math.max(0, u.limit - u.used);
    const tone = pct >= 85 ? 'is-danger' : pct >= 60 ? 'is-warn' : '';
    let reset = '';
    if (u.resetsAt) {
      try {
        const d = new Date(u.resetsAt);
        reset = `${s.usageResets} ${d.toLocaleTimeString(lang() === 'en' ? 'en' : 'ru', { hour: '2-digit', minute: '2-digit' })}`;
      } catch {}
    }
    return `
      <div class="acct-usage">
        <div class="acct-usage-top">
          <span>${A.user ? s.usageTitle : s.usageGuest}</span>
          <span class="acct-usage-num">${fmtPts(u.used)} / ${fmtPts(u.limit)}</span>
        </div>
        <div class="acct-bar ${tone}"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="acct-usage-sub">
          <span>${esc(left === 0 ? (lang() === 'en' ? 'Limit reached' : 'Лимит исчерпан') : (lang() === 'en' ? left + ' left' : 'осталось ' + fmtPts(left)))}</span>
          ${reset ? `<span>${esc(reset)}</span>` : ''}
        </div>
      </div>
      <div class="acct-balance">
        <span class="material-symbols-rounded">account_balance_wallet</span>
        <span>${s.balance}: ${fmtPts(u.balance || 0)} ₽</span>
        <span class="acct-soon">${s.balanceSoon}</span>
      </div>`;
  }

  function renderMenu() {
    const s = tr();
    const u = A.user || {};
    const PROV_NAME = { google: 'Google', github: 'GitHub', telegram: 'Telegram' };
    const prov = PROV_NAME[u.provider] || ((u.provider || '')[0] ? u.provider[0].toUpperCase() + u.provider.slice(1) : '');
    const handle = u.handle || '';
    menu.innerHTML = `
      <div class="acct-head">
        <span class="acct-avatar">${avatarHTML(u, 'acct-av')}</span>
        <span class="acct-id">
          <span class="acct-name">${esc(u.name || '')}</span>
          ${handle ? `<span class="acct-handle">${esc(handle)}</span>` : ''}
        </span>
        ${prov ? `<span class="acct-provider">${ICON[u.provider] || ''}<span>${esc(prov)}</span></span>` : ''}
      </div>
      ${usageHTML()}
      <div class="acct-list">
        <button class="acct-item" type="button" data-act="settings">
          <span class="material-symbols-rounded">settings</span><span>${s.menuSettings}</span>
        </button>
        <div class="acct-item acct-item-static">
          <span class="material-symbols-rounded">language</span><span>${s.menuLang}</span>
          <span class="acct-seg">
            <button type="button" data-lang="ru" class="${lang() === 'ru' ? 'is-active' : ''}">RU</button>
            <button type="button" data-lang="en" class="${lang() === 'en' ? 'is-active' : ''}">EN</button>
          </span>
        </div>
        <button class="acct-item" type="button" data-act="skills">
          <span class="material-symbols-rounded">extension</span><span>${s.menuSkills}</span>
        </button>
        <a class="acct-item" href="/donate" target="_blank" rel="noopener noreferrer">
          <span class="material-symbols-rounded">favorite</span><span>${s.menuSupport}</span>
        </a>
        <button class="acct-item acct-item-toggle" type="button" data-act="details" aria-expanded="false">
          <span class="material-symbols-rounded">info</span><span>${s.menuDetails}</span>
          <span class="material-symbols-rounded acct-chevron">expand_more</span>
        </button>
        <div class="acct-sub" hidden>
          <a class="acct-subitem" href="/about"><span class="material-symbols-rounded">description</span><span>${s.menuAbout}</span></a>
          <a class="acct-subitem" href="/privacy"><span class="material-symbols-rounded">policy</span><span>${s.menuPrivacy}</span></a>
          <button class="acct-subitem" type="button" data-act="privacy-settings"><span class="material-symbols-rounded">tune</span><span>${s.menuPrivacySettings}</span></button>
        </div>
        <button class="acct-item acct-item-danger" type="button" data-act="logout">
          <span class="material-symbols-rounded">logout</span><span>${s.logout}</span>
        </button>
      </div>`;
  }

  function positionMenu() {
    if (!accountBtn) return;
    const mobile = matchMedia('(max-width: 620px)').matches;
    if (mobile) { menu.style.left = ''; menu.style.top = ''; menu.style.right = ''; menu.style.bottom = ''; return; }
    const r = accountBtn.getBoundingClientRect();
    const mw = menu.offsetWidth || 320;
    const mh = menu.offsetHeight || 420;
    let left = r.left;
    if (left + mw > window.innerWidth - 12) left = Math.max(12, window.innerWidth - mw - 12);
    // Открываем вверх, если снизу мало места.
    let top = r.bottom + 8;
    if (top + mh > window.innerHeight - 12) top = Math.max(12, r.top - mh - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function openMenu() {
    if (!A.user) return;
    renderMenu();
    menuBackdrop.classList.add('is-open');
    menu.classList.add('is-open');
    positionMenu();
    // Подтягиваем актуальный usage.
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { usage = j; if (menu.classList.contains('is-open')) { renderMenu(); positionMenu(); } })
      .catch(() => {});
  }
  function closeMenu() { menu.classList.remove('is-open'); menuBackdrop.classList.remove('is-open'); }
  function toggleMenu() { menu.classList.contains('is-open') ? closeMenu() : openMenu(); }

  menuBackdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', () => { if (menu.classList.contains('is-open')) positionMenu(); });

  menu.addEventListener('click', async (e) => {
    const seg = e.target.closest('.acct-seg button');
    if (seg) {
      try { const st = JSON.parse(localStorage.getItem('kulshgpt.settings.v1') || '{}'); st.lang = seg.dataset.lang; localStorage.setItem('kulshgpt.settings.v1', JSON.stringify(st)); } catch {}
      window.dispatchEvent(new CustomEvent('kulsh-lang-change'));
      renderMenu(); renderAccountBtn();
      return;
    }
    const item = e.target.closest('[data-act]');
    if (!item) return;
    const act = item.dataset.act;
    if (act === 'settings') {
      closeMenu();
      if (document.getElementById('settingsDialog')) window.dispatchEvent(new CustomEvent('kulsh-open-settings'));
      else location.href = '/chat/#settings';
    } else if (act === 'skills') {
      closeMenu();
      if (document.getElementById('settingsDialog')) window.dispatchEvent(new CustomEvent('kulsh-open-skills'));
      else location.href = '/chat/#skills';
    } else if (act === 'details') {
      const sub = menu.querySelector('.acct-sub');
      const open = sub.hidden;
      sub.hidden = !open;
      item.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
      positionMenu();
    } else if (act === 'privacy-settings') {
      closeMenu();
      askConsent();
    } else if (act === 'logout') {
      try { if (window.KulshSync) await window.KulshSync.onLogout(); } catch {}
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      A.user = null; store.set(USER_KEY, null); closeMenu(); changed();
    }
  });

  function render(notice) {
    const s = tr(); const p = A.providers; const on = ['google', 'github', 'telegram'].filter((k) => p[k]);
    let h = `<button class="icon-btn auth-close" id="authClose" type="button" aria-label="Close">${ICON.close}</button><div class="auth-glow"></div>`;
    if (A.user) {
      h += `<div class="auth-hero">${avatarHTML(A.user, 'auth-av')}<h2>${esc(A.user.name)}</h2>
        <span class="auth-chip">${ICON[A.user.provider] || ''}${s.via} ${esc(A.user.provider[0].toUpperCase() + A.user.provider.slice(1))}</span></div>
        <button class="btn btn-danger auth-logout" id="authLogout" type="button">${s.logout}</button>`;
    } else {
      h += `<div class="auth-hero"><img class="auth-logo" src="/assets/logo.png" alt=""><h2>${s.title}</h2><p>${s.sub}</p></div>`;
      if (notice) h += `<div class="auth-note">${esc(notice)}</div>`;
      h += `<div class="auth-buttons">${on.map((k) => `<button type="button" class="auth-btn auth-${k}" data-p="${k}">${ICON[k]}<span>${s[k]}</span></button>`).join('') || `<div class="auth-note">${s.none}</div>`}</div>
        <div class="auth-perks"><b>${s.perksTitle}</b>${s.perks.map((x) => `<div>${ICON.check}<span>${x}</span></div>`).join('')}</div>
        <div class="auth-guest">${ICON.lock}<span>${s.guest}</span></div>`;
    }
    dlg.innerHTML = h;
    dlg.querySelector('#authClose').onclick = close;
    const lo = dlg.querySelector('#authLogout');
    if (lo) lo.onclick = async () => { try { if (window.KulshSync) await window.KulshSync.onLogout(); } catch {} try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {} A.user = null; store.set(USER_KEY, null); changed(); close(); };
    dlg.querySelectorAll('.auth-btn').forEach((b) => b.addEventListener('click', () => signIn(b.dataset.p, b)));
    renderAccountBtn();
  }

  function open(notice) {
    if (!A.user && !hasConsent() && !notice) return askConsent(() => open());
    render(typeof notice === 'string' ? notice : '');
    if (!A.user && A.providers.telegram) loadTelegram().catch(() => {});
    backdrop.classList.add('is-open'); dlg.classList.add('is-open');
  }
  function close() { backdrop.classList.remove('is-open'); dlg.classList.remove('is-open'); }
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function changed() { render(); window.dispatchEvent(new CustomEvent('kulsh-auth')); }

  function signIn(p, btn) {
    if (!hasConsent()) return askConsent(() => signIn(p, btn));
    if (p !== 'telegram') { location.href = `/api/auth/start/${p}`; return; }
    // Окно Telegram нужно открыть синхронно по клику, иначе браузер его заблокирует.
    if (!(window.Telegram && window.Telegram.Login)) {
      loadTelegram().then(() => open(tr().errors.failed), () => open(tr().errors.failed));
      return;
    }
    if (!A.telegramBotId) return open(tr().errors.failed);
    btn.classList.add('is-busy');
    try {
      window.Telegram.Login.auth({ bot_id: Number(A.telegramBotId), request_access: 'write', lang: lang() }, async (data) => {
        btn.classList.remove('is-busy');
        if (!data) return open(tr().errors.cancelled);
        try {
          const r = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          const j = await r.json();
          if (!r.ok || !j.user) throw new Error(j.error || 'failed');
          A.user = j.user; store.set(USER_KEY, JSON.stringify(j.user)); changed(); close();
        } catch (e) { open(tr().errors[e.message] || tr().errors.failed); }
      });
    } catch { btn.classList.remove('is-busy'); open(tr().popup); }
    setTimeout(() => btn.classList.remove('is-busy'), 120000);
  }

  // ---------- согласие с политикой ----------
  const cBackdrop = document.createElement('div'); cBackdrop.className = 'dialog-backdrop'; cBackdrop.style.zIndex = 60;
  const cDlg = document.createElement('div'); cDlg.className = 'dialog consent-dialog'; cDlg.style.zIndex = 61;
  cDlg.setAttribute('role', 'dialog'); cDlg.setAttribute('aria-modal', 'true');
  document.addEventListener('DOMContentLoaded', () => document.body.append(cBackdrop, cDlg));
  let afterConsent = null;
  function askConsent(cb) {
    const s = tr(); afterConsent = cb || null;
    cDlg.innerHTML = `<div class="auth-glow"></div><img class="consent-logo" src="/assets/logo.png" alt="">
      <h2>${s.cTitle}</h2><p>${s.cSub}</p>
      <div class="consent-list">${s.cItems.map((x) => `<div>${ICON.check}<span>${x}</span></div>`).join('')}</div>
      <p>${s.cText} <a href="/privacy/" target="_blank" rel="noopener">${s.cPolicy}</a>.</p>
      <div class="consent-actions"><button type="button" class="btn btn-filled" id="cAccept">${s.cAccept}</button>
      <button type="button" class="consent-later" id="cLater">${s.cLater}</button></div>`;
    cBackdrop.classList.add('is-open'); cDlg.classList.add('is-open');
    cDlg.querySelector('#cAccept').onclick = () => { store.set(CONSENT_KEY, POLICY_VER); hideConsent(); const f = afterConsent; afterConsent = null; if (f) f(); };
    cDlg.querySelector('#cLater').onclick = () => { afterConsent = null; hideConsent(); };
  }
  function hideConsent() { cBackdrop.classList.remove('is-open'); cDlg.classList.remove('is-open'); }
  function maybeConsent() { if (!hasConsent() && location.pathname.startsWith('/chat')) askConsent(); }

  // Мгновенный рендер из кэша — кнопка появляется сразу, не дожидаясь /api/auth/me.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAccountBtn);
  } else {
    setTimeout(renderAccountBtn, 0);
  }

  window.addEventListener('kulsh-lang-change', () => {
    renderAccountBtn();
    if (dlg.classList.contains('is-open')) render();
  });

  // ---------- старт ----------
  A.ready = Promise.race([
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      A.user = j.user; A.providers = j.providers || {}; A.telegramBotId = j.telegramBotId; A.loaded = true;
      store.set(USER_KEY, j.user ? JSON.stringify(j.user) : null);
      renderAccountBtn();
      if (A.providers.telegram) loadTelegram().catch(() => {});
    }).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]).then(() => {
    const err = new URLSearchParams(location.search).get('auth_error');
    if (err) {
      history.replaceState(null, '', location.pathname);
      document.addEventListener('DOMContentLoaded', () => open(tr().errors[err] || tr().errors.failed));
      if (document.readyState !== 'loading') open(tr().errors[err] || tr().errors.failed);
    }
    document.documentElement.dataset.guest = A.user ? 'off' : 'on';
    const fire = () => { renderAccountBtn(); if (!dlg.classList.contains('is-open')) render(); window.dispatchEvent(new CustomEvent('kulsh-auth')); };
    if (document.readyState !== 'loading') fire(); else document.addEventListener('DOMContentLoaded', fire);
  });
})();
