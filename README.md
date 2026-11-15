SPDX-License-Identifier: MIT

# SANDLINE — Tactical FPS (make.fun threejs-fps-02)

[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/cervus-snoopy/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/cervus-snoopy/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter that runs entirely in the browser.
Two teams of five — **Vanguard** (amber) against **Sentinel** (teal) — fight
short rounds on an original industrial map, **Dustworks Yard**. First to 5
rounds takes the match (max 9 rounds). Between rounds there is a buy phase:
kills and round wins pay for rifles, a marksman rifle, an SMG, and plate
armor. Everything — map, art, names, sounds — is original to this build; it
is Counter-Strike-*style* in structure only, never a copy of any map, model,
or asset.

Entry for the [threejs-fps-02 bounty](https://make.fun/bounty/threejs-fps-02)
on make.fun ($1,000, top 10 share the prize).

## Play

```
node main.ts --serve            # serve at http://localhost:8080
node main.ts --check            # validate the entry without serving
node main.ts                    # hand the game in: copy game/ + screenshots/
                                # to $MAKEFUN_OUTPUT_DIR (or /output) and write
                                # dossier.json with the kit's buildDossier
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
main.ts                  Node 22+ entry: serves (--serve), validates (--check),
                         or hands the game in with a dossier (default)
LICENSE                  MIT
README.md                this file
vendor/
  makefun-threejs.ts     the kit's own library (buildDossier + three.js file
                         names), byte-identical from the official kit
game/
  index.html             import map (local only) + HUD + menus
  main.js                renderer, player controller, shooting, rounds, demo cam
  engine.js              seeded RNG (mulberry32), AABB collision, ray tests
  map.js                 Dustworks Yard: layout, colliders, lighting
  bots.js                bot AI: patrol / engage / strafe / burst fire
  state.js               match state machine + economy
  weapons.js             fictional weapon defs + buy catalogue
  audio.js               procedural WebAudio effects (no audio files)
  three.module.min.js    three.js 0.187.0 module, the kit's own file
  three.core.min.js      three.js 0.187.0 core, the kit's own file
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
- **The dossier is the judge's view.** The judge never runs the game: it
  reads `dossier.json`, the screenshots first, then the game's source. The
  entry program writes that dossier with the kit's `buildDossier`, and the
  gate rebuilds it byte for byte — so the file you see in the repo is not
  the dossier; the dossier is written at handoff time.
- **Original work.** Map layout, team names, weapon names, bot names, sounds
  and UI are all authored for this entry. three.js is the only third-party
  code, vendored verbatim under its MIT license.

## Vendor file

`vendor/makefun-threejs.ts` is the official kit file from the make.fun dev kit for this competition (sha256 f9622210e6a0aed70d6f13273a24c9c4a661b5e272edf8fef21197fac6de7969, 55,627 bytes), downloaded from https://make.fun/c/threejs-fps-02/kit — byte-identical, not an adapter. The game imports only `buildDossier` and the three.js file-name constants from it; the match constants, the seed and the seeded RNG live in `main.ts` itself.

## Screenshots

`shot-1.png` spawn lane towards mid, `shot-2.png` south lane towards
site A, `shot-3.png` high over the mid container stack, `shot-4.png` close
on the site A pylon. All four are real renders of the running game captured
with headless Chromium (SwiftShader/WebGL), not drawn images.

## License

MIT — see LICENSE.

<!-- r2 polish: README re-authored — make.fun badges + bounty link added,
     vendor description corrected, play instructions match the new main.ts
     modes, and the three.core.js note (dead since the kit's module is used)
     is gone. -->
