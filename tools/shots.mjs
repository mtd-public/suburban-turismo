// Screenshots of the art test (viewer.html): every location view, every vehicle, every cast member, a drive, and PS1 on/off.
// Also fails on console errors and page scroll (template rule 10).
// Usage: python3 -m http.server 4180 &  node tools/shots.mjs   (OUT=shots, BASE=http://localhost:4180/, ONLY=tour|garage|cast|drive|map|smash|misc)
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const pw = await import('playwright').catch(() => import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')));
const OUT = process.env.OUT || 'shots', base = (process.env.BASE || 'http://localhost:4180/') + 'viewer.html', ONLY = process.env.ONLY;
mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];
async function page(vp = { width: 1280, height: 720 }, q = '') {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + q, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.ART && !document.querySelector('#loading'), null, { timeout: 120000 });
  await p.waitForTimeout(500);
  return p;
}
const shot = async (p, name) => { await p.evaluate(() => { ART.tick(0.016); ART.render(); }); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('  ', name); };
const want = (k) => !ONLY || ONLY.split(',').includes(k);

const p = await page();
if (want('tour')) {
  const locs = await p.evaluate(() => import('./js/town.js').then((m) => m.LOCATIONS.map((l) => l.cams.length)));
  for (let i = 0; i < locs.length; i++) for (let c = 0; c < locs[i]; c++) { await p.evaluate(([i, c]) => ART.set('tour', i, c), [i, c]); await shot(p, `tour-${i}-${c}`); }
}
if (want('garage')) for (let i = 0; i < 5; i++) { await p.evaluate((i) => ART.set('garage', i), i); await shot(p, `garage-${i}`); }
if (want('cast')) for (let i = 0; i < 11; i++) { await p.evaluate((i) => ART.set('cast', i), i); await shot(p, `cast-${i}`); }
if (want('drive')) {
  await p.evaluate(() => ART.set('drive', 1));
  await p.keyboard.down('KeyW'); await p.evaluate(() => { for (let i = 0; i < 180; i++) ART.tick(1 / 60); }); await p.keyboard.up('KeyW');
  await shot(p, 'drive-0');
  await p.keyboard.down('KeyW'); await p.keyboard.down('KeyA'); await p.evaluate(() => { for (let i = 0; i < 70; i++) ART.tick(1 / 60); }); await p.keyboard.up('KeyA'); await p.keyboard.up('KeyW');
  await shot(p, 'drive-1');
  for (let k = 0; k < 5; k++) await p.keyboard.press('KeyT'); // the Grand Prix laid on the road
  await shot(p, 'drive-track');
  await p.keyboard.press('KeyT');
}
if (want('map')) for (let i = 0; i < 6; i++) { await p.evaluate((i) => ART.set('map', i), i); await shot(p, `map-${i}`); }
if (want('smash')) {
  // Through CityMart's left vestibule glass and down the main aisle; props must react and glass must break.
  await p.evaluate(() => { ART.set('drive', 0); ART.warp(); });
  await p.keyboard.down('KeyW');
  for (let k = 0; k < 6; k++) { await p.evaluate(() => { for (let i = 0; i < 40; i++) ART.tick(1 / 60); }); await shot(p, `smash-${k}`); }
  // and side-on into a grocery shelf: the stock should come off it
  await p.evaluate(() => { Object.assign(ART.body, { x: 87.5, z: -128, heading: Math.PI / 2, vh: Math.PI / 2, speed: 12 }); for (let i = 0; i < 20; i++) ART.tick(1 / 60); });
  await p.keyboard.up('KeyW');
  await p.evaluate(() => { for (let i = 0; i < 30; i++) ART.tick(1 / 60); });
  await shot(p, 'smash-6');
  // the Promenade: through Spenser's window from the plaza, out the loading door onto the service lane
  await p.evaluate(() => { ART.props.reset(); Object.assign(ART.body, { x: 76.5, y: 0, z: 46, heading: 0, vh: 0, speed: 0, vy: 0 }); });
  await p.keyboard.down('KeyW');
  for (let k = 0; k < 4; k++) { await p.evaluate(() => { for (let i = 0; i < 40; i++) ART.tick(1 / 60); }); await shot(p, `mall-${k}`); }
  await p.keyboard.up('KeyW');
  const mall = await p.evaluate(() => ({ ...ART.props.fx, z: ART.body.z }));
  console.log('   mall', JSON.stringify(mall));
  if (mall.z < 92) errors.push(`stuck in the Promenade shop at z=${mall.z.toFixed(1)}`);
  const fx = await p.evaluate(() => ({ ...ART.props.fx, z: ART.body.z, x: ART.body.x }));
  console.log('   fx', JSON.stringify(fx));
  if (!fx.smashed) errors.push('no glass smashed');
}
if (want('misc')) {
  for (const l of ['golden', 'overcast', 'dusk']) { await p.evaluate((l) => { ART.applyLight(l); ART.set('tour', 0, 0); }, l); await shot(p, `light-${l}`); }
  await p.evaluate(() => ART.applyLight('autumn'));
  const q = await page({ width: 1280, height: 720 }, '?ps1=0&mode=tour&i=0');
  await shot(q, 'compare-noPS1');
  const ph = await page({ width: 390, height: 844 }, '?mode=garage&i=0');
  await shot(ph, 'phone-garage');
  const sc = await ph.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight, document.scrollingElement.scrollWidth, innerWidth]);
  if (sc[0] > sc[1] || sc[2] > sc[3]) errors.push('page scrolls on phone');
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
