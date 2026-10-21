// The world both entry points share (the game, js/game.js, and the art test, js/main.js): the PS1 renderer, the
// scene and its light presets, the sky, the town and its collision world, the things you can hit, and the cast
// standing where they live.
import * as THREE from 'three';
import { PS1, PS1Renderer, basic } from './ps1.js';
import * as T from './tex.js';
import { FOLIAGE, TREES } from './geo.js';
import { buildTown } from './town.js';
import { buildVehicle, VEHICLES } from './cars.js';
import { buildPerson, CAST_ORDER } from './people.js';
import { createWorld, groundAt } from './world.js';
import { HANDLING } from './tuning.js';
import { Props } from './props.js';

export const LIGHTS = {
  autumn: { name: 'Autumn afternoon', sun: 0xffe0b4, si: 1.0, dir: [-0.55, 0.6, 0.5], sky: 0xc4d0e4, ground: 0x6e5c46, hi: 0.55, fog: 0xd6ccba, near: 1, zenith: '#5d82bc', horizon: '#c6cdd6', haze: '#ddd2c0', leaf: 0xf4ece0, cloud: '#ffffff' },
  golden: { name: 'Golden hour', sun: 0xffb46a, si: 1.15, dir: [-0.8, 0.28, 0.3], sky: 0xc8a894, ground: 0x4a3a30, hi: 0.5, fog: 0xe2b48c, near: 0.85, zenith: '#5a6ea6', horizon: '#e4ae84', haze: '#f2c494', leaf: 0xffd6a8, cloud: '#ffe0c0' },
  overcast: { name: 'Overcast (Driver)', sun: 0xdadee2, si: 0.45, dir: [-0.3, 0.8, 0.4], sky: 0xbcc0c8, ground: 0x6c6860, hi: 0.8, fog: 0xb6bac0, near: 0.6, zenith: '#8a929e', horizon: '#b4b8be', haze: '#bcc0c4', leaf: 0xbcbcbc, cloud: '#d8dade' },
  dusk: { name: 'Dusk, streetlights on', sun: 0x7a80b8, si: 0.3, dir: [0.4, 0.3, -0.6], sky: 0x46507a, ground: 0x1e1c24, hi: 0.5, fog: 0x2e3450, near: 0.55, zenith: '#141c3a', horizon: '#3e4670', haze: '#7a6070', leaf: 0x4a4a64, cloud: '#5a5a7a', lamps: true },
  night: { name: 'Night', sun: 0x6a7aaa, si: 0.14, dir: [0.3, 0.75, -0.4], sky: 0x2a3050, ground: 0x0a0a10, hi: 0.3, fog: 0x0c101c, near: 0.5, zenith: '#04060e', horizon: '#121828', haze: '#1c2032', leaf: 0x2c3044, cloud: '#1e2234', lamps: true, night: true },
};
// Winter over any time of day: colder and whiter, the fog closer (it's snowing), the sky a flat grey.
function wintry(L) {
  if (L.night) return { ...L, name: `${L.name} (winter)`, fog: 0x161c2a, ground: 0x2a3040, hi: 0.4, near: L.near * 0.75 };
  if (L.lamps) return { ...L, name: `${L.name} (winter)`, fog: 0x3e4662, ground: 0x4a5070, near: L.near * 0.75, haze: '#6e6a80', cloud: '#7a7a90' };
  return { ...L, name: `${L.name} (winter)`, sun: 0xe8eef8, si: L.si * 0.85, sky: 0xd4dbe6, ground: 0xb8c0cc, hi: 0.75, fog: 0xd6dce6, near: L.near * 0.72, zenith: '#8e9cb4', horizon: '#cfd5df', haze: '#e2e6ee', leaf: 0xffffff, cloud: '#f2f4f8' };
}

// The controller numbers for one vehicle (HANDLING.car with the vehicle's overrides and its own body circles).
export function handlingFor(key) {
  const S = VEHICLES[key], len = S.len;
  return { ...HANDLING.car, ...S.handling, CIRCLES: S.segway ? [[0, 0.45]] : [[len * 0.27, S.width / 2], [0, S.width / 2], [-len * 0.27, S.width / 2]], WALL_MARGIN: S.segway ? 0.4 : S.width / 2 };
}

export function createStage(canvas) {
  const R = new PS1Renderer(canvas);
  R.r.useLegacyLights = true; // (intensity 1 = full colour: the numbers read like 1997's)
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.5, 450);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5), sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xcccccc, PS1.fogNear, PS1.fogFar);
  const skyMat = basic(0xffffff, null, { fog: false, depthWrite: false, side: THREE.BackSide });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2 + 0.25), skyMat);
  skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);

  const town = buildTown();
  scene.add(town.group, town.pools);
  const stage = { R, scene, cam, sun, hemi, skyDome, town, light: 'autumn' };
  stage.applyLight = (k) => {
    stage.light = k; const L = T.WINTER ? wintry(LIGHTS[k]) : LIGHTS[k];
    sun.color.setHex(L.sun); sun.intensity = L.si; sun.position.set(...L.dir).multiplyScalar(100);
    hemi.color.setHex(L.sky); hemi.groundColor.setHex(L.ground); hemi.intensity = L.hi;
    scene.fog.color.setHex(L.fog); scene.fog.near = PS1.fogNear * L.near; scene.fog.far = PS1.fogFar * L.near;
    skyMat.map = T.sky({ name: k, ...L }); skyMat.needsUpdate = true;
    town.pools.visible = !!L.lamps;
    for (const f of FOLIAGE) f.color.setHex(L.leaf);
  };

  const W = createWorld({ plats: [...town.plats, ...town.glass.map((g) => g.plat)], posts: [...town.posts] });
  // things to hit: loose props, the shop glass, shelf stock
  const props = new Props(scene, W);
  for (const [k, x, z, ry] of town.dyn) props.spawn(k, x, z, ry ?? 0);
  for (const g of town.glass) { scene.add(g.mesh); props.addGlass(g.mesh, g.plat); }

  const people = {};
  for (const k of CAST_ORDER) {
    if (k === 'dale') continue; // (Dale rides his Segway)
    const s = town.spots[k]; if (!s) continue;
    const p = buildPerson(k); p.position.set(s.x, groundAt(W, s.x, s.z, 3).h, s.z); p.rotation.y = s.ry; scene.add(p);
    p.userData.spot = s; people[k] = p;
  }
  const dale = buildVehicle('segway'); { const s = town.spots.dale; dale.position.set(s.x, groundAt(W, s.x, s.z, 3).h, s.z); dale.rotation.y = s.ry; scene.add(dale); }
  Object.assign(stage, { W, props, people, dale });
  return stage;
}

// For an overhead map only: flat tree crowns (the crossed quads vanish edge-on from above) and grass to the edge
// of any framing. Hidden until a map shows it.
export function buildMapExtras(scene) {
  const mapExtras = new THREE.Group(); mapExtras.visible = false; scene.add(mapExtras);
  const byMat = new Map();
  for (const t of TREES) { const k = `${t.tone}|${t.seed}`; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(t); }
  const dummy = new THREE.Object3D();
  for (const list of byMat.values()) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), basic(0xffffff, T.foliage(list[0].tone, list[0].seed), { alphaTest: 0.5 }), list.length);
    list.forEach((t, i) => { dummy.position.set(t.x, 6 * t.s, t.z); dummy.rotation.y = t.seed; dummy.scale.setScalar(7.5 * t.s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    mapExtras.add(m);
  }
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), basic(0xffffff, T.grass(false, 0)));
  g.material.map = g.material.map.clone(); g.material.map.repeat.set(250, 250); g.material.map.needsUpdate = true; g.position.y = -0.3; mapExtras.add(g);
  return mapExtras;
}
