// Polar sea ice: rubble keels and icebergs hanging from the ice ceiling, brinicles, and sparse benthos
// on the far floor. Ice uses the static material's translucent ice mode (5).
import { Builder, Batch, T, TAU, sat, sstep, vn3, fbm3, floorSampler, presence, tubeClear, pointsClear, placedPoints, rotY, rotX, rotZ, mul3, budgetK } from './core.js';
import { stoneInto } from './shapes.js';
import { putFloor, pickW, tintFrom, spot } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32 } from '../noise.js';

const ICE = [0.72, 0.84, 0.92];

// pressure-ridge keel: inverted pile of ice blocks; top at y = 0, spans x in [-L/2, L/2]
function rubbleKeel(seed, L = 10, D = 5) {
  const b = new Builder(), rng = mulberry32(seed), n = 22;
  for (let k = 0; k < n; k++) {
    const x = (rng() - 0.5) * L, prof = 1 - (2 * x / L) ** 2, y = -rng() * D * prof;
    const sx = 0.8 + rng() * 2.2, sy = 0.5 + rng() * 1.4, sz = 0.8 + rng() * 2;
    const v0 = b.vc;
    stoneInto(b, { sx, sy, sz, p: 3.2, rough: 0.12, seed: seed * 31 + k, detail: 1, col: ICE, growth: 0.9, mode: 5 });
    b.paint(v0, (i, px, py, pz, nx, ny, nz, o) => { const c = 0.8 + 0.25 * vn3(px * 2, py * 2, pz * 2, k); o[0] = ICE[0] * c; o[1] = ICE[1] * c; o[2] = ICE[2] * c; o[3] = 0.6 + 0.4 * rng(); o[4] = 5; });
    b.xform(v0, mul3(rotY(rng() * TAU), mul3(rotX((rng() - 0.5) * 1.2), rotZ((rng() - 0.5) * 1.2))), x, Math.min(-0.3, y), (rng() - 0.5) * 2.5);
  }
  return b.build();
}

// iceberg: faceted mass, flat top at y = 0, unit size (scaled per instance)
function iceberg(seed) {
  const b = new Builder();
  b.blob(4, (x, y, z, o) => {
    let d = 1 + 0.35 * fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, 3, seed);
    d += 0.15 * Math.abs(vn3(x * 3, y * 3, z * 3, seed + 3));
    let py = y * d;
    py = py > -0.1 ? -0.1 * (1 - sat(py)) * 0.2 : py * (1.3 + 0.4 * vn3(x * 2, z * 2, 0, seed + 5));
    o[0] = x * d; o[1] = py + 0.05; o[2] = z * d * 0.8;
    const c = 0.85 + 0.2 * vn3(x * 4, y * 4, z * 4, seed);
    o[3] = ICE[0] * c; o[4] = ICE[1] * c; o[5] = ICE[2] * c; o[6] = 0.5 + 0.5 * sat(-py); o[7] = 5;
  });
  return b.build();
}

function brinicle(seed) {
  const b = new Builder();
  b.lathe(7, 6, (v) => [0.08 * (1 - v) ** 1.3 + 0.008 + 0.012 * Math.sin(v * 30 + seed), -v], (a, v) => 1 + 0.25 * vn3(Math.cos(a), v * 6, Math.sin(a), seed),
    (v, a, x, y, z, o) => { o[3] = 0.85; o[4] = 0.93; o[5] = 1.0; o[6] = 1.2; o[7] = 5; }, { flip: true });
  return b.build();
}

export function initPolar() {
  T.keel = [rubbleKeel(1, 10, 5), rubbleKeel(2, 14, 7), rubbleKeel(3, 8, 4)];
  T.berg = [1, 2].map(iceberg);
  T.brinicle = [1, 2].map(brinicle);
}

const S = {};
function specs() {
  if (S.sponge) return S;
  Object.assign(S, {
    sponge: { tpl: T.tubeSp, scale: [0.8, 1.6], follow: 0.5, tint: tintFrom([[0.75, 0.72, 0.6], [0.7, 0.6, 0.3]]) },
    soft: { tpl: T.soft, scale: [0.8, 1.5], follow: 0.4, sway: true, tint: tintFrom([[0.8, 0.4, 0.35], [0.8, 0.75, 0.7]]) },
    anem: { tpl: T.anem, scale: [0.9, 1.5], follow: 0.7, sway: true, tint: tintFrom([[0.9, 0.9, 0.9]]) },
    star: { tpl: T.star, scale: [0.15, 0.3], follow: 1, sink: 0, tint: tintFrom([[0.9, 0.3, 0.1], [0.8, 0.6, 0.2]]) },
    rock: { tpl: T.rocks, scale: [0.6, 2], follow: 0.5, tint: tintFrom([[0.35, 0.35, 0.36]]) },
  });
  S.list = [{ w: 2, k: 'sponge' }, { w: 1.4, k: 'soft', sway: true }, { w: 1.4, k: 'anem', sway: true }, { w: 1, k: 'star' }, { w: 1.5, k: 'rock' }];
  return S;
}

const bergs = new Map();
function segmentBergs(ctx, seg) {
  let B = bergs.get(seg.id);
  if (B && B.seed === seg.seed) return B;
  const rng = mulberry32(seg.seed ^ 0x1ce), list = [];
  for (let s = seg.start + 130 + rng() * 80; s < seg.end - 120; s += 160 + rng() * 220) {
    const side = rng() < 0.5 ? -1 : 1, size = 12 + rng() * 10, x = ctx.pathX(s) + side * (size * 1.1 + 12 + rng() * 15);
    const c = Math.min(ctx.surfaceY - 0.2, ctx.ceilingAt(x, s));
    const tpl = rng.pick(T.berg), R = rotY(rng() * TAU), sy = size * (0.9 + rng() * 0.6);
    const pts = placedPoints(tpl, x, c + 0.5, s, R, size, sy, size, 200);
    if (!pointsClear(ctx, pts, 1)) continue;
    let sMax = -1e9; for (let i = 2; i < pts.length; i += 3) sMax = Math.max(sMax, pts[i]);
    list.push({ tpl, x, y: c + 0.5, s, R, size, sy, sMax });
  }
  B = { seed: seg.seed, list };
  bergs.set(seg.id, B);
  if (bergs.size > 24) bergs.delete(bergs.keys().next().value);
  return B;
}

export function layoutPolar(ctx) {
  if (presence(ctx, 'polar') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
  const st = new Batch(MAT.static, 70000 * budgetK(ctx, 'polar')), sw = new Batch(MAT.sway, 15000 * budgetK(ctx, 'polar'));
  const idx = Math.floor(ctx.s0 / 64);
  for (const seg of ctx.segments) {
    if (seg.key !== 'polar') continue;
    for (const g of segmentBergs(ctx, seg).list) if (Math.floor(g.sMax / 64) === idx) st.add(g.tpl, g.x, g.y, -(g.s - ctx.s0), g.R, g.size, g.sy, g.size, 1, 1, 1, 1);
  }
  // rubble keels under the ice (not in open leads)
  for (let k = 0; k < 16; k++) {
    const p = spot(ctx, rng, 6, 45, 0.9);
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    const c = ctx.ceilingAt(p.x, p.s);
    if (c > ctx.surfaceY - 0.4) continue;
    const tpl = rng.pick(T.keel), sc = 0.7 + rng() * 0.7, yaw = rng() * TAU, R = rotY(yaw);
    const pts = placedPoints(tpl, p.x, c + 0.4, p.s, R, sc, sc, sc, 120);
    if (!pointsClear(ctx, pts, 0.6)) continue;
    st.add(tpl, p.x, c + 0.4, -(p.s - ctx.s0), R, sc, sc * (0.8 + rng() * 0.6), sc, 1, 1, 1, 1);
  }
  // brinicles
  for (let k = 0; k < 14; k++) {
    const p = spot(ctx, rng, 5, 35, 1);
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    const c = ctx.ceilingAt(p.x, p.s);
    if (c > ctx.surfaceY - 0.4) continue;
    const L = 1 + rng() * 4;
    if (!tubeClear(ctx, p.x, p.s, c - L, c, 0.2)) continue;
    st.add(rng.pick(T.brinicle), p.x, c + 0.15, -(p.s - ctx.s0), rotY(rng() * TAU), 1 + rng() * 0.6, L, 1 + rng() * 0.6, 1, 1, 1, 1);
  }
  // benthos far below
  for (let k = 0; k < 45; k++) {
    const p = spot(ctx, rng, 0, 40, 1);
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    const e = pickW(rng, sp.list);
    putFloor(ctx, fs, e.sway ? sw : st, sp[e.k], p.x, p.s, rng);
  }
  st.split = 2; sw.split = 1;
  return { batches: [st, sw] };
}
