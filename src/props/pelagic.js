// Open ocean: rare rafts of drifting sargassum just beneath the surface (abyss stays empty).
import { Builder, Batch, T, TAU, sat, orient, tubeClear, presence, rotY, budgetK, vary } from './core.js';
import { branchesInto } from './shapes.js';
import { MAT } from './materials.js';
import { mulberry32 } from '../noise.js';

function sargassum(seed) {
  const b = new Builder(), rng = mulberry32(seed), col = [0.55, 0.4, 0.1];
  const leaves = [];
  for (let k = 0; k < 7; k++) {
    const a = rng() * TAU;
    branchesInto(b, rng, {
      depth: 2, len: 0.45, rad: 0.012, radial: 3, segs: 2, kids: [2, 3], spread: 0.7, up: -0.05, wiggle: 0.6,
      lenK: 0.7, radK: 0.8, tipK: 0.6, childAt: [0.3, 1],
      paint(level, v, x, y, z, o) { o[3] = col[0] * 0.7; o[4] = col[1] * 0.7; o[5] = col[2] * 0.7; o[6] = 0.12; o[7] = 1; },
      onTip(p) { leaves.push(p); },
    }, [(rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3], [Math.cos(a), -0.25 - rng() * 0.3, Math.sin(a)]);
  }
  for (const p of leaves) for (let k = 0; k < 5; k++) {
    const a = rng() * TAU, L = 0.11 + rng() * 0.08, w = 0.03;
    const d = [Math.cos(a), (rng() - 0.5) * 0.6, Math.sin(a)], sx = -d[2], sz = d[0];
    const q = [p[0] + (rng() - 0.5) * 0.08, p[1] + (rng() - 0.5) * 0.08, p[2] + (rng() - 0.5) * 0.08];
    const c = 0.8 + 0.4 * rng();
    const v0 = b.v(q[0] - sx * w, q[1], q[2] - sz * w, 0, 1, 0, col[0] * c, col[1] * c, col[2] * c, 0.12, 1);
    b.v(q[0] + sx * w, q[1], q[2] + sz * w, 0, 1, 0, col[0] * c, col[1] * c, col[2] * c, 0.12, 1);
    b.v(q[0] + d[0] * L, q[1] + d[1] * L, q[2] + d[2] * L, 0, 1, 0, col[0] * c * 1.2, col[1] * c * 1.2, col[2] * c, 0.12, 1);
    b.t(v0, v0 + 1, v0 + 2);
    if (k < 2) b.blob(0, (x, y, z, o) => { o[0] = q[0] + x * 0.012; o[1] = q[1] - 0.02 + y * 0.012; o[2] = q[2] + z * 0.012; o[3] = 0.6; o[4] = 0.45; o[5] = 0.12; o[6] = 0.12; o[7] = 1; });
  }
  return b.build();
}

export function initPelagic() {
  T.sargassum = vary([1, 2, 3, 4, 5, 6, 7, 8].map(sargassum), 2, 131, { disp: 0.1, bend: 0.1, twist: 0.6 });
  for (const t of T.sargassum) t.fact = 'Floating sargassum rafts are nurseries: young sea turtles hide and feed in them for years.';
}

export function layoutPelagic(ctx) {
  if (presence(ctx, 'pelagic') <= 0) return null;
  const rng = ctx.rng, sw = new Batch(MAT.sway, 15000 * budgetK(ctx, 'pelagic'), 'mid');
  const rafts = rng() < 0.55 ? 1 + Math.floor(rng() * 3) : 0;
  for (let r = 0; r < rafts; r++) {
    const s0 = ctx.s0 + rng() * 64, x0 = ctx.pathX(s0) + (rng() - 0.5) * 60;
    if (rng() > ctx.weightOf(s0, 'pelagic')) continue;
    const n = 6 + Math.floor(rng() * 14);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * (2 + n * 0.25), x = x0 + Math.cos(a) * rr, s = s0 + Math.sin(a) * rr;
      const y = ctx.surfaceY - 0.25 - rng() * 0.5, sc = 0.7 + rng() * 0.9;
      if (!tubeClear(ctx, x, s, y - 0.6 * sc, y, 0.8 * sc)) continue;
      const c = 0.85 + rng() * 0.3;
      sw.add(rng.pick(T.sargassum), x, y, -(s - ctx.s0), orient(0, 1, 0, 0, rng() * TAU, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3), sc, sc * 0.7, sc, c, c, c * 0.9, sc);
    }
  }
  return { batches: [sw] };
}
