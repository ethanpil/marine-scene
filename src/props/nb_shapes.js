// Organism templates shared by the new biomes (built once at startup). Colours are linear RGB, mostly
// near-neutral so per-instance tints provide the hue. Every template grows from local y = 0 (its base).
import { Builder, TAU, fbm3, vn3, sat, sstep, lerp } from './core.js';
import { branchesInto } from './shapes.js';
import { mulberry32 } from '../noise.js';
import { setBase } from './nb_common.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// shift vertices >= v0 so their lowest point is at y = 0
export function ground(b, v0 = 0) {
  let mn = 1e9;
  for (let i = v0; i < b.vc; i++) mn = Math.min(mn, b.P[i * 3 + 1]);
  for (let i = v0; i < b.vc; i++) b.P[i * 3 + 1] -= mn;
  return b;
}
// cubic Bezier
export function bez(P0, P1, P2, P3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1], a * P0[2] + b * P1[2] + c * P2[2] + d * P3[2]];
}

// Encrusting sponge / colonial cushion: a flattened lumpy pancake with pores (static mode 2).
export function encrust(seed, { r = 0.15, h = 0.05, lobes = 0.4, detail = 2, ridges = 0, elong = 1 } = {}) {
  const b = new Builder();
  b.blob(detail, (x, y, z, o) => {
    // amoeboid outline: low-frequency lobes plus finer scallops, optionally elongated
    const d = (1 + lobes * fbm3(x * 2.2 + seed, y * 0.5, z * 2.2, 3, seed) + 0.12 * vn3(x * 6 + seed, 0, z * 6, seed + 9)) * (1 + (elong - 1) * Math.abs(x));
    const bump = 1 + 0.9 * Math.max(0, vn3(x * 3 + seed, y * 3, z * 3, seed + 5)) + 0.35 * vn3(x * 8, y * 8, z * 8, seed + 6) + ridges * Math.abs(Math.sin(x * 9 + z * 5 + seed));
    const py = y > 0 ? y * h * bump : y * h * 0.2;
    o[0] = x * r * d; o[1] = py; o[2] = z * r * d;
    const c = y > 0 ? 0.85 + 0.3 * y : 0.45;
    o[3] = o[4] = o[5] = c; o[6] = 0; o[7] = 2;
  });
  return ground(b).build();
}

// Cluster of oysters cemented together, valves angled up and out.
export function oysterCluster(seed, { n = 5, L = 0.08, spread = 0.07 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rr = k ? spread * Math.sqrt(rng()) : 0, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const yaw = rng() * TAU, up = 0.2 + rng() * 0.9, s = L * (0.6 + 0.6 * rng());
    const dir = norm([Math.cos(yaw), up, Math.sin(yaw)]), side = norm(cross(dir, [0, 1, 0])), nr = cross(side, dir);
    const fr = 7 + Math.floor(rng() * 6), ph = rng() * 6;
    b.blob(1, (x, y, z, o) => {
      const t = x, ang = Math.atan2(z, y);
      const w = 0.7 * (1 - 0.25 * t) * Math.sqrt(Math.max(0, 1 - t * t * 0.3));
      const ruff = 1 + 0.18 * Math.sin(ang * fr + t * 4 + ph);
      const lx = (t * 0.5 + 0.45) * s, ly = y * w * 0.22 * s * ruff, lz = z * w * 0.5 * s * ruff;
      o[0] = cx + dir[0] * lx + nr[0] * ly + side[0] * lz;
      o[1] = 0.01 + dir[1] * lx + nr[1] * ly + side[1] * lz + rr * 0.15;
      o[2] = cz + dir[2] * lx + nr[2] * ly + side[2] * lz;
      const lip = sstep(0.55, 0.95, Math.abs(z)) * 0.6, v = 0.8 + 0.4 * vn3(x * 5, y * 5, z * 5, seed + k);
      o[3] = lerp(0.3, 0.75, lip) * v; o[4] = lerp(0.27, 0.68, lip) * v; o[5] = lerp(0.3, 0.7, lip) * v; o[6] = 0.2; o[7] = 2;
    });
  }
  return ground(b).build();
}

// Colonial sea squirts: small barrels with a dark siphon each.
export function tunicates(seed, { n = 6, H = 0.06, R = 0.016, spread = 0.06 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rr = k ? spread * Math.sqrt(rng()) : 0, h = H * (0.6 + 0.7 * rng()), r = R * (0.7 + 0.6 * rng());
    const lx = (rng() - 0.5) * 0.5, lz = (rng() - 0.5) * 0.5, v0 = b.vc;
    const prof = (v) => r * (0.55 + 0.5 * Math.sin(Math.min(1, v * 1.1) * Math.PI * 0.85));
    b.lathe(8, 4, (v) => [prof(v), v * h], null, (v, an, x, y, z, o) => { o[3] = o[4] = o[5] = 0.75 + 0.35 * v; o[7] = 0; });
    b.lathe(8, 1, (v) => [prof(1) * (1 - v * 0.7), h * (1 - v * 0.35)], null, (v, an, x, y, z, o) => { o[3] = o[4] = o[5] = 0.12; }, { flip: true });
    for (let i = v0; i < b.vc; i++) { const y = b.P[i * 3 + 1]; b.P[i * 3] += Math.cos(a) * rr + lx * y; b.P[i * 3 + 2] += Math.sin(a) * rr + lz * y; }
  }
  return ground(b).build();
}

// Feather star (crinoid): tiny calyx gripping the substrate with cirri, feathery arms arching out.
// Built for the sway material (double sided pinnules); aFx.x = sway amplitude.
export function featherStar(seed, { arms = 12, L = 0.22, up = 0.6 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  b.blob(1, (x, y, z, o) => { o[0] = x * 0.025; o[1] = 0.03 + y * 0.018; o[2] = z * 0.025; o[3] = o[4] = o[5] = 0.6; });
  for (let k = 0; k < 6; k++) { // cirri
    const a = (k / 6) * TAU + rng();
    b.tube([[Math.cos(a) * 0.015, 0.025, Math.sin(a) * 0.015], [Math.cos(a) * 0.035, 0.012, Math.sin(a) * 0.035], [Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04]], [0.004, 0.003, 0.002], 3, (v, an, x, y, z, o) => { o[3] = o[4] = o[5] = 0.45; });
  }
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * TAU + (rng() - 0.5) * 0.3, len = L * (0.75 + 0.4 * rng()), lift = up * (0.6 + 0.6 * rng());
    const out = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
    const pts = [], radii = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6; // rises, then curls down at the tip
      const rr = 0.02 + len * t * (1 - 0.15 * t), yy = Math.max(0.012, 0.035 + len * (lift * 0.7 * t - 0.55 * t * t));
      pts.push([out[0] * rr, yy, out[2] * rr]); radii.push(0.0055 * (1 - t * 0.7));
    }
    const band = rng() < 0.3;
    b.tube(pts, radii, 3, (v, an, x, y, z, o, j) => { const c = band && j % 2 ? 0.55 : 1; o[3] = o[4] = o[5] = c; o[6] = 0.03 * v; }, { tip: true });
    for (let i = 1; i < 6; i += 2) { // pinnules: thin flaps on both sides
      const p = pts[i], q = pts[i + 1], d = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
      for (const sd of [-1, 1]) {
        const tip = [p[0] + side[0] * sd * 0.028 + d[0] * 0.012, p[1] + 0.008 - 0.012 * (i / 6), p[2] + side[2] * sd * 0.028 + d[2] * 0.012];
        const sw = 0.03 * (i / 6);
        const v0 = b.v(p[0], p[1], p[2], 0, 1, 0, 1, 1, 1, sw, 0);
        const v1 = b.v(p[0] + d[0] * 0.02, p[1] + d[1] * 0.02, p[2] + d[2] * 0.02, 0, 1, 0, 1, 1, 1, sw, 0);
        const v2 = b.v(tip[0], tip[1], tip[2], 0, 1, 0, 0.85, 0.85, 0.85, sw * 1.3, 0);
        b.t(v0, v1, v2);
      }
    }
  }
  const t = b.build();
  setBase(t, [0.04, 0, 0, -0.04, 0, 0, 0, 0, 0.04, 0, 0, -0.04]);
  return t;
}

// Black coral (antipatharian): a dark wiry skeleton under pale living tissue, a bushy "Christmas tree".
export function blackCoral(seed, { h = 1.0 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  branchesInto(b, rng, {
    depth: 3, len: h * (0.35 + rng() * 0.15), rad: h * 0.022, radial: 3, segs: 2, kids: [2, 3], spread: 0.55 + rng() * 0.35, up: 0.06, wiggle: 0.35,
    lenK: 0.62, radK: 0.7, tipK: 0.4, childAt: [0.3, 1], childRad: 0.75, continueTrunk: true,
    paint(level, v, x, y, z, o) { const t = sat(y / h); const c = level === 0 && v < 0.3 ? 0.18 : 0.75 + 0.3 * t; o[3] = o[4] = o[5] = c; o[6] = 0.05 * h * t * t; o[7] = 0; },
  });
  return ground(b).build();
}

// Elephant-ear sponge: a thick, cupped, ear-shaped plate growing up from a narrow base.
export function elephantEar(seed, { H = 1.0, W = 0.9, th = 0.06, detail = 3 } = {}) {
  const b = new Builder(), rng = mulberry32(seed), cup = 0.25 + rng() * 0.35, wav = 0.04 + rng() * 0.05, tilt = (rng() - 0.5) * 0.3;
  b.blob(detail, (x, y, z, o) => {
    const v = (y + 1) / 2, wid = W * (0.18 + 0.82 * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.62)) * (1 + 0.12 * vn3(x * 2, v * 3, 0, seed));
    const px = x * wid * 0.5, py = v * H * (1 + 0.08 * vn3(x * 3, 0, 1, seed + 2)) + tilt * px;
    const pz = z * th * (1 - 0.4 * v) + cup * px * px / Math.max(0.2, W) + wav * Math.sin(px * 9 + seed) * v;
    o[0] = px; o[1] = py; o[2] = pz;
    const ao = 0.55 + 0.45 * sstep(0, 0.4, v); o[3] = o[4] = o[5] = ao; o[6] = 0; o[7] = 2;
  });
  return ground(b).build();
}

// Plate-coral shelf: a thin lamina jutting horizontally from its straight back edge (local z < 0 is
// buried in the wall). Concentric growth ridges and a pale growing margin.
export function shelfPlate(seed, { R = 0.6 } = {}) {
  const b = new Builder(), rng = mulberry32(seed), th = 1.1 + rng() * 0.35, back = 0.12 * R, dish = 0.04 + rng() * 0.06, fr = 5 + rng() * 6;
  const Rad = (u) => R * (1 + 0.14 * Math.sin(u * fr + seed) + 0.1 * vn3(u * 2, 0, 0, seed));
  const P = (u, v, top) => {
    const a = (u - 0.5) * 2 * th, rr = v * Rad(u);
    const x = Math.sin(a) * rr * 1.25 + (u - 0.5) * back * 2, z = Math.cos(a) * rr - back;
    const ridge = 0.006 * Math.sin(v * 38 + seed);
    const y = dish * v * v * R + ridge + (top ? 0 : -(0.035 - 0.02 * v) * R / 0.6);
    return [x, y, z];
  };
  b.grid(14, 5, (u, v, i, j, o) => { const p = P(u, v, true); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = o[4] = o[5] = v > 0.88 ? 1.25 : 0.8 + 0.25 * v; o[6] = 0.2; o[7] = 2; });
  b.grid(14, 3, (u, v, i, j, o) => { const p = P(u, 1 - v, false); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = o[4] = o[5] = 0.35; });
  b.grid(14, 1, (u, v, i, j, o) => { const p = P(u, 1, v < 0.5); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = o[4] = o[5] = 1.1; }, { flip: true });
  const t = b.build();
  // attached along the buried back edge
  const yb = -0.035 * R / 0.6, pts = [];
  for (let k = 0; k <= 4; k++) pts.push((k / 4 - 0.5) * back * 2, yb, -back);
  setBase(t, pts);
  return t;
}

// Sun corals (Tubastraea): clustered cups with orange polyp crowns; they love shaded overhangs.
export function sunCorals(seed, { n = 9, spread = 0.12 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rr = k ? spread * Math.sqrt(rng()) : 0, h = 0.025 + rng() * 0.05, r = 0.012 + rng() * 0.01, v0 = b.vc;
    b.lathe(7, 2, (v) => [r * (1 + 0.15 * v), v * h], null, (v, an, x, y, z, o) => { o[3] = 0.9; o[4] = 0.5; o[5] = 0.25; o[7] = 2; });
    b.lathe(7, 2, (v) => [r * 1.15 * (1 - v) + 0.002, h + 0.008 * Math.sin(v * Math.PI)], null, (v, an, x, y, z, o) => { o[3] = 1.15; o[4] = 0.75; o[5] = 0.2; o[6] = 0.01; o[7] = 0; });
    for (let i = v0; i < b.vc; i++) { b.P[i * 3] += Math.cos(a) * rr; b.P[i * 3 + 2] += Math.sin(a) * rr; }
  }
  return ground(b).build();
}

// Cheap mussel bed (8-20 tris per shell) for long shorelines.
export function cheapMussels(seed, { n = 30, r = 0.35, L = 0.09, col = [0.35, 0.28, 0.16], edge = [0.6, 0.5, 0.3] } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const rr = r * Math.sqrt(rng()), a = rng() * TAU, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const yaw = rng() * TAU, up = 0.25 + rng() * 0.8, s = L * (0.6 + 0.6 * rng());
    const dir = norm([Math.cos(yaw), up, Math.sin(yaw)]), side = norm(cross(dir, [0, 1, 0])), nr = cross(side, dir);
    const hgt = (1 - rr / r) * 0.03;
    b.blob(0, (x, y, z, o) => {
      const t = x, w = 0.42 * (1 - 0.35 * t);
      const lx = t * 0.5 * s, ly = y * w * 0.45 * s, lz = z * w * 0.5 * s;
      o[0] = cx + dir[0] * lx + nr[0] * ly + side[0] * lz;
      o[1] = hgt + dir[1] * lx + nr[1] * ly + side[1] * lz + 0.3 * s * dir[1];
      o[2] = cz + dir[2] * lx + nr[2] * ly + side[2] * lz;
      const e = sstep(0.5, 1, Math.abs(z)) * 0.7;
      o[3] = lerp(col[0], edge[0], e); o[4] = lerp(col[1], edge[1], e); o[5] = lerp(col[2], edge[2], e); o[7] = 0;
    });
  }
  return ground(b).build();
}

// Small tube anemone / fan worm crown etc. are taken from shapes.js; this is a stubby bottlebrush tuft
// of filamentous algae or hydroids for roots and rock (sway material; aFx.x = sway).
export function fuzzTuft(seed, { n = 16, r = 0.05, h = 0.1, w = 0.004 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, rr = r * Math.sqrt(rng()), cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const L = h * (0.4 + 0.8 * rng()), la = rng() * TAU, lean = 0.2 + rng() * 0.6, fa = rng() * TAU;
    const tx = cx + Math.cos(la) * lean * L, tz = cz + Math.sin(la) * lean * L, ty = L * Math.sqrt(1 - lean * lean * 0.5);
    const fx = Math.cos(fa) * w, fz = Math.sin(fa) * w;
    const v0 = b.v(cx - fx, 0, cz - fz, 0, 1, 0, 0.6, 0.6, 0.6, 0, 0);
    const v1 = b.v(cx + fx, 0, cz + fz, 0, 1, 0, 0.6, 0.6, 0.6, 0, 0);
    const v2 = b.v(tx, ty, tz, 0, 1, 0, 1.1, 1.1, 1.1, 0.08 * L / h * h, 0);
    b.t(v0, v1, v2);
  }
  const t = b.build();
  setBase(t, [0, 0, 0, r * 0.5, 0, 0, -r * 0.5, 0, 0, 0, 0, r * 0.5, 0, 0, -r * 0.5]);
  return t;
}
