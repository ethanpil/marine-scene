// Giant kelp forest: stipes rise from holdfasts to the surface, carrying blades on gas bladders,
// and spread into a floating canopy. Sway (style 1) grows with height so bases stay anchored.
import { Builder, Batch, T, TAU, sat, sstep, lerp, floorSampler, presence, tubeClear, orient, budgetK, bendSpots, LENS } from './core.js';
import { grassPatch } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, putBend, microDetail } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32, noise2 } from '../noise.js';

const STIPE = [0.45, 0.32, 0.1], BLADE = [0.8, 0.6, 0.16];

function octa(b, c, rx, ry, rz, col, f0, f1) {
  const v = [
    b.v(c[0] + rx, c[1], c[2], 1, 0, 0, ...col, f0, f1), b.v(c[0] - rx, c[1], c[2], -1, 0, 0, ...col, f0, f1),
    b.v(c[0], c[1] + ry, c[2], 0, 1, 0, ...col, f0, f1), b.v(c[0], c[1] - ry, c[2], 0, -1, 0, ...col, f0, f1),
    b.v(c[0], c[1], c[2] + rz, 0, 0, 1, ...col, f0, f1), b.v(c[0], c[1], c[2] - rz, 0, 0, -1, ...col, f0, f1),
  ];
  const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  for (const f of F) b.t(v[f[0]], v[f[1]], v[f[2]]);
}

// one leaf-shaped ruffled blade from p along direction d (unit), drooping
function blade(b, rng, p, d, L, W, sw, swTip, droop) {
  const side = [-d[2], 0, d[0]], sl = Math.hypot(side[0], side[2]) || 1;
  side[0] /= sl; side[2] /= sl;
  const segs = 3, k = rng() * 10;
  let q = p.slice(), dir = d.slice();
  const v0 = b.vc;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = W * Math.pow(Math.sin(Math.min(1, t * 0.9 + 0.1) * Math.PI), 0.7) * (i === segs ? 0.2 : 1);
    const ruf = 0.25 * W * Math.sin(t * 9 + k);
    const c = 0.8 + 0.4 * t;
    const f = lerp(sw, swTip, t);
    b.v(q[0] - side[0] * w, q[1] + ruf, q[2] - side[2] * w, 0, 1, 0, BLADE[0] * c, BLADE[1] * c, BLADE[2] * c, f, 1);
    b.v(q[0] + side[0] * w, q[1] - ruf, q[2] + side[2] * w, 0, 1, 0, BLADE[0] * c, BLADE[1] * c, BLADE[2] * c, f, 1);
    dir = [dir[0], dir[1] - droop, dir[2]];
    const l = Math.hypot(...dir); dir = dir.map((x) => x / l);
    q = [q[0] + dir[0] * L / segs, q[1] + dir[1] * L / segs, q[2] + dir[2] * L / segs];
  }
  const i0 = b.I.length;
  for (let i = 0; i < segs; i++) { const a = v0 + i * 2; b.t(a, a + 2, a + 1); b.t(a + 1, a + 2, a + 3); }
  b.smooth(v0, i0);
}

function kelpPlant(seed, H, lod = 0) {
  const b = new Builder(), rng = mulberry32(seed);
  const amp = 0.9 * Math.min(1, H / 14) + 0.25;
  const swAt = (y) => amp * Math.pow(sat(y / H), 1.3);
  // holdfast: tangle of root-like lumps
  b.blob(2, (x, y, z, o) => {
    const d = 1 + 0.35 * Math.sin(x * 7 + seed) * Math.sin(z * 6);
    o[0] = x * 0.35 * d; o[1] = Math.max(0, y) * 0.28 + 0.02; o[2] = z * 0.35 * d;
    o[3] = STIPE[0] * 0.8; o[4] = STIPE[1] * 0.8; o[5] = STIPE[2] * 0.8; o[6] = 0; o[7] = 1;
  });
  const nSt = lod ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
  for (let k = 0; k < nSt; k++) {
    const ca = rng() * TAU, cd = [Math.cos(ca), Math.sin(ca)];
    let p = [(rng() - 0.5) * 0.3, 0.2, (rng() - 0.5) * 0.3];
    const pts = [p], top = H - 0.3 - rng() * 0.25, step = lod ? 1.4 : 0.75;
    const wx = rng() * 10, wz = rng() * 10;
    while (p[1] < top - step) {
      const y = p[1] + step;
      p = [p[0] + 0.12 * Math.sin(y * 0.4 + wx) + cd[0] * 0.03, y, p[2] + 0.12 * Math.sin(y * 0.37 + wz) + cd[1] * 0.03];
      pts.push(p);
    }
    const nTop = pts.length;
    const lc = 3 + rng() * 3.5, nc = lod ? 3 : 6; // canopy run along the surface
    for (let i = 1; i <= nc; i++) {
      p = [p[0] + cd[0] * lc / nc, top + 0.06 * Math.sin(i * 1.7), p[2] + cd[1] * lc / nc];
      pts.push(p);
    }
    b.tube(pts, pts.map((q, i) => (lod ? 0.06 : 0.045) * (1 - 0.35 * i / pts.length)), lod ? 3 : 4, (v, a, x, y, z, o) => {
      const c = 0.8 + 0.3 * sat(y / H); o[3] = STIPE[0] * c; o[4] = STIPE[1] * c; o[5] = STIPE[2] * c; o[6] = swAt(y); o[7] = 1;
    });
    // blades + bladders
    for (let i = 2; i < pts.length; i++) {
      const q = pts[i], canopy = i >= nTop, sideA = ca + (i % 2 ? 1 : -1) * (1.2 + rng() * 0.6);
      const up = canopy ? -0.2 - rng() * 0.4 : 0.55 + rng() * 0.4;
      const d = [Math.cos(sideA), up, Math.sin(sideA)], l = Math.hypot(...d);
      const bp = [q[0] + d[0] / l * 0.05, q[1] + d[1] / l * 0.05, q[2] + d[2] / l * 0.05];
      const sw = swAt(q[1]);
      if (!lod && i % 2) octa(b, bp, 0.035, 0.055, 0.035, [STIPE[0] * 1.5, STIPE[1] * 1.5, STIPE[2] * 1.4], sw, 1);
      const L = (canopy ? 1.3 : 0.95) + rng() * 0.6 + (lod ? 0.5 : 0);
      blade(b, rng, bp, [d[0] / l, d[1] / l, d[2] / l], L, (lod ? 0.2 : 0.13) + rng() * 0.08, sw, sw + 0.18, canopy ? 0.12 : 0.25);
    }
  }
  return b.build();
}

export function initKelp() {
  T.kelp = [6, 10, 15, 21].map((H, i) => [kelpPlant(10 + i * 3, H), kelpPlant(11 + i * 3, H)]);
  T.kelpLo = [6, 10, 15, 21].map((H, i) => [kelpPlant(50 + i * 3, H, 1), kelpPlant(51 + i * 3, H, 1)]);
  T.kelpH = [6, 10, 15, 21];
  // true horizontal reach of each plant below its canopy (stipe drift + blades), for the tube test
  for (const t of [...T.kelp.flat(), ...T.kelpLo.flat()]) {
    let r = 0;
    for (let i = 0; i < t.vc; i++) if (t.pos[i * 3 + 1] < t.maxY * 0.85) r = Math.max(r, Math.hypot(t.pos[i * 3], t.pos[i * 3 + 2]));
    t.rLow = r;
  }
  T.understory = [1, 2].map((s) => grassPatch(40 + s, { n: 7, r: 0.35, h: 0.5, w: 0.05, segs: 3, base: [0.12, 0.09, 0.03], mid: [0.35, 0.26, 0.07], tipc: [0.45, 0.36, 0.1], sway: 0.25 }));
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    rock: { tpl: T.rocks, scale: [0.6, 2.4], follow: 0.5, tint: tintFrom([[0.38, 0.36, 0.33], [0.32, 0.33, 0.3]]) },
    boulder: { tpl: T.mound, scale: [1.2, 2.8], follow: 0.3, tint: tintFrom([[0.36, 0.34, 0.3]]), sink: 0.15 },
    urchin: { tpl: T.urchin[0], scale: [0.06, 0.1], follow: 0.8, tint: tintFrom([[0.55, 0.22, 0.6], [0.7, 0.18, 0.15], [0.3, 0.22, 0.32]]) },
    star: { tpl: T.star, scale: [0.1, 0.2], follow: 0.95, sink: 0, tint: tintFrom([[0.85, 0.3, 0.06], [0.5, 0.2, 0.55], [0.75, 0.12, 0.1]]) },
    anem: { tpl: T.anem, scale: [0.6, 1.1], follow: 0.7, sway: true, tint: tintFrom([[0.9, 0.45, 0.45], [0.6, 0.7, 0.55], [0.85, 0.75, 0.6]]) },
    sponge: { tpl: T.tubeSp, scale: [0.5, 1.0], follow: 0.5, tint: tintFrom([[0.7, 0.45, 0.15], [0.55, 0.25, 0.4]]) },
    bendRock: { tpl: [...T.mound, ...T.pinnacle], scale: [1.4, 2.2], follow: 0.2, sink: 0.25, tint: tintFrom([[0.42, 0.38, 0.34], [0.38, 0.36, 0.33]]) },
    pebbles: { tpl: T.pebbles, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[0.6, 0.58, 0.55], [0.55, 0.5, 0.45]], 0.1) },
    algae: { tpl: T.algae, scale: [0.6, 1.5], follow: 1, sink: 0.01, tint: tintFrom([[0.9, 0.45, 0.5], [0.7, 0.55, 0.3], [0.55, 0.6, 0.3]], 0.12) },
    lump: { tpl: T.spongeLump, scale: [0.8, 1.6], follow: 0.7, tint: tintFrom([[0.85, 0.55, 0.2], [0.8, 0.3, 0.3], [0.7, 0.65, 0.4]]) },
    under: { tpl: T.understory, scale: [0.8, 1.6], follow: 0.6, sway: true, tint: tintFrom([[1, 1, 1]], 0.2) },
  });
  S.micro = [{ w: 3, spec: S.pebbles }, { w: 2.2, spec: S.algae }, { w: 1.4, spec: S.lump }];
  S.floorList = [
    { w: 3, k: 'rock' }, { w: 2.5, k: 'under', sway: true }, { w: 1.5, k: 'urchin' }, { w: 1, k: 'star' },
    { w: 0.8, k: 'anem', sway: true }, { w: 0.6, k: 'sponge' }, { w: 0.5, k: 'boulder' },
  ];
  return S;
}

export function layoutKelp(ctx) {
  if (presence(ctx, 'kelp') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
  const bk = budgetK(ctx, 'kelp');
  const kb = new Batch(MAT.sway, 120000 * bk), st = new Batch(MAT.static, 40000 * bk), sw = new Batch(MAT.sway, 12000 * bk);
  const plants = [];
  for (let k = 0; k < 130; k++) {
    const p = spot(ctx, rng, 0, 45, 1.3);
    const grove = 0.5 + 0.5 * noise2(p.x / 26, p.s / 26, 301);
    if (rng() > ctx.weightOf(p.s, 'kelp') * (0.45 + 0.75 * grove)) continue;
    plants.push(p);
  }
  plants.sort((a, b) => a.d - b.d);
  for (const p of plants) {
    const y = fs.at(p.x, p.s), H = ctx.surfaceY - 0.35 - y;
    if (H < 3.5) continue;
    let ci = 0;
    for (let i = 0; i < T.kelpH.length; i++) if (Math.abs(T.kelpH[i] - H) < Math.abs(T.kelpH[ci] - H)) ci = i;
    const lod = p.d > 20;
    const tpl = rng.pick((lod ? T.kelpLo : T.kelp)[ci]), sy = H / tpl.maxY;
    if (sy < 0.6 || sy > 1.6) continue;
    const sx = 0.9 + rng() * 0.3;
    // kelp is soft: the camera may fly through the forest, only the lens radius stays clear
    if (!tubeClear(ctx, p.x, p.s, y, y + H + 0.5, tpl.rLow * sx + 0.2, 0.1, LENS)) continue;
    const R = orient(0, 1, 0, 0, rng() * TAU);
    const c = 0.85 + rng() * 0.3;
    kb.add(tpl, p.x, y - 0.05, -(p.s - ctx.s0), R, sx, sy, sx, c, c * (0.95 + rng() * 0.1), c * (0.85 + rng() * 0.2), 1);
    if (!lod && rng() < 0.4) putFloor(ctx, fs, st, sp.rock, p.x + (rng() - 0.5) * 2, p.s + (rng() - 0.5) * 2, rng, 0.6);
  }
  // boulders on the outside of bends, ringed by holdfasts
  for (const b of bendSpots(ctx)) {
    if (rng() > ctx.weightOf(b.s, 'kelp') * 0.8) continue;
    const x = putBend(ctx, fs, st, sp.bendRock, b, rng);
    if (x !== null) for (let j = 0; j < 4; j++) putFloor(ctx, fs, st, sp.rock, x + (rng() - 0.5) * 6, b.s + (rng() - 0.5) * 6, rng, 0.7);
  }
  microDetail(ctx, fs, st, rng, 'kelp', sp.micro, 150, 28);
  for (let k = 0; k < 150; k++) {
    const p = spot(ctx, rng, 0, 36, 1.3);
    if (rng() > ctx.weightOf(p.s, 'kelp')) continue;
    const e = pickW(rng, sp.floorList);
    putFloor(ctx, fs, e.sway ? sw : st, sp[e.k], p.x, p.s, rng, 0.8 + sstep(4, 30, p.d) * 0.6);
  }
  kb.split = 3; st.split = 1; sw.split = 1; st.from = 3; sw.from = 3;
  return { batches: [kb, st, sw] };
}
