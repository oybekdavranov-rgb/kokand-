/* =====================================================================
   Qo'qon Universiteti — Tashkiliy tuzilma :: FRONTEND
   Vanilla JS. Talks to the backend API (same origin).
   Features: drill-down org tree, glass cards, LIVE view counters
   (Server-Sent Events), search, hidden admin panel with full editing,
   and an analytics dashboard.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- tiny helpers ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const uid = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = ''), 2600);
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers);
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status, data });
    return data;
  }

  /* ---------------- icons ---------------- */
  const P = 'stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    crown: `<path ${P} d="M3 7l4 4 5-6 5 6 4-4-2 12H5z"/>`,
    building: `<rect ${P} x="4" y="3" width="16" height="18" rx="1.5"/><path ${P} d="M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2M14 15h2M10 21v-3h4v3"/>`,
    chart: `<path ${P} d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>`,
    globe: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`,
    users: `<circle ${P} cx="9" cy="8" r="3.2"/><path ${P} d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M17 20a5.5 5.5 0 0 0-2.5-4.6"/>`,
    briefcase: `<rect ${P} x="3" y="7" width="18" height="13" rx="2"/><path ${P} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>`,
    cpu: `<rect ${P} x="6" y="6" width="12" height="12" rx="2"/><rect ${P} x="9.5" y="9.5" width="5" height="5"/><path ${P} d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>`,
    book: `<path ${P} d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path ${P} d="M19 3v18"/>`,
    compass: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="m15.5 8.5-2 5-5 2 2-5z"/>`,
    cap: `<path ${P} d="M2 9l10-4 10 4-10 4z"/><path ${P} d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v5"/>`,
    atom: `<circle ${P} cx="12" cy="12" r="1.6"/><ellipse ${P} cx="12" cy="12" rx="9" ry="4"/><ellipse ${P} cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse ${P} cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>`,
    scale: `<path ${P} d="M12 3v18M6 21h12M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0zM12 3l7 4M12 3L5 7"/>`,
    dot: `<circle ${P} cx="12" cy="12" r="3.5"/>`,
  };
  const ICON_NAMES = ['crown', 'building', 'cap', 'atom', 'scale', 'chart', 'globe', 'users', 'briefcase', 'cpu', 'book', 'compass', 'dot'];
  const svgIcon = (name, size) => `<svg width="${size || 24}" height="${size || 24}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;
  const eyeSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;

  /* ---------------- state ---------------- */
  const state = {
    data: { logo: '', bgVideo: '', depts: [] },
    path: [],                 // array of node ids (drill-down)
    stats: { totalVisits: 0, views: {} },
    token: localStorage.getItem('ku_token') || '',
    admin: false,
    edit: false,
    dirty: false,
    version: null,
    viewed: new Set(),        // ids already counted as "viewed" this session
    query: '',
  };

  /* ---------------- tracking ---------------- */
  function track(type, extra) {
    try {
      const body = Object.assign({ type }, extra || {});
      // keepalive lets the "visit" beacon survive page unload
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }
  const trackVisit = () => track('visit', { path: location.pathname + location.hash });
  const trackClick = (id) => id && track('click', { target: id });
  const trackView = (id) => {
    if (!id || state.viewed.has(id)) return;
    state.viewed.add(id);
    track('view', { target: id });
    // optimistic local bump so the badge reacts instantly
    state.stats.views[id] = (state.stats.views[id] || 0) + 1;
    paintBadge(id, true);
    paintTotals();
  };

  // IntersectionObserver: count a card as "viewed" when it scrolls into view
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const id = e.target.getAttribute('data-id');
        trackView(id);
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.4 }) : null;

  /* ---------------- live stats (SSE) ---------------- */
  function paintTotals() {
    $('#totalVisits').textContent = fmt(state.stats.totalVisits);
    let sum = 0; for (const k in state.stats.views) sum += state.stats.views[k];
    $('#totalViews').textContent = fmt(sum);
  }
  function paintBadge(id, bump) {
    const el = document.querySelector('.views[data-for="' + cssEsc(id) + '"] b');
    if (el) {
      el.textContent = fmt(state.stats.views[id] || 0);
      if (bump) { const p = el.closest('.views'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
    }
  }
  function paintAllBadges() {
    $$('.views').forEach((v) => {
      const id = v.getAttribute('data-for');
      $('b', v).textContent = fmt(state.stats.views[id] || 0);
    });
  }
  const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');

  function applyStats(s) {
    state.stats.totalVisits = s.totalVisits || 0;
    state.stats.views = Object.assign(state.stats.views, s.views || {});
    paintTotals(); paintAllBadges();
  }
  async function loadPublicStats() {
    try { applyStats(await api('/api/stats/public')); } catch (e) {}
  }
  function connectSSE() {
    if (!('EventSource' in window)) { setInterval(loadPublicStats, 12000); return; }
    let es;
    const open = () => {
      es = new EventSource('/api/stats/stream');
      es.onmessage = (ev) => { try { applyStats(JSON.parse(ev.data)); } catch (e) {} };
      es.onerror = () => { es.close(); setTimeout(open, 5000); }; // auto-reconnect
    };
    open();
  }

  /* ---------------- data ---------------- */
  async function loadData() {
    state.data = await api('/api/data');
    if (!state.data || !Array.isArray(state.data.depts)) state.data = { logo: '', bgVideo: '', depts: [] };
    applyBranding();
  }
  function applyBranding() {
    const logo = $('#logo');
    if (state.data.logo) {
      logo.outerHTML = '<img class="logo" id="logo" alt="KU" src="' + esc(state.data.logo) + '">';
    }
    const v = $('#bgvideo');
    if (state.data.bgVideo) { v.src = state.data.bgVideo; v.classList.remove('hidden'); }
  }

  /* ---------------- tree helpers ---------------- */
  function nodeByPath(path) {
    let list = state.data.depts, node = null;
    for (const id of path) {
      node = (list || []).find((n) => n.id === id);
      if (!node) return null;
      list = node.children;
    }
    return node;
  }
  function currentList() {
    if (state.path.length === 0) return { children: state.data.depts, members: [], node: null };
    const node = nodeByPath(state.path);
    if (!node) { state.path = []; return currentList(); }
    return { children: node.children || [], members: node.members || [], node };
  }
  function buildIndex() {
    const idx = {};
    (function walk(list) {
      (list || []).forEach((n) => {
        idx[n.id] = { name: n.name, type: 'dept' };
        (n.members || []).forEach((m) => { idx[m.id] = { name: m.name + (m.role ? ' — ' + m.role : ''), type: 'member' }; });
        walk(n.children);
      });
    })(state.data.depts);
    return idx;
  }

  /* ---------------- search ---------------- */
  function searchAll(q) {
    q = q.trim().toLowerCase();
    const hits = [];
    (function walk(list, trail) {
      (list || []).forEach((n) => {
        const t = trail.concat([n.id]);
        if ((n.name || '').toLowerCase().includes(q) || (n.desc || '').toLowerCase().includes(q))
          hits.push({ kind: 'dept', node: n, path: trail });
        (n.members || []).forEach((m) => {
          if ((m.name || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q) || (m.bio || '').toLowerCase().includes(q))
            hits.push({ kind: 'member', member: m, node: n, path: t });
        });
        walk(n.children, t);
      });
    })(state.data.depts, []);
    return hits;
  }

  /* ---------------- rendering ---------------- */
  function crumbHtml() {
    const c = $('#crumbs');
    if (state.query) { c.innerHTML = '<span class="cur">Qidiruv natijalari: “' + esc(state.query) + '”</span>'; return; }
    let html = '<button data-go="home">Bosh sahifa</button>';
    let acc = [];
    for (let i = 0; i < state.path.length; i++) {
      const n = nodeByPath(state.path.slice(0, i + 1));
      acc.push(state.path[i]);
      const last = i === state.path.length - 1;
      html += '<span class="sep">›</span>' + (last
        ? '<span class="cur">' + esc(n ? n.name : '') + '</span>'
        : '<button data-go="' + esc(acc.join('/')) + '">' + esc(n ? n.name : '') + '</button>');
    }
    c.innerHTML = state.path.length ? html : '';
  }

  function viewsBadge(id) {
    return '<span class="views" data-for="' + esc(id) + '">' + eyeSvg + '<b>' + fmt(state.stats.views[id] || 0) + '</b></span>';
  }

  function deptCardHtml(n) {
    const kids = (n.children || []).length, mem = (n.members || []).length;
    const counts = [];
    if (kids) counts.push('<span>' + svgIcon('building', 14) + ' ' + kids + ' bo\'lim</span>');
    if (mem) counts.push('<span>' + svgIcon('users', 14) + ' ' + mem + ' xodim</span>');
    return '<article class="card dept" tabindex="0" data-id="' + esc(n.id) + '" data-type="dept" role="button">'
      + viewsBadge(n.id)
      + '<div class="ic-wrap">' + svgIcon(n.icon || 'dot', 24) + '</div>'
      + '<h3>' + esc(n.name) + '</h3>'
      + (n.desc ? '<p class="desc">' + esc(n.desc) + '</p>' : '')
      + (counts.length ? '<div class="count-in">' + counts.join('') + '</div>' : '')
      + '<div class="admin-ctrls"><button class="iconbtn" data-edit-node="' + esc(n.id) + '" title="Tahrirlash">✎</button>'
      + '<button class="iconbtn del" data-del-node="' + esc(n.id) + '" title="O\'chirish">🗑</button></div>'
      + '</article>';
  }
  function memberCardHtml(m) {
    const initials = (m.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const avatar = m.photo
      ? '<img class="avatar" src="' + esc(m.photo) + '" alt="">'
      : '<div class="avatar ph">' + esc(initials) + '</div>';
    return '<article class="card member" tabindex="0" data-id="' + esc(m.id) + '" data-type="member" role="button">'
      + viewsBadge(m.id)
      + avatar
      + '<h3>' + esc(m.name) + '</h3>'
      + (m.role ? '<div class="role">' + esc(m.role) + '</div>' : '')
      + '<div class="admin-ctrls"><button class="iconbtn" data-edit-mem="' + esc(m.id) + '" title="Tahrirlash">✎</button>'
      + '<button class="iconbtn del" data-del-mem="' + esc(m.id) + '" title="O\'chirish">🗑</button></div>'
      + '</article>';
  }

  function render() {
    crumbHtml();
    $('#hero').style.display = (state.path.length === 0 && !state.query) ? '' : 'none';
    const grid = $('#grid');
    let html = '';

    if (state.query) {
      const hits = searchAll(state.query);
      if (!hits.length) { grid.innerHTML = '<div class="empty">Hech narsa topilmadi.</div>'; return; }
      hits.forEach((h) => { html += h.kind === 'dept' ? deptCardHtml(h.node) : memberCardHtml(h.member); });
      grid.innerHTML = html;
      wireCards();
      return;
    }

    const { children, members } = currentList();
    children.forEach((n) => (html += deptCardHtml(n)));
    members.forEach((m) => (html += memberCardHtml(m)));

    if (state.edit) {
      html += '<div class="addcard" data-add="dept"><span class="plus">＋</span>Bo\'lim qo\'shish</div>';
      if (state.path.length > 0)
        html += '<div class="addcard" data-add="member"><span class="plus">＋</span>Xodim qo\'shish</div>';
    } else if (!children.length && !members.length) {
      html += '<div class="empty">Bu bo\'limda hozircha ma\'lumot yo\'q.</div>';
    }
    grid.innerHTML = html;
    wireCards();
  }

  function wireCards() {
    $$('#grid .card').forEach((card) => {
      const id = card.getAttribute('data-id');
      if (io) io.observe(card);
      const open = (e) => {
        if (e.target.closest('.admin-ctrls')) return;
        trackClick(id);
        if (card.getAttribute('data-type') === 'member') openMember(id);
        else drillInto(id);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    });
    // admin buttons
    $$('#grid [data-edit-node]').forEach((b) => b.addEventListener('click', () => editNode(b.getAttribute('data-edit-node'))));
    $$('#grid [data-del-node]').forEach((b) => b.addEventListener('click', () => delNode(b.getAttribute('data-del-node'))));
    $$('#grid [data-edit-mem]').forEach((b) => b.addEventListener('click', () => editMember(b.getAttribute('data-edit-mem'))));
    $$('#grid [data-del-mem]').forEach((b) => b.addEventListener('click', () => delMember(b.getAttribute('data-del-mem'))));
    $$('#grid [data-add]').forEach((b) => b.addEventListener('click', () => addEntry(b.getAttribute('data-add'))));
    paintAllBadges();
  }

  function drillInto(id) {
    const { children } = currentList();
    const node = (children || []).find((n) => n.id === id) ||
      (state.path.length === 0 ? state.data.depts.find((n) => n.id === id) : null);
    if (!node) return;
    state.path.push(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }
  function goHome() { state.path = []; $('#q').value = ''; state.query = ''; render(); }

  /* ---------------- member detail ---------------- */
  function findMemberById(id) {
    let found = null;
    (function walk(list) {
      (list || []).forEach((n) => {
        (n.members || []).forEach((m) => { if (m.id === id) found = m; });
        walk(n.children);
      });
    })(state.data.depts);
    return found;
  }
  function openMember(id) {
    const m = findMemberById(id);
    if (!m) return;
    trackView(id);
    const initials = (m.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const av = m.photo ? '<img src="' + esc(m.photo) + '" alt="">' : '<div class="ph">' + esc(initials) + '</div>';
    const c = [];
    if (m.phone) c.push('<a href="tel:' + esc(m.phone) + '">' + svgIcon('dot', 16) + ' ' + esc(m.phone) + '</a>');
    if (m.email) c.push('<a href="mailto:' + esc(m.email) + '">✉ ' + esc(m.email) + '</a>');
    if (m.telegram) {
      const tg = /^https?:/.test(m.telegram) ? m.telegram : 'https://t.me/' + String(m.telegram).replace(/^@/, '');
      c.push('<a href="' + esc(tg) + '" target="_blank" rel="noopener">✈ ' + esc(m.telegram) + '</a>');
    }
    $('#memberBody').innerHTML =
      '<div class="m-top">' + av + '<div><h2>' + esc(m.name) + '</h2>'
      + (m.role ? '<div class="role" style="font-family:var(--f-script);font-size:22px;color:var(--gold-soft)">' + esc(m.role) + '</div>' : '')
      + '</div></div>'
      + (c.length ? '<div class="contacts">' + c.join('') + '</div>' : '')
      + (m.bio ? '<p class="bio">' + esc(m.bio) + '</p>' : '')
      + (!c.length && !m.bio ? '<p class="bio">Qo\'shimcha ma\'lumot kiritilmagan.</p>' : '');
    openOverlay('#memberOverlay');
  }

  /* ---------------- overlays ---------------- */
  function openOverlay(sel) { $(sel).classList.add('open'); }
  function closeOverlay(el) { el.classList.remove('open'); }
  $$('.overlay').forEach((ov) => {
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeOverlay(ov); });
    $$('[data-close]', ov).forEach((b) => b.addEventListener('click', () => closeOverlay(ov)));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.overlay.open').forEach(closeOverlay); });

  /* ---------------- search wiring ---------------- */
  let searchTimer;
  $('#q').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
    clearTimeout(searchTimer);
    const q = state.query.trim();
    if (q.length >= 2) searchTimer = setTimeout(() => track('search', { query: q }), 700);
  });

  /* ---------------- brand / home ---------------- */
  let logoClicks = 0, logoTimer;
  $('#brand').addEventListener('click', () => {
    logoClicks++;
    clearTimeout(logoTimer);
    logoTimer = setTimeout(() => (logoClicks = 0), 1200);
    if (logoClicks >= 5) { logoClicks = 0; openAdmin(); return; }
    goHome();
  });

  /* =====================================================================
     ADMIN
     ===================================================================== */
  function openAdmin() {
    if (state.admin) { toast('Siz allaqachon admin sifatida kirgansiz'); return; }
    $('#loginErr').textContent = ''; $('#pw').value = '';
    openOverlay('#loginOverlay'); setTimeout(() => $('#pw').focus(), 50);
  }
  // hidden access: #admin hash + Ctrl/Cmd+Shift+A
  if (location.hash === '#admin') setTimeout(openAdmin, 300);
  window.addEventListener('hashchange', () => { if (location.hash === '#admin') openAdmin(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); openAdmin(); }
  });

  $('#loginBtn').addEventListener('click', doLogin);
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  async function doLogin() {
    const pw = $('#pw').value;
    $('#loginErr').textContent = '';
    try {
      const r = await api('/api/login', { method: 'POST', body: { password: pw } });
      state.token = r.token; localStorage.setItem('ku_token', r.token);
      await enterAdmin();
      closeOverlay($('#loginOverlay'));
      toast('Xush kelibsiz, admin!', 'ok');
    } catch (e) {
      $('#loginErr').textContent = e.status === 429 ? 'Juda ko\'p urinish. Birozdan so\'ng qayta urinib ko\'ring.' : 'Parol noto\'g\'ri.';
    }
  }
  async function verifyToken() {
    if (!state.token) return false;
    try { await api('/api/verify'); return true; } catch (e) { return false; }
  }
  async function enterAdmin() {
    state.admin = true;
    document.body.classList.add('is-admin');
    try { const s = await api('/api/stats/admin'); state.version = s.dataVersion; } catch (e) {}
  }
  function logout() {
    state.token = ''; state.admin = false; state.edit = false; state.dirty = false;
    localStorage.removeItem('ku_token');
    document.body.classList.remove('is-admin', 'editing', 'dirty');
    render(); toast('Chiqdingiz');
  }

  function markDirty() { state.dirty = true; document.body.classList.add('dirty'); }

  /* ---- toolbar ---- */
  $('#tEdit').addEventListener('click', () => {
    state.edit = !state.edit;
    document.body.classList.toggle('editing', state.edit);
    $('#tEdit').classList.toggle('on', state.edit);
    render();
  });
  $('#tAdd').addEventListener('click', () => addEntry('dept'));
  $('#tSave').addEventListener('click', saveData);
  $('#tStats').addEventListener('click', openStats);
  $('#tExport').addEventListener('click', exportData);
  $('#tImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importData);
  $('#tReset').addEventListener('click', resetData);
  $('#tLogout').addEventListener('click', logout);

  /* ---- add department / member ---- */
  function addEntry(kind) {
    if (kind === 'member') {
      if (state.path.length === 0) { toast('Xodimni bo\'lim ichida qo\'shing', 'bad'); return; }
      const node = nodeByPath(state.path);
      node.members = node.members || [];
      node.members.push({ id: uid(), name: 'Yangi xodim', role: '', photo: '', bio: '', phone: '', email: '', telegram: '', posts: [] });
      markDirty(); render();
      const last = node.members[node.members.length - 1];
      editMember(last.id);
    } else {
      const list = state.path.length === 0 ? state.data.depts : (nodeByPath(state.path).children = nodeByPath(state.path).children || []);
      const n = { id: uid(), name: 'Yangi bo\'lim', icon: 'dot', desc: '', children: [], members: [] };
      list.push(n); markDirty(); render(); editNode(n.id);
    }
  }

  /* ---- edit department ---- */
  let editingNodeId = null;
  function editNode(id) {
    const node = findNode(id); if (!node) return;
    editingNodeId = id;
    $('#nodeTitle').textContent = 'Bo\'limni tahrirlash';
    $('#n_name').value = node.name || '';
    const sel = $('#n_icon');
    sel.innerHTML = ICON_NAMES.map((n) => '<option value="' + n + '"' + (node.icon === n ? ' selected' : '') + '>' + n + '</option>').join('');
    $('#n_desc').value = node.desc || '';
    $('#n_kind').value = (node.members && node.members.length && !(node.children || []).length) ? 'leaf' : (node.children && node.children.length ? 'branch' : 'branch');
    openOverlay('#nodeOverlay');
  }
  $('#nodeSave').addEventListener('click', () => {
    const node = findNode(editingNodeId); if (!node) return;
    node.name = $('#n_name').value.trim() || 'Nomsiz';
    node.icon = $('#n_icon').value;
    node.desc = $('#n_desc').value.trim();
    node.children = node.children || []; node.members = node.members || [];
    markDirty(); closeOverlay($('#nodeOverlay')); render();
  });

  function delNode(id) {
    if (!confirm('Ushbu bo\'lim va uning ichidagi barcha ma\'lumotlar o\'chiriladi. Davom etasizmi?')) return;
    removeById(id, 'dept'); markDirty(); render();
  }

  /* ---- edit member ---- */
  let editingMemberId = null, pendingPhoto = null;
  function editMember(id) {
    const m = findMemberById(id); if (!m) return;
    editingMemberId = id; pendingPhoto = null;
    $('#memEditErr').textContent = '';
    $('#m_name').value = m.name || ''; $('#m_role').value = m.role || '';
    $('#m_bio').value = m.bio || ''; $('#m_phone').value = m.phone || '';
    $('#m_email').value = m.email || ''; $('#m_telegram').value = m.telegram || '';
    const prev = $('#m_prev');
    if (m.photo) { prev.src = m.photo; prev.style.display = ''; } else { prev.removeAttribute('src'); prev.style.display = 'none'; }
    openOverlay('#memberEditOverlay');
  }
  $('#m_photo_btn').addEventListener('click', () => $('#m_photo_file').click());
  $('#m_photo_clear').addEventListener('click', () => { pendingPhoto = ''; const p = $('#m_prev'); p.removeAttribute('src'); p.style.display = 'none'; });
  $('#m_photo_file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (/svg/i.test(f.type)) { $('#memEditErr').textContent = 'SVG rasm qo\'llanmaydi.'; return; }
    if (f.size > 8 * 1024 * 1024) { $('#memEditErr').textContent = 'Rasm 8MB dan katta.'; return; }
    const r = new FileReader();
    r.onload = () => { pendingPhoto = r.result; const p = $('#m_prev'); p.src = r.result; p.style.display = ''; };
    r.readAsDataURL(f);
  });
  $('#memSave').addEventListener('click', () => {
    const m = findMemberById(editingMemberId); if (!m) return;
    m.name = $('#m_name').value.trim() || 'Nomsiz';
    m.role = $('#m_role').value.trim();
    m.bio = $('#m_bio').value.trim();
    m.phone = $('#m_phone').value.trim();
    m.email = $('#m_email').value.trim();
    m.telegram = $('#m_telegram').value.trim();
    if (pendingPhoto !== null) m.photo = pendingPhoto;
    markDirty(); closeOverlay($('#memberEditOverlay')); render();
  });
  function delMember(id) {
    if (!confirm('Ushbu xodim o\'chirilsinmi?')) return;
    removeById(id, 'member'); markDirty(); render();
  }

  /* ---- tree mutation helpers ---- */
  function findNode(id) {
    let found = null;
    (function walk(list) { (list || []).forEach((n) => { if (n.id === id) found = n; walk(n.children); }); })(state.data.depts);
    return found;
  }
  function removeById(id, kind) {
    (function walk(list) {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        if (kind === 'dept' && list[i].id === id) { list.splice(i, 1); return true; }
        if (list[i].members) {
          const mi = list[i].members.findIndex((m) => m.id === id);
          if (kind === 'member' && mi > -1) { list[i].members.splice(mi, 1); return true; }
        }
        if (walk(list[i].children)) return true;
      }
    })(state.data.depts);
    // if we deleted the node we're currently inside, step out
    if (kind === 'dept' && state.path.includes(id)) state.path = state.path.slice(0, state.path.indexOf(id));
  }

  /* ---- save / reset / export / import ---- */
  async function saveData() {
    try {
      const payload = Object.assign({}, state.data, { _version: state.version });
      const r = await api('/api/data', { method: 'PUT', body: payload });
      state.version = r.version;
      state.dirty = false; document.body.classList.remove('dirty');
      toast('Saqlandi ✓', 'ok');
    } catch (e) {
      if (e.status === 409) {
        toast('Boshqa admin o\'zgartirgan. Qayta yuklanmoqda…', 'bad');
        await loadData(); state.version = (e.data && e.data.version) || state.version; render();
      } else if (e.status === 400) {
        toast('Ma\'lumot noto\'g\'ri: ' + ((e.data && e.data.details && e.data.details[0]) || ''), 'bad');
      } else if (e.status === 401) { toast('Sessiya tugagan. Qayta kiring.', 'bad'); logout(); }
      else toast('Saqlashda xato', 'bad');
    }
  }
  async function resetData() {
    if (!confirm('Butun tuzilma standart holatga qaytariladi. Davom etasizmi?')) return;
    try { const r = await api('/api/reset', { method: 'POST' }); state.data = r.data; state.version = r.version; state.dirty = false; document.body.classList.remove('dirty'); render(); toast('Standart tuzilma tiklandi', 'ok'); }
    catch (e) { toast('Reset xato', 'bad'); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ku-tuzilma-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importData(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || !Array.isArray(obj.depts)) throw new Error('depts massivi yo\'q');
        state.data = obj; state.path = []; markDirty(); render();
        toast('Import qilindi — saqlashni unutmang', 'ok');
      } catch (err) { toast('Import xato: ' + err.message, 'bad'); }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  /* =====================================================================
     STATS DASHBOARD
     ===================================================================== */
  async function openStats() {
    openOverlay('#statsOverlay');
    $('#statsBody').innerHTML = '<div class="empty">Yuklanmoqda…</div>';
    try { renderStats(await api('/api/stats/admin')); }
    catch (e) { $('#statsBody').innerHTML = '<div class="empty">Statistikani yuklab bo\'lmadi.</div>'; }
  }
  $('#statsRefresh').addEventListener('click', openStats);

  function renderStats(s) {
    const idx = buildIndex();
    const label = (id) => (idx[id] && idx[id].name) || id;
    const totalViews = (s.topViewed || []).reduce((a, b) => a + b.count, 0);
    const launch = s.launchedAt ? new Date(s.launchedAt) : null;
    $('#statsSince').textContent = launch
      ? ('Sayt ishga tushgan: ' + launch.toLocaleDateString('uz-UZ') + ' · ' + daysSince(launch) + ' kun oldin')
      : '';

    const tiles = [
      ['Jami tashriflar', fmt(s.totalVisits), 'gold'],
      ['Umumiy ko\'rishlar', fmt(totalViews), ''],
      ['Kuzatilayotgan kartalar', fmt((s.topViewed || []).length), ''],
      ['Qidiruvlar (top)', fmt((s.topSearched || []).length), ''],
    ].map((t) => '<div class="tile"><div class="k">' + t[0] + '</div><div class="v ' + t[2] + '">' + t[1] + '</div></div>').join('');

    // hours bar chart 0..23
    const byH = s.visitsByHour || {};
    let maxH = 1; for (let h = 0; h < 24; h++) maxH = Math.max(maxH, byH[h] || 0);
    let bars = '';
    for (let h = 0; h < 24; h++) {
      const val = byH[h] || 0;
      bars += '<div class="bar" style="height:' + Math.max(2, Math.round((val / maxH) * 100)) + '%">'
        + (val ? '<span>' + val + '</span>' : '') + (h % 3 === 0 ? '<em>' + h + '</em>' : '') + '</div>';
    }

    const topList = (arr, keyer) => arr && arr.length
      ? '<ul class="toplist">' + arr.map((r, i) => '<li><span class="rank">' + (i + 1) + '</span><span class="lbl">' + esc(keyer(r)) + '</span><span class="num">' + fmt(r.count) + '</span></li>').join('') + '</ul>'
      : '<div class="empty" style="padding:20px">Hozircha yo\'q</div>';

    const recent = (s.recent || []).slice(0, 40).map((r) => {
      const d = new Date(r.ts);
      const what = r.type === 'visit' ? 'tashrif' : r.type === 'view' ? label(r.target) : r.type === 'click' ? label(r.target) : ('“' + (r.query || '') + '”');
      return '<div class="r"><time>' + d.toLocaleString('uz-UZ', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</time><span class="t">' + esc(r.type) + '</span><span class="lbl" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(what) + '</span></div>';
    }).join('') || '<div class="empty">Hozircha faoliyat yo\'q</div>';

    $('#statsBody').innerHTML =
      '<div class="stat-tiles">' + tiles + '</div>'
      + '<div class="panel"><h3>Soatlar bo\'yicha tashriflar (0–23)</h3><div class="bars">' + bars + '</div></div>'
      + '<div class="two-col">'
      + '<div class="panel"><h3>Eng ko\'p ko\'rilgan</h3>' + topList(s.topViewed, (r) => label(r.id)) + '</div>'
      + '<div class="panel"><h3>Eng ko\'p bosilgan</h3>' + topList(s.topClicked, (r) => label(r.id)) + '</div>'
      + '</div>'
      + '<div class="two-col">'
      + '<div class="panel"><h3>Eng ko\'p qidirilgan</h3>' + topList(s.topSearched, (r) => r.q) + '</div>'
      + '<div class="panel"><h3>So\'nggi faoliyat (vaqti bilan)</h3><div class="recent">' + recent + '</div></div>'
      + '</div>';
  }
  function daysSince(d) { return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }

  /* =====================================================================
     BOOT
     ===================================================================== */
  $('#crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-go]'); if (!b) return;
    const go = b.getAttribute('data-go');
    if (go === 'home') goHome();
    else { state.path = go.split('/'); render(); }
  });

  window.addEventListener('beforeunload', () => { if (state.dirty) { /* best-effort */ } });

  (async function boot() {
    try { await loadData(); } catch (e) { toast('Ma\'lumotni yuklab bo\'lmadi', 'bad'); }
    render();
    paintTotals();
    await loadPublicStats();
    connectSSE();
    trackVisit();
    if (state.token && await verifyToken()) enterAdmin();
  })();
})();
