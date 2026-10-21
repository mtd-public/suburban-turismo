// Headless play-test of the game: the menus, a full race and a time trial on autopilot (the CPU driver drives you),
// screenshots along the way. Fails on console errors, a race that never finishes, or page scroll on a phone.
// Usage: python3 -m http.server 4180 &  node tools/play.mjs   (OUT=shots, BASE=http://localhost:4180/, CIRCUIT=key, CAR=key)
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const pw = await import('playwright').catch(() => import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')));
const OUT = process.env.OUT || 'shots', base = process.env.BASE || 'http://localhost:4180/', CIRCUIT = process.env.CIRCUIT || 'drivethru', CAR = process.env.CAR || 'sedan';
const ONLY = process.env.ONLY;
const want = (k) => !ONLY || ONLY.split(',').includes(k);
mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];
async function page(q = '', vp = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + q, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.GAME && !document.querySelector('#loading'), null, { timeout: 120000 });
  await p.waitForTimeout(300);
  return p;
}
const shot = async (p, name) => { await p.waitForTimeout(350); await p.evaluate(() => { GAME.tick(0.016); GAME.render(); }); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('  ', name); };
const run = async (p, secs) => { await p.waitForTimeout(30); return p.evaluate((n) => { for (let i = 0; i < n; i++) GAME.tick(1 / 30); }, Math.round(secs * 30)); }; // (the wait lets held keys land first)

const p = await page();
if (want('menu')) {
  await shot(p, 'game-title');
  await p.keyboard.press('Enter'); await shot(p, 'game-circuit');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await shot(p, 'game-circuit-3');
  await p.keyboard.press('Enter'); await shot(p, 'game-car');
}
for (const mode of ['race', 'tt', 'final']) {
  if (!want(mode)) continue;
  await p.evaluate(([m, c, k]) => { GAME.G.auto = true; GAME.startRace(m === 'final' ? 'race' : m, m === 'final' ? 'finale' : c, k); }, [mode, CIRCUIT, CAR]);
  await run(p, 1); await shot(p, `${mode}-grid`);
  await run(p, 4); await shot(p, `${mode}-go`);
  let t = 0;
  while (t < 400 && (await p.evaluate(() => GAME.state)) !== 'results') { await run(p, 10); t += 10; if (t === 20 || t === 40) await shot(p, `${mode}-mid${t}`); }
  const r = await p.evaluate(() => ({ state: GAME.state, t: GAME.G.player.finishT, laps: GAME.G.player.laps, field: GAME.standings().map((x) => `${x.name}:${x.finished ? x.finishT.toFixed(1) : 'lap' + x.c}`) }));
  console.log('  ', mode, JSON.stringify(r));
  if (r.state !== 'results') errors.push(`${mode}: no result after ${t} s`);
  await shot(p, `${mode}-results`);
}
if (want('combat')) { // Motor Murder on autopilot: the CPU drives you and fires; it must end (last car, wrecked or time)
  await p.evaluate(([c, k]) => { GAME.G.auto = true; GAME.startRace('combat', c, k); }, [CIRCUIT, CAR]);
  await run(p, 4); await shot(p, 'combat-go');
  await p.evaluate(() => { const P = GAME.G.player; P.weapon = 'turkey'; P.ammo = 1; GAME.combat.fire(P); }); await run(p, 0.5); await shot(p, 'combat-turkey');
  await p.evaluate(() => { const P = GAME.G.player; P.weapon = 'nuts'; P.ammo = 1; GAME.combat.fire(P); P.weapon = 'vape'; P.ammo = 1; P.cool = 0; GAME.combat.fire(P); P.weapon = 'chainsaw'; P.ammo = 1; P.cool = 0; GAME.combat.fire(P); }); await run(p, 1.2); await shot(p, 'combat-weapons');
  let t = 0, seen = new Set();
  while (t < 200 && (await p.evaluate(() => GAME.state)) !== 'results') { await run(p, 5); t += 5; (await p.evaluate(() => GAME.G.racers.map((r) => r.weapon).filter(Boolean))).forEach((w) => seen.add(w)); if (t === 15 || t === 45) await shot(p, `combat-mid${t}`); }
  const r = await p.evaluate(() => ({ state: GAME.state, t: GAME.G.t.toFixed(1), field: GAME.combat.standing().map((x) => `${x.name}:${x.dead ? 'X' : Math.ceil(x.hp)}/${x.kills}k`) }));
  console.log('   combat', JSON.stringify(r), 'weapons held:', [...seen].join(','));
  if (r.state !== 'results') errors.push('combat: no result');
  await shot(p, 'combat-results'); await p.evaluate(() => { GAME.G.auto = false; });
}
if (want('mirror')) { // backing up: the mirror pops up
  await p.evaluate(([c, k]) => { GAME.G.auto = false; GAME.startRace('race', c, k); }, [CIRCUIT, CAR]);
  await run(p, 5);
  await p.keyboard.down('KeyS'); await run(p, 1.5); await shot(p, 'mirror'); await p.keyboard.up('KeyS');
  await p.keyboard.down('KeyW'); await run(p, 1.3); console.log('   speed before the drift', await p.evaluate(() => GAME.G.player.body.speed.toFixed(1))); await p.keyboard.down('KeyS'); await p.keyboard.down('KeyD'); await run(p, 0.6);
  const slip = await p.evaluate(() => [GAME.G.drift, GAME.G.player.body.slip, GAME.G.player.body.speed]); console.log('   drift', JSON.stringify(slip));
  if (!slip[0]) errors.push('no drift on brake + steer'); await shot(p, 'drift'); await p.keyboard.up('KeyS'); await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW');
  await p.keyboard.press('KeyC'); await p.keyboard.down('KeyW'); await run(p, 2); await shot(p, 'bumper'); await p.keyboard.up('KeyW'); await p.keyboard.press('KeyC');
}
if (want('phone')) {
  const ph = await page('', { width: 390, height: 844 });
  await shot(ph, 'phone-title');
  await ph.evaluate(([c, k]) => { document.body.classList.add('touch'); GAME.startRace('race', c, k); }, [CIRCUIT, CAR]);
  await ph.evaluate(() => { for (let i = 0; i < 150; i++) GAME.tick(1 / 30); });
  await shot(ph, 'phone-race');
  const sc = await ph.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight, document.scrollingElement.scrollWidth, innerWidth]);
  if (sc[0] > sc[1] || sc[2] > sc[3]) errors.push('page scrolls on phone');
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
