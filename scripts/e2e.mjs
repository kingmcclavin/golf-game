// End-to-end smoke test: plays a complete 3-hole match in a real (headless) browser, buys a pack,
// buys a cosmetic and checks persistence. Usage: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:4173';
const OUT = process.env.OUT ?? 'screenshots';
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, { recursive: true });
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('ok -', m);

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL);
await page.waitForTimeout(1500);
// fast settings for the test run
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fairway-legends-save'));
  s.settings.quality = 'low';
  s.settings.botSpeed = 'instant';
  s.settings.music = false;
  localStorage.setItem('fairway-legends-save', JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/01-menu.png` });
if (await page.getByText('Play Golf').count()) ok('main menu renders'); else fail('main menu missing');
const coins0 = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')).coins);

// ---- play a full match through the controller
await page.getByText('Play Golf').click();
await page.waitForTimeout(500);
await page.getByText('Solo', { exact: true }).click().catch(() => {});
await page.locator('.seg button', { hasText: /^1$/ }).first().click();
await page.locator('.seg button', { hasText: /^3$/ }).first().click();
await page.screenshot({ path: `${OUT}/02-setup.png` });
await page.getByText('Tee Off').click();
await page.waitForTimeout(1500);

let shots = 0;
let shotImgs = 0;
const t0 = Date.now();
for (;;) {
  if (Date.now() - t0 > 12 * 60 * 1000) { fail('match took too long'); break; }
  const st = await page.evaluate(() => {
    const c = window.__fl?.ctl;
    if (!c) return { phase: 'none' };
    return { phase: c.phase, human: c.phase === 'aim' && !c.match.players[c.cur].isBot, hole: c.match.holeNumber };
  });
  if (st.phase === 'intro') await page.evaluate(() => window.__fl.ctl.skip());
  if (st.phase === 'holeOver') {
    await page.screenshot({ path: `${OUT}/04-hole-${st.hole}.png` });
    await page.evaluate(() => window.__fl.ctl.continueAfterHole());
  }
  if (st.phase === 'roundOver') break;
  if (st.human) {
    if (shotImgs < 2) await page.screenshot({ path: `${OUT}/03-aim-${shotImgs++}.png` });
    // choose power from the club's carry and the distance to the pin
    await page.evaluate(() => {
      const c = window.__fl.ctl;
      const p = c.match.players[c.cur];
      const club = c.currentClub();
      const d = c.match.world.distToPin(p.ball.x, p.ball.z);
      const putt = club.def.category === 'putter';
      c.__power = putt ? c.suggestPuttPower() : Math.min(1, (d * 0.9) / (club.def.category === 'driver' ? 999 : 1) / 1);
      if (!putt) {
        const perfCarry = c.preview ? c.preview.carry : 150;
        c.__power = Math.min(1, Math.max(0.15, (d * 0.92) / Math.max(10, perfCarry)));
      }
      c.beginPull();
      c.updatePull(0, c.__power);
    });
    // wait for the needle to come near the centre, then release (like a player would)
    for (let i = 0; i < 60; i++) {
      const n = await page.evaluate(() => window.__fl.ctl.needle);
      if (Math.abs(n) < 0.12) break;
      await page.waitForTimeout(25);
    }
    await page.evaluate(() => window.__fl.ctl.release());
    shots++;
  }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/05-results.png` });
const res = await page.evaluate(() => {
  const c = window.__fl.ctl;
  return { scores: c.match.players.map((p) => p.scores), outcome: !!document.querySelector('.reward-line') };
});
console.log('scores', JSON.stringify(res.scores), 'human shots', shots);
if (res.outcome && res.scores.every((s) => s.every((x) => x >= 1))) ok('full 3-hole match completed with results screen'); else fail('match did not finish');
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')));
if (after.coins > coins0 && after.matchHistory.length === 1) ok(`coins awarded (${coins0} -> ${after.coins}) and match saved`); else fail('rewards not saved');

// ---- persistence across reload
await page.getByText('Main menu').click();
await page.reload();
await page.waitForTimeout(1500);
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')));
if (persisted.coins === after.coins && persisted.matchHistory.length === 1) ok('save persists after reload'); else fail('save lost on reload');

// ---- buy and open a pack
await page.getByText('Club Packs').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-packs.png` });
const before = persisted.coins;
await page.locator('.card', { hasText: 'Starter Pack' }).getByRole('button').click();
await page.waitForTimeout(300);
await page.locator('.modal').getByRole('button', { name: /Buy for/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-pack-closed.png` });
await page.locator('.big-pack').click({ force: true });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/08-pack-reveal.png` });
await page.getByText('Skip all').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/09-pack-summary.png` });
const afterPack = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')));
if (afterPack.coins <= before - 300 + 2000 && afterPack.packHistory.length === 1 && afterPack.lifetime.packsOpened === 1) ok(`pack bought (coins ${before} -> ${afterPack.coins})`); else fail('pack purchase failed');
await page.getByText('Keep & Close').click();

// ---- golf bag
await page.locator('button[aria-label=Back]').click();
await page.getByText('Golf Bag').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/10-bag.png` });
await page.locator('button[aria-label=Back]').click();

// ---- cosmetics shop
await page.locator('.menu-tile', { hasText: 'Shop' }).click();
await page.waitForTimeout(1200);
await page.locator('.item').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/11-shop-tryon.png` });
const c0 = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')).cosmetics.length);
await page.locator('.char-stage .btn.primary').click();
await page.waitForTimeout(300);
await page.locator('.modal .btn.primary').click();
await page.waitForTimeout(800);
const c1 = await page.evaluate(() => JSON.parse(localStorage.getItem('fairway-legends-save')));
if (c1.cosmetics.length === c0 + 1 && c1.outfit.hat === c1.cosmetics[c1.cosmetics.length - 1]) ok('cosmetic bought and equipped'); else fail('cosmetic purchase failed');
await page.screenshot({ path: `${OUT}/12-shop-bought.png` });

// ---- phone + tablet layouts with touch
for (const [name, vp] of [['iphone-portrait', { width: 390, height: 844 }], ['iphone-landscape', { width: 844, height: 390 }], ['ipad', { width: 1180, height: 820 }]]) {
  const mctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await mp.goto(URL);
  await mp.waitForTimeout(1500);
  await mp.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fairway-legends-save'));
    s.settings.quality = 'low';
    s.settings.music = false;
    localStorage.setItem('fairway-legends-save', JSON.stringify(s));
  });
  await mp.reload();
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}/20-${name}-menu.png` });
  await mp.getByText('Quick 3-Hole').tap();
  await mp.waitForTimeout(1500);
  await mp.evaluate(() => window.__fl.ctl.skip());
  for (let i = 0; i < 40; i++) {
    const ph = await mp.evaluate(() => window.__fl.ctl.phase === 'aim' && !window.__fl.ctl.match.players[window.__fl.ctl.cur].isBot);
    if (ph) break;
    await mp.evaluate(() => window.__fl.ctl.skip());
    await mp.waitForTimeout(300);
  }
  // real touch drag on the swing pad
  const pad = await mp.locator('.swing-pad').boundingBox();
  const cdp = await mctx.newCDPSession(mp);
  const x = pad.x + pad.width / 2, y = pad.y + pad.height / 2;
  // drag down to (but never past) the bottom edge of the screen, as a thumb would
  const edge = vp.height - 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= 8; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + ((edge - y) * k) / 8 }] });
    await mp.waitForTimeout(30);
  }
  await mp.screenshot({ path: `${OUT}/21-${name}-pull.png` });
  const pulling = await mp.evaluate(() => window.__fl.ctl.pulling);
  const edgePower = await mp.evaluate(() => window.__fl.ctl.power);
  if (edgePower >= 1.0) ok(`${name}: full power reachable within the screen (${edgePower.toFixed(2)})`);
  else fail(`${name}: only ${Math.round(edgePower * 100)}% power reachable before the screen edge`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mp.waitForTimeout(600);
  const phase = await mp.evaluate(() => window.__fl.ctl.phase);
  if (pulling && (phase === 'swing' || phase === 'flight' || phase === 'result')) ok(`${name}: touch pull-and-release swing works (${phase})`);
  else fail(`${name}: touch swing failed (pulling=${pulling}, phase=${phase})`);
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}/22-${name}-flight.png` });
  await mctx.close();
}

if (errors.length) { console.log('page errors:\n' + errors.join('\n')); fail('runtime errors'); } else ok('no runtime errors');
await browser.close();
