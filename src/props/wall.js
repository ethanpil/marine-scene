// The Wall: a near-vertical reef wall on one side of the path. Life grows out of the face, oriented to
// the exact floor-mesh facet it sits on: sea fans facing the open water, elephant-ear and barrel
// sponges, black coral bushes, plate corals in overlapping shelves, whip corals, feather stars on the
// edges and splashes of encrusting colour. Rock ledges jut out (with sun corals under the overhang),
// small caverns open in the face, and the crest carries shallow reef growth. Nothing solid stands on
// the open-water side.
import { Builder, Batch, TAU, vn3, sat, sstep, lerp, rotY, rotX, mul3, presence, budgetK, CHUNK, T } from './core.js';
import { MAT } from './materials.js';
import { seaFan, seaWhips, rockInto } from './shapes.js';
import { mulberry32, noise1 } from '../noise.js';
import { sv } from '../biomes.js';
import {
  pathCache, clearBox, SOLID, SOFT, seat, put, upTo, nrm, mix3, setBase, lab, segFor, recipe, lowK, itemSupport, basePts, xf, slice,
  nbFloor,
} from './nb_common.js';
import { encrust, featherStar, blackCoral, elephantEar, shelfPlate, sunCorals, ground } from './nb_shapes.js';
import { tintFrom } from './scatter.js';

const W = {};

// ---------------------------------------------------------------- templates
function ledgeTpl(seed) {
  const b = new Builder(), rng = mulberry32(seed);
  const sx = 1.4 + rng() * 1.4, sz = 0.9 + rng() * 0.6, sy = 0.35 + rng() * 0.3;
  rockInto(b, seed + 900, { detail: 3, sx, sy, sz, rough: 0.28, flat: 0.25, growth: 0.9, col: [0.62, 0.55, 0.5], strata: 0.05 });
  const t = b.build(), P = t.pos, pts = [];
  // attached along its buried back half
  for (let i = 0; i < t.vc; i += 3) if (P[i * 3 + 2] < t.box[2] * 0.75) pts.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const step = Math.max(1, Math.floor(pts.length / 3 / 14)) * 3, sub = [];
  for (let i = 0; i < pts.length; i += step) sub.push(pts[i], pts[i + 1], pts[i + 2]);
  setBase(t, sub);
  t.label = 'Reef ledge';
  t.obs = [[t.box[0] + sz * 0.5, sy, 0, t.box[3] - sz * 0.5, sy, 0, Math.max(sz, sy) * 0.9]];
  return t;
}

// Rock outcrop with a dark cave mouth: a lathe around the outward axis (local +y), back rim at y = 0.
function cavernTpl(seed) {
  const b = new Builder(), rng = mulberry32(seed), R = 1.3 + rng() * 0.8, D = 1.2 + rng() * 0.6, rm = R * (0.38 + rng() * 0.12);
  const prof = [[R, 0], [R * 0.95, D * 0.35], [R * 0.75, D * 0.75], [rm * 1.35, D], [rm * 1.08, D * 1.02], [rm, D * 0.88], [rm * 0.85, D * 0.62], [rm * 0.5, D * 0.42], [0.02, D * 0.36]];
  const n = prof.length - 1;
  b.lathe(22, n * 2, (v) => {
    const f = v * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    return [lerp(prof[i][0], prof[i + 1][0], t), lerp(prof[i][1], prof[i + 1][1], t)];
  }, (a, v) => 1 + 0.12 * vn3(Math.cos(a) * 2, v * 4, Math.sin(a) * 2, seed) * (v < 0.5 ? 1 : 0.6),
  (v, a, x, y, z, o) => {
    const inside = sstep(0.42, 0.6, v), ao = lerp(0.75 + 0.3 * vn3(x * 3, y * 3, z * 3, seed + 2), 0.035 + 0.05 * (1 - sstep(0.6, 1, v)), inside);
    o[3] = 0.62 * ao; o[4] = 0.56 * ao; o[5] = 0.52 * ao; o[6] = 0.8 * (1 - inside); o[7] = 6.3 + (seed % 5) * 0.1;
  });
  const t = b.build(), pts = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; pts.push(Math.cos(a) * R * 0.97, 0, Math.sin(a) * R * 0.97); }
  setBase(t, pts);
  t.label = 'Small cavern';
  t.fact = 'Caves and cracks in reef walls shelter soldierfish, lobsters and sleeping turtles';
  return t;
}

export function initWall() {
  const R = (n, f, o = 0) => Array.from({ length: n }, (_, i) => f(900 + i * 17 + o));
  W.fan = R(10, (s) => seaFan(s, { h: 1.2 + (s % 4) * 0.25 }));
  W.ear = [...R(4, (s) => elephantEar(s, { H: 0.9 + (s % 3) * 0.2, W: 0.8 + (s % 4) * 0.15, detail: 3 })), ...R(4, (s) => elephantEar(s, { H: 0.6, W: 0.5, th: 0.05, detail: 2 }), 5)];
  W.black = R(6, (s) => blackCoral(s, { h: 0.9 + (s % 3) * 0.3 }));
  W.plate = R(8, (s) => shelfPlate(s, { R: 0.55 + (s % 4) * 0.17 }));
  W.whip = R(6, (s) => seaWhips(s, { n: 1 + (s % 3), h: 1.6 + (s % 3) * 0.5 }));
  W.crin = R(6, (s) => featherStar(s, { arms: 8 + (s % 3) * 3, L: 0.2 + (s % 3) * 0.05, up: 0.4 + (s % 4) * 0.15 }));
  W.enc = R(10, (s) => encrust(s, { r: 0.16 + (s % 4) * 0.05, h: 0.07 + (s % 3) * 0.035, lobes: 0.55, detail: 1, ridges: s % 3 === 0 ? 0.3 : 0, elong: 1 + (s % 3) * 0.35 }));
  W.encHi = R(6, (s) => encrust(s, { r: 0.16 + (s % 4) * 0.05, h: 0.07 + (s % 3) * 0.035, lobes: 0.55, detail: 2, ridges: s % 3 === 0 ? 0.3 : 0, elong: 1 + (s % 3) * 0.35 }), 3);
  W.sun = R(5, (s) => sunCorals(s, { n: 6 + (s % 4) * 3 }));
  W.ledge = R(6, ledgeTpl);
  W.cave = R(4, cavernTpl);
  lab(W.fan, 'Gorgonian sea fan', 'Sea fans grow across the current to sieve plankton from the passing water');
  lab(W.ear, 'Elephant ear sponge', 'A single large sponge can filter thousands of litres of water a day');
  lab(W.black, 'Black coral', 'Named for its black skeleton; the living tissue is white, green or orange');
  lab(W.plate, 'Plate coral', 'Grows in flat shelves to catch as much of the dim light as possible');
  lab(W.whip, 'Whip coral', null);
  lab(W.crin, 'Feather star', 'Feather stars climb to high perches at night to comb plankton from the current');
  lab(W.enc, 'Encrusting sponge', null); lab(W.encHi, 'Encrusting sponge', null);
  lab(W.sun, 'Sun coral (Tubastraea)', 'Sun corals have no algae; they open at night to catch plankton in the shade');
  for (const t of [...W.crin, ...W.whip]) t.solid = false;
  return W;
}

// ---------------------------------------------------------------- palettes & recipe
const FANS = [[0.72, 0.1, 0.9], [1.0, 0.08, 0.16], [1.1, 0.45, 0.06], [1.05, 0.85, 0.12], [0.95, 0.15, 0.6]];
const ENC = [[1.0, 0.35, 0.05], [0.85, 0.06, 0.08], [0.55, 0.12, 0.75], [1.05, 0.8, 0.1], [0.3, 0.45, 0.8], [0.95, 0.3, 0.55], [0.75, 0.6, 0.45], [0.55, 0.65, 0.35]];
const EAR = [[1.0, 0.42, 0.1], [0.9, 0.25, 0.08], [0.95, 0.55, 0.15], [0.7, 0.3, 0.55]];
const BLACK = [[0.9, 0.9, 0.85], [0.55, 0.75, 0.4], [0.95, 0.65, 0.3], [0.5, 0.42, 0.3]];
const PLATE = [[0.6, 0.45, 0.28], [0.45, 0.55, 0.3], [0.65, 0.38, 0.55], [0.75, 0.6, 0.35]];
const recipeOf = (g) => recipe(g, 'wall', (g) => ({
  fan: 0.5 + sv(g, 5) * 1.2, ear: 0.3 + sv(g, 6), black: 0.2 + sv(g, 7) * 1.1, plate: 0.3 + sv(g, 8) * 1.2,
  whip: 0.3 + sv(g, 9), crin: 0.3 + sv(g, 10), enc: 0.6 + sv(g, 11) * 0.8, ledges: 0.5 + sv(g, 12),
  giant: sv(g, 13) < 0.55, fanPal: FANS.filter((_, i) => sv(g, 20 + i) > 0.3),
}));

// wall geometry along s: side toward the wall and the lateral distance of its foot
function wallAt(ctx, pc, s) {
  const g = segFor(ctx, s, 'wall');
  if (!g) return null;
  const side = sv(g, 1) < 0.5 ? -1 : 1, wd = 7 + 3 * noise1(s / 60, 141) + 2 * sv(g, 2);
  return { g, side, wd, rc: recipeOf(g), px: pc.x(s), py: pc.y(s) };
}

// ---------------------------------------------------------------- plan: ledges & caverns (shared by chains)
const PLANS = new WeakMap();
function planWall(ctx) {
  let P = PLANS.get(ctx.group);
  if (P) return P;
  const rng = mulberry32(((ctx.s0 * 2654435761) ^ 0x7a11) >>> 0), fs = nbFloor(ctx), pc = pathCache(ctx);
  const ledges = [], caves = [];
  const nL = 4;
  for (let k = 0; k < nL; k++) {
    const s = ctx.s0 + (k + rng()) * (CHUNK / nL), w = wallAt(ctx, pc, s);
    if (!w || rng() > ctx.weightOf(s, 'wall') * w.rc.ledges) continue;
    const spot = faceSpot(fs, w, s, w.py - 3.5 + rng() * 11);
    if (!spot) continue;
    const isCave = rng() < 0.3, tpl = (isCave ? W.cave : W.ledge)[(rng() * (isCave ? W.cave : W.ledge).length) | 0];
    const sc = 0.8 + rng() * 0.5;
    let R, m;
    if (isCave) { R = upTo(mix3([spot.n[0], spot.n[1], spot.n[2]], [spot.hn[0], 0, spot.hn[2]], 0.5), rng() * TAU); m = spot.n; }
    else { R = rotY(Math.atan2(spot.hn[0], spot.hn[2]) + (rng() - 0.5) * 0.4); m = spot.hn; }
    const Pp = [spot.x, spot.y, s];
    seat(fs, tpl, R, sc, sc, sc, Pp, m, 0.12);
    // flight tube: the outcrop must stay clear of the path
    const reach = tpl.r * sc;
    if (!clearBox(pc, Pp[0], Pp[2], Pp[1] - reach, Pp[1] + reach, reach)) continue;
    (isCave ? caves : ledges).push({ tpl, x: Pp[0], y: Pp[1], s: Pp[2], R, sc, hn: spot.hn, w });
  }
  P = { ledges, caves };
  PLANS.set(ctx.group, P);
  return P;
}
// point on the wall face at height ~yT (marching out from the foot); returns facet normal and outward dir
function faceSpot(fs, w, s, yT) {
  // coarse march out from the foot, then bisect to the height crossing
  const X = (t) => w.px + w.side * t;
  let t0 = w.wd - 2.5;
  if (fs.at(X(t0), s) >= yT) return null;
  let t1 = -1;
  for (let t = t0 + 1.2; t < w.wd + 9.5; t += 1.2) { if (fs.at(X(t), s) >= yT) { t1 = t; break; } t0 = t; }
  if (t1 < 0) return null;
  for (let k = 0; k < 4; k++) { const m = (t0 + t1) / 2; if (fs.at(X(m), s) >= yT) t1 = m; else t0 = m; }
  const x = X(t1), y = fs.at(x, s);
  if (fs.ny > 0.8) return null;
  const hl = Math.hypot(fs.nx, fs.nz) || 1;
  return { x, y, t: t1, n: [fs.nx, fs.ny, fs.nz], hn: [fs.nx / hl, 0, fs.nz / hl] };
}
const pick = (rng, a) => a[(rng() * a.length) | 0];
const tint = (rng, list, amt = 0.15) => tintFrom(list, amt)(rng);

// ---------------------------------------------------------------- chain A: structure + big life on the face
export function layoutWallP(ctx) { if (presence(ctx, 'wall') > 0) planWall(ctx); return null; }
export function* layoutWallA(ctx) {
  const Y = slice();
  if (presence(ctx, 'wall') <= 0) return null;
  const P = planWall(ctx), bk = budgetK(ctx, 'wall');
  const rng = mulberry32(((ctx.s0 * 2246822519) ^ 0x3a11) >>> 0), fs = nbFloor(ctx), pc = pathCache(ctx);
  const st = new Batch(MAT.static, 34000 * bk);
  const sw = new Batch(MAT.sway, 34000 * bk); sw.soft = true;
  const labels = [], pois = [];
  for (const L of P.ledges) {
    put(ctx, st, L.tpl, L.x, L.y, L.s, L.R, L.sc, L.sc, L.sc, tint(rng, [[1, 0.95, 0.9], [0.9, 0.9, 0.85]], 0.1));
    L.item = st.items[st.items.length - 1];
    const o = L.tpl.box[5] * L.sc * 0.8;
    pois.push({ type: 'wall-overhang', x: L.x + L.hn[0] * o, y: L.y - 0.6, s: L.s - L.hn[2] * o, r: 2.5, data: { name: 'Ledge overhang', fact: 'Overhangs shade sun corals and shelter fish from passing predators' } });
  }
  for (const C of P.caves) {
    put(ctx, st, C.tpl, C.x, C.y, C.s, C.R, C.sc, C.sc, C.sc, tint(rng, [[1, 0.95, 0.9]], 0.1));
    const ax = xf(C.R, C.sc, C.sc, C.sc, 0, C.tpl.box[4] * 0.5, 0);
    pois.push({ type: 'ledge', x: C.x + ax[0], y: C.y + ax[1], s: C.s - ax[2], r: 2, data: { name: 'Small cavern', fact: C.tpl.fact } });
  }
  // big growth on the face: fans facing the open water, elephant ears, black coral
  const N = 110;
  for (let k = 0; k < N; k++) {
    if (Y.over()) { yield; Y.reset(); }
    const s = ctx.s0 + rng() * CHUNK, w = wallAt(ctx, pc, s);
    if (!w || rng() > ctx.weightOf(s, 'wall')) continue;
    const spot = faceSpot(fs, w, s, w.py - 6 + Math.pow(rng(), 0.8) * 17);
    if (!spot || spot.n[1] > 0.7) continue;
    const rc = w.rc, u = rng() * (rc.fan + rc.ear + rc.black);
    const face = Math.atan2(spot.hn[0], spot.hn[2]);
    let tpl, sc, R, b = st, col, fa = 1, m = spot.n, embed = 0.04;
    if (u < rc.fan) {
      tpl = pick(rng, W.fan); sc = 0.9 + Math.pow(rng(), 1.3) * 1.5; b = sw; fa = sc;
      col = tint(rng, rc.fanPal.length ? rc.fanPal : FANS, 0.2);
      R = mul3(rotY(face + (rng() - 0.5) * 0.5), rotX(0.1 + rng() * 0.3));
    } else if (u < rc.fan + rc.ear) {
      tpl = pick(rng, W.ear); sc = 0.8 + rng() * 0.7; col = tint(rng, EAR);
      R = mul3(rotY(face + (rng() - 0.5) * 0.6), rotX(0.15 + rng() * 0.3));
    } else {
      tpl = pick(rng, W.black); sc = 0.8 + rng() * 0.8; b = sw; fa = sc * 0.4; col = tint(rng, BLACK, 0.12);
      R = upTo(nrm([spot.n[0], spot.n[1] - 0.25, spot.n[2]]), rng() * TAU);
    }
    const h = (tpl.maxY - tpl.minY) * sc, reach = tpl.r * sc + h * 0.4;
    if (!clearBox(pc, spot.x, s, spot.y - reach, spot.y + h, reach)) continue;
    const Pp = [spot.x, spot.y, s];
    seat(fs, tpl, R, sc, sc, sc, Pp, m, embed);
    put(ctx, b, tpl, Pp[0], Pp[1], Pp[2], R, sc, sc, sc, col, fa);
  }
  // rare enormous gorgonian, seen dead ahead on the outside of a bend
  const w0 = wallAt(ctx, pc, ctx.s0 + 32);
  if (w0 && w0.rc.giant && sv(w0.g, 30 + Math.floor(ctx.s0 / 64) % 7) < 0.3) {
    for (let k = 0; k < 6; k++) {
      const s = ctx.s0 + 8 + rng() * 48, w = wallAt(ctx, pc, s), spot = w && faceSpot(fs, w, s, w.py - 4 + rng() * 6);
      if (!spot || spot.n[1] > 0.7) continue;
      const tpl = pick(rng, W.fan), sc = 2.6 + rng() * 0.8, R = mul3(rotY(Math.atan2(spot.hn[0], spot.hn[2]) + (rng() - 0.5) * 0.3), rotX(0.12));
      const h = tpl.maxY * sc;
      if (!clearBox(pc, spot.x, s, spot.y, spot.y + h, tpl.r * sc + 0.4)) continue;
      const Pp = [spot.x, spot.y, s];
      seat(fs, tpl, R, sc, sc, sc, Pp, spot.n, 0.06);
      if (put(ctx, sw, tpl, Pp[0], Pp[1], Pp[2], R, sc, sc, sc, tint(rng, FANS, 0.1), sc)) {
        sw.items[sw.items.length - 1].lbl = 'Giant gorgonian sea fan';
        labels.push(['Giant gorgonian sea fan', Pp[0], Pp[1] + h * 0.5, Pp[2], 'Giant sea fans can be centuries old and span more than three metres']);
        break;
      }
    }
  }
  return { batches: [st, sw], labels, pois };
}

// ---------------------------------------------------------------- chain B: shelves, sponges, whips, crinoids, colour
export function* layoutWallB(ctx) {
  const Y = slice();
  if (presence(ctx, 'wall') <= 0) return null;
  const P = planWall(ctx), bk = budgetK(ctx, 'wall'), lk = lowK(ctx);
  const rng = mulberry32(((ctx.s0 * 3266489917) ^ 0x3b22) >>> 0), fs = nbFloor(ctx), pc = pathCache(ctx);
  const mid = new Batch(MAT.static, 36000 * bk); mid.lod = 'mid';
  const near = new Batch(MAT.static, 15000 * bk); near.lod = 'near';
  const sw = new Batch(MAT.sway, 18000 * bk); sw.lod = 'mid'; sw.soft = true;
  const N = 380 * lk;
  for (let k = 0; k < N; k++) {
    if (Y.over()) { yield; Y.reset(); }
    const s = ctx.s0 + rng() * CHUNK, w = wallAt(ctx, pc, s);
    if (!w || rng() > ctx.weightOf(s, 'wall')) continue;
    const spot = faceSpot(fs, w, s, w.py - 6 + rng() * 18);
    if (!spot || spot.n[1] > 0.75) continue;
    const rc = w.rc, hf = sat((spot.y - (w.py - 6)) / 16);
    const tot = rc.plate * (0.4 + hf) + rc.whip + rc.crin * 0.6 + rc.enc * 4 + 0.5;
    let u = rng() * tot, tpl, sc, R, b, col, fa = 1, m = spot.n, embed = 0.025;
    const face = Math.atan2(spot.hn[0], spot.hn[2]);
    if ((u -= rc.plate * (0.4 + hf)) < 0) { // overlapping shelves: stack 2-4 plates up the face
      const n = 1 + Math.floor(rng() * 3.5);
      for (let q = 0; q < n; q++) {
        const sp = q ? faceSpot(fs, w, s + (rng() - 0.5) * 0.8, spot.y + q * (0.25 + rng() * 0.25)) : spot;
        if (!sp) break;
        const tp = pick(rng, W.plate), c = 0.8 + rng() * 0.6, Rr = rotY(Math.atan2(sp.hn[0], sp.hn[2]) + (rng() - 0.5) * 0.5);
        const reach = tp.r * c;
        if (!clearBox(pc, sp.x, s, sp.y - 0.2, sp.y + 0.3, reach)) continue;
        const Pp = [sp.x, sp.y, s];
        seat(fs, tp, Rr, c, c, c, Pp, sp.hn, 0.03);
        put(ctx, mid, tp, Pp[0], Pp[1], Pp[2], Rr, c, c, c, tint(rng, PLATE, 0.18));
      }
      continue;
    }
    if ((u -= rc.whip) < 0) { tpl = pick(rng, W.whip); sc = 0.8 + rng() * 0.6; b = sw; fa = sc; col = tint(rng, [[1.1, 0.4, 0.06], [1.0, 0.1, 0.12], [1.1, 0.85, 0.15], [0.9, 0.9, 0.85]]); R = upTo(mix3(spot.n, [0, 1, 0], 0.35), rng() * TAU); }
    else if ((u -= rc.crin * 0.6) < 0) { tpl = pick(rng, W.crin); sc = 0.9 + rng() * 0.8; b = sw; fa = sc; col = tint(rng, [[1.1, 0.85, 0.1], [1.0, 0.35, 0.05], [0.9, 0.08, 0.1], [0.2, 0.2, 0.22], [0.9, 0.9, 0.85], [0.5, 0.2, 0.7]], 0.12); R = upTo(spot.n, rng() * TAU); embed = 0.01; }
    else if ((u -= rc.enc * 4) < 0) { b = rng() < 0.4 ? near : mid; tpl = pick(rng, b === near ? W.encHi : W.enc); sc = 0.7 + rng() * 1.1; col = tint(rng, ENC, 0.2); R = upTo(spot.n, rng() * TAU); }
    else if (T.barrel && T.barrel.length) { tpl = pick(rng, T.barrel); sc = 0.6 + rng() * 0.7; b = mid; col = tint(rng, [[0.85, 0.32, 0.22], [0.7, 0.22, 0.7], [0.95, 0.55, 0.2]]); R = upTo(mix3([0, 1, 0], spot.n, 0.4), rng() * TAU); embed = 0.06; }
    else continue;
    const h = (tpl.maxY - tpl.minY) * sc, reach = tpl.r * sc + h * 0.3;
    if (!clearBox(pc, spot.x, s, spot.y - reach, spot.y + h, reach, b === sw ? SOFT : SOLID, b === sw ? 1.2 : 0)) continue;
    const Pp = [spot.x, spot.y, s];
    seat(fs, tpl, R, sc, sc, sc, Pp, m, embed);
    put(ctx, b, tpl, Pp[0], Pp[1], Pp[2], R, sc, sc, sc, col, fa);
  }
  // ledges: crinoids and sponges on top, sun corals hanging beneath the overhang
  for (const L of P.ledges) {
    if (Y.over()) { yield; Y.reset(); }
    const top = itemSupport(L.tpl, L.x, L.y, L.s, L.R, L.sc, L.sc, L.sc, true, null);
    const under = itemSupport(L.tpl, L.x, L.y, L.s, L.R, L.sc, L.sc, L.sc, false, null);
    const [x0, , z0, x1, , z1] = L.tpl.box;
    for (let k = 0; k < 7; k++) {
      const lx = lerp(x0, x1, 0.15 + rng() * 0.7) * L.sc, lz = lerp(0, z1, 0.2 + rng() * 0.6) * L.sc;
      const o = xf(L.R, 1, 1, 1, lx, 0, lz), x = L.x + o[0], s = L.s - o[2];
      const onTop = k < 4, tpl = onTop ? (rng() < 0.5 ? pick(rng, W.crin) : pick(rng, W.enc)) : pick(rng, W.sun);
      const sup = onTop ? top : under, y = sup.at(x, s);
      if (!isFinite(y) || Math.abs(y) > 1e8) continue;
      const sc = onTop ? 0.8 + rng() * 0.5 : 0.8 + rng() * 0.6;
      const R = onTop ? rotY(rng() * TAU) : upTo([0, -1, 0], rng() * TAU);
      const B = basePts(tpl);
      let g = onTop ? -1e9 : -1e9, miss = false;
      for (let i = 0; i < B.length; i += 3) {
        const q = xf(R, sc, sc, sc, B[i], B[i + 1], B[i + 2]), h = sup.at(x + q[0], s - q[2]);
        if (!isFinite(h) || Math.abs(h) > 1e8) { miss = true; break; }
        // the rock must be thick enough here to take the embedded base
        const h2 = (onTop ? under : top).at(x + q[0], s - q[2]);
        if (!isFinite(h2) || Math.abs(h2) > 1e8 || Math.abs(h - h2) < 0.12) { miss = true; break; }
        g = Math.max(g, onTop ? (y + q[1]) - h : h - (y + q[1]));
      }
      if (miss) continue;
      const yy = onTop ? y - g - 0.025 : y + g + 0.025; // every base point a few cm into the rock
      const isCrin = onTop && W.crin.includes(tpl);
      const col = isCrin ? tint(rng, [[1.1, 0.85, 0.1], [1.0, 0.35, 0.05], [0.9, 0.9, 0.85]]) : onTop ? tint(rng, ENC) : tint(rng, [[1, 1, 1], [1.05, 0.9, 0.7]], 0.08);
      put(ctx, isCrin ? sw : near, tpl, x, yy, s, R, sc, sc, sc, col, isCrin ? sc : 1, { item: L.item });
    }
  }
  return { batches: [mid, near, sw] };
}

// ---------------------------------------------------------------- chain C: reef growth on the crest + terrace
const CREST = () => [
  { t: T.table, w: 2, sc: [0.8, 1.6], tint: [[0.95, 0.55, 0.2], [0.6, 0.78, 0.18], [0.78, 0.3, 0.88], [1.0, 0.85, 0.2]] },
  { t: T.stag, w: 2.5, sc: [0.8, 1.8], tint: [[0.95, 0.55, 0.2], [0.35, 0.6, 1.05], [0.15, 0.82, 0.68], [1.0, 0.42, 0.62]] },
  { t: T.brain, w: 1.5, sc: [0.5, 1.2], tint: [[1.0, 0.5, 0.18], [0.55, 0.8, 0.22], [1.05, 0.8, 0.22]] },
  { t: T.plateC, w: 1.2, sc: [0.9, 1.8], tint: PLATE },
  { t: T.soft, w: 1.5, sc: [0.9, 1.6], sway: true, tint: [[0.72, 0.12, 0.98], [0.98, 0.14, 0.62], [1.1, 0.42, 0.05]] },
  { t: T.fan, w: 1.2, sc: [0.7, 1.5], sway: true, tint: FANS },
  { t: T.tubeSp, w: 0.8, sc: [0.8, 1.5], tint: [[0.72, 0.12, 0.98], [1.1, 0.42, 0.05], [1.1, 0.86, 0.08]] },
  { t: W.enc, w: 1.5, sc: [0.8, 1.5], tint: ENC },
].filter((e) => e.t && e.t.length);
export function layoutWallC(ctx) {
  if (presence(ctx, 'wall') <= 0) return null;
  const bk = budgetK(ctx, 'wall'), lk = lowK(ctx);
  const rng = mulberry32(((ctx.s0 * 668265263) ^ 0x3c33) >>> 0), fs = nbFloor(ctx), pc = pathCache(ctx);
  const st = new Batch(MAT.static, 22000 * bk); st.lod = 'mid';
  const sw = new Batch(MAT.sway, 8000 * bk); sw.lod = 'mid'; sw.soft = true;
  const list = CREST();
  let tot = 0; for (const e of list) tot += e.w;
  for (let k = 0; k < 75 * lk; k++) {
    const s = ctx.s0 + rng() * CHUNK, w = wallAt(ctx, pc, s);
    if (!w || rng() > ctx.weightOf(s, 'wall')) continue;
    const crest = rng() < 0.75;
    // crest: beyond the top of the face; terrace: the narrow shelf between the drop-off and the wall foot
    const t = crest ? w.wd + 5.5 + rng() * 12 : -2.5 + rng() * (w.wd - 1.5);
    const x = w.px + w.side * t, y = fs.at(x, s);
    if (fs.ny < 0.8) continue;
    let u = rng() * tot, e = list[0];
    for (const q of list) { if ((u -= q.w) < 0) { e = q; break; } }
    if (!crest && rng() < 0.5) e = list.find((q) => q.t === W.enc) || e;
    const tpl = pick(rng, e.t), sc = lerp(e.sc[0], e.sc[1], rng()) * (crest ? 1 : 0.7);
    const R = upTo(mix3([0, 1, 0], [fs.nx, fs.ny, fs.nz], 0.5), rng() * TAU);
    const h = (tpl.maxY - tpl.minY) * sc;
    if (!clearBox(pc, x, s, y, y + h, tpl.r * sc, e.sway ? SOFT : SOLID)) continue;
    const Pp = [x, y, s];
    seat(fs, tpl, R, sc, sc, sc, Pp, null, 0.03);
    put(ctx, e.sway ? sw : st, tpl, Pp[0], Pp[1], Pp[2], R, sc, sc, sc, tint(rng, e.tint, 0.2), e.sway ? sc : 1);
  }
  return { batches: [st, sw] };
}
