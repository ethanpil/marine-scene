# tools/

Node-side audits. Not shipped; `node_modules/` is gitignored.

## Setup
    cd tools && npm install        # installs three@0.186.1 (resolved via audit/hooks.mjs, matching the importmap)

## Props audit (all biomes)
    cd tools && node --import ./audit/register.mjs audit/run.mjs [biomes|all] [seeds] [audit 1|0] [maxChunksPerSegment] [tier]
    # e.g.  node --import ./audit/register.mjs audit/run.mjs all 1,2 1 8 low
    #       node --import ./audit/register.mjs audit/run.mjs mangrove,wall 1,2,3

Runs every populator (`registerProps` + `registerNewBiomeProps`) on a mock terrain ctx for the chunks of each
biome segment. Prints per biome: tris and draw calls per chunk, total CPU ms per chunk, POI and label counts,
floating-prop gaps (new-zone props via `NBDBG` layouts; old props via the `window.__propsAudit` item list, heuristic)
and per-stage timings. The Node timings are CPU only (no GPU upload) and include JIT warm-up on the first chunks.

## Browser soak helper (`soak.js`)
Served by the dev server; run from a page on the same origin (e.g. open `/tools/soak.js`, then in the console):
    const m = await import('/tools/soak.js');
    await m.matrix([{ q: 'biome=reef&seed=101&time=day&quality=low', ot: true }]);   // each config in a hidden iframe
`soak(secs)` samples camera clearance (floor, ceiling, surface, obstacles) once per simulated second and returns counts
and console errors/warnings; `ot: true` also runs `obstacleTest(60, false)`. Results accumulate in `window.__all`.
In a hidden Browser pane, setTimeout is throttled and the page only runs while a script call is pending; the helper
uses MessageChannel timers (`fastTO`/`sleep`) for that reason.
