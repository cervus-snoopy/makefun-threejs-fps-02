SPDX-License-Identifier: MIT

# SANDLINE — Tactical FPS (make.fun threejs-fps-02)

A round-based tactical first-person shooter that runs entirely in the browser.
Two teams of five — **Vanguard** (amber) against **Sentinel** (teal) — fight
short rounds on an original industrial map, **Dustworks Yard**. First to 5
rounds takes the match (max 9 rounds). Between rounds there is a buy phase:
kills and round wins pay for rifles, a marksman rifle, an SMG, and plate
armor. Everything — map, art, names, sounds — is original to this build; it
is Counter-Strike-*style* in structure only, never a copy of any map, model,
or asset.

## Play

```
node main.ts            # serve at http://localhost:8080
node main.ts --check    # validate the entry without serving
```

Open http://localhost:8080, click **DEPLOY — START MATCH**, then click the
canvas to lock the mouse.

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim (click canvas to lock) |
| Click | Shoot (hold for automatics) |
| R | Reload |
| 1 / 2 | Switch weapon |
| Shift | Walk (slower, steadier) |
| Space | Jump |
| B | Buy menu (between rounds) |
| Esc | Release mouse / pause |

HUD: health + armor (bottom left), ammo + weapon (bottom right), money
(top left), round score + timer (top center), kill feed (top right).

Demo camera (no pointer lock, for screenshots):
`http://localhost:8080/game/index.html?demo=1` orbits the yard;
`?shot=1` … `?shot=4` holds four fixed viewpoints.

## Files

```
main.ts                  Node 22+ entry: serves game/ and validates the entry (--check)
LICENSE                  MIT
README.md                this file
vendor/
  makefun-threejs.ts     match constants, deterministic seed, entry rules
game/
  index.html             import map (local only) + HUD + menus
  main.js                renderer, player controller, shooting, rounds, demo cam
  engine.js              seeded RNG (mulberry32), AABB collision, ray tests
  map.js                 Dustworks Yard: layout, colliders, lighting
  bots.js                bot AI: patrol / engage / strafe / burst fire
  state.js               match state machine + economy
  weapons.js             fictional weapon defs + buy catalogue
  audio.js               procedural WebAudio effects (no audio files)
  three.module.min.js    three.js 0.187.0, vendored (jsDelivr, npm three@0.187.0)
  three.core.min.js      three.js 0.187.0 core build, vendored
  three.core.js          three.js 0.187.0 core build (unminified) — required at
                         runtime because three.module.min.js imports ./three.core.js
screenshots/
  shot-1.png … shot-4.png   real headless-Chromium renders of the game's own code
```

## Rules the build follows

- **Static, no build step.** `game/` is plain HTML + ES modules; the only
  imports are `three` and `three/core`, resolved by the import map to the
  vendored files under `game/`.
- **No network while playing.** No `fetch`, no `XMLHttpRequest`, no
  `WebSocket`, no `http(s)` URL anywhere in the game sources. Sounds are
  synthesised with WebAudio; the ground texture is canvas-painted.
- **Deterministic where it matters.** Bot behaviour comes from a mulberry32
  stream seeded per match (default seed `33976828`, the drand round recorded
  by `makefun init` in `.makefun/freshness.json`). Same seed, same bot
  behaviour. Player-aim spread is the only unseeded randomness, and it is
  driven by live input.
- **Original work.** Map layout, team names, weapon names, bot names, sounds
  and UI are all authored for this entry. three.js is the only third-party
  code, vendored verbatim under its MIT license.

## Known gap — vendor file

The kit CLI available in this workspace (`makefun init`, level 9) anchors a
drand round and writes a LICENSE, but it delivered **no**
`vendor/makefun-threejs.ts` and no rules file for this competition, and the
re-download it suggests was not a step this build was authorised to run.
`vendor/makefun-threejs.ts` in this repo is therefore an adapter authored
for this entry (see its header comment), not a byte-identical copy of a kit
file. If the house kit publishes one, swap it in and re-run
`node main.ts --check` before submitting.

## Screenshots

`shot-1.png` spawn lane towards mid, `shot-2.png` south lane towards
site A, `shot-3.png` high over the mid container stack, `shot-4.png` close
on the site A pylon. All four are real renders of the running game captured
with headless Chromium (SwiftShader/WebGL), not drawn images.

## License

MIT — see LICENSE.
