/**
 * Screenshots of every game scene, desktop (1280×800) and mobile (390×844), at deviceScaleFactor 2.
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/screenshots.cjs [outDir] [scene-filter]
 * Waits until all map + terrain tiles are loaded before each shot; a scene that does not settle is retried.
 * Headless Chromium renders WebGL in software (SwiftShader) – slow, hence the long timeouts.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.NIVIS_URL || 'http://localhost:4173/';
const OUT = path.resolve(process.argv[2] || 'screenshots');
const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null;
fs.mkdirSync(OUT, { recursive: true });

const PLAN = [ // [type, candidate positions] – the first one that the rules accept is built
  ['solar', [[18.3, 48.0], [17.75, 48.05], [18.9, 48.1], [20.3, 48.45]]],
  ['solar', [[21.6, 48.55], [19.6, 48.35], [18.6, 48.2]]],
  ['wind', [[21.5, 49.2], [17.4, 48.75], [19.0, 48.45]]],
  ['wind', [[21.2, 49.35], [18.2, 48.95], [20.7, 48.55]]],
  ['hydro', [[17.84, 48.62], [18.75, 48.25]]],
  ['battery', [[18.2, 48.45], [19.3, 48.4], [20.9, 48.6]]],
  ['pumped', [[19.94, 49.0], [19.96, 48.99]]],
  ['coal', [[18.6, 48.7], [21.9, 48.75]]]
];

async function open(browser, mobile) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text().slice(0, 200)); });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
  return page;
}

/** all tiles (vector, terrain, hillshade, satellite) loaded and the camera at rest, 3× in a row */
async function settle(page, extra = 1500) {
  const t0 = Date.now(); let ok = 0;
  while (Date.now() - t0 < 240000) {
    const done = await page.evaluate(() => { const m = window.__map; return m.areTilesLoaded() && !m.isMoving() && m.isStyleLoaded(); });
    ok = done ? ok + 1 : 0;
    if (ok >= 3) { await page.waitForTimeout(extra); return true; }
    await page.waitForTimeout(1000);
  }
  return false;
}

const dragTo = (page, type, ll, release = true) => page.evaluate(async ([type, ll, release]) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (t, x, y, target) => (target || window).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true }));
  const map = window.__map; const card = document.querySelector(`[data-type=${type}]`); const cb = card.getBoundingClientRect();
  const p = map.project(ll); const cr = map.getContainer().getBoundingClientRect();
  ev('pointerdown', cb.left + 20, cb.top + 20, card); ev('pointermove', (cb.left + p.x + cr.left) / 2, (cb.top + p.y + cr.top) / 2); ev('pointermove', p.x + cr.left, p.y + cr.top);
  await sleep(300);
  const tip = document.querySelector('[data-testid=tip]')?.innerText || '';
  if (release) { ev('pointerup', p.x + cr.left, p.y + cr.top); await sleep(150); }
  return tip;
}, [type, ll, release]);

async function skipIntro(page) { await page.getByText('Preskočiť úvod').click(); await page.getByTestId('play').click(); } // paused → stable picture
const hideToast = (page) => page.waitForFunction(() => !document.querySelector('[data-testid=toast]'), null, { timeout: 15000 }).catch(() => {});
const camera = (page, cam) => page.evaluate((cam) => window.__map.jumpTo(cam), cam);
const closeInfo = (page) => page.evaluate(() => document.querySelector('[data-testid=info] button')?.click());

/** a believable mid-game state: several plants, half a year simulated, HUD refreshed */
async function midGame(page) {
  for (const [type, cands] of PLAN) {
    for (const ll of cands) { const tip = await dragTo(page, type, ll); if (tip && !tip.startsWith('Tu sa nedá')) break; }
  }
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 245 && !g.sim.yearDone; i++) g.stepDay(false); });
  // one more build refreshes the HUD (the app refreshes after every build)
  await dragTo(page, 'solar', [21.3, 48.45]); await dragTo(page, 'solar', [20.0, 48.3]);
  await page.evaluate(() => { window.__game.sim.events = []; });
  await page.waitForTimeout(6500); await hideToast(page);
}

const isMobile = (p) => p.viewportSize().width < 700;
const freePad = (page) => (isMobile(page) ? { top: 370, bottom: 240, left: 0, right: 0 } : { top: 330, right: 300, left: 0, bottom: 0 });

const SCENES = [
  // [name, mobile?, run(page)]
  ['01-uvod', false, async (p) => { await settle(p); }],
  ['02-hra-cele-slovensko', false, async (p) => { await skipIntro(p); await midGame(p); await p.click('[aria-label="Zobraziť celé Slovensko"]'); await settle(p, 2500); }],
  ['03-stavanie-ghost', false, async (p) => { await skipIntro(p); await camera(p, { center: [18.25, 48.45], zoom: 9.6, pitch: 55, bearing: -15, padding: freePad(p) }); await settle(p); await dragTo(p, 'battery', [18.2, 48.45], false); await p.waitForTimeout(2500); await settle(p, 500); }],
  ['04-stavanie-zakaz-tanap', false, async (p) => { await skipIntro(p); await camera(p, { center: [20.17, 49.17], zoom: 10.2, pitch: 60, bearing: 15, padding: freePad(p) }); await settle(p); await dragTo(p, 'wind', [20.15, 49.17], false); await p.waitForTimeout(2500); await settle(p, 500); }],
  ['05-detail-elektrarne', false, async (p) => { await skipIntro(p); await midGame(p); await camera(p, { center: [17.75, 48.52], zoom: 10.4, pitch: 55, bearing: -20, padding: freePad(p) }); await settle(p);
    await p.evaluate(() => { const m = window.__map; const pt = m.project([17.683, 48.494]); const r = m.getContainer().getBoundingClientRect(); const c = m.getCanvas(); const e = (t) => c.dispatchEvent(new PointerEvent(t, { clientX: pt.x + r.left, clientY: pt.y + r.top, bubbles: true, cancelable: true, button: 0, pointerId: 1 })); e('pointerdown'); window.dispatchEvent(new PointerEvent('pointerup', { clientX: pt.x + r.left, clientY: pt.y + r.top, bubbles: true, pointerId: 1 })); });
    await p.waitForSelector('[data-testid=info]'); await settle(p); }],
  ['06-modely-elektrarni', false, async (p) => { await skipIntro(p); await midGame(p); await camera(p, { center: [18.1, 48.45], zoom: 9.2, pitch: 58, bearing: -12, padding: freePad(p) }); await settle(p, 2500); }],
  ['07-teren-tatry', false, async (p) => { await skipIntro(p); await camera(p, { center: [20.1, 49.15], zoom: 10.4, pitch: 68, bearing: 10, padding: freePad(p) }); await settle(p, 2500); }],
  ['08-satelit', false, async (p) => { await skipIntro(p); await midGame(p); await p.getByTestId('basemap').click(); await p.click('[aria-label="Zobraziť celé Slovensko"]'); await settle(p, 2500); }],
  ['09-satelit-3d-bratislava', false, async (p) => { await skipIntro(p); await p.getByTestId('basemap').click(); await camera(p, { center: [17.11, 48.145], zoom: 14.2, pitch: 60, bearing: 30, padding: freePad(p) }); await settle(p, 2500); }],
  ['10-legenda', false, async (p) => { await skipIntro(p); await p.click('[aria-label="Legenda mapy"]'); await settle(p, 1500); }],
  ['11-rocna-sprava', false, async (p) => { await skipIntro(p); await midGame(p); await p.evaluate(() => { const g = window.__game; while (!g.sim.yearDone) g.stepDay(false); }); await p.waitForSelector('[data-testid=grade]'); await settle(p, 1000); }],
  ['12-rocna-sprava-grafy-kviz', false, async (p) => { await skipIntro(p); await midGame(p); await p.evaluate(() => { const g = window.__game; while (!g.sim.yearDone) g.stepDay(false); }); await p.waitForSelector('[data-testid=grade]');
    await p.click('text=Najviac v lete, najmenej v zime'); await p.click('text=16–20 (večer)');
    await p.evaluate(() => { const c = document.querySelector('.nv-modalcard'); const h = [...c.querySelectorAll('span')].find((s) => s.textContent === 'Priemerný deň v tomto roku'); c.scrollTop = h.offsetTop - 20; }); await settle(p, 1000); }],
  ['01-uvod', true, async (p) => { await settle(p); }],
  ['02-hra', true, async (p) => { await skipIntro(p); await midGame(p); await p.click('[aria-label="Zobraziť celé Slovensko"]'); await settle(p, 2500); }],
  ['03-stavanie-ghost', true, async (p) => { await skipIntro(p); await camera(p, { center: [18.3, 48.0], zoom: 9.4, pitch: 50, bearing: -10, padding: { top: 430, bottom: 250, left: 0, right: 0 } }); await settle(p); await dragTo(p, 'solar', [18.3, 48.0], false); await p.waitForTimeout(2500); await settle(p, 500); }],
  ['04-detail-elektrarne', true, async (p) => { await skipIntro(p); await midGame(p); await camera(p, { center: [18.3, 48.0], zoom: 9.0, pitch: 50, bearing: -10, padding: { top: 420, bottom: 250, left: 250, right: 70 } }); await settle(p);
    await p.evaluate(() => { const m = window.__map; const pl = window.__game.plants.find((q) => q.type === 'solar' && q.build === 0); const pt = m.project(pl.lngLat); const r = m.getContainer().getBoundingClientRect(); const c = m.getCanvas(); c.dispatchEvent(new PointerEvent('pointerdown', { clientX: pt.x + r.left, clientY: pt.y + r.top, bubbles: true, cancelable: true, button: 0, pointerId: 1 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: pt.x + r.left, clientY: pt.y + r.top, bubbles: true, pointerId: 1 })); });
    await p.waitForSelector('[data-testid=info]'); await settle(p); }],
  ['05-satelit', true, async (p) => { await skipIntro(p); await p.getByTestId('basemap').click(); await settle(p, 2500); }],
  ['06-rocna-sprava', true, async (p) => { await skipIntro(p); await midGame(p); await p.evaluate(() => { const g = window.__game; while (!g.sim.yearDone) g.stepDay(false); }); await p.waitForSelector('[data-testid=grade]'); await settle(p, 1000); }]
];

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy });
  for (const [name, mobile, run] of SCENES) {
    const file = (mobile ? 'mobil-' : 'desktop-') + name + '.png';
    if (ONLY && !ONLY.test(file)) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const page = await open(browser, mobile);
      try {
        await run(page);
        await page.screenshot({ path: path.join(OUT, file), timeout: 240000 });
        console.log('OK  ', file, page.errors.length ? 'errors: ' + page.errors.join(' | ') : '');
        await page.context().close(); break;
      } catch (e) {
        console.log('FAIL', file, 'attempt', attempt, String(e.message).split('\n')[0]);
        await page.context().close();
      }
    }
  }
  await browser.close();
})();
