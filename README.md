# Fairway Legends ⛳

A complete, original 3D arcade golf game for the browser. Pull back and release to swing, compete against AI rivals with their own personalities, earn coins, open club packs, collect 59 clubs with unique abilities, unlock four courses and dress up your golfer.

Built with **TypeScript + React + Vite + Three.js**. It needs no backend, no account and no paid services. Everything runs client-side, and progress is saved in the browser.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from devices on your network)
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the production site into `dist/` |
| `npm run preview` | Serves the production build locally (`http://localhost:4173`) |
| `npm test` | Runs the unit/simulation test suite (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run e2e` | Browser end-to-end test (see *Testing*) |

Requires Node 18+ (developed on Node 22).

## Deploying

The build output is a static site (`dist/`) with relative asset paths, so it can be hosted anywhere.

* **Vercel:** import the repository; `vercel.json` is included (build `npm run build`, output `dist`). Or run `npx vercel --prod`.
* **Netlify:** import the repository; `netlify.toml` is included. Or run `npx netlify deploy --prod --dir=dist` after `npm run build`.
* **GitHub Pages / any static host:** upload the contents of `dist/`. No server rewrites are needed (the game has no client-side URL routes).

## How to play

* **Aim:** drag left/right anywhere on the course, use the ◀ ▶ buttons (hold for repeat), the keyboard arrows, or tap the mini-map to aim at a spot. In the overhead cameras you can also tap the ground.
* **Swing:** press the white ball button (bottom right) and **pull down**. Pull distance sets power; past the white line is *overpower* (more distance, faster needle, smaller sweet spot).
* **Timing:** while you pull, a needle sweeps across the arc. Release while it is in the **green zone** for a *PERFECT* strike (no direction error and a small distance bonus). Releasing in the yellow or red zone hooks or slices the ball and loses distance.
* **Shot shaping (level 3+):** pull diagonally, or use the Draw/Fade buttons. **Trajectory (level 4+):** Low/Mid/High.
* **Putting:** green slope arrows show which way the ball breaks (steeper = redder). Putting power shows the distance the ball would roll on a *flat* green. Some putters (e.g. the Oracle) reveal the real line.
* **Cameras:** 🎥 cycles behind-the-ball, target/landing-zone, green and overview cameras. During flight the camera follows the ball and then cuts to a landing camera.
* Keyboard: ←/→ aim (Shift = coarse), ↑/↓ club, `C` camera, `Space` skip, `Esc` pause.

## Feature overview

### Golf simulation (`src/golf/`)
* Purpose-built fixed-timestep (240 Hz) ball physics: gravity, quadratic aerodynamic drag, Magnus lift and side spin (draw/fade/hook/slice), spin decay, wind (stronger with height), Coulomb-friction bounces with backspin "check", rolling resistance per surface, slopes, cup capture with lip-outs, trees (trunk and canopy), rocks, water hazards (lateral drop), out of bounds (stroke and distance), bunkers and waste areas.
* The same deterministic simulation drives the player's shots, the AI's planning and the shot preview. Shots are simulated first and then **played back frame by frame** in 3D, so the ball always travels visibly; nothing teleports.
* Club carry is calibrated by solving for launch speed against the flight model, so club power stats translate predictably into yards.
* The preview shows the arc, landing zone and carry/total estimates. The landing-zone ellipse and how much of the wind the preview accounts for depend on club accuracy and abilities.
* Surfaces: tee, fairway, rough, deep rough, fringe, green, bunker, waste sand, water, OOB. Each has its own bounce, friction, roll and spin grip. Lies change distance, accuracy, spin and timing difficulty (uneven lies too).

### Courses (`src/data/courses/`)
Four themed courses with 9 hand-specified holes each. 18-hole rounds add a mirrored "back nine" with new pin positions, giving 72 distinct layouts:

| Course | Theme | Unlock |
| --- | --- | --- |
| Pinecrest Park | Parkland, wide fairways, ponds | Level 1 |
| Saltspray Cliffs | Seaside, ocean along the right, strong wind | Level 3 |
| Sunscorch Dunes | Desert, waste-sand rough, firm turf, rocks and cacti | Level 6 |
| Emerald Highlands | Mountain, steep terrain, creeks, fast sloped greens | Level 10 |

Holes are generated from compact specs (par, length, doglegs, elevation, bunkers, water, creeks, green slope). These become an analytic heightfield, surface map, trees and rocks, so the renderer, physics and AI all agree on the terrain.

### AI opponents (`src/golf/ai.ts`, `src/data/bots.ts`)
12 named bots in 3 difficulties (Beginner / Intermediate / Expert) × 4 archetypes (Power Hitter, Technician, Short-Game Specialist, All-Rounder), each with their own clubs and outfit. Bots:
* simulate candidate shots (club × power × aim, toward the pin or lay-up points) with the real physics and their own *misread* of the wind;
* score outcomes with a strokes-gained style expectation (distance, lie, hazards, trees) and weigh risk by personality;
* search aim and pace for putts on the real green slopes;
* then execute with skill-dependent timing/aim/power errors (plus occasional blunders for beginners), through the same shot code the player uses, club abilities included.

In automated rounds an expert typically shoots a few under par over nine holes and a beginner well over par.

### Clubs, abilities and the golf bag (`src/data/clubs.ts`, `src/data/abilities.ts`)
* 59 clubs across Drivers, Fairway Woods, Hybrids, Irons, Wedges and Putters, in five rarities. Each has seven stats: power, accuracy, control, loft, spin, forgiveness and ability strength.
* Every club has its **own named ability**, built as *trigger + effect(s) + magnitude*. Examples: "Afterburner" (perfect release → +carry), "Wind Cutter" (headwind → less wind effect), "Stone Skipper" (ball skips on water), "Comeback Kid" (when trailing → all-round boost), "Wide Cup" (bigger effective cup), "Excalibur" (approach shots home toward the flag). Abilities change the simulation; the HUD shows whether each one is active, conditional or inactive.
* Rarity raises the stat budget only modestly. Higher rarities mostly bring stronger or more specialised abilities and trade-offs (e.g. the Thunderclap driver is huge but wild).
* Bag rules: 1 driver, 1 wood, 1 hybrid, 3 irons, 2 wedges, 1 putter (putter required). The bag screen has filters, sorting, a catalog, side-by-side comparison, a "new" filter and upgrades.
* Duplicates become upgrade material (levels 1→5, +2 per stat per level, plus a coin cost). Duplicates of a maxed club convert to coins.

### Packs and economy (`src/data/packs.ts`, `src/data/economy.ts`)
* Starter (300), Premium (900), Elite (2200, from level 4) and a weekly rotating **Event Pack** (1200) with event-exclusive clubs and cosmetics.
* Exact per-slot odds are displayed and tested statistically; they always sum to 100% and every rarity has a drop pool. Rolls use `crypto.getRandomValues`.
* Only earned coins can be spent. **There are no real-money purchases.**
* Opening animation: shaking pack → per-card reveals with rarity-coloured bursts and sounds (bigger for Epic/Legendary) → summary with Equip buttons. Animations can be skipped.
* Rewards scale with holes played, course difficulty and opponent difficulty: completion, win bonus, placement, under-par, birdies (capped per round), eagles, holes-in-one, perfect strikes, level-up bonuses, achievements and daily challenges. Per-hole rewards are linear, so short rounds on the easiest course aren't an exploit.

### Progression
Player XP and levels unlock courses, opponent difficulties, shot shaping, trajectory control and 18-hole rounds. There are 23 achievements to claim, 3 daily challenges (rotating by date), a match history, career stats and best rounds.

### Character and cosmetics (`src/data/cosmetics.ts`, `src/game/golferModel.ts`)
* Modular low-poly 3D golfer built from parts: body style, skin tone, face, 11 hairstyles and hair colours are free.
* 60+ purchasable items across hats, shirts (polo, tee, stripes, argyle, floral, flame, vest), trousers/shorts/skorts/plaid, shoes, gloves, glasses, accessories (watch, chain, towel, scarf, cape…) and golf bags. Items carry rarity and collection labels.
* Rotatable 3D preview with try-on before buying. Cosmetics are purely visual and are shown on your golfer during play. Bots wear outfits from the same system.

### Presentation
* Three.js scene: sky dome shader, fog, hemisphere and sun lighting with a shadow camera that follows the action, painted surface textures (mowing stripes, anti-aliased edges), animated water shader, instanced trees/rocks/grass, OOB stakes, waving flag, distant mountains/mesas, clouds and a lighthouse on the coast.
* Cameras: hole fly-over intro, behind-the-ball, target, green, overview, ball-follow and landing cameras with smooth damping.
* HUD: hole card, live leaderboard, wind compass, mini-map (tap to aim), club selector, lie/elevation/carry chips, ability status, power bar and timing arc, shot messages (PERFECT, ability activated, Birdie…), hole summaries with commentary, scorecard and a final results screen with a reward breakdown.
* Synthesised Web Audio sound effects and ambient music (no audio files), each with an on/off setting.

### Saving (`src/state/`)
* Saved automatically to `localStorage` (versioned format, migrations in `MIGRATIONS`, validation and repair of damaged data, automatic backup copy, graceful handling of storage errors and private mode).
* **Browser-local saves are lost if you clear site data, use private browsing or switch browser/device.** Use *Settings → Export save* to download a backup and *Import save* to restore it on any device.

### Mobile and tablet
Touch-first controls: dedicated swing pad with pointer capture, `touch-action: none` on the play area, no pinch or double-tap zoom, safe-area insets, compact layouts for phone landscape and a rotate prompt in portrait (dismissible). Graphics quality presets (Low disables shadows and grass and lowers resolution) and capped pixel ratio keep frame rates reasonable. If WebGL is unavailable, a helpful message is shown and the menus still work.

## Project structure

```
src/
  core/        math, seeded RNG, units
  golf/        physics, hole generation & terrain, shot model, match rules, AI, scoring
  data/        clubs, abilities, courses & themes, bots, cosmetics, packs, economy, progression, achievements, challenges, events
  state/       profile model (pure functions), persistence/migrations, zustand stores (profile + in-match HUD)
  game/        Three.js: shared renderer, hole scene, terrain mesh, scenery, golfer model, visuals, match controller, menu/preview views
  audio/       Web Audio synthesiser
  ui/          React screens, HUD and components
scripts/e2e.mjs   browser end-to-end test
```

The simulation (`golf/`, `data/`, `state/profile.ts`) has no DOM or Three.js dependency, so it runs in Node tests. The match controller drives the 3D scene and pushes low-frequency state to a small HUD store. High-frequency values (power, needle) live in a separate store to keep React re-renders cheap.

## Extending the game

**Add a club:** append a `C(...)` entry to `CLUBS` in `src/data/clubs.ts`:
```ts
C('i8_nova', 'Nova 8 Iron', 'iron8', 'rare', [52, 58, 56, 52, 58, 50, 40], '#40c0ff',
  ['Starfall', 'approach', 'backspin', 40, 'pinpoint', 20], 'Falls softly out of the night sky.'),
```
Stats are `[power, accuracy, control, loft, spin, forgiveness, ability]`. The tuple is `[name, trigger, effect, magnitude, effect2?, magnitude2?]`. The club automatically appears in packs of its rarity (add `event: '<eventId>'` to make it event-only).

**Add an ability effect or trigger:** add an entry to `TRIGGERS` (a predicate over `AbilityContext`) or `EFFECTS` (writes into `ShotMods`) in `src/data/abilities.ts`. If an effect needs new physics behaviour, add a field to `ShotMods`/`PhysMods`, map it in `physFrom()` (`src/golf/shot.ts`) and use it in `simulate()` (`src/golf/physics.ts`).

**Add a course:** add a theme to `src/data/courses/themes.ts` (colours, tree types, wind range, green speed, terrain roughness, optional ocean/waste rough) and a `CourseDef` with 9 `HoleSpec`s to `COURSES` in `src/data/courses/index.ts`:
```ts
{ name: 'Canal Street', par: 4, length: 395, bend: -30, fw: 34, elev: 4,
  bunkers: [[240, 18, 12]], greenBunkers: ['FL', 'R'], water: [[300, -30, 16, 24]], creek: [180], greenSlope: 2.2 }
```
Distances are yards along the centre line, lateral offsets in yards (+ = right). `npm test` validates every hole: the tee and pin must sit on the right surfaces, and an AI completes all holes of every course.

**Add a bot:** add a `BotDef` to `BOTS` in `src/data/bots.ts` (archetype, difficulty, club ids, club level, outfit). Skill parameters come from the difficulty and archetype tables in `botSkill()`.

**Add a cosmetic:** add an `I(...)` entry to `COSMETICS` in `src/data/cosmetics.ts`. Supported styles per slot are listed in `GolferModel` (`src/game/golferModel.ts`). Add a new style branch there to support a new mesh.

**Tune the economy:** `src/data/economy.ts` (match rewards), `src/data/packs.ts` (prices and odds), `src/data/progression.ts` (XP curve, unlock levels), `RARITY_INFO` in `src/data/clubs.ts` (duplicate coins, upgrade costs).

**Change the save format:** bump `SAVE_VERSION` in `src/state/profile.ts` and add `MIGRATIONS[oldVersion]`. `sanitize()` fills any missing fields with defaults.

## Testing

* `npm test` runs 28 tests: physics (calibration, power→distance, slopes and resting, cup capture and lip-outs, water drop, OOB, bunkers, wind, mistiming), validity of all 72 hole layouts, bots finishing every hole of every course from real simulated shots, experts beating beginners, statistical verification of pack odds, duplicate/upgrade rules, bag rules, spending limits, rewards, achievements, XP, save round-trips, v1→v2 migration and repair of corrupted saves. The bot tests take a couple of minutes.
* `npm run e2e` (after `npm run build` and `npx vite preview --port 4173`) drives headless Chromium. It plays a full 3-hole match against a bot through the real UI controller, checks rewards and persistence after a reload, buys and opens a pack, buys and equips a cosmetic, then performs real touch pull-and-release swings in iPhone- and iPad-sized viewports, saving screenshots to `screenshots/`. Set `CHROME=/path/to/chrome` if Chromium is elsewhere.

## Known limitations

* The physics is arcade-realistic, not a professional launch-monitor simulator (green slopes are deliberately softened for readability).
* Hole layouts are generated from specs, so they don't have the hand-sculpted detail of commercial courses. There are 9 unique holes per course; the back nine is mirrored.
* The golfer is a stylised primitive-based model with procedural swing animation (no skeletal mocap). Bots appear one at a time at their ball.
* Saves are local to one browser unless exported. There is no online multiplayer.
* Performance on older phones depends on the quality setting; the Low preset is recommended for older iPhones.
