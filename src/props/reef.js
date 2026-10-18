// Coral reef: bommies (coral heads) built around a massive coral / rock core, plus scattered life.
import { Builder, Batch, T, TAU, fbm3, vn3, sat, sstep, lerp, floorSampler, presence, budgetK, bendSpots, rotX, rotY, rotZ, mul3 } from './core.js';
import { rockInto, branchesInto, seaFan, tubeSponges, softCoral, leatherCoral, anemone, seaWhips, seastar, urchin } from './shapes.js';
import { putAt, putFloor, pickW, tintFrom, spot, bendX, microDetail, clusterer } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32, noise2 } from '../noise.js';

// ---------- reef-specific templates ----------
function staghorn(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 2 + Math.floor(rng() * 5);
  const depth = 2 + Math.floor(rng() * 2.5), spread = 0.4 + rng() * 0.4, up = 0.08 + rng() * 0.14, rad = 0.045 + rng() * 0.025;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng(), r = k ? 0.1 + rng() * 0.25 : 0;
    branchesInto(b, rng, {
      depth, len: 0.22 + rng() * 0.18, rad, radial: 4, segs: 2, kids: [1, 2 + (rng() < 0.4 ? 1 : 0)], spread, up, wiggle: 0.2 + rng() * 0.25,
      lenK: 0.75 + rng() * 0.2, radK: 0.8, tipK: 0.55, childAt: [0.35 + rng() * 0.25, 1],
      paint(level, v, x, y, z, o) { const t = sat(y / 0.9); o[3] = o[4] = o[5] = 0.45 + 0.6 * t + (level === depth ? 0.3 * v : 0); o[7] = 2; },
    }, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * (0.2 + rng() * 0.6), 1, Math.sin(a) * (0.2 + rng() * 0.6)]);
  }
  const t = b.build(); t.label = 'Staghorn coral'; return t;
}

function elkhorn(seed) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) {
    const a = rng() * TAU;
    branchesInto(b, rng, {
      depth: 2, len: 0.35 + rng() * 0.25, rad: 0.09 + rng() * 0.04, radial: 6, segs: 3, kids: [2, 3], spread: 0.6 + rng() * 0.4, up: 0.02, wiggle: 0.3,
      lenK: 0.75, radK: 0.75, tipK: 0.6, childAt: [0.6, 1],
      paint(level, v, x, y, z, o) { const t = sat(y / 0.8); o[3] = o[4] = o[5] = 0.5 + 0.55 * t; o[7] = 2; },
    }, [0, 0, 0], [Math.cos(a), 0.6 + rng() * 0.4, Math.sin(a)]);
  }
  b.xform(0, [1, 0, 0, 0, 1, 0, 0, 0, 1], 0, 0, 0, 1, 0.6, 1); // flattened, antler-like
  const t = b.build(); t.label = 'Elkhorn coral'; return t;
}

function fingerCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 10 + Math.floor(rng() * 22), R = 0.18 + rng() * 0.2;
  for (let k = 0; k < n; k++) {
    const rr = R * Math.sqrt(rng()), a = rng() * TAU, h = (0.12 + rng() * 0.28) * (1 - 0.5 * rr / R), r = 0.022 + rng() * 0.018;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, lx = (rng() - 0.5) * 0.08, lz = (rng() - 0.5) * 0.08;
    b.tube([[x, 0, z], [x + lx * 0.5, h * 0.5, z + lz * 0.5], [x + lx, h, z + lz]], [r * 1.1, r, r * 0.9], 5, (v, an, px, py, pz, o) => { o[3] = o[4] = o[5] = 0.55 + 0.55 * v; o[7] = 2; }, { tip: true });
  }
  const t = b.build(); t.label = 'Finger coral'; return t;
}

function pillarCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 3 + Math.floor(rng() * 7);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rr = k ? 0.12 + rng() * 0.35 : 0, h = 0.5 + rng() * 1.6, r = 0.07 + rng() * 0.08, v0 = b.vc;
    b.lathe(10, 6, (v) => [r * (v > 0.85 ? Math.sqrt(Math.max(0, 1 - ((v - 0.85) / 0.15) ** 2)) : 1) * (1 + 0.08 * Math.sin(v * 13 + k)), v * h], (an, v) => 1 + 0.07 * vn3(Math.cos(an) * 2, v * 6, Math.sin(an) * 2, seed + k),
      (v, an, x, y, z, o) => { o[3] = o[4] = o[5] = 0.5 + 0.55 * v; o[7] = 2; });
    b.xform(v0, [1, 0, 0, 0, 1, 0, 0, 0, 1], Math.cos(a) * rr, 0, Math.sin(a) * rr);
  }
  const t = b.build(); t.label = 'Pillar coral'; return t;
}

// one plate (top, underside, rim) at height y, tilted
function plate(b, seed, Rmax, y0, dish, tx, tz, ox = 0, oz = 0) {
  const v0 = b.vc, NU = 26;
  const R = (a) => Rmax * (1 + 0.18 * vn3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, seed, seed) + 0.05 * Math.sin(a * 9 + seed));
  const Y = (r, a) => dish * r * r + 0.03 * vn3(Math.cos(a) * r * 3, Math.sin(a) * r * 3, 1, seed + 3);
  b.grid(NU, 5, (u, v, i, j, o) => { const a = u * TAU, r = v * R(a); o[0] = Math.cos(a) * r; o[1] = Y(v, a); o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.85 + 0.3 * v; o[7] = 2; }, { wrapU: true, flip: true });
  b.grid(NU, 3, (u, v, i, j, o) => { const a = u * TAU, rv = 1 - v, r = rv * R(a); o[0] = Math.cos(a) * r; o[1] = Y(rv, a) - 0.06 * (1 - 0.6 * rv); o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.3 + 0.15 * rv; }, { wrapU: true, flip: true });
  b.grid(NU, 1, (u, v, i, j, o) => { const a = u * TAU, r = R(a); o[0] = Math.cos(a) * r; o[1] = Y(1, a) - 0.035 * v; o[2] = Math.sin(a) * r; o[3] = o[4] = o[5] = 0.9; }, { wrapU: true, flip: true });
  b.xform(v0, mul3(rotX(tx), rotZ(tz)), ox, y0, oz);
}

function tableCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), stalk = 0.12 + rng() * 0.25, tiers = 1 + Math.floor(rng() * 2.6);
  b.lathe(8, 2, (v) => [0.13 - 0.04 * v, v * stalk], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.3 + 0.3 * v; });
  for (let k = 0; k < tiers; k++) plate(b, seed * 7 + k, (0.95 - k * 0.25) * (0.8 + rng() * 0.45), stalk + k * (0.14 + rng() * 0.12), 0.12 + rng() * 0.12, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.15 * k, (rng() - 0.5) * 0.15 * k);
  const t = b.build(); t.label = 'Table coral'; return t;
}

function plateCoral(seed) { // whorls of tilted cups / scrolls (Turbinaria, Montipora)
  const b = new Builder(), rng = mulberry32(seed), n = 3 + Math.floor(rng() * 5);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, h = 0.05 + k * 0.08 + rng() * 0.1;
    plate(b, seed * 11 + k, 0.2 + rng() * 0.3, h, 0.25 + rng() * 0.5, Math.cos(a) * (0.3 + rng() * 0.5), Math.sin(a) * (0.3 + rng() * 0.5), Math.cos(a) * 0.18, Math.sin(a) * 0.18);
  }
  const t = b.build(); t.label = 'Plate coral'; return t;
}

function mushroomCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), el = 1 + rng() * 0.6, ridges = 24 + Math.floor(rng() * 20);
  b.blob(3, (x, y, z, o) => {
    const th = Math.atan2(z, x), py = y > 0 ? y * 0.22 : y * 0.08;
    const rid = 0.025 * Math.abs(Math.sin(th * ridges / 2)) * Math.max(0, y);
    o[0] = x * el * (1 + rid); o[1] = py + 0.03 + rid * 0.3 - 0.08 * (x * x + z * z) * (y > 0 ? 1 : 0); o[2] = z * (1 + rid);
    const c = y > 0 ? 0.9 + 0.3 * Math.abs(Math.sin(th * ridges / 2)) : 0.4; o[3] = o[4] = o[5] = c; o[7] = 0;
  });
  const t = b.build(); t.label = 'Mushroom coral'; return t;
}

function lettuceCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 4 + Math.floor(rng() * 6);
  for (let k = 0; k < n; k++) {
    const yaw = rng() * Math.PI, ox = (rng() - 0.5) * 0.5, oz = (rng() - 0.5) * 0.5, H = 0.18 + rng() * 0.25, W = 0.25 + rng() * 0.3, fq = 6 + rng() * 8;
    for (const side of [1, -1]) {
      const v0 = b.vc;
      b.grid(10, 3, (u, v, i, j, o) => {
        const x = (u - 0.5) * W * (1 - 0.3 * v), y = v * H * (1 - 0.4 * Math.abs(u - 0.5));
        const ruffle = 0.05 * Math.sin(u * fq + k) * v + 0.012 * side;
        o[0] = x; o[1] = y; o[2] = ruffle; o[3] = o[4] = o[5] = 0.5 + 0.6 * v; o[7] = 2;
      }, { flip: side < 0 });
      b.xform(v0, rotY(yaw), ox, 0, oz);
    }
  }
  const t = b.build(); t.label = 'Lettuce coral'; return t;
}

function brainCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), sq = 0.5 + rng() * 0.4, lob = 0.05 + rng() * 0.22, ex = 0.8 + rng() * 0.5, key = 0.62 + rng() * 0.76;
  b.blob(4, (x, y, z, o) => {
    const d = 1 + lob * fbm3(x * 1.4 + seed, y * 1.4, z * 1.4, 2, seed);
    const py = y >= 0 ? y * sq : y * 0.15;
    o[0] = x * d * ex; o[1] = (py + 0.08) * d; o[2] = z * d / Math.sqrt(ex);
    const ao = 0.35 + 0.65 * sstep(-0.15, 0.5, y);
    o[3] = o[4] = o[5] = ao; o[6] = 0; o[7] = key;
  });
  const t = b.build(); t.label = 'Brain coral'; return t;
}

function boulderCoral(seed) {
  const b = new Builder(), rng = mulberry32(seed), lumps = 0.2 + rng() * 0.25, fr = 0.9 + rng() * 1.2, h = 0.6 + rng() * 0.5;
  b.blob(4, (x, y, z, o) => {
    const d = 1 + lumps * fbm3(x * fr + seed, y * fr, z * fr, 3, seed) + 0.08 * vn3(x * 4, y * 4, z * 4, seed + 1);
    let py = y * d; if (py < -0.15) py = -0.15 + (py + 0.15) * 0.15;
    o[0] = x * d * 1.25; o[1] = (py + 0.15) * h; o[2] = z * d * 1.05;
    const ao = 0.35 + 0.65 * sstep(-0.1, 0.6, y);
    o[3] = o[4] = o[5] = ao; o[6] = 0.35; o[7] = 2;
  });
  const t = b.build(); t.label = 'Massive Porites coral'; return t;
}

function barrelSponge(seed) {
  const b = new Builder(), rng = mulberry32(seed), H = 0.8 + rng() * 0.7, w = 0.32 + rng() * 0.14, bul = 0.3 + rng() * 0.4, rid = 5 + Math.floor(rng() * 6), neck = 0.6 + rng() * 0.35;
  const prof = (v) => w * (neck + bul * Math.sin(v * 2.4 + 0.35));
  b.lathe(16, 8, (v) => [prof(v), v * H], (a, v) => 1 + 0.09 * Math.abs(Math.sin(a * rid + v * 0.5)) + 0.06 * vn3(Math.cos(a) * 2, v * 3, Math.sin(a) * 2, seed),
    (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.35 + 0.65 * sstep(0, 0.4, v); o[7] = 2; });
  b.grid(16, 1, (u, v, i, j, o) => { const a = u * TAU, R = lerp(prof(1) * 1.04, prof(1) * 0.78, v); o[0] = Math.cos(a) * R; o[1] = H + 0.01; o[2] = Math.sin(a) * R; o[3] = o[4] = o[5] = 1; }, { wrapU: true });
  b.lathe(16, 2, (v) => [prof(1 - v * 0.7) * 0.78, H * (1 - v * 0.7)], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.45 - 0.38 * v; }, { flip: true });
  const t = b.build(); t.label = 'Giant barrel sponge'; return t;
}

function vaseSponge(seed) {
  const b = new Builder(), rng = mulberry32(seed), H = 0.4 + rng() * 0.5, fl = 1.6 + rng() * 1.6, r0 = 0.05 + rng() * 0.04;
  const prof = (v) => r0 * (1 + fl * v * v);
  b.lathe(14, 6, (v) => [prof(v), v * H], (a, v) => 1 + 0.12 * vn3(Math.cos(a) * 1.5, v * 3, Math.sin(a) * 1.5, seed) * v,
    (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.45 + 0.6 * v; o[7] = 2; });
  b.lathe(14, 3, (v) => [prof(1 - v * 0.8) * 0.85, H * (1 - v * 0.8)], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.5 - 0.35 * v; }, { flip: true });
  b.grid(14, 1, (u, v, i, j, o) => { const a = u * TAU, R = lerp(prof(1), prof(1) * 0.85, v); o[0] = Math.cos(a) * R; o[1] = H; o[2] = Math.sin(a) * R; o[3] = o[4] = o[5] = 1; }, { wrapU: true });
  const t = b.build(); t.label = 'Vase sponge'; return t;
}

function giantClam(seed, mantle) {
  const b = new Builder(), rng = mulberry32(seed), el = 0.42 + rng() * 0.2, ri = 10 + rng() * 6, lipA = 0.025 + rng() * 0.02;
  b.blob(3, (x, y, z, o) => {
    let px = x * el, py = y * 0.24, pz = z * (0.26 + rng() * 0.0 + 0.04 * (seed % 3));
    const lip = 0.1 + lipA * Math.sin(x * 24);
    pz *= 1 + 0.12 * Math.abs(Math.sin(x * ri));
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
  const R = (n, f, o = 0) => Array.from({ length: n }, (_, i) => f(100 + i * 17 + o));
  T.stag = R(12, staghorn);
  T.elkhorn = R(6, elkhorn);
  T.finger = R(8, fingerCoral);
  T.pillar = R(6, pillarCoral);
  T.table = R(10, tableCoral);
  T.plateC = R(8, plateCoral);
  T.mushroom = R(8, mushroomCoral);
  T.lettuce = R(6, lettuceCoral);
  T.brain = R(10, brainCoral);
  T.boulder = R(8, boulderCoral);
  T.coralMound = [41, 42, 43, 44, 45, 46].map((sd) => {
    const b = new Builder();
    rockInto(b, sd, { detail: 4, sx: 1.2 + (sd % 3) * 0.15, sy: 0.65 + (sd % 4) * 0.08, sz: 1.0 + (sd % 2) * 0.2, rough: 0.35 + (sd % 3) * 0.06, flat: 0.15, growth: 0, col: [1, 1, 1] });
    b.paint(0, (i, x, y, z, nx, ny, nz, o) => { o[3] = 0.55; o[4] = 2; });
    return b.build();
  });
  T.fan = R(16, (s) => seaFan(s, { h: 0.8 + (s % 5) * 0.2 }));
  T.tubeSp = R(10, (s) => tubeSponges(s, { n: 1 + (s % 8), h: 0.5 + (s % 5) * 0.22, r: 0.07 + (s % 4) * 0.025 }));
  T.barrel = R(8, barrelSponge);
  T.vase = R(6, vaseSponge);
  T.soft = R(14, (s) => softCoral(s, { h: 0.5 + (s % 4) * 0.18 }));
  T.leather = R(6, leatherCoral);
  T.anem = R(12, (k) => anemone(k, k % 2
    ? { tent: [0.75, 0.85, 0.55], tipC: [1.3, 1.2, 1.1], tentacles: 22 + (k % 7) * 4, thick: 0.035 + 0.003 * (k % 4), tlen: 0.32 + 0.05 * (k % 5) }
    : { tent: [0.85, 0.55, 0.8], tipC: [1.25, 1.1, 1.3], tlen: 0.28 + 0.05 * (k % 5), tentacles: 26 + (k % 6) * 4, thick: 0.036 }));
  T.whip = R(12, (s) => seaWhips(s, { n: 1 + (s % 8), h: 0.8 + (s % 4) * 0.3 }));
  const M = [[0.08, 0.35, 0.75], [0.06, 0.5, 0.5], [0.35, 0.45, 0.12], [0.4, 0.15, 0.55], [0.6, 0.5, 0.12], [0.15, 0.25, 0.6], [0.3, 0.2, 0.1], [0.05, 0.6, 0.35]];
  T.clam = M.map((m, i) => giantClam(i + 1, m));
  T.star = R(10, (s) => seastar(s, { arms: s % 7 === 0 ? 6 : 5, fat: 1.2 + (s % 5) * 0.4, curl: 0.03 + (s % 4) * 0.03 }));
  T.linckia = R(4, (s) => seastar(s, { arms: 5, fat: 5, thin: 0.6, curl: 0.02, col: [0.25, 0.45, 1.2] }));
  T.cots = R(4, (s) => seastar(s, { arms: 13 + (s % 4), fat: 3.5, thin: 0.8, curl: 0.05, spines: 70, col: [0.65, 0.45, 0.5] }));
  T.urchin = R(8, (s) => urchin(s, { len: 0.6 + (s % 5) * 0.5, spines: 30 + (s % 4) * 10, body: s % 3 ? [0.16, 0.13, 0.17] : [0.32, 0.26, 0.34] }));
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
    stag: { tpl: T.stag, scale: [0.8, 2.3], follow: 0.3, tint: tintFrom(HARD, 0.2) },
    elkhorn: { tpl: T.elkhorn, scale: [1.0, 2.2], follow: 0.2, tint: tintFrom([[0.95, 0.65, 0.3], [0.85, 0.6, 0.35], [0.9, 0.75, 0.45]], 0.2), giant: 0.02 },
    finger: { tpl: T.finger, scale: [0.8, 1.8], follow: 0.5, tint: tintFrom([[0.85, 0.7, 0.45], [0.75, 0.45, 0.85], [0.95, 0.85, 0.4]], 0.2) },
    pillar: { tpl: T.pillar, scale: [0.8, 1.6], follow: 0.1, tint: tintFrom([[0.95, 0.8, 0.55], [0.8, 0.75, 0.5]], 0.15), giant: 0.03 },
    plateC: { tpl: T.plateC, scale: [0.9, 2.2], follow: 0.3, tint: tintFrom([[0.75, 0.6, 0.3], [0.5, 0.65, 0.3], [0.7, 0.4, 0.6], [0.55, 0.5, 0.8]], 0.2) },
    mushroom: { tpl: T.mushroom, scale: [0.12, 0.28], follow: 0.95, sink: 0, tint: tintFrom([[0.95, 0.75, 0.55], [0.8, 0.6, 0.9], [0.6, 0.85, 0.6]], 0.2) },
    lettuce: { tpl: T.lettuce, scale: [0.9, 2.0], follow: 0.4, tint: tintFrom([[0.75, 0.65, 0.35], [0.6, 0.7, 0.35], [0.8, 0.55, 0.45]], 0.2) },
    vase: { tpl: T.vase, scale: [0.9, 2.0], follow: 0.3, tint: tintFrom([[0.45, 0.6, 1.1], [0.95, 0.35, 0.7], [1.0, 0.6, 0.15], [0.7, 0.3, 0.9]], 0.18), giant: 0.03 },
    linckia: { tpl: T.linckia, scale: [0.12, 0.2], follow: 1, sink: 0, tint: tintFrom([[1, 1, 1]], 0.15) },
    cots: { tpl: T.cots, scale: [0.14, 0.24], follow: 1, sink: 0, tint: tintFrom([[1, 1, 1], [1.1, 0.8, 0.9]], 0.15) },
    table: { tpl: T.table, scale: [0.8, 1.8], follow: 0.15, tint: tintFrom(HARD, 0.2), sink: 0, giant: 0.02 },
    brain: { tpl: T.brain, scale: [0.4, 1.3], follow: 0.75, tint: tintFrom(MASSIVE, 0.22), giant: 0.03 },
    boulder: { tpl: T.boulder, scale: [1.0, 2.4], follow: 0.6, tint: tintFrom(MASSIVE) },
    fan: { tpl: T.fan, scale: [0.7, 2.1], follow: 0.15, sway: true, tint: tintFrom(FANS, 0.2), giant: 0.03 },
    tubeSp: { tpl: T.tubeSp, scale: [1.0, 2.0], follow: 0.4, tint: tintFrom(VIVID) },
    barrel: { tpl: T.barrel, scale: [0.8, 1.9], follow: 0.3, giant: 0.04, tint: tintFrom([[0.85, 0.32, 0.22], [0.7, 0.22, 0.7], [0.95, 0.55, 0.2]]) },
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
    { w: 1.2, k: 'elkhorn' }, { w: 1.2, k: 'finger' }, { w: 0.7, k: 'pillar' }, { w: 1.4, k: 'plateC' }, { w: 1, k: 'lettuce' }, { w: 0.9, k: 'vase' },
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
    { w: 1.6, k: 'star' }, { w: 0.5, k: 'linckia' }, { w: 0.3, k: 'cots' }, { w: 1.4, k: 'mushroom' }, { w: 2, k: 'urchin' }, { w: 1.4, k: 'clam' }, { w: 1.6, k: 'anem', sway: true }, { w: 1.4, k: 'brain' }, { w: 0.8, k: 'soft', sway: true },
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
  const st = new Batch(MAT.static, 106000 * bk), sw = new Batch(MAT.sway, 46000 * bk);
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
  st.split = 4; sw.split = 4;
  return { batches: [st, sw] };
}

// second layout chain: floor micro detail + small life (incl. under the camera)
export function layoutReefMicro(ctx) {
  if (presence(ctx, 'reef') <= 0) return null;
  const R = specs(), rng = mulberry32((ctx.s0 * 2654435761) ^ 0x51f), fs = floorSampler(ctx), bk = budgetK(ctx, 'reef');
  const st = new Batch(MAT.static, 22000 * bk), sw = new Batch(MAT.sway, 8000 * bk);
  microDetail(ctx, fs, st, rng, 'reef', R.micro, 130, 26);
  // small life everywhere, also under the camera
  const nextP329 = clusterer(ctx, rng, 0, 14, 1);
  for (let k = 0; k < 90; k++) {
    const p = nextP329();
    if (!p) continue;
    if (rng() > ctx.weightOf(p.s, 'reef') * 0.8) continue;
    const e = pickW(rng, R.smallList);
    putFloor(ctx, fs, e.sway ? sw : st, R[e.k], p.x, p.s, rng, 0.8);
  }
  st.split = 1; sw.split = 1;
  return { batches: [st, sw] };
}
