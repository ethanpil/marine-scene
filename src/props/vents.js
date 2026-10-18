// Hydrothermal vents: black-smoker chimneys (glowing mineral bases, sulphide streaks) with billowing
// smoke plumes, tube-worm thickets, mussel beds and bacterial mats. Vent fields are seeded per segment;
// each chunk instantiates the field members whose centre lies inside it.
import { Builder, Batch, T, TAU, sat, sstep, lerp, vn3, fbm3, floorSampler, presence, tubeClear, orient, rotY, budgetK, bendSpots, vary, rotZ, tierK, poi } from './core.js';
import { musselBed, rockInto, rockSet } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, bendX, microDetail, clusterer, groundY } from './scatter.js';
import { MAT, billboardMesh } from './materials.js';
import { mulberry32 } from '../noise.js';

function mineral(x, y, z, seed, o) {
  const n1 = vn3(x * 1.7, y * 0.6, z * 1.7, seed), n2 = vn3(x * 4, y * 2, z * 4, seed + 7);
  let c = [0.05, 0.045, 0.042];
  if (n1 > 0.3) c = lerp3(c, [0.3, 0.13, 0.04], sstep(0.3, 0.6, n1));
  if (n2 > 0.55) c = lerp3(c, [0.4, 0.34, 0.1], sstep(0.55, 0.8, n2));
  if (n1 < -0.6) c = lerp3(c, [0.42, 0.42, 0.4], sstep(-0.6, -0.8, n1));
  o[3] = c[0]; o[4] = c[1]; o[5] = c[2];
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// white smokers: pale carbonate / barite / anhydrite with ochre iron staining
function mineralWhite(x, y, z, seed, o) {
  const n1 = vn3(x * 1.7, y * 0.6, z * 1.7, seed), n2 = vn3(x * 4, y * 2, z * 4, seed + 7);
  let c = [0.6, 0.58, 0.53];
  if (n1 > 0.25) c = lerp3(c, [0.52, 0.4, 0.24], sstep(0.25, 0.65, n1));
  if (n2 > 0.5) c = lerp3(c, [0.72, 0.71, 0.66], sstep(0.5, 0.8, n2));
  if (n1 < -0.5) c = lerp3(c, [0.4, 0.4, 0.38], sstep(-0.5, -0.8, n1));
  o[3] = c[0]; o[4] = c[1]; o[5] = c[2];
}

function chimney(seed, H, white = false) {
  const b = new Builder(), rng = mulberry32(seed), vents = [], min = white ? mineralWhite : mineral, gk = white ? 0.06 : 1;
  const spire = (ox, oz, h, r0, lean) => {
    const fl = [rng(), rng(), rng(), rng() * 0.6];
    const v0 = b.vc;
    b.lathe(10, Math.max(6, Math.round(h / 0.7)), (v) => {
      let r = r0 * (1 - 0.5 * v) * (1 + 0.38 * vn3(v * 7, seed, ox, seed) + 0.15 * vn3(v * 19, seed, ox, seed + 1));
      for (const f of fl) r += r0 * 0.7 * Math.exp(-(((v - f) / 0.03) ** 2));
      return [Math.max(0.05, r), v * h];
    }, (a, v) => 1 + 0.32 * vn3(Math.cos(a) * 2, v * h * 0.9, Math.sin(a) * 2, seed + 3), (v, a, x, y, z, o) => {
      min(x, y, z, seed, o);
      const glow = sstep(0.14, 0.0, v) * 1.2 + sstep(0.95, 1.0, v) * 0.8 + (vn3(x * 3, y * 1.5, z * 3, seed + 11) > 0.55 ? 0.45 : 0);
      o[6] = glow * gk; o[7] = 3;
    });
    for (let i = v0; i < b.vc; i++) { const t = b.P[i * 3 + 1] / h; b.P[i * 3] += ox + lean[0] * t * h; b.P[i * 3 + 2] += oz + lean[1] * t * h; }
    vents.push([ox + lean[0] * h, h, oz + lean[1] * h, r0]);
  };
  spire(0, 0, H, 0.55 + H * 0.03, [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08]);
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, d = 0.6 + rng() * 0.8;
    spire(Math.cos(a) * d, Math.sin(a) * d, H * (0.3 + rng() * 0.45), 0.3 + rng() * 0.2, [Math.cos(a) * 0.1, Math.sin(a) * 0.1]);
  }
  // sulphide mound at the foot, glowing cracks
  const v0 = b.vc;
  rockInto(b, seed + 99, { detail: 3, sx: 1.9, sy: 0.9, sz: 1.7, rough: 0.4, flat: 0.2, growth: 0, col: [0.1, 0.09, 0.08] });
  const tmp = [0, 0, 0, 0, 0, 0];
  b.paint(v0, (i, x, y, z, nx, ny, nz, o) => {
    min(x, y, z, seed + 1, tmp);
    const crack = vn3(x * 2.5, y * 2.5, z * 2.5, seed + 5);
    const g = sstep(0.35, 0.55, crack) * 1.4 + sstep(0.6, 0.0, y) * 0.35;
    o[0] = tmp[3]; o[1] = tmp[4]; o[2] = tmp[5]; o[3] = g * gk; o[4] = 3;
  });
  const tpl = b.build();
  tpl.vents = vents;
  if (white) { tpl.label = 'White smoker'; tpl.fact = 'White smokers vent cooler fluid, clouded with barium, calcium and silica instead of black sulphides.'; }
  else tpl.fact = 'Black smokers gush water at over 350 °C, kept liquid by the crushing pressure of the deep.';
  return tpl;
}

// squat beehive chimney: wide lumpy dome venting from many small orifices
function beehive(seed) {
  const b = new Builder(), rng = mulberry32(seed * 59), R = 1.0 + rng() * 0.8, H = 2 + rng() * 2.5, vents = [];
  b.lathe(14, 10, (v) => [R * Math.pow(1 - v, 0.55) * (1 + 0.08 * Math.sin(v * 22)) + 0.05, H * Math.sin(v * Math.PI * 0.5)], (a, v) => 1 + 0.25 * vn3(Math.cos(a) * 1.5, v * 4, Math.sin(a) * 1.5, seed),
    (v, a, x, y, z, o) => { mineral(x, y, z, seed + 3, o); const g = sstep(0.15, 0, v) * 1.1 + (vn3(x * 3, y * 3, z * 3, seed) > 0.5 ? 0.6 : 0); o[6] = g; o[7] = 3; });
  for (let k = 0; k < 3; k++) { const a = rng() * TAU, v = 0.5 + rng() * 0.45, r = R * Math.pow(1 - v, 0.55); vents.push([Math.cos(a) * r, H * Math.sin(v * Math.PI * 0.5), Math.sin(a) * r, 0.25]); }
  const t = b.build(); t.vents = vents; t.label = 'Beehive smoker'; return t;
}
// toppled spire lying on the mound, still smoking from its broken end
function toppled(seed) {
  const t0 = chimney(100 + seed, 8 + seed * 2), b = new Builder();
  b.P = Array.from(t0.pos); b.N = Array.from(t0.nor); b.C = Array.from(t0.col); b.F = Array.from(t0.fx); b.I = Array.from(t0.idx);
  const R = rotZ(1.25 + seed * 0.1);
  b.xform(0, R, 0, 0.6, 0);
  const t = b.build();
  t.vents = t0.vents.slice(0, 1).map((v) => { const p = [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2] + 0.6, R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; return [p[0], Math.max(0.3, p[1]), p[2], v[3] * 0.7]; });
  t.label = 'Toppled chimney';
  return t;
}

function tubeWorms(seed, { n = 32, r = 0.45 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const rr = r * Math.sqrt(rng()), a = rng() * TAU, L = 0.5 + rng() * 1.1;
    const lean = [Math.cos(a) * (0.1 + rr), Math.sin(a) * (0.1 + rr)];
    const pts = [];
    for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push([Math.cos(a) * rr + lean[0] * L * t * t, L * t, Math.sin(a) * rr + lean[1] * L * t * t]); }
    b.tube(pts, [0.03, 0.027, 0.024, 0.022], 4, (v, an, x, y, z, o) => {
      const c = 0.55 + 0.4 * v; o[3] = 0.9 * c; o[4] = 0.88 * c; o[5] = 0.8 * c; o[6] = 0.03 * v * v * L; o[7] = 0;
    });
    const top = pts[3];
    b.blob(0, (x, y, z, o) => {
      o[0] = top[0] + x * 0.05; o[1] = top[1] + 0.06 + y * 0.09; o[2] = top[2] + z * 0.05;
      o[3] = 0.8; o[4] = 0.05; o[5] = 0.05; o[6] = 0.03 * L + 0.02 * (y + 1); o[7] = 3;
    });
  }
  return b.build();
}

function bacterialMat(seed) {
  const b = new Builder();
  b.grid(22, 4, (u, v, i, j, o) => {
    const a = u * TAU, R = 1 + 0.35 * vn3(Math.cos(a) * 1.5, Math.sin(a) * 1.5, seed, seed) + 0.12 * Math.sin(a * 5 + seed);
    const r = v * R;
    o[0] = Math.cos(a) * r; o[1] = 0.03 * (1 - v); o[2] = Math.sin(a) * r;
    const c = 0.75 + 0.25 * vn3(o[0] * 3, 0, o[2] * 3, seed + 2);
    o[3] = c; o[4] = c; o[5] = c * 0.94;
  }, { wrapU: true, flip: true });
  return b.build();
}

export function initVents() {
  T.chimney = [...[[1, 6], [2, 9], [3, 12], [4, 15], [5, 8], [6, 11], [7, 7], [8, 13]].map(([s, h]) => chimney(s, h)), ...[1, 2, 3].map(beehive), ...[1, 2].map(toppled)];
  T.chimneyWhite = [[31, 7], [32, 10], [33, 13], [34, 16], [35, 9], [36, 12]].map(([s, h]) => chimney(s, h, true));
  T.worms = vary([1, 2, 3, 4, 5, 6].map((s) => tubeWorms(s, { n: 12 + s * 7, r: 0.25 + s * 0.06 })), 2, 91, { disp: 0.06, bend: 0.15, twist: 0.4 });
  T.ventMussels = [1, 2, 3, 4, 5].map((s) => musselBed(60 + s, { n: 25 + s * 12, r: 0.4 + s * 0.15, col: [0.3, 0.22, 0.1], edge: [0.55, 0.45, 0.22], len: 0.1 + s * 0.008 }));
  T.mat = vary([1, 2, 3].map(bacterialMat), 2, 93, { disp: 0.05, bend: 0, twist: 0.8 });
  T.ventRock = rockSet(['volcanic', 'angular'], 4, { detail: 3, growth: 0 });
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    rock: { tpl: T.ventRock, scale: [0.5, 2.2], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.5, tint: tintFrom([[0.25, 0.24, 0.24], [0.32, 0.26, 0.22]]) },
    worms: { tpl: T.worms, scale: [0.7, 1.4], follow: 0.5, sway: true, tint: tintFrom([[1, 1, 1]], 0.1) },
    mussels: { tpl: T.ventMussels, scale: [0.8, 1.6], follow: 0.9, sink: 0.04, tint: tintFrom([[1, 1, 1]], 0.15) },
    mat: { tpl: T.mat, scale: [0.6, 2.2], follow: 1, sink: 0.0, maxSlope: 0.85, tint: tintFrom([[0.9, 0.9, 0.85], [0.85, 0.75, 0.35], [0.85, 0.5, 0.25]], 0.1) },
  });
  S.pebbles = { tpl: T.pebbles, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[0.25, 0.22, 0.2], [0.4, 0.25, 0.15]], 0.1) };
  S.micro = [{ w: 3, spec: S.pebbles }, { w: 1.2, spec: S.mat }, { w: 1.4, spec: S.mussels }];
  S.around = [{ w: 3, k: 'worms', sway: true }, { w: 2, k: 'mussels' }, { w: 2, k: 'mat' }, { w: 1.2, k: 'rock' }];
  S.aroundWhite = [{ w: 1.4, k: 'worms', sway: true }, { w: 2.2, k: 'mussels' }, { w: 3.6, k: 'mat' }, { w: 1.2, k: 'rock' }];
  return S;
}

// ---------- per-segment communities ----------
const COMMUNITIES = [
  { name: 'black smoker field', white: false, worms: 1.0, mats: 1.0 },
  { name: 'white smoker field', white: true, worms: 0.6, mats: 1.8 },
];
function community(ctx) {
  const seg = ctx.segments.find((g) => g.key === 'vents');
  return seg ? COMMUNITIES[Math.floor(mulberry32(seg.seed ^ 0x7e11)() * COMMUNITIES.length)] : COMMUNITIES[0];
}

// fields per segment: centres + members {kind, x, s, seed}
const fields = new Map();
function segmentFields(ctx, seg) {
  let F = fields.get(seg.id);
  if (F && F.seed === seg.seed) return F;
  const rng = mulberry32(seg.seed ^ 0x7e47), members = [], centres = [];
  for (let s = seg.start + 40 + rng() * 40; s < seg.end - 40; s += 45 + rng() * 70) {
    const side = rng() < 0.5 ? -1 : 1, d = 10 + rng() * 22, cx = ctx.pathX(s) + side * d;
    centres.push({ x: cx, s });
    const n = 2 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, r = k === 0 ? 0 : 3 + rng() * 9;
      members.push({ kind: 'chimney', x: cx + Math.cos(a) * r, s: s + Math.sin(a) * r, seed: (rng() * 1e9) | 0 });
    }
    for (let k = 0; k < 22; k++) {
      const a = rng() * TAU, r = 1.5 + Math.pow(rng(), 0.8) * 13;
      members.push({ kind: 'life', x: cx + Math.cos(a) * r, s: s + Math.sin(a) * r, seed: (rng() * 1e9) | 0 });
    }
  }
  F = { seed: seg.seed, members, centres };
  fields.set(seg.id, F);
  if (fields.size > 24) fields.delete(fields.keys().next().value);
  return F;
}

export function layoutVents(ctx) {
  if (presence(ctx, 'vents') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx), comm = community(ctx), bk = budgetK(ctx, 'vents'), tk = tierK(ctx);
  const st = new Batch(MAT.static, 50000 * bk);                                                    // chimneys, rocks
  const mid = new Batch(MAT.static, 26000 * bk * tk, 'mid'), sw = new Batch(MAT.sway, 36000 * bk * tk, 'mid'); // vent life
  const near = new Batch(MAT.static, 14000 * bk * tk, 'near');                                       // micro detail
  const plumes = [], halos = [], members = [], pool = comm.white ? T.chimneyWhite : T.chimney;
  const inChunk = (s) => s >= ctx.s0 && s < ctx.s1;
  for (const seg of ctx.segments) {
    if (seg.key !== 'vents') continue;
    const F = segmentFields(ctx, seg);
    for (const m of F.members) if (inChunk(m.s)) members.push(m);
    for (const c of F.centres) if (inChunk(c.s)) poi(ctx, 'vent-field', c.x, fs.at(c.x, c.s) + 3, c.s, 12, { kind: comm.name });
  }
  // chimneys on the outside of bends: the camera curves past the smoking stack
  for (const b of bendSpots(ctx)) {
    if (rng() > ctx.weightOf(b.s, 'vents') * 0.8) continue;
    members.push({ kind: 'chimney', x: bendX(ctx, b, 2.6, rng, 1.2), s: b.s, seed: (b.s * 7919) | 0 });
  }
  const one = (m) => {
    const r2 = mulberry32(m.seed);
    if (m.kind === 'chimney') {
      const tpl = r2.pick(pool), sc = 0.75 + r2() * 0.5;
      const y0 = fs.at(m.x, m.s);
      if (!tubeClear(ctx, m.x, m.s, y0, y0 + tpl.maxY * sc, tpl.r * sc + 0.5)) return;
      const yaw = r2() * TAU, R = rotY(yaw), z = -(m.s - ctx.s0);
      const y = groundY(fs, m.x, m.s, tpl, R, sc, sc, sc) - 0.12 * sc; // sulphide mound settled into the floor
      if (!st.add(tpl, m.x, y, z, R, sc, sc, sc, 1, 1, 1, 1)) return;
      st.last.g = 1;
      fs.addSupport(st.last, m.s);
      for (const v of tpl.vents) {
        const vx = (R[0] * v[0] + R[2] * v[2]) * sc, vz = (R[6] * v[0] + R[8] * v[2]) * sc;
        plumes.push({ x: m.x + vx, y: y + v[1] * sc, z: z + vz, n: v[3] > 0.45 ? 30 : 16, rise: 22 + r2() * 18, size: v[3] * sc * 1.6, speed: (comm.white ? 0.9 : 1.4) + r2() * 0.8, phase: r2() });
      }
      if (!comm.white) halos.push({ x: m.x, y: y0 + 0.6, z, n: 1, rise: 0, size: 3.5 * sc, speed: 0, phase: r2() });
      // worms & mussels hug the chimney foot (on the mound where it is)
      for (let k = 0; k < 6; k++) {
        const a = r2() * TAU, rr = 1.6 * sc + r2() * 2.2, worm = k < 3 * comm.worms;
        putFloor(ctx, fs, worm ? sw : mid, worm ? sp.worms : sp.mussels, m.x + Math.cos(a) * rr, m.s + Math.sin(a) * rr, r2);
      }
    } else {
      const e = pickW(r2, comm.white ? sp.aroundWhite : sp.around);
      putFloor(ctx, fs, e.sway ? sw : e.k === 'rock' ? st : mid, sp[e.k], m.x, m.s, r2);
    }
  };
  const chim = members.filter((m) => m.kind === 'chimney'), life = members.filter((m) => m.kind !== 'chimney'), more = [];
  for (let q = 0; q < chim.length; q += 3) more.push(() => chim.slice(q, q + 3).forEach(one));
  for (let q = 0; q < life.length; q += 40) more.push(() => life.slice(q, q + 40).forEach(one));
  more.push(() => microDetail(ctx, fs, near, rng, 'vents', sp.micro, 110, 28));
  // sparse rocks and the odd mat elsewhere
  more.push(() => {
    const nextP200 = clusterer(ctx, rng, 0, 40, 1);
    for (let k = 0; k < 50 * tk; k++) {
      const p = nextP200();
      if (!p) continue;
      if (rng() > ctx.weightOf(p.s, 'vents')) continue;
      if (rng() < 0.7 / comm.mats) putFloor(ctx, fs, mid, sp.rock, p.x, p.s, rng);
      else putFloor(ctx, fs, near, sp.mat, p.x, p.s, rng);
    }
    // plumes and glow halos once every chimney is seated
    const pm = billboardMesh(plumes, comm.white ? MAT.plumeWhite : MAT.plume, rng); if (pm) L.extra.push(pm);
    const hm = billboardMesh(halos, MAT.halo, rng); if (hm) L.extra.push(hm);
  });
  const L = { batches: [st, mid, sw, near], extra: [], more };
  return L;
}
