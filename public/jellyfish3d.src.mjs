/* =====================================================================
   Qo'qon Universiteti — 3D bioluminessent meduza foni (WebGL / Three.js)
   ---------------------------------------------------------------------
   peachweb.io uslubida: shishasimon shaffof qubba (fresnel), ichki
   porlovchi a'zolar, elektr-ko'k tentakalar va BLOOM porlashi. Sahifani
   scroll qilganda meduza suzadi va aylanadi.

   Bu fayl esbuild bilan bitta mustaqil `public/jellyfish3d.js` ga
   yig'iladi (Three.js ichiga singdiriladi). Manba shu yerda saqlanadi.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const CFG = Object.assign({
  zIndex: -1,
  quality: 1,
  mount: null
}, (typeof window !== 'undefined' && window.JELLYFISH_CONFIG) || {});

let reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

// ---------- WebGL bor-yo'qligini tekshirish ----------
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function boot() {
  if (!hasWebGL()) { loadFallback(); return; }

  const host = CFG.mount || document.body;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x02040c, 1);
  const DPR = Math.min(window.devicePixelRatio || 1, 2) * CFG.quality;
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const el = renderer.domElement;
  el.id = 'jellyfish-bg';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    zIndex: String(CFG.zIndex), pointerEvents: 'none', display: 'block'
  });
  host.appendChild(el);

  // WebGL kontekst yo'qolsa — sahifa buzilmasin
  el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);

  // ---------- Sahna ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02040c, 0.055);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9.6);

  // ---------- Fon (gradient sfera) ----------
  {
    const g = new THREE.SphereGeometry(40, 32, 32);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color(0x0a1e3d) }, uBot: { value: new THREE.Color(0x01030a) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uBot;
        void main(){ float t = clamp(vP.y/40.0*0.5+0.5, 0.0, 1.0); vec3 c = mix(uBot, uTop, pow(t,1.4));
        gl_FragColor = vec4(c,1.0);} `
    });
    scene.add(new THREE.Mesh(g, m));
  }

  // ---------- Yorug'lik (a'zolar/ichki uchun ozgina) ----------
  scene.add(new THREE.AmbientLight(0x223355, 0.6));
  const key = new THREE.PointLight(0x88ccff, 0.8, 40); key.position.set(3, 5, 4); scene.add(key);

  // ---------- Meduza guruhi ----------
  const jelly = new THREE.Group();
  jelly.scale.setScalar(0.92);
  scene.add(jelly);

  const BELL_R = 1.35;
  const uTime = { value: 0 };
  const uPulse = { value: 0 };

  // ----- Qubba (bell): shaffof, fresnel -----
  const bellGeo = new THREE.SphereGeometry(BELL_R, 128, 80, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const bellMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    uniforms: {
      uTime, uPulse,
      uInner: { value: new THREE.Color(0x05142e) },
      uRim: { value: new THREE.Color(0x6fd6ff) },
      uEdge: { value: new THREE.Color(0xb06bff) }
    },
    vertexShader: `
      uniform float uTime, uPulse;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vY = uv.y;                                   // 0 tepa .. 1 pastki chekka
        vec3 p = position;
        float contract = uPulse;
        // puls: qisilganda kengroq va pastroq
        float sxz = 1.0 + 0.11*contract;
        float sy  = 1.0 - 0.15*contract;
        p.x *= sxz; p.z *= sxz; p.y *= sy;
        // pastki chekka: to'lqinli (scallop) + skirt
        float rim = smoothstep(0.55, 1.0, vY);
        float lobes = 12.0;
        float sc = sin(uv.x * 6.2831853 * lobes + uTime*1.5);
        p += normalize(vec3(position.x,0.0,position.z)) * sc * 0.05 * rim;
        p.y -= rim * (0.12 + 0.05*sin(uTime*2.2 + uv.x*6.2831853*lobes));
        vec4 wp = modelViewMatrix * vec4(p,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-wp.xyz);
        gl_Position = projectionMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uInner, uRim, uEdge;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
        float f = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 3.0);
        float top = smoothstep(0.55, 0.0, vY);        // apeksda yorug'lik
        float edge = smoothstep(0.75, 1.0, vY);        // chekka rangi
        vec3 col = uInner + uRim * f * 1.05 + top * vec3(0.10,0.22,0.42);
        col = mix(col, uEdge, edge * f * 0.5);
        float a = clamp(0.10 + f*0.60 + top*0.16 + edge*0.12, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`
  });
  const bell = new THREE.Mesh(bellGeo, bellMat);
  jelly.add(bell);

  // ----- Ichki yorug' a'zo (organ) -----
  const organGeo = new THREE.IcosahedronGeometry(0.52, 3);
  const organMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uA: { value: new THREE.Color(0xff5e8a) }, uB: { value: new THREE.Color(0x7a3bff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; uniform float uTime;
      void main(){ vec3 p = position; p += normal * 0.04*sin(uTime*2.0 + position.y*8.0);
        vec4 wp = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-wp.xyz);
        gl_Position = projectionMatrix*wp; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uA, uB;
      void main(){ float f = pow(1.0-clamp(dot(normalize(vN),normalize(vV)),0.0,1.0), 1.6);
        vec3 c = mix(uA, uB, f); gl_FragColor = vec4(c, (0.13+0.34*f)); }`
  });
  const organ = new THREE.Mesh(organGeo, organMat);
  organ.position.y = BELL_R * 0.30;
  organ.scale.set(0.82, 0.66, 0.82);
  jelly.add(organ);

  // ----- Ichki kanallar (radial, porlovchi) -----
  const canalMat = emissiveMat(new THREE.Color(0x9fe8ff), 0.28);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pts = [];
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const rr = 0.12 + t * (BELL_R * 0.82);
      const yy = BELL_R * 0.42 - t * (BELL_R * 0.62);
      pts.push(new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 5, false);
    jelly.add(new THREE.Mesh(geo, canalMat));
  }

  // ----- Marginal tentakalar (yupqa, elektr-ko'k) -----
  const tentacles = [];
  const N_TENT = 16;
  for (let i = 0; i < N_TENT; i++) {
    const a = (i / N_TENT) * Math.PI * 2;
    const rootR = BELL_R * 0.92;
    const len = 3.2 + Math.random() * 1.4;
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      const rr = rootR * (1 + t * 0.35);                 // pastga qarab yoyilish
      pts.push(new THREE.Vector3(Math.cos(a) * rr, -0.15 - t * len, Math.sin(a) * rr));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.018, 6, false);
    const mat = tentacleMat(new THREE.Color(0x7fe6ff), len, 0.9);
    mat.uniforms.uPhase.value = Math.random() * 6.28;
    mat.uniforms.uAmp.value = 0.28;
    mat.uniforms.uFreq.value = 1.6;
    const m = new THREE.Mesh(geo, mat);
    jelly.add(m); tentacles.push(mat);
  }

  // ----- Og'iz qo'llari (yo'g'onroq, frilly, magenta-oq) -----
  const N_ARM = 5;
  for (let i = 0; i < N_ARM; i++) {
    const a = (i / N_ARM) * Math.PI * 2 + 0.3;
    const rootR = BELL_R * 0.28;
    const len = 2.4 + Math.random() * 0.8;
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      pts.push(new THREE.Vector3(
        Math.cos(a) * rootR * (1 + t * 0.6) + Math.sin(t * 6) * 0.1,
        -0.1 - t * len,
        Math.sin(a) * rootR * (1 + t * 0.6)
      ));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 6, false);
    const mat = tentacleMat(new THREE.Color(0xd9b3ff), len, 0.5);
    mat.uniforms.uPhase.value = Math.random() * 6.28;
    mat.uniforms.uAmp.value = 0.30;
    mat.uniforms.uFreq.value = 1.1;
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(1.6, 1.0, 0.5);                          // lentaga o'xshash
    m.rotation.y = a;
    jelly.add(m); tentacles.push(mat);
  }

  // ----- Plankton (Points) -----
  let planktonRot = 0;
  const plankton = makePlankton();
  scene.add(plankton.points);

  // ---------- Post-processing (BLOOM) ----------
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,   // strength
    0.6,    // radius
    0.30    // threshold
  );
  composer.addPass(bloom);

  // ---------- Scroll / sichqoncha ----------
  function winScroll() { return window.pageYOffset || document.documentElement.scrollTop || 0; }
  let sTarget = winScroll(), sSmooth = sTarget, sPrev = sTarget, sVel = 0;
  window.addEventListener('scroll', () => { sTarget = winScroll(); }, { passive: true });
  let tmx = 0, tmy = 0, mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    tmx = (e.clientX / window.innerWidth - 0.5) * 2;
    tmy = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // ---------- Resize ----------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  // ---------- Loop ----------
  let last = performance.now();
  let pulsePhase = 0;
  function frame(t) {
    const dt = Math.min(50, t - last); last = t;
    uTime.value = t * 0.001;

    // scroll silliqlash + tezlik
    sSmooth += (sTarget - sSmooth) * 0.08;
    const d = sTarget - sPrev; sPrev = sTarget;
    sVel += (Math.abs(d) - sVel) * 0.1;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;

    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const prog = docH > 10 ? Math.max(0, Math.min(1, sSmooth / docH)) : 0;

    // puls (scroll tezligi bilan tezlashadi)
    const pSpeed = 0.0016 * (reduce ? 0.4 : 1) * (1 + Math.min(sVel * 0.02, 1.8));
    pulsePhase += pSpeed * dt;
    uPulse.value = 0.5 + 0.5 * Math.sin(pulsePhase);
    for (const m of tentacles) m.uniforms.uPulse.value = uPulse.value;

    // suzish: aylanish + tebranish + scroll bo'yicha vertikal harakat
    jelly.rotation.y += (reduce ? 0.0006 : 0.0016) * dt * 0.06;
    jelly.rotation.z = Math.sin(uTime.value * 0.4) * 0.06 + mx * 0.05;
    jelly.rotation.x = Math.sin(uTime.value * 0.3) * 0.04 - my * 0.05;
    const jet = -uPulse.value * 0.12;
    jelly.position.y = 0.75 - prog * 2.6 + Math.sin(uTime.value * 0.8) * 0.08 + jet;
    jelly.position.x = mx * 0.35;

    // plankton
    planktonRot += 0.0004 * dt;
    plankton.points.rotation.y = planktonRot;
    plankton.material.uniforms.uTime.value = uTime.value;
    plankton.points.position.y = (sSmooth * 0.0018) % 6;

    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Yordamchilar ----------
  function emissiveMat(color, alpha) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: color }, uAlpha: { value: alpha } },
      vertexShader: `void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; void main(){ gl_FragColor = vec4(uColor, uAlpha);} `
    });
  }

  function tentacleMat(color, len, glow) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uTime, uPulse, uColor: { value: color }, uLen: { value: len },
        uPhase: { value: 0 }, uAmp: { value: 0.28 }, uFreq: { value: 1.5 }, uGlow: { value: glow }
      },
      vertexShader: `
        uniform float uTime, uPulse, uLen, uPhase, uAmp, uFreq;
        varying float vT;
        void main(){
          vec3 p = position;
          float tt = clamp(-p.y / uLen, 0.0, 1.0);       // 0 ildiz .. 1 uch
          vT = tt;
          float sw = (1.0 + uPulse*0.35);                 // puls paytida ko'proq harakat
          p.x += sin(p.y*uFreq + uTime*1.8*sw + uPhase) * uAmp * tt;
          p.z += cos(p.y*uFreq*0.8 + uTime*1.5*sw + uPhase*1.3) * uAmp*0.75 * tt;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uGlow; varying float vT;
        void main(){
          float a = (1.0 - vT);                          // uch tomon so'nadi
          a = pow(a, 1.3) * uGlow;
          vec3 c = mix(vec3(1.0), uColor, clamp(vT*1.4,0.0,1.0)); // ildiz oqroq
          gl_FragColor = vec4(c, a);
        }`
    });
  }

  function makePlankton() {
    const n = Math.max(200, Math.round((window.innerWidth * window.innerHeight) / 5200));
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 4 + Math.random() * 12;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      rnd[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: (window.devicePixelRatio || 1) * 2.2 } },
      vertexShader: `
        attribute float aRnd; uniform float uTime, uSize; varying float vTw;
        void main(){
          vTw = 0.4 + 0.6*(0.5+0.5*sin(uTime*1.5 + aRnd));
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = uSize * (1.0 + 0.5*sin(aRnd)) * (30.0/-mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vTw;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if(r>0.5) discard;
          float a = smoothstep(0.5,0.0,r) * vTw * 0.7;
          gl_FragColor = vec4(0.65,0.9,1.0, a);
        }`
    });
    return { points: new THREE.Points(geo, material), material };
  }
}

// WebGL yo'q bo'lsa — eski 2D versiyaga qaytamiz
function loadFallback() {
  const s = document.createElement('script');
  s.src = 'jellyfish.js';
  document.body.appendChild(s);
}

if (document.body) boot();
else document.addEventListener('DOMContentLoaded', boot);
