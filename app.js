/* =====================================================================
   IMORA AI — app.js
   - Web Audio ovoz dvigateli (fayl-siz, sintez qilingan effektlar)
   - Three.js jellyfish (peachweb uslubi) + AI robot mascot
   - Logo yig'ilish animatsiyasi (GSAP)
   - Matn split + scroll reveal (ovoz bilan)
   - Kun/Tun rejimi, footer: izoh/like/tashrif/ijtimoiy
   ===================================================================== */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const body = document.body;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =====================================================================
   1) OVOZ DVIGATELI (Web Audio API)
   ===================================================================== */
const SFX = (() => {
  let ctx = null, master = null, muted = false, unlocked = false;
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      unlocked = true;
    } catch (e) { ctx = null; }
  }
  const now = () => ctx.currentTime;
  function env(node, t, a, d, peak = 1) {
    const g = node.gain; g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(freq, { type = 'sine', a = 0.005, d = 0.12, gain = 0.25, glideTo = null, detune = 0 } = {}) {
    if (!ctx || muted) return;
    const t = now(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + a + d);
    env(g, t, a, d, gain); o.connect(g).connect(master); o.start(t); o.stop(t + a + d + 0.05);
  }
  function noise(dur = 0.4, { type = 'bandpass', f0 = 400, f1 = 2400, q = 0.8, gain = 0.18 } = {}) {
    if (!ctx || muted) return;
    const t = now(), n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.02, dur, gain);
    src.connect(flt).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  const api = {
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    set muted(v) { muted = v; if (master) master.gain.value = v ? 0 : 0.5; },
    pop(i = 0) { tone(220 + i * 26, { type: 'triangle', a: 0.004, d: 0.14, gain: 0.28, glideTo: 120 + i * 20 }); },
    blip(p = 0) { tone(520 + p, { type: 'sine', a: 0.003, d: 0.07, gain: 0.09 }); },
    tick() { tone(1300, { type: 'square', a: 0.002, d: 0.03, gain: 0.05 }); },
    click() { tone(300, { type: 'triangle', a: 0.003, d: 0.1, gain: 0.22, glideTo: 680 }); noise(0.12, { f0: 900, f1: 300, gain: 0.06 }); },
    whoosh() { noise(0.5, { f0: 300, f1: 3200, q: 0.7, gain: 0.14 }); },
    chime() {
      if (!ctx || muted) return; const base = [523.25, 659.25, 783.99, 1046.5];
      base.forEach((f, i) => setTimeout(() => tone(f, { type: 'sine', a: 0.01, d: 0.5, gain: 0.16 }), i * 70));
    },
    like() { tone(660, { type: 'triangle', a: 0.005, d: 0.18, gain: 0.24, glideTo: 990 }); },
    reveal() { noise(0.28, { f0: 500, f1: 2600, q: 0.9, gain: 0.07 }); tone(660, { type: 'sine', a: 0.006, d: 0.22, gain: 0.06 }); }
  };
  return api;
})();

/* HUD ovoz tugmasi */
const soundBtn = $('#soundBtn');
soundBtn.addEventListener('click', () => {
  SFX.muted = !SFX.muted;
  soundBtn.classList.toggle('is-on', !SFX.muted);
  if (!SFX.muted) SFX.click();
});

/* =====================================================================
   2) THREE.JS FON — jellyfish + AI robot
   ===================================================================== */
const Scene3D = (() => {
  const canvas = $('#bg-canvas');
  if (!window.THREE || !canvas) return { setTheme() {}, };
  let renderer, scene, camera, raf = 0, W = innerWidth, H = innerHeight;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const jellies = []; let robot = null; let scrollFade = 1;
  const clock = { t: 0 };

  const PALETTE = {
    day:   ['#8A78FF', '#3E86FF', '#25E7D8', '#B49BFF', '#6C5CE7'],
    night: ['#6C57D8', '#3A63D8', '#17B3A6', '#8E79E6', '#5A3FD6']
  };
  let palette = PALETTE.day;

  function glowTexture(color) {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), grd = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    grd.addColorStop(0, color); grd.addColorStop(0.25, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.globalAlpha = 1; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  function makeJelly(i) {
    const g = new THREE.Group();
    const col = new THREE.Color(palette[i % palette.length]);
    // bell (dome)
    const bellGeo = new THREE.SphereGeometry(1, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const bellMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    const bell = new THREE.Mesh(bellGeo, bellMat); g.add(bell);
    // inner brighter core
    const coreGeo = new THREE.SphereGeometry(0.62, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const coreMat = new THREE.MeshBasicMaterial({ color: col.clone().offsetHSL(0, 0, 0.18), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(coreGeo, coreMat); core.position.y = 0.06; g.add(core);
    // halo sprite
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffffff'), color: col, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(4.4, 4.4, 1); halo.position.y = 0.1; g.add(halo);
    // tentacles
    const tents = []; const N = 9, PTS = 14;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2, r0 = 0.7 + Math.random() * 0.2;
      const positions = new Float32Array(PTS * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: col.clone().offsetHSL(0, 0, 0.05), transparent: true, opacity: 0.34, depthWrite: false });
      const line = new THREE.Line(geo, mat); g.add(line);
      tents.push({ line, positions, ang, r0, len: 2.2 + Math.random() * 1.6, phase: Math.random() * 10 });
    }
    const scale = 0.55 + Math.random() * 0.7;
    g.scale.setScalar(scale);
    g.position.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 18, -2 - Math.random() * 12);
    scene.add(g);
    return { g, bell, core, halo, bellMat, coreMat, tents, speed: 0.25 + Math.random() * 0.4, sway: 0.4 + Math.random() * 0.7, phase: Math.random() * 10, baseScale: scale, col };
  }

  function makeRobot() {
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3f2ff, metalness: 0.35, roughness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2b1a52, metalness: 0.5, roughness: 0.3 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), bodyMat);
    head.scale.set(1.05, 0.92, 0.95); grp.add(head);
    // visor
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.86, 40, 24, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.34), accent);
    visor.position.set(0, 0.02, 0.16); grp.add(visor);
    // eyes (glow)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x35e7d8 });
    const eyeGeo = new THREE.SphereGeometry(0.12, 18, 18);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat), eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.3, 0.0, 0.82); eyeR.position.set(0.3, 0.0, 0.82); grp.add(eyeL, eyeR);
    const eyeGlowTex = glowTexture('#ffffff');
    [eyeL, eyeR].forEach(e => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeGlowTex, color: 0x35e7d8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(0.7, 0.7, 1); e.add(s); });
    // antenna
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), accent); ant.position.set(0, 0.95, 0); grp.add(ant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), new THREE.MeshBasicMaterial({ color: 0x3e86ff })); bulb.position.set(0, 1.24, 0); grp.add(bulb);
    const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeGlowTex, color: 0x3e86ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); bulbGlow.scale.set(1.1, 1.1, 1); bulb.add(bulbGlow);
    // ears
    const earGeo = new THREE.SphereGeometry(0.18, 18, 18);
    const earL = new THREE.Mesh(earGeo, accent), earR = new THREE.Mesh(earGeo, accent);
    earL.position.set(-1.02, 0, 0); earR.position.set(1.02, 0, 0); grp.add(earL, earR);
    // little body
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.7, 30, 24), bodyMat); torso.scale.set(1, 0.7, 0.8); torso.position.y = -1.35; grp.add(torso);

    grp.position.set(4.4, 1.4, -0.5); grp.scale.setScalar(1.15);
    scene.add(grp);
    return { grp, eyeL, eyeR, bulb, bulbGlow, blink: 0, nextBlink: 2 + Math.random() * 3 };
  }

  function build() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 100); camera.position.set(0, 0, 15);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a4a, 1.35));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(3, 5, 6); scene.add(d);
    const fill = new THREE.DirectionalLight(0x8fb6ff, 0.7); fill.position.set(-4, 1, 4); scene.add(fill);
    const count = W < 700 ? 4 : (W < 1100 ? 6 : 8);
    for (let i = 0; i < count; i++) jellies.push(makeJelly(i));
    robot = makeRobot();
    if (W < 760) robot.grp.visible = false;
    return true;
  }

  function updateTentacles(j, t) {
    for (const tt of j.tents) {
      const p = tt.positions; const bx = Math.cos(tt.ang) * tt.r0, bz = Math.sin(tt.ang) * tt.r0;
      for (let i = 0; i < p.length / 3; i++) {
        const f = i / (p.length / 3 - 1);
        const sway = Math.sin(t * 1.6 + tt.phase + f * 4) * 0.28 * f;
        const sway2 = Math.cos(t * 1.1 + tt.phase + f * 3) * 0.28 * f;
        p[i*3]   = bx + sway;
        p[i*3+1] = -f * tt.len;
        p[i*3+2] = bz + sway2;
      }
      tt.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = (clock.t += 0.016);
    mouse.tx += (mouse.x - mouse.tx) * 0.05; mouse.ty += (mouse.y - mouse.ty) * 0.05;
    camera.position.x = mouse.tx * 2.2; camera.position.y = mouse.ty * 1.4; camera.lookAt(0, 0, 0);

    for (const j of jellies) {
      j.g.position.y += 0.006 * j.speed * 3;
      j.g.position.x += Math.sin(t * 0.5 + j.phase) * 0.004 * j.sway;
      if (j.g.position.y > 12) { j.g.position.y = -12; j.g.position.x = (Math.random() - 0.5) * 22; }
      const pulse = 1 + Math.sin(t * 1.4 + j.phase) * 0.08;
      j.bell.scale.set(pulse, 1 / pulse * 1.02, pulse);
      j.g.rotation.y += 0.0016;
      updateTentacles(j, t + j.phase);
    }

    if (robot && robot.grp.visible) {
      const r = robot.grp;
      r.position.y = 1.4 + Math.sin(t * 0.8) * 0.22;
      r.rotation.y += ((mouse.tx * 0.5) - r.rotation.y) * 0.06;
      r.rotation.x += ((-mouse.ty * 0.35) - r.rotation.x) * 0.06;
      robot.grp.traverse(() => {});
      // blink
      robot.blink += 0.016;
      if (robot.blink > robot.nextBlink) {
        const b = Math.max(0, 1 - Math.abs(robot.blink - robot.nextBlink - 0.09) * 20);
        robot.eyeL.scale.y = robot.eyeR.scale.y = 1 - b;
        if (robot.blink > robot.nextBlink + 0.18) { robot.blink = 0; robot.nextBlink = 2 + Math.random() * 3.5; robot.eyeL.scale.y = robot.eyeR.scale.y = 1; }
      }
      const bp = 0.7 + Math.abs(Math.sin(t * 2)) * 0.4;
      robot.bulbGlow.material.opacity = bp;
      r.scale.setScalar(1.15 * scrollFade);
      r.visible = scrollFade > 0.04;
      r.position.x = 4.4 + (1 - scrollFade) * 2;
    }
    renderer.render(scene, camera);
  }

  function onResize() { W = innerWidth; H = innerHeight; if (!renderer) return; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); if (robot) robot.grp.visible = W >= 760; }
  addEventListener('resize', onResize);
  addEventListener('mousemove', e => { mouse.x = (e.clientX / W) * 2 - 1; mouse.y = -((e.clientY / H) * 2 - 1); });
  addEventListener('scroll', () => { scrollFade = Math.max(0, 1 - scrollY / (innerHeight * 0.8)); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else frame(); });

  const ok = build();
  if (ok && !reduce) frame(); else if (ok) renderer.render(scene, camera);

  return {
    setTheme(theme) {
      palette = PALETTE[theme] || PALETTE.day;
      jellies.forEach((j, i) => {
        const col = new THREE.Color(palette[i % palette.length]);
        j.col.copy(col);
        j.bellMat.color.copy(col); j.bellMat.opacity = theme === 'night' ? 0.5 : 0.42;
        j.coreMat.color.copy(col.clone().offsetHSL(0, 0, 0.18));
        j.halo.material.color.copy(col); j.halo.material.opacity = theme === 'night' ? 0.22 : 0.28;
        j.tents.forEach(tt => tt.line.material.color.copy(col.clone().offsetHSL(0, 0, 0.05)));
      });
    }
  };
})();

/* =====================================================================
   3) MATN SPLIT
   ===================================================================== */
function splitWords(el) {
  if (el.dataset.done) return $$('.split-word', el);
  const txt = el.textContent; el.textContent = '';
  const frag = document.createDocumentFragment();
  txt.split(/(\s+)/).forEach(part => {
    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); }
    else if (part.length) { const s = document.createElement('span'); s.className = 'split-word'; s.textContent = part; frag.appendChild(s); }
  });
  el.appendChild(frag); el.dataset.done = '1';
  return $$('.split-word', el);
}
function splitUnits(el) {
  if (el.dataset.done) return $$('.split-unit', el);
  const units = [];
  [...el.childNodes].forEach(node => {
    if (node.nodeType === 3) {
      const words = node.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      words.forEach(w => {
        if (/^\s+$/.test(w)) frag.appendChild(document.createTextNode(w));
        else if (w.length) { const s = document.createElement('span'); s.className = 'split-unit'; s.textContent = w; frag.appendChild(s); units.push(s); }
      });
      el.replaceChild(frag, node);
    } else if (node.nodeType === 1) {
      node.classList.add('split-unit'); units.push(node);
    }
  });
  el.dataset.done = '1';
  return units;
}

/* =====================================================================
   4) GSAP animatsiyalari
   ===================================================================== */
function initAnimations() {
  if (!window.gsap) { body.classList.add('no-anim'); return; }
  const gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  // Hero sarlavha — kirishda
  const heroUnits = [];
  $$('#hero [data-split]').forEach(el => heroUnits.push(...splitUnits(el)));
  const heroWords = [];
  $$('#hero [data-split-words]').forEach(el => heroWords.push(...splitWords(el)));
  gsap.set([...heroUnits, ...heroWords], { yPercent: 115, opacity: 0 });
  gsap.set('.hero-tag, .hero-actions, .hero-scroll', { opacity: 0, y: 20 });

  window.__heroIntro = () => {
    const tl = gsap.timeline();
    tl.to('.hero-tag', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', onStart: () => SFX.whoosh() })
      .to(heroUnits, { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.06, ease: 'power4.out',
        onStart: () => staggerSound(heroUnits.length) }, '-=0.2')
      .to(heroWords, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.012, ease: 'power3.out' }, '-=0.5')
      .to('.hero-actions', { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
      .to('.hero-scroll', { opacity: 1, y: 0, duration: 0.6 }, '-=0.3');
  };

  // Scroll reveal — sarlavhalar (units) va matnlar (words) va kartalar
  if (window.ScrollTrigger) {
    $$('.section:not(#hero) [data-split]').forEach(el => {
      const units = splitUnits(el);
      gsap.set(units, { yPercent: 110, opacity: 0 });
      window.ScrollTrigger.create({ trigger: el, start: 'top 82%', once: true, onEnter: () => {
        SFX.reveal();
        gsap.to(units, { yPercent: 0, opacity: 1, duration: 0.85, stagger: 0.05, ease: 'power4.out', onStart: () => staggerSound(units.length) });
      }});
    });
    $$('[data-split-words]').forEach(el => {
      if (el.closest('#hero')) return;
      const words = splitWords(el);
      gsap.set(words, { opacity: 0, y: 14 });
      window.ScrollTrigger.create({ trigger: el, start: 'top 86%', once: true, onEnter: () => {
        gsap.to(words, { opacity: 1, y: 0, duration: 0.5, stagger: 0.02, ease: 'power2.out' });
      }});
    });
    $$('[data-reveal]').forEach((el, i) => {
      window.ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => {
        SFX.reveal();
        gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
      }});
    });
  } else {
    body.classList.add('no-anim');
  }
}
// stagger paytida bir nechta yumshoq blip (throttle bilan)
function staggerSound(n) {
  const k = Math.min(n, 7);
  for (let i = 0; i < k; i++) setTimeout(() => SFX.blip(i * 40), i * 55);
}

/* =====================================================================
   5) PRELOADER — logo yig'ilishi
   ===================================================================== */
function runPreloader() {
  const pre = $('#preloader'), gate = $('#start-gate'), stage = $('#logo-stage');
  const startBtn = $('#startBtn'), skipBtn = $('#skipBtn');
  const parts = $$('#imora-logo .part');
  // yig'ilish tartibi (12 qadamga yaqin)
  const order = ['glow','base','frameL','frameR','hlL','hlR','handBottom','handTop'];
  const sorted = order.map(p => $(`#imora-logo .part[data-part="${p}"]`)).filter(Boolean);

  function openSite() {
    if (body.dataset.opened) return; body.dataset.opened = '1';
    body.classList.remove('pre-lock'); body.classList.add('ready');
    pre.classList.add('gone');
    setTimeout(() => pre.remove(), 850);
    if (window.__heroIntro) window.__heroIntro();
    if (window.ScrollTrigger) setTimeout(() => window.ScrollTrigger.refresh(), 100);
  }

  function assemble() {
    gate.hidden = true; stage.hidden = false;
    if (!window.gsap || reduce) { // animatsiyasiz
      gsap && gsap.set(parts, { opacity: 1 });
      $('#logoWord').style.opacity = 1; SFX.chime();
      setTimeout(openSite, 900); return;
    }
    const gsap = window.gsap;
    const dirs = [{x:0,y:0,s:0},{x:0,y:60,s:.3},{x:-120,y:20,s:.4},{x:120,y:20,s:.4},{x:-40,y:-60,s:.5},{x:40,y:-60,s:.5},{x:-70,y:90,s:.3},{x:90,y:-30,s:.3}];
    sorted.forEach((p, i) => gsap.set(p, { opacity: 0, xPercent: dirs[i]?.x||0, yPercent: dirs[i]?.y||0, scale: dirs[i]?.s ?? 0.3, rotate: (i%2?12:-12) }));
    gsap.set('#imora-logo', { scale: 0.9, opacity: 1 });
    const tl = gsap.timeline({ onComplete: () => setTimeout(openSite, 700) });
    sorted.forEach((p, i) => {
      tl.to(p, { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2)',
        onStart: () => SFX.pop(i) }, i * 0.16);
    });
    // yig'ilgach — nur pulsi + chime ("logo tili")
    tl.to('#imora-logo', { scale: 1.06, duration: 0.35, ease: 'power2.out', onStart: () => SFX.chime() }, '+=0.05')
      .to('.part[data-part="glow"]', { opacity: 0.9, scale: 1.3, duration: 0.5, ease: 'sine.out' }, '<')
      .to('#imora-logo', { scale: 1, duration: 0.4, ease: 'power2.inOut' })
      .to('.part[data-part="glow"]', { opacity: 0.35, scale: 1, duration: 0.5 }, '<');
    // wordmark — harfma-harf
    const word = $('#logoWord'); const chars = [];
    ['lw-a','lw-b'].forEach(c => { const sp = $('.'+c, word); const t = sp.textContent; sp.textContent=''; [...t].forEach(ch=>{const s=document.createElement('span');s.textContent=ch;s.style.display='inline-block';s.style.opacity=0;sp.appendChild(s);chars.push(s);});});
    tl.set(word, { opacity: 1 })
      .to(chars, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', onStart: () => staggerSound(chars.length),
        startAt: { y: 18 } }, '-=0.2')
      .to(skipBtn, { opacity: 1, duration: 0.4 }, '-=0.3');
  }

  startBtn.addEventListener('click', () => { SFX.unlock(); SFX.click(); assemble(); });
  skipBtn.addEventListener('click', () => { SFX.click(); openSite(); });
  // failsafe: 12s dan keyin baribir ochamiz
  setTimeout(() => { if (!body.dataset.opened) openSite(); }, 14000);
}

/* =====================================================================
   6) REJIM / NAV / footer
   ===================================================================== */
function setTheme(theme) {
  html.setAttribute('data-mode', theme); body.setAttribute('data-mode', theme);
  Scene3D.setTheme(theme);
  try { localStorage.setItem('imora-theme', theme); } catch (e) {}
}
$('#themeBtn').addEventListener('click', () => {
  const next = (html.getAttribute('data-mode') === 'day') ? 'night' : 'day';
  setTheme(next); SFX.click();
});

// til (stub — to'liq i18n backend bosqichida)
const LANGS = ['UZ','RU','EN']; let li = 0;
$('#langBtn').addEventListener('click', () => {
  li = (li + 1) % LANGS.length; $('#langBtn .lang-code').textContent = LANGS[li]; SFX.tick();
  toast(`Til: ${LANGS[li]} — to'liq tarjima keyingi bosqichda ulanadi`);
});
function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id='toast'; document.body.appendChild(t);
    Object.assign(t.style,{position:'fixed',bottom:'22px',left:'50%',transform:'translateX(-50%) translateY(20px)',zIndex:80,padding:'12px 20px',borderRadius:'100px',background:'var(--glass-bg)',border:'1px solid var(--glass-brd)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',color:'var(--text)',fontSize:'13px',opacity:'0',transition:'.4s',pointerEvents:'none'}); }
  t.textContent = msg; requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';});
  clearTimeout(t._h); t._h = setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(20px)';}, 2600);
}

// nav scroll + burger + hover ovozlari
addEventListener('scroll', () => { $('#nav').classList.toggle('scrolled', scrollY > 40); }, { passive: true });
$('#burger').addEventListener('click', () => { $('#nav').classList.toggle('open'); SFX.tick(); });
$$('.nav-links a').forEach(a => a.addEventListener('click', () => $('#nav').classList.remove('open')));
$$('a[href^="#"]').forEach(a => a.addEventListener('mouseenter', () => SFX.tick()));
$$('.card, .tech-chip, .social, .btn, .hud-btn, .road-step').forEach(el => el.addEventListener('mouseenter', () => SFX.tick()));
$$('[data-sfx="click"], .start-btn').forEach(el => el.addEventListener('click', () => SFX.click()));

// karta tilt (parallax)
$$('.tilt').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `translateY(-6px) rotateX(${-y*6}deg) rotateY(${x*6}deg)`;
  });
  card.addEventListener('mouseleave', () => card.style.transform = '');
});

/* ---- FOOTER: tashrif / like / izoh / ijtimoiy ---- */
function countUp(el, to, dur = 1200) {
  const start = performance.now();
  function step(t) { const p = Math.min(1, (t - start) / dur); el.textContent = Math.floor(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function initFooter() {
  // tashriflar (localStorage + baza son) — backend bosqichida real hisoblagich
  let base = 1240;
  try { const seen = localStorage.getItem('imora-visits'); base = seen ? +seen : base + Math.floor(Math.random()*40); if(!seen){} localStorage.setItem('imora-visits', base + 1); base += 1; } catch(e) {}
  const vc = $('#visitCount'); if (window.ScrollTrigger) window.ScrollTrigger.create({ trigger: '#footer', start: 'top 90%', once: true, onEnter: () => countUp(vc, base) }); else countUp(vc, base);

  // like
  const likeBtn = $('#likeBtn'), likeCount = $('#likeCount'); let likes = 348, liked = false;
  try { likes = +(localStorage.getItem('imora-likes')||likes); liked = localStorage.getItem('imora-liked')==='1'; } catch(e){}
  likeCount.textContent = likes; if (liked) likeBtn.classList.add('liked');
  likeBtn.addEventListener('click', () => {
    liked = !liked; likes += liked ? 1 : -1; likeBtn.classList.toggle('liked', liked);
    likeCount.textContent = likes; SFX.like();
    try { localStorage.setItem('imora-likes', likes); localStorage.setItem('imora-liked', liked?'1':'0'); } catch(e){}
  });

  // izohlar (localStorage — backend bosqichida serverga ko'chiriladi)
  const list = $('#commentList'), form = $('#commentForm');
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let comments = [];
  try { comments = JSON.parse(localStorage.getItem('imora-comments')||'[]'); } catch(e){}
  if (!comments.length) comments = [
    { n: 'Dilnoza', t: 'Ajoyib g\'oya! Ishora tilini o\'rganish endi ancha oson bo\'ladi 🙌' },
    { n: 'Sardor', t: '3D avatar qismi juda zo\'r — kutamiz!' }
  ];
  function render() { list.innerHTML = comments.slice().reverse().map(c => `<li><span class="cn">${esc(c.n)}</span>${esc(c.t)}</li>`).join(''); }
  render();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const n = $('#commentName').value.trim() || 'Mehmon', t = $('#commentText').value.trim();
    if (!t) return; comments.push({ n, t }); render(); SFX.chime();
    $('#commentText').value = '';
    try { localStorage.setItem('imora-comments', JSON.stringify(comments.slice(-50))); } catch(e){}
  });

  // ijtimoiy ikonkalar (nurli — brend rangida)
  const socials = [
    { n:'Instagram', c:'#E1306C', u:'#', p:'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .4 1.4.9.5.4.7.8.9 1.4.1.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.4 1-.9 1.4-.4.5-.8.7-1.4.9-.4.1-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.4-1.4-.9-.5-.4-.7-.8-.9-1.4-.1-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.4-1 .9-1.4.4-.5.8-.7 1.4-.9.4-.1 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.2a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z' },
    { n:'Telegram', c:'#2AABEE', u:'#', p:'M21.9 4.3l-3.1 14.8c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.5 12.9l-4.6-1.4c-1-.3-1-1 .2-1.5l18-6.9c.8-.3 1.6.2 1.3 1.2z' },
    { n:'GitHub', c:'#8b93a7', u:'#', p:'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .8.1-.6.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7 0-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .3.3.6.9.6 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z' },
    { n:'YouTube', c:'#FF0000', u:'#', p:'M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7c.4-1.5.4-4.7.4-4.7zM9.8 15.3V8.7l6.2 3.3z' },
    { n:'Email', c:'#25E7D8', u:'#', p:'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.5L20 7H4zM4 9v8h16V9l-8 5z' }
  ];
  const row = $('#socialRow');
  row.innerHTML = socials.map(s => `<a class="social" href="${s.u}" title="${s.n}" aria-label="${s.n}" style="--sglow:${s.c}"><svg viewBox="0 0 24 24"><path d="${s.p}"/></svg></a>`).join('');
  $$('.social', row).forEach(a => a.addEventListener('click', e => { if (a.getAttribute('href')==='#') e.preventDefault(); SFX.click(); }));
}

/* brand-mark kichik logo (nav/footer) — kompakt yurak */
function injectBrandMarks() {
  const mk = (id) => `<defs><linearGradient id="bl${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3E86FF"/><stop offset="1" stop-color="#123FC7"/></linearGradient><linearGradient id="br${id}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25E7D8"/><stop offset="1" stop-color="#12A6C8"/></linearGradient><clipPath id="cl${id}"><rect x="0" y="0" width="130" height="250"/></clipPath><clipPath id="cr${id}"><rect x="130" y="0" width="130" height="250"/></clipPath></defs>
    <path clip-path="url(#cl${id})" fill="url(#bl${id})" d="M130 226 C 44 168 20 108 34 68 C 46 32 92 28 116 52 C 124 60 128 66 130 72 L 130 214 C 60 168 40 116 52 82 C 61 56 92 52 110 70 C 119 79 125 90 130 100 Z"/>
    <path clip-path="url(#cr${id})" fill="url(#br${id})" d="M130 226 C 216 168 240 108 226 68 C 214 32 168 28 144 52 C 136 60 132 66 130 72 L 130 214 C 200 168 220 116 208 82 C 199 56 168 52 150 70 C 141 79 135 90 130 100 Z"/>
    <path fill="#fff" opacity=".95" d="M74 150 C 82 138 100 133 116 138 C 122 140 126 143 126 147 C 126 150 123 152 119 151 L 150 128 C 156 128 160 131 160 135 C 160 139 157 141 152 141 L 132 143 C 120 150 96 156 84 156 C 78 156 74 154 74 150 Z"/>`;
  $$('.brand-mark').forEach((svg, i) => { svg.innerHTML = mk('m'+i); });
}

/* =====================================================================
   BOSHLASH
   ===================================================================== */
function boot() {
  try {
    try { if (localStorage.getItem('imora-theme') === 'night') setTheme('night'); } catch (e) {}
    injectBrandMarks();
    initAnimations();
    initFooter();
    runPreloader();
  } catch (e) {
    console.error('Imora init xato:', e);
    body.classList.remove('pre-lock'); body.classList.add('ready','no-anim');
    const pre = $('#preloader'); if (pre) pre.remove();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
