// Seagrass meadow: thousands of swaying blades as two instanced patch LODs (near / far), sandy gaps
// from noise, plus shells, sea cucumbers, scallops, sand dollars, cushion stars and rocks.
import { Builder, Batch, Inst, T, TAU, sat, sstep, lerp, vn3, floorSampler, presence, tubeClear, orient, budgetK, bendSpots } from './core.js';
import { grassPatch, seastar } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, putBend, microDetail } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32, noise2 } from '../noise.js';

function conch(seed) {
  const b = new Builder();
  // spire + body whorl as a lathe around a tilted axis, with a flared lip
  b.lathe(10, 7, (v) => {
    const r = v < 0.55 ? 0.42 * Math.sin((v / 0.55) * Math.PI * 0.5) : 0.42 * Math.pow(1 - (v - 0.55) / 0.45, 1.3) + 0.02;
    return [r, v * 1.0];
  }, (a, v) => 1 + 0.12 * Math.max(0, Math.sin(a * 6 + v * 20)) * (v > 0.45 ? 1 : 0.3) + (v < 0.55 ? 0.25 * Math.max(0, Math.cos(a)) * (1 - v) : 0),
  (v, a, x, y, z, o) => {
    const band = 0.75 + 0.3 * Math.sin(v * 30 + a);
    const lip = Math.max(0, Math.cos(a)) * (1 - v);
    o[3] = lerp(0.72, 0.95, lip) * band; o[4] = lerp(0.55, 0.6, lip) * band; o[5] = lerp(0.42, 0.5, lip) * band; o[7] = 2;
  });
  b.xform(0, [0, -1, 0, 1, 0, 0, 0, 0, 1], 0.5, 0.3, 0); // lay it on its side
  return b.build();
}

function cucumber(seed) {
  const b = new Builder();
  b.blob(2, (x, y, z, o) => {
    const bump = 1 + 0.12 * Math.max(0, vn3(x * 6, y * 6, z * 6, seed));
    const w = 0.12 * (1 - 0.25 * x * x) * bump;
    o[0] = x * 0.55; o[1] = Math.max(-0.2, y) * w + 0.085; o[2] = z * w;
    const ao = y < 0 ? 0.5 : 1;
    o[3] = 0.22 * ao; o[4] = 0.14 * ao; o[5] = 0.09 * ao; o[7] = 2;
  });
  return b.build();
}

function scallop(seed) {
  const b = new Builder();
  const shell = (top) => b.grid(14, 5, (u, v, i, j, o) => {
    const a = (u - 0.5) * 2.4, r = v * 0.5 * (1 + 0.04 * Math.abs(Math.sin(u * 14 * Math.PI)));
    const x = Math.sin(a) * r, z = Math.cos(a) * r - 0.25;
    const h = (top ? 0.09 : 0.03) * Math.sin(v * Math.PI * 0.8) + 0.015 * Math.abs(Math.sin(u * 14 * Math.PI)) * v;
    o[0] = x; o[1] = top ? 0.04 + h : 0.04 - h; o[2] = z;
    const c = top ? 0.8 + 0.25 * Math.abs(Math.sin(u * 14 * Math.PI)) : 0.6;
    o[3] = c * 0.95; o[4] = c * 0.6; o[5] = c * 0.45;
  }, { flip: !top });
  shell(true); shell(false);
  return b.build();
}

function sandDollar(seed) {
  const b = new Builder();
  b.grid(18, 4, (u, v, i, j, o) => {
    const a = u * TAU, r = 0.5 * Math.sin(v * Math.PI * 0.5);
    o[0] = Math.cos(a) * r; o[1] = 0.05 * Math.cos(v * Math.PI * 0.5) + 0.01; o[2] = Math.sin(a) * r;
    const petal = v > 0.25 && v < 0.75 ? Math.pow(Math.abs(Math.cos(a * 2.5)), 6) : 0;
    const c = 0.82 - 0.25 * petal;
    o[3] = c; o[4] = c * 0.93; o[5] = c * 0.8;
  }, { wrapU: true, flip: true });
  return b.build();
}

export function initSeagrass() {
  T.grassNear = grassPatch(501, { n: 16, r: 0.55, h: 0.72, w: 0.042, segs: 2, sway: 0.2, base: [0.08, 0.16, 0.05], mid: [0.25, 0.5, 0.12], tipc: [0.5, 0.5, 0.2] });
  T.grassFar = grassPatch(502, { n: 14, r: 0.95, h: 0.75, w: 0.06, segs: 2, sway: 0.2, base: [0.08, 0.16, 0.05], mid: [0.25, 0.5, 0.12], tipc: [0.5, 0.5, 0.2] });
  T.conch = [conch(1)];
  T.cucumber = [cucumber(1), cucumber(2)];
  T.scallop = [scallop(1)];
  T.sandDollar = [sandDollar(1)];
  T.cushion = [seastar(7, { fat: 0.9 })];
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    rock: { tpl: T.rocks, scale: [0.3, 1.3], follow: 0.4, tint: tintFrom([[0.52, 0.5, 0.44], [0.46, 0.45, 0.42]]) },
    conch: { tpl: T.conch, scale: [0.18, 0.3], follow: 0.9, sink: 0.1, tint: tintFrom([[0.9, 0.85, 0.8]]) },
    cucumber: { tpl: T.cucumber, scale: [0.6, 1.1], follow: 0.95, tint: tintFrom([[1, 1, 1], [0.6, 0.6, 0.6], [1.4, 1.1, 0.8]]) },
    scallop: { tpl: T.scallop, scale: [0.12, 0.2], follow: 0.95, tint: tintFrom([[1, 0.8, 0.7], [1, 0.5, 0.4], [0.9, 0.85, 0.8]]) },
    dollar: { tpl: T.sandDollar, scale: [0.07, 0.1], follow: 1, sink: 0.3, tint: tintFrom([[0.9, 0.85, 0.75]]) },
    cushion: { tpl: T.cushion, scale: [0.18, 0.26], follow: 0.95, sink: 0, tint: tintFrom([[0.9, 0.35, 0.08], [0.85, 0.6, 0.15], [0.7, 0.2, 0.12]]) },
  });
  Object.assign(S, {
    bendRock: { tpl: [...T.pinnacle, ...T.mound], scale: [1.1, 1.8], follow: 0.2, sink: 0.25, tint: tintFrom([[0.55, 0.52, 0.46]]) },
    grit: { tpl: T.grit, scale: [0.8, 1.6], follow: 1, sink: 0.01, tint: tintFrom([[1, 0.96, 0.9]], 0.06) },
    algae: { tpl: T.algae, scale: [0.6, 1.5], follow: 1, sink: 0.01, tint: tintFrom([[0.7, 0.8, 0.5], [0.8, 0.7, 0.45]], 0.1) },
  });
  S.micro = [{ w: 2, spec: S.grit }, { w: 1.5, spec: S.algae }];
  S.list = [
    { w: 2, k: 'rock' }, { w: 1.2, k: 'conch' }, { w: 1.6, k: 'cucumber' }, { w: 1.2, k: 'scallop' }, { w: 1.4, k: 'dollar' }, { w: 1.1, k: 'cushion' },
  ];
  return S;
}

const meadow = (x, s) => noise2(x / 13, s / 13, 501) * 0.7 + noise2(x / 4.5, s / 4.5, 502) * 0.3;

// grass patches on a jittered grid within [d0, d1] of the path
function grassField(ctx, fs, inst, rng, d0, d1, step, hgt, minRest) {
  for (let s = ctx.s0 + step * 0.5; s < ctx.s1; s += step) {
    const w = ctx.weightOf(s, 'seagrass');
    if (w <= 0) continue;
    const px = ctx.pathX(s), py = ctx.pathY(s);
    for (let side = -1; side <= 1; side += 2) {
      for (let d = d0; d < d1; d += step) {
        if (rng() > w) continue;
        const ss = s + (rng() - 0.5) * step, x = px + side * (d + rng() * step);
        const m = meadow(x, ss);
        if (m < -0.26) continue; // sand patch
        const dens = sstep(-0.26, -0.06, m);
        if (rng() > dens) continue;
        const y = fs.at(x, ss);
        // keep clear of the flight tube: patch height ~hgt
        const dx = Math.abs(x - px) - 0.6, dy = py - (y + hgt);
        if (dx < 0 && dy < 0.75) continue; // keep the lens radius clear (only matters in shallow cross-fades)
        const sc = (0.7 + 0.5 * dens) * (0.85 + rng() * 0.3);
        const R = orient(fs.nx, fs.ny, fs.nz, 0.8, rng() * TAU);
        const g = 0.85 + rng() * 0.3, yel = rng() * 0.15;
        inst.add(x, y - 0.03, -(ss - ctx.s0), R, sc, sc * (0.8 + rng() * 0.5), sc, g * (1 + yel), g * (1 + yel * 0.4), g * (1 - yel * 0.5));
      }
    }
  }
  return minRest;
}

export function layoutGrassNear(ctx) {
  if (presence(ctx, 'seagrass') <= 0) return null;
  const fs = floorSampler(ctx), rng = ctx.rng;
  const inst = new Inst(T.grassNear, MAT.sway, Math.round(1550 * budgetK(ctx, 'seagrass')));
  grassField(ctx, fs, inst, rng, 0, 14, 1.0, 0.75);
  return { extra: [inst], batches: [] };
}
export function layoutGrassFar(ctx) {
  if (presence(ctx, 'seagrass') <= 0) return null;
  const fs = floorSampler(ctx), rng = ctx.rng;
  const inst = new Inst(T.grassFar, MAT.sway, Math.round(600 * budgetK(ctx, 'seagrass')));
  grassField(ctx, fs, inst, rng, 14, 40, 1.8, 0.8);
  return { extra: [inst], batches: [] };
}
export function layoutSeagrassMisc(ctx) {
  if (presence(ctx, 'seagrass') <= 0) return null;
  const sp = specs(), fs = floorSampler(ctx), rng = ctx.rng;
  const st = new Batch(MAT.static, 22000 * budgetK(ctx, 'seagrass'));
  for (const b of bendSpots(ctx)) if (rng() < ctx.weightOf(b.s, 'seagrass') * 0.7) putBend(ctx, fs, st, sp.bendRock, b, rng);
  microDetail(ctx, fs, st, rng, 'seagrass', sp.micro, 70, 26);
  for (let k = 0; k < 110; k++) {
    const p = spot(ctx, rng, 0, 30, 1.2);
    if (rng() > ctx.weightOf(p.s, 'seagrass')) continue;
    const e = pickW(rng, sp.list);
    putFloor(ctx, fs, st, sp[e.k], p.x, p.s, rng);
  }
  st.split = 1;
  return { batches: [st] };
}
