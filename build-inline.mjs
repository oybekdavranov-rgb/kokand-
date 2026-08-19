/* build-inline.mjs — barcha CSS/JS ni bitta faylga joylashtiradi.
   Natija:
     dist/index.html   — to'liq standalone hujjat (hosting / ochish / ZIP)
     dist/artifact.html — claude.ai Artifact uchun (html/head/body sarg'ichsiz)
*/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.cwd();
const r = (p) => readFile(join(root, p), 'utf8');

const [htmlSrc, css, three, gsap, st, app] = await Promise.all([
  r('index.html'), r('styles.css'),
  r('lib/three.min.js'), r('lib/gsap.min.js'), r('lib/ScrollTrigger.min.js'), r('app.js')
]);
await mkdir(join(root, 'dist'), { recursive: true });

const FONTS = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700&display=swap';
const wrapJs = (code) => `<script>\n${code}\n</script>`;
// MUHIM: o'rin bosuvchi FUNKSIYA bo'lishi shart — aks holda $$ , $& kabi belgilar
// String.replace tomonidan maxsus talqin qilinib, kod buziladi.
const fn = (v) => () => v;

/* ---------- 1) STANDALONE ---------- */
let standalone = htmlSrc
  .replace('<link rel="stylesheet" href="styles.css" />', fn(`<style>\n${css}\n</style>`))
  .replace('<script src="lib/three.min.js"></script>', fn(wrapJs(three)))
  .replace('<script src="lib/gsap.min.js"></script>', fn(wrapJs(gsap)))
  .replace('<script src="lib/ScrollTrigger.min.js"></script>', fn(wrapJs(st)))
  .replace('<script src="app.js"></script>', fn(wrapJs(app)));
await writeFile(join(root, 'dist/index.html'), standalone);

/* ---------- 2) ARTIFACT FRAGMENT ---------- */
// <body ...> ... </body> ichini olamiz
const bodyInner = htmlSrc.slice(htmlSrc.indexOf('>', htmlSrc.indexOf('<body')) + 1, htmlSrc.lastIndexOf('</body>'));
let frag = bodyInner
  .replace('<script src="lib/three.min.js"></script>', fn(wrapJs(three)))
  .replace('<script src="lib/gsap.min.js"></script>', fn(wrapJs(gsap)))
  .replace('<script src="lib/ScrollTrigger.min.js"></script>', fn(wrapJs(st)))
  .replace('<script src="app.js"></script>', fn(wrapJs(app)));

const initScript = `<script>document.documentElement.setAttribute('data-mode','day');document.documentElement.lang='uz';document.body.setAttribute('data-mode','day');document.body.classList.add('pre-lock');</script>`;
const artifact =
`<title>Imora AI</title>
<style>
@import url("${FONTS}");
${css}
</style>
${initScript}
${frag}`;
await writeFile(join(root, 'dist/artifact.html'), artifact);

console.log('OK — dist/index.html (' + Math.round(standalone.length/1024) + 'KB), dist/artifact.html (' + Math.round(artifact.length/1024) + 'KB)');
