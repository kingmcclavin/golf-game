// Ad-hoc screenshot helper: node scripts/shot.mjs <url> <out.png> [w] [h] [actions-json]
import { chromium } from 'playwright-core';
const [url, out, w = '1280', h = '720', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(2500);
for (const a of JSON.parse(actions)) {
  if (a.click) await page.getByText(a.click, { exact: a.exact ?? false }).first().click();
  if (a.sel) await page.locator(a.sel).first().click();
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.shot) await page.screenshot({ path: a.shot });
  if (a.drag) {
    const b = await page.locator(a.drag).first().boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(x + (a.dx ?? 0) * i / 10, y + a.dy * i / 10); await page.waitForTimeout(30); }
    await page.waitForTimeout(a.hold ?? 0);
    if (a.shotDuring) await page.screenshot({ path: a.shotDuring });
    await page.mouse.up();
  }
  if (a.key) await page.keyboard.press(a.key);
  if (a.eval) logs.push('eval: ' + JSON.stringify(await page.evaluate(a.eval)));
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
