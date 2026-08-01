/* ═══════════════════════════════════════════════════════════
   ZINNURA — app.js
   Sof frontend: hech qanday kutubxona, hech qanday backend yo'q.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═══════════ MA'LUMOTLAR ═══════════ */

  const PHOTOS = [
    { f: 'p01.jpg', t: 'Kadr ichidagi kadr',      s: 'plyonka' },
    { f: 'p02.jpg', t: 'Oq libos, oq niyat',      s: 'bayram'  },
    { f: 'p03.jpg', t: 'Kichkintoy bilan',        s: 'mehr'    },
    { f: 'p04.jpg', t: 'Yurak chizilgan kun',     s: 'do‘stlik'},
    { f: 'p05.jpg', t: 'Xayolchan kunlar',        s: 'sukunat' },
    { f: 'p06.jpg', t: 'Maktab kunlari',          s: 'yoshlik' },
    { f: 'p07.jpg', t: 'Sharlar va shodlik',      s: 'quvonch' },
    { f: 'p08.jpg', t: 'Bayram kayfiyati',        s: 'tantana' },
    { f: 'p09.jpg', t: 'Iliq oqshom',             s: 'osoyish' },
    { f: 'p10.jpg', t: 'Eng yumshoq quchoq',      s: 'iliqlik' },
    { f: 'p11.jpg', t: 'Tungi suhbatlar',         s: 'sirlar'  },
    { f: 'p12.jpg', t: 'Kechki sayr',             s: 'erkinlik'},
    { f: 'p13.jpg', t: 'Do‘stlik kadri',          s: 'birga'   },
    { f: 'p14.jpg', t: 'Ayiqcha bilan',           s: 'bolalik' }
  ];

  const CLIPS = [
    { f: 'clip-01', t: 'Kulgi baland edi',  s: 'lahza 01' },
    { f: 'clip-02', t: 'Kunning o‘rtasi',   s: 'lahza 02' },
    { f: 'clip-03', t: 'Bahor havosi',      s: 'lahza 03' }
  ];

  const NOTES = [
    { f: 'note-01', t: 'Video-xabar I'  },
    { f: 'note-02', t: 'Video-xabar II' }
  ];

  const WISHES = [
    { i: '✦', t: 'Baxt',     d: 'Baxting shu qadar ko‘p bo‘lsinki, uni sanashga vaqting yetmasin.' },
    { i: '❀', t: 'Sog‘lik',  d: 'Sog‘liging mustahkam, kayfiyating esa doim yozdek issiq bo‘lsin.' },
    { i: '☾', t: 'Tinchlik', d: 'Uyingda tinchlik, yuragingda xotirjamlik hukm sursin.' },
    { i: '✿', t: 'Orzular',  d: 'Ko‘nglingdagi eng katta orzu — eng oson ro‘yobga chiqadigani bo‘lsin.' },
    { i: '✧', t: 'Ilm',      d: 'O‘qiganing yodingda, yozganing joyida, mehnating mukofotli bo‘lsin.' },
    { i: '♡', t: 'Mehr',     d: 'Kimga mehr bersang — o‘shandan yuz barobar bo‘lib qaytsin.' },
    { i: '★', t: 'Kulgu',    d: 'Kuningdagi eng ko‘p takrorlanadigan tovush sening kulgung bo‘lsin.' },
    { i: '✵', t: 'Yo‘l',     d: 'Qaysi yo‘lni tanlasang, o‘sha yo‘l seni to‘g‘ri manzilga yetkazsin.' }
  ];

  const ACROSTIC = [
    { l: 'Z', w: 'Ziyoli',   d: 'bilimga chanqoq, fikri tiniq' },
    { l: 'I', w: 'Iliq',     d: 'yonida turgan odam isinadi' },
    { l: 'N', w: 'Nafis',    d: 'har bir harakatida nafosat bor' },
    { l: 'N', w: 'Nurli',    d: 'ismining ma’nosi — yuzida' },
    { l: 'U', w: 'Umidli',   d: 'hech qachon ishonchini yo‘qotmaydi' },
    { l: 'R', w: 'Rahmdil',  d: 'yuragi hammaga yetadi' },
    { l: 'A', w: 'Aziz',     d: 'ko‘pchilik uchun qadrli' }
  ];

  const STORY = [
    { n: 'birinchi', t: 'Tanishuv', d: 'Oddiy kun edi. Sen kulding — va o‘sha kun oddiy bo‘lmay qoldi.' },
    { n: 'ikkinchi', t: 'Kunlar',   d: 'Keyin suratlar ko‘paydi, kulgular ko‘paydi, sukunat kamaydi.' },
    { n: 'uchinchi', t: 'Yo‘llar',  d: 'Har kimning o‘z yo‘li bor — bu hayotning eng adolatli qoidasi. Yo‘llar ayrilsa ham, yaxshi xotira qolaveradi.' },
    { n: 'to‘rtinchi', t: 'Bugun',  d: 'Bugun esa faqat bitta gap qoldi: rahmat senga, va baxtli bo‘l.' }
  ];

  const MEDIA = 'assets/media/';


  /* ═══════════ RENDER ═══════════ */

  // Galereya
  $('#grid').innerHTML = PHOTOS.map((p, i) => `
    <figure class="card" data-i="${i}">
      <img src="${MEDIA}photos/${p.f}" alt="${p.t}" loading="lazy" decoding="async">
      <figcaption class="card__cap"><b>${p.t}</b><i>${p.s}</i></figcaption>
    </figure>`).join('');

  // Vertikal videolar
  $('#clips').innerHTML = CLIPS.map(c => `
    <figure class="clip" data-v="${c.f}" data-t="${c.t}">
      <img src="${MEDIA}posters/${c.f}.jpg" alt="${c.t}" loading="lazy" decoding="async">
      <span class="clip__play"></span>
      <figcaption class="clip__meta"><span>${c.s}</span><b>${c.t}</b></figcaption>
    </figure>`).join('');

  // Dumaloq video-xabarlar
  $('#notes').innerHTML = NOTES.map(n => `
    <figure class="note" data-v="${n.f}" data-t="${n.t}" data-round="1">
      <img src="${MEDIA}posters/${n.f}.jpg" alt="${n.t}" loading="lazy" decoding="async">
      <span class="note__ring"></span>
      <span class="note__play">▶</span>
      <figcaption class="note__lbl">${n.t}</figcaption>
    </figure>`).join('');

  // Tilaklar
  $('#wishGrid').innerHTML = WISHES.map((w, i) => `
    <article class="wish">
      <span class="wish__ico">${w.i}</span>
      <h3 class="wish__t">${w.t}</h3>
      <p class="wish__d">${w.d}</p>
      <span class="wish__n">${String(i + 1).padStart(2, '0')}</span>
    </article>`).join('');

  // Akrostix
  $('#acrostic').innerHTML = ACROSTIC.map(a => `
    <div class="acro">
      <span class="acro__l">${a.l}</span>
      <span class="acro__b"><b>${a.w}</b><span>${a.d}</span></span>
    </div>`).join('');

  // Hikoya
  $('#timeline').innerHTML = STORY.map(s => `
    <li class="tl">
      <h3 class="tl__t"><small>${s.n}</small>${s.t}</h3>
      <p class="tl__d">${s.d}</p>
    </li>`).join('');


  /* ═══════════ MUSIQA (Web Audio — fayl kerak emas) ═══════════ */

  const Music = (() => {
    let ctx = null, master = null, padGain = null, timer = null;
    let on = false, ducked = false;

    // pentatonik (F# maj pentatonik atrofida) — yumshoq, mungli emas
    const SCALE = [369.99, 415.30, 493.88, 554.37, 622.25, 739.99, 830.61, 987.77];
    const PAD   = [123.47, 185.00, 246.94]; // past pad akkordi

    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // yumshoq "xona" effekti: feedback delay
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.42;
      const fb = ctx.createGain(); fb.gain.value = 0.34;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 1800;
      delay.connect(damp); damp.connect(fb); fb.connect(delay);
      delay.connect(master);
      window.__zDelay = delay;

      // uzluksiz pad
      padGain = ctx.createGain(); padGain.gain.value = 0.055;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass'; padFilter.frequency.value = 640; padFilter.Q.value = 3;
      padGain.connect(padFilter); padFilter.connect(master); padFilter.connect(delay);

      PAD.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 6;
        o.connect(padGain);
        o.start();
      });

      // filtrni sekin "nafas oldirish"
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
      const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
      lfo.connect(lfoAmt); lfoAmt.connect(padFilter.frequency); lfo.start();

      return true;
    }

    function note() {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const f = SCALE[Math.floor(Math.random() * SCALE.length)];

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400;

      o.connect(g); g.connect(lp);
      lp.connect(master);
      if (window.__zDelay) lp.connect(window.__zDelay);

      o.start(t); o.stop(t + 2.9);
    }

    function fade(to, sec) {
      if (!ctx) return;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.linearRampToValueAtTime(to, t + sec);
    }

    return {
      start() {
        if (!ctx && !build()) return;
        ctx.resume();
        on = true;
        fade(ducked ? 0.02 : 0.16, 2.2);
        if (!timer) {
          note();
          timer = setInterval(() => { if (on && !ducked && Math.random() > 0.22) note(); }, 1450);
        }
      },
      stop() { on = false; fade(0, 0.9); },
      toggle() { on ? this.stop() : this.start(); return on; },
      isOn() { return on; },
      duck(v) { ducked = v; if (on) fade(v ? 0.015 : 0.16, v ? 0.35 : 1.4); }
    };
  })();

  const soundBtn = $('#soundBtn');
  function syncSoundBtn() {
    soundBtn.classList.toggle('is-muted', !Music.isOn());
    soundBtn.classList.toggle('is-playing', Music.isOn());
  }
  soundBtn.addEventListener('click', () => { Music.toggle(); syncSoundBtn(); });
  syncSoundBtn();


  /* ═══════════ KIRISH DARVOZASI ═══════════ */

  const gate = $('#gate');
  function openGate() {
    gate.classList.add('is-gone');
    document.body.classList.remove('is-locked');
    Music.start();
    syncSoundBtn();
    setTimeout(() => { gate.style.display = 'none'; }, 1200);
  }
  $('#gateBtn').addEventListener('click', openGate);
  document.addEventListener('keydown', e => {
    if (!gate.classList.contains('is-gone') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); openGate();
    }
  }, { once: false });


  /* ═══════════ HERO — fon slaydlari ═══════════ */

  const heroImgs = $$('#heroBg img');
  let heroIx = 0;
  if (!REDUCED && heroImgs.length > 1) {
    setInterval(() => {
      heroImgs[heroIx].classList.remove('is-on');
      heroIx = (heroIx + 1) % heroImgs.length;
      heroImgs[heroIx].classList.add('is-on');
    }, 5200);
  }


  /* ═══════════ SKROLL: progress, nav, aktiv bo'lim ═══════════ */

  const bar = $('#scrollBar');
  const nav = $('#nav');
  const links = $$('.nav__list a');
  const secs  = links.map(a => $(a.getAttribute('href'))).filter(Boolean);

  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    nav.classList.toggle('is-solid', y > 80);

    let cur = -1;
    secs.forEach((s, i) => { if (s.offsetTop - window.innerHeight * 0.35 <= y) cur = i; });
    links.forEach((a, i) => a.classList.toggle('is-active', i === cur));
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();


  /* ═══════════ SKROLL BILAN CHIQISH (reveal) ═══════════ */

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  $$('[data-reveal]').forEach(el => io.observe(el));

  // navbatma-navbat chiqadiganlar
  function stagger(selector, step) {
    const items = $$(selector);
    const o = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const i = items.indexOf(en.target);
        en.target.style.transitionDelay = ((i % 8) * step) + 'ms';
        en.target.classList.add('is-in');
        o.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    items.forEach(el => o.observe(el));
  }
  stagger('.wish', 90);
  stagger('.acro', 110);
  stagger('.tl',   140);


  /* ═══════════ KURSOR NURI ═══════════ */

  const glow = $('#cursorGlow');
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let gx = 0, gy = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', e => { gx = e.clientX; gy = e.clientY; }, { passive: true });
    (function loop() {
      cx += (gx - cx) * 0.11; cy += (gy - cy) * 0.11;
      glow.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(loop);
    })();
  }


  /* ═══════════ GULBARGLAR / UCHQUNLAR ═══════════ */

  if (!REDUCED) {
    const cv = $('#petals'), cx = cv.getContext('2d');
    let W = 0, H = 0, parts = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.width  = Math.floor(innerWidth  * dpr);
      H = cv.height = Math.floor(innerHeight * dpr);
      cv.style.width = innerWidth + 'px';
      cv.style.height = innerHeight + 'px';
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    function build() {
      const n = innerWidth < 640 ? 24 : innerWidth < 1100 ? 40 : 58;
      parts = Array.from({ length: n }, () => spawn(true));
    }
    function spawn(any) {
      const sparkle = Math.random() > 0.62;
      return {
        x: Math.random() * innerWidth,
        y: any ? Math.random() * innerHeight : -20,
        r: sparkle ? 0.7 + Math.random() * 1.4 : 2 + Math.random() * 4.5,
        vy: 0.12 + Math.random() * 0.5,
        sway: 0.4 + Math.random() * 1.1,
        ph: Math.random() * Math.PI * 2,
        a: 0.14 + Math.random() * 0.45,
        sparkle,
        hue: Math.random() > 0.5 ? '237,201,138' : '240,185,196'
      };
    }
    function tick(ts) {
      cx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y += p.vy;
        p.ph += 0.012;
        const x = p.x + Math.sin(p.ph) * p.sway * 14;
        const tw = p.sparkle ? 0.45 + 0.55 * Math.abs(Math.sin(p.ph * 2.6)) : 1;

        cx.beginPath();
        cx.fillStyle = `rgba(${p.hue},${p.a * tw})`;
        if (p.sparkle) {
          cx.arc(x, p.y, p.r, 0, 6.283);
        } else {
          cx.ellipse(x, p.y, p.r, p.r * 1.45, p.ph, 0, 6.283);
        }
        cx.fill();

        if (p.y > innerHeight + 24) parts[i] = spawn(false);
      }
      requestAnimationFrame(tick);
    }
    resize();
    addEventListener('resize', resize, { passive: true });
    requestAnimationFrame(tick);
  }


  /* ═══════════ LIGHTBOX ═══════════ */

  const lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbCount = $('#lbCount');
  let lbIx = 0;

  function lbShow(i) {
    lbIx = (i + PHOTOS.length) % PHOTOS.length;
    const p = PHOTOS[lbIx];
    lbImg.src = MEDIA + 'photos/' + p.f;
    lbImg.alt = p.t;
    lbCap.textContent = p.t;
    lbCount.textContent = (lbIx + 1) + ' / ' + PHOTOS.length;
  }
  function lbOpen(i) {
    lbShow(i);
    lb.classList.add('is-open');
    document.body.classList.add('is-locked');
  }
  function lbClose() {
    lb.classList.remove('is-open');
    if (!$('#vm').classList.contains('is-open')) document.body.classList.remove('is-locked');
  }

  $('#grid').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) lbOpen(+card.dataset.i);
  });
  $('#lbClose').addEventListener('click', lbClose);
  $('#lbPrev').addEventListener('click', () => lbShow(lbIx - 1));
  $('#lbNext').addEventListener('click', () => lbShow(lbIx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });

  // svayp (telefon uchun)
  let tX = 0;
  lb.addEventListener('touchstart', e => { tX = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientX - tX;
    if (Math.abs(d) > 55) lbShow(lbIx + (d < 0 ? 1 : -1));
  }, { passive: true });


  /* ═══════════ VIDEO MODAL ═══════════ */

  const vm = $('#vm'), vmVideo = $('#vmVideo'), vmCap = $('#vmCap');
  const vmToggle = $('#vmToggle'), vmRing = $('#vmRing');
  const RING = 2 * Math.PI * 48.4;   // halqa uzunligi

  function vmOpen(name, title, round) {
    vmVideo.src = MEDIA + 'videos/' + name + '.mp4';
    vmVideo.poster = MEDIA + 'posters/' + name + '.jpg';
    vmCap.textContent = title;
    // dumaloq video-xabarda nativ tugmalar aylanadan chiqib ketadi —
    // uning o'rniga halqali progress + bosib to'xtatish
    vm.classList.toggle('is-round', !!round);
    vmVideo.controls = !round;
    vmRing.style.strokeDashoffset = RING;
    vm.classList.add('is-open');
    document.body.classList.add('is-locked');
    Music.duck(true);
    vmVideo.play().catch(() => {});
  }
  function vmClose() {
    vm.classList.remove('is-open');
    vmVideo.pause();
    vmVideo.removeAttribute('src');
    vmVideo.load();
    if (!lb.classList.contains('is-open')) document.body.classList.remove('is-locked');
    Music.duck(false);
  }

  function vmPlayPause() {
    if (vmVideo.paused) vmVideo.play().catch(() => {});
    else vmVideo.pause();
  }
  vmToggle.addEventListener('click', vmPlayPause);
  vmVideo.addEventListener('click', () => { if (vm.classList.contains('is-round')) vmPlayPause(); });

  function syncToggle() {
    vm.classList.toggle('is-paused', vmVideo.paused);
    vmToggle.textContent = vmVideo.paused ? '▶' : '❚❚';
  }
  vmVideo.addEventListener('play', syncToggle);
  vmVideo.addEventListener('pause', syncToggle);
  vmVideo.addEventListener('timeupdate', () => {
    const d = vmVideo.duration;
    if (!d || !isFinite(d)) return;
    vmRing.style.strokeDashoffset = RING * (1 - vmVideo.currentTime / d);
  });

  function bindVideoOpen(root) {
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-v]');
      if (el) vmOpen(el.dataset.v, el.dataset.t, el.dataset.round);
    });
  }
  bindVideoOpen($('#clips'));
  bindVideoOpen($('#notes'));

  $('#vmClose').addEventListener('click', vmClose);
  vm.addEventListener('click', e => { if (e.target === vm) vmClose(); });
  vmVideo.addEventListener('ended', () => Music.duck(false));


  /* ═══════════ KLAVIATURA ═══════════ */

  document.addEventListener('keydown', e => {
    if (vm.classList.contains('is-open')) {
      if (e.key === 'Escape') vmClose();
      return;
    }
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     lbClose();
    if (e.key === 'ArrowLeft')  lbShow(lbIx - 1);
    if (e.key === 'ArrowRight') lbShow(lbIx + 1);
  });


  /* ═══════════ YURAK TUGMASI ═══════════ */

  const heartBtn = $('#heartBtn'), heartCount = $('#heartCount');
  const KEY = 'zinnura_hearts';
  let hearts = 0;
  try { hearts = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (_) {}
  heartCount.textContent = hearts;

  const GLYPHS = ['♥', '♡', '✦', '❀', '✧', '★'];

  heartBtn.addEventListener('click', () => {
    hearts++;
    heartCount.textContent = hearts;
    try { localStorage.setItem(KEY, String(hearts)); } catch (_) {}

    const r = heartBtn.getBoundingClientRect();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'fly';
      s.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      s.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * r.width) + 'px';
      s.style.top  = (r.top + r.height / 2) + 'px';
      s.style.setProperty('--dx',  ((Math.random() - 0.5) * 240) + 'px');
      s.style.setProperty('--rot', ((Math.random() - 0.5) * 200) + 'deg');
      s.style.fontSize = (16 + Math.random() * 18) + 'px';
      s.style.animationDelay = (i * 45) + 'ms';
      s.style.opacity = 0.55 + Math.random() * 0.45;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2900);
    }
  });


  /* ═══════════ ICHKI HAVOLALARNI SILLIQ SKROLL ═══════════ */

  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const el = $(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    });
  });


  /* ═══════════ SAHIFA YASHIRINGANDA MUSIQANI PAUZA ═══════════ */

  document.addEventListener('visibilitychange', () => {
    Music.duck(document.hidden);
  });

  /* konsolga kichik salom */
  console.log('%c✦ ZINNURA ✦', 'font-size:22px;color:#edc98a;font-family:Georgia,serif');
})();
