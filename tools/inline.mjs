// Single-file build (for sharing the art test as one HTML page): bundles js/main.js + three.js with esbuild and
// inlines the CSS and the touch-zoom-guard kit. The repo itself needs no build step; this is only for previews.
// Usage: node tools/inline.mjs out.html   (needs esbuild: `npx esbuild` must work, or set ESBUILD=/path/to/esbuild)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || 'dist/suburban-turismo-art-test.html';
const esb = process.env.ESBUILD || 'npx';
const args = [...(esb === 'npx' ? ['esbuild'] : []), 'js/main.js', '--bundle', '--format=esm', '--minify', '--alias:three=./js/vendor/three.module.min.js', '--log-level=warning'];
const js = execFileSync(esb, args, { maxBuffer: 64 << 20 }).toString().replace(/<\/script/g, '<\\/script');
let html = readFileSync('index.html', 'utf8');
const inl = (re, f) => { html = html.replace(re, f); };
inl(/<link rel="stylesheet" href="touch-zoom-guard\/touch-zoom-guard.css">/, () => `<style>${readFileSync('touch-zoom-guard/touch-zoom-guard.css', 'utf8')}</style>`);
inl(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>${readFileSync('css/style.css', 'utf8')}</style>`);
inl(/<script type="importmap">.*?<\/script>/s, () => '');
inl(/<script src="touch-zoom-guard\/touch-zoom-guard.js"><\/script>/, () => `<script>${readFileSync('touch-zoom-guard/touch-zoom-guard.js', 'utf8')}</script>`);
inl(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">${js}</script>`);
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0), 'KB');
