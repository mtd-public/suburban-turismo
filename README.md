# Suburban Turismo

A late-90s console racer set in the suburbs: the cul-de-sac, the park, McDaniel's drive-thru, the outdoor mall and
the CityMart lot. Realistic PS1-era low-poly art (Driver, The Getaway, early Gran Turismo, Ridge Racer); the humour
comes from the cast and the mechanics. Pedestrians never die, but they ragdoll, yell, and chase you when you've
made them angry.

**Status: phase 2, playable.** Races, time trials and the final level are in; pedestrians (ragdoll, yell, chase)
are next. See [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) for the look and [docs/art-test/](docs/art-test/)
for screenshots.

## Live

https://mtd-public.github.io/suburban-turismo/ (the game) and https://mtd-public.github.io/suburban-turismo/viewer.html (the art test), deployed from `main` by `.github/workflows/deploy.yml`.

## Run

```
python3 -m http.server 8080
```

Open `http://localhost:8080` for the game, `http://localhost:8080/viewer.html` for the art test (locations, cars,
cast, the Routes map, free driving). No build step: three.js r160 is vendored and loaded through an import map
(the Dr. Mow / store-smash convention).

### The game (`index.html`, `js/game.js`)

| Mode | |
|---|---|
| Race | 3 laps against five of the neighbours (Karen, the Joneses, Brenda, Greg, Harold, Tyler), matched to your car so any car can win |
| Time Trial | 3 laps alone against a ghost: the pro's run first; once you beat it, the ghost is your own best (kept in the browser) |
| Motor Murder | the death match (Twisted Metal on a cul-de-sac): six cars on any circuit, a health bar over each, weapon pickups floating along the track; last car running wins, or the healthiest when the 3 minutes are up |
| The Last Run | the final level: one 1.6 km run through every location to the mall, seven police cruisers with flashing light bars behind you and roadblocks ahead (Blues Brothers) |

Motor Murder pickups (`js/combat.js`): a **fireworks box** (4 rockets a volley, a nudge of homing), a **frozen
turkey** (lobbed, bursts where it lands), a **vape cloud** (dropped behind you: blinds and chokes whoever drives
in), a **Home Work chainsaw** (bolted to your bumper for 8 s), comically large **truck nuts** (a mine dropped right
behind you) and the neighbour's **casserole** (+35 health). More fireworks: a **Roman candle** (five fireballs
straight ahead), **bottle rockets** (a swarm of ten that home in hard), the **mortar cake** (five shells lobbed onto
whoever's nearest, blooming in the sky on the way down) and a **firecracker string** (laid across the road behind
you; it pops and jolts anyone on it). Ramming and walls taken fast hurt too.

Season and time of day are on the title menu (or `?season=winter`, `?light=autumn|golden|overcast|dusk|night`). Winter repaints
the town (snowfields, slushy salted roads, iced ponds, bare trees and snowy pines), adds falling snow and exhaust
breath from every tailpipe. Night turns on the street lamps, headlights (a spot that lights the road ahead), tail
and brake lights.

Crashes (`js/fx.js`, `js/race.js`): a hard hit knocks both cars about by weight, spins the one struck, throws off
panels in its paint, trim, glass, sparks and the odd rolling hubcap, dents it, and a big one rolls it over. Sound
(`js/audio.js` on the shared WebAudio synth `js/sfx-synth.js`): a four-gear engine with shifts, tyre squeal, road
rumble, wind, rivals passing, sirens, crashes and every weapon. M mutes.

The menus and HUD are placeholders in Dr. Mow's toy-ink style (cream cards, ink outlines, Lilita One and Luckiest
Guy, bundled in `assets/fonts` with their licences).

Six circuits (`js/routes.js`): Whispering Pines GP, Drive-Thru Derby, Black Friday, Mall Crawl, Maple Parkway Grand
Prix, and The Last Run. Each is a see-through track layer over the town that goes on and off road, through glass,
hedges and the odd hydrant.

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Gas | W / ↑ | RT or A | GAS pedal |
| Brake, then reverse | S / ↓ | LT or B | BRAKE pedal |
| Steer | A D / ← → | left stick / d-pad | drag on the left half |
| Drift | brake + steer at speed | LT/B + steer | BRAKE + drag |
| Fire the held weapon (Motor Murder) | F / E | Y | FIRE |
| Camera (chase / bumper) | C | RB (Y outside Motor Murder) | 🎥 |
| Back on the track | R | Back | ↺ |
| Hop | Space | X | |
| Pause | Esc / P | Start | ❚❚ |
| Mute | M | | |

Menus take arrows + Enter / Esc, the stick or d-pad + A / B, or a tap. Back up and a rear-view mirror slides down.
URL parameters for testing: `?season=winter&light=night&mode=race|tt|combat&circuit=pines|drivethru|blackfriday|mallcrawl|grandprix|finale&car=minivan|sedan|hybrid|luxury|segway&auto=1`
(`auto=1`: the CPU drives you).

### The art test (`viewer.html`, `js/main.js`)

Tabs: Locations (a camera tour), Garage (the five vehicles), Cast, Drive (free driving: `G` jumps to the CityMart
lot, `R` resets props, `T` lays each circuit on the road), Routes (every circuit from overhead), and the PS1 ⚙
panel (resolution, jitter, affine warp, draw distance, dither, time of day). `1`–`5` switch tabs.

## Layout

| File | |
|---|---|
| `js/ps1.js` | the PS1 pipeline: low-res target, vertex snap, affine UVs, 15-bit dither, cached materials |
| `js/tex.js` | every texture, painted in code at PS1 sizes with photo-style grain and grime |
| `js/geo.js` | textured boxes, ground patches, decals, billboard trees, the static merge |
| `js/cars.js` | the five vehicles (smoothed, tapered, bevelled profile-extruded bodies, painted sides, lamps, rims, night lights) |
| `js/people.js` | the cast: rig, painted faces and clothes, procedural poses |
| `js/town.js` | the town: Maple Parkway and the five locations (CityMart is hollow and drivable), plus the collision world |
| `js/routes.js` | the race circuits: waypoints, smooth closed racing lines, the see-through track layer, `onTrack` (keeps trees and parked cars off the line) |
| `js/props.js` | things you can hit: loose props that tumble and settle, smashable glass, shelves that shed stock |
| `js/game.js` | the game: modes, the race loop, cops, cameras (chase / bumper / mirror), HUD and speedometer, menus |
| `js/combat.js` | Motor Murder: pickups, weapons (rockets, turkey, vape cloud, chainsaw, truck nuts, Roman candle, bottle rockets, mortar cake, firecrackers), health bars, ramming damage, wrecks, the CPU's fighting |
| `js/race.js` | a race on a circuit: progress and laps, the CPU drivers, car-to-car bumps, ghosts, the pro's simulated run |
| `js/controls.js` | racing input: keyboard, gamepad (analog steer, triggers), touch (steer drag, pedals), menu navigation |
| `js/audio.js`, `js/sfx-synth.js` | the car sound: engine, gears, squeal, rumble, sirens, crashes, weapons, on a small WebAudio synth (shared with store-smash) |
| `js/fx.js` | falling snow and crash wreckage (panels, glass, hubcaps, sparks) |
| `js/stage.js` | the shared world: renderer, scene and light presets, town, collision world, props, the cast |
| `js/main.js` | the viewer: modes, cameras, lighting presets, Driver-style HUD and minimap |
| `js/drive.js`, `js/world.js`, `js/input.js`, `js/tuning.js`, `js/utils.js` | from store-smash (Dr. Mow's controller) |
| `tools/shots.mjs` | headless screenshots of every view; fails on console errors or page scroll |
| `tools/inline.mjs` | optional single-file HTML build for sharing previews |

## Verify

```
python3 -m http.server 4180 &
node tools/play.mjs           # the game: menus, a race, a time trial, the final level and a Motor Murder match on autopilot, mirror, drift, phone
node tools/lines.mjs          # every circuit's racing line against the walls and posts (must be clear)
node tools/shots.mjs          # the art test: every view; 0 console errors, no page scroll on a phone
ONLY=smash node tools/shots.mjs   # drives through CityMart's glass; fails if nothing breaks
```
