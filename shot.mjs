import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// --- ichki statik server ---
const root = process.cwd();
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp4':'video/mp4' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch (e) { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(4173, r));
console.log('server up on 4173');

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://localhost:4173';
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-kokand-/2e520f87-ece4-5e18-a375-c532f5620658/scratchpad';

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox']
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-gate.png` });

// Boshlash tugmasi -> logo yig'ilishi
await page.click('#startBtn').catch(()=>{});
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/02-logo-assembling.png` });
await page.waitForTimeout(2600);
await page.screenshot({ path: `${OUT}/03-logo-word.png` });

// Sayt ochilishini kutamiz
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/04-hero-day.png` });

// Tun rejimi
await page.click('#themeBtn').catch(()=>{});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/05-hero-night.png` });
await page.click('#themeBtn').catch(()=>{}); // kunga qaytar

// Scroll: bo'limlar
async function scrollShot(sel, name) {
  await page.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({behavior:'instant', block:'center'}); }, sel);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
await scrollShot('#problem', '06-problem');
await scrollShot('#solution', '07-solution');
await scrollShot('#audience', '08-audience');
await scrollShot('#tech', '09-tech');
await scrollShot('#roadmap', '10-roadmap');
await scrollShot('#footer', '11-footer');

// full page
await page.evaluate(() => window.scrollTo(0,0));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/12-fullpage.png`, fullPage: true });

// mobil
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const mp = await m.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
await mp.waitForTimeout(800);
await mp.click('#skipBtn').catch(()=>{}); // gate'da skip yo'q; startni bosamiz
await mp.click('#startBtn').catch(()=>{});
await mp.waitForTimeout(5500);
await mp.screenshot({ path: `${OUT}/13-mobile-hero.png` });

console.log('--- CONSOLE LOGS ---');
console.log(logs.join('\n') || '(bo\'sh)');
await browser.close();
server.close();
process.exit(0);
