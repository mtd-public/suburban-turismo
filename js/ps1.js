// The PS1 look, as a pipeline you can turn up and down (the art test's whole point is finding the right dose).
//
// What the original hardware did, and what each knob fakes:
//   * low resolution      — the scene renders into a small target (240 lines by default) and is blown up with
//                           nearest-neighbour filtering. Everything else is judged at that size.
//   * vertex jitter       — the GTE had no sub-pixel precision: vertices snap to whole pixels, so geometry
//                           shimmers and "swims" as the camera moves. Done in the vertex shader (snap clip xy).
//   * affine textures     — the GPU interpolated UVs in screen space, without the perspective divide, so
//                           textures bend across big polygons near the camera. We pass uv·w and w and divide in
//                           the fragment shader; `affine` blends between that and the correct mapping.
//   * 15-bit colour       — 5 bits per channel with the hardware's 4×4 ordered dither. Done in the post pass.
//   * fog / draw distance — everything fades into a flat haze colour, and the far plane is short.
//   * nearest textures    — no bilinear, no mipmaps: crunchy, pixel-exact texels.
//
// All lighting is computed in display space (ColorManagement off), the way a 1997 game would have.
import * as THREE from 'three';

export const PS1 = {
  lines: 240,      // vertical resolution of the internal target (240 = the PS1's interlace-free mode)
  jitter: 1,       // 0..1: how hard vertices snap to the low-res pixel grid
  affine: 0.65,    // 0..1: 0 = perspective-correct, 1 = full PS1 texture warp (big floor polys bend a lot)
  dither: 1,       // 0/1: 15-bit colour with the 4×4 ordered dither
  colorBits: 5,    // bits per channel when dithering
  fogNear: 60,     // m: fog starts…
  fogFar: 230,     // m: …and is total here (the far plane sits just past it)
};

THREE.ColorManagement.enabled = false;

// Shared uniforms: every patched material reads these, so the settings panel updates the whole scene at once.
export const U = {
  uSnap: { value: new THREE.Vector2(320, 240) },
  uJitter: { value: PS1.jitter },
  uAffine: { value: PS1.affine },
};

// Patch a built-in material (Lambert / Basic) with vertex snapping and affine texture mapping.
export function ps1ify(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSnap; uniform float uJitter; uniform float uAffine; varying float vAffW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 p = gl_Position;
          if (p.w > 0.0) {
            vec2 ndc = p.xy / p.w;
            vec2 snapped = floor(ndc * uSnap * 0.5 + 0.5) / (uSnap * 0.5);
            p.xy = mix(ndc, snapped, uJitter) * p.w;
            gl_Position = p;
          }
        }`)
      .replace(/}\s*$/, `
        vAffW = mix(1.0, gl_Position.w, uAffine);
        #ifdef USE_MAP
          vMapUv *= vAffW;
        #endif
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAffW;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv / vAffW );
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'ps1';
  return mat;
}

// Cached materials: one per (kind, colour, texture, flags) — shared materials, few programs (template rule 7).
const cache = new Map();
export function lam(color = 0xffffff, map = null, opts = {}) {
  const key = `L${color}|${map?.uuid}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, ps1ify(new THREE.MeshLambertMaterial({ color, map, ...opts })));
  return cache.get(key);
}
export function basic(color = 0xffffff, map = null, opts = {}) {
  const key = `B${color}|${map?.uuid}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, ps1ify(new THREE.MeshBasicMaterial({ color, map, ...opts })));
  return cache.get(key);
}

// A canvas texture with PS1 sampling: nearest, no mipmaps, wraps.
export function canvasTex(w, h, paint, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The renderer: scene → small target → dither/quantize → screen (nearest upscale).
export class PS1Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.r.setPixelRatio(1);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uDither: { value: 1 }, uLevels: { value: 31 }, uFlip: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene; uniform vec2 uRes; uniform float uDither; uniform float uLevels; uniform float uFlip; varying vec2 vUv;
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return (float(m[i]) + 0.5) / 16.0 - 0.5;
        }
        void main() {
          vec2 px = floor(vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y) * uRes);
          vec3 c = texture2D(tScene, (px + 0.5) / uRes).rgb;
          if (uDither > 0.5) c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5 + bayer(px)) / uLevels;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.native = false;
  }
  resize(w, h) {
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    const lines = this.native ? h : PS1.lines;
    const lw = Math.max(1, Math.round(lines * (w / h))), lh = Math.max(1, Math.round(lines));
    this.rt.setSize(lw, lh);
    this.post.uniforms.uRes.value.set(lw, lh);
    U.uSnap.value.set(lw, lh);
  }
  render(scene, cam) {
    this.post.uniforms.uDither.value = PS1.dither;
    this.post.uniforms.uLevels.value = (1 << PS1.colorBits) - 1;
    U.uJitter.value = PS1.jitter;
    U.uAffine.value = PS1.affine;
    this.r.setRenderTarget(this.rt);
    this.r.render(scene, cam);
    this.r.setRenderTarget(null);
    this.r.render(this.postScene, this.postCam);
  }
  // A second, smaller view drawn over the frame at (x, y, w, h) CSS px from the top-left, at the same PS1 line
  // density, mirrored left-right (a rear-view mirror).
  renderInset(scene, cam, x, y, w, h, flip = true) {
    if (!this.rt2) {
      this.rt2 = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.post2 = this.post.clone(); this.post2.uniforms.tScene.value = this.rt2.texture;
      this.postScene2 = new THREE.Scene(); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post2); q.frustumCulled = false; this.postScene2.add(q);
    }
    const lh = Math.max(16, Math.round((this.native ? this.h : PS1.lines) * h / this.h)), lw = Math.max(16, Math.round(lh * w / h));
    this.rt2.setSize(lw, lh);
    const P = this.post2.uniforms; P.uRes.value.set(lw, lh); P.uFlip.value = flip ? 1 : 0; P.uDither.value = PS1.dither; P.uLevels.value = (1 << PS1.colorBits) - 1;
    const snap = U.uSnap.value.clone(); U.uSnap.value.set(lw, lh);
    this.r.setRenderTarget(this.rt2); this.r.render(scene, cam); this.r.setRenderTarget(null);
    U.uSnap.value.copy(snap);
    const vy = this.h - y - h;
    this.r.setViewport(x, vy, w, h); this.r.setScissor(x, vy, w, h); this.r.setScissorTest(true);
    this.r.autoClear = false; this.r.render(this.postScene2, this.postCam); this.r.autoClear = true;
    this.r.setScissorTest(false); this.r.setViewport(0, 0, this.w, this.h);
  }
}
