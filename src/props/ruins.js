// Sunken city: colonnade avenues, gates spanning the flight path, paved roads, block walls, stepped
// pyramids with statues on the terraces, amphorae and fallen masonry, all overgrown.
import { Builder, Batch, T, TAU, sat, sstep, lerp, vn3, fbm3, floorSampler, presence, pointsClear, placedPoints, tubeClear, rotX, rotY, rotZ, mul3, orient, budgetK, bendSpots, vary } from './core.js';
import { stoneInto } from './shapes.js';
import { statue } from './statues.js';
import { groundY, putFloor, putAt, pickW, tintFrom, spot, putBend, microDetail, clusterer } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32, noise1, noise2, hash2i } from '../noise.js';

const STONE = [0.62, 0.58, 0.5];
// marble, sandstone, granite, basalt, limestone, travertine (instance tints over STONE)
const STONES = [[1.35, 1.35, 1.38], [1.25, 1.0, 0.72], [0.95, 0.95, 0.98], [0.52, 0.52, 0.56], [1.15, 1.1, 1.0], [1.2, 1.05, 0.85]];
const GROW = 0.95;
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ---------- architecture ----------
const COL_STYLES = {
  doric: { name: 'Doric column', flutes: 20, flute: 0.045, base: 'plinth', cap: 'doric', taper: 0.12, slim: 1 },
  ionic: { name: 'Ionic column', flutes: 24, flute: 0.05, base: 'attic', cap: 'ionic', taper: 0.08, slim: 0.82 },
  corinthian: { name: 'Corinthian column', flutes: 24, flute: 0.05, base: 'attic', cap: 'corinthian', taper: 0.08, slim: 0.75 },
  tuscan: { name: 'Tuscan column', base: 'attic', cap: 'doric', taper: 0.15, slim: 1.05 },
  papyrus: { name: 'Papyrus column', lobes: 8, lobe: 0.09, base: 'disc', cap: 'papyrus', taper: 0.1, slim: 1.25 },
  lotus: { name: 'Lotus-bud column', lobes: 6, lobe: 0.12, base: 'disc', cap: 'lotus', taper: 0.06, slim: 1.2 },
  maya: { name: 'Maya carved pillar', square: true, carved: true, base: 'block', cap: 'block', taper: 0.04, slim: 1.15 },
  minoan: { name: 'Minoan column', base: 'disc', cap: 'cushion', taper: -0.2, slim: 1.05, col: [0.6, 0.24, 0.17] },
  solomonic: { name: 'Solomonic column', flutes: 6, flute: 0.14, twist: 1.6, base: 'attic', cap: 'doric', taper: 0.06, slim: 0.9 },
  octagonal: { name: 'Octagonal pillar', poly: 8, base: 'block', cap: 'block', taper: 0.05, slim: 1 },
};
export const COL_STYLE_KEYS = Object.keys(COL_STYLES);

function column(seed, style = 'doric', { H = 6, broken = 0, capital = true, base = true } = {}) {
  const st = COL_STYLES[style], b = new Builder(), rng = mulberry32(seed);
  const R = 0.36 * st.slim * (0.85 + rng() * 0.35);
  const top = broken ? H * broken : H, key = 6.05 + rng() * 0.9;
  const scol = st.col || STONE, f = [GROW, key];
  const paintStone = (c) => (v, a, x, y, z, o) => {
    const k = 0.85 + 0.2 * vn3(x * 3, y * 3, z * 3, seed); o[3] = c[0] * k; o[4] = c[1] * k; o[5] = c[2] * k; o[6] = GROW; o[7] = key;
  };
  const stoneLathe = (nu, nv, prof, rad, c = STONE) => b.lathe(nu, nv, prof, rad, paintStone(c));
  let y0 = 0.3;
  if (!base) y0 = 0;
  else if (st.base === 'plinth' || st.base === 'block') { b.box(R * 3, 0.35, R * 3, rotY((rng() - 0.5) * 0.05), 0, 0.175, 0, STONE.map((c) => c * 0.9), f); y0 = 0.35; }
  if (base && st.base === 'attic') { b.box(R * 3, 0.25, R * 3, null, 0, 0.125, 0, STONE.map((c) => c * 0.9), f); stoneLathe(16, 4, (v) => [R * (1.32 - 0.25 * v + 0.1 * Math.sin(v * Math.PI * 2)), 0.25 + v * 0.35]); y0 = 0.6; }
  if (base && st.base === 'disc') { stoneLathe(16, 2, (v) => [R * (1.5 - 0.3 * v), v * 0.3]); y0 = 0.3; }
  const NV = Math.max(3, Math.round((top - y0) / 0.55)), NU = st.square ? 24 : 20;
  const v0 = b.vc;
  b.grid(NU, NV, (u, v, i, j, o) => {
    const a = u * TAU, jag = broken ? 0.4 * vn3(Math.cos(a) * 2, Math.sin(a) * 2, seed, seed) + 0.25 * Math.sin(a * 3 + seed) : 0;
    const y = y0 + v * (top - y0 + (j === NV ? jag : 0)), t = y / H;
    let r = R * (1 - st.taper * t + 0.025 * Math.sin(t * Math.PI));
    const aa = a + (st.twist ? st.twist * y : 0);
    if (st.flutes) r *= 1 - st.flute * (0.5 + 0.5 * Math.cos(aa * st.flutes));
    if (st.lobes) r *= 1 + st.lobe * Math.abs(Math.sin(aa * st.lobes / 2)) - st.lobe * 0.5 * sstep(0.85, 1, t);
    if (st.square) r *= 0.95 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 8) + Math.pow(Math.abs(Math.sin(a)), 8), 1 / 8);
    if (st.poly) { const sec = TAU / st.poly, m = ((a % sec) + sec) % sec; r *= Math.cos(Math.PI / st.poly) / Math.cos(m - Math.PI / st.poly); }
    const band = ((y * 1.3) % 1 + 1) % 1;
    if (st.carved) r *= band < 0.1 ? 0.92 : 1 - 0.04 * sstep(0.3, 0.7, vn3(a * 2, y * 4, 0, seed));
    r *= 1 + 0.035 * vn3(Math.cos(a) * 3, y * 1.5, Math.sin(a) * 3, seed + 1) - 0.06 * sstep(0.55, 0.8, vn3(Math.cos(a) * 5, y * 2.5, Math.sin(a) * 5, seed + 9));
    o[0] = Math.cos(a) * r; o[1] = y; o[2] = Math.sin(a) * r;
    const c = (0.82 + 0.2 * vn3(o[0] * 3, y * 2, o[2] * 3, seed + 5)) * (st.carved && band < 0.1 ? 0.7 : 1);
    o[3] = scol[0] * c; o[4] = scol[1] * c; o[5] = scol[2] * c; o[6] = GROW * 0.7; o[7] = key;
  }, { wrapU: true });
  const ring = v0 + NU * NV;
  if (broken) {
    let cy = 0; for (let i = 0; i < NU; i++) cy += b.P[(ring + i) * 3 + 1];
    const c = b.v(0, cy / NU - 0.05, 0, 0, 1, 0, STONE[0], STONE[1], STONE[2], GROW, key);
    for (let i = 0; i < NU; i++) b.t(ring + ((i + 1) % NU), ring + i, c);
  } else if (capital) {
    const rt = R * (1 - st.taper);
    if (st.cap === 'doric') { stoneLathe(16, 3, (v) => [rt * (1 + 0.45 * Math.sin(v * Math.PI * 0.5)), top + v * 0.4]); b.box(R * 3, 0.32, R * 3, null, 0, top + 0.56, 0, STONE, f); }
    if (st.cap === 'ionic') {
      stoneLathe(16, 2, (v) => [rt * (1 + 0.25 * v), top + v * 0.25]);
      b.box(R * 2.9, 0.2, R * 2.3, null, 0, top + 0.45, 0, STONE, f);
      for (const sd of [-1, 1]) {
        b.tube([[sd * R * 1.15, top + 0.2, -R * 1.1], [sd * R * 1.15, top + 0.2, R * 1.1]], [R * 0.32, R * 0.32], 8, paintStone(STONE), { cap: true });
        for (const fz of [-1, 1]) {
          const sp = [];
          for (let k = 0; k <= 10; k++) { const th = k / 10 * TAU * 1.6, rr = R * 0.3 * (1 - k / 13); sp.push([sd * R * 1.15 + Math.cos(th) * rr, top + 0.2 + Math.sin(th) * rr, fz * (R * 1.1 + 0.02)]); }
          b.tube(sp, sp.map(() => 0.03), 3, paintStone(STONE.map((c) => c * 0.8)));
        }
      }
    }
    if (st.cap === 'corinthian') {
      stoneLathe(16, 5, (v) => [rt * (1 + 0.45 * v), top + v * R * 2.2], (a, v) => 1 + 0.16 * Math.max(0, Math.sin(a * 8 + (v > 0.5 ? 0.4 : 0))) * Math.sin((v * 2 % 1) * Math.PI));
      b.box(R * 3.1, 0.22, R * 3.1, null, 0, top + R * 2.2 + 0.11, 0, STONE, f);
    }
    if (st.cap === 'papyrus') stoneLathe(16, 4, (v) => [rt * (0.9 + 0.8 * Math.sin(v * Math.PI * 0.5)), top + v * R * 2.2], (a) => 1 + 0.06 * Math.abs(Math.sin(a * 8)));
    if (st.cap === 'lotus') stoneLathe(14, 5, (v) => [rt * (1 + 0.35 * Math.sin(v * Math.PI) - 0.3 * v), top + v * R * 2.4], (a) => 1 + 0.1 * Math.abs(Math.sin(a * 3)));
    if (st.cap === 'block') b.box(R * 2.8, 0.45, R * 2.8, null, 0, top + 0.22, 0, STONE.map((c) => c * 0.95), f);
    if (st.cap === 'cushion') { stoneLathe(16, 4, (v) => [rt * (1 + 0.4 * Math.sin(v * Math.PI)), top + v * 0.45], null, [0.25, 0.2, 0.18]); b.box(R * 2.9, 0.25, R * 2.9, null, 0, top + 0.57, 0, [0.3, 0.25, 0.22], f); }
  }
  const t = b.build();
  t.label = broken ? 'Broken ' + st.name.toLowerCase() : st.name;
  return t;
}

// a capital broken off and lying on its side
function capitalPiece(seed, style) {
  const t = column(seed, style, { H: 0.9 });
  const b = new Builder();
  b.P = Array.from(t.pos); b.N = Array.from(t.nor); b.C = Array.from(t.col); b.F = Array.from(t.fx); b.I = Array.from(t.idx);
  b.xform(0, rotZ(Math.PI / 2 + 0.25), 0.4, 0.5, 0);
  let mn = 1e9; for (let i = 1; i < b.P.length; i += 3) mn = Math.min(mn, b.P[i]);
  for (let i = 1; i < b.P.length; i += 3) b.P[i] -= mn;
  const c = b.build();
  c.label = 'Fallen ' + t.label.toLowerCase().replace('column', 'capital').replace('pillar', 'capital');
  return c;
}

// a fallen drum lying on its side
function drum(seed, style) {
  const t = column(seed, style, { H: 1.0 + (seed % 3) * 0.35, broken: 1, capital: false, base: false });
  const b = new Builder();
  b.P = Array.from(t.pos); b.N = Array.from(t.nor); b.C = Array.from(t.col); b.F = Array.from(t.fx); b.I = Array.from(t.idx);
  b.xform(0, rotZ(Math.PI / 2), 0.6, 0.35, 0);
  const d = b.build();
  d.label = 'Fallen column drum';
  return d;
}

function stoneBlock(b, rng, sx, sy, sz, R, x, y, z, col = STONE) {
  const v0 = b.vc, k = 0.82 + 0.25 * rng();
  b.box(sx * 0.97, sy * 0.97, sz * 0.97, null, 0, 0, 0, col.map((c) => c * k), [GROW, 0]);
  const j = Math.min(sx, sy, sz) * 0.06, cache = new Map();
  for (let i = v0; i < b.vc; i++) { // same jitter for coincident corners
    const key = b.P.slice(i * 3, i * 3 + 3).map((v) => Math.round(v * 100)).join(',');
    let d = cache.get(key);
    if (!d) { d = [(rng() - 0.5) * j, (rng() - 0.5) * j, (rng() - 0.5) * j]; cache.set(key, d); }
    b.P[i * 3] += d[0]; b.P[i * 3 + 1] += d[1]; b.P[i * 3 + 2] += d[2];
  }
  b.xform(v0, R || I3, x, y, z);
}

// gates; origin = arch centre (approx. camera path), local x across the path
function gateArch(seed, R) {
  const b = new Builder(), rng = mulberry32(seed), Hp = 10, pw = 1.5;
  for (const sd of [-1, 1]) {
    const px = sd * (R + pw / 2);
    for (let y = -Hp; y < 0; y += 1.0) stoneBlock(b, rng, pw * (0.96 + rng() * 0.08), 0.98, 1.7, rotY((rng() - 0.5) * 0.06), px + (rng() - 0.5) * 0.06, y + 0.5, 0);
  }
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (k + 0.5) / n, rm = R + 0.7;
    const keystone = k === (n - 1) / 2;
    stoneBlock(b, rng, keystone ? 1.6 : 1.45, (Math.PI * rm) / n * 0.97 + (keystone ? 0.15 : 0), 1.7, rotZ(a), Math.cos(a) * rm, Math.sin(a) * rm, 0);
  }
  for (let x = -R - pw; x < R + pw; x += 1.6) stoneBlock(b, rng, 1.6, 0.8, 1.9, null, x + 0.8, R + 1.85, 0);
  b.obs = [[-R - 0.75, -10, 0, -R - 0.75, 0, 0, 0.85], [R + 0.75, -10, 0, R + 0.75, 0, 0, 0.85]];
  for (let k = 0; k < 6; k++) { const a0 = Math.PI * k / 6, a1 = Math.PI * (k + 1) / 6, rm = R + 0.75; b.obs.push([Math.cos(a0) * rm, Math.sin(a0) * rm, 0, Math.cos(a1) * rm, Math.sin(a1) * rm, 0, 0.8]); }
  b.obs.push([-R - 1.5, R + 1.85, 0, R + 1.5, R + 1.85, 0, 0.55]);
  b.label = 'Roman arch';
  return b.build();
}
function gateTrilithon(seed, R) {
  const b = new Builder(), rng = mulberry32(seed), Hp = 10;
  for (const sd of [-1, 1]) stoneBlock(b, rng, 1.5, Hp + R * 0.95, 1.4, rotZ(sd * 0.02), sd * (R + 0.75), (-Hp + R * 0.95) / 2, 0);
  stoneBlock(b, rng, 2 * R + 3.8, 1.3, 1.6, rotZ((rng() - 0.5) * 0.03), 0, R * 0.95 + 0.8, 0);
  b.obs = [[-R - 0.75, -10, 0, -R - 0.75, R * 0.95, 0, 0.85], [R + 0.75, -10, 0, R + 0.75, R * 0.95, 0, 0.85], [-R - 1.9, R * 0.95 + 0.8, 0, R + 1.9, R * 0.95 + 0.8, 0, 0.75]];
  b.label = 'Trilithon gate';
  return b.build();
}
function gateTorii(seed, R) {
  const b = new Builder(), Hp = 10, col = [0.45, 0.2, 0.14];
  for (const sd of [-1, 1]) {
    const v0 = b.vc;
    b.lathe(12, 6, (v) => [0.42 - 0.06 * v, -Hp + v * (Hp + R + 1.2)], null, (v, a, x, y, z, o) => { o[3] = col[0]; o[4] = col[1]; o[5] = col[2]; o[6] = GROW; });
    b.xform(v0, I3, sd * (R + 0.6), 0, 0);
  }
  const top = [], W = R + 2.8;
  for (let k = 0; k <= 10; k++) { const x = -W + (2 * W * k) / 10, t = Math.abs(x) / W; top.push([x, R + 2.0 + 0.5 * t ** 3, 0]); }
  b.tube(top, top.map((p, k) => 0.42 - 0.08 * Math.abs(k - 5) / 5), 6, (v, a, x, y, z, o) => { o[3] = 0.12; o[4] = 0.1; o[5] = 0.09; o[6] = GROW; }, { cap: true });
  b.box(2 * R + 2.6, 0.45, 0.5, null, 0, R + 0.9, 0, col, [GROW, 0]);
  b.obs = [[-R - 0.6, -10, 0, -R - 0.6, R + 2, 0, 0.5], [R + 0.6, -10, 0, R + 0.6, R + 2, 0, 0.5], [-R - 2.8, R + 2.1, 0, R + 2.8, R + 2.1, 0, 0.5]];
  b.label = 'Torii gate';
  return b.build();
}

function wall(seed, len = 8) {
  const b = new Builder(), rng = mulberry32(seed), courses = 3 + Math.floor(rng() * 3);
  for (let c = 0; c < courses; c++) {
    let x = -len / 2 + (c % 2) * 0.5;
    while (x < len / 2) {
      const w = 0.9 + rng() * 0.8, gone = c > 0 && rng() < 0.12 + c * 0.12 + 0.25 * sstep(0, len / 2, Math.abs(x + Math.sin(seed) * 2));
      if (!gone) {
        const k = 0.85 + 0.2 * rng();
        b.box(Math.min(w, len / 2 - x) - 0.04, 0.68, 0.9, rotY((rng() - 0.5) * 0.06), x + Math.min(w, len / 2 - x) / 2, 0.35 + c * 0.7, (rng() - 0.5) * 0.06, STONE.map((v) => v * k), [GROW, 0]);
      }
      x += w;
    }
  }
  return b.build();
}

function pyramid(seed) {
  const b = new Builder(), rng = mulberry32(seed * 53), tiers = 3 + Math.floor(rng() * 5), base = 14 + rng() * 12, th = 1.6 + rng() * 0.9;
  for (let t = 0; t < tiers; t++) {
    const w = base * (1 - t / (tiers + 1.3)), y = t * th;
    const k = 0.8 + 0.2 * rng();
    b.box(w, th, w, rotY((rng() - 0.5) * 0.02), (rng() - 0.5) * 0.2, y + th / 2, (rng() - 0.5) * 0.2, STONE.map((c) => c * k), [GROW, 0]);
    // block seams: a ledge course
    b.box(w + 0.3, 0.25, w + 0.3, null, 0, y + th - 0.12, 0, STONE.map((c) => c * 0.75), [GROW, 0]);
  }
  // stairway up the +z face
  const H = tiers * th, run = base * 0.5;
  for (let k = 0; k < tiers * 5; k++) {
    const t = k / (tiers * 5), y = t * H, z = run - t * (run - base / (2 * (tiers + 1.3)) * 1.0);
    if (rng() < 0.1) continue;
    b.box(3.2, 0.42, 0.9, rotY((rng() - 0.5) * 0.05), 0, y + 0.21, z, STONE.map((c) => c * 0.95), [GROW, 0]);
  }
  // shrine on top
  const tw = base * (1 - (tiers - 1) / (tiers + 1.3)) * 0.55, ty = H;
  b.box(tw, 2.6, 0.6, null, 0, ty + 1.3, -tw / 2, STONE, [GROW, 0]);
  for (const sd of [-1, 1]) b.box(0.6, 2.6, tw, null, sd * tw / 2, ty + 1.3, 0, STONE, [GROW, 0]);
  for (const sd of [-1, 1]) b.box(tw * 0.32, 2.6, 0.6, null, sd * tw * 0.34, ty + 1.3, tw / 2, STONE, [GROW, 0]);
  b.box(tw + 0.8, 0.5, tw + 0.8, null, 0, ty + 2.85, 0, STONE.map((c) => c * 0.9), [GROW, 0]);
  return b.build();
}

function head(seed) {
  const b = new Builder();
  const hr = mulberry32(seed * 31), wk = 0.5 + hr() * 0.25, hk = 0.85 + hr() * 0.4, nk = 0.15 + hr() * 0.25;
  b.blob(5, (x, y, z, o) => {
    let px = x * wk, py = y * hk, pz = z * 0.55;
    if (py < -0.75) py = -0.75 - (py + 0.75) * 0.1;
    if (py > 0.8) py = 0.8 + (py - 0.8) * 0.3; // flat top
    let dark = 0;
    if (z > 0) {
      const f = z;
      pz += 0.12 * f * sstep(0.25, 0.4, y) * sstep(0.62, 0.45, y);            // brow ridge
      const nose = Math.exp(-(x * x) / 0.012) * sstep(-0.05, 0.25, y) * sstep(0.45, 0.3, y);
      pz += nk * nose * f;
      const eye = Math.exp(-((Math.abs(x) - 0.22) ** 2 + (y - 0.25) ** 2) / 0.006);
      pz -= 0.06 * eye; dark += eye * 0.5;
      const mouth = Math.exp(-(x * x) / 0.05) * Math.exp(-((y + 0.18) ** 2) / 0.002);
      pz -= 0.04 * mouth; dark += mouth * 0.4;
      pz += 0.1 * f * sstep(-0.3, -0.45, y) * sstep(-0.7, -0.5, y);           // chin / jaw
    }
    const ear = Math.exp(-((Math.abs(z) - 0.0) ** 2) / 0.02) * sstep(0.5, 0.95, Math.abs(x)) * sstep(-0.2, 0.1, y) * sstep(0.6, 0.4, y);
    px *= 1 + 0.12 * ear;
    const d = 1 + 0.03 * fbm3(x * 4, y * 4, z * 4, 2, seed);
    o[0] = px * d; o[1] = (py + 0.76) * d; o[2] = pz * d;
    const c = (0.8 + 0.15 * vn3(x * 5, y * 5, z * 5, seed)) * (1 - dark);
    o[3] = STONE[0] * c * 0.85; o[4] = STONE[1] * c * 0.85; o[5] = STONE[2] * c * 0.85; o[6] = GROW; o[7] = 0;
  });
  return b.build();
}

function amphora(seed) {
  const b = new Builder(), rng = mulberry32(seed * 41);
  const col = [[0.5, 0.3, 0.2], [0.58, 0.38, 0.24], [0.42, 0.25, 0.18], [0.6, 0.45, 0.32]][seed % 4];
  const H = 0.75 + rng() * 0.35, belly = 0.16 + rng() * 0.12, bp = 0.5 + rng() * 0.2, neck = 0.05 + rng() * 0.04;
  const prof = (v) => {
    if (v < 0.1) return [0.04 + v * 0.5 * (1 + rng() * 0), v * H];
    if (v < bp + 0.1) return [0.08 + belly * Math.sin(((v - 0.1) / bp) * Math.PI * 0.85), v * H];
    if (v < 0.9) return [neck + 0.06 * (1 - (v - bp - 0.1) / (0.8 - bp)), v * H];
    return [neck + 0.015, v * H];
  };
  b.lathe(10, 12, prof, null, (v, a, x, y, z, o) => { const c = 0.7 + 0.3 * v; o[3] = col[0] * c; o[4] = col[1] * c; o[5] = col[2] * c; o[6] = 0.4; });
  for (const sd of [-1, 1]) {
    const pts = [[sd * 0.08, 0.78, 0], [sd * 0.19, 0.76, 0], [sd * 0.2, 0.62, 0], [sd * 0.15, 0.54, 0]];
    b.tube(pts, [0.02, 0.02, 0.02, 0.02], 4, (v, a, x, y, z, o) => { o[3] = col[0]; o[4] = col[1]; o[5] = col[2]; o[6] = 0.4; });
  }
  return b.build();
}

// wide-mouthed urn with a lip and a fallen lid
function urn(seed) {
  const b = new Builder(), rng = mulberry32(seed * 43), col = [0.55, 0.42, 0.3], H = 0.5 + rng() * 0.3, W = 0.2 + rng() * 0.1;
  b.lathe(12, 8, (v) => [W * (0.55 + 0.5 * Math.sin(v * Math.PI * 0.95)) + (v > 0.92 ? 0.03 : 0), v * H], null, (v, a, x, y, z, o) => { const c = 0.7 + 0.35 * v; o[3] = col[0] * c; o[4] = col[1] * c; o[5] = col[2] * c; o[6] = 0.5; });
  b.lathe(12, 2, (v) => [W * 0.7 * (1 - v * 0.6), H - v * H * 0.4], null, (v, a, x, y, z, o) => { o[3] = 0.12; o[4] = 0.09; o[5] = 0.07; }, { flip: true });
  const t = b.build(); t.label = 'Urn'; return t;
}
// big storage jar, half buried
function pithos(seed) {
  const b = new Builder(), col = [0.52, 0.34, 0.24], H = 1.4 + (seed % 2) * 0.4;
  b.lathe(16, 10, (v) => [0.18 + 0.4 * Math.sin(v * Math.PI * 0.9) + 0.03 * Math.sin(v * 30), v * H], (a, v) => 1 + 0.03 * vn3(Math.cos(a) * 2, v * 4, Math.sin(a) * 2, seed),
    (v, a, x, y, z, o) => { const band = Math.abs(Math.sin(v * 30)) > 0.92 ? 0.8 : 1; o[3] = col[0] * band; o[4] = col[1] * band; o[5] = col[2] * band; o[6] = 0.7; });
  const t = b.build(); t.label = 'Storage jar (pithos)'; return t;
}
// fragment of a monumental stair
function steps(seed) {
  const b = new Builder(), rng = mulberry32(seed * 47), n = 3 + Math.floor(rng() * 5), W = 2.5 + rng() * 3;
  for (let k = 0; k < n; k++) {
    for (let x = -W / 2; x < W / 2; x += 0.8 + rng() * 0.6) {
      if (rng() < 0.12) continue;
      stoneBlock(b, rng, 0.75 + rng() * 0.4, 0.32, 0.7, rotY((rng() - 0.5) * 0.06), x + 0.4, 0.16 + k * 0.32, -k * 0.6 + (rng() - 0.5) * 0.05);
    }
  }
  const t = b.build(); t.label = 'Temple steps'; return t;
}

function slab(seed, w, d) {
  const b = new Builder(), rng = mulberry32(seed);
  stoneBlock(b, rng, w, 0.25, d, null, 0, 0.04, 0, STONE.map((c) => c * 0.95));
  return b.build();
}

export function initRuins() {
  T.colStyle = {};
  let sd = 1;
  for (const k of COL_STYLE_KEYS) {
    T.colStyle[k] = {
      intact: [column(sd++, k, { H: 5.5 + (sd % 3) }), column(sd++, k, { H: 6.5 + (sd % 4) * 0.6 })],
      broken: [0.25, 0.45, 0.7].map((f) => column(sd++, k, { H: 6.5, broken: f + ((sd * 0.13) % 0.12) })),
      drum: [drum(sd++, k), drum(sd++, k), drum(sd++, k)],
      cap: [capitalPiece(sd++, k)],
    };
  }
  T.column = COL_STYLE_KEYS.flatMap((k) => T.colStyle[k].intact);
  T.columnBroken = COL_STYLE_KEYS.flatMap((k) => T.colStyle[k].broken);
  T.drum = COL_STYLE_KEYS.flatMap((k) => T.colStyle[k].drum);
  T.gate = [[4.4, 5.1, 5.8].map((R, i) => gateArch(10 + i, R)), [4.4, 5.1, 5.8].map((R, i) => gateTrilithon(20 + i, R)), [4.6, 5.4].map((R, i) => gateTorii(30 + i, R))];
  T.wall = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => wall(s, 4 + (s % 4) * 1.6));
  T.pyramid = [1, 2, 3, 4].map(pyramid);
  T.head = vary([1, 2, 3, 4, 5, 6].map(head), 2, 81, { disp: 0.04, bend: 0.04, twist: 0.1 });
  T.figure = Array.from({ length: 40 }, (_, i) => statue(i + 1));
  T.amphora = [1, 2, 3, 4, 5, 6].map(amphora);
  T.urn = [1, 2, 3].map(urn);
  T.pithos = [1, 2].map(pithos);
  T.steps = [1, 2, 3, 4].map(steps);
  T.slab = [slab(1, 1.1, 0.8), slab(2, 0.8, 0.8), slab(3, 1.4, 0.7)];
  T.block = [1, 2].map((sd) => { const b = new Builder(); stoneInto(b, { sx: 1.2, sy: 0.7, sz: 0.9, p: 5, rough: 0.08, seed: sd, detail: 2, col: STONE, growth: GROW }); b.xform(0, I3, 0, 0.3, 0); return b.build(); });
}

// ---------- layout ----------
const S = {};
function specs() {
  if (S.rock) return S;
  const st = tintFrom(STONES, 0.1);
  Object.assign(S, {
    rock: { tpl: T.rocks, scale: [0.4, 1.4], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.5, tint: tintFrom([[0.55, 0.52, 0.47]]) },
    block: { tpl: T.block, scale: [0.7, 1.4], follow: 0.7, tilt: 0.5, sink: 0.15, tint: st },
    drum: { tpl: T.drum, scale: [0.9, 1.1], follow: 0.9, sink: 0.12, tint: st },
    urn: { tpl: [...T.urn, ...T.pithos], scale: [0.9, 1.3], follow: 0.6, tilt: 0.5, sink: 0.25, tint: tintFrom([[1, 1, 1], [0.85, 0.9, 1]]) },
    steps: { tpl: T.steps, scale: [0.9, 1.2], follow: 0.8, sink: 0.12, tint: tintFrom([[1, 1, 1], [1.2, 1.0, 0.75], [0.6, 0.6, 0.65]]) },
    amphora: { tpl: T.amphora, scale: [0.9, 1.3], follow: 0.6, tilt: 0.6, sink: 0.15, tint: tintFrom([[1, 1, 1], [0.8, 0.85, 0.9]]) },
    colB: { tpl: T.columnBroken, scale: [0.9, 1.1], follow: 0.05, tint: st },
    head: { tpl: T.head, scale: [1.6, 2.6], follow: 0.3, tilt: 0.25, sink: 0.15, tint: st },
    figure: { tpl: T.figure, scale: [0.9, 1.5], follow: 0.1, tint: st },
    sponge: { tpl: T.tubeSp, scale: [0.5, 1.1], follow: 0.5, tint: tintFrom([[0.65, 0.3, 0.12], [0.5, 0.18, 0.5], [0.7, 0.6, 0.15]]) },
    soft: { tpl: T.soft, scale: [0.5, 1.1], follow: 0.4, sway: true, tint: tintFrom([[0.75, 0.25, 0.4], [0.75, 0.38, 0.1]]) },
    fan: { tpl: T.fan, scale: [0.6, 1.4], follow: 0.2, sway: true, tint: tintFrom([[0.5, 0.15, 0.55], [0.7, 0.1, 0.12], [0.75, 0.55, 0.12]]) },
    anem: { tpl: T.anem, scale: [0.7, 1.2], follow: 0.7, sway: true, tint: tintFrom([[0.8, 0.8, 0.8]]) },
    urchin: { tpl: T.urchin, scale: [0.06, 0.1], follow: 0.8, tint: tintFrom([[0.4, 0.3, 0.45]]) },
    brain: { tpl: T.brain, scale: [0.3, 0.8], follow: 0.7, tint: tintFrom([[0.45, 0.4, 0.25], [0.35, 0.42, 0.25]]) },
  });
  Object.assign(S, {
    bendCol: { tpl: [...T.column, ...T.figure], scale: [1.0, 1.25], follow: 0.05, tint: st },
    rubble: { tpl: T.rubble, scale: [0.9, 1.8], follow: 1, sink: 0.02, tint: tintFrom([[0.75, 0.72, 0.65], [0.65, 0.62, 0.56]], 0.1) },
    algae: { tpl: T.algae, scale: [0.6, 1.5], follow: 1, sink: 0.01, tint: tintFrom([[0.6, 0.7, 0.4], [0.75, 0.55, 0.45]], 0.12) },
    lump: { tpl: T.spongeLump, scale: [0.8, 1.6], follow: 0.7, tint: tintFrom([[0.85, 0.5, 0.15], [0.7, 0.25, 0.55], [0.8, 0.75, 0.2]]) },
  });
  S.micro = [{ w: 3, spec: S.rubble }, { w: 1.6, spec: S.algae }, { w: 1.2, spec: S.lump }];
  S.scatter = [
    { w: 2.5, k: 'block' }, { w: 0.9, k: 'urn' }, { w: 0.5, k: 'steps' }, { w: 1.5, k: 'drum' }, { w: 2, k: 'amphora' }, { w: 1.2, k: 'rock' }, { w: 1.5, k: 'sponge' },
    { w: 1.2, k: 'soft', sway: true }, { w: 1.2, k: 'fan', sway: true }, { w: 0.8, k: 'anem', sway: true }, { w: 1, k: 'urchin' }, { w: 1, k: 'brain' },
    { w: 0.25, k: 'head' }, { w: 0.3, k: 'figure' },
  ];
  return S;
}

const pathYaw = (ctx, s) => Math.atan2(-(ctx.pathX(s + 3) - ctx.pathX(s - 3)), 6);
const layouts = new Map();
function segmentLayout(ctx, seg) {
  let L = layouts.get(seg.id);
  if (L && L.seed === seg.seed) return L;
  const rng = mulberry32(seg.seed ^ 0x2a1);
  const gates = [], temples = [];
  for (let s = seg.start + 120 + rng() * 60; s < seg.end - 100; s += 85 + rng() * 110) {
    const fam = rng.pick(T.gate), tpl = fam[(rng() * fam.length) | 0];
    const R = mul3(rotY(pathYaw(ctx, s)), rotZ((rng() - 0.5) * 0.04));
    const x = ctx.pathX(s), y = ctx.pathY(s) - 0.15;
    if (!pointsClear(ctx, placedPoints(tpl, x, y, s, R, 1, 1, 1, 300), 0.45)) continue;
    gates.push({ tpl, x, y, s, R, sMax: s + 1.5 });
  }
  for (let s = seg.start + 160 + rng() * 100; s < seg.end - 140; s += 180 + rng() * 200) {
    const side = rng() < 0.5 ? -1 : 1, d = 30 + rng() * 14;
    temples.push({ s, side, d, seed: (rng() * 1e9) | 0, sMax: s + 16 });
  }
  L = { seed: seg.seed, gates, temples };
  layouts.set(seg.id, L);
  if (layouts.size > 24) layouts.delete(layouts.keys().next().value);
  return L;
}

function temple(ctx, fs, st, sw, t) {
  const rng = mulberry32(t.seed), sp = specs();
  const x = ctx.pathX(t.s) + t.side * t.d, y = fs.at(x, t.s);
  const tpl = rng.pick(T.pyramid), sc = 0.75 + rng() * 0.45;
  const R = rotY(pathYaw(ctx, t.s) + (t.side > 0 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.3);
  const gy = groundY(fs, x, t.s, tpl, R, sc, sc, sc) - 0.35;
  if (pointsClear(ctx, placedPoints(tpl, x, gy, t.s, R, sc, sc, sc, 200), 1)) { st.add(tpl, x, gy, -(t.s - ctx.s0), R, sc, sc, sc, 1, 1, 1, 1); st.items[st.items.length - 1].g = 1; }
  // flanking statues and columns along the approach toward the path
  for (let k = 0; k < 4; k++) {
    const along = (k % 2 ? -1 : 1) * (5 + rng() * 3), toward = -t.side * (8 + k * 3.5);
    const sx = x + toward, ss = t.s + along;
    putFloor(ctx, fs, st, rng() < 0.6 ? sp.head : sp.figure, sx, ss, rng);
  }
  for (let k = 0; k < 8; k++) {
    const sx = x - t.side * (10 + (k >> 1) * 4), ss = t.s + (k % 2 ? -9 : 9);
    putFloor(ctx, fs, st, rng() < 0.5 ? { tpl: T.column, scale: [1, 1], follow: 0.05, tint: tintFrom([[1, 1, 1]]) } : sp.colB, sx, ss, rng);
  }
}

export function layoutRuins(ctx) {
  if (presence(ctx, 'ruins') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
  const st = new Batch(MAT.static, 115000 * budgetK(ctx, 'ruins')), sw = new Batch(MAT.sway, 25000 * budgetK(ctx, 'ruins'));
  const idx = Math.floor(ctx.s0 / 64);
  for (const seg of ctx.segments) {
    if (seg.key !== 'ruins') continue;
    const L = segmentLayout(ctx, seg);
    for (const g of L.gates) if (Math.floor(g.sMax / 64) === idx) st.add(g.tpl, g.x, g.y, -(g.s - ctx.s0), g.R, 1, 1, 1, 0.95 + rng() * 0.1, 0.95 + rng() * 0.1, 0.95 + rng() * 0.1, 1);
    for (const t of L.temples) if (Math.floor(t.sMax / 64) === idx) temple(ctx, fs, st, sw, t);
  }
  // colonnade avenue lining the path + paved road
  const step = 4.6, off = 6.6;
  for (let s = Math.ceil(ctx.s0 / step) * step; s < ctx.s1; s += step) {
    const w = ctx.weightOf(s, 'ruins');
    const av = noise1(s / 160, 711);
    if (w <= 0) continue;
    const px = ctx.pathX(s), yaw = pathYaw(ctx, s);
    if (av > -0.15) for (const sd of [-1, 1]) {
      const h = noise1(s / 7.3 + sd * 11, 712);
      if (rng() > w || h < -0.55) continue;
      const x = px + sd * (off + (rng() - 0.5) * 0.3);
      const y = fs.at(x, s);
      // style changes every ~24 m, and individual pillars are often salvaged from other orders/stone
      const blk = Math.floor(s / 24);
      const set = T.colStyle[COL_STYLE_KEYS[((rng() < 0.35 ? rng() : hash2i(blk, 0, 715)) * COL_STYLE_KEYS.length) | 0]];
      const sc = STONES[((rng() < 0.3 ? rng() : hash2i(blk, 1, 716)) * STONES.length) | 0];
      const k = 0.85 + rng() * 0.28, hs = 0.75 + rng() * 0.5, ws = 0.8 + rng() * 0.45, tint = tintFrom([[sc[0] * k, sc[1] * k, sc[2] * k]], 0.08);
      const fate = rng();
      if (fate < 0.32) { // toppled: 2-4 drums in a line along the fall, capital lying apart
        const fa = yaw + sd * Math.PI / 2 + (rng() - 0.5) * 1.6 + (rng() < 0.3 ? Math.PI / 2 : 0), n = 2 + Math.floor(rng() * 3);
        let d = 0.6;
        for (let q = 0; q < n; q++) {
          const dt = rng.pick(set.drum), L = (dt.box[3] - dt.box[0]) * ws;
          d += L * 0.5;
          const px2 = x + Math.cos(fa) * d, ps2 = s + Math.sin(fa) * d;
          d += L * 0.5 + 0.05 + rng() * 0.6;
          putFloor(ctx, fs, st, { tpl: dt, scale: [ws, ws], ys: [0.95, 1.05], xz: 0.1, yaw: fa, yawJ: 0.35, follow: 0.85, tilt: 0.06, sink: 0.12 + rng() * 0.12, tint, grow: [0.3, 1.6] }, px2, ps2, rng);
        }
        putFloor(ctx, fs, st, { tpl: set.cap, scale: [ws, ws], yaw: rng() * TAU, follow: 0.8, tilt: 0.2, sink: 0.1, tint, grow: [0.3, 1.6] }, x + Math.cos(fa) * (d + 0.8), s + Math.sin(fa) * (d + 0.8), rng);
        putFloor(ctx, fs, st, { tpl: rng.pick(set.broken), scale: [ws, ws], ys: [0.25, 0.45], follow: 0.1, tilt: 0.05, tint }, x, s, rng); // stump
        continue;
      }
      const tpl = h > 0.1 || fate < 0.45 ? rng.pick(set.intact) : rng.pick(set.broken);
      let R = rotY(yaw + (rng() - 0.5) * 0.4), sink = 0.15;
      if (fate < 0.45) { // leaning 10-30 deg, away from the path, partly sunk
        R = mul3(rotY(yaw + (rng() - 0.5) * 0.3), rotZ(-sd * (0.17 + rng() * 0.35)));
        sink = 0.3 + rng() * 0.5;
      }
      const gy = groundY(fs, x, s, tpl, R, ws, hs, ws) - sink;
      if (!pointsClear(ctx, placedPoints(tpl, x, gy, s, R, ws, hs, ws, 120), 0.4)) continue;
      st.add(tpl, x, gy, -(s - ctx.s0), R, ws, hs, ws, sc[0] * k, sc[1] * k, sc[2] * k, rng() * 1.6);
      st.items[st.items.length - 1].g = 1;
      if (h < 0.1 && rng() < 0.5) putFloor(ctx, fs, st, sp.drum, x + sd * (1.5 + rng() * 2), s + (rng() - 0.5) * 3, rng);
    }
    if (noise1(s / 120, 713) > -0.25) {
      const roadOff = 1.5 * noise1(s / 60, 714);
      for (let k = -2; k <= 2; k++) for (let q = 0; q < 5; q++) {
        if (rng() < 0.18 + 0.2 * Math.abs(k) / 2) continue;
        const ss = s + (q / 5) * step + (rng() - 0.5) * 0.15, x = ctx.pathX(ss) + roadOff + k * 0.95 + (q % 2) * 0.45;
        const tpl = rng.pick(T.slab), y = fs.at(x, ss);
        if (ctx.pathY(ss) - y < 3.9 && Math.abs(x - ctx.pathX(ss)) < 4.5) continue;
        const R = orient(fs.nx, fs.ny, fs.nz, 1, yaw + (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04);
        const gy = groundY(fs, x, ss, tpl, R, 0.95, 1, 0.95) - 0.05;
        st.add(tpl, x, gy, -(ss - ctx.s0), R, 0.95, 1, 0.95, 0.85 + rng() * 0.2, 0.85 + rng() * 0.2, 0.82 + rng() * 0.2, 1);
        st.items[st.items.length - 1].g = 1;
      }
    }
  }
  // building foundations on the terraces: rectangles of walls
  for (let k = 0; k < 6; k++) {
    const p = spot(ctx, rng, 12, 45, 1);
    if (rng() > ctx.weightOf(p.s, 'ruins')) continue;
    const yaw = pathYaw(ctx, p.s) + (rng() < 0.5 ? 0 : 0.5) * (rng() - 0.5), W = 7 + rng() * 5, D = 6 + rng() * 5;
    const sides = [[0, D / 2, 0], [0, -D / 2, 0], [W / 2, 0, Math.PI / 2], [-W / 2, 0, Math.PI / 2]];
    for (const [ox, oz, ry] of sides) {
      if (rng() < 0.25) continue;
      const c = Math.cos(yaw), s2 = Math.sin(yaw);
      const x = p.x + c * ox + s2 * oz, s = p.s - (-s2 * ox + c * oz);
      if (s < ctx.s0 - 8 || s > ctx.s1 + 8) continue;
      const y = fs.at(x, s), tpl = rng.pick(T.wall);
      if (!tubeClear(ctx, x, s, y, y + 4, 4.5)) continue;
      const R = rotY(yaw + ry), hs = 0.9 + rng() * 0.3, gy = groundY(fs, x, s, tpl, R, 1, hs, 1) - 0.25;
      st.add(tpl, x, gy, -(s - ctx.s0), R, 1, hs, 1, 0.9 + rng() * 0.15, 0.9 + rng() * 0.15, 0.88 + rng() * 0.15, 1);
      st.items[st.items.length - 1].g = 1;
    }
  }
  for (const b of bendSpots(ctx)) if (rng() < ctx.weightOf(b.s, 'ruins') * 0.75) putBend(ctx, fs, st, sp.bendCol, b, rng);
  microDetail(ctx, fs, st, rng, 'ruins', sp.micro, 140, 30);
  const nextP466 = clusterer(ctx, rng, 0, 42, 1.2);
  for (let k = 0; k < 150; k++) {
    const p = nextP466();
    if (!p) continue;
    if (rng() > ctx.weightOf(p.s, 'ruins')) continue;
    const e = pickW(rng, sp.scatter);
    putFloor(ctx, fs, e.sway ? sw : st, sp[e.k], p.x, p.s, rng);
  }
  st.split = 3; sw.split = 1;
  return { batches: [st, sw] };
}
