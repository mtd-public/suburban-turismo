// Single-file build (for sharing a page as one HTML file): bundles the page's module (js/game.js for index.html,
// js/main.js for viewer.html) + three.js with esbuild and inlines the CSS and the touch-zoom-guard kit. The repo
// itself needs no build step; this is only for previews.
// Usage: node tools/inline.mjs out.html [page.html]   (needs esbuild: `npx esbuild` must work, or set ESBUILD=/path/to/esbuild)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || 'dist/suburban-turismo.html', page = process.argv[3] || 'index.html';
const esb = process.env.ESBUILD || 'npx';
let html = readFileSync(page, 'utf8');
const entry = html.match(/<script type="module" src="(js\/[a-z]+\.js)"><\/script>/)[1];
const args = [...(esb === 'npx' ? ['esbuild'] : []), entry, '--bundle', '--format=esm', '--minify', '--alias:three=./js/vendor/three.module.min.js', '--log-level=warning'];
const js = execFileSync(esb, args, { maxBuffer: 64 << 20 }).toString().replace(/<\/script/g, '<\\/script');
const inl = (re, f) => { html = html.replace(re, f); };
inl(/<link rel="stylesheet" href="touch-zoom-guard\/touch-zoom-guard.css">/, () => `<style>${readFileSync('touch-zoom-guard/touch-zoom-guard.css', 'utf8')}</style>`);
inl(/<link rel="stylesheet" href="(css\/[a-z]+\.css)">/, (_, f) => `<style>${readFileSync(f, 'utf8')}</style>`);
inl(/<script type="importmap">.*?<\/script>/s, () => '');
inl(/<script src="touch-zoom-guard\/touch-zoom-guard.js"><\/script>/, () => `<script>${readFileSync('touch-zoom-guard/touch-zoom-guard.js', 'utf8')}</script>`);
inl(/<script type="module" src="js\/[a-z]+\.js"><\/script>/, () => `<script>window.SINGLE_FILE = 1;</script><script type="module">${js}</script>`); // (a single file has no viewer.html beside it)
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0), 'KB');
