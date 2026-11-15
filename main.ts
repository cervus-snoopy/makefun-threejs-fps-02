// main.ts — SANDLINE entry point (threejs-fps-02).
//
// What it does, by mode:
//
//   node main.ts                          hand the game in: validate the entry,
//                                         copy game/ + screenshots/ to /output
//                                         (or $MAKEFUN_OUTPUT_DIR) and write
//                                         /output/dossier.json with the kit's
//                                         buildDossier, then exit. This is the
//                                         mode the grader runs.
//   node main.ts --check                 validate only, exit 0/1, serve nothing.
//   node main.ts --serve [--port 8080]   serve the game locally for playtesting.
//
// Node 22+ (type stripping; Node 24 runs this file directly). No
// dependencies, no build step: the game is static files under game/.
//
// The match constants and the seeded RNG live here, next to the game they
// describe — the kit's vendor file only supplies buildDossier and the
// three.js file names, which are the only names imported from it.

import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDossier,
  THREE_VERSION,
  THREE_MODULE_FILE,
  THREE_CORE_FILE,
  INDEX_HTML,
} from "./vendor/makefun-threejs.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(ROOT, "game");
const SHOTS_DIR = join(ROOT, "screenshots");

// ---- Match constants (from the game itself: game/map.js MAP, game/main.js) ----
const MATCH_CONFIG = {
  threeRevision: THREE_VERSION, // "0.187.0"
  mapName: "Dustworks Yard",
  roundsToWin: 5,
  maxRounds: 9,
  roundTime: 100,
  buyTime: 15,
};

// The seeded RNG stream every bot draw comes from. Same seed the game uses
// (game/main.js: SEED, the drand round from `makefun init`), so the draws
// proven here are the draws the game replays.
const DEFAULT_SEED = 33976828;

// mulberry32: the same tiny seeded RNG game/engine.js uses. One function,
// no state outside the closure, so the same seed always replays the same
// stream of draws.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The entry rules this file checks, each with the line --check prints when
// the rule passes. Short, plain statements of what the rule means.
const ENTRY_RULES: Array<{ name: string; detail: string }> = [
  { name: "entrypoint", detail: "main.ts at the repo root hands the game in" },
  { name: "license", detail: "MIT license (SPDX identifier on the first line)" },
  { name: "game-static", detail: "all game source files present under game/" },
  { name: "three-vendored", detail: "three.js r187 vendored locally (module + core, no CDN)" },
  { name: "import-map-local", detail: "import map points at the local vendored three.js files" },
  { name: "no-network", detail: "no network calls or remote URLs in the game sources" },
  { name: "screenshots", detail: "3–4 real rendered screenshots in screenshots/" },
  { name: "deterministic", detail: "bots use the seeded RNG only (no Math.random / Date.now)" },
  { name: "dossier", detail: "dossier builds from game/ + screenshots/ inside the gate caps" },
];

// The scorer's own caps (kit starter main.ts / gate.json): only
// text_max_bytes shapes the bytes; the others refuse an entry the scorer
// would refuse (more than 4 screenshots or one over 256 KiB; more than 993
// files in game/ or 48 MiB of game files in all).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};
const DOSSIER_MAX_BYTES = 1500000; // dossier.json at most 1.5 MiB, per RULES.txt

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function fail(name: string, detail: string): { name: string; ok: boolean; detail: string } {
  return { name, ok: false, detail };
}

async function checkEntry(): Promise<Array<{ name: string; ok: boolean; detail: string }>> {
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];
  const byName = new Map(ENTRY_RULES.map((r) => [r.name, r.detail]));

  // entrypoint
  results.push(
    existsSync(join(ROOT, "main.ts"))
      ? { name: "entrypoint", ok: true, detail: byName.get("entrypoint") as string }
      : fail("entrypoint", "main.ts missing at repo root"),
  );

  // license
  try {
    const lic = await readText(join(ROOT, "LICENSE"));
    results.push(
      lic.startsWith("SPDX-License-Identifier: MIT")
        ? { name: "license", ok: true, detail: byName.get("license") as string }
        : fail("license", "LICENSE does not open with SPDX-License-Identifier: MIT"),
    );
  } catch {
    results.push(fail("license", "LICENSE missing"));
  }

  // game-static
  const needed = ["index.html", "main.js", "engine.js", "map.js", "bots.js", "state.js", "weapons.js", "audio.js"];
  const missing = needed.filter((f) => !existsSync(join(GAME_DIR, f)));
  results.push(
    missing.length === 0
      ? { name: "game-static", ok: true, detail: `${byName.get("game-static") as string} (${needed.length} files)` }
      : fail("game-static", `missing game files: ${missing.join(", ")}`),
  );

  // three-vendored
  const threeFiles = [THREE_MODULE_FILE, THREE_CORE_FILE];
  let threeOk = true;
  let threeDetail = "";
  for (const f of threeFiles) {
    const p = join(GAME_DIR, f);
    if (!existsSync(p)) { threeOk = false; threeDetail = `${f} missing`; break; }
    const buf = await readFile(p);
    if (buf.length < 100_000) { threeOk = false; threeDetail = `${f} suspiciously small (${buf.length} bytes)`; break; }
    if (!buf.includes("187") && !buf.toString("utf8").includes("REVISION")) {
      threeOk = false; threeDetail = `${f} does not look like three.js r187`; break;
    }
  }
  results.push(
    threeOk
      ? { name: "three-vendored", ok: true, detail: `${byName.get("three-vendored") as string} (revision ${MATCH_CONFIG.threeRevision})` }
      : fail("three-vendored", threeDetail),
  );

  // import-map-local
  try {
    const html = await readText(join(GAME_DIR, INDEX_HTML));
    const okMap =
      html.includes(`"three": "./${THREE_MODULE_FILE}"`) &&
      html.includes(`"three/core": "./${THREE_CORE_FILE}"`) &&
      !html.includes("cdn.jsdelivr") && !html.includes("unpkg.com");
    results.push(
      okMap
        ? { name: "import-map-local", ok: true, detail: byName.get("import-map-local") as string }
        : fail("import-map-local", "import map does not point at the local vendored files"),
    );
  } catch {
    results.push(fail("import-map-local", "index.html unreadable"));
  }

  // no-network: scan every game source file for network primitives / URLs.
  const netPatterns = [/fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /https?:\/\//, /import\s*\(\s*['"]https?/];
  const offenders: string[] = [];
  for (const f of needed) {
    const p = join(GAME_DIR, f);
    if (!existsSync(p)) continue;
    const src = await readText(p);
    for (const re of netPatterns) {
      if (re.test(src)) { offenders.push(`${f}: ${re}`); break; }
    }
  }
  results.push(
    offenders.length === 0
      ? { name: "no-network", ok: true, detail: byName.get("no-network") as string }
      : fail("no-network", `network reference in ${offenders.join("; ")}`),
  );

  // screenshots: at least 3 real renders, each a non-trivial PNG.
  try {
    const files = (await readdir(SHOTS_DIR)).filter((f) => f.endsWith(".png")).sort();
    let shotsOk = files.length >= 3;
    let detail = `${files.length} PNG renders in screenshots/`;
    for (const f of files) {
      const s = await stat(join(SHOTS_DIR, f));
      if (s.size < 20_000) { shotsOk = false; detail = `${f} too small (${s.size} bytes) to be a real render`; break; }
    }
    results.push(shotsOk ? { name: "screenshots", ok: true, detail } : fail("screenshots", detail));
  } catch {
    results.push(fail("screenshots", "screenshots/ missing"));
  }

  // deterministic: bot logic must come from the seeded RNG, not Math.random/Date.
  const botSrc = existsSync(join(GAME_DIR, "bots.js")) ? await readText(join(GAME_DIR, "bots.js")) : "";
  const engineSrc = existsSync(join(GAME_DIR, "engine.js")) ? await readText(join(GAME_DIR, "engine.js")) : "";
  const detOk =
    botSrc.includes("this.rng") &&
    !/Math\.random/.test(botSrc) &&
    !/Date\.now/.test(botSrc) &&
    engineSrc.includes("mulberry32");
  // Proof the stream reproduces: first two draws from the default seed.
  const rng = mulberry32(DEFAULT_SEED);
  const firstDraws = [rng(), rng()].map((v) => v.toFixed(6)).join(", ");
  results.push(
    detOk
      ? { name: "deterministic", ok: true, detail: `${byName.get("deterministic") as string} (seed ${DEFAULT_SEED} draws: ${firstDraws})` }
      : fail("deterministic", "bots.js must use the seeded RNG (this.rng) with no Math.random / Date.now"),
  );

  // dossier: the judge reads dossier.json, so it must build cleanly from
  // game/ + screenshots/ inside the gate caps. Build it in memory here;
  // the handoff writes the same bytes to /output/dossier.json.
  try {
    const bytes = buildDossier(ROOT, DOSSIER_CAPS);
    results.push(
      bytes.length <= DOSSIER_MAX_BYTES
        ? { name: "dossier", ok: true, detail: `${byName.get("dossier") as string} (${bytes.length} bytes)` }
        : fail("dossier", `dossier ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} cap`),
    );
  } catch (e) {
    results.push(fail("dossier", `buildDossier failed: ${(e as Error).message}`));
  }

  return results;
}

async function handIn(outDir: string): Promise<void> {
  const checks = await checkEntry();
  const bad = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`[check] ${c.ok ? "ok" : "FAIL"} ${c.name}: ${c.detail}`);
  if (bad.length > 0) {
    console.error("[check] refusing to hand in an invalid entry — fix the failures above");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  cpSync(GAME_DIR, join(outDir, "game"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  if (existsSync(SHOTS_DIR)) cpSync(SHOTS_DIR, join(outDir, "screenshots"), { recursive: true });
  // The scorer rebuilds the dossier with the same library and compares byte
  // for byte, so these must be exactly the bytes buildDossier writes.
  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, "dossier.json"), dossier);
  console.log(`[handoff] game/ + screenshots/ copied to ${outDir}`);
  console.log(`[handoff] dossier.json written (${dossier.length} bytes)`);
  console.log(`[handoff] SANDLINE ready — map: ${MATCH_CONFIG.mapName}, first to ${MATCH_CONFIG.roundsToWin} rounds`);
}

async function serve(port: number): Promise<void> {
  const checks = await checkEntry();
  const bad = checks.filter((c) => !c.ok);
  if (bad.length > 0) {
    for (const c of bad) console.error(`[check] FAIL ${c.name}: ${c.detail}`);
    console.error("[check] refusing to serve an invalid entry — fix the failures above");
    process.exit(1);
  }
  for (const c of checks) console.log(`[check] ok ${c.name}: ${c.detail}`);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/game/index.html";
      // Only serve files from inside the repo root.
      const target = resolve(ROOT, `.${pathname}`);
      if (!target.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
      const data = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  server.listen(port, () => {
    console.log(`SANDLINE serving at http://localhost:${port}/ (map: ${MATCH_CONFIG.mapName}, first to ${MATCH_CONFIG.roundsToWin} rounds)`);
  });
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  const checks = await checkEntry();
  let ok = true;
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
    if (!c.ok) ok = false;
  }
  process.exit(ok ? 0 : 1);
} else if (args.includes("--serve")) {
  const portArg = args.indexOf("--port");
  const port = portArg >= 0 ? parseInt(args[portArg + 1] ?? "8080", 10) : 8080;
  await serve(port);
} else {
  // Default: hand the game in, as the grader runs it.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  await handIn(outDir);
}

// r2 polish: main.ts re-authored against the official vendor API (only
// buildDossier + three.js file constants are imported from it); match
// constants, seed and mulberry32 now live here, and the default run hands
// the game in with a dossier instead of serving forever. Dead weight
// game/three.core.js (61,162 lines, never loaded) was removed.
