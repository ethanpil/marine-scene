// Cenote caves: speleothems hanging from / rising to the rock, columns where floor and ceiling meet,
// breakdown boulders, drowned trees beneath the sky openings, and soft animated light shafts.
import * as THREE from 'three';
import { Builder, Batch, T, TAU, sat, sstep, lerp, vn3, floorSampler, presence, tubeClear, pointsClear, placedPoints, orient, rotY, rotZ, mul3, budgetK, bendSpots, TUBE } from './core.js';
import { branchesInto, stoneInto } from './shapes.js';
import { putFloor, putAt, pickW, tintFrom, spot, bendX, microDetail } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32 } from '../noise.js';

const LIME = [0.56, 0.52, 0.43];

function stalactite(seed, parts) {
  const b = new Builder(), rng = mulberry32(seed);
  for (const [L, ox, oz, rr] of parts) {
    const v0 = b.vc;
    b.lathe(9, 7, (v) => [rr * (0.26 * Math.pow(1 - v, 1.25) + 0.004 + 0.012 * Math.sin(v * 31 + seed) * (1 - v)), -v * L],
      (a, v) => 1 + 0.18 * vn3(Math.cos(a) * 1.5, v * 4, Math.sin(a) * 1.5, seed),
      (v, a, x, y, z, o) => { const band = 0.85 + 0.2 * Math.sin(v * 40 + seed); const ao = 0.55 + 0.45 * v; o[3] = LIME[0] * band * ao; o[4] = LIME[1] * band * ao; o[5] = LIME[2] * band * ao; o[6] = 0.1; o[7] = 2; },
      { flip: true });
    b.xform(v0, [1, 0, 0, 0, 1, 0, 0, 0, 1], ox, 0.02, oz);
  }
  return b.build();
}

function stalagmite(seed) {
  const b = new Builder();
  b.lathe(10, 8, (v) => [0.3 * Math.pow(1 - Math.pow(v, 1.8), 0.7) + 0.02 + 0.03 * Math.sin(v * 17 + seed) * (1 - v), v],
    (a, v) => 1 + 0.15 * vn3(Math.cos(a) * 1.5, v * 3, Math.sin(a) * 1.5, seed + 3),
    (v, a, x, y, z, o) => { const band = 0.85 + 0.18 * Math.sin(v * 30 + seed); const ao = 0.5 + 0.5 * v; o[3] = LIME[0] * band * ao; o[4] = LIME[1] * band * ao; o[5] = LIME[2] * band * ao; o[6] = 0.25; o[7] = 2; });
  return b.build();
}

function column(seed) {
  const b = new Builder();
  b.lathe(14, 12, (v) => [0.5 * (0.3 + 0.7 * Math.pow(Math.abs(2 * v - 1), 1.7)) + 0.04 * Math.sin(v * 23 + seed), v],
    (a, v) => 1 + 0.1 * Math.abs(Math.sin(a * 5 + v * 7)) + 0.12 * vn3(Math.cos(a) * 1.5, v * 5, Math.sin(a) * 1.5, seed),
    (v, a, x, y, z, o) => { const band = 0.82 + 0.2 * Math.sin(v * 50 + a); o[3] = LIME[0] * band; o[4] = LIME[1] * band; o[5] = LIME[2] * band; o[6] = 0.15; o[7] = 2; });
  return b.build();
}

function deadTree(seed) {
  const b = new Builder(), rng = mulberry32(seed);
  const paint = (level, v, x, y, z, o) => { const c = 0.7 + 0.3 * vn3(x * 2, y * 2, z * 2, seed); o[3] = 0.28 * c; o[4] = 0.22 * c; o[5] = 0.16 * c; o[6] = 0.35; o[7] = 0; };
  branchesInto(b, rng, {
    depth: 3, len: 2.4, rad: 0.2, radial: 6, segs: 3, kids: [2, 3], spread: 0.65, up: 0.05, wiggle: 0.25,
    lenK: 0.62, radK: 0.6, tipK: 0.4, childAt: [0.5, 1], continueTrunk: false, paint,
  });
  for (let k = 0; k < 5; k++) { // root plate
    const a = (k / 5) * TAU + rng();
    branchesInto(b, rng, {
      depth: 1, len: 0.9, rad: 0.11, radial: 5, segs: 2, kids: [1, 2], spread: 0.6, up: -0.15, wiggle: 0.3,
      lenK: 0.6, radK: 0.6, tipK: 0.3, childAt: [0.6, 1], paint,
    }, [0, 0.1, 0], [Math.cos(a), -0.35, Math.sin(a)]);
  }
  return b.build();
}

export function initCave() {
  T.stalactite = [
    stalactite(1, [[1, 0, 0, 1]]), stalactite(2, [[1, 0, 0, 1], [0.55, 0.12, 0.05, 0.7], [0.35, -0.08, 0.1, 0.6]]),
    stalactite(3, [[1, 0, 0, 1.2], [0.7, -0.15, -0.05, 0.8]]),
  ];
  T.stalagmite = [1, 2, 3].map(stalagmite);
  T.column = [1, 2].map(column);
  T.deadTree = [1, 2].map(deadTree);
  const b = new Builder(); stoneInto(b, { sx: 1.6, sy: 0.9, sz: 1.2, p: 4, rough: 0.12, seed: 5, detail: 2, col: LIME, growth: 0.2, mode: 2 });
  b.xform(0, [1, 0, 0, 0, 1, 0, 0, 0, 1], 0, 0.4, 0); T.block = [b.build()];
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    rock: { tpl: [...T.rocks, ...T.block], scale: [0.5, 2.2], follow: 0.6, tint: tintFrom([[0.62, 0.58, 0.5], [0.5, 0.48, 0.44]]) },
    pebbles: { tpl: T.pebbles, scale: [0.8, 1.7], follow: 1, sink: 0.02, tint: tintFrom([[0.85, 0.8, 0.7], [0.75, 0.72, 0.66]], 0.08) },
    grit: { tpl: T.rubble, scale: [0.8, 1.5], follow: 1, sink: 0.02, tint: tintFrom([[0.8, 0.77, 0.7]], 0.08) },
    mite: { tpl: T.stalagmite, scale: [0.6, 2.6], ys: [0.6, 1.4], follow: 0.15, tint: tintFrom([[1, 1, 1]]) },
  });
  S.micro = [{ w: 2, spec: S.pebbles }, { w: 1.4, spec: S.grit }];
  return S;
}

// ---------- light shafts ----------
function findOpenings(ctx, cell = 2) {
  const cols = 26, rows = Math.ceil(64 / cell), surf = ctx.surfaceY;
  const open = new Uint8Array(cols * rows), xs = new Float32Array(cols * rows), ss = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const s = ctx.s0 + (j + 0.5) * cell, px = ctx.pathX(s);
    for (let i = 0; i < cols; i++) {
      const x = px + (i - cols / 2 + 0.5) * cell, o = j * cols + i;
      xs[o] = x; ss[o] = s;
      open[o] = ctx.ceilingAt(x, s) > surf + 0.3 ? 1 : 0;
    }
  }
  const seen = new Uint8Array(cols * rows), clusters = [];
  for (let o = 0; o < open.length; o++) {
    if (!open[o] || seen[o]) continue;
    const stack = [o], cells = []; seen[o] = 1;
    while (stack.length) {
      const q = stack.pop(); cells.push(q);
      const i = q % cols, j = (q / cols) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const n = jj * cols + ii;
        if (open[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    let cx = 0, cs = 0;
    for (const q of cells) { cx += xs[q]; cs += ss[q]; }
    clusters.push({ x: cx / cells.length, s: cs / cells.length, r: Math.sqrt(cells.length * cell * cell / Math.PI), cells: cells.map((q) => [xs[q], ss[q]]) });
  }
  return clusters;
}

function shaftMesh(ctx, fs, rng, clusters, sunDir) {
  let d = [-sunDir.x * 0.55, -sunDir.y, -sunDir.z * 0.55];
  const l = Math.hypot(...d); d = d.map((v) => v / l);
  const beams = [];
  for (const c of clusters) {
    const n = Math.min(7, 2 + Math.round(c.r * 0.8));
    for (let k = 0; k < n; k++) {
      const [x, s] = c.cells[(rng() * c.cells.length) | 0];
      const top = [x + (rng() - 0.5) * 1.5, ctx.surfaceY - 0.05, -(s - ctx.s0) + (rng() - 0.5) * 1.5];
      const fy = fs.at(x, s);
      const L = (top[1] - fy) / -d[1] + 1;
      const r0 = 0.3 + rng() * Math.min(1.4, c.r * 0.35);
      beams.push({ top, L, r0, r1: r0 * 1.35 + L * 0.03, ph: rng() });
    }
  }
  if (!beams.length) return null;
  const NR = 14, NL = 3, vpb = NR * (NL + 1);
  const pos = new Float32Array(beams.length * vpb * 3), nor = new Float32Array(beams.length * vpb * 3), fx = new Float32Array(beams.length * vpb * 2);
  const idx = new Uint16Array(beams.length * NR * NL * 6);
  // frame perpendicular to d
  let a = [d[2], 0, -d[0]]; const al = Math.hypot(...a) || 1; a = a.map((v) => v / al);
  const bb = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
  let vi = 0, ii = 0;
  for (const B of beams) {
    const base = vi;
    for (let j = 0; j <= NL; j++) {
      const t = j / NL, r = lerp(B.r0, B.r1, t);
      const c = [B.top[0] + d[0] * B.L * t, B.top[1] + d[1] * B.L * t, B.top[2] + d[2] * B.L * t];
      for (let i = 0; i < NR; i++, vi++) {
        const ang = (i / NR) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        const n = [a[0] * ca + bb[0] * sa, a[1] * ca + bb[1] * sa, a[2] * ca + bb[2] * sa];
        pos.set([c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], vi * 3);
        nor.set(n, vi * 3);
        fx[vi * 2] = t; fx[vi * 2 + 1] = B.ph;
      }
    }
    for (let j = 0; j < NL; j++) for (let i = 0; i < NR; i++) {
      const p = base + j * NR + i, q = base + j * NR + ((i + 1) % NR), r = p + NR, s = q + NR;
      idx.set([p, q, r, q, s, r], ii); ii += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, MAT.shaft);
  m.matrixAutoUpdate = false;
  m.renderOrder = 3;
  return m;
}

export function makeCaveLayout(env) {
  return function layoutCave(ctx) {
    if (presence(ctx, 'cave') <= 0) return null;
    const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
    const st = new Batch(MAT.static, 80000 * budgetK(ctx, 'cave'));
    const extra = [];
    const clusters = findOpenings(ctx);
    const sm = shaftMesh(ctx, fs, rng, clusters, env.U.uSunDir.value);
    if (sm) extra.push(sm);
    // drowned trees and branches beneath the openings
    for (const c of clusters) {
      const n = Math.min(3, 1 + Math.floor(c.r / 4));
      for (let k = 0; k < n; k++) {
        if (rng() > ctx.weightOf(c.s, 'cave')) continue;
        const [x0, s0] = c.cells[(rng() * c.cells.length) | 0];
        const x = x0 + (rng() - 0.5) * 4, s = s0 + (rng() - 0.5) * 4;
        if (s < ctx.s0 || s >= ctx.s1) continue;
        const y = fs.at(x, s), tpl = rng.pick(T.deadTree), sc = 0.6 + rng() * 0.6;
        const R = mul3(rotY(rng() * TAU), rotZ(1.25 + rng() * 0.3));
        if (!pointsClear(ctx, placedPoints(tpl, x, y + 0.15, s, R, sc, sc, sc, 150), 0.3)) continue;
        st.add(tpl, x, y + 0.15 * sc, -(s - ctx.s0), R, sc, sc, sc, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 1);
      }
    }
    // stalactites from real ceiling (not in openings)
    for (let k = 0; k < 280; k++) {
      const p = spot(ctx, rng, 3.5, 24, 0.9);
      if (rng() > ctx.weightOf(p.s, 'cave')) continue;
      const c = ctx.ceilingAt(p.x, p.s);
      if (c > ctx.surfaceY - 0.4) continue;
      const f = fs.at(p.x, p.s), gap = c - f;
      if (gap < 1.2) continue;
      const L = Math.min(gap * 0.5, 0.4 + Math.pow(rng(), 1.4) * 4.5), sx = 0.7 + L * 0.4, tpl = rng.pick(T.stalactite);
      if (!tubeClear(ctx, p.x, p.s, c - L, c, 0.2 * sx)) continue;
      st.add(tpl, p.x, c + 0.25, -(p.s - ctx.s0), rotY(rng() * TAU), sx, L, sx, 0.9 + rng() * 0.2, 0.88 + rng() * 0.2, 0.85 + rng() * 0.2, 1);
    }
    // columns where the gap is small, away from the path
    for (let k = 0; k < 40; k++) {
      const p = spot(ctx, rng, 6, 24, 0.8);
      if (rng() > ctx.weightOf(p.s, 'cave')) continue;
      const c = ctx.ceilingAt(p.x, p.s);
      if (c > ctx.surfaceY - 0.4) continue;
      const f = fs.at(p.x, p.s), gap = c - f;
      if (gap < 1.5 || gap > 10) continue;
      const sx = 0.7 + rng() * 1.2;
      if (!tubeClear(ctx, p.x, p.s, f, c, 0.55 * sx)) continue;
      st.add(rng.pick(T.column), p.x, f - 0.3, -(p.s - ctx.s0), rotY(rng() * TAU), sx, gap + 0.6, sx, 0.9 + rng() * 0.15, 0.88 + rng() * 0.15, 0.85 + rng() * 0.15, 1);
    }
    // columns on the outside of bends: the camera swings around them
    for (const b of bendSpots(ctx)) {
      if (rng() > ctx.weightOf(b.s, 'cave') * 0.85) continue;
      const sx = 0.9 + rng() * 0.9, x = bendX(ctx, b, 0.62 * sx, rng, 1.0);
      const c = ctx.ceilingAt(x, b.s), f = fs.at(x, b.s), gap = c - f;
      if (c > ctx.surfaceY - 0.4 || gap < 1.5 || gap > 14) continue;
      if (!tubeClear(ctx, x, b.s, f, c, 0.62 * sx)) continue;
      st.add(rng.pick(T.column), x, f - 0.3, -(b.s - ctx.s0), rotY(rng() * TAU), sx, gap + 0.6, sx, 0.9 + rng() * 0.15, 0.88 + rng() * 0.15, 0.85 + rng() * 0.15, 1);
    }
    microDetail(ctx, fs, st, rng, 'cave', sp.micro, 110, 20);
    // stalagmites and breakdown boulders on the floor (low ones also under the path)
    for (let k = 0; k < 170; k++) {
      const p = spot(ctx, rng, 0, 24, 1);
      if (rng() > ctx.weightOf(p.s, 'cave')) continue;
      const c = ctx.ceilingAt(p.x, p.s);
      const spec = c < ctx.surfaceY - 0.4 && rng() < 0.55 ? sp.mite : sp.rock;
      putFloor(ctx, fs, st, spec, p.x, p.s, rng);
    }
    st.split = 2;
    return { batches: [st], extra };
  };
}
