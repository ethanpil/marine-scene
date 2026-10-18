// Polar sea ice: rubble keels and icebergs hanging from the ice ceiling, brinicles, and sparse benthos
// on the far floor. Ice uses the static material's translucent ice mode (5).
import { Builder, Batch, T, TAU, sat, sstep, vn3, fbm3, floorSampler, presence, tubeClear, pointsClear, placedPoints, rotY, rotX, rotZ, mul3, budgetK, bendSpots, vary, tierK, poi } from './core.js';
import { stoneInto } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, bendX, clusterer, ceilY, hangAt } from './scatter.js';
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

// smooth melt-sculpted keel; optional vertical brine channels
function sculptedKeel(seed, channels) {
  const b = new Builder(), rng = mulberry32(seed * 61), L = 6 + rng() * 10, D = 3 + rng() * 6, W = 2 + rng() * 3, ch = 8 + Math.floor(rng() * 10);
  b.blob(3, (x, y, z, o) => {
    let d = 1 + 0.25 * fbm3(x * 1.2 + seed, y * 1.2, z * 1.2, 2, seed);
    const th = Math.atan2(z, x);
    if (channels) d *= 1 - 0.08 * Math.pow(Math.abs(Math.sin(th * ch / 2)), 8) * sat(-y);
    let py = y * d; py = py > 0 ? py * 0.1 : py;
    o[0] = x * d * L / 2; o[1] = py * D; o[2] = z * d * W / 2;
    const c = 0.85 + 0.2 * vn3(x * 3, y * 3, z * 3, seed);
    o[3] = ICE[0] * c; o[4] = ICE[1] * c; o[5] = ICE[2] * c; o[6] = 0.7 + 0.3 * sat(-y); o[7] = 5;
  });
  const t = b.build(); t.label = channels ? 'Ice keel with brine channels' : 'Sculpted ice keel';
  t.fact = 'Keels can reach tens of metres below sea ice; algae living inside the ice feed the whole polar food web.';
  return t;
}

function brinicle(seed) {
  const b = new Builder();
  b.lathe(7, 6, (v) => [0.08 * (1 - v) ** 1.3 + 0.008 + 0.012 * Math.sin(v * 30 + seed), -v], (a, v) => 1 + 0.25 * vn3(Math.cos(a), v * 6, Math.sin(a), seed),
    (v, a, x, y, z, o) => { o[3] = 0.85; o[4] = 0.93; o[5] = 1.0; o[6] = 1.2; o[7] = 5; }, { flip: true });
  const t = b.build();
  t.fact = 'A brinicle is a tube of ice around sinking super-cold brine; where it touches the seabed it freezes everything it meets.';
  return t;
}

export function initPolar() {
  T.keel = [[1, 10, 5], [2, 14, 7], [3, 8, 4], [4, 12, 9], [5, 6, 3], [6, 16, 6]].map(([s, L, D]) => rubbleKeel(s, L, D));
  T.keel.push(...[1, 2, 3].map((s) => sculptedKeel(s, false)), ...[4, 5, 6].map((s) => sculptedKeel(s, true)));
  T.berg = vary([1, 2, 3, 4, 5].map(iceberg), 2, 111, { disp: 0.1, bend: 0.05, twist: 0.3 });
  T.brinicle = vary([1, 2, 3, 4, 5, 6].map(brinicle), 2, 121, { disp: 0.15, bend: 0.2, twist: 0.6 });
}

const S = {};
function specs() {
  if (S.sponge) return S;
  Object.assign(S, {
    sponge: { tpl: T.tubeSp, scale: [0.8, 1.6], follow: 0.5, tint: tintFrom([[0.75, 0.72, 0.6], [0.7, 0.6, 0.3]]) },
    soft: { tpl: T.soft, scale: [0.8, 1.5], follow: 0.4, sway: true, tint: tintFrom([[0.8, 0.4, 0.35], [0.8, 0.75, 0.7]]) },
    anem: { tpl: T.anem, scale: [0.9, 1.5], follow: 0.7, sway: true, tint: tintFrom([[0.9, 0.9, 0.9]]) },
    star: { tpl: T.star, scale: [0.15, 0.3], follow: 1, sink: 0, tint: tintFrom([[0.9, 0.3, 0.1], [0.8, 0.6, 0.2]]) },
    rock: { tpl: T.rocks, scale: [0.6, 2], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.5, tint: tintFrom([[0.35, 0.35, 0.36]]) },
  });
  S.list = [{ w: 2, k: 'sponge' }, { w: 1.4, k: 'soft', sway: true }, { w: 1.4, k: 'anem', sway: true }, { w: 1, k: 'star' }, { w: 1.5, k: 'rock' }];
  return S;
}

// ---------- per-segment communities ----------
const COMMUNITIES = [
  { name: 'pressure-ridge rubble', keels: () => T.keel.slice(0, 6), n: 18, brinicles: 1.0 },
  { name: 'melt-sculpted keels', keels: () => T.keel.slice(6), n: 13, brinicles: 1.6 },
];
function community(ctx) {
  const seg = ctx.segments.find((g) => g.key === 'polar');
  return seg ? COMMUNITIES[Math.floor(mulberry32(seg.seed ^ 0x1c3)() * COMMUNITIES.length)] : COMMUNITIES[0];
}

const bergs = new Map();
function segmentBergs(ctx, seg) {
  let B = bergs.get(seg.id);
  if (B && B.seed === seg.seed) return B;
  const rng = mulberry32(seg.seed ^ 0x1ce), list = [];
  for (let s = seg.start + 130 + rng() * 80; s < seg.end - 120; s += 160 + rng() * 220) {
    const side = rng() < 0.5 ? -1 : 1, size = 12 + rng() * 10, x = ctx.pathX(s) + side * (size * 1.1 + 12 + rng() * 15);
    const tpl = rng.pick(T.berg), R = rotY(rng() * TAU), sy = size * (0.9 + rng() * 0.6);
    const y = Math.min(ctx.surfaceY + 0.3, ceilY(ctx, x, s, tpl, R, size, sy, size) + 0.4); // frozen into the ice sheet
    const pts = placedPoints(tpl, x, y, s, R, size, sy, size, 200);
    if (!pointsClear(ctx, pts, 1)) continue;
    let sMax = -1e9; for (let i = 2; i < pts.length; i += 3) sMax = Math.max(sMax, pts[i]);
    list.push({ tpl, x, y, s, R, size, sy, sMax });
  }
  B = { seed: seg.seed, list };
  bergs.set(seg.id, B);
  if (bergs.size > 24) bergs.delete(bergs.keys().next().value);
  return B;
}

export function layoutPolar(ctx) {
  if (presence(ctx, 'polar') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx), comm = community(ctx), bk = budgetK(ctx, 'polar'), tk = tierK(ctx);
  const st = new Batch(MAT.static, 60000 * bk);                                                     // keels, bergs
  const mid = new Batch(MAT.static, 16000 * bk * tk, 'mid'), sw = new Batch(MAT.sway, 12000 * bk * tk, 'mid'); // brinicles, benthos
  const idx = Math.floor(ctx.s0 / 64);
  for (const seg of ctx.segments) {
    if (seg.key !== 'polar') continue;
    for (const g of segmentBergs(ctx, seg).list) if (Math.floor(g.sMax / 64) === idx && st.add(g.tpl, g.x, g.y, -(g.s - ctx.s0), g.R, g.size, g.sy, g.size, 1, 1, 1, 1)) {
      const it = st.last;
      it.hang = 1;
      poi(ctx, 'iceberg', g.x, g.y - (g.tpl.maxY - g.tpl.minY) * g.sy * 0.45, g.s, g.size, { size: g.size });
    }
  }
  // keels under the ice (not in open leads); some on the outside of bends, dead ahead
  const keels = comm.keels(), keelSpots = bendSpots(ctx).map((b) => ({ s: b.s, x: bendX(ctx, b, 5.5, rng, 1.5) }));
  for (let k = 0; k < comm.n + keelSpots.length; k++) {
    const p = k < keelSpots.length ? keelSpots[k] : spot(ctx, rng, 6, 45, 0.9);
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    if (ctx.ceilingAt(p.x, p.s) > ctx.surfaceY - 0.4) continue;
    const tpl = rng.pick(keels), sc = 0.7 + rng() * 0.7, sy = sc * (0.8 + rng() * 0.6), R = rotY(rng() * TAU);
    const y = ceilY(ctx, p.x, p.s, tpl, R, sc, sy, sc) + 0.3;
    if (!pointsClear(ctx, placedPoints(tpl, p.x, y, p.s, R, sc, sy, sc, 2000), 0.6)) continue;
    if (st.add(tpl, p.x, y, -(p.s - ctx.s0), R, sc, sy, sc, 1, 1, 1, 1)) st.last.hang = 1;
  }
  // brinicles: brine icicles growing down from the ice
  for (let k = 0; k < 14 * comm.brinicles * tk; k++) {
    const p = spot(ctx, rng, 5, 35, 1);
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    const c = ctx.ceilingAt(p.x, p.s);
    if (c > ctx.surfaceY - 0.4) continue;
    const L = 1 + rng() * 4, w = 1 + rng() * 0.6;
    if (!tubeClear(ctx, p.x, p.s, c - L, c, 0.2)) continue;
    hangAt(ctx, mid, rng.pick(T.brinicle), p.x, p.s, rotY(rng() * TAU), w, L, w, [1, 1, 1], 1, 0.1);
  }
  // benthos far below
  const nextP136 = clusterer(ctx, rng, 0, 40, 1);
  for (let k = 0; k < 45 * tk; k++) {
    const p = nextP136();
    if (!p) continue;
    if (rng() > ctx.weightOf(p.s, 'polar')) continue;
    const e = pickW(rng, sp.list);
    putFloor(ctx, fs, e.sway ? sw : mid, sp[e.k], p.x, p.s, rng);
  }
  return { batches: [st, mid, sw] };
}
