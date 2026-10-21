// Every circuit's racing line against the static world: lists the walls and posts within reach of the line
// (anything a car on the line would hit that isn't meant to be smashed). Glass, kerbs and props don't count.
// Usage: python3 -m http.server 4180 &  node tools/lines.mjs   (R=key,key to check some)
import { execSync } from 'node:child_process'; import { join } from 'node:path';
const pw = await import('playwright').catch(() => import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')));
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage();
await p.goto((process.env.BASE || 'http://localhost:4180/'), { timeout: 180000 }); await p.waitForFunction(() => window.GAME && !document.querySelector('#loading'), null, { timeout: 120000 });
const out = await p.evaluate(async (only) => {
  const RT = await import('./js/routes.js'), W = GAME.props.W, glass = new Set(GAME.props.glass.map((g) => g.plat));
  const res = {};
  for (const r of RT.ROUTES) {
    if (only && !only.includes(r.key)) continue;
    const hits = new Map();
    for (const s of RT.routeSamples(r, 2)) {
      for (const q of W.plats) if (!glass.has(q) && q.h > 0.45 && Math.abs(s.x - q.x) < q.w / 2 + 1.6 && Math.abs(s.z - q.z) < q.d / 2 + 1.6) hits.set(`plat ${q.x.toFixed(1)},${q.z.toFixed(1)} ${q.w.toFixed(1)}x${q.d.toFixed(1)} h${q.h.toFixed(1)}`, `${s.x.toFixed(0)},${s.z.toFixed(0)}`);
      for (const q of W.posts) if (Math.hypot(s.x - q.x, s.z - q.z) < q.r + 1.4) hits.set(`post ${q.x.toFixed(1)},${q.z.toFixed(1)} r${q.r}`, `${s.x.toFixed(0)},${s.z.toFixed(0)}`);
    }
    res[r.key] = [...hits].map(([k, v]) => `${k} @${v}`);
  }
  return res;
}, process.env.R ? process.env.R.split(',') : null);
let n = 0;
for (const [k, v] of Object.entries(out)) { console.log(k, v.length ? '' : 'clear'); for (const h of v) console.log('   ', h); n += v.length; }
await b.close();
process.exit(n ? 1 : 0);
