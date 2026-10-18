// Coral reef: bommies (coral heads) built around a massive coral / rock core, plus scattered life.
import { Builder, Batch, T, TAU, fbm3, vn3, sat, sstep, lerp, floorSampler, presence, budgetK, bendSpots } from './core.js';
import { rockInto, branchesInto, seaFan, tubeSponges, softCoral, leatherCoral, anemone, seaWhips, seastar, urchin } from './shapes.js';
import { putAt, putFloor, pickW, tintFrom, spot, bendX, microDetail } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32, noise2 } from '../noise.js';

// ---------- reef-specific templates ----------
function staghorn(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 3 + (seed % 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng(), r = k ? 0.12 + rng() * 0.15 : 0;
    branchesInto(b, rng, {
      depth: 3, len: 0.32, rad: 0.06, radial: 4, segs: 2, kids: [1, 2], spread: 0.55, up: 0.14, wiggle: 0.3,
      lenK: 0.85, radK: 0.8, tipK: 0.55, childAt: [0.5, 1],
      paint(level, v, x, y, z, o) { const t = sat(y / 0.9); o[3] = o[4] = o[5] = 0.45 + 0.6 * t + (level === 3 ? 0.3 * v : 0); o[7] = 2; },
    }, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5]);
  }
  return b.build();
}

function tableCoral(seed) {
  const b = new Builder();
  b.lathe(8, 2, (v) => [0.13 - 0.04 * v, v * 0.22], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.3 + 0.3 * v; });
  const R = (a) => 0.9 * (1 + 0.16 * vn3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, seed, seed) + 0.04 * Math.sin(a * 9 + seed));
  const Y = (r, a) => 0.2 + 0.18 * r * r + 0.03 * vn3(Math.cos(a) * r * 3, Math.sin(a) * r * 3, 1, seed + 3);
  const NU = 28;
  b.grid(NU, 6, (u, v, i, j, o) => { const a = u * TAU, r = v * R(a); o[0] = Math.cos(a) * r; o[1] = Y(v, a); o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.85 + 0.3 * v; o[7] = 2; }, { wrapU: true, flip: true });
  b.grid(NU, 4, (u, v, i, j, o) => { const a = u * TAU, rv = 1 - v, r = rv * R(a); o[0] = Math.cos(a) * r; o[1] = Y(rv, a) - 0.07 * (1 - 0.6 * rv); o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.3 + 0.15 * rv; }, { wrapU: true, flip: true });
  b.grid(NU, 1, (u, v, i, j, o) => { const a = u * TAU, r = R(a); o[0] = Math.cos(a) * r; o[1] = Y(1, a) - 0.04 * v; o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.9; }, { wrapU: true, flip: true });
  return b.build();
}

function brainCoral(seed) {
  const b = new Builder();
  b.blob(4, (x, y, z, o) => {
    const d = 1 + 0.1 * fbm3(x * 1.4 + seed, y * 1.4, z * 1.4, 2, seed);
    const py = y >= 0 ? y * 0.78 : y * 0.15;
    o[0] = x * d; o[1] = (py + 0.08) * d; o[2] = z * d * (0.85 + 0.1 * (seed % 3));
    const ao = 0.35 + 0.65 * sstep(-0.15, 0.5, y);
    o[3] = o[4] = o[5] = ao; o[6] = 0; o[7] = 1;
  });
  return b.build();
}

function boulderCoral(seed) {
  const b = new Builder();
  b.blob(4, (x, y, z, o) => {
    const d = 1 + 0.3 * fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, 3, seed) + 0.08 * vn3(x * 4, y * 4, z * 4, seed + 1);
    let py = y * d; if (py < -0.15) py = -0.15 + (py + 0.15) * 0.15;
    o[0] = x * d * 1.25; o[1] = (py + 0.15) * 0.8; o[2] = z * d * 1.05;
    const ao = 0.35 + 0.65 * sstep(-0.1, 0.6, y);
    o[3] = o[4] = o[5] = ao; o[6] = 0.35; o[7] = 2;
  });
  return b.build();
}

function barrelSponge(seed) {
  const b = new Builder(), H = 1.1;
  const prof = (v) => 0.38 * (0.62 + 0.55 * Math.sin(v * 2.4 + 0.35));
  b.lathe(16, 8, (v) => [prof(v), v * H], (a, v) => 1 + 0.09 * Math.abs(Math.sin(a * 7 + v * 0.5)) + 0.05 * vn3(Math.cos(a) * 2, v * 3, Math.sin(a) * 2, seed),
    (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.35 + 0.65 * sstep(0, 0.4, v); o[7] = 2; });
  b.grid(16, 1, (u, v, i, j, o) => { const a = u * TAU, R = lerp(prof(1) * 1.04, prof(1) * 0.78, v); o[0] = Math.cos(a) * R; o[1] = H + 0.01; o[2] = Math.sin(a) * R; o[3] = o[4] = o[5] = 1; }, { wrapU: true });
  b.lathe(16, 2, (v) => [prof(1 - v * 0.7) * 0.78, H * (1 - v * 0.7)], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.45 - 0.38 * v; }, { flip: true });
  return b.build();
}

function giantClam(seed, mantle) {
  const b = new Builder();
  b.blob(3, (x, y, z, o) => {
    let px = x * 0.5, py = y * 0.24, pz = z * 0.3;
    const lip = 0.1 + 0.035 * Math.sin(x * 24);
    pz *= 1 + 0.12 * Math.abs(Math.sin(x * 12));
    if (py < -0.12) py = -0.12 + (py + 0.12) * 0.2;
    let c;
    if (py > lip) {
      py = lip + (py - lip) * 0.45;
      const sp = vn3(x * 9, y * 9, z * 9, seed) > 0.35 ? 1.6 : 1;
      c = [mantle[0] * sp, mantle[1] * sp, mantle[2] * sp];
    } else {
      const ao = 0.45 + 0.55 * sat((py + 0.12) / 0.22);
      c = [0.72 * ao, 0.7 * ao, 0.64 * ao];
    }
    o[0] = px; o[1] = py + 0.12; o[2] = pz; o[3] = c[0]; o[4] = c[1]; o[5] = c[2]; o[6] = 0; o[7] = 2;
  });
  return b.build();
}

export function initReef() {
  T.stag = [101, 102, 103, 104].map(staghorn);
  T.table = [1, 2, 3].map(tableCoral);
  T.brain = [1, 2].map(brainCoral);
  T.boulder = [1, 2, 3].map(boulderCoral);
  T.coralMound = [41, 42, 43].map((sd) => {
    const b = new Builder();
    rockInto(b, sd, { detail: 4, sx: 1.35, sy: 0.8, sz: 1.15, rough: 0.42, flat: 0.15, growth: 0, col: [1, 1, 1] });
    b.paint(0, (i, x, y, z, nx, ny, nz, o) => { o[3] = 0.55; o[4] = 2; });
    return b.build();
  });
  T.fan = [1, 2, 3].map((s) => seaFan(s));
  T.tubeSp = [tubeSponges(1), tubeSponges(2, { n: 6, h: 0.7, r: 0.09 }), tubeSponges(3, { n: 3, h: 1.4, r: 0.14 })];
  T.barrel = [1, 2].map(barrelSponge);
  T.soft = [1, 2, 3].map((s) => softCoral(s));
  T.leather = [1, 2].map(leatherCoral);
  T.anem = [
    anemone(1, { tent: [0.75, 0.85, 0.55], tipC: [1.3, 1.2, 1.1], tentacles: 34, thick: 0.045 }),
    anemone(2, { tent: [0.85, 0.55, 0.8], tipC: [1.25, 1.1, 1.3], tlen: 0.45, tentacles: 40, thick: 0.04 }),
  ];
  T.whip = [1, 2].map((s) => seaWhips(s));
  T.clam = [giantClam(1, [0.08, 0.35, 0.75]), giantClam(2, [0.06, 0.5, 0.5]), giantClam(3, [0.35, 0.45, 0.12])];
  T.star = [seastar(1), seastar(2, { fat: 1.4 })];
  T.urchin = [urchin(1), urchin(2, { len: 2.4, spines: 40, body: [0.16, 0.13, 0.17] })];
}

// ---------- palettes (saturated so colour survives blue water) ----------
const K = (a, k = 1) => a.map((c) => c.map((v) => v * k));
const HARD = [[0.95, 0.55, 0.2], [0.6, 0.78, 0.18], [0.78, 0.3, 0.88], [1.0, 0.42, 0.62], [1.0, 0.85, 0.2], [0.35, 0.6, 1.05], [0.15, 0.82, 0.68]];
const VIVID = [[0.72, 0.12, 0.98], [0.98, 0.14, 0.62], [1.1, 0.42, 0.05], [1.1, 0.86, 0.08], [0.98, 0.06, 0.08], [0.05, 0.88, 0.78]];
const FANS = [[0.72, 0.1, 0.9], [1.0, 0.08, 0.16], [1.1, 0.45, 0.06], [1.05, 0.85, 0.12], [0.95, 0.15, 0.6]];
const MASSIVE = [[1.0, 0.5, 0.18], [0.78, 0.28, 0.85], [0.55, 0.8, 0.22], [1.05, 0.8, 0.22], [1.0, 0.35, 0.5], [0.22, 0.75, 0.68]];
export const REEF = {};
function specs() {
  if (REEF.stag) return REEF;
  Object.assign(REEF, {
    stag: { tpl: T.stag, scale: [1.0, 2.2], follow: 0.3, tint: tintFrom(HARD) },
    table: { tpl: T.table, scale: [0.9, 1.7], follow: 0.15, tint: tintFrom(HARD), sink: 0 },
    brain: { tpl: T.brain, scale: [0.5, 1.3], follow: 0.75, tint: tintFrom(MASSIVE) },
    boulder: { tpl: T.boulder, scale: [1.0, 2.4], follow: 0.6, tint: tintFrom(MASSIVE) },
    fan: { tpl: T.fan, scale: [0.9, 2.1], follow: 0.15, sway: true, tint: tintFrom(FANS) },
    tubeSp: { tpl: T.tubeSp, scale: [1.0, 2.0], follow: 0.4, tint: tintFrom(VIVID) },
    barrel: { tpl: T.barrel, scale: [1.0, 1.9], follow: 0.3, tint: tintFrom([[0.85, 0.32, 0.22], [0.7, 0.22, 0.7], [0.95, 0.55, 0.2]]) },
    soft: { tpl: T.soft, scale: [0.9, 1.9], follow: 0.4, sway: true, tint: tintFrom(VIVID) },
    leather: { tpl: T.leather, scale: [0.9, 1.9], follow: 0.6, sway: true, tint: tintFrom([[0.95, 0.85, 0.45], [0.7, 0.85, 0.4], [1.0, 0.7, 0.55]]) },
    anem: { tpl: T.anem, scale: [1.0, 1.8], follow: 0.7, sway: true, tint: tintFrom([[1.05, 1.0, 1.0], [1.1, 0.8, 1.0]], 0.12) },
    whip: { tpl: T.whip, scale: [0.9, 1.7], follow: 0.2, sway: true, tint: tintFrom([[1.1, 0.4, 0.06], [1.0, 0.1, 0.12], [1.1, 0.85, 0.15]]) },
    clam: { tpl: T.clam, scale: [0.5, 1.15], follow: 0.8, tint: tintFrom([[1.1, 1.1, 1.1]], 0.1) },
    star: { tpl: T.star, scale: [0.1, 0.18], follow: 0.95, tint: tintFrom([[1.15, 0.35, 0.05], [1.0, 0.08, 0.08], [0.7, 0.25, 0.95], [0.25, 0.4, 1.1]]), sink: 0 },
    urchin: { tpl: T.urchin, scale: [0.06, 0.11], follow: 0.8, tint: tintFrom([[0.7, 0.45, 0.8], [0.45, 0.35, 0.5]]) },
    mound: { tpl: T.coralMound, scale: [1.5, 2.6], follow: 0.3, tint: tintFrom(K(MASSIVE, 0.9)), sink: 0.2 },
  });
  REEF.topList = [
    { w: 3, k: 'stag' }, { w: 2.6, k: 'table' }, { w: 1.4, k: 'brain' }, { w: 2.4, k: 'fan', sway: true },
    { w: 2.4, k: 'soft', sway: true }, { w: 0.9, k: 'leather', sway: true }, { w: 1.4, k: 'tubeSp' }, { w: 1.1, k: 'barrel' },
    { w: 0.9, k: 'anem', sway: true }, { w: 0.9, k: 'whip', sway: true }, { w: 0.6, k: 'boulder' },
  ];
  Object.assign(REEF, {
    rubble: { tpl: T.rubble, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[1, 0.95, 0.88], [0.9, 0.85, 0.82], [0.95, 0.8, 0.85]], 0.1) },
    grit: { tpl: T.grit, scale: [0.8, 1.5], follow: 1, sink: 0.01, tint: tintFrom([[1, 0.96, 0.9]], 0.06) },
    algae: { tpl: T.algae, scale: [0.6, 1.5], follow: 1, sink: 0.01, tint: tintFrom([[0.75, 0.85, 0.6], [1.0, 0.7, 0.75], [0.8, 0.7, 0.5]], 0.12) },
    lump: { tpl: T.spongeLump, scale: [0.7, 1.6], follow: 0.7, tint: tintFrom(VIVID) },
  });
  REEF.micro = [{ w: 3, spec: REEF.rubble }, { w: 2, spec: REEF.grit }, { w: 1.6, spec: REEF.algae }, { w: 1.6, spec: REEF.lump }];
  REEF.smallList = [
    { w: 2, k: 'star' }, { w: 2, k: 'urchin' }, { w: 1.4, k: 'clam' }, { w: 1.6, k: 'anem', sway: true }, { w: 1.4, k: 'brain' }, { w: 0.8, k: 'soft', sway: true },
  ];
  return REEF;
}

// One coral head: a massive-coral mound with colonies over its dome and around its foot.
export function bommie(ctx, fs, st, sw, rng, x, s, moundK, n, coralK, list) {
  const R = specs();
  const y0 = fs.at(x, s);
  const csc = putFloor(ctx, fs, st, R.mound, x, s, rng, moundK);
  const tpl = T.coralMound[0];
  const domeR = csc ? tpl.r * csc * 0.8 : 0, domeH = csc ? tpl.maxY * csc * 0.8 : 0;
  for (let k = 0; k < n; k++) {
    const e = pickW(rng, list || R.topList), sp = R[e.k];
    const a = rng() * TAU, rr = (domeR + 1.2) * Math.sqrt(rng());
    const ix = x + Math.cos(a) * rr, is = s + Math.sin(a) * rr;
    let y = fs.at(ix, is), nx = fs.nx, ny = fs.ny, nz = fs.nz;
    if (rr < domeR) { // on top of the dome
      const q = rr / domeR, dh = domeH * Math.sqrt(Math.max(0, 1 - q * q));
      y = Math.max(y, y0 + dh - 0.12);
      const l = Math.hypot(Math.cos(a) * q * 0.8, 1, Math.sin(a) * q * 0.8);
      nx = Math.cos(a) * q * 0.8 / l; ny = 1 / l; nz = -Math.sin(a) * q * 0.8 / l;
    }
    putAt(ctx, e.sway ? sw : st, sp, ix, y, is, nx, ny, nz, rng, coralK);
  }
}

// Coral banks line both sides of a sandy valley: rows of coral heads, densest near the path.
const ROWS = [
  { d: [0, 5.0], step: 3.6, m: 0.45, n: 3, k: 0.85 },
  { d: [5.0, 8.5], step: 4.4, m: 0.65, n: 7, k: 1.0 },
  { d: [8.5, 15], step: 5.0, m: 0.85, n: 6, k: 1.05 },
  { d: [15, 25], step: 6.5, m: 1.05, n: 4, k: 1.1 },
  { d: [25, 36], step: 9.0, m: 1.2, n: 1, k: 1.1 },
];
export function layoutReef(ctx) {
  const pres = presence(ctx, 'reef');
  if (pres <= 0) return null;
  const R = specs(), rng = ctx.rng, fs = floorSampler(ctx), bk = budgetK(ctx, 'reef');
  const st = new Batch(MAT.static, 132000 * bk), sw = new Batch(MAT.sway, 56000 * bk);
  for (const row of ROWS) {
    for (const side of [-1, 1]) {
      for (let s = ctx.s0 + rng() * row.step; s < ctx.s1; s += row.step * (0.75 + 0.5 * rng())) {
        if (rng() > ctx.weightOf(s, 'reef')) continue;
        const x = ctx.pathX(s) + side * lerp(row.d[0], row.d[1], rng());
        bommie(ctx, fs, st, sw, rng, x, s, row.m * (0.8 + 0.4 * rng()), row.n + (rng() < 0.5 ? 1 : 0), row.k, null);
      }
    }
  }
  // coral heads on the outside of bends: seen dead ahead, the camera curves past
  for (const b of bendSpots(ctx)) {
    if (rng() > ctx.weightOf(b.s, 'reef') * 0.85) continue;
    bommie(ctx, fs, st, sw, rng, bendX(ctx, b, T.coralMound[0].r * 2.4, rng, 1.2), b.s, 1.25, 10, 1.1, null);
  }
  microDetail(ctx, fs, st, rng, 'reef', R.micro, 130, 26);
  // small life everywhere, also under the camera
  for (let k = 0; k < 90; k++) {
    const p = spot(ctx, rng, 0, 14, 1);
    if (rng() > ctx.weightOf(p.s, 'reef') * 0.8) continue;
    const e = pickW(rng, R.smallList);
    putFloor(ctx, fs, e.sway ? sw : st, R[e.k], p.x, p.s, rng, 0.8);
  }
  st.split = 4; sw.split = 4;
  return { batches: [st, sw] };
}
