// main.ts — SANDLINE entry point.
//
// Run the game:   node main.ts [--port 8080]
// Validate only:  node main.ts --check
//
// Node 22+ (type stripping; Node 24 runs this file directly). No
// dependencies, no build step: the game is static files under game/ and this
// file only serves them and validates the entry against the rules in
// vendor/makefun-threejs.ts.

import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MATCH_CONFIG,
  ENTRY_RULES,
  DEFAULT_SEED,
  mulberry32,
} from "./vendor/makefun-threejs.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(ROOT, "game");
const SHOTS_DIR = join(ROOT, "screenshots");

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
  const threeFiles = ["three.module.min.js", "three.core.min.js"];
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
    const html = await readText(join(GAME_DIR, "index.html"));
    const okMap =
      html.includes('"three": "./three.module.min.js"') &&
      html.includes('"three/core": "./three.core.min.js"') &&
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

  return results;
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
} else {
  const portArg = args.indexOf("--port");
  const port = portArg >= 0 ? parseInt(args[portArg + 1] ?? "8080", 10) : 8080;
  await serve(port);
}
