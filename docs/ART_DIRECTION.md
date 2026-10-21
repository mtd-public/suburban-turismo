# Suburban Turismo — art direction

> **The pitch.** A late-90s console racer about the suburbs, played completely straight by the art and
> completely unhinged by the rules. It should look like a lost 1999 PlayStation disc you'd rent from Blockbuster —
> Driver's streets, Gran Turismo's car-lot pride, The Getaway's grey realism — pointed at a cul-de-sac in October.
> The humour lives in *what* is there (Karen, the HOA, "SAVE MORE · THINK LESS") and in the mechanics, never in
> how it's drawn. Relaxing, warm, high-effort. Nothing cartoony.

This is the reference for everything visual. The art test in this repo (`index.html`) is the living version: open
it, press **PS1 ⚙** and every knob below is live.

## 1. The five rules

1. **Detail lives in textures, not polygons.** A car is ~300 polygons; its door shut lines, handles, rocker
   shadow, window frames and headrests are *painted*. A house is five boxes; its siding, shutters, curtains and
   gutters are painted. When something looks plain, paint it — don't model it.
2. **Every texture looks photo-sourced.** Desaturated, gritty, lit and dirtied in the paint: per-pixel grain,
   low-frequency blotches, ambient occlusion baked along the bottom, rain streaks down walls, grime behind
   wheels. No flat fills, ever (flat fills are exactly what makes low-poly look like a toy).
3. **Realistic proportions.** People are ~7.5 heads tall, cars are their real dimensions (the minivan is 5.1 m,
   the luxury car 5.25 m), buildings are their real size. Exaggeration is for the gameplay.
4. **The PS1 artefacts are a seasoning.** Low resolution, wobbly vertices, warped textures, dither and fog are
   the flavour — dosed so the scene still reads as calm and pretty, not broken. (Defaults below.)
5. **Warmth over grit.** Driver was grey; we're suburban autumn. Warm sun, long hazy distance, saturated
   foliage against desaturated man-made stuff.

## 2. The PS1 pipeline (`js/ps1.js`)

| Artefact | How it's faked | Default | Why that dose |
|---|---|---|---|
| Low resolution | scene renders into a small target, blown up with nearest-neighbour | 240 lines | the real PS1 mode; 360 is the "remaster" setting |
| Vertex jitter | clip-space xy snapped to the low-res pixel grid in the vertex shader | 1.0 | it's what makes it *move* like a PS1; it's subtle at 240p |
| Affine textures | uv·w / w passed separately and divided in the fragment shader | 0.65 | full warp (1.0) makes near ground swim too much; ground meshes are subdivided every 4 m like the real games did |
| 15-bit colour | 5 bits per channel with the hardware's 4×4 ordered dither, in the post pass | on | the dither is the texture of the era |
| Fog / draw distance | linear fog into the sky's haze colour; far plane just past it | 60 → 230 m | hides pop-in, gives the hazy late-afternoon depth |
| Nearest textures | no bilinear, no mipmaps | always | crunchy texels; the sky is the one smooth thing (PS1 skies were gradients) |
| No real shadows | blob shadows under cars and people | always | exactly what the era did |
| Lighting | Lambert in display space (colour management off) | — | lighting maths the way a 1997 game did it |

Near-coplanar ground layers (grass → asphalt → paint/leaves) fight under vertex jitter at grazing angles (the PS1
had no z-buffer and just drew them in order), so each layer gets a depth-slope polygon offset (`OFF1`, `OFF2` in
`js/geo.js`).

## 3. Palette and light

- **Man-made:** desaturated and slightly warm — concrete `#a8a59c`, asphalt `#4a4a4c`/`#5c5c5a`, siding in
  beige, grey-blue, sage, cream, butter; brick `#8a4a38`. Signage is the only loud colour in the built world.
- **Autumn:** `FALL` in `js/tex.js` — pumpkin orange, maple red, birch yellow, ochre, olive, deep red and a little
  leftover green. Trees are always a mix; a street should never be one colour.
- **Grass:** a warm, slightly tired green, mowing stripes on front lawns (a nod to Dr. Mow).
- **Times of day** (PS1 panel): *Autumn afternoon* (default — warm sun, hazy blue sky), *Golden hour*, *Overcast
  (Driver)* and *Dusk* (dim, with additive light pools under every street lamp — the classic PS1 night trick).

## 4. Vehicles (`js/cars.js`)

Built the Gran Turismo way: a side profile with real wheel-arch cut-outs extruded and chamfered; a greenhouse
extruded narrower and pulled in at the top (tumblehome); decal planes for lamps, grilles and plates; 10-sided
wheels with painted rims. Vertex colours bake shading toward the sills.

| | Name | Read |
|---|---|---|
| Minivan | *The Odyssey of Errands* | champagne, sliding-door track, three side windows, roof rails, plastic hubcaps, plate SOCCRMOM |
| Sedan | *The Accordance* | 90s hunter green, steel wheels, three-box, chrome grille bars, plate DADBOD |
| Hybrid | *The Pious* | pearl white doorstop, Kamm tail with the glass strip, aero covers, plate SMUG 1 |
| Luxury | *The Jones S-Klasse* | black, long hood, big chrome grille, chrome window trim and moulding, five-spoke alloys, plate JONES 1 |
| Segway | *Officer Dale's* | ridden by Dale (Promenade Mall Security), leans with speed |

Parked traffic reuses the same models in a limited palette of realistic period colours.

## 5. People (`js/people.js`)

Seventeen rounded parts on a joint tree (8-sided trunk, 6-sided limbs, a sphere head with a wrap-around face texture, hair caps, a domed shoulder line and deltoids so the arms grow out of the torso instead of hanging off a shelf), realistic proportions, painted faces (32×40), clothes with
collars, plackets, quilting, name tags. Character comes from **silhouette props + pose**: Karen's inverted bob,
sunglasses parked on her head, phone to the ear and the other hand jabbing at you; Harold's bucket hat, clipboard
and socks-with-sandals; the Joneses' matching smugness. Poses are procedural and loop (idle, gesture, power-walk).

Cast: Karen · Mr. & Mrs. Jones · HOA Harold · Brenda (soccer mom) · Grill Dad Greg · Bev & Ron (mall walkers) ·
Tyler (McDaniel's, Window 2) · Doris (CityMart greeter) · Officer Dale (Segway).

Phase 2 (not in this test): ragdoll on hit (they never die), a yell, aggro → chase → block the road.

## 6. Places (`js/town.js`)

One stretch of Maple Parkway with a sample of each location along it:

- **Whispering Pines Ct.** — the autumn cul-de-sac: one- and two-storey colonials and ranches, brick-and-siding
  mixes, shutters, porches with pumpkins, mums and a hay bale, raked piles, leaf litter on every lawn and in the
  gutters, garages open (beer fridge, bike, mower, boxes — painted in) and closed, bins out, back fences, a
  monument sign, an island tree in the bulb.
- **Founders Park** — pond, gazebo, playground on mulch, path loop, benches, a U9 soccer field.
- **McDaniel's** — brick box with a red mansard band, a burger on a pole (no arches), drive-thru lane round the
  back past the menu board and speaker to Window 2.
- **The Promenade at Maple Creek** — the outdoor mall: colonnade, awnings, parody storefronts (Bed, Bath &
  Bewildered; The Gap Year; Aberdeen & Finch…), a fountain plaza, planter trees. Four of the shops are hollow: smash the window, drive through the fixtures
  (housewares gondolas, apparel rounders and mannequins, novelty shelves, a TV wall) and out the open loading door to
  a service lane with dumpsters behind the row, which loops back to the lot down both ends.
- **CityMart** — a tilt-up box the size of a county, two vestibules, the big sign, a lot with light poles, cart
  corrals and islands, a garden centre behind chain-link, a propane cage and a BLOCKBOX kiosk. Nobody parks in
  front of the doors, so there's a straight run from the road to the glass.
- **CityMart (inside)** — drive through either vestibule's glass into a Super-centre: numbered checkouts across
  the front, an action alley of soda towers and pumpkin bins, produce, six grocery aisles, reach-in freezers down
  the west and back walls, toy and home aisles, apparel rounders with mannequins, a TV wall that all shows the same
  picture, pharmacy at the back, hanging blue department signs, rows of fluorescent fixtures under a corrugated deck.
- Between them: autumn woods, and a painted treeline ring on the horizon (with the water tower).

## 7. Race circuits (`js/routes.js`)

The circuits are a race layout laid over the town, not its street plan. Each is a smooth closed racing line
through a handful of waypoints, drawn as a see-through band (red-and-white kerb edges, chevrons, a chequered start)
that takes the road where the road is good and cuts across lawns, lots, woods and through shops where that's more
fun. Trees and parked cars are kept off the line; every other thing on it (carts, bins, glass, shelves) is an
obstacle on purpose. The **Routes** tab shows them from overhead; in Drive, `T` lays each one on the ground.

| # | Circuit | Length | Where it goes |
|---|---|---|---|
| 1 | Whispering Pines GP | 0.54 km | up the cul-de-sac, round the island tree, back down across the west lawns, over the parkway, round the duck pond |
| 2 | Drive-Thru Derby | 0.31 km | tight: the drive-thru lane, Window 2, the dumpster pen, the far side of the lot, a blast on the parkway |
| 3 | Black Friday | 0.43 km | in through CityMart's west glass, down the action alley, out the east glass, a lap of the parking field |
| 4 | Mall Crawl | 0.38 km | the plaza, through Spenser's window and out the loading door, the service lane, back through Bed, Bath & Bewildered |
| 5 | Maple Parkway Grand Prix | 1.10 km | a lap of the whole town, CityMart and the woods included |
| 6 | The Last Run (final level) | 1.6 km, one run | every location in order, ending through Sharper Imagery's front window at the mall; seven police cruisers (black-and-white, flashing light bars with glow) chase and ram, roadblocks of parked cruisers on the way. The Blues Brothers mall chase is the reference |

## 8. Things you can hit (`js/props.js`)

Crashes are a reaction, not a simulation: every loose prop is one rigid body with a cheap impulse, gravity, spin and
a bounce off walls, then it settles where it lands.

- **Loose props:** shopping carts, wheelie bins, cones, pumpkins, leaf bags, news boxes, cardboard boxes, soda
  towers, produce bins, mannequins. Hit them and they fly, tumble and roll to a stop (weight decides how far: a
  pumpkin goes further than a bin).
- **Glass:** CityMart's vestibule panes and the windows of four Promenade shops (Bed, Bath & Bewildered, The Gap Year,
  Spenser's Gifts, Sharper Imagery) shatter into shards (with a *SMASH!*) when you hit them above a walking pace; below
  that they're a wall.
- **Shelves:** crash into a gondola and its stock comes off the shelf in a spray of products.
- **Bushes and hedges** go flat under you in a spray of leaves (and cost a little speed); **fire hydrants** pop off
  and blow a wobbling water column with a rain of drops for ~12 s; **stray carts** wander the lots on their own.
- `R` puts everything back.

The pedestrian ragdolls (phase 2) will use the same impulse code on the rig's joints.

## 9. HUD

Driver's: big yellow serif labels over thin bordered bars (**Damage**, **HOA Complaints** — drive on a verge and
watch it climb), a wireframe minimap in a blue frame, tyre smoke when you slide. Menus are dark translucent slabs
with a hairline gold border, Georgia serif.

## 10. Reuse from the family

- `js/drive.js`, `js/world.js`, `js/utils.js`, `js/input.js`, `js/tuning.js` — store-smash's controller (itself
  Dr. Mow's mower step): the same body code drives all five vehicles with per-vehicle handling numbers.
- `touch-zoom-guard/` — the template kit.
- three.js r160 vendored, import map, no build step (Dr. Mow / store-smash convention).

## 11. Style review: decisions

1. ~~PS1 dose~~ — decided: 240p with full wobble (the defaults below).
2. ~~Time of day~~ — decided: Autumn afternoon by default, Golden hour as an option.
3. ~~People~~ — decided: rounder (8-sided trunks, 6-sided limbs, sphere heads with wrap textures, hair caps).
4. ~~Car paint~~ — decided: realistic period colours.
5. ~~Shoulders~~ — decided: rounded and fitted to the torso.
6. CityMart is drivable inside, through glass you can smash; props react to crashes.
7. Four Promenade shops are drivable too: in through the window, out through the loading door to a service lane.
8. Race circuits are a layout over the town, free to go off-road (proposed: the five above).
