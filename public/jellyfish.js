/* =====================================================================
   Qo'qon Universiteti — Scroll-animatsiyali "meduza" foni
   ---------------------------------------------------------------------
   • Bog'liqliksiz (vanilla JS), o'z-o'zicha ishlaydi. Canvas 2D.
   • peachweb.io uslubidagi bioluminessent meduza: qorong'i "okean"
     fonida suzadi, sahifani scroll qilganda pastga/yuqoriga harakatlanadi,
     puls uradi (suzish), sichqoncha ortidan yumshoq egiladi.

   ULASH (index.html ichida, </body> dan oldin):
       <script src="/jellyfish.js"></script>

   SOZLASH (skriptdan OLDIN qo'ying, ixtiyoriy):
       <script>
         window.JELLYFISH_CONFIG = {
           zIndex: -1,        // kontent tepada turishi uchun manfiy
           background: true,  // to'q "okean" gradient fon chizilsin
           quality: 1         // 0.7..1 — pastroq = tezroq (kuchsiz qurilmalar)
         };
       </script>

   ESLATMA: meduza ko'rinishi uchun sahifa/bo'lim fonlari SHAFFOF bo'lsin
   (masalan `body{background:transparent}`), aks holda canvas berkitiladi.
   ===================================================================== */
(function () {
  'use strict';

  var CFG = Object.assign({
    zIndex: -1,
    background: true,
    mount: null,
    quality: 1
  }, window.JELLYFISH_CONFIG || {});

  // ---------- Canvas ----------
  var canvas = document.createElement('canvas');
  canvas.id = 'jellyfish-bg';
  canvas.setAttribute('aria-hidden', 'true');
  var st = canvas.style;
  st.position = 'fixed'; st.top = '0'; st.left = '0';
  st.width = '100%'; st.height = '100%';
  st.zIndex = String(CFG.zIndex);
  st.pointerEvents = 'none';
  st.display = 'block';

  var ctx = canvas.getContext('2d');
  if (!ctx) return; // brauzer qo'llab-quvvatlamasa — jimgina chiqamiz

  var mounted = false;
  function mount() {
    if (mounted) return;
    (CFG.mount || document.body).appendChild(canvas);
    mounted = true;
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // ---------- O'lcham ----------
  var W = 0, H = 0, DPR = 1, MIN = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2) * CFG.quality;
    W = window.innerWidth; H = window.innerHeight; MIN = Math.min(W, H);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Scroll holati ----------
  function winScroll() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  var scrollTarget = winScroll();
  var scrollSmooth = scrollTarget;
  var prevTarget = scrollTarget;
  var scrollVel = 0;
  window.addEventListener('scroll', function () { scrollTarget = winScroll(); }, { passive: true });

  // ---------- Sichqoncha (yumshoq parallaks) ----------
  var tmx = 0, tmy = 0, mx = 0, my = 0;
  window.addEventListener('mousemove', function (e) {
    tmx = (e.clientX / W - 0.5) * 2;
    tmy = (e.clientY / H - 0.5) * 2;
  }, { passive: true });

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---------- Meduzalar (uzoq/yaqin — chuqurlik va parallaks) ----------
  var JELLIES = [
    { size: 0.165, x: 0.50, y: 0.32, travel: 0.44, hue: 188, alpha: 1.00, tent: 18, arms: 5, sway: 24, swayS: 0.00022, pulse: 1.00, seed: 0.0 },
    { size: 0.090, x: 0.19, y: 0.26, travel: 0.70, hue: 205, alpha: 0.50, tent: 12, arms: 4, sway: 46, swayS: 0.00015, pulse: 0.85, seed: 2.1 },
    { size: 0.120, x: 0.81, y: 0.20, travel: 0.56, hue: 276, alpha: 0.56, tent: 13, arms: 4, sway: 38, swayS: 0.00019, pulse: 0.92, seed: 4.4 }
  ];
  var phase = JELLIES.map(function () { return Math.random() * 6.28; });

  // ---------- Plankton zarralari ----------
  var parts = [];
  function initParts() {
    parts.length = 0;
    var n = Math.max(30, Math.round((W * H) / 26000));
    for (var i = 0; i < n; i++) {
      parts.push({
        x: Math.random(), y: Math.random(),
        z: 0.3 + Math.random() * 0.7,
        r: 0.5 + Math.random() * 1.8,
        tw: Math.random() * Math.PI * 2,
        sp: 0.2 + Math.random() * 0.6
      });
    }
  }
  initParts();
  window.addEventListener('resize', initParts);

  function hsla(h, s, l, a) { return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')'; }

  // ================= Chizish =================
  var now = 0, last = 0, dt = 16;

  function drawBackground() {
    if (!CFG.background) { ctx.clearRect(0, 0, W, H); return; }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04122a');
    g.addColorStop(0.45, '#061024');
    g.addColorStop(1, '#01030b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // yumshoq yorug'lik nurlari
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var rx = W * (0.22 + 0.28 * i) + Math.sin(now * 0.0001 + i) * 60;
      var rg = ctx.createLinearGradient(rx, 0, rx + 140, H);
      rg.addColorStop(0, 'hsla(200,90%,60%,0.045)');
      rg.addColorStop(1, 'hsla(200,90%,60%,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx - 60, 0); ctx.lineTo(rx + 70, 0);
      ctx.lineTo(rx + 280, H); ctx.lineTo(rx + 80, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // vinetka (chekkalar to'qroq)
    var v = ctx.createRadialGradient(W / 2, H * 0.42, MIN * 0.2, W / 2, H * 0.5, MIN * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var par = scrollSmooth * 0.05;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.y -= p.sp * 0.00016 * (reduce ? 0.3 : 1);
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      var x = p.x * W + Math.sin(now * 0.0003 + p.tw) * 10 * p.z;
      var y = ((p.y * H) + par * p.z) % (H + 40);
      if (y < 0) y += (H + 40);
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now * 0.002 * p.sp + p.tw));
      ctx.fillStyle = hsla(190, 90, 82, 0.5 * p.z * tw);
      ctx.beginPath();
      ctx.arc(x, y, p.r * p.z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTentacles(j, R, sx, contract) {
    var n = j.tent, rim = R * sx;
    for (var k = 0; k < n; k++) {
      var f = n === 1 ? 0.5 : k / (n - 1);
      var x0 = -rim + 2 * rim * f;
      var y0 = R * 0.02 + Math.sin(f * Math.PI) * R * 0.06;
      var L = R * (2.6 + 1.8 * Math.sin(f * Math.PI)) * (1 + contract * 0.15);
      var segs = 20;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (var sI = 1; sI <= segs; sI++) {
        var p = sI / segs;
        var yy = y0 + p * L;
        var amp = R * 0.22 * p;
        var wob = Math.sin(now * 0.003 + p * 6.5 - k * 0.7 + j.seed) * amp
                + Math.sin(now * 0.0012 + k) * R * 0.05 * p;
        var xx = x0 + wob + x0 * 0.04 * p;
        ctx.lineTo(xx, yy);
      }
      var tg = ctx.createLinearGradient(0, y0, 0, y0 + L);
      tg.addColorStop(0, hsla(j.hue, 90, 82, 0.5));
      tg.addColorStop(0.5, hsla(j.hue + 15, 85, 68, 0.28));
      tg.addColorStop(1, hsla(j.hue + 30, 85, 60, 0));
      ctx.strokeStyle = tg;
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  function drawArms(j, R, contract) {
    var n = j.arms;
    for (var k = 0; k < n; k++) {
      var f = n === 1 ? 0 : (k / (n - 1) - 0.5);
      var x0 = f * R * 0.7;
      var L = R * (2.0 + 0.5 * Math.cos(f * 3.0)) * (1 + contract * 0.1);
      var width = R * 0.16 * (1 - Math.abs(f) * 0.3);
      var segs = 16, left = [], right = [];
      for (var sI = 0; sI <= segs; sI++) {
        var p = sI / segs;
        var yy = p * L + R * 0.05;
        var wob = Math.sin(now * 0.0026 + p * 5 + k * 1.3 + j.seed) * width * 1.6 * p;
        var cxp = x0 + wob;
        var w = width * (1 - p * 0.75) * (1 + 0.45 * Math.sin(p * 15 + now * 0.006 + k));
        if (w < 0.4) w = 0.4;
        left.push([cxp - w, yy]);
        right.push([cxp + w, yy]);
      }
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (var a = 1; a < left.length; a++) ctx.lineTo(left[a][0], left[a][1]);
      for (var b = right.length - 1; b >= 0; b--) ctx.lineTo(right[b][0], right[b][1]);
      ctx.closePath();
      var ag = ctx.createLinearGradient(0, 0, 0, L);
      ag.addColorStop(0, hsla(j.hue + 55, 85, 78, 0.42));
      ag.addColorStop(0.6, hsla(j.hue + 45, 85, 65, 0.2));
      ag.addColorStop(1, hsla(j.hue + 40, 85, 60, 0));
      ctx.fillStyle = ag;
      ctx.fill();
    }
  }

  function drawBell(j, R, sx, sy) {
    ctx.save();
    ctx.scale(sx, sy);
    var Hb = R * 1.12;

    // tana
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.bezierCurveTo(-R * 1.06, -Hb * 0.72, -R * 0.55, -Hb, 0, -Hb);
    ctx.bezierCurveTo(R * 0.55, -Hb, R * 1.06, -Hb * 0.72, R, 0);
    var lobes = 7;
    for (var i = 1; i <= lobes; i++) {
      var xa = R - (2 * R) * ((i - 1) / lobes);
      var xb = R - (2 * R) * (i / lobes);
      var midx = (xa + xb) / 2;
      var dip = R * (0.10 + 0.05 * Math.sin(now * 0.004 + i + j.seed));
      ctx.quadraticCurveTo(midx, dip, xb, 0);
    }
    ctx.closePath();

    var bg = ctx.createRadialGradient(0, -Hb * 0.45, R * 0.1, 0, -Hb * 0.25, R * 1.25);
    bg.addColorStop(0, hsla(j.hue, 95, 95, 0.92));
    bg.addColorStop(0.32, hsla(j.hue, 88, 74, 0.5));
    bg.addColorStop(0.70, hsla(j.hue + 22, 82, 58, 0.28));
    bg.addColorStop(1, hsla(j.hue + 40, 80, 52, 0.05));
    ctx.fillStyle = bg;
    ctx.fill();

    // ichki qovurg'alar
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hsla(j.hue, 90, 85, 0.16);
    ctx.lineWidth = Math.max(1, R * 0.01);
    for (var r = 0; r < 4; r++) {
      var rr = R * (0.28 + r * 0.2);
      ctx.beginPath();
      ctx.moveTo(-rr, 0);
      ctx.bezierCurveTo(-rr, -Hb * 0.7, -rr * 0.5, -Hb * 0.92, 0, -Hb * 0.92);
      ctx.bezierCurveTo(rr * 0.5, -Hb * 0.92, rr, -Hb * 0.7, rr, 0);
      ctx.stroke();
    }
    ctx.restore();

    // yuqori jilo + yorug' yadro
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, -Hb * 0.05);
    ctx.bezierCurveTo(-R * 0.95, -Hb * 0.7, -R * 0.5, -Hb * 0.98, 0, -Hb * 0.98);
    ctx.bezierCurveTo(R * 0.5, -Hb * 0.98, R * 0.95, -Hb * 0.7, R * 0.9, -Hb * 0.05);
    ctx.strokeStyle = hsla(j.hue, 95, 92, 0.5);
    ctx.lineWidth = Math.max(1, R * 0.02);
    ctx.lineCap = 'round';
    ctx.stroke();

    var core = ctx.createRadialGradient(0, -Hb * 0.4, 0, 0, -Hb * 0.4, R * 0.55);
    core.addColorStop(0, hsla(j.hue, 95, 96, 0.5));
    core.addColorStop(1, hsla(j.hue, 95, 90, 0));
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, -Hb * 0.4, R * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawJelly(j, idx, docProg) {
    var R = MIN * j.size;
    var sway = Math.sin(now * j.swayS + j.seed) * j.sway;
    var depthK = 1.1 - j.travel; // uzoqroq meduza — sekinroq parallaks
    var cx = W * j.x + sway + mx * 26 * depthK;
    var cy = H * (j.y + docProg * j.travel) + my * 18 * depthK;

    var pSpeed = 0.0017 * j.pulse * (reduce ? 0.4 : 1) * (1 + Math.min(scrollVel * 0.02, 1.6));
    phase[idx] += pSpeed * dt;
    var contract = 0.5 + 0.5 * Math.sin(phase[idx]);
    var sx = 1 + 0.14 * contract;
    var sy = 1 - 0.16 * contract;
    var jet = -contract * R * 0.10;

    ctx.save();
    ctx.translate(cx, cy + jet);
    ctx.globalAlpha = j.alpha;

    // halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(0, -R * 0.3, R * 0.2, 0, -R * 0.2, R * 3.2);
    halo.addColorStop(0, hsla(j.hue, 90, 62, 0.22));
    halo.addColorStop(0.5, hsla(j.hue + 20, 85, 55, 0.06));
    halo.addColorStop(1, hsla(j.hue + 30, 85, 50, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, -R * 0.2, R * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    drawTentacles(j, R, sx, contract);
    drawArms(j, R, contract);
    drawBell(j, R, sx, sy);

    ctx.restore();
  }

  // ---------- Asosiy sikl ----------
  function frame(t) {
    if (!last) last = t;
    dt = Math.min(50, t - last); last = t; now = t;

    scrollSmooth += (scrollTarget - scrollSmooth) * 0.08;
    var d = scrollTarget - prevTarget; prevTarget = scrollTarget;
    scrollVel += (Math.abs(d) - scrollVel) * 0.1;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;

    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var docProg = docH > 10 ? Math.max(0, Math.min(1, scrollSmooth / docH)) : 0;

    drawBackground();
    drawParticles();
    for (var i = 0; i < JELLIES.length; i++) drawJelly(JELLIES[i], i, docProg);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
