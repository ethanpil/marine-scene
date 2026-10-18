// Props & set-pieces entry point. Generates every geometry variant once at startup, then registers
// one or more populators per biome on the terrain. Each populator returns merged / instanced meshes
// for its chunk (a handful of draw calls) and frees its per-chunk buffers on dispose.
import { T, ENV, staged, named } from './core.js';
import { initMaterials } from './materials.js';
import { rock, pebblePatch, algaePatch, rockSet, ROCK_TYPE_KEYS } from './shapes.js';
import { initSandflat, layoutSandflat } from './sandflat.js';
import { initReef, layoutReef, layoutReefMicro } from './reef.js';
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
  ENV.shape = env.shape;
  initMaterials();
  T.rocks = rockSet(ROCK_TYPE_KEYS.filter((k) => k !== 'pinnacle'), 5, { detail: 3 });
  T.mound = rockSet(['boulder', 'angular', 'sediment', 'undercut', 'volcanic'], 2, { detail: 4, growth: 1.0 });
  // shared floor micro detail + steer-around pinnacles
  T.rubble = [pebblePatch(1, { n: 14, r: 0.6, size: 0.07, flat: 0.45, elong: 3, col: [0.85, 0.8, 0.7], growth: 0.4, mode: 2 }), pebblePatch(2, { n: 9, r: 0.4, size: 0.09, flat: 0.5, elong: 2.5, col: [0.8, 0.76, 0.68], growth: 0.5, mode: 2 })];
  T.pebbles = [pebblePatch(3, { n: 16, r: 0.6, size: 0.06, flat: 0.6, col: [0.7, 0.68, 0.64] }), pebblePatch(4, { n: 7, r: 0.35, size: 0.12, flat: 0.55, col: [0.66, 0.64, 0.6] })];
  T.grit = [pebblePatch(5, { n: 26, r: 0.55, size: 0.025, flat: 0.35, col: [0.95, 0.9, 0.82], growth: 0 })];
  T.algae = [algaePatch(1), algaePatch(2, { r: 1.2, col: [0.42, 0.3, 0.14] })];
  T.spongeLump = [rock(61, { detail: 2, sx: 0.25, sy: 0.2, sz: 0.22, rough: 0.5, growth: 0.3 }), rock(62, { detail: 2, sx: 0.18, sy: 0.25, sz: 0.2, rough: 0.6, growth: 0.3 })];
  T.pinnacle = rockSet(['pinnacle'], 6, { detail: 4, growth: 0.9 });
  initReef(); initKelp(); initSeagrass(); initCave(); initWreck();
  initRuins(); initVents(); initTidepool(); initPolar(); initPelagic(); initSandflat();
  nameAll();
  stats.init = performance.now() - t0;
  console.info(`props: templates built in ${stats.init.toFixed(0)} ms`);
  const add = (name, layout) => staged(layout).forEach((p, i) => terrain.populators.push(wrap(name + i, p)));
  add('reef', layoutReef);
  add('reefM', layoutReefMicro);
  add('kelp', layoutKelp);
  add('grassN', layoutGrassNear);
  add('grassF', layoutGrassFar);
  add('grassM', layoutSeagrassMisc);
  add('cave', makeCaveLayout(env));
  add('wreck', layoutWreck);
  add('ruins', layoutRuins);
  add('vents', layoutVents);
  add('tide', layoutTidepool);
  add('polar', layoutPolar);
  add('pelagic', layoutPelagic);
  add('sand', layoutSandflat);
}

// common names for the "i" overlay
function nameAll() {
  const N = {
    stag: 'Staghorn coral', table: 'Table coral', brain: 'Brain coral', boulder: 'Massive Porites coral', coralMound: 'Coral head',
    fan: 'Gorgonian sea fan', tubeSp: 'Tube sponge', barrel: 'Giant barrel sponge', soft: 'Soft coral', leather: 'Leather coral',
    anem: 'Magnificent sea anemone', whip: 'Sea whip', clam: 'Giant clam', star: 'Sea star', urchin: 'Long-spined sea urchin',
    conch: 'Queen conch', cucumber: 'Sea cucumber', scallop: 'Scallop', sandDollar: 'Sand dollar', cushion: 'Cushion star',
    understory: 'Understory kelp', stalactite: 'Stalactite', stalagmite: 'Stalagmite', caveColumn: 'Cave column', deadTree: 'Drowned tree', block: 'Masonry block',
    wall: 'Ruined wall', pyramid: 'Stepped pyramid', head: 'Colossal stone head', figure: 'Stone statue', amphora: 'Amphora', slab: 'Paving stone',
    chimney: 'Black smoker', worms: 'Giant tube worms', ventMussels: 'Vent mussel bed', mat: 'Bacterial mat',
    tpAnemGreen: 'Giant green anemone', tpAnemPink: 'Aggregating anemone', tpStar: 'Ochre sea star', tpUrchin: 'Purple sea urchin',
    tpMussel: 'California mussels', tpBarnacle: 'Acorn barnacles', tpSnail: 'Black turban snail', tpLettuce: 'Sea lettuce', tpTuft: 'Coralline algae', tpSurf: 'Surfgrass',
    keel: 'Ice keel', berg: 'Iceberg', brinicle: 'Brinicle', sargassum: 'Sargassum', seaPen: 'Sea pen', burrows: 'Garden eel burrows', tuft: 'Turtle grass',
    rubble: 'Coral rubble', spongeLump: 'Encrusting sponge',
  };
  for (const [k, n] of Object.entries(N)) if (T[k]) named(T[k], n);
  const S = T.ship, D = T.debris;
  if (S) {
    named(S.wood, 'Galleon wreck'); named(S.woodBow, 'Galleon bow section'); named(S.woodStern, 'Galleon stern section');
    named(S.steel, 'Steel freighter wreck'); named(S.steelBow, 'Freighter bow section'); named(S.steelStern, 'Freighter stern section');
    named(S.plane, 'Aircraft wreck'); named(S.sub, 'Submarine wreck');
  }
  if (D) {
    const DN = { barrel: 'Wooden cask', drum: 'Oil drum', crate: 'Cargo crate', cannon: 'Iron cannon', anchor: 'Anchor', chain: 'Anchor chain', plank: 'Ship timbers', plate: 'Hull plating', frag: 'Hull fragment', fragSteel: 'Steel hull fragment', mast: 'Broken mast' };
    for (const [k, n] of Object.entries(DN)) if (D[k]) named(D[k], n);
  }
}
