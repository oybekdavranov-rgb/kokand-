'use strict';
/* =====================================================================
   Murojaatlar paneli — frontend (freymvorksiz).
   XAVFSIZLIK: foydalanuvchi matni faqat textContent orqali chiqariladi
   (innerHTML ishlatilmaydi) — XSS imkonsiz. Har bir o'zgartiruvchi
   so'rovga CSRF tokeni qo'shiladi.
   ===================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    csrf: null,
    user: null,
    office: null,
    view: 'appeals',
    filter: { status: '', search: '', from: '', to: '', overdue: false, offset: 0, limit: 25 },
    totpEnabled: false,
    slaHours: 48,
    rows: [],
    total: 0,
    selected: null,
    newestSeen: 0,
    timer: null,
  };

  const STATUS = {
    new:        { label: 'Yangi',          badge: 'badge--new' },
    in_progress:{ label: "Ko'rilmoqda",    badge: 'badge--progress' },
    answered:   { label: 'Javob berilgan', badge: 'badge--answered' },
    closed:     { label: 'Yopilgan',       badge: 'badge--closed' },
  };

  /* ------------------------------------------------------------------ */
  /* DOM yordamchilari                                                   */
  /* ------------------------------------------------------------------ */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;          // xavfsiz
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  const clear = (node) => { while (node.firstChild) node.firstChild.remove(); return node; };

  /* ------------------------------------------------------------------ */
  /* Formatlash                                                          */
  /* ------------------------------------------------------------------ */
  const dtf = new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ms) => (ms ? dtf.format(new Date(ms)) : '—');

  function timeAgo(ms) {
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'hozir';
    if (min < 60) return min + ' daq oldin';
    const hours = Math.floor(min / 60);
    if (hours < 24) return hours + ' soat oldin';
    const days = Math.floor(hours / 24);
    if (days < 7) return days + ' kun oldin';
    return fmtDate(ms);
  }

  const isOverdue = (row) =>
    ['new', 'in_progress'].includes(row.status) && Date.now() - row.createdAt > state.slaHours * 3600_000;

  function fmtBytes(size) {
    if (!size) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return (unit === 0 ? value : value.toFixed(1)) + ' ' + units[unit];
  }

  /* ------------------------------------------------------------------ */
  /* Bildirishnomalar va modal                                           */
  /* ------------------------------------------------------------------ */
  function toast(message, kind = '') {
    const node = el('div', { class: 'toast' + (kind ? ' toast--' + kind : ''), text: message });
    $('toasts').append(node);
    setTimeout(() => node.remove(), kind === 'error' ? 7000 : 4000);
  }

  /**
   * Tasdiqlash oynasi. fields: [{name,label,type,placeholder}]
   * @returns {Promise<null|Object>} null — bekor qilindi
   */
  function ask({ title, text = '', note = '', okLabel = 'Tasdiqlash', danger = false, fields = [] }) {
    const modal = $('modal');
    $('modal-title').textContent = title;
    $('modal-text').textContent = text;
    $('modal-text').hidden = !text;
    const ok = $('modal-ok');
    ok.textContent = okLabel;
    ok.className = 'btn ' + (danger ? 'btn--danger' : 'btn--primary');

    const box = clear($('modal-fields'));
    const inputs = {};
    if (note) box.append(el('div', { class: 'keybox', text: note }));
    for (const field of fields) {
      const input = el('input', { class: 'input', type: field.type || 'text', placeholder: field.placeholder || '', autocomplete: field.autocomplete || 'off' });
      inputs[field.name] = input;
      box.append(el('label', { class: 'field' }, [el('span', { class: 'field__label', text: field.label }), input]));
    }

    return new Promise((resolve) => {
      const onClose = () => {
        modal.removeEventListener('close', onClose);
        if (modal.returnValue !== 'ok') return resolve(null);
        const values = {};
        for (const [name, input] of Object.entries(inputs)) values[name] = input.value;
        resolve(values);
      };
      modal.addEventListener('close', onClose);
      modal.showModal();
      (Object.values(inputs)[0] || ok).focus();
    });
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (state.csrf && method !== 'GET') headers['X-CSRF-Token'] = state.csrf;

    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });

    let data = null;
    try { data = await response.json(); } catch { /* bo'sh javob */ }

    if (response.status === 401 && state.user) {    // sessiya tugadi
      showLogin('Sessiya tugadi — qaytadan kiring.');
      throw new Error('unauthorized');
    }
    if (!response.ok) {
      const error = new Error((data && (data.message || data.error)) || 'Xatolik yuz berdi');
      error.code = data && data.error;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Kirish / chiqish                                                    */
  /* ------------------------------------------------------------------ */
  function applyMe(me) {
    if (!me) return;
    if (me.office) applyOffice(me.office);
    state.totpEnabled = !!me.totpEnabled;
    if (me.limits && me.limits.slaHours) state.slaHours = me.limits.slaHours;
    updateTotpLabel();
  }

  function applyOffice(office) {
    if (!office) return;
    state.office = office;
    $('login-faculty').textContent = office.faculty;
    $('login-dean').textContent = `${office.deanTitle.charAt(0).toUpperCase() + office.deanTitle.slice(1)}: ${office.dean} · Qabul: ${office.hours}`;
    $('office-line').textContent = `${office.faculty} · ${office.deanTitle} ${office.dean}`;
  }

  function showLogin(message = '') {
    stopAutoRefresh();
    state.user = null;
    state.csrf = null;
    $('app').hidden = true;
    $('login').hidden = false;
    const error = $('login-error');
    error.textContent = message;
    error.hidden = !message;
    $('login-password').value = '';
    $('login-username').focus();
  }

  function showApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    $('user-name').textContent = state.user.username;
    $('user-role').textContent = state.user.role === 'owner' ? 'Huquq: owner (to\'liq)' : 'Huquq: operator';
    for (const node of document.querySelectorAll('[data-owner]')) node.hidden = state.user.role !== 'owner';
    if (state.office) {
      $('office-line').textContent = `${state.office.faculty} · ${state.office.deanTitle} ${state.office.dean}`;
    }
    document.body.classList.remove('detail-open');
    updateTotpLabel();
    syncFilterUi();
    startAutoRefresh();
    openFromHash();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('login-submit');
    button.disabled = true;
    try {
      const result = await api('/api/login', {
        method: 'POST',
        body: {
          username: $('login-username').value.trim(),
          password: $('login-password').value,
          totp: $('login-totp').value.trim(),
        },
      });
      state.csrf = result.csrf;
      state.user = result.user;
      const me = await api('/api/me');
      applyMe(me);
      $('login-error').hidden = true;
      showApp();
      await refresh(true);
    } catch (err) {
      const error = $('login-error');
      error.textContent = err.message;
      error.hidden = false;
      if (err.code === 'bad_totp') { $('totp-field').hidden = false; $('login-totp').focus(); }
    } finally {
      button.disabled = false;
    }
  });

  /* --- Ikki qadamli kirish (TOTP) --- */
  function updateTotpLabel() {
    $('totp-label').textContent = state.totpEnabled
      ? 'Ikki qadamli kirishni o\'chirish'
      : 'Ikki qadamli kirishni yoqish';
  }

  $('totp-toggle').addEventListener('click', async () => {
    $('user-pop').hidden = true;
    try {
      if (state.totpEnabled) {
        const values = await ask({
          title: 'Ikki qadamli kirishni o\'chirish',
          text: 'Tasdiqlash uchun parolingizni kiriting. Keyin kirish faqat parol bilan bo\'ladi.',
          okLabel: 'O\'chirish',
          danger: true,
          fields: [{ name: 'password', label: 'Parol', type: 'password', autocomplete: 'current-password' }],
        });
        if (!values) return;
        const result = await api('/api/totp/disable', { method: 'POST', body: { password: values.password } });
        state.totpEnabled = false;
        updateTotpLabel();
        toast(result.message || 'O\'chirildi.', 'ok');
        return;
      }

      const first = await ask({
        title: 'Ikki qadamli kirishni yoqish',
        text: 'Avval parolingizni tasdiqlang. So\'ng telefoningizdagi Google Authenticator (yoki shunga o\'xshash) ilovaga kalitni kiritasiz.',
        okLabel: 'Davom etish',
        fields: [{ name: 'password', label: 'Parol', type: 'password', autocomplete: 'current-password' }],
      });
      if (!first) return;

      const setup = await api('/api/totp/init', { method: 'POST', body: { password: first.password } });
      const second = await ask({
        title: 'Kalitni ilovaga kiriting',
        text: 'Authenticator ilovasida «Kalitni qo\'lda kiritish» (Enter a setup key) ni tanlang va quyidagi kalitni yozing. So\'ng ilova ko\'rsatgan 6 xonali kodni kiriting.',
        note: setup.formatted,
        okLabel: 'Yoqish',
        fields: [{ name: 'code', label: '6 xonali kod', type: 'text', placeholder: '000000', autocomplete: 'one-time-code' }],
      });
      if (!second) return;

      const result = await api('/api/totp/enable', { method: 'POST', body: { secret: setup.secret, code: second.code } });
      state.totpEnabled = true;
      updateTotpLabel();
      toast(result.message || 'Yoqildi.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('send-digest').addEventListener('click', async () => {
    $('user-pop').hidden = true;
    try {
      const result = await api('/api/digest', { method: 'POST' });
      toast(result.sent
        ? `Kunlik xulosa yuborildi (${result.overdue ?? 0} ta kechikkan murojaat).`
        : 'Yuborilmadi: xabarnoma chati sozlanmagan (NOTIFY_CHAT_IDS).', result.sent ? 'ok' : 'error');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('logout').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* baribir chiqamiz */ }
    showLogin('Tizimdan chiqdingiz.');
  });

  $('change-password').addEventListener('click', async () => {
    const values = await ask({
      title: 'Parolni o\'zgartirish',
      text: 'Yangi parol kamida 12 belgi bo\'lsin. O\'zgartirilgach barcha qurilmalardan chiqarilasiz.',
      okLabel: 'O\'zgartirish',
      fields: [
        { name: 'current', label: 'Hozirgi parol', type: 'password', autocomplete: 'current-password' },
        { name: 'next', label: 'Yangi parol', type: 'password', autocomplete: 'new-password' },
      ],
    });
    if (!values) return;
    try {
      const result = await api('/api/password', { method: 'POST', body: values });
      toast(result.message || 'Parol o\'zgartirildi.', 'ok');
      showLogin('Yangi parol bilan kiring.');
    } catch (err) { toast(err.message, 'error'); }
  });

  /* Foydalanuvchi menyusi */
  $('user-button').addEventListener('click', () => {
    const pop = $('user-pop');
    pop.hidden = !pop.hidden;
    $('user-button').setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.usermenu')) {
      $('user-pop').hidden = true;
      $('user-button').setAttribute('aria-expanded', 'false');
    }
  });

  /* ------------------------------------------------------------------ */
  /* Bo'limlar                                                           */
  /* ------------------------------------------------------------------ */
  $('tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    state.view = tab.dataset.view;
    for (const node of document.querySelectorAll('.tab')) node.classList.toggle('is-active', node === tab);
    for (const node of document.querySelectorAll('.view')) node.hidden = node.id !== 'view-' + state.view;
    if (state.view === 'users') loadUsers();
    if (state.view === 'admins') loadAdmins();
    if (state.view === 'audit') loadAudit();
  });

  /* ------------------------------------------------------------------ */
  /* Statistika                                                          */
  /* ------------------------------------------------------------------ */
  function renderStats(stats) {
    const tiles = [
      { key: 'total', label: 'Jami murojaat', cls: '', filter: {} },
      { key: 'new', label: 'Yangi', cls: 'stat--new', filter: { status: 'new' } },
      { key: 'inProgress', label: "Ko'rilmoqda", cls: 'stat--prog', filter: { status: 'in_progress' } },
      { key: 'answered', label: 'Javob berilgan', cls: 'stat--ans', filter: { status: 'answered' } },
      { key: 'overdue', label: `Kechikkan (${state.slaHours} soat+)`, cls: 'stat--late', filter: { overdue: true } },
      { key: 'last24h', label: 'Oxirgi 24 soat', cls: 'stat--day', filter: {} },
    ];
    const box = clear($('stats'));
    for (const tile of tiles) {
      const value = stats[tile.key] ?? 0;
      const node = el('button', {
        class: 'stat ' + tile.cls + (tile.key === 'overdue' && value > 0 ? ' stat--warn' : ''),
        type: 'button',
        title: 'Shu bo\'yicha filtrlash',
      }, [
        el('div', { class: 'stat__value', text: String(value) }),
        el('div', { class: 'stat__label' }, [el('i', { class: 'stat__dot' }), tile.label]),
      ]);
      node.addEventListener('click', () => {
        state.filter.status = tile.filter.status || '';
        state.filter.overdue = !!tile.filter.overdue;
        syncFilterUi();
        refresh(true);
      });
      box.append(node);
    }
  }

  /* Filtr holatini tugmalar bilan moslashtirish */
  function syncFilterUi() {
    for (const chip of $('status-chips').children) {
      chip.classList.toggle('is-active', chip.dataset.status === state.filter.status);
    }
    $('overdue-chip').classList.toggle('is-active', state.filter.overdue);
    $('from-date').value = state.filter.from;
    $('to-date').value = state.filter.to;
    const active = state.filter.status || state.filter.overdue || state.filter.from || state.filter.to || state.filter.search;
    $('clear-filters').hidden = !active;
  }

  /* ------------------------------------------------------------------ */
  /* Ro'yxat                                                             */
  /* ------------------------------------------------------------------ */
  function renderList() {
    const list = clear($('list'));
    const filtered = !!(state.filter.search || state.filter.status || state.filter.overdue || state.filter.from || state.filter.to);
    $('list-count').textContent = state.total
      ? `${state.total} ta murojaat` + (filtered ? ' (filtr bo\'yicha)' : '')
      : (filtered ? 'Filtrga mos murojaat yo\'q' : 'Murojaat yo\'q');

    if (!state.rows.length) {
      list.append(el('li', { class: 'empty', text: filtered
        ? 'Filtrga mos murojaat topilmadi. «Filtrni tozalash» tugmasi hammasini qaytaradi.'
        : 'Hali murojaat kelmagan. Bot ishga tushgan bo\'lsa, birinchi murojaat shu yerda paydo bo\'ladi.' }));
    }

    for (const row of state.rows) {
      const status = STATUS[row.status] || { label: row.status, badge: '' };
      const meta = [];
      if (row.attachmentsCount) meta.push(el('span', {}, [icon('clip'), String(row.attachmentsCount)]));
      if (row.repliesCount) meta.push(el('span', {}, [icon('chat'), String(row.repliesCount)]));
      if (row.notesCount) meta.push(el('span', {}, [icon('note'), String(row.notesCount)]));
      if (isOverdue(row)) meta.push(el('span', { class: 'badge badge--late' }, [icon('alert'), 'kechikkan']));
      if (row.authorPhone) meta.push(el('span', {}, [icon('phone'), row.authorPhone]));
      if (row.authorBlocked) meta.push(el('span', { class: 'badge badge--danger', text: 'bloklangan' }));

      const item = el('li', {
        class: 'item' + (state.selected === row.id ? ' is-active' : ''),
        dataset: { status: row.status, id: String(row.id) },
        tabindex: '0',
        role: 'button',
      }, [
        el('i', { class: 'item__bar' }),
        el('div', { class: 'item__body' }, [
          el('div', { class: 'item__top' }, [
            el('span', { class: 'item__code', text: row.code }),
            el('span', { class: 'badge ' + status.badge, text: status.label }),
            el('span', { class: 'item__time', text: timeAgo(row.createdAt) }),
          ]),
          el('div', { class: 'item__author', text: row.authorName + (row.authorUsername ? ' · @' + row.authorUsername : '') }),
          el('div', { class: 'item__text', text: row.body }),
          meta.length ? el('div', { class: 'item__meta' }, meta) : null,
        ]),
      ]);
      const open = () => openDetail(row.id);
      item.addEventListener('click', open);
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      list.append(item);
    }

    const pages = Math.ceil(state.total / state.filter.limit) || 1;
    const page = Math.floor(state.filter.offset / state.filter.limit) + 1;
    $('pager').hidden = state.total <= state.filter.limit;
    $('page-info').textContent = `${page} / ${pages}`;
    $('prev-page').disabled = state.filter.offset === 0;
    $('next-page').disabled = state.filter.offset + state.filter.limit >= state.total;
  }

  /* ------------------------------------------------------------------ */
  /* Tafsilot                                                            */
  /* ------------------------------------------------------------------ */
  /** Rasmni xavfsiz ko'rsatish: blob sifatida yuklaymiz (bot tokeni ishtirok etmaydi) */
  async function loadPreview(attachmentId, imgNode) {
    try {
      const response = await fetch('/api/attachments/' + attachmentId, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('yuklanmadi');
      const blob = await response.blob();
      if (!/^image\//.test(blob.type) && blob.size > 12 * 1024 * 1024) throw new Error('juda katta');
      const url = URL.createObjectURL(blob);
      imgNode.src = url;
      imgNode.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 30_000), { once: true });
    } catch {
      imgNode.remove();
    }
  }

  async function openDetail(id) {
    state.selected = id;
    renderList();
    try {
      const data = await api('/api/appeals/' + id);
      renderDetail(data);
    } catch (err) { toast(err.message, 'error'); }
  }

  function closeDetail() {
    state.selected = null;
    document.body.classList.remove('detail-open');
    $('detail').hidden = true;
    clear($('detail'));
    renderList();
    if (location.hash.startsWith('#appeal-')) history.replaceState(null, '', location.pathname);
  }

  function renderDetail(data) {
    const { appeal, author, attachments, replies, notes = [], authorHistory = [] } = data;
    const panel = clear($('detail'));
    panel.hidden = false;
    document.body.classList.add('detail-open');
    const status = STATUS[appeal.status] || { label: appeal.status, badge: '' };

    /* Sarlavha */
    panel.append(el('div', { class: 'detail__head' }, [
      el('span', { class: 'detail__code', text: appeal.code }),
      el('span', { class: 'badge ' + status.badge, text: status.label }),
      isOverdue(appeal) ? el('span', { class: 'badge badge--late' }, [icon('alert'), 'kechikkan']) : null,
      appeal.deletedAt ? el('span', { class: 'badge badge--danger', text: 'arxivlangan' }) : null,
      el('button', { class: 'btn btn--ghost btn--icon detail__close', type: 'button', title: 'Yopish', 'aria-label': 'Yopish', onClick: closeDetail }, [icon('close')]),
    ]));

    /* Holatni o'zgartirish */
    const statusBar = el('div', { class: 'statusbar' });
    for (const [key, meta] of Object.entries(STATUS)) {
      statusBar.append(el('button', {
        class: 'chip' + (appeal.status === key ? ' is-active' : ''),
        type: 'button',
        text: meta.label,
        onClick: () => changeStatus(appeal.id, key),
      }));
    }
    panel.append(el('div', { class: 'detail__section' }, [el('div', { class: 'detail__label', text: 'Holat' }), statusBar]));

    /* Muallif */
    const meta = el('dl', { class: 'meta' });
    const addMeta = (label, value) => {
      if (!value) return;
      meta.append(el('dt', { text: label }), el('dd', { text: String(value) }));
    };
    addMeta('Ism', appeal.authorName);
    addMeta('Username', appeal.authorUsername ? '@' + appeal.authorUsername : '');
    addMeta('Telefon', appeal.authorPhone || (author && author.phone) || '');
    addMeta('Telegram ID', appeal.tgId);
    addMeta('Yuborilgan', fmtDate(appeal.createdAt));
    if (appeal.answeredAt) addMeta('Javob berilgan', fmtDate(appeal.answeredAt));
    if (author) addMeta('Jami murojaatlari', author.appeals);
    panel.append(el('div', { class: 'detail__section' }, [
      el('div', { class: 'detail__label', text: 'Murojaat egasi' }),
      meta,
      author && author.isBlocked ? el('p', { class: 'badge badge--danger', text: 'Bu foydalanuvchi bloklangan' }) : null,
    ]));

    /* Matn */
    panel.append(el('div', { class: 'detail__section' }, [
      el('div', { class: 'detail__label', text: 'Murojaat matni' }),
      el('div', { class: 'detail__body', text: appeal.body }),
    ]));

    /* Fayllar */
    if (attachments.length) {
      const files = el('div', { class: 'files' });
      for (const file of attachments) {
        files.append(el('a', {
          class: 'file',
          href: '/api/attachments/' + file.id,
          download: file.fileName || 'fayl',
          rel: 'noopener',
        }, [
          icon('download'),
          el('span', { text: file.fileName || file.kind }),
          el('span', { class: 'file__size', text: fmtBytes(file.fileSize) }),
        ]));
        /* Rasmni darhol ko'rish — fayl sessiya orqali olinadi va blob sifatida ko'rsatiladi */
        if (file.kind === 'photo' || (file.mimeType || '').startsWith('image/')) {
          const preview = el('img', { class: 'preview', alt: file.fileName || 'rasm', loading: 'lazy' });
          files.append(preview);
          loadPreview(file.id, preview);
        }
      }
      panel.append(el('div', { class: 'detail__section' }, [
        el('div', { class: 'detail__label', text: `Ilovalar (${attachments.length})` }), files,
      ]));
    }

    /* Javoblar tarixi */
    if (replies.length) {
      const thread = el('div', { class: 'thread' });
      for (const reply of replies) {
        thread.append(el('div', { class: 'reply' + (reply.delivered ? '' : ' reply--failed') }, [
          el('div', { class: 'reply__head' }, [
            el('strong', { text: reply.author }),
            el('span', { text: fmtDate(reply.createdAt) }),
            el('span', { text: reply.via === 'telegram' ? '· Telegram' : '· panel' }),
            reply.delivered ? null : el('span', { class: 'badge badge--danger', text: 'yetkazilmadi' }),
          ]),
          el('div', { class: 'reply__body', text: reply.body }),
          reply.deliveryError ? el('div', { class: 'muted', text: reply.deliveryError }) : null,
        ]));
      }
      panel.append(el('div', { class: 'detail__section' }, [
        el('div', { class: 'detail__label', text: `Javoblar (${replies.length})` }), thread,
      ]));
    }

    /* Muallifning oldingi murojaatlari */
    if (authorHistory.length) {
      const history = el('div', { class: 'history' });
      for (const item of authorHistory) {
        const status = STATUS[item.status] || { label: item.status, badge: '' };
        const row = el('button', { class: 'history__item', type: 'button' }, [
          el('span', { class: 'history__code', text: item.code }),
          el('span', { class: 'badge ' + status.badge, text: status.label }),
          el('span', { class: 'history__text', text: item.body }),
          el('span', { class: 'history__date', text: fmtDate(item.createdAt) }),
        ]);
        row.addEventListener('click', () => openDetail(item.id));
        history.append(row);
      }
      panel.append(el('div', { class: 'detail__section' }, [
        el('div', { class: 'detail__label' }, [icon('history'), ` Shu odamning oldingi murojaatlari (${authorHistory.length})`]),
        history,
      ]));
    }

    /* Ichki izohlar — foydalanuvchiga yuborilmaydi */
    const notesList = el('div', { class: 'thread' });
    const notesLabel = el('div', { class: 'detail__label' });
    const renderNotes = (items) => {
      notesLabel.textContent = `Ichki izohlar (${items.length}) — murojaat egasi ko'rmaydi`;
      clear(notesList);
      if (!items.length) notesList.append(el('p', { class: 'muted', text: 'Hozircha izoh yo\'q.' }));
      for (const note of items) {
        notesList.append(el('div', { class: 'note' }, [
          el('div', { class: 'reply__head' }, [
            el('strong', { text: note.author }),
            el('span', { text: fmtDate(note.createdAt) }),
          ]),
          el('div', { class: 'reply__body', text: note.body }),
        ]));
      }
    };
    renderNotes(notes);

    const noteInput = el('textarea', { class: 'textarea textarea--sm', placeholder: 'Ichki izoh… (masalan: o\'quv bo\'limiga yuborildi)', maxlength: '2000' });
    const noteButton = el('button', { class: 'btn btn--sm', type: 'button' }, [icon('note'), el('span', { text: 'Izoh qo\'shish' })]);
    const addNote = async () => {
      const body = noteInput.value.trim();
      if (body.length < 2) { toast('Izoh matnini yozing.', 'error'); return; }
      noteButton.disabled = true;
      try {
        const result = await api(`/api/appeals/${appeal.id}/notes`, { method: 'POST', body: { body } });
        notes.push(result.note);
        renderNotes(notes);
        noteInput.value = '';
        toast('Izoh qo\'shildi.', 'ok');
        refresh();
      } catch (err) { toast(err.message, 'error'); }
      finally { noteButton.disabled = false; }
    };
    noteButton.addEventListener('click', addNote);
    noteInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); addNote(); } });

    panel.append(el('div', { class: 'detail__section' }, [
      notesLabel,
      notesList,
      el('div', { class: 'composer' }, [noteInput, el('div', { class: 'composer__foot' }, [noteButton])]),
    ]));

    /* Javob yozish */
    const textarea = el('textarea', { class: 'textarea', placeholder: 'Javob matnini yozing… (Ctrl+Enter — yuborish)', maxlength: '3500' });
    const counter = el('span', { class: 'composer__count', text: '0 / 3500' });
    const sendButton = el('button', { class: 'btn btn--primary', type: 'button' }, [icon('send'), el('span', { text: 'Javobni yuborish' })]);

    const send = async () => {
      const body = textarea.value.trim();
      if (body.length < 2) { toast('Javob matnini yozing.', 'error'); return; }
      sendButton.disabled = true;
      try {
        await api(`/api/appeals/${appeal.id}/reply`, { method: 'POST', body: { body } });
        toast('Javob yuborildi.', 'ok');
        textarea.value = '';
        await refresh();
        await openDetail(appeal.id);
      } catch (err) {
        toast(err.message, 'error');
        /* 502 — javob BAZAGA saqlangan, faqat Telegram'ga yetmagan.
           Tafsilotni yangilaymiz: operator takror yozib yubormasin. */
        if (err.status === 502) textarea.value = '';
        await refresh();
        await openDetail(appeal.id);
      } finally { sendButton.disabled = false; }
    };
    textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length} / 3500`; });
    textarea.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); } });
    sendButton.addEventListener('click', send);

    panel.append(el('div', { class: 'detail__section' }, [
      el('div', { class: 'detail__label', text: 'Javob berish' }),
      el('div', { class: 'composer' }, [textarea, el('div', { class: 'composer__foot' }, [sendButton, counter])]),
      el('p', { class: 'muted', text: 'Javob bot orqali murojaat egasiga yetkaziladi va holat «Javob berilgan»ga o\'zgaradi.' }),
    ]));

    /* Amallar */
    const actions = el('div', { class: 'detail__actions' });
    if (author) {
      actions.append(el('button', {
        class: 'btn btn--sm ' + (author.isBlocked ? '' : 'btn--danger'),
        type: 'button',
        onClick: () => toggleBlock(author, appeal.id),
      }, [icon('ban'), el('span', { text: author.isBlocked ? 'Blokdan chiqarish' : 'Foydalanuvchini bloklash' })]));
    }
    if (state.user.role === 'owner') {
      actions.append(appeal.deletedAt
        ? el('button', { class: 'btn btn--sm', type: 'button', text: 'Murojaatni tiklash', onClick: () => restoreAppeal(appeal) })
        : el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Murojaatni o\'chirish', onClick: () => deleteAppeal(appeal) }));
    }
    panel.append(el('div', { class: 'detail__section' }, [el('div', { class: 'detail__label', text: 'Amallar' }), actions]));
    panel.scrollTop = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Amallar                                                             */
  /* ------------------------------------------------------------------ */
  async function changeStatus(id, status) {
    try {
      await api(`/api/appeals/${id}/status`, { method: 'POST', body: { status } });
      await refresh();
      await openDetail(id);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function toggleBlock(author, appealId) {
    const blocking = !author.isBlocked;
    const values = await ask({
      title: blocking ? 'Foydalanuvchini bloklash' : 'Blokdan chiqarish',
      text: blocking
        ? 'Bloklangan foydalanuvchi yangi murojaat yubora olmaydi. Avvalgi murojaatlari saqlanib qoladi.'
        : 'Foydalanuvchi yana murojaat yuborishi mumkin bo\'ladi.',
      okLabel: blocking ? 'Bloklash' : 'Blokdan chiqarish',
      danger: blocking,
      fields: blocking ? [{ name: 'reason', label: 'Sabab (jurnalga yoziladi)', placeholder: 'masalan: takroriy spam' }] : [],
    });
    if (!values) return;
    try {
      await api(`/api/tg-users/${author.tgId}/block`, { method: 'POST', body: { blocked: blocking, reason: values.reason || '' } });
      toast(blocking ? 'Foydalanuvchi bloklandi.' : 'Blok olib tashlandi.', 'ok');
      await refresh();
      await openDetail(appealId);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function restoreAppeal(appeal) {
    try {
      await api(`/api/appeals/${appeal.id}/restore`, { method: 'POST' });
      toast('Murojaat tiklandi.', 'ok');
      await refresh();
      await openDetail(appeal.id);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteAppeal(appeal) {
    const confirmed = await ask({
      title: 'Murojaatni o\'chirish',
      text: `${appeal.code} ro'yxatdan olib tashlanadi (bazada arxiv sifatida qoladi).`,
      okLabel: 'O\'chirish',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api(`/api/appeals/${appeal.id}/delete`, { method: 'POST' });
      toast('Murojaat arxivga olindi. Kerak bo\'lsa «Tiklash» orqali qaytarasiz.', 'ok');
      closeDetail();
      await refresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ------------------------------------------------------------------ */
  /* Foydalanuvchilar / adminlar / jurnal                                */
  /* ------------------------------------------------------------------ */
  function table(node, columns, rows, renderRow) {
    const target = clear(node);
    target.append(el('thead', {}, [el('tr', {}, columns.map((title) => el('th', { text: title })))]));
    const body = el('tbody');
    if (!rows.length) body.append(el('tr', {}, [el('td', { class: 'empty', colspan: String(columns.length), text: 'Ma\'lumot yo\'q' })]));
    for (const row of rows) body.append(renderRow(row));
    target.append(body);
  }

  async function loadUsers() {
    try {
      const data = await api('/api/tg-users?limit=200');
      table($('users-table'), ['Ism', 'Username', 'Telefon', 'Telegram ID', 'Murojaat', 'Oxirgi faollik', 'Holat', ''], data.rows, (user) => {
        const action = el('button', {
          class: 'btn btn--sm ' + (user.isBlocked ? '' : 'btn--danger'), type: 'button',
          text: user.isBlocked ? 'Blokdan chiqarish' : 'Bloklash',
        });
        action.addEventListener('click', async () => {
          try {
            await api(`/api/tg-users/${user.tgId}/block`, { method: 'POST', body: { blocked: !user.isBlocked } });
            toast('Bajarildi.', 'ok');
            loadUsers();
          } catch (err) { toast(err.message, 'error'); }
        });
        return el('tr', {}, [
          el('td', { text: user.name || '—' }),
          el('td', { text: user.username ? '@' + user.username : '—' }),
          el('td', { text: user.phone || '—' }),
          el('td', { class: 'mono', text: String(user.tgId) }),
          el('td', { text: String(user.appeals) }),
          el('td', { text: timeAgo(user.lastSeen) }),
          el('td', {}, [user.isBlocked
            ? el('span', { class: 'badge badge--danger', text: 'bloklangan' })
            : el('span', { class: 'badge badge--answered', text: 'faol' })]),
          el('td', {}, [action]),
        ]);
      });
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadAdmins() {
    try {
      const data = await api('/api/admins');
      table($('admins-table'), ['Login', 'Huquq', '2FA', 'Oxirgi kirish', 'Holat', ''], data.rows, (admin) => {
        const action = el('button', {
          class: 'btn btn--sm ' + (admin.isDisabled ? '' : 'btn--danger'), type: 'button',
          text: admin.isDisabled ? 'Yoqish' : 'O\'chirish',
        });
        action.addEventListener('click', async () => {
          try {
            await api(`/api/admins/${admin.id}/disable`, { method: 'POST', body: { disabled: !admin.isDisabled } });
            toast('Bajarildi.', 'ok');
            loadAdmins();
          } catch (err) { toast(err.message, 'error'); }
        });
        return el('tr', {}, [
          el('td', { text: admin.username }),
          el('td', { text: admin.role }),
          el('td', { text: admin.totpEnabled ? 'yoqilgan' : '—' }),
          el('td', { text: admin.lastLoginAt ? fmtDate(admin.lastLoginAt) : '—' }),
          el('td', {}, [admin.isDisabled
            ? el('span', { class: 'badge badge--danger', text: 'o\'chirilgan' })
            : el('span', { class: 'badge badge--answered', text: 'faol' })]),
          el('td', {}, [action]),
        ]);
      });
    } catch (err) { toast(err.message, 'error'); }
  }

  $('admin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/admins', {
        method: 'POST',
        body: {
          username: $('new-admin-username').value.trim(),
          password: $('new-admin-password').value,
          role: $('new-admin-role').value,
        },
      });
      toast('Yangi admin qo\'shildi.', 'ok');
      $('new-admin-username').value = '';
      $('new-admin-password').value = '';
      loadAdmins();
    } catch (err) { toast(err.message, 'error'); }
  });

  async function loadAudit() {
    try {
      const data = await api('/api/audit?limit=200');
      table($('audit-table'), ['Vaqt', 'Kim', 'Amal', 'Obyekt', 'Izoh'], data.rows, (row) => el('tr', {}, [
        el('td', { text: fmtDate(row.at) }),
        el('td', { text: row.actor || '—' }),
        el('td', { class: 'mono', text: row.action }),
        el('td', { text: row.target || '—' }),
        el('td', { class: 'wrap', text: row.detail || '' }),
      ]));
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ------------------------------------------------------------------ */
  /* Yangilash                                                           */
  /* ------------------------------------------------------------------ */
  /** Hozirgi filtrni URL parametrlariga aylantirish (ro'yxat ham, CSV ham shuni ishlatadi) */
  function filterParams() {
    const params = new URLSearchParams();
    if (state.filter.status) params.set('status', state.filter.status);
    if (state.filter.search) params.set('search', state.filter.search);
    if (state.filter.from) params.set('from', state.filter.from);
    if (state.filter.to) params.set('to', state.filter.to);
    if (state.filter.overdue) params.set('overdue', '1');
    return params;
  }

  function exportHref() {
    const query = filterParams().toString();
    return '/api/export.csv' + (query ? '?' + query : '');
  }

  async function refresh(resetPage = false) {
    if (!state.user) return;
    if (resetPage) state.filter.offset = 0;
    const params = filterParams();
    params.set('limit', String(state.filter.limit));
    params.set('offset', String(state.filter.offset));
    try {
      const [list, stats] = await Promise.all([api('/api/appeals?' + params), api('/api/stats')]);
      state.rows = list.rows;
      state.total = list.total;
      renderStats(stats);
      renderList();
      $('export').href = exportHref();
      /* Oxirgi sahifadagi yozuv o'chirilsa — bo'sh sahifada qolib ketmaslik */
      if (!list.rows.length && state.filter.offset > 0 && list.total > 0) {
        state.filter.offset = Math.max(0, (Math.ceil(list.total / state.filter.limit) - 1) * state.filter.limit);
        return refresh();
      }
      const newest = state.rows.length ? Math.max(...state.rows.map((row) => row.createdAt)) : 0;
      if (!state.newestSeen) state.newestSeen = newest;
      return newest;
    } catch (err) {
      if (err.message !== 'unauthorized') toast(err.message, 'error');
    }
  }

  /* Fon rejimida yangi murojaatlarni kuzatish */
  async function poll() {
    if (!state.user || document.hidden) return;
    const params = new URLSearchParams({ limit: '1', offset: '0' });
    try {
      const data = await api('/api/appeals?' + params);
      const newest = data.rows.length ? data.rows[0].createdAt : 0;
      const badge = $('new-badge');
      if (newest > state.newestSeen && state.filter.offset === 0) {
        badge.hidden = false;
        badge.textContent = 'Yangi murojaat bor — ko\'rish';
      }
      if (!state.newestSeen) state.newestSeen = newest;
    } catch { /* keyingi urinishda */ }
  }

  $('new-badge').addEventListener('click', async () => {
    $('new-badge').hidden = true;
    state.newestSeen = 0;
    await refresh(true);
  });

  function startAutoRefresh() {
    stopAutoRefresh();
    state.timer = setInterval(poll, 30_000);
  }
  function stopAutoRefresh() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  /* ------------------------------------------------------------------ */
  /* Filtrlar va sahifalash                                              */
  /* ------------------------------------------------------------------ */
  let searchTimer = null;
  $('search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => { state.filter.search = value.trim(); syncFilterUi(); refresh(true); }, 300);
  });

  $('status-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.filter.status = chip.dataset.status;
    syncFilterUi();
    refresh(true);
  });

  $('overdue-chip').addEventListener('click', () => {
    state.filter.overdue = !state.filter.overdue;
    syncFilterUi();
    refresh(true);
  });

  for (const id of ['from-date', 'to-date']) {
    $(id).addEventListener('change', () => {
      state.filter.from = $('from-date').value;
      state.filter.to = $('to-date').value;
      syncFilterUi();
      refresh(true);
    });
  }

  $('clear-filters').addEventListener('click', () => {
    state.filter.status = '';
    state.filter.search = '';
    state.filter.from = '';
    state.filter.to = '';
    state.filter.overdue = false;
    $('search').value = '';
    syncFilterUi();
    refresh(true);
  });

  $('refresh').addEventListener('click', () => { state.newestSeen = 0; $('new-badge').hidden = true; refresh(); });
  $('prev-page').addEventListener('click', () => { state.filter.offset = Math.max(0, state.filter.offset - state.filter.limit); refresh(); });
  $('next-page').addEventListener('click', () => { state.filter.offset += state.filter.limit; refresh(); });

  /* ------------------------------------------------------------------ */
  /* Mavzu (yorug'/qorong'i)                                             */
  /* ------------------------------------------------------------------ */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const use = $('theme-toggle').querySelector('use');
    use.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
    try { localStorage.setItem('mb-theme', theme); } catch { /* xotira yopiq */ }
  }
  $('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  /* ------------------------------------------------------------------ */
  /* Klaviatura va havolalar                                             */
  /* ------------------------------------------------------------------ */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selected && !$('modal').open) closeDetail();
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      $('search').focus();
    }
  });

  function openFromHash() {
    const match = /^#appeal-(\d+)$/.exec(location.hash);
    if (match) openDetail(Number(match[1]));
  }
  window.addEventListener('hashchange', openFromHash);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* ------------------------------------------------------------------ */
  /* Boshlash                                                            */
  /* ------------------------------------------------------------------ */
  (async function boot() {
    let stored = null;
    try { stored = localStorage.getItem('mb-theme'); } catch { /* xotira yopiq */ }
    applyTheme(stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    /* Kirish sahifasi uchun dekanat ma'lumoti (ochiq endpoint) */
    try { applyOffice(await api('/api/office')); } catch { /* muhim emas */ }

    try {
      const me = await api('/api/me');
      state.user = me.user;
      state.csrf = me.csrf;
      applyMe(me);
      showApp();
      await refresh(true);
    } catch {
      showLogin();
    }
  })();
})();
