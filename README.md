# Suburban Turismo

A late-90s console racer set in the suburbs: the cul-de-sac, the park, McDaniel's drive-thru, the outdoor mall and
the CityMart lot. Realistic PS1-era low-poly art (Driver, The Getaway, early Gran Turismo, Ridge Racer); the humour
comes from the cast and the mechanics. Pedestrians never die, but they ragdoll, yell, and chase you when you've
made them angry.

**Status: phase 1, the art-style test.** No gameplay yet. See [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) for
the direction and the open questions, and [docs/art-test/](docs/art-test/) for screenshots.

## Run

```
python3 -m http.server 8080
```

Open `http://localhost:8080`. No build step: three.js r160 is vendored and loaded through an import map (the Dr. Mow
/ store-smash convention).

| Tab | What it shows |
|---|---|
| Locations | a slow camera tour of each sample location (◀ ▶ step through views) |
| Garage | the five test vehicles on a turntable |
| Cast | each suburban character, framed where they live |
| Drive | drive any of the five round the town: WASD / arrows / stick, Space hops, ◀ ▶ swaps vehicle, `G` jumps to the CityMart lot, `R` puts every knocked prop and broken pane back |
| PS1 ⚙ | the PS1 dose live: resolution, vertex jitter, affine warp, draw distance, dither, full-res compare, time of day |

Keys: `1`–`4` switch tabs, `[` `]` (or `B` `N`) step, `P` opens the PS1 panel. URL parameters for screenshots:
`?mode=tour|garage|cast|drive&i=N&cam=N&light=autumn|golden|overcast|dusk&ps1=0&ui=0`.

## Layout

| File | |
|---|---|
| `js/ps1.js` | the PS1 pipeline: low-res target, vertex snap, affine UVs, 15-bit dither, cached materials |
| `js/tex.js` | every texture, painted in code at PS1 sizes with photo-style grain and grime |
| `js/geo.js` | textured boxes, ground patches, decals, billboard trees, the static merge |
| `js/cars.js` | the five vehicles (profile-extruded bodies, painted sides, decal lamps, rims) |
| `js/people.js` | the cast: rig, painted faces and clothes, procedural poses |
| `js/town.js` | the town: Maple Parkway and the five locations (CityMart is hollow and drivable), plus the collision world |
| `js/props.js` | things you can hit: loose props that tumble and settle, smashable glass, shelves that shed stock |
| `js/main.js` | the viewer: modes, cameras, lighting presets, Driver-style HUD and minimap |
| `js/drive.js`, `js/world.js`, `js/input.js`, `js/tuning.js`, `js/utils.js` | from store-smash (Dr. Mow's controller) |
| `tools/shots.mjs` | headless screenshots of every view; fails on console errors or page scroll |
| `tools/inline.mjs` | optional single-file HTML build for sharing previews |

## Verify

```
python3 -m http.server 4180 &
node tools/shots.mjs          # shots/ — 0 console errors, no page scroll on a phone
ONLY=smash node tools/shots.mjs   # drives through CityMart's glass; fails if nothing breaks
```
