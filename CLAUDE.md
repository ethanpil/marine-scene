# Endless Ocean — notes for developers and LLMs

Static site, no build step. The three.js version is pinned in the `index.html` import map (0.186.1). Deployed with GitHub Pages from `main` (root).

## Invariants (breaking these causes subtle bugs)
- **Coordinates:** travel distance `s` grows forward, and global `z = -s`. Everything that lives in the world is a child of the `world` group, at global coordinates.
- **Floating origin:**
  - `world.position.z = -Oz`, where `Oz` is a multiple of **1024**.
  - Shader-space patterns (caustics, noise texture, ripples) must use periods that divide 1024. Otherwise they jump at each rebase.
  - Never feed absolute global positions to shaders; use `vWPos`, which is render-space.
- **Shader time** `U.uTime` wraps every 4096 s, for float precision. Visible pops once an hour are accepted.
- **Colours:** biome colours are authored in sRGB and converted to linear in `biomes.js`. Vertex colours and uniforms are linear. Forgetting this washes out the image badly; this happened early on.
- **Materials:** every lit material goes through `applyWater(mat, { key })`, and `key` must be unique per shader variant. three caches programs by `customProgramCacheKey`, and a shared key silently reuses the wrong shader.
- **Clear flight tube:** nothing may come within 3.5 m of the path line (`pathX(s)`, `pathY(s)`). `floorAt` and `ceilingAt` clamp near the path; props check themselves.
- **Chunks:**
  - Chunks are 64 m long and built by generators under a per-frame time budget.
  - Populators must stay at or under about 5 ms.
  - A chunk can be unloaded while its build is still queued; `terrain.update` drops such builds.

## Why things are the way they are
- **Sky-visibility map** (128² texels at 2 m, CPU-computed, camera-local): lets every material and the god rays know whether a cave or ice ceiling is overhead. This costs much less than shadows.
- **ROV lamps** (`uLamp`): the deep zones and caves are physically too dark to watch, so lamps mounted beside the camera light the scene, as in documentary footage.
- **GPU tiers:** integrated and mobile GPUs (regex in `main.js`) get no MSAA, quarter-res shafts with 16 steps, and DPR ≤ 1. Measured on an Intel HD 4600 at 1024×576: about 7.5 ms per frame for the base scene.
- **Dev server:** `python -m http.server` let the browser serve stale ES modules, so use a server that sends `Cache-Control: no-store`.

## Debugging
- `window.__ocean` exposes the scene, camera, terrain, shape, seq, creatures, post and U.
- `window.__props` holds per-populator timings and triangle counts.
- `?cr=<species>&crstats=1` forces a creature species and logs creature stats.
