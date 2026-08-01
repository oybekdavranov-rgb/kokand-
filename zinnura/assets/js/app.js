/* ═══════════════════════════════════════════════════════════
   ZINNURA — زِنُّورَة
   Sof frontend: kutubxonasiz, backendsiz, audio faylsiz.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MEDIA = 'assets/media/';


  /* ═════════════ 1. MA'LUMOTLAR ═════════════ */

  /* Kadrlar — har biri o'ng/chap ketma-ketlikda chiqadi.
     Yonidagi matn: maqsadlar to'xtamasligi haqida qo'llab-quvvatlash + tilak. */
  const FRAMES = [
    { f:'p05.jpg', k:'boshlanish', t:'Har yo‘l bitta <span>qadamdan</span> boshlanadi',
      d:'Katta ishlar katta rejadan emas, kichik birinchi qadamdan boshlanadi. Sen o‘sha qadamni allaqachon tashlagansan — endi orqaga qarama.',
      w:'Qadamlaring dadil bo‘lsin' },

    { f:'p02.jpg', k:'ishonch', t:'O‘zingga <span>ishon</span> — qolgani ergashadi',
      d:'Odamlar senga ishonishini kutma. Avval o‘zing ishon: o‘shanda atrofdagilar ham ortingdan yuradi. Bu ishonchni hech kimga oldirma.',
      w:'Ishonching so‘nmasin' },

    { f:'p06.jpg', k:'mehnat', t:'Iste’dod eshikni ochadi, <span>mehnat</span> ichkarida qoladi',
      d:'Bir kunlik zo‘r natijadan ko‘ra, har kungi kichik mehnat kuchliroq. Sening mehnating hech qayoqqa yo‘qolmaydi — u faqat vaqtini kutadi.',
      w:'Mehnating zoye ketmasin' },

    { f:'p09.jpg', k:'sabr', t:'Kechikkan natija — <span>noto‘g‘ri</span> yo‘l degani emas',
      d:'Ba’zan hamma narsa to‘g‘ri, faqat vaqt hali yetmagan bo‘ladi. Shoshilma va to‘xtama — bu ikkisi bir vaqtda bo‘lishi mumkin.',
      w:'Sabring shirin natija bersin' },

    { f:'p07.jpg', k:'bilim', t:'O‘qigan har sahifang — <span>kelajakdagi</span> o‘zingga xat',
      d:'Bugun tushunmagan narsang ertaga sen uchun oddiy bo‘ladi. Bilim yig‘iladi, hech qachon kamaymaydi. Sen buni allaqachon bilasan.',
      w:'Biliming yuksaklikka olib chiqsin' },

    { f:'p12.jpg', k:'jasorat', t:'Katta orzudan <span>qo‘rqma</span>',
      d:'Kimningdir bosh og‘rig‘i bo‘lgan orzu — kimningdir kundalik hayoti. Sening orzularing ham kimningdir hayoti bo‘lishi mumkin. Sen o‘sha kimdir bo‘l.',
      w:'Jasoratingdan orzularing cho‘chimasin' },

    { f:'p04.jpg', k:'do‘stlik', t:'Yoningdagi <span>chin do‘st</span> — eng qimmat sarmoya',
      d:'Yo‘lda kim bilan yurishing, qayerga yetishingni belgilaydi. Seni ko‘tarib turadigan odamlarni qadrla — va o‘zing ham shunday bo‘l.',
      w:'Atrofingda chin do‘stlar bo‘lsin' },

    { f:'p11.jpg', k:'kuch', t:'Yiqilish mag‘lubiyat emas — <span>turmaslik</span> mag‘lubiyat',
      d:'Hamma yiqiladi. Farq shundaki, kimdir yotib qoladi, kimdir turadi. Sen har safar turasan — buni men ko‘rganman.',
      w:'Har safar kuchliroq turasan' },

    { f:'p14.jpg', k:'vaqt', t:'Kechikkan kun yo‘q — <span>boshlanmagan</span> kun bor',
      d:'«Endi kech» degan gap ko‘pincha yolg‘on. Bugun — hayotingdagi eng yosh kuning. Boshlash uchun bundan yaxshiroq payt bo‘lmaydi.',
      w:'Har kuning yangi imkoniyat bo‘lsin' },

    { f:'p13.jpg', k:'maqsad', t:'Maqsading aniq bo‘lsa — <span>yo‘l</span> o‘zi ko‘rinadi',
      d:'Aniqlikdan qo‘rqma. «Nimadir bo‘lsa bo‘ldi» emas, «aynan shu» de. Aniq aytilgan maqsad yarim yo‘lni o‘zi bosib o‘tadi.',
      w:'Maqsadlaringning barchasiga yet' },

    { f:'p01.jpg', k:'nur', t:'Isming nur degani — <span>nur to‘xtamaydi</span>',
      d:'Nur devorga urilsa, yo‘lini o‘zgartiradi, lekin so‘nmaydi. Sen ham shundaysan: to‘siq seni to‘xtata olmaydi, faqat yo‘lingni yangilaydi.',
      w:'Nuring hech qachon so‘nmasin' },

    { f:'p03.jpg', k:'oila', t:'Seni sevganlar — orqangdagi devor emas, <span>ostingdagi zamin</span>',
      d:'Ular seni ushlab turmaydi — ular seni ko‘taradi. Qiyin kunda yolg‘iz emasligingni eslash — o‘zi katta kuch.',
      w:'Oilang doim yoningda bo‘lsin' },

    { f:'p10.jpg', k:'yutuq', t:'Bugungi qiyinchiliging — <span>ertangi hikoyang</span>',
      d:'Bir kun kelib bugungi charchoqni kulib eslaysan. Chunki o‘shanda yetib borgan joying bugungi mehnating hisobiga bo‘ladi.',
      w:'Bugungi mehnating ertangi g‘ururing bo‘lsin' },

    { f:'p08.jpg', k:'davom', t:'Va eng muhimi — <span>to‘xtama</span>',
      d:'Sen boshlagan ishlarning hammasi seni kutyapti. Hech biri o‘z-o‘zidan tugamaydi, lekin sen bilan albatta tugaydi.',
      w:'To‘xtamagin — eng yaxshisi oldinda' }
  ];

  const WISHES = [
    { i:'✦', t:'Baxt',     d:'Baxting shu qadar ko‘p bo‘lsinki, uni sanashga vaqting yetmasin.' },
    { i:'❀', t:'Sog‘lik',  d:'Sog‘liging mustahkam, kayfiyating esa doim yozdek issiq bo‘lsin.' },
    { i:'☾', t:'Tinchlik', d:'Uyingda tinchlik, yuragingda xotirjamlik hukm sursin.' },
    { i:'✿', t:'Orzular',  d:'Ko‘nglingdagi eng katta orzu — eng oson ro‘yobga chiqadigani bo‘lsin.' },
    { i:'✧', t:'Ilm',      d:'O‘qiganing yodingda, yozganing joyida, mehnating mukofotli bo‘lsin.' },
    { i:'♡', t:'Mehr',     d:'Kimga mehr bersang — o‘shandan yuz barobar bo‘lib qaytsin.' },
    { i:'★', t:'Kulgu',    d:'Kuningdagi eng ko‘p takrorlanadigan tovush sening kulgung bo‘lsin.' },
    { i:'✵', t:'Yo‘l',     d:'Qaysi yo‘lni tanlasang, o‘sha yo‘l seni to‘g‘ri manzilga yetkazsin.' }
  ];

  const CLIPS = [
    { f:'clip-01', t:'Kulgi baland edi', s:'lahza 01' },
    { f:'clip-02', t:'Kunning o‘rtasi',  s:'lahza 02' },
    { f:'clip-03', t:'Bahor havosi',     s:'lahza 03' }
  ];

  const NOTES = [
    { f:'note-01', t:'Video-xabar I'  },
    { f:'note-02', t:'Video-xabar II' }
  ];


  /* ═════════════ 2. RENDER ═════════════ */

  // Marquee (ikki marta — uzluksiz aylanishi uchun)
  const MARQ = ['ZINNURA', 'زِنُّورَة', 'NUR EGASI', 'دُمْتِ نُورًا', 'اَلنُّور', 'ZINNURA'];
  $('#marquee').innerHTML = [0, 1].map(() =>
    MARQ.map(w => {
      const ar = /[؀-ۿ]/.test(w);
      return `<span class="${ar ? 'ar' : ''}"${ar ? ' dir="rtl"' : ''}>${w}</span><b>✦</b>`;
    }).join('')
  ).join('');

  // Tilaklar
  $('#wishGrid').innerHTML = WISHES.map((w, i) => `
    <article class="wish">
      <span class="wish__ico">${w.i}</span>
      <h3 class="wish__t nur nur--xs nur--left">${w.t}</h3>
      <p class="wish__d">${w.d}</p>
      <span class="wish__n">${String(i + 1).padStart(2, '0')}</span>
    </article>`).join('');

  // Kadrlar — juft/toq bo'yicha chap va o'ng
  $('#strip').innerHTML = FRAMES.map((fr, i) => `
    <article class="frame ${i % 2 === 0 ? 'frame--l' : 'frame--r'}">
      <span class="frame__dot" aria-hidden="true"></span>
      <figure class="frame__media" data-i="${i}">
        <img src="${MEDIA}photos/${fr.f}" alt="${fr.k}" loading="lazy" decoding="async">
        <span class="frame__corner" aria-hidden="true"></span>
        <span class="frame__no">${String(i + 1).padStart(2, '0')}</span>
        <span class="frame__zoom" aria-hidden="true">⤢</span>
      </figure>
      <div class="frame__text">
        <p class="frame__k"><i></i>${fr.k}</p>
        <h3 class="frame__t nur nur--sm nur--left">${fr.t}</h3>
        <p class="frame__d">${fr.d}</p>
        <span class="frame__wish">${fr.w}</span>
      </div>
    </article>`).join('');

  // Videolar — avtomatik ishlaydi (ovozsiz, uzluksiz)
  $('#clips').innerHTML = CLIPS.map(c => `
    <figure class="clip" data-v="${c.f}" data-t="${c.t}">
      <video src="${MEDIA}videos/${c.f}.mp4" poster="${MEDIA}posters/${c.f}.jpg"
             autoplay muted loop playsinline preload="auto"></video>
      <span class="clip__live"><b></b>jonli</span>
      <span class="clip__snd">🔊</span>
      <figcaption class="clip__meta"><span>${c.s}</span><b class="nur nur--xs nur--left">${c.t}</b></figcaption>
    </figure>`).join('');

  $('#notes').innerHTML = NOTES.map(n => `
    <figure class="note" data-v="${n.f}" data-t="${n.t}" data-round="1">
      <video src="${MEDIA}videos/${n.f}.mp4" poster="${MEDIA}posters/${n.f}.jpg"
             autoplay muted loop playsinline preload="auto"></video>
      <span class="note__ring"></span>
      <span class="note__snd">🔊</span>
      <figcaption class="note__lbl">${n.t}</figcaption>
    </figure>`).join('');


  /* ═════════════ 3. MUSIQA — skripka + pianino ═════════════
     Audio fayl yo'q: hammasi Web Audio API orqali jonli sintez qilinadi.
     Pianino — additiv sintez (obertonlar + tez tushuvchi konvert).
     Skripka — arra to'lqin + past chastota filtri + vibrato.
     Re-major: D — A — Bm — G aylanma progressiyasi.                    */

  const Music = (() => {
    let ctx = null, master, mix, comp, revGain;
    let on = false, ducked = false, timer = null;
    let barTime = 0, barIx = 0;

    const BEAT = 1.0;
    const BAR  = BEAT * 4;
    const VOL  = 0.5;

    const N = {
      D2:73.42, G2:98.00, A2:110.00, B2:123.47,
      D3:146.83, E3:164.81, Fs3:185.00, G3:196.00, A3:220.00, B3:246.94, Cs4:277.18,
      D4:293.66, E4:329.63, Fs4:369.99, G4:392.00, A4:440.00, B4:493.88
    };

    // har bir takt: bas, arpedjio uchun akkord tonlari, skripka melodiyasi
    const BARS = [
      { bass:N.D2, arp:[N.D3, N.A3,  N.D4, N.Fs4], mel:[[N.Fs4, 4]] },
      { bass:N.A2, arp:[N.A2, N.E3,  N.A3, N.Cs4], mel:[[N.E4,  4]] },
      { bass:N.B2, arp:[N.B2, N.Fs3, N.B3, N.D4 ], mel:[[N.D4, 2], [N.Fs4, 2]] },
      { bass:N.G2, arp:[N.G2, N.D3,  N.G3, N.B3 ], mel:[[N.G4, 2], [N.A4,  2]] }
    ];
    const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

    /* sun'iy xona akustikasi (reverb) */
    function impulse(sec, decay) {
      const rate = ctx.sampleRate, len = Math.floor(rate * sec);
      const buf = ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
      }
      return buf;
    }

    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 24;
      comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.28;
      comp.connect(master);

      mix = ctx.createGain(); mix.gain.value = 0.9;
      mix.connect(comp);

      const conv = ctx.createConvolver();
      conv.buffer = impulse(3.4, 2.6);
      revGain = ctx.createGain(); revGain.gain.value = 0.42;
      mix.connect(conv); conv.connect(revGain); revGain.connect(comp);

      return true;
    }

    /* --- PIANINO --- */
    function piano(t, freq, vel, dur) {
      const partials = [[1, 1], [2, 0.40], [3, 0.16], [4, 0.08], [5, 0.04]];
      for (let i = 0; i < partials.length; i++) {
        const mult = partials[i][0], amp = partials[i][1];
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = freq * mult;
        o.detune.value = (Math.random() * 5 - 2.5);

        const g = ctx.createGain();
        const a = Math.max(0.0002, vel * amp);
        const d = dur / (1 + i * 0.55);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(a, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);

        o.connect(g); g.connect(mix);
        o.start(t); o.stop(t + d + 0.05);
      }
    }

    /* --- SKRIPKA --- */
    function violin(t, freq, dur, vel) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;

      // vibrato — sekin kirib keladi
      const vib = ctx.createOscillator();
      vib.type = 'sine'; vib.frequency.value = 5.1 + Math.random() * 0.5;
      const vibAmt = ctx.createGain();
      vibAmt.gain.setValueAtTime(0, t);
      vibAmt.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(0.8, dur * 0.5));
      vib.connect(vibAmt); vibAmt.connect(o.frequency);
      vib.start(t); vib.stop(t + dur + 0.2);

      // kamon ostidagi ton — filtr sekin ochiladi
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(620, t);
      lp.frequency.linearRampToValueAtTime(2300, t + 0.55);

      const body = ctx.createBiquadFilter();
      body.type = 'peaking'; body.frequency.value = 540; body.gain.value = 5.5; body.Q.value = 1.1;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.38);            // sekin kamon
      g.gain.setValueAtTime(vel, t + Math.max(0.4, dur * 0.62));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      o.connect(lp); lp.connect(body); body.connect(g); g.connect(mix);
      o.start(t); o.stop(t + dur + 0.1);
    }

    function playBar(t, i) {
      const b = BARS[i];

      // pianino — bas
      piano(t,             b.bass,     0.30, 3.6);
      piano(t + BEAT * 2,  b.bass * 2, 0.15, 2.4);

      // pianino — arpedjio
      for (let k = 0; k < ARP.length; k++) {
        piano(t + k * (BEAT / 2), b.arp[ARP[k]],
              k === 0 ? 0.26 : 0.15 + Math.random() * 0.05, 2.2);
      }

      // skripka — melodiya
      let off = 0;
      for (const [f, beats] of b.mel) {
        violin(t + off * BEAT + 0.06, f, beats * BEAT - 0.18, 0.20);
        off += beats;
      }
      // ikkinchi skripka — past, uzun ton
      violin(t + 0.12, b.arp[1], BAR - 0.24, 0.07);
    }

    function scheduler() {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      while (barTime < now + 1.6) {
        playBar(barTime, barIx % BARS.length);
        barTime += BAR;
        barIx++;
      }
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
        if (!timer) {
          barTime = ctx.currentTime + 0.35;
          barIx = 0;
          scheduler();
          timer = setInterval(scheduler, 250);
        }
        fade(ducked ? 0.06 : VOL, 2.6);
      },
      stop() { on = false; fade(0, 1.1); },
      toggle() { on ? this.stop() : this.start(); return on; },
      isOn() { return on; },
      duck(v) { ducked = v; if (on) fade(v ? 0.05 : VOL, v ? 0.4 : 1.6); }
    };
  })();

  const soundBtn = $('#soundBtn');
  function syncSound() {
    soundBtn.classList.toggle('is-muted', !Music.isOn());
  }
  soundBtn.addEventListener('click', () => { Music.toggle(); syncSound(); });
  syncSound();


  /* ═════════════ 4. MUHR → YORUG'LIK → SAYT ═════════════ */

  const gate = $('#gate'), flash = $('#flash'), heroVideo = $('#heroVideo');
  let opened = false;

  // konvert atrofidagi oltin zarralar
  (function gateDust() {
    const box = $('#gateDust');
    let html = '';
    for (let i = 0; i < 26; i++) {
      const dur = 7 + Math.random() * 8;
      html += `<span style="left:${Math.random() * 100}%;bottom:-6px;
               animation-duration:${dur}s;animation-delay:${-Math.random() * dur}s;
               background:${['#f2cf7a', '#a865e0', '#35e0b0'][i % 3]};
               transform:scale(${0.6 + Math.random()})"></span>`;
    }
    box.innerHTML = html;
  })();

  function openSite() {
    if (opened) return;
    opened = true;

    Music.start();               // foydalanuvchi bosdi — audio ruxsat etilgan
    syncSound();

    gate.classList.add('is-cracking');                       // muhr yoriladi
    setTimeout(() => gate.classList.add('is-opening'),  470); // qopqoq ochiladi
    setTimeout(() => flash.classList.add('is-on'),      880); // kuchli nur

    setTimeout(() => {                                        // nur ichida sayt ochiladi
      gate.classList.add('is-gone');
      document.body.classList.remove('is-locked');
      playAll();
      window.scrollTo(0, 0);
    }, 1430);

    setTimeout(() => {
      flash.classList.remove('is-on');
      gate.style.display = 'none';
    }, 2700);
  }

  $('#seal').addEventListener('click', openSite);
  document.addEventListener('keydown', e => {
    if (!opened && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSite(); }
  });


  /* ═════════════ 5. VIDEOLAR — pauzada turmaydi ═════════════ */

  function tryPlay(v) {
    if (!v) return;
    v.muted = true;                 // avtomatik ishga tushishi uchun shart
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }
  function playAll() {
    tryPlay(heroVideo);
    $$('.clip video, .note video').forEach(tryPlay);
  }
  playAll();                                   // darvoza ochilmasdan ham urinib ko'ramiz
  document.addEventListener('visibilitychange', () => { if (!document.hidden) playAll(); });

  // hech qaysi video pauzada qolmasin: to'xtab qolsa — darhol qayta yoqamiz
  $$('.clip video, .note video, #heroVideo').forEach(v => {
    v.addEventListener('pause', () => { if (!document.hidden) tryPlay(v); });
    v.addEventListener('stalled', () => tryPlay(v));
    v.addEventListener('canplay', () => tryPlay(v));
  });
  setInterval(() => { if (!document.hidden) playAll(); }, 4000);


  /* ═════════════ 6. SKROLL: progress, nav, aktiv bo'lim ═════════════ */

  const bar = $('#progress').firstElementChild;
  const nav = $('#nav');
  const links = $$('.nav__list a');
  const secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    nav.classList.toggle('is-solid', y > 70);

    let cur = -1;
    secs.forEach((s, i) => { if (s.offsetTop - window.innerHeight * 0.35 <= y) cur = i; });
    links.forEach((a, i) => a.classList.toggle('is-active', i === cur));
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();


  /* ═════════════ 7. SKROLL ANIMATSIYALARI ═════════════ */

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], .frame').forEach(el => io.observe(el));

  function stagger(sel, step) {
    const items = $$(sel);
    const o = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.style.transitionDelay = ((items.indexOf(en.target) % 8) * step) + 'ms';
        en.target.classList.add('is-in');
        o.unobserve(en.target);
      });
    }, { threshold: 0.14 });
    items.forEach(el => o.observe(el));
  }
  stagger('.wish', 85);
  stagger('.clip', 130);


  /* ═════════════ 8. KURSOR NURI ═════════════ */

  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    const glow = $('#cursorGlow');
    let gx = 0, gy = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', e => { gx = e.clientX; gy = e.clientY; }, { passive: true });
    (function loop() {
      cx += (gx - cx) * 0.1; cy += (gy - cy) * 0.1;
      glow.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(loop);
    })();
  }


  /* ═════════════ 9. ZARRALAR (tillo · binafsha · zumrad) ═════════════ */

  if (!REDUCED) {
    const cv = $('#dust'), cx = cv.getContext('2d');
    const TONES = ['242,207,122', '168,101,224', '53,224,176'];
    let parts = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.floor(innerWidth * dpr);
      cv.height = Math.floor(innerHeight * dpr);
      cv.style.width = innerWidth + 'px';
      cv.style.height = innerHeight + 'px';
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = innerWidth < 640 ? 26 : innerWidth < 1100 ? 44 : 64;
      parts = Array.from({ length: n }, () => spawn(true));
    }
    function spawn(any) {
      const spark = Math.random() > 0.5;
      return {
        x: Math.random() * innerWidth,
        y: any ? Math.random() * innerHeight : innerHeight + 12,
        r: spark ? 0.7 + Math.random() * 1.5 : 1.6 + Math.random() * 2.6,
        vy: -(0.10 + Math.random() * 0.42),
        sway: 0.4 + Math.random() * 1.2,
        ph: Math.random() * 6.283,
        a: 0.16 + Math.random() * 0.42,
        spark,
        tone: TONES[Math.floor(Math.random() * TONES.length)]
      };
    }
    function tick() {
      cx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y += p.vy;
        p.ph += 0.013;
        const x = p.x + Math.sin(p.ph) * p.sway * 15;
        const tw = p.spark ? 0.4 + 0.6 * Math.abs(Math.sin(p.ph * 2.4)) : 1;
        cx.beginPath();
        cx.fillStyle = `rgba(${p.tone},${p.a * tw})`;
        cx.arc(x, p.y, p.r, 0, 6.283);
        cx.fill();
        if (p.y < -14) parts[i] = spawn(false);
      }
      requestAnimationFrame(tick);
    }
    resize();
    addEventListener('resize', resize, { passive: true });
    requestAnimationFrame(tick);
  }


  /* ═════════════ 10. LIGHTBOX ═════════════ */

  const lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbCount = $('#lbCount');
  let lbIx = 0;

  function lbShow(i) {
    lbIx = (i + FRAMES.length) % FRAMES.length;
    const fr = FRAMES[lbIx];
    lbImg.src = MEDIA + 'photos/' + fr.f;
    lbImg.alt = fr.k;
    lbCap.textContent = fr.w;
    lbCount.textContent = (lbIx + 1) + ' / ' + FRAMES.length;
  }
  function lbOpen(i) { lbShow(i); lb.classList.add('is-open'); document.body.classList.add('is-locked'); }
  function lbClose() {
    lb.classList.remove('is-open');
    if (!$('#vm').classList.contains('is-open')) document.body.classList.remove('is-locked');
  }

  $('#strip').addEventListener('click', e => {
    const m = e.target.closest('.frame__media');
    if (m) lbOpen(+m.dataset.i);
  });
  $('#lbClose').addEventListener('click', lbClose);
  $('#lbPrev').addEventListener('click', () => lbShow(lbIx - 1));
  $('#lbNext').addEventListener('click', () => lbShow(lbIx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });

  let tX = 0;
  lb.addEventListener('touchstart', e => { tX = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientX - tX;
    if (Math.abs(d) > 55) lbShow(lbIx + (d < 0 ? 1 : -1));
  }, { passive: true });


  /* ═════════════ 11. VIDEO MODAL (ovoz bilan) ═════════════ */

  const vm = $('#vm'), vmVideo = $('#vmVideo'), vmCap = $('#vmCap');
  const vmToggle = $('#vmToggle'), vmRing = $('#vmRing');
  const RING = 2 * Math.PI * 48.4;

  function vmOpen(name, title, round) {
    vmVideo.src = MEDIA + 'videos/' + name + '.mp4';
    vmVideo.poster = MEDIA + 'posters/' + name + '.jpg';
    vmVideo.muted = false;
    vmCap.textContent = title;
    // dumaloq video-xabarda nativ tugmalar aylanadan chiqib ketadi —
    // uning o'rniga halqali progress
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
    if (vmVideo.paused) vmVideo.play().catch(() => {}); else vmVideo.pause();
  }

  vmToggle.addEventListener('click', vmPlayPause);
  vmVideo.addEventListener('click', () => { if (vm.classList.contains('is-round')) vmPlayPause(); });
  vmVideo.addEventListener('play',  syncVmToggle);
  vmVideo.addEventListener('pause', syncVmToggle);
  vmVideo.addEventListener('ended', () => Music.duck(false));
  vmVideo.addEventListener('timeupdate', () => {
    const d = vmVideo.duration;
    if (!d || !isFinite(d)) return;
    vmRing.style.strokeDashoffset = RING * (1 - vmVideo.currentTime / d);
  });
  function syncVmToggle() {
    vm.classList.toggle('is-paused', vmVideo.paused);
    vmToggle.textContent = vmVideo.paused ? '▶' : '❚❚';
  }

  [$('#clips'), $('#notes')].forEach(root => {
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-v]');
      if (el) vmOpen(el.dataset.v, el.dataset.t, el.dataset.round);
    });
  });
  $('#vmClose').addEventListener('click', vmClose);
  vm.addEventListener('click', e => { if (e.target === vm) vmClose(); });


  /* ═════════════ 12. KLAVIATURA ═════════════ */

  document.addEventListener('keydown', e => {
    if (vm.classList.contains('is-open')) { if (e.key === 'Escape') vmClose(); return; }
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     lbClose();
    if (e.key === 'ArrowLeft')  lbShow(lbIx - 1);
    if (e.key === 'ArrowRight') lbShow(lbIx + 1);
  });


  /* ═════════════ 13. YULDUZ TUGMASI ═════════════ */

  const starBtn = $('#starBtn'), starCount = $('#starCount');
  const KEY = 'zinnura_stars';
  const GLYPHS = ['✦', '✧', '★', '❀', '✵', '❖'];
  const COLORS = ['#f2cf7a', '#a865e0', '#35e0b0', '#ffeab4'];
  let stars = 0;
  try { stars = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (_) {}
  starCount.textContent = stars;

  starBtn.addEventListener('click', () => {
    stars++;
    starCount.textContent = stars;
    try { localStorage.setItem(KEY, String(stars)); } catch (_) {}

    const r = starBtn.getBoundingClientRect();
    for (let i = 0; i < 11; i++) {
      const s = document.createElement('span');
      s.className = 'fly';
      s.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      s.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      s.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * r.width) + 'px';
      s.style.top  = (r.top + r.height / 2) + 'px';
      s.style.setProperty('--dx',  ((Math.random() - 0.5) * 260) + 'px');
      s.style.setProperty('--rot', ((Math.random() - 0.5) * 240) + 'deg');
      s.style.fontSize = (15 + Math.random() * 20) + 'px';
      s.style.animationDelay = (i * 42) + 'ms';
      s.style.opacity = 0.55 + Math.random() * 0.45;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 3000);
    }
  });


  /* ═════════════ 14. SILLIQ SKROLL + SAHIFA YASHIRINGANDA ═════════════ */

  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const el = $(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    });
  });

  document.addEventListener('visibilitychange', () => Music.duck(document.hidden));

  console.log('%c✦ ZINNURA — زِنُّورَة ✦', 'font-size:20px;color:#f2cf7a;font-family:Georgia,serif');
})();
