// Hydrothermal vents: black-smoker chimneys (glowing mineral bases, sulphide streaks) with billowing
// smoke plumes, tube-worm thickets, mussel beds and bacterial mats. Vent fields are seeded per segment;
// each chunk instantiates the field members whose centre lies inside it.
import { Builder, Batch, T, TAU, sat, sstep, lerp, vn3, fbm3, floorSampler, presence, tubeClear, orient, rotY, budgetK, bendSpots } from './core.js';
import { musselBed, rockInto } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, bendX, microDetail } from './scatter.js';
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

function chimney(seed, H) {
  const b = new Builder(), rng = mulberry32(seed), vents = [];
  const spire = (ox, oz, h, r0, lean) => {
    const fl = [rng(), rng(), rng(), rng() * 0.6];
    const v0 = b.vc;
    b.lathe(10, Math.max(6, Math.round(h / 0.7)), (v) => {
      let r = r0 * (1 - 0.5 * v) * (1 + 0.38 * vn3(v * 7, seed, ox, seed) + 0.15 * vn3(v * 19, seed, ox, seed + 1));
      for (const f of fl) r += r0 * 0.7 * Math.exp(-(((v - f) / 0.03) ** 2));
      return [Math.max(0.05, r), v * h];
    }, (a, v) => 1 + 0.32 * vn3(Math.cos(a) * 2, v * h * 0.9, Math.sin(a) * 2, seed + 3), (v, a, x, y, z, o) => {
      mineral(x, y, z, seed, o);
      const glow = sstep(0.14, 0.0, v) * 1.2 + sstep(0.95, 1.0, v) * 0.8 + (vn3(x * 3, y * 1.5, z * 3, seed + 11) > 0.55 ? 0.45 : 0);
      o[6] = glow; o[7] = 3;
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
    mineral(x, y, z, seed + 1, tmp);
    const crack = vn3(x * 2.5, y * 2.5, z * 2.5, seed + 5);
    const g = sstep(0.35, 0.55, crack) * 1.4 + sstep(0.6, 0.0, y) * 0.35;
    o[0] = tmp[3]; o[1] = tmp[4]; o[2] = tmp[5]; o[3] = g; o[4] = 3;
  });
  const tpl = b.build();
  tpl.vents = vents;
  return tpl;
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
  T.chimney = [[1, 6], [2, 9], [3, 12], [4, 15], [5, 8]].map(([s, h]) => chimney(s, h));
  T.worms = [1, 2, 3].map((s) => tubeWorms(s, { n: 26 + s * 6 }));
  T.ventMussels = [1, 2].map((s) => musselBed(60 + s, { n: 60, r: 0.8, col: [0.3, 0.22, 0.1], edge: [0.55, 0.45, 0.22], len: 0.12 }));
  T.mat = [1, 2].map(bacterialMat);
  T.ventRock = [1, 2, 3].map((s) => { const b = new Builder(); rockInto(b, s + 70, { detail: 3, sy: 0.6, rough: 0.45, growth: 0, col: [0.11, 0.1, 0.1] }); return b.build(); });
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    rock: { tpl: T.ventRock, scale: [0.5, 2.2], follow: 0.5, tint: tintFrom([[1, 1, 1], [1.3, 1.1, 0.9]]) },
    worms: { tpl: T.worms, scale: [0.7, 1.4], follow: 0.5, sway: true, tint: tintFrom([[1, 1, 1]], 0.1) },
    mussels: { tpl: T.ventMussels, scale: [0.8, 1.6], follow: 0.9, sink: 0.04, tint: tintFrom([[1, 1, 1]], 0.15) },
    mat: { tpl: T.mat, scale: [0.6, 2.2], follow: 1, sink: 0.0, maxSlope: 0.85, tint: tintFrom([[0.9, 0.9, 0.85], [0.85, 0.75, 0.35], [0.85, 0.5, 0.25]], 0.1) },
  });
  S.pebbles = { tpl: T.pebbles, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[0.25, 0.22, 0.2], [0.4, 0.25, 0.15]], 0.1) };
  S.micro = [{ w: 3, spec: S.pebbles }, { w: 1.2, spec: S.mat }, { w: 1.4, spec: S.mussels }];
  S.around = [{ w: 3, k: 'worms', sway: true }, { w: 2, k: 'mussels' }, { w: 2, k: 'mat' }, { w: 1.2, k: 'rock' }];
  return S;
}

// fields per segment: list of members {kind, x, s, scale, seed}
const fields = new Map();
function segmentFields(ctx, seg) {
  let F = fields.get(seg.id);
  if (F && F.seed === seg.seed) return F;
  const rng = mulberry32(seg.seed ^ 0x7e47), members = [];
  for (let s = seg.start + 40 + rng() * 40; s < seg.end - 40; s += 45 + rng() * 70) {
    const side = rng() < 0.5 ? -1 : 1, d = 10 + rng() * 22, cx = ctx.pathX(s) + side * d;
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
  F = { seed: seg.seed, members };
  fields.set(seg.id, F);
  if (fields.size > 24) fields.delete(fields.keys().next().value);
  return F;
}

export function layoutVents(ctx) {
  if (presence(ctx, 'vents') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
  const st = new Batch(MAT.static, 75000 * budgetK(ctx, 'vents')), sw = new Batch(MAT.sway, 45000 * budgetK(ctx, 'vents'));
  const plumes = [], halos = [];
  const members = [];
  for (const seg of ctx.segments) {
    if (seg.key !== 'vents') continue;
    for (const m of segmentFields(ctx, seg).members) if (m.s >= ctx.s0 && m.s < ctx.s1) members.push(m);
  }
  // chimneys on the outside of bends: the camera curves past the smoking stack
  for (const b of bendSpots(ctx)) {
    if (rng() > ctx.weightOf(b.s, 'vents') * 0.8) continue;
    members.push({ kind: 'chimney', x: bendX(ctx, b, 2.6, rng, 1.2), s: b.s, seed: (b.s * 7919) | 0 });
  }
  {
    for (const m of members) {
      const r2 = mulberry32(m.seed);
      if (m.kind === 'chimney') {
        const tpl = r2.pick(T.chimney), sc = 0.75 + r2() * 0.5;
        const y = fs.at(m.x, m.s);
        if (!tubeClear(ctx, m.x, m.s, y, y + tpl.maxY * sc, tpl.r * sc + 0.5)) continue;
        const yaw = r2() * TAU, R = rotY(yaw), z = -(m.s - ctx.s0);
        st.add(tpl, m.x, y - 0.3, z, R, sc, sc, sc, 1, 1, 1, 1);
        for (const v of tpl.vents) {
          const vx = (R[0] * v[0] + R[2] * v[2]) * sc, vz = (R[6] * v[0] + R[8] * v[2]) * sc;
          plumes.push({ x: m.x + vx, y: y - 0.3 + v[1] * sc, z: z + vz, n: v[3] > 0.45 ? 30 : 16, rise: 22 + r2() * 18, size: v[3] * sc * 1.6, speed: 1.4 + r2() * 0.8, phase: r2() });
        }
        halos.push({ x: m.x, y: y + 0.6, z, n: 1, rise: 0, size: 3.5 * sc, speed: 0, phase: r2() });
        // worms & mussels hug the chimney foot
        for (let k = 0; k < 6; k++) {
          const a = r2() * TAU, rr = 1.6 * sc + r2() * 2.2;
          const e = k < 3 ? sp.worms : sp.mussels;
          putFloor(ctx, fs, k < 3 ? sw : st, e, m.x + Math.cos(a) * rr, m.s + Math.sin(a) * rr, r2);
        }
      } else {
        const e = pickW(r2, sp.around);
        putFloor(ctx, fs, e.sway ? sw : st, sp[e.k], m.x, m.s, r2);
      }
    }
  }
  microDetail(ctx, fs, st, rng, 'vents', sp.micro, 110, 28);
  // sparse rocks and the odd mat elsewhere
  for (let k = 0; k < 50; k++) {
    const p = spot(ctx, rng, 0, 40, 1);
    if (rng() > ctx.weightOf(p.s, 'vents')) continue;
    putFloor(ctx, fs, st, rng() < 0.7 ? sp.rock : sp.mat, p.x, p.s, rng);
  }
  st.split = 2; sw.split = 1;
  const extra = [];
  const pm = billboardMesh(plumes, MAT.plume, rng); if (pm) extra.push(pm);
  const hm = billboardMesh(halos, MAT.halo, rng); if (hm) extra.push(hm);
  return { batches: [st, sw], extra };
}
