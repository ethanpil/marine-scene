// Shipwrecks: procedural wooden galleons and steel freighters (holed hull skins over ribs, collapsed
// decks, broken masts / funnel / superstructure, portholes, rust & growth), optionally broken in two,
// plus aircraft and submarine wrecks and debris fields. Set pieces are anchored per segment (seg.seed)
// and built in the chunk that contains their largest s.
import { Builder, Batch, T, TAU, TUBE, sat, sstep, lerp, vn3, fbm3, floorSampler, presence, placedPoints, rotX, rotY, rotZ, mul3, orient, budgetK, bendSpots, vary, tierK, poi } from './core.js';
import { stoneInto } from './shapes.js';
import { putFloor, pickW, tintFrom, spot, putBend, microDetail, clusterer, groundY, microSteps, steps } from './scatter.js';
import { MAT } from './materials.js';
import { mulberry32 } from '../noise.js';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ---------- hull ----------
// spec: L, B, D, kind ('wood'|'steel'), seed
function hullShape(spec) {
  const { L, B, D, kind } = spec, wood = kind === 'wood';
  const w = (u) => {
    let k = Math.min(1, (wood ? 0.78 : 0.86) + (wood ? 1.83 : 1.4) * u);
    const b0 = wood ? 0.55 : 0.78;
    if (u > b0) k *= Math.pow(Math.cos(((u - b0) / (1 - b0)) * Math.PI * 0.5), wood ? 0.7 : 0.55);
    return (B / 2) * k;
  };
  const keel = (u) => (u > 0.86 ? ((u - 0.86) / 0.14) * D * (wood ? 0.45 : 0.3) : 0) + (u < 0.06 ? ((0.06 - u) / 0.06) * D * 0.3 : 0);
  const sheer = (u) => wood ? D + 1.0 * (2 * u - 1) ** 2 + (u < 0.18 ? (0.18 - u) * 9 : 0) : D + 0.6 * (2 * u - 1) ** 2 + (u > 0.88 ? (u - 0.88) * 6 : 0);
  const ex = wood ? 0.8 : 0.32;
  // point on the hull at station u, girth t (0 keel .. 1 gunwale), side +-1, inset (m)
  const P = (u, t0, side, inset = 0) => {
    const t = Math.min(1, t0), over = Math.max(0, t0 - 1);
    const phi = t * Math.PI * 0.5, k0 = keel(u), ys = sheer(u) + over * (sheer(u) - keel(u));
    let x = w(u) * Math.pow(Math.sin(phi), ex) * (wood ? 1 - 0.12 * t ** 3 : 1);
    let y = k0 + (ys - k0) * (1 - Math.pow(Math.cos(phi), ex));
    x = Math.max(0, x - inset); y += inset * (1 - t);
    return [side * x, y, L / 2 - u * L];
  };
  return { w, keel, sheer, P };
}

function holeFn(spec, rng) {
  const sd = spec.seed, zones = [];
  for (let i = 0; i < 3; i++) zones.push([rng(), 0.06 + rng() * 0.12]);
  return (u, t, side) => {
    let h = 0.5 + 0.5 * fbm3(u * 7, t * 3, side * 3.1, 2, sd) + t * t * 0.22;
    for (const [c, r] of zones) h += 0.3 * sstep(r, 0, Math.abs(u - c)) * (side > 0 ? 1 : 0.5) * sstep(0.2, 0.7, t);
    if (spec.cutLo > 0) h += 0.6 * sstep(0.08, 0, u - spec.cutLo - 0.04 * vn3(t * 5, side, 0, sd));
    if (spec.cutHi < 1) h += 0.6 * sstep(0.08, 0, spec.cutHi - u + 0.04 * vn3(t * 5, side, 1, sd));
    return h > spec.holeThr;
  };
}

function hullSkin(b, spec, H, hole, side, inner) {
  const NU = spec.nu, NT = 10, u0 = spec.cutLo, u1 = spec.cutHi;
  const v0 = b.vc, i0 = b.I.length, steel = spec.kind === 'steel';
  const cut = (u, t) => (u < u0 + 0.004 * 0 || u > u1) ? 1 : 0;
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NT; j++) {
    const u = lerp(u0, u1, i / NU), t = j / NT;
    const p = H.P(u, t, side, inner ? spec.th : 0);
    let c, f;
    if (steel) {
      const wl = p[1] / spec.D;
      c = inner ? [0.2, 0.15, 0.12] : wl < 0.45 ? [0.42, 0.17, 0.1] : wl < 0.5 ? [0.55, 0.52, 0.45] : [0.3, 0.29, 0.28];
      f = [inner ? 0.2 : 0.75, 4];
    } else {
      const plank = 0.85 + 0.2 * Math.sin(t * 60 + side);
      c = inner ? [0.2, 0.15, 0.1] : [0.42 * plank, 0.32 * plank, 0.21 * plank];
      f = [inner ? 0.3 : 0.95, 0];
    }
    const ao = inner ? 0.7 : 0.55 + 0.45 * t;
    b.v(p[0], p[1], p[2], 0, 1, 0, c[0] * ao, c[1] * ao, c[2] * ao, f[0], f[1]);
  }
  const flip = (side > 0) !== inner;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) {
    const um = lerp(u0, u1, (i + 0.5) / NU), tm = (j + 0.5) / NT;
    if (hole(um, tm, side)) continue;
    const a = v0 + i * (NT + 1) + j, bb = a + NT + 1, c = a + 1, d = bb + 1;
    // grid: i = u (dP/du ~ -z), j = t
    if (!flip) { b.t(a, c, bb); b.t(bb, c, d); } else { b.t(a, bb, c); b.t(bb, d, c); }
  }
  b.smooth(v0, i0);
}

function addRibs(b, spec, H, hole, rng) {
  const steel = spec.kind === 'steel', n = Math.round((spec.cutHi - spec.cutLo) * spec.L / (steel ? 2.2 : 1.1));
  for (let k = 0; k <= n; k++) {
    const u = lerp(spec.cutLo + 0.01, spec.cutHi - 0.01, k / Math.max(1, n));
    // does this rib stand exposed above a broken gunwale?
    const ext = hole(u, 0.95, 1) || hole(u, 0.95, -1) ? 0.15 + rng() * 0.3 : 0;
    const pts = [];
    for (let j = 10; j >= 0; j--) pts.push(H.P(u, j / 10 * (1 + (ext && j === 10 ? ext : 0)), -1, spec.th * 0.5 + 0.08));
    for (let j = 1; j <= 10; j++) pts.push(H.P(u, j / 10 * (1 + (ext && j === 10 ? ext : 0)), 1, spec.th * 0.5 + 0.08));
    const r = steel ? 0.07 : 0.11;
    b.tube(pts, pts.map(() => r), 4, (v, a, x, y, z, o) => {
      const c = steel ? [0.2, 0.12, 0.08] : [0.26, 0.19, 0.12];
      o[3] = c[0]; o[4] = c[1]; o[5] = c[2]; o[6] = 0.8; o[7] = steel ? 4 : 0;
    });
  }
  // keel
  const kp = [];
  for (let k = 0; k <= 12; k++) { const u = lerp(spec.cutLo, spec.cutHi, k / 12); const p = H.P(u, 0, 1); kp.push([0, p[1] - 0.05, p[2]]); }
  b.tube(kp, kp.map(() => (steel ? 0.15 : 0.22)), 4, (v, a, x, y, z, o) => { o[3] = 0.2; o[4] = 0.15; o[5] = 0.1; o[6] = 0.6; o[7] = steel ? 4 : 0; });
}

function addDeck(b, spec, H, rng) {
  const steel = spec.kind === 'steel', NU = Math.round(spec.nu * 0.8), NX = 6, sd = spec.seed;
  const sagC = rng(), sagW = 0.1 + rng() * 0.15, sag = 0.6 + rng() * 1.6;
  const hatch = (u, xn) => steel && Math.abs(xn) < 0.6 && [0.42, 0.56, 0.7].some((c) => Math.abs(u - c) < 0.045);
  const v0 = b.vc, i0 = b.I.length;
  const dy = (u, xn) => -sag * sstep(sagW, 0, Math.abs(u - sagC)) * (1 - xn * xn) - 0.35;
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NX; j++) {
    const u = lerp(spec.cutLo, spec.cutHi, i / NU), xn = (j / NX) * 2 - 1;
    const p = H.P(u, 1, 1, spec.th);
    const y = H.sheer(u) + dy(u, xn), c = steel ? [0.22, 0.18, 0.14] : [0.3 * (0.85 + 0.2 * Math.sin(xn * 25)), 0.23, 0.14];
    b.v(xn * p[0], y, p[2], 0, 1, 0, c[0], c[1], c[2], 0.95, steel ? 4 : 0);
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NX; j++) {
    const u = lerp(spec.cutLo, spec.cutHi, (i + 0.5) / NU), xn = ((j + 0.5) / NX) * 2 - 1;
    const broken = 0.5 + 0.5 * fbm3(u * 9, xn * 2, 7, 2, sd) + sstep(sagW * 1.3, 0, Math.abs(u - sagC)) * 0.4;
    if (broken > 0.72 || hatch(u, xn)) continue;
    const a = v0 + i * (NX + 1) + j, bb = a + NX + 1, c = a + 1, d = bb + 1;
    b.t(a, c, bb); b.t(bb, c, d); // normal up: dP/dj (+x) x dP/di (-z)... verified: (+x) x (-z) = +y
  }
  b.smooth(v0, i0);
  // underside (dark) so the deck reads from below through holes
  const v1 = b.vc, i1 = b.I.length;
  for (let k = v0; k < v1; k++) b.v(b.P[k * 3], b.P[k * 3 + 1] - 0.12, b.P[k * 3 + 2], 0, -1, 0, 0.1, 0.08, 0.06, 0.1, steel ? 4 : 0);
  for (let k = i0; k < i1; k += 3) b.t(b.I[k] - v0 + v1, b.I[k + 2] - v0 + v1, b.I[k + 1] - v0 + v1);
  b.smooth(v1, i1);
  // hatch coamings
  if (steel) for (const c of [0.42, 0.56, 0.7]) {
    if (c < spec.cutLo + 0.03 || c > spec.cutHi - 0.03) continue;
    const z = spec.L / 2 - c * spec.L, y = H.sheer(c) - 0.1, wx = H.w(c) * 0.6;
    const col = [0.2, 0.17, 0.14], f = [0.8, 4];
    b.box(wx * 2 + 0.3, 0.7, 0.25, null, 0, y, z - spec.L * 0.045, col, f);
    b.box(wx * 2 + 0.3, 0.7, 0.25, null, 0, y, z + spec.L * 0.045, col, f);
    b.box(0.25, 0.7, spec.L * 0.09, null, wx, y, z, col, f);
    b.box(0.25, 0.7, spec.L * 0.09, null, -wx, y, z, col, f);
  }
}

function addMast(b, base, h, r, lean, rng, steel) {
  const pts = [], n = Math.max(2, Math.round(h / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([base[0] + Math.sin(lean[0]) * h * t, base[1] + h * t * Math.cos(lean[0]), base[2] + Math.sin(lean[1]) * h * t]);
  }
  b.tube(pts, pts.map((p, i) => r * (1 - 0.25 * i / n)), 6, (v, a, x, y, z, o) => {
    const c = steel ? [0.2, 0.12, 0.08] : [0.28, 0.21, 0.13]; o[3] = c[0]; o[4] = c[1]; o[5] = c[2]; o[6] = 0.85; o[7] = steel ? 4 : 0;
  }, { cap: true });
  if (b.obs) b.obs.push([base[0], base[1], base[2], pts[n][0], pts[n][1], pts[n][2], r + 0.15]);
}

function buildShip(kind, seed, cutLo = 0, cutHi = 1) {
  const rng = mulberry32(seed), wood = kind === 'wood';
  const spec = wood
    ? { L: 26 + rng() * 9, B: 7.5 + rng() * 2, D: 4.8 + rng() * 1.6, kind, seed, th: 0.18, nu: 40, holeThr: 0.82 + rng() * 0.08, cutLo, cutHi }
    : { L: 40 + rng() * 12, B: 8.5 + rng() * 2, D: 6.2 + rng() * 1.6, kind, seed, th: 0.12, nu: 46, holeThr: 0.86 + rng() * 0.07, cutLo, cutHi };
  const H = hullShape(spec), hole = holeFn(spec, rng), b = new Builder();
  const zA = spec.L / 2 - cutHi * spec.L, zB = spec.L / 2 - cutLo * spec.L, hr = Math.max(spec.B / 2, spec.D * 0.5);
  b.obs = [[0, spec.D * 0.5, Math.min(zA + hr * 0.7, (zA + zB) / 2), 0, spec.D * 0.5, Math.max(zB - hr * 0.7, (zA + zB) / 2), hr]];
  for (const side of [-1, 1]) { hullSkin(b, spec, H, hole, side, false); hullSkin(b, spec, H, hole, side, true); }
  addRibs(b, spec, H, hole, rng);
  addDeck(b, spec, H, rng);
  const zAt = (u) => spec.L / 2 - u * spec.L, inside = (u) => u > cutLo + 0.02 && u < cutHi - 0.02;
  if (wood) {
    for (const u of [0.3, 0.55, 0.78]) if (inside(u) && rng() < 0.85)
    {
      const mh = H.sheer(u) - 0.6 + 1.5 + rng() * 7, lean = [(rng() - 0.5) * 0.4, (rng() - 0.5) * 0.3];
      addMast(b, [0, H.keel(u) + 0.6, zAt(u)], mh, 0.26, lean, rng, false);
      // rigging remnants: shrouds from the mast to the rails, some snapped
      const top = [Math.sin(lean[0]) * mh, H.keel(u) + 0.6 + mh * Math.cos(lean[0]) * 0.92, zAt(u) + Math.sin(lean[1]) * mh];
      for (let q = 0; q < 2 + Math.floor(rng() * 4); q++) {
        const sd = q % 2 ? 1 : -1, rail = H.P(Math.min(spec.cutHi, Math.max(spec.cutLo, u + (rng() - 0.5) * 0.06)), 1, sd), cut = rng() < 0.4 ? 0.3 + rng() * 0.5 : 1;
        const end = [lerp(top[0], rail[0], cut), lerp(top[1], rail[1], cut) - (cut < 1 ? 0.6 : 0), lerp(top[2], rail[2], cut)];
        const mid = [(top[0] + end[0]) / 2, (top[1] + end[1]) / 2 - 0.25, (top[2] + end[2]) / 2];
        b.tube([top, mid, end], [0.035, 0.035, 0.03], 3, (v, a, x, y, z, o) => { o[3] = 0.16; o[4] = 0.13; o[5] = 0.1; o[6] = 0.9; o[7] = 0; });
      }
    }
    if (inside(0.97)) addMast(b, [0, H.sheer(0.97) - 0.2, zAt(0.97)], 6, 0.18, [0, -1.0], rng, false); // bowsprit
    if (inside(0.08)) { // stern castle walls with dark windows
      const z = zAt(0.09), y = H.sheer(0.09);
      b.box(spec.B * 0.72, 2.0, 0.25, null, 0, y + 0.4, z + spec.L * 0.07, [0.3, 0.22, 0.14], [0.9, 0]);
      for (let k = -2; k <= 2; k++) b.box(0.55, 0.65, 0.08, null, k * 1.15, y + 0.55, z + spec.L * 0.07 + 0.14, [0.03, 0.03, 0.03], [0, 0]);
    }
    // gun ports
    for (let k = 0; k < 9; k++) {
      const u = 0.18 + k * 0.075;
      if (!inside(u)) continue;
      for (const side of [-1, 1]) {
        if (hole(u, 0.8, side)) continue;
        const p = H.P(u, 0.8, side);
        b.box(0.12, 0.5, 0.55, null, p[0] + side * 0.02, p[1], p[2], [0.03, 0.025, 0.02], [0, 0]);
      }
    }
  } else {
    // superstructure (bridge aft), funnel, derrick posts, portholes
    const u0 = 0.1, u1 = 0.26;
    if (inside(u0) && inside(u1)) {
      const zc = (zAt(u0) + zAt(u1)) / 2, len = (u1 - u0) * spec.L, y0 = H.sheer(0.18) - 0.2;
      for (let tier = 0; tier < 3; tier++) {
        const w = spec.B * (0.85 - tier * 0.12), l = len * (1 - tier * 0.18), y = y0 + tier * 2.4 + 1.2;
        const v0 = b.vc;
        stoneInto(b, { sx: w, sy: 2.4, sz: l, p: 10, rough: 0.015, seed: seed + tier, detail: 3, col: [0.55, 0.53, 0.48], growth: 0.7, mode: 4 });
        b.xform(v0, I3, 0, y, zc + tier * 0.6);
        for (let k = 0; k < 7; k++) for (const sd of [-1, 1]) {
          b.box(0.06, 0.55, 0.7, null, sd * (w / 2 + 0.02), y + 0.35, zc + tier * 0.6 - l / 2 + (k + 0.5) * l / 7, [0.02, 0.025, 0.03], [0, 4]);
        }
        b.box(w * 0.8, 0.55, 0.06, null, 0, y + 0.35, zc + tier * 0.6 - l / 2 - 0.02, [0.02, 0.025, 0.03], [0, 4]);
      }
      const fv = b.vc;
      b.lathe(14, 4, (v) => [1.0 + 0.1 * v, v * 4.2], null, (v, a, x, y, z, o) => { o[3] = 0.25; o[4] = 0.1; o[5] = 0.06; o[6] = 0.5; o[7] = 4; });
      b.xform(fv, rotX(0.25 + rng() * 0.35), 0, y0 + 7.5, zc + 1.5, 1, 1, 1.4);
      b.obs.push([0, y0 + 3.5, zc - len / 2 + spec.B * 0.4, 0, y0 + 3.5, zc + len / 2 - spec.B * 0.4, spec.B * 0.45], [0, y0 + 8, zc + 1.5, 0, y0 + 11, zc + 2.5, 1.3]);
    }
    for (const u of [0.49, 0.63, 0.77]) if (inside(u) && rng() < 0.8) {
      addMast(b, [0, H.sheer(u) - 0.5, zAt(u)], 3 + rng() * 6, 0.22, [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.4], rng, true);
    }
    for (let k = 0; k < 18; k++) {
      const u = 0.3 + k * 0.03;
      if (!inside(u)) continue;
      for (const side of [-1, 1]) {
        if (hole(u, 0.9, side)) continue;
        const p = H.P(u, 0.9, side);
        b.box(0.1, 0.32, 0.32, null, p[0] + side * 0.03, p[1], p[2], [0.03, 0.03, 0.035], [0, 4]);
      }
    }
  }
  return b.build();
}

// ---------- aircraft & submarine ----------
function airplane(seed, brokenWing) {
  const b = new Builder(), rng = mulberry32(seed), col = [0.32, 0.34, 0.33], f = [0.7, 4];
  const L = 13;
  const v0 = b.vc;
  b.lathe(14, 12, (v) => [1.05 * Math.pow(Math.sin(Math.min(1, v * 1.25 + 0.06) * Math.PI * 0.62), 0.9) * (1 - 0.65 * sstep(0.55, 1, v)) + 0.05, v * L],
    null, (v, a, x, y, z, o) => { o[3] = col[0]; o[4] = col[1]; o[5] = col[2]; o[6] = 0.7; o[7] = 4; });
  b.xform(v0, rotX(Math.PI / 2), 0, 1.05, -L * 0.35); // nose toward -z
  // canopy
  const cv = b.vc;
  b.blob(2, (x, y, z, o) => { o[0] = x * 0.55; o[1] = Math.max(0, y) * 0.55; o[2] = z * 1.6; o[3] = 0.05; o[4] = 0.06; o[5] = 0.07; o[7] = 4; });
  b.xform(cv, I3, 0, 1.95, -L * 0.25);
  // wings (thin tapered slabs) with engines
  const wing = (side, span) => {
    const w0 = b.vc, i0 = b.I.length;
    for (const top of [1, -1]) b.grid(8, 3, (u, v, i, j, o) => {
      const x = side * (0.8 + u * span), chord = lerp(2.8, 1.3, u), z = -L * 0.12 + (v - 0.3) * chord + u * 0.4;
      const th = 0.22 * (1 - 0.6 * u) * Math.sin(v * Math.PI) * top;
      o[0] = x; o[1] = 0.9 + th + u * 0.35; o[2] = z; o[3] = col[0]; o[4] = col[1]; o[5] = col[2]; o[6] = 0.8; o[7] = 4;
    }, { flip: (top > 0) !== (side > 0), smooth: false });
    b.smooth(w0, i0);
    const ev = b.vc; // engine nacelle + prop
    b.lathe(10, 4, (v) => [0.55 * Math.sin(Math.min(1, v * 1.4 + 0.15) * Math.PI * 0.6) + 0.05, v * 3.2], null, (v, a, x, y, z, o) => { o[3] = 0.26; o[4] = 0.27; o[5] = 0.27; o[6] = 0.6; o[7] = 4; });
    b.xform(ev, rotX(Math.PI / 2), side * 3.2, 0.9, -L * 0.12 - 1.4);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + rng(), bend = 0.6 * rng();
      b.box(0.12, 1.5, 0.03, mul3(rotZ(a), rotX(bend)), side * 3.2 + Math.cos(a + Math.PI / 2) * 0.75, 0.9 + Math.sin(a + Math.PI / 2) * 0.75, -L * 0.12 - 1.7, [0.2, 0.2, 0.2], [0.4, 4]);
    }
  };
  wing(-1, 7.5); wing(1, brokenWing ? 3.4 : 7.5);
  b.obs = [[0, 1.05, -L * 0.3, 0, 1.05, L * 0.6, 1.25], [-8, 1.1, -L * 0.12, brokenWing ? 4 : 8, 1.1, -L * 0.12, 0.6], [0, 2.4, L * 0.62, 0, 3.2, L * 0.62, 1]];
  // tail
  for (const side of [-1, 1]) b.box(3.4, 0.12, 1.3, rotY(side * 0.15), side * 1.7, 1.55, L * 0.62, col, f);
  b.box(0.14, 2.4, 1.6, rotX(-0.3), 0, 2.6, L * 0.62, col, f);
  return b.build();
}

function submarine(seed) {
  const b = new Builder(), col = [0.17, 0.17, 0.18], L = 38, R = 2.6;
  const v0 = b.vc;
  b.lathe(16, 16, (v) => [R * Math.pow(Math.sin(Math.min(1, v) * Math.PI), 0.32) * (v > 0.75 ? 1 - 0.55 * ((v - 0.75) / 0.25) ** 1.5 : 1) + 0.04, v * L],
    null, (v, a, x, y, z, o) => { const ao = 0.6 + 0.4 * Math.max(0, Math.sin(a)); o[3] = col[0] * ao; o[4] = col[1] * ao; o[5] = col[2] * ao; o[6] = 0.8; o[7] = 4; });
  b.xform(v0, rotX(Math.PI / 2), 0, R, -L * 0.5);
  const sv = b.vc; // sail
  stoneInto(b, { sx: 1.8, sy: 4, sz: 6.5, p: 4, rough: 0.02, seed, detail: 3, col: [0.18, 0.18, 0.19], growth: 0.8, mode: 4 });
  b.xform(sv, I3, 0, R * 2 + 1.4, -L * 0.12);
  b.box(4.6, 0.12, 1.1, null, 0, R * 2 + 1.8, -L * 0.1, col, [0.7, 4]); // sail planes
  b.box(5.8, 0.14, 1.4, null, 0, R, L * 0.45, col, [0.7, 4]); // stern planes
  b.box(0.16, 3.6, 1.6, null, 0, R, L * 0.47, col, [0.7, 4]); // rudder
  b.box(1.4, 0.12, 30, null, 0, R * 2 + 0.02, -1, [0.22, 0.2, 0.18], [0.9, 4]); // deck casing
  for (let k = 0; k < 5; k++) b.box(0.1, 1.3, 0.35, rotZ(k / 5 * TAU), Math.cos(k / 5 * TAU + Math.PI / 2) * 0.65, R + Math.sin(k / 5 * TAU + Math.PI / 2) * 0.65, L * 0.5 + 0.4, [0.3, 0.22, 0.12], [0.5, 4]);
  return b.build();
}

// ---------- debris ----------
function barrel(seed, steel) {
  const b = new Builder();
  b.lathe(12, 6, (v) => [steel ? 0.3 + 0.01 * Math.sin(v * 25) : 0.27 + 0.07 * Math.sin(v * Math.PI), v * (steel ? 0.9 : 0.85)], null, (v, a, x, y, z, o) => {
    const hoop = !steel && (Math.abs(v - 0.15) < 0.05 || Math.abs(v - 0.85) < 0.05) ? 0.5 : 1;
    const c = steel ? [0.32, 0.14, 0.07] : [0.32 * hoop, 0.22 * hoop, 0.13 * hoop];
    o[3] = c[0]; o[4] = c[1]; o[5] = c[2]; o[6] = 0.6; o[7] = steel ? 4 : 0;
  });
  for (const top of [0, 1]) {
    const c = b.v(0, top * (steel ? 0.9 : 0.85), 0, 0, top ? 1 : -1, 0, 0.2, 0.15, 0.1, 0.5, steel ? 4 : 0), base = top ? 12 * 6 : 0;
    for (let i = 0; i < 12; i++) top ? b.t(base + ((i + 1) % 12), base + i, c) : b.t(base + i, base + ((i + 1) % 12), c);
  }
  b.xform(0, rotZ(Math.PI / 2), 0.43, 0.27, 0); // lying on its side
  return b.build();
}
function crate(seed, broken) {
  const b = new Builder(), rng = mulberry32(seed), c = [0.34, 0.26, 0.16];
  for (let k = 0; k < 5; k++) {
    if (broken && rng() < 0.4) continue;
    b.box(1.1, 0.2, 0.9, null, 0, 0.12 + k * 0.21, 0, c.map((v) => v * (0.8 + 0.3 * rng())), [0.8, 0]);
  }
  b.box(1.12, 1.05, 0.08, null, 0, 0.53, 0.46, c, [0.8, 0]);
  if (!broken) b.box(1.12, 1.05, 0.08, null, 0, 0.53, -0.46, c, [0.8, 0]);
  return b.build();
}
function cannon(seed) {
  const b = new Builder();
  b.lathe(10, 8, (v) => [0.2 - 0.07 * v + (Math.abs(v - 0.05) < 0.04 || Math.abs(v - 0.35) < 0.03 ? 0.03 : 0) + (v > 0.97 ? 0.03 : 0), v * 2.6], null,
    (v, a, x, y, z, o) => { o[3] = 0.17; o[4] = 0.13; o[5] = 0.11; o[6] = 0.8; o[7] = 4; });
  const v0 = b.vc;
  b.blob(1, (x, y, z, o) => { o[0] = x * 0.13; o[1] = y * 0.13 - 0.12; o[2] = z * 0.13; o[3] = 0.17; o[4] = 0.13; o[5] = 0.11; o[6] = 0.8; o[7] = 4; });
  b.xform(0, rotZ(-Math.PI / 2), -1.3, 0.2, 0);
  return b.build();
}
function anchor(seed) {
  const b = new Builder(), col = (v, a, x, y, z, o) => { o[3] = 0.2; o[4] = 0.12; o[5] = 0.08; o[6] = 0.7; o[7] = 4; };
  b.tube([[0, 0.2, -1.6], [0, 0.2, 1.6]], [0.09, 0.09], 6, col); // shank
  const arm = [];
  for (let k = 0; k <= 8; k++) { const a = 0.3 + (Math.PI - 0.6) * k / 8; arm.push([Math.cos(a) * 1.1, 0.2, 0.5 + Math.sin(a) * 1.1]); }
  b.tube(arm, arm.map(() => 0.08), 5, col);
  for (const s of [-1, 1]) b.box(0.55, 0.06, 0.6, rotY(s * 0.6), s * 1.0, 0.22, 0.85, [0.2, 0.12, 0.08], [0.7, 4]);
  b.box(2.8, 0.14, 0.14, null, 0, 0.25, -1.35, [0.2, 0.14, 0.1], [0.7, 0]); // stock
  b.tube([[0, 0.2, -1.6], [0, 0.45, -1.85], [0, 0.2, -2.05], [0, 0.0, -1.85], [0, 0.2, -1.6]], [0.05, 0.05, 0.05, 0.05, 0.05], 4, col);
  return b.build();
}
function chain(seed) {
  const b = new Builder(), rng = mulberry32(seed), n = 34;
  let a = rng() * TAU, p = [0, 0.05, 0];
  for (let k = 0; k < n; k++) {
    a += (rng() - 0.5) * 0.5;
    const d = [Math.cos(a), 0, Math.sin(a)], r = 0.09, ring = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6 * TAU, along = Math.cos(t) * r * 1.4, side = Math.sin(t) * r;
      const up = k % 2 ? [0, 1, 0] : [-d[2], 0, d[0]];
      ring.push([p[0] + d[0] * along + up[0] * side, p[1] + 0.06 + up[1] * side, p[2] + d[2] * along + up[2] * side]);
    }
    b.tube(ring, ring.map(() => 0.025), 3, (v, an, x, y, z, o) => { o[3] = 0.22; o[4] = 0.12; o[5] = 0.07; o[6] = 0.5; o[7] = 4; });
    p = [p[0] + d[0] * r * 2.1, p[1], p[2] + d[2] * r * 2.1];
  }
  return b.build();
}
function plank(seed, steel) {
  const b = new Builder(), rng = mulberry32(seed);
  if (steel) {
    b.grid(6, 3, (u, v, i, j, o) => { o[0] = (u - 0.5) * 3; o[1] = 0.15 + 0.4 * Math.sin(u * 3 + seed) * v + 0.1 * Math.sin(v * 4); o[2] = (v - 0.5) * 2; o[3] = 0.24; o[4] = 0.1; o[5] = 0.06; o[6] = 0.6; o[7] = 4; }, {});
    b.grid(6, 3, (u, v, i, j, o) => { o[0] = (u - 0.5) * 3; o[1] = 0.1 + 0.4 * Math.sin(u * 3 + seed) * v + 0.1 * Math.sin(v * 4); o[2] = (v - 0.5) * 2; o[3] = 0.12; o[4] = 0.06; o[5] = 0.04; o[7] = 4; }, { flip: true });
  } else {
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) b.box(0.25, 0.08, 2 + rng() * 3, rotY((rng() - 0.5) * 0.8), (k - n / 2) * 0.35, 0.05 + k * 0.03, 0, [0.3, 0.22, 0.14], [0.9, 0]);
  }
  return b.build();
}

// piece of hull skin with ribs lying on the sand (wood or steel), low enough to sit under the path
function hullFragment(seed, steel) {
  const b = new Builder(), rng = mulberry32(seed), L = 3 + rng() * 2.5, W = 1.8 + rng() * 1.2;
  const col = steel ? [0.42, 0.2, 0.12] : [0.4, 0.3, 0.2], f = [0.9, steel ? 4 : 0];
  const hole = (u, v) => vn3(u * 4, v * 3, seed, seed) > 0.35 || (u > 0.85 && rng() < 0.5);
  const v0 = b.vc;
  const NU = 10, NV = 5;
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NU, v = j / NV, x = (v - 0.5) * W, z = (u - 0.5) * L;
    const y = 0.35 * Math.cos((v - 0.5) * 2.4) - 0.2 + 0.08 * Math.sin(u * 5 + seed) + (steel ? 0 : 0.02 * Math.sin(v * 40));
    const c = steel ? col : col.map((q) => q * (0.85 + 0.25 * Math.sin(v * 40)));
    b.v(x, y, z, 0, 1, 0, c[0], c[1], c[2], f[0], f[1]);
  }
  const i0 = b.I.length;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    if (hole((i + 0.5) / NU, (j + 0.5) / NV)) continue;
    const a = v0 + i * (NV + 1) + j, bb = a + NV + 1;
    b.t(a, a + 1, bb); b.t(bb, a + 1, bb + 1);
  }
  b.smooth(v0, i0);
  const v1 = b.vc, i1 = b.I.length; // underside
  for (let k = v0; k < v1; k++) b.v(b.P[k * 3], b.P[k * 3 + 1] - 0.06, b.P[k * 3 + 2], 0, -1, 0, 0.12, 0.09, 0.07, 0.2, f[1]);
  for (let k = i0; k < i1; k += 3) b.t(b.I[k] - v0 + v1, b.I[k + 2] - v0 + v1, b.I[k + 1] - v0 + v1);
  b.smooth(v1, i1);
  for (let k = 0; k < 4; k++) {
    const z = (k / 3 - 0.5) * L * 0.85, pts = [];
    for (let j = 0; j <= 6; j++) { const v = j / 6; pts.push([(v - 0.5) * W * 1.05, 0.35 * Math.cos((v - 0.5) * 2.4) - 0.1 + (j === 6 ? 0.25 * rng() : 0), z]); }
    b.tube(pts, pts.map(() => (steel ? 0.06 : 0.09)), 4, (v, an, x, y, z2, o) => { o[3] = col[0] * 0.7; o[4] = col[1] * 0.7; o[5] = col[2] * 0.7; o[6] = 0.8; o[7] = f[1]; });
  }
  return b.build();
}

// broken mast stump with a fallen yard, standing beside the path at bends
function mastStump(seed) {
  const b = new Builder(), rng = mulberry32(seed), H = 7 + rng() * 4;
  addMast(b, [0, -0.5, 0], H, 0.32, [(rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25], rng, false);
  b.tube([[-2.6, H * 0.7, 0.3], [0, H * 0.72, 0.1], [2.2, H * 0.62, -0.2]], [0.13, 0.14, 0.12], 5, (v, a, x, y, z, o) => { o[3] = 0.28; o[4] = 0.21; o[5] = 0.13; o[6] = 0.85; }, { cap: true });
  const v0 = b.vc; // rubble mound at the foot
  for (let k = 0; k < 5; k++) b.box(0.3, 0.15, 1.6 + rng(), rotY(rng() * TAU), (rng() - 0.5) * 1.5, 0.08, (rng() - 0.5) * 1.5, [0.3, 0.22, 0.14], [0.9, 0]);
  return b.build();
}

export function initWreck() {
  T.ship = {
    wood: [11, 12, 15, 16].map((s) => buildShip('wood', s)),
    woodBow: [buildShip('wood', 13, 0.46, 1), buildShip('wood', 17, 0.38, 1)], woodStern: [buildShip('wood', 14, 0, 0.5), buildShip('wood', 18, 0, 0.6)],
    steel: [21, 22, 25].map((s) => buildShip('steel', s)),
    steelBow: [buildShip('steel', 23, 0.52, 1), buildShip('steel', 26, 0.42, 1)], steelStern: [buildShip('steel', 24, 0, 0.55), buildShip('steel', 27, 0, 0.62)],
    plane: [airplane(31, false), airplane(32, true)],
    sub: [submarine(41)],
  };
  T.debris = {
    barrel: vary([barrel(1, false)], 6, 71, { disp: 0.08, bend: 0.06, twist: 0.2 }), drum: vary([barrel(2, true)], 5, 72, { disp: 0.1, bend: 0.08 }),
    crate: vary([1, 2, 3, 4].map((s) => crate(s, s % 2 === 0)), 2, 73, { disp: 0.03, bend: 0.05, twist: 0.1, smooth: false }),
    cannon: vary([cannon(1)], 4, 74, { disp: 0.04, scale: 0.18, bend: 0.03, twist: 0 }),
    frag: [1, 2, 5, 6].map((s) => hullFragment(s, false)), fragSteel: [3, 4, 7, 8].map((s) => hullFragment(s, true)), mast: [1, 2, 3, 4].map(mastStump),
    anchor: vary([anchor(1)], 4, 75, { disp: 0.04, bend: 0.12, twist: 0.1, smooth: false }), chain: [1, 2, 3, 4, 5].map(chain),
    plank: [1, 2, 5, 6].map((s) => plank(s, false)), plate: [3, 4, 7, 8].map((s) => plank(s, true)),
  };
}

// ---------- per-segment set-piece layout ----------
// A cheap deterministic plan per segment (community, slots, kinds, names); each slot's pieces are placed
// lazily the first time a chunk within reach asks, using a 1 m path table for the clearance tests.
const COMMUNITIES = [
  { name: 'galleon graveyard', kinds: ['wood', 'wood', 'wood'], gap: 0.55, chest: 0.7, bell: 0.7 },
  { name: 'WWII wrecks', kinds: ['liberty', 'plane', 'sub'], gap: 0.25, chest: 0, bell: 0.4 },
  { name: 'modern freighters', kinds: ['modern', 'modern', 'containers'], gap: 0.35, chest: 0, bell: 0.25 },
  { name: 'mixed wrecks', kinds: null, gap: 0.35, chest: 0.35, bell: 0.5 },
];
const GALLEON = ['San Telmo', 'Nuestra Señora de la Luz', 'Santa Rosalía', 'San Ignacio', 'Santo Cristo de Burgos', 'Concepción', 'San Felipe', 'Santa Clara', 'El Rosario', 'San José y las Ánimas', 'La Trinidad', 'San Isidro'];
const STEEL = ['Meridian', 'Halcyon', 'Northern Star', 'Calliope', 'Kestrel', 'Belmont', 'Celeste', 'Pacific Dawn', 'Marisol', 'Ostrava', 'Cape Lindsay', 'Albatross'];
const FACT = {
  wood: ['Spanish treasure fleets shipped New World silver home for over two centuries.', 'Shipworms, which are really clams, eat wooden hulls until mostly ballast and cannons remain.'],
  steel: ['Steel wrecks turn into reefs within a few years as corals and sponges settle on the plating.'],
  liberty: ['Over 2,700 Liberty ships were built in WWII; one was launched less than five days after its keel was laid.'],
  modern: ['Many ships are scuttled on purpose to become artificial reefs and dive sites.'],
  plane: ['One 1944 raid on Chuuk Lagoon sank dozens of ships and hundreds of aircraft: now a famous wreck dive.'],
  sub: ['Over 700 Type VII U-boats were built, more than any other submarine class.'],
};
const plans = new Map();
const pathYaw = (ctx, s) => Math.atan2(-(ctx.pathX(s + 12) - ctx.pathX(s - 12)), 24);

function pathTable(ctx, a, b) {
  const n = Math.ceil(b - a) + 2, X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = ctx.pathX(a + i); Y[i] = ctx.pathY(a + i); }
  return { a, n, X, Y };
}
function clearT(P, pts, margin) {
  const lim = (TUBE + margin) * (TUBE + margin);
  for (let i = 0; i < pts.length; i += 3) {
    const u = Math.min(P.n - 1.001, Math.max(0, pts[i + 2] - P.a)), k = Math.floor(u), f = u - k;
    const dx = pts[i] - (P.X[k] + (P.X[k + 1] - P.X[k]) * f), dy = pts[i + 1] - (P.Y[k] + (P.Y[k + 1] - P.Y[k]) * f);
    if (dx * dx + dy * dy < lim) return false;
  }
  return true;
}

// seat a piece on the floor: yaw about the path, pitch along its own axis, roll, keel band on the ground
function placePiece(ctx, fl, P, tpl, s, off, yaw, roll, sinkK, step = 1.6) {
  const bx = -Math.sin(yaw), bs = Math.cos(yaw); // bow direction (template -z) in (x, s)
  for (let tries = 0; tries < 30; tries++) {
    const d = off + (tries === 0 ? 0 : Math.sign(off || 1) * (tries * step) * (tries % 2 && off === 0 ? -1 : 1));
    const x = ctx.pathX(s) + d;
    const fA = fl.at(x - bx * 12, s - bs * 12), fB = fl.at(x + bx * 12, s + bs * 12);
    const R = mul3(rotY(yaw), mul3(rotX(Math.atan2(fB - fA, 24) * 0.8), rotZ(roll)));
    const y = groundY(fl, x, s, tpl, R, 1, 1, 1) - sinkK;
    if (!clearT(P, placedPoints(tpl, x, y, s, R, 1, 1, 1, 150), 0.6)) continue; // cheap reject first
    const pts = placedPoints(tpl, x, y, s, R, 1, 1, 1, 600);
    if (clearT(P, pts, 0.6)) {
      let sMax = -1e9, sMin = 1e9;
      for (let i = 2; i < pts.length; i += 3) { sMax = Math.max(sMax, pts[i]); sMin = Math.min(sMin, pts[i]); }
      const [x0, y0, z0, x1, y1, z1] = tpl.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      const c = [R[0] * cx + R[1] * cy + R[2] * cz + x, R[3] * cx + R[4] * cy + R[5] * cz + y, s - (R[6] * cx + R[7] * cy + R[8] * cz)];
      return { tpl, x, y, s, R, sMax, sMin, c, r: Math.max(x1 - x0, z1 - z0) / 2 };
    }
  }
  return null;
}

function segmentPlan(ctx, seg) {
  let L = plans.get(seg.id);
  if (L && L.seed === seg.seed) return L;
  const rng = mulberry32(seg.seed ^ 0x5eed), comm = COMMUNITIES[Math.floor(rng() * COMMUNITIES.length)];
  const slots = [], lo = seg.start + 140, hi = seg.end - 140, used = new Set();
  const nameOf = (list) => { let n; for (let t = 0; t < 8 && (!n || used.has(n)); t++) n = list[(rng() * list.length) | 0]; used.add(n); return n; };
  if (hi > lo) {
    const n = 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) slots.push({ s: lerp(lo, hi, n === 1 ? 0.5 : i / (n - 1)) + (rng() - 0.5) * 40 });
    // the hero wreck (slot 0) goes where the path is straightest so it can lie close alongside
    let bc = 1e9;
    for (let k = 0; k < 16; k++) {
      const c = lerp(lo, Math.min(hi, lo + (hi - lo) * 0.45), k / 15);
      const curv = Math.abs(ctx.pathX(c + 22) - 2 * ctx.pathX(c) + ctx.pathX(c - 22));
      if (curv < bc) { bc = curv; slots[0].s = c; }
    }
    const gapAt = rng() < comm.gap ? 1 + Math.floor(rng() * (n - 1)) : -1;
    slots.forEach((sl, i) => {
      let kind = comm.kinds ? comm.kinds[Math.min(i, comm.kinds.length - 1)] : null;
      if (!kind) {
        const r = rng();
        kind = i === 1 && r < 0.45 ? (rng() < 0.6 ? 'plane' : 'sub') : rng() < 0.5 ? 'wood' : 'steel';
        if (i === 2 && kind !== 'plane' && kind !== 'sub') kind = rng() < 0.6 ? 'plane' : 'sub';
        if (i === 0 && rng() < 0.6) kind = 'wood';
      }
      const hull = kind === 'wood' ? 'wood' : kind === 'plane' || kind === 'sub' || kind === 'containers' ? null : 'steel';
      Object.assign(sl, {
        kind, hull, hero: i === 0, side: rng() < 0.5 ? -1 : 1, k: (rng() * 1e9) | 0, pieces: null,
        gap: i === gapAt && !!hull, broken: i !== 0 && !!hull && rng() < 0.4,
        yawX: (rng() - 0.5) * (i === 0 ? 0.1 : 0.4) + (rng() < 0.25 ? Math.PI : 0),
        chest: hull === 'wood' && rng() < comm.chest, bell: !!hull && rng() < comm.bell,
      });
      const yr = (a, b) => a + Math.floor(rng() * (b - a));
      sl.name = kind === 'wood' ? `Galleon ${nameOf(GALLEON)} (${yr(1622, 1790)})`
        : kind === 'liberty' ? `Liberty ship SS ${nameOf(STEEL)} (${yr(1942, 1945)})`
        : kind === 'modern' ? `MV ${nameOf(STEEL)} (${yr(1968, 2004)})`
        : kind === 'steel' ? `SS ${nameOf(STEEL)} (${yr(1898, 1939)})`
        : kind === 'plane' ? `Twin-engine bomber (${yr(1942, 1945)})`
        : kind === 'sub' ? `Type VII U-boat (${yr(1941, 1945)})` : 'Lost container cargo';
      sl.short = sl.name.replace(/^(Galleon|Liberty ship|MV|SS) /, '').replace(/^SS /, '').replace(/ \(\d+\)$/, '');
      const fl = FACT[kind];
      sl.fact = fl ? fl[(rng() * fl.length) | 0] : null;
    });
  }
  L = { seed: seg.seed, comm, slots };
  plans.set(seg.id, L);
  if (plans.size > 24) plans.delete(plans.keys().next().value);
  return L;
}

// place a slot's pieces (once): whole hull, broken halves, a hull gap across the path, plane or sub
function slotPieces(ctx, gnd, sl) {
  if (sl.pieces) return sl.pieces;
  const rng = mulberry32(sl.k), s = sl.s, side = sl.side, P = pathTable(ctx, s - 70, s + 70), out = [];
  const fl = { at: (x, ss) => gnd.floor(x, ss) }; // floor only: identical whichever chunk computes it
  const yaw0 = pathYaw(ctx, s);
  const push = (p, lbl) => { if (p) { p.lbl = lbl; out.push(p); } return p; };
  if (sl.hull) {
    const k = sl.hull, roll = side * (0.12 + rng() * (sl.hero ? 0.25 : 0.45)), sink = k === 'wood' ? 0.8 + rng() * 1.0 : 1.0 + rng() * 1.2;
    if (sl.gap) { // broken in two across the path: the camera threads the gap between the halves
      const yaw = yaw0 - side * Math.PI / 2 + (rng() - 0.5) * 0.15, bow = rng.pick(T.ship[k + 'Bow']), st = rng.pick(T.ship[k + 'Stern']);
      const cutB = bow.box[5]; // bow half: its cut end is at template +z
      const a = push(placePiece(ctx, fl, P, bow, s, side * (TUBE + 1.2 + Math.max(0, cutB)), yaw, (rng() - 0.5) * 0.2, sink, 0.6), sl.name + ', bow section');
      const b = push(placePiece(ctx, fl, P, st, s + (rng() - 0.5) * 2, -side * (TUBE + 1.2), yaw + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.2, sink * 0.8, 0.6), sl.name + ', stern section');
      if (a && b) sl.arch = { x: ctx.pathX(s), y: ctx.pathY(s), s };
    } else if (sl.broken) {
      const off = rng() < 0.3 ? 0 : side * ((k === 'wood' ? 4.3 : 4.8) + 4 + rng() * 3);
      push(placePiece(ctx, fl, P, rng.pick(T.ship[k + 'Bow']), s + 10, off, yaw0 + sl.yawX + (rng() - 0.5) * 0.5, roll, sink), sl.name + ', bow section');
      push(placePiece(ctx, fl, P, rng.pick(T.ship[k + 'Stern']), s - 10, off + side * (2 + rng() * 6), yaw0 + sl.yawX + (rng() - 0.5) * 0.7, -roll * 0.5, sink * 0.8), sl.name + ', stern section');
    } else {
      const off = sl.hero ? side * ((k === 'wood' ? 4.3 : 4.8) + 3.6) : rng() < 0.3 ? 0 : side * ((k === 'wood' ? 4.3 : 4.8) + 4 + rng() * 3);
      push(placePiece(ctx, fl, P, rng.pick(T.ship[k]), s, off, yaw0 + sl.yawX, roll, sink, sl.hero ? 0.6 : 1.6), sl.name);
    }
  } else if (sl.kind === 'plane') {
    push(placePiece(ctx, fl, P, rng.pick(T.ship.plane), s, side * (9 + rng() * 5), yaw0 + sl.yawX + rng() * TAU, (rng() - 0.5) * 0.25, 0.35), sl.name);
  } else if (sl.kind === 'sub') {
    push(placePiece(ctx, fl, P, T.ship.sub[0], s, side * (7 + rng() * 5), yaw0 + sl.yawX, side * (0.1 + rng() * 0.3), 0.9), sl.name);
  }
  // delights around the wreck, placed by whichever chunk contains them
  sl.extras = [];
  const h = out[0];
  if (h) {
    const away = h.c[0] > ctx.pathX(h.c[2]) ? 0 : Math.PI; // the far side, away from the camera line
    if (sl.chest) { const a = away + (rng() - 0.5) * 1.6, r = h.r * 0.6 + 3 + rng() * 4; sl.extras.push({ type: 'chest', x: h.c[0] + Math.cos(a) * r, s: h.c[2] + Math.sin(a) * r }); }
    if (sl.bell) { const a = rng() * TAU, r = h.r * 0.5 + 2 + rng() * 3; sl.extras.push({ type: 'bell', x: h.c[0] + Math.cos(a) * r, s: h.c[2] + Math.sin(a) * r }); }
  }
  if (sl.kind === 'containers' || sl.kind === 'modern') { // spilled cargo, some stacked
    const cx = ctx.pathX(s) + side * (11 + rng() * 8), n = sl.kind === 'containers' ? 12 + Math.floor(rng() * 6) : 5 + Math.floor(rng() * 4);
    for (let q = 0; q < n; q++) sl.extras.push({ type: 'container', x: cx + (rng() - 0.5) * 22, s: s + (rng() - 0.5) * 34, stack: rng() < 0.35, k: (rng() * 1e9) | 0 });
    if (sl.kind === 'containers') sl.cargo = { x: cx, s };
  }
  sl.pieces = out;
  return out;
}

const S = {};
function specs() {
  if (S.rock) return S;
  const D = T.debris;
  Object.assign(S, {
    rock: { tpl: T.rocks, scale: [0.5, 1.8], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.5, tint: tintFrom([[0.42, 0.41, 0.38]]) },
    barrel: { tpl: D.barrel, scale: [0.9, 1.1], follow: 0.7, tilt: 0.3, tint: tintFrom([[1, 1, 1]]) },
    drum: { tpl: D.drum, scale: [0.9, 1.1], follow: 0.7, tilt: 0.3, tint: tintFrom([[1, 1, 1], [0.6, 0.7, 0.8]]) },
    crate: { tpl: D.crate, scale: [0.8, 1.2], follow: 0.8, tilt: 0.4, sink: 0.15, tint: tintFrom([[1, 1, 1]]) },
    cannon: { tpl: D.cannon, scale: [0.9, 1.1], follow: 0.8, tilt: 0.1, sink: 0.25, tint: tintFrom([[1, 1, 1]]) },
    anchor: { tpl: D.anchor, scale: [0.8, 1.3], follow: 0.8, tilt: 0.2, sink: 0.1, tint: tintFrom([[1, 1, 1]]) },
    chain: { tpl: D.chain, scale: [0.9, 1.3], follow: 0.9, sink: 0.3, tint: tintFrom([[1, 1, 1]]) },
    plank: { tpl: D.plank, scale: [0.8, 1.3], follow: 0.9, sink: 0.2, tint: tintFrom([[1, 1, 1]]) },
    plate: { tpl: D.plate, scale: [0.6, 1.4], follow: 0.7, tilt: 0.4, sink: 0.2, tint: tintFrom([[1, 1, 1]]) },
    frag: { tpl: D.frag, scale: [0.8, 1.2], follow: 0.9, tilt: 0.15, sink: 0.12, tint: tintFrom([[1, 1, 1]]) },
    fragSteel: { tpl: D.fragSteel, scale: [0.8, 1.2], follow: 0.9, tilt: 0.15, sink: 0.12, tint: tintFrom([[1, 1, 1]]) },
    mast: { tpl: D.mast, scale: [0.9, 1.1], follow: 0.1, tint: tintFrom([[1, 1, 1]]) },
    chest: { tpl: T.chest, scale: [1, 1.15], follow: 0.8, tilt: 0.15, sink: 0.08, tint: tintFrom([[1, 1, 1]], 0.06) },
    bell: { tpl: T.bell, scale: [1, 1.2], follow: 0.8, sink: 0.12, tint: tintFrom([[1, 1, 1]], 0.08) },
    coins: { tpl: T.coinSpill, scale: [1, 1.2], tint: tintFrom([[1, 1, 1]], 0.05) },
    container: { tpl: T.container, scale: [1, 1], follow: 0.5, sink: 0.04, support: true, occ: 1, tint: tintFrom([[1, 1, 1], [0.8, 0.8, 0.8]], 0.1) },
    pebbles: { tpl: T.pebbles, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[0.55, 0.45, 0.38], [0.45, 0.32, 0.25]], 0.1) },
    algae: { tpl: T.algae, scale: [0.6, 1.4], follow: 1, sink: 0.01, tint: tintFrom([[0.55, 0.6, 0.4]], 0.1) },
    sponge: { tpl: T.tubeSp, scale: [0.4, 0.9], follow: 0.5, tint: tintFrom([[0.55, 0.35, 0.18], [0.45, 0.25, 0.35]]) },
    fan: { tpl: T.fan, scale: [0.5, 1.1], follow: 0.2, sway: true, tint: tintFrom([[0.5, 0.18, 0.5], [0.65, 0.3, 0.12]]) },
    anem: { tpl: T.anem, scale: [0.6, 1.0], follow: 0.7, sway: true, tint: tintFrom([[0.85, 0.85, 0.85]]) },
  });
  S.wood = [{ w: 2.5, k: 'frag' }, { w: 3, k: 'barrel' }, { w: 2, k: 'crate' }, { w: 1.6, k: 'cannon' }, { w: 0.4, k: 'anchor' }, { w: 0.6, k: 'chain' }, { w: 2.5, k: 'plank' }, { w: 1, k: 'rock' }, { w: 0.8, k: 'sponge' }, { w: 0.5, k: 'fan', sway: true }];
  S.steel = [{ w: 2.5, k: 'fragSteel' }, { w: 2.5, k: 'drum' }, { w: 1.2, k: 'crate' }, { w: 0.4, k: 'anchor' }, { w: 1, k: 'chain' }, { w: 2.5, k: 'plate' }, { w: 1, k: 'rock' }, { w: 0.8, k: 'sponge' }, { w: 0.5, k: 'anem', sway: true }];
  S.micro = [{ w: 2, spec: S.pebbles }, { w: 1.2, spec: S.algae }];
  S.sparse = [{ w: 1.2, k: 'frag' }, { w: 0.8, k: 'fragSteel' }, { w: 4, k: 'rock' }, { w: 1, k: 'plank' }, { w: 0.6, k: 'drum' }, { w: 0.5, k: 'barrel' }, { w: 0.6, k: 'plate' }, { w: 0.6, k: 'sponge' }, { w: 0.4, k: 'anem', sway: true }];
  return S;
}

export function layoutWreck(ctx) {
  if (presence(ctx, 'wreck') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx), bk = budgetK(ctx, 'wreck'), tk = tierK(ctx);
  const ships = new Batch(MAT.static, 90000), st = new Batch(MAT.static, 16000 * bk);      // hulls; big pieces, delights
  const mid = new Batch(MAT.static, 34000 * bk * tk, 'mid'), sw = new Batch(MAT.sway, 8000 * bk * tk, 'mid'); // debris field
  const near = new Batch(MAT.static, 12000 * bk * tk, 'near');                               // floor micro detail
  const idx = Math.floor(ctx.s0 / 64), inChunk = (s) => s >= ctx.s0 && s < ctx.s1, more = [];
  const extra = (sl, e) => () => {
    if (e.type === 'chest') {
      if (putFloor(ctx, fs, st, sp.chest, e.x, e.s, rng)) {
        const it = st.last, yaw = Math.atan2(it.R[2], it.R[0]), f = it.tpl.front * it.sx + 0.05;
        putFloor(ctx, fs, st, { ...sp.coins, yaw, yawJ: 0.2 }, e.x + it.R[2] * f, e.s - it.R[8] * f, rng); // gold spilling out of the front
        poi(ctx, 'treasure', e.x, fs.at(e.x, e.s) + 0.4, e.s, 2, { wreck: sl.name });
      }
    } else if (e.type === 'bell') {
      if (putFloor(ctx, fs, st, sp.bell, e.x, e.s, rng)) st.last.lbl = "Ship's bell of the " + sl.short;
    } else { // container, sometimes with a shorter one stacked on top (same yaw, inside its roof)
      const cr = mulberry32(e.k), long = T.container.filter((t) => t.box[3] - t.box[0] > 10), short = T.container.filter((t) => t.box[3] - t.box[0] < 10);
      const stack = e.stack && long.length && short.length, base = stack ? long[(cr() * long.length) | 0] : T.container[(cr() * T.container.length) | 0], yaw = cr() * TAU;
      if (!putFloor(ctx, fs, st, { ...sp.container, tpl: base, yaw, yawJ: 0 }, e.x, e.s, cr) || !stack) return;
      const o = (cr() - 0.5) * 4, it = st.last; // along the long axis (template x)
      putFloor(ctx, fs, st, { ...sp.container, tpl: short[(cr() * short.length) | 0], yaw, yawJ: 0.02, occ: 0 }, it.x + Math.cos(yaw) * o, e.s + Math.sin(yaw) * o, cr);
    }
  };
  for (const seg of ctx.segments) {
    if (seg.key !== 'wreck') continue;
    const plan = segmentPlan(ctx, seg);
    for (const sl of plan.slots) {
      if (sl.s < ctx.s0 - 100 || sl.s > ctx.s1 + 100) continue;
      // one step places the slot's pieces (once per slot, cached) and adds the hulls this chunk owns; its
      // delights and debris become the following steps
      more.push(() => {
        const next = [];
        for (const p of slotPieces(ctx, fs, sl)) {
          if (Math.floor(p.sMax / 64) === idx && ships.add(p.tpl, p.x, p.y, -(p.s - ctx.s0), p.R, 1, 1, 1, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 1)) {
            const it = ships.last;
            it.g = 1; it.lbl = p.lbl; it.fact = sl.fact;
            poi(ctx, 'wreck', p.c[0], p.c[1], p.c[2], p.r, { name: p.lbl, kind: sl.kind, community: plan.comm.name });
          }
          if (p.sMax > ctx.s0 - 40 && p.sMin < ctx.s1 + 40) { // debris field around it (only the part inside this chunk)
            const list = sl.hull === 'wood' ? sp.wood : sp.steel;
            next.push(...steps(Math.round(40 * tk), 20, () => {
              const a = rng() * TAU, r = 4 + Math.pow(rng(), 1.5) * 26, s = p.s + Math.sin(a) * r * 1.3, x = p.x + Math.cos(a) * r;
              if (!inChunk(s)) return;
              const e = pickW(rng, list);
              putFloor(ctx, fs, e.sway ? sw : mid, sp[e.k], x, s, rng);
            }));
          }
        }
        if (sl.arch && inChunk(sl.arch.s)) poi(ctx, 'arch', sl.arch.x, sl.arch.y, sl.arch.s, TUBE + 1.2, { kind: 'hull gap', name: sl.name });
        if (sl.cargo && inChunk(sl.cargo.s)) poi(ctx, 'wreck', sl.cargo.x, fs.at(sl.cargo.x, sl.cargo.s) + 2, sl.cargo.s, 16, { name: sl.name, kind: 'containers' });
        for (const e of sl.extras) if (inChunk(e.s)) next.push(extra(sl, e));
        more.unshift(...next);
      });
    }
  }
  const nextP551 = clusterer(ctx, rng, 0, 45, 1);
  more.push(...steps(Math.round(60 * tk), 20, () => {
    const p = nextP551();
    if (!p || rng() > ctx.weightOf(p.s, 'wreck')) return;
    const e = pickW(rng, sp.sparse);
    putFloor(ctx, fs, e.sway ? sw : mid, sp[e.k], p.x, p.s, rng, 1 + sstep(5, 30, p.d));
  }));
  more.push(() => { for (const b of bendSpots(ctx)) if (rng() < ctx.weightOf(b.s, 'wreck') * 0.5) putBend(ctx, fs, st, rng() < 0.6 ? sp.mast : sp.rock, b, rng); });
  more.push(...microSteps(ctx, fs, near, rng, 'wreck', sp.micro, 90, 26, 30));
  return { batches: [ships, st, mid, sw, near], more };
}
