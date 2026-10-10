// pages.js — общая логика страниц проекта (лендинг, «О Kulsh», API).
//  - Тема/акцент берутся из тех же настроек, что и чат (kulshgpt.settings.v1).
//  - Язык: если пользователь его не выбирал, определяется по языку браузера.
//  - Переключатель языка есть на каждой странице и синхронизируется с чатом.
//  - Кнопки с data-wave получают побуквенную анимацию текста (волной).
(function () {
  'use strict';
  // Помечаем, что JS работает: только тогда reveal-секции прячутся до появления.
  document.documentElement.classList.add('js');

  const SETTINGS_KEY = 'kulshgpt.settings.v1';

  const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; } };
  const writeSettings = (patch) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(readSettings(), patch))); } catch {}
  };
  const detectLang = () => {
    const s = readSettings();
    if (s.lang === 'ru' || s.lang === 'en') return s.lang;
    const n = (navigator.language || navigator.userLanguage || 'ru').toLowerCase();
    return n.indexOf('ru') === 0 ? 'ru' : 'en';
  };
  const applyTheme = () => {
    let t = readSettings().theme || 'dark';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const r = document.documentElement;
    r.dataset.theme = t;
    r.dataset.accent = readSettings().accent || 'violet';
  };

  // ---------- i18n ----------
  const T = {
    ru: {
      'nav.home': 'Главная', 'nav.about': 'О Kulsh', 'nav.api': 'API', 'nav.openChat': 'Открыть чат', 'nav.theme': 'Сменить тему', 'nav.menu': 'Меню',
      'foot.home': 'Главная', 'foot.about': 'О Kulsh', 'foot.api': 'API', 'foot.privacy': 'Политика конфиденциальности', 'foot.donate': 'Поддержать', 'foot.github': 'GitHub', 'foot.note': 'open-source',

      // --- Главная ---
      'home.title': 'Kulsh — open-source ИИ-ассистент',
      'home.h1': 'Общайся с <span class="accent">Кульшем</span><br>на любом языке и моделях',
      'home.sub': 'Открытый ИИ-ассистент: несколько моделей в одном чате — Gemini, DeepSeek, GLM и Kimi. Голос, вложения, скиллы и история, которая живёт в твоём аккаунте.',
      'home.start': 'Начать бесплатно', 'home.aboutBtn': 'О проекте',
      'badge.voice': 'Голосовой ввод', 'badge.attach': 'Вложения',
      'feat.eyebrow': 'Возможности', 'feat.h2': 'Всё для работы и разговора — в одном месте',
      'feat.p': 'Kulsh не привязывает тебя к одной модели. Выбирай под задачу: быструю для болтовни, умную для кода и разбора файлов.',
      'feat.1.t': 'Быстрые ответы', 'feat.1.d': 'Ответ приходит потоком, почти мгновенно. Можно остановить генерацию в любой момент.',
      'feat.2.t': 'Много моделей', 'feat.2.d': 'Gemini, DeepSeek, GLM и Kimi в одном интерфейсе. Переключение — одним касанием.',
      'feat.3.t': 'Файлы и фото', 'feat.3.d': 'Прикрепляй изображения, ZIP и текстовые файлы. Модель разберёт их и ответит по существу.',
      'feat.4.t': 'Голос', 'feat.4.d': 'Говори вместо печати и слушай ответы — распознавание и озвучка прямо в браузере.',
      'feat.5.t': 'Скиллы', 'feat.5.d': 'Подключай markdown-скиллы: свои инструкции и наборы знаний, которые подгружаются по требованию.',
      'feat.6.t': 'Синхронизация', 'feat.6.d': 'История и настройки сохраняются в аккаунте и доступны на всех твоих устройствах.',
      'models.eyebrow': 'Модели', 'models.h2': 'Выбирай модель под задачу',
      'models.p': 'Один дневной лимит токенов на все модели — но расходуется по-разному. Лёгкие модели почти «бесплатны», флагманы тратят больше.',
      'tag.generous': 'щедро', 'tag.limited': 'ограниченный лимит', 'tag.novision': 'без зрения',
      'm.gemini.d': 'Стабильные и быстрые модели Google — универсальный выбор на каждый день.',
      'm.dsf.d': 'Самый выгодный по лимиту, хорошо держит длинный контекст.',
      'm.dsp.d': 'Усиленное рассуждение для кода и сложных задач. Изображения не принимает.',
      'm.glm.d': 'Быстрая и аккуратная, с большим контекстом.',
      'm.kimi.d': 'Сильная в длинных текстах, расходует бесплатный лимит заметно быстрее.',
      'm.gemini38.d': 'Новейшие модели линейки: точнее, но дороже по лимиту.',
      'cta.h2': 'Готов попробовать?',
      'cta.p': 'Войди через Google, GitHub или Telegram — и получишь все модели, новые чаты и вложения. Или попробуй как гость.',
      'cta.chat': 'Открыть чат', 'cta.docs': 'Документация API',

      // --- О Kulsh ---
      'about.title': 'О Kulsh — открытый ИИ-ассистент',
      'about.eyebrow': 'О проекте', 'about.h1': 'Что такое <span class="accent">Kulsh</span>',
      'about.sub': 'Kulsh — открытый ИИ-ассистент и веб-чат: одна точка входа сразу к нескольким языковым моделям, с голосом, вложениями, скиллами и историей в аккаунте. Проект делает небольшая команда, а код лежит в открытом доступе.',
      'about.try': 'Попробовать', 'about.src': 'Исходники на GitHub',
      'about.1.t': 'Одна модель — много характеров', 'about.1.d': 'Kulsh умеет подключаться к разным моделям: Gemini, DeepSeek, GLM и Kimi. Ты выбираешь, кому доверить задачу, а интерфейс остаётся тем же.',
      'about.2.t': 'Живой, а не канцелярский', 'about.2.d': 'Кульш общается по-дружески и по делу — без лишних нравоучений. Но всегда грамотно и по существу.',
      'about.3.t': 'Скиллы', 'about.3.d': 'Наборы инструкций и знаний в формате markdown. Подключаются по требованию, поэтому не раздувают контекст.',
      'about.4.t': 'Приватность', 'about.4.d': 'Вход без паролей — через Google, GitHub или Telegram. В сессии только имя и аватар. Чаты синхронизируются по аккаунту.',
      'stack.eyebrow': 'Как устроено', 'stack.h2': 'Под капотом', 'stack.p': 'Простой и предсказуемый стек без лишних зависимостей.',
      'stack.1.t': 'Frontend', 'stack.1.d': 'Чистый HTML/CSS/JS в стиле Material Design 3, без сборщика. Светлая и тёмная темы, акценты, локальные шрифты и иконки.',
      'stack.2.t': 'Backend', 'stack.2.d': 'Vercel Edge Functions: стриминг ответов, ротация API-ключей, проверка сессии и учёт лимитов.',
      'stack.3.t': 'Хранилище', 'stack.3.d': 'История чатов, настройки и usage хранятся в Upstash Redis по аккаунту.',
      'stack.4.t': 'Открытый код', 'stack.4.d': 'Проект можно форкнуть и поднять у себя: репозиторий starfall-apk/kulsh-web.',
      'about.join.h2': 'Присоединяйся',
      'about.join.p': 'Заходи в чат, пробуй модели и предлагай идеи — проект живой и открыт для правок.',

      // --- API ---
      'docs.title': 'Kulsh API — документация',
      'docs.eyebrow': 'Разработчикам', 'docs.h2': 'API Kulsh',
      'docs.p': 'Единый интерфейс к моделям Kulsh. Один ключ, один общий лимит и баланс — как в веб-чате.',
      'docs.wip': 'Публичный API с персональными ключами ещё готовится. Страница описывает будущий контракт — эндпоинты и форматы уже зафиксированы, чтобы ты мог проектировать интеграцию заранее.',
      'docs.nav.overview': 'Обзор', 'docs.nav.auth': 'Аутентификация', 'docs.nav.chat': 'POST /v1/chat', 'docs.nav.models': 'Модели', 'docs.nav.usage': 'Лимиты и usage', 'docs.nav.errors': 'Ошибки',
      'docs.overview.p': 'API принимает сообщения и возвращает ответ модели потоком (Server-Sent Events). Формат совместим с распространённой схемой чат-комплишенов, поэтому подключается обычным HTTP-клиентом.',
      'docs.overview.l1': 'Базовый адрес: <code>https://ТВОЙ-ДОМЕН/api/v1</code>',
      'docs.overview.l2': 'Формат: JSON, ответ — поток событий <code>text/event-stream</code>',
      'docs.overview.l3': 'Аутентификация: заголовок <code>Authorization: Bearer &lt;API_KEY&gt;</code>',
      'docs.auth.p': 'Ключ создаётся в аккаунте Kulsh. Один ключ работает и для веб-чата, и для API, а расход идёт с общего баланса и бесплатного лимита.',
      'docs.chat.p': 'Отправляет историю сообщений и стримит ответ.',
      'docs.chat.req': 'Тело запроса', 'docs.chat.res': 'Ответ (поток)',
      'docs.models.p': 'Возвращает доступные модели и их множитель расхода дневного лимита.',
      'docs.usage.p': 'У каждого аккаунта один дневной лимит, измеряемый в токенах. Каждая модель тратит его по-разному: лёгкие — почти ничего, флагманы — заметно больше.',
      'docs.usage.note': 'Если ответ не пришёл по технической причине на стороне сервиса — токены не списываются.',
      'docs.errors.l1': '<code>401</code> — ключ отсутствует или недействителен',
      'docs.errors.l2': '<code>402</code> — исчерпан бесплатный лимит и нулевой баланс',
      'docs.errors.l3': '<code>429</code> — слишком много запросов, попробуй позже',
      'docs.errors.l4': '<code>502</code> — модель временно недоступна (токены не списываются)',
    },
    en: {
      'nav.home': 'Home', 'nav.about': 'About Kulsh', 'nav.api': 'API', 'nav.openChat': 'Open chat', 'nav.theme': 'Toggle theme', 'nav.menu': 'Menu',
      'foot.home': 'Home', 'foot.about': 'About Kulsh', 'foot.api': 'API', 'foot.privacy': 'Privacy Policy', 'foot.donate': 'Support', 'foot.github': 'GitHub', 'foot.note': 'open-source',

      'home.title': 'Kulsh — an open-source AI assistant',
      'home.h1': 'Chat with <span class="accent">Kulsh</span><br>in any language, on any model',
      'home.sub': 'An open AI assistant: several models in one chat — Gemini, DeepSeek, GLM and Kimi. Voice, attachments, skills and a history that lives in your account.',
      'home.start': 'Start for free', 'home.aboutBtn': 'About the project',
      'badge.voice': 'Voice input', 'badge.attach': 'Attachments',
      'feat.eyebrow': 'Features', 'feat.h2': 'Everything for work and talk — in one place',
      'feat.p': 'Kulsh does not lock you into one model. Pick for the task: a fast one for chat, a smart one for code and files.',
      'feat.1.t': 'Fast answers', 'feat.1.d': 'The reply streams in almost instantly, and you can stop generation at any moment.',
      'feat.2.t': 'Many models', 'feat.2.d': 'Gemini, DeepSeek, GLM and Kimi in one interface. Switch with a single tap.',
      'feat.3.t': 'Files and photos', 'feat.3.d': 'Attach images, ZIPs and text files. The model reads them and answers on point.',
      'feat.4.t': 'Voice', 'feat.4.d': 'Speak instead of typing and listen to replies — recognition and speech right in the browser.',
      'feat.5.t': 'Skills', 'feat.5.d': 'Plug in markdown skills: your instructions and knowledge sets, loaded only on demand.',
      'feat.6.t': 'Sync', 'feat.6.d': 'History and settings are saved to your account and available on all your devices.',
      'models.eyebrow': 'Models', 'models.h2': 'Pick a model for the task',
      'models.p': 'One daily budget of tokens for every model — but it drains differently. Light models are nearly free, flagships spend more.',
      'tag.generous': 'generous', 'tag.limited': 'limited limit', 'tag.novision': 'no vision',
      'm.gemini.d': 'Stable and fast Google models — a universal everyday choice.',
      'm.dsf.d': 'The best value on limits, strong with long context.',
      'm.dsp.d': 'Deeper reasoning for code and hard tasks. Does not take images.',
      'm.glm.d': 'Fast and precise, with a large context.',
      'm.kimi.d': 'Strong on long text, but drains the free limit noticeably faster.',
      'm.gemini38.d': 'The newest in the lineup: more accurate, but costlier on limits.',
      'cta.h2': 'Ready to try it?',
      'cta.p': 'Sign in with Google, GitHub or Telegram to get every model, new chats and attachments. Or try it as a guest.',
      'cta.chat': 'Open chat', 'cta.docs': 'API documentation',

      'about.title': 'About Kulsh — an open-source AI assistant',
      'about.eyebrow': 'About', 'about.h1': 'What is <span class="accent">Kulsh</span>',
      'about.sub': 'Kulsh is an open AI assistant and web chat: one entry point to several language models, with voice, attachments, skills and account history. It is built by a small team, and the code is open.',
      'about.try': 'Try it', 'about.src': 'Source on GitHub',
      'about.1.t': 'One app — many characters', 'about.1.d': 'Kulsh can talk to different models: Gemini, DeepSeek, GLM and Kimi. You choose who handles the task, and the interface stays the same.',
      'about.2.t': 'Alive, not bureaucratic', 'about.2.d': 'Kulsh talks like a friend and stays to the point — no lecturing. But always correct and relevant.',
      'about.3.t': 'Skills', 'about.3.d': 'Instruction and knowledge sets in markdown. Loaded on demand, so they never bloat the context.',
      'about.4.t': 'Privacy', 'about.4.d': 'Sign-in without passwords — via Google, GitHub or Telegram. The session holds only a name and avatar. Chats sync by account.',
      'stack.eyebrow': 'Under the hood', 'stack.h2': 'Under the hood', 'stack.p': 'A simple, predictable stack with no extra dependencies.',
      'stack.1.t': 'Frontend', 'stack.1.d': 'Plain HTML/CSS/JS in the Material Design 3 style, no bundler. Light and dark themes, accents, local fonts and icons.',
      'stack.2.t': 'Backend', 'stack.2.d': 'Vercel Edge Functions: streaming replies, API key rotation, session checks and usage accounting.',
      'stack.3.t': 'Storage', 'stack.3.d': 'Chat history, settings and usage are stored in Upstash Redis per account.',
      'stack.4.t': 'Open source', 'stack.4.d': 'Fork it and run your own: repository starfall-apk/kulsh-web.',
      'about.join.h2': 'Join in',
      'about.join.p': 'Open the chat, try the models and share ideas — the project is alive and open to changes.',

      'docs.title': 'Kulsh API — documentation',
      'docs.eyebrow': 'For developers', 'docs.h2': 'Kulsh API',
      'docs.p': 'A single interface to Kulsh models. One key, one shared limit and balance — just like the web chat.',
      'docs.wip': 'A public API with personal keys is still in the works. This page describes the upcoming contract — endpoints and formats are already fixed so you can plan an integration ahead of time.',
      'docs.nav.overview': 'Overview', 'docs.nav.auth': 'Authentication', 'docs.nav.chat': 'POST /v1/chat', 'docs.nav.models': 'Models', 'docs.nav.usage': 'Limits and usage', 'docs.nav.errors': 'Errors',
      'docs.overview.p': 'The API takes messages and streams the model reply (Server-Sent Events). The format follows the common chat-completions shape, so any HTTP client can talk to it.',
      'docs.overview.l1': 'Base URL: <code>https://YOUR-DOMAIN/api/v1</code>',
      'docs.overview.l2': 'Format: JSON, reply is an <code>text/event-stream</code>',
      'docs.overview.l3': 'Auth: header <code>Authorization: Bearer &lt;API_KEY&gt;</code>',
      'docs.auth.p': 'The key is created in your Kulsh account. One key works for both the web chat and the API, and spending draws from the shared balance and free limit.',
      'docs.chat.p': 'Sends the message history and streams the reply.',
      'docs.chat.req': 'Request body', 'docs.chat.res': 'Response (stream)',
      'docs.models.p': 'Returns the available models and their multiplier on the daily limit.',
      'docs.usage.p': 'Every account has one daily budget measured in tokens. Each model drains it differently: light ones almost nothing, flagships noticeably more.',
      'docs.usage.note': 'If a reply fails for a technical reason on the service side, no tokens are charged.',
      'docs.errors.l1': '<code>401</code> — key missing or invalid',
      'docs.errors.l2': '<code>402</code> — free limit used up and balance is zero',
      'docs.errors.l3': '<code>429</code> — too many requests, try again later',
      'docs.errors.l4': '<code>502</code> — model temporarily unavailable (no tokens charged)',
    },
  };

  let lang = detectLang();
  const tr = () => T[lang];

  function applyLang() {
    lang = detectLang();
    document.documentElement.lang = lang;
    const d = tr();
    document.querySelectorAll('[data-i18n]').forEach((el) => { const v = d[el.dataset.i18n]; if (v != null) el.textContent = v; });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { const v = d[el.dataset.i18nHtml]; if (v != null) el.innerHTML = v; });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = d[el.dataset.i18nPh]; if (v != null) el.placeholder = v; });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { const v = d[el.dataset.i18nAria]; if (v != null) el.setAttribute('aria-label', v); });
    const page = document.documentElement.dataset.page;
    if (page && d[page + '.title']) document.title = d[page + '.title'];
    document.querySelectorAll('.lang-switch button').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === lang));
    initButtonWaves();
    window.dispatchEvent(new CustomEvent('kulsh-lang-change'));
  }

  // ---------- Побуквенная волна на кнопках ----------
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildWaveLabel(btn) {
    const host = btn.querySelector('[data-i18n]') || btn;
    const text = (host.dataset.i18n ? (tr()[host.dataset.i18n] || host.textContent) : host.textContent).trim();
    if (!text) return;
    if (!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', text);

    const label = document.createElement('span');
    label.className = 'btn-label';
    label.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const charSpan = document.createElement('span');
      charSpan.className = 'btn-char';
      if (ch === ' ') charSpan.style.width = '0.32em';
      const stack = document.createElement('span');
      stack.className = 'btn-char-stack';
      stack.style.setProperty('--char-i', i);
      const s1 = document.createElement('span'); s1.textContent = ch;
      const s2 = document.createElement('span'); s2.textContent = ch;
      stack.appendChild(s1); stack.appendChild(s2);
      charSpan.appendChild(stack);
      label.appendChild(charSpan);
    }
    host.textContent = '';
    host.appendChild(label);
  }

  function initButtonWaves() {
    if (!canHover || reduceMotion) return;
    document.querySelectorAll('.btn[data-wave]').forEach((btn) => {
      buildWaveLabel(btn);
      if (btn._waveBound) return;
      btn._waveBound = true;
      let hoverStartedAt = 0;
      let pendingEnter = false;
      const waveDuration = () => 320 + (btn.querySelectorAll('.btn-char').length || 1) * 38;

      function startWave() {
        pendingEnter = false;
        clearTimeout(btn._leavingTimer);
        btn.classList.remove('btn-leaving');
        btn.classList.remove('btn-hovering');
        void btn.offsetWidth;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!btn.matches(':hover')) return;
          btn.classList.add('btn-hovering');
          hoverStartedAt = performance.now();
        }));
      }
      btn.addEventListener('mouseenter', () => { if (pendingEnter) return; pendingEnter = true; startWave(); });
      btn.addEventListener('mouseleave', () => {
        pendingEnter = false;
        btn.classList.remove('btn-hovering');
        clearTimeout(btn._leavingTimer);
        if (performance.now() - hoverStartedAt < waveDuration()) {
          btn.classList.add('btn-leaving');
          btn._leavingTimer = setTimeout(() => btn.classList.remove('btn-leaving'), 600);
        } else {
          btn.classList.remove('btn-leaving');
        }
      });
    });
  }

  // ---------- Появление секций при прокрутке ----------
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    const show = (el) => el.classList.add('is-in');
    if ('IntersectionObserver' in window && !reduceMotion) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
      items.forEach((el) => io.observe(el));
      // Страховка: если observer не сработал (фоновая вкладка, скриншот),
      // через мгновение показываем всё — контент не останется скрытым.
      setTimeout(() => items.forEach(show), 1200);
    } else {
      items.forEach(show);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyLang();
    initReveal();

    document.querySelectorAll('.lang-switch').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || !b.dataset.lang) return;
        writeSettings({ lang: b.dataset.lang });
        applyLang();
      });
    });

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const sync = () => {
        const dark = document.documentElement.dataset.theme !== 'light';
        const ic = btn.querySelector('.material-symbols-rounded');
        if (ic) ic.textContent = dark ? 'light_mode' : 'dark_mode';
      };
      sync();
      btn.addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme !== 'light';
        const next = dark ? 'light' : 'dark';
        writeSettings({ theme: next }); applyTheme(); sync();
      });
    });

    const nav = document.querySelector('.mnav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // Закрываем мобильное меню при клике вне него или после перехода.
    const mm = document.querySelector('.mnav-mobile');
    if (mm) {
      document.addEventListener('click', (e) => { if (mm.open && !mm.contains(e.target)) mm.open = false; });
      mm.querySelectorAll('.mm-panel a, .mm-panel button').forEach((el) => {
        el.addEventListener('click', () => { mm.open = false; });
      });
    }

    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    // Смена языка из объединённого меню аккаунта (auth.js) — перерисовываем
    // страницу, только если язык действительно изменился (иначе была бы петля,
    // ведь applyLang() сам шлёт это событие).
    window.addEventListener('kulsh-lang-change', () => { if (detectLang() !== lang) applyLang(); });
  });
})();
