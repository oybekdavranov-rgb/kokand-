import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const OUT = '/tmp/claude-0/-home-user-kokand-/2e520f87-ece4-5e18-a375-c532f5620658/scratchpad';

// artifact fragmentni host skeletoniga o'rab test faylini yasaymiz
const frag = await readFile(join(root, 'dist/artifact.html'), 'utf8');
await writeFile(join(root, 'dist/_arttest.html'),
`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${frag}</body></html>`);

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png' };
const server = http.createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
    const data = await readFile(join(root, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200,{'Content-Type':MIME[extname(p)]||'application/octet-stream'}); res.end(data);
  } catch(e){ res.writeHead(404); res.end('404'); }
});
await new Promise(r=>server.listen(4173,r));

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
async function shot(url, name){
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>errs.push(e.message));
  await page.goto(url,{waitUntil:'load'}); await page.waitForTimeout(1000);
  await page.click('#startBtn').catch(()=>{}); await page.waitForTimeout(5500);
  await page.screenshot({ path:`${OUT}/${name}.png` });
  console.log(name, 'errors:', errs.length? errs.join(' | ') : 'none');
  await ctx.close();
}
await shot('http://localhost:4173/dist/index.html','A-standalone');
await shot('http://localhost:4173/dist/_arttest.html','B-artifact');
await browser.close(); server.close(); process.exit(0);
