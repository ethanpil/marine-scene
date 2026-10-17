// Props & set-pieces entry point. Generates every geometry variant once at startup, then registers
// one or more populators per biome on the terrain. Each populator returns merged / instanced meshes
// for its chunk (a handful of draw calls) and frees its per-chunk buffers on dispose.
import { T, staged } from './core.js';
import { initMaterials } from './materials.js';
import { rock } from './shapes.js';
import { initReef, layoutReef } from './reef.js';
import { initKelp, layoutKelp } from './kelp.js';
import { initSeagrass, layoutGrassNear, layoutGrassFar, layoutSeagrassMisc } from './seagrass.js';
import { initCave, makeCaveLayout } from './cave.js';
import { initWreck, layoutWreck } from './wreck.js';
import { initRuins, layoutRuins } from './ruins.js';
import { initVents, layoutVents } from './vents.js';
import { initTidepool, layoutTidepool } from './tidepool.js';
import { initPolar, layoutPolar } from './polar.js';
import { initPelagic, layoutPelagic } from './pelagic.js';

// lightweight per-populator stats (inspect window.__props in the console)
const stats = { init: 0, pops: {} };
if (typeof window !== 'undefined') window.__props = stats;

function wrap(name, fn) {
  return (ctx) => {
    const t0 = performance.now();
    const r = fn(ctx);
    const dt = performance.now() - t0;
    const st = stats.pops[name] || (stats.pops[name] = { n: 0, ms: 0, max: 0, tris: 0, maxTris: 0, calls: 0 });
    st.max = Math.max(st.max, dt);
    if (r) {
      let tris = 0, calls = 0;
      r.object.traverse((o) => {
        if (!o.isMesh) return;
        calls++;
        const n = o.geometry.index ? o.geometry.index.count / 3 : 0;
        tris += o.isInstancedMesh ? n * o.count : n;
      });
      st.n++; st.ms += dt; st.tris += tris; st.maxTris = Math.max(st.maxTris, tris); st.calls = Math.max(st.calls, calls);
    }
    return r;
  };
}

export function registerProps(terrain, env) {
  const t0 = performance.now();
  initMaterials();
  T.rocks = [1, 2, 3, 4, 5].map((s) => rock(s, { detail: 3, sy: 0.5 + (s % 3) * 0.2, rough: 0.3 + (s % 2) * 0.15 }));
  T.mound = [21, 22, 23].map((s) => rock(s, { detail: 4, sx: 1.3, sy: 0.75, sz: 1.1, rough: 0.45, flat: 0.15, growth: 1.0 }));
  initReef(); initKelp(); initSeagrass(); initCave(); initWreck();
  initRuins(); initVents(); initTidepool(); initPolar(); initPelagic();
  stats.init = performance.now() - t0;
  console.info(`props: templates built in ${stats.init.toFixed(0)} ms`);
  const add = (name, layout, n) => staged(layout, n).forEach((p, i) => terrain.populators.push(wrap(name + i, p)));
  add('reef', layoutReef, 4);
  add('kelp', layoutKelp, 4);
  add('grassN', layoutGrassNear, 0);
  add('grassF', layoutGrassFar, 0);
  add('grassM', layoutSeagrassMisc, 1);
  add('cave', makeCaveLayout(env), 2);
  add('wreck', layoutWreck, 2);
  add('ruins', layoutRuins, 3);
  add('vents', layoutVents, 2);
  add('tide', layoutTidepool, 3);
  add('polar', layoutPolar, 2);
  add('pelagic', layoutPelagic, 1);
}
