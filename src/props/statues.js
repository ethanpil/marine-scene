// Sunken statuary: connected figures (limbs are tubes that start inside the torso/pelvis, with sphere
// joints at shoulders, elbows, hips and knees), in many styles, poses and damage states, plus fragments.
import { Builder, TAU, vn3, sat, sstep, lerp, rotX, rotY, rotZ, mul3 } from './core.js';
import { stoneInto } from './shapes.js';
import { mulberry32 } from '../noise.js';

const STONE = [0.62, 0.58, 0.5];

function mk(seed) {
  const b = new Builder(), rng = mulberry32(seed * 7919 + 13), key = 6.05 + rng() * 0.9;
  const paint = (v, a, x, y, z, o) => { const c = 0.82 + 0.22 * vn3(x * 4, y * 4, z * 4, seed); o[3] = STONE[0] * c; o[4] = STONE[1] * c; o[5] = STONE[2] * c; o[6] = 0.8; o[7] = key; };
  const ball = (p, r, sx = 1, sy = 1, sz = 1) => b.blob(1, (x, y, z, o) => {
    o[0] = p[0] + x * r * sx; o[1] = p[1] + y * r * sy; o[2] = p[2] + z * r * sz;
    const c = 0.82 + 0.22 * vn3(o[0] * 4, o[1] * 4, o[2] * 4, seed); o[3] = STONE[0] * c; o[4] = STONE[1] * c; o[5] = STONE[2] * c; o[6] = 0.8; o[7] = key;
  });
  // limb through joints; joints get spheres so segments read as one surface
  const limb = (pts, radii) => {
    b.tube(pts, radii, 7, paint, { cap: true });
    for (let i = 0; i < pts.length; i++) ball(pts[i], radii[i] * 1.04);
  };
  const block = (sx, sy, sz, R, x, y, z, p = 6) => { const v0 = b.vc; stoneInto(b, { sx, sy, sz, p, rough: 0.04, seed, detail: 2, col: STONE, growth: 0.8, mode: key }); b.xform(v0, R || [1, 0, 0, 0, 1, 0, 0, 0, 1], x, y, z); };
  const lathe = (prof, rad, nu = 14, nv = 8) => b.lathe(nu, nv, prof, rad, paint);
  // carved head facing +z: brow ridge, eye sockets, nose, lips, chin, ears and a hair cap
  const face = (p, r, curls) => b.blob(3, (x, y, z, o) => {
    let px = x * 0.88, py = y * 1.12, pz = z * 0.98, dark = 0;
    if (z > 0) {
      pz += 0.1 * z * sstep(0.12, 0.3, y) * sstep(0.5, 0.36, y);                                       // brow
      const eye = Math.exp(-(((Math.abs(x) - 0.33) ** 2) + (y - 0.12) ** 2) / 0.012);
      pz -= 0.09 * eye; dark += 0.35 * eye;                                                           // sockets
      pz += 0.2 * Math.exp(-(x * x) / 0.01) * sstep(-0.32, 0.12, y) * sstep(0.2, 0.06, y);         // nose
      const lip = Math.exp(-(x * x) / 0.05) * Math.exp(-((y + 0.42) ** 2) / 0.004);
      pz += 0.03 * lip; dark += 0.25 * Math.exp(-(x * x) / 0.04) * Math.exp(-((y + 0.42) ** 2) / 0.0008);
      pz += 0.08 * z * sstep(-0.55, -0.72, y) * sstep(-0.95, -0.78, y);                              // chin
    }
    px *= 1 + 0.1 * Math.exp(-(z * z) / 0.03) * sstep(-0.2, 0.05, y) * sstep(0.35, 0.15, y);       // ears
    const hair = sstep(0.25, 0.55, y - 0.35 * z);                                                     // hair cap over the crown
    const bump = hair * (curls ? 0.06 * Math.abs(Math.sin(x * 14) * Math.sin(y * 13) * Math.sin(z * 12)) + 0.04 : 0.03);
    o[0] = p[0] + px * r * (1 + bump); o[1] = p[1] + py * r * (1 + bump); o[2] = p[2] + pz * r * (1 + bump);
    const c = (0.82 + 0.22 * vn3(o[0] * 4, o[1] * 4, o[2] * 4, seed)) * (1 - dark);
    o[3] = STONE[0] * c; o[4] = STONE[1] * c; o[5] = STONE[2] * c; o[6] = 0.8; o[7] = key;
  });
  // fresh break: a short jagged stump with lighter, unweathered stone at the fracture
  const stump = (p, d, r, len) => {
    const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    b.tube([p, q], [r, r * 0.95], 7, paint);
    b.blob(1, (x, y, z, o) => {
      const j = 0.55 + 0.6 * Math.abs(vn3(x * 3 + seed, y * 3, z * 3, seed + 7));
      o[0] = q[0] + x * r * j; o[1] = q[1] + y * r * j; o[2] = q[2] + z * r * j;
      o[3] = STONE[0] * 1.18; o[4] = STONE[1] * 1.18; o[5] = STONE[2] * 1.15; o[6] = 0.1; o[7] = key;
    });
  };
  return { b, rng, limb, ball, block, lathe, paint, key, face, stump };
}

// weathering: erosion pits and chipped edges displaced inward along the normal, pits darkened
function erode(b, seed, from = 0) {
  for (let i = from; i < b.vc; i++) {
    const x = b.P[i * 3], y = b.P[i * 3 + 1], z = b.P[i * 3 + 2];
    const pit = sstep(0.62, 0.86, vn3(x * 7.3, y * 7.3, z * 7.3, seed + 21)), chip = sstep(0.68, 0.9, vn3(x * 2.2, y * 2.2, z * 2.2, seed + 33));
    const d = -(0.022 * pit + 0.035 * chip);
    b.P[i * 3] += b.N[i * 3] * d; b.P[i * 3 + 1] += b.N[i * 3 + 1] * d; b.P[i * 3 + 2] += b.N[i * 3 + 2] * d;
    const k = 1 - 0.3 * pit + 0.08 * chip;
    b.C[i * 3] *= k; b.C[i * 3 + 1] *= k; b.C[i * 3 + 2] *= k;
  }
}

// normalise: lift so the lowest point is at y = 0 and centre in xz
function settle(b) {
  let mn = 1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < b.P.length; i += 3) { mn = Math.min(mn, b.P[i + 1]); x0 = Math.min(x0, b.P[i]); x1 = Math.max(x1, b.P[i]); z0 = Math.min(z0, b.P[i + 2]); z1 = Math.max(z1, b.P[i + 2]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < b.P.length; i += 3) { b.P[i] -= cx; b.P[i + 1] -= mn; b.P[i + 2] -= cz; }
}

// articulated human figure; pose angles in radians. returns joint table for decorations
function human(F, o) {
  const { limb, ball, lathe, block } = F, k = o.slim ?? 1, H = o.h ?? 2;
  const s = H / 2, hipY = (o.seated ? 0.55 : o.kneel ? 0.62 : 1.0) * s;
  const pel = [0, hipY, 0], chest = [0, hipY + 0.55 * s, o.lean ?? 0], neck = [0, hipY + 0.72 * s, (o.lean ?? 0) * 1.2];
  // torso: lathe hugging pelvis -> chest, slightly flattened front/back
  const v0 = F.b.vc;
  lathe((v) => [s * (0.165 - 0.025 * Math.sin(v * Math.PI) + 0.075 * Math.pow(Math.max(0, (v - 0.35) / 0.65), 1.2) - 0.06 * Math.max(0, v - 0.88) / 0.12) * k, hipY - 0.06 * s + v * 0.7 * s], (a) => 1 - 0.22 * Math.abs(Math.sin(a)));
  for (let i = v0; i < F.b.vc; i++) F.b.P[i * 3 + 2] += (o.lean ?? 0) * sat((F.b.P[i * 3 + 1] - hipY) / (0.6 * s));
  ball(pel, 0.17 * s * k, 1.15, 0.8, 0.9);
  ball(chest, 0.19 * s * k, 1.3, 0.75, 0.72);
  if (!o.headless) {
    limb([neck, [0, neck[1] + 0.08 * s, neck[2]]], [0.06 * s, 0.06 * s]);
    if (o.blockHead) block(0.26 * s, 0.32 * s, 0.26 * s, null, 0, neck[1] + 0.22 * s, neck[2], 4);
    else F.face([0, neck[1] + 0.19 * s, neck[2] + 0.01 * s], 0.115 * s, o.curls);
  } else F.stump(neck, [0, 1, 0], 0.062 * s, 0.07 * s);
  const shY = hipY + 0.6 * s;
  for (const sd of [-1, 1]) {
    if (o.missingArm === sd) { F.stump([sd * 0.2 * s * k, shY, chest[2]], [sd * 0.8, -0.6, 0], 0.07 * s, 0.06 * s); continue; }
    const sh = [sd * 0.22 * s * k, shY, chest[2]];
    const a = o.arms?.(sd) || { up: 0, fwd: 0.05, elbow: 0.1, out: 0.12 };
    const ua = [Math.sin(a.out) * sd, -Math.cos(a.up) , Math.sin(a.fwd)], l1 = 0.3 * s;
    const n1 = Math.hypot(...ua); const el = [sh[0] + ua[0] / n1 * l1, sh[1] + ua[1] / n1 * l1, sh[2] + ua[2] / n1 * l1];
    const fa = [ua[0] / n1 * Math.cos(a.elbow), ua[1] / n1 * Math.cos(a.elbow) + Math.sin(a.elbow) * (a.up > 1.5 ? -0.2 : 0.8), ua[2] / n1 + Math.sin(a.elbow) * 0.9];
    const n2 = Math.hypot(...fa), wr = [el[0] + fa[0] / n2 * 0.27 * s, el[1] + fa[1] / n2 * 0.27 * s, el[2] + fa[2] / n2 * 0.27 * s];
    limb([sh, el, wr], [0.072 * s * k, 0.056 * s * k, 0.045 * s * k]);
    ball(wr, 0.05 * s, 1, 1.3, 0.8);
  }
  for (const sd of [-1, 1]) {
    const hip = [sd * 0.1 * s * k, hipY - 0.03 * s, 0];
    let kn, an;
    if (o.seated) { kn = [hip[0], hipY + 0.02 * s, 0.42 * s]; an = [hip[0], 0.06 * s, 0.45 * s]; }
    else if (o.kneel) { kn = [hip[0], 0.06 * s, 0.12 * s]; an = [hip[0], 0.06 * s, -0.3 * s]; }
    else {
      const f = o.stride ? (sd === o.stride ? 0.12 : -0.05) : 0, bend = o.contra === sd ? 0.08 : 0;
      kn = [hip[0] * 1.05, hipY * 0.52, f * s + bend * s]; an = [hip[0] * 1.08, 0.08 * s, f * 1.6 * s];
    }
    if (o.brokenLegs) { F.stump(hip, [0, -1, 0.1], 0.09 * s * k, (hip[1] - kn[1]) * 0.5); continue; }
    limb([hip, kn, an], [0.105 * s * k, 0.07 * s * k, 0.05 * s * k]);
    block(0.11 * s, 0.07 * s, 0.24 * s, null, an[0], an[1] - 0.02 * s, an[2] + 0.07 * s, 5);
  }
  return { s, hipY, neck, shY, chest };
}

// --- styles ---
const STYLES = ['kouros', 'roman', 'pharaoh', 'meso', 'moai', 'sphinx', 'fragment', 'kore', 'roman', 'orator'];
export function statue(seed) {
  const F = mk(seed), { b, rng } = F;
  const style = STYLES[seed % STYLES.length];
  const dmg = rng();
  const headless = dmg < 0.15, missingArm = dmg > 0.15 && dmg < 0.4 ? (rng() < 0.5 ? -1 : 1) : 0, brokenLegs = dmg > 0.85;
  let name = 'Stone statue', plinth = true;
  if (style === 'kore') { // draped maiden: ankle-length chiton with deep vertical folds, a himation over one shoulder
    const J = human(F, { h: 1.7 + rng() * 0.5, slim: 0.85, headless, missingArm, curls: true, arms: (sd) => (sd === 1 ? { up: 0.5, fwd: 0.9, elbow: 1.1, out: 0.2 } : { up: 0.05, fwd: 0.05, elbow: 0.15, out: 0.1 }) });
    const folds = 11 + Math.floor(rng() * 6), top = J.hipY + 0.5 * J.s;
    F.lathe((v) => [J.s * (0.19 + 0.12 * v * v), top - v * (top - 0.03)], (a, v) => 1 + 0.09 * Math.sin(a * folds + v * 2) * (0.3 + v) - 0.14 * Math.abs(Math.sin(a)) * (1 - v), 20, 9);
    F.lathe((v) => [J.s * (0.215 + 0.04 * v), J.shY - v * 0.55 * J.s], (a, v) => 1 + 0.06 * Math.sin(a * 7 - v * 5) - 0.15 * Math.abs(Math.sin(a)), 16, 5);
    name = headless ? 'Headless kore' : 'Kore (draped maiden)';
  } else if (style === 'kouros' || style === 'orator' || style === 'roman') {
    const pose = rng();
    const arms = style === 'orator' ? (sd) => (sd === 1 ? { up: 2.2, fwd: 0.9, elbow: 0.3, out: 0.3 } : { up: 0.1, fwd: 0.1, elbow: 1.2, out: 0.1 })
      : pose < 0.3 ? (sd) => ({ up: 0.05, fwd: 0.05, elbow: 0.05, out: 0.08 })
        : pose < 0.55 ? (sd) => (sd === 1 ? { up: 0.3, fwd: 0.2, elbow: 1.4, out: 0.5 } : { up: 0.1, fwd: 0.1, elbow: 0.2, out: 0.1 })
          : pose < 0.75 ? (sd) => ({ up: 2.6, fwd: 0.3, elbow: 0.4, out: 0.5 })
            : (sd) => ({ up: 1.2, fwd: 1.2, elbow: 0.5, out: 0.2 });
    const kneel = pose > 0.9 && style !== 'roman';
    const J = human(F, { h: 1.8 + rng() * 0.8, slim: style === 'kouros' ? 0.9 : 1.05, stride: style === 'kouros' ? -1 : 0, contra: style !== 'kouros' ? 1 : 0, arms, headless, missingArm, brokenLegs, kneel, curls: style === 'kouros', lean: (rng() - 0.5) * 0.06 });
    if (style === 'orator' && !brokenLegs) { // himation wrapped from the left shoulder to the knees, diagonal folds
      F.lathe((v) => [J.s * (0.23 + 0.05 * v), J.shY + 0.02 * J.s - v * (J.shY - J.hipY * 0.5)], (a, v) => 1 + 0.08 * Math.sin(a * 9 + v * 6 + a * v * 3) - 0.16 * Math.abs(Math.sin(a)), 18, 8);
    }
    if (style === 'roman') { // draped robe to the plinth with folds, and a toga sash
      const folds = 9 + Math.floor(rng() * 7), top = J.hipY + 0.45 * J.s;
      F.lathe((v) => [J.s * (0.2 + 0.1 * v) * (1 + 0.05 * Math.sin(v * 7)), top - v * (top - 0.02)], (a, v) => 1 + 0.07 * Math.sin(a * folds + v * 3) * (0.4 + v) - 0.12 * Math.abs(Math.sin(a)) * (1 - v), 18, 8);
      F.limb([[0.19 * J.s, J.shY, 0.03], [0, J.hipY + 0.3 * J.s, 0.17 * J.s], [-0.17 * J.s, J.hipY + 0.05 * J.s, 0.1 * J.s]], [0.07 * J.s, 0.08 * J.s, 0.07 * J.s]);
      name = headless ? 'Headless Roman statue' : 'Roman draped statue';
    } else name = style === 'orator' ? 'Orator statue' : kneel ? 'Kneeling figure' : headless ? 'Headless kouros' : missingArm ? 'Kouros statue (arm lost)' : 'Kouros statue';
    if (brokenLegs) { name = 'Statue torso'; plinth = false; }
  } else if (style === 'pharaoh') {
    const J = human(F, { h: 2.2 + rng() * 0.8, seated: true, slim: 1.1, headless: false, arms: () => ({ up: 0.35, fwd: 0.9, elbow: 1.2, out: 0.05 }) });
    F.block(0.95 * J.s, 0.62 * J.s, 0.9 * J.s, null, 0, 0.31 * J.s, -0.05 * J.s, 8);    // throne seat
    F.block(0.95 * J.s, 1.3 * J.s, 0.18 * J.s, null, 0, 0.65 * J.s, -0.42 * J.s, 8);   // throne back
    const hy = J.neck[1] + 0.19 * J.s; // nemes headdress: flaring cloth + lappets
    F.lathe((v) => [J.s * (0.12 + 0.12 * v), hy + 0.13 * J.s - v * 0.32 * J.s], (a) => 1 + 0.4 * Math.max(0, -Math.sin(a)) - 0.1 * Math.abs(Math.cos(a)), 14, 4);
    for (const sd of [-1, 1]) F.block(0.07 * J.s, 0.3 * J.s, 0.05 * J.s, null, sd * 0.12 * J.s, hy - 0.25 * J.s, 0.1 * J.s, 6);
    name = 'Seated pharaoh statue'; plinth = false;
  } else if (style === 'meso') {
    const J = human(F, { h: 1.6 + rng() * 0.6, slim: 1.35, blockHead: true, arms: () => ({ up: 0.4, fwd: 1.0, elbow: 1.3, out: 0.05 }), headless, missingArm });
    F.block(0.55 * J.s, 0.22 * J.s, 0.32 * J.s, null, 0, J.neck[1] + 0.45 * J.s, 0, 3);  // headdress
    F.block(0.5 * J.s, 0.5 * J.s, 0.06 * J.s, null, 0, J.hipY + 0.35 * J.s, 0.18 * J.s, 4); // chest plaque
    name = 'Mesoamerican stone figure';
  } else if (style === 'moai') {
    const s = 1 + rng() * 0.6;
    F.block(1.1 * s, 1.5 * s, 0.75 * s, null, 0, 0.75 * s, 0, 4);
    b.blob(4, (x, y, z, o) => {
      let px = x * 0.5 * s, py = y * 1.0 * s, pz = z * 0.45 * s;
      if (z > 0) { pz += 0.18 * s * Math.exp(-(x * x) / 0.015) * sat((y + 0.2) * 2) * sat((0.6 - y) * 3); pz += 0.08 * s * sat((y - 0.25) * 6) * sat((0.55 - y) * 6); }
      py = py > 0.85 * s ? 0.85 * s + (py - 0.85 * s) * 0.2 : py;
      o[0] = px; o[1] = py + 2.45 * s; o[2] = pz; const c = 0.6 + 0.2 * vn3(x * 4, y * 4, z * 4, seed); o[3] = 0.45 * c; o[4] = 0.42 * c; o[5] = 0.4 * c; o[6] = 0.9; o[7] = F.key;
    });
    name = 'Moai'; plinth = false;
  } else if (style === 'sphinx') {
    const s = 0.9 + rng() * 0.6;
    F.limb([[0, 0.55 * s, -0.9 * s], [0, 0.6 * s, 0], [0, 0.62 * s, 0.7 * s]], [0.38 * s, 0.42 * s, 0.4 * s]);           // body
    for (const sd of [-1, 1]) {
      F.limb([[sd * 0.25 * s, 0.5 * s, 0.75 * s], [sd * 0.25 * s, 0.15 * s, 1.0 * s], [sd * 0.25 * s, 0.1 * s, 1.45 * s]], [0.13 * s, 0.11 * s, 0.1 * s]); // forelegs
      F.ball([sd * 0.3 * s, 0.4 * s, -0.8 * s], 0.35 * s, 0.7, 0.9, 1.2);                                                // haunch
    }
    F.limb([[0, 0.85 * s, 0.75 * s], [0, 1.25 * s, 0.95 * s]], [0.2 * s, 0.17 * s]);                                    // neck
    if (!headless) {
      F.ball([0, 1.42 * s, 1.0 * s], 0.2 * s, 0.9, 1.1, 1);
      F.lathe((v) => [s * (0.16 + 0.18 * v), 1.6 * s - v * 0.45 * s], (a) => 1 + 0.35 * Math.max(0, -Math.sin(a)), 12, 3);
    }
    name = headless ? 'Headless sphinx' : 'Sphinx'; plinth = false;
  } else { // fragments: colossal hand or foot, or torso
    const r = rng(), s = 1 + rng() * 1.5;
    if (r < 0.4) {
      F.block(0.5 * s, 0.16 * s, 0.6 * s, null, 0, 0.08 * s, 0, 4);
      for (let k = 0; k < 4; k++) F.limb([[(-0.18 + k * 0.12) * s, 0.1 * s, 0.28 * s], [(-0.18 + k * 0.12) * s, 0.1 * s + rng() * 0.08 * s, (0.5 + 0.05 * (k % 3)) * s]], [0.055 * s, 0.05 * s]);
      F.limb([[0.25 * s, 0.1 * s, 0.05 * s], [0.42 * s, 0.12 * s, 0.25 * s]], [0.06 * s, 0.05 * s]);
      name = 'Colossal hand fragment';
    } else if (r < 0.75) {
      F.block(0.45 * s, 0.3 * s, 0.9 * s, null, 0, 0.15 * s, 0, 4);
      F.limb([[0, 0.25 * s, -0.3 * s], [0, 0.75 * s, -0.38 * s]], [0.2 * s, 0.17 * s]);
      for (let k = 0; k < 5; k++) F.ball([(-0.16 + k * 0.08) * s, 0.08 * s, (0.47 - Math.abs(k - 1) * 0.02) * s], 0.05 * s * (k === 0 ? 1.4 : 1));
      name = 'Colossal foot fragment';
    } else {
      human(F, { h: 2.4, brokenLegs: true, headless: true, missingArm: 1, arms: () => ({ up: 0.1, fwd: 0.2, elbow: 0.3, out: 0.1 }) });
      name = 'Marble torso'; plinth = false;
    }
    plinth = false;
  }
  if (plinth) F.block(0.8 + rng() * 0.3, 0.3 + rng() * 0.25, 0.7 + rng() * 0.2, rotY((rng() - 0.5) * 0.1), 0, -0.12, 0.05, 8);
  // ~25% have toppled: lying on the back or on a side
  const fall = rng();
  if (fall < 0.25 && style !== 'moai' && style !== 'sphinx' && style !== 'fragment') {
    b.xform(0, fall < 0.13 ? rotX(-Math.PI / 2) : rotZ(Math.PI / 2 * (fall < 0.19 ? 1 : -1)), 0, 0, 0);
    name = 'Fallen ' + name.charAt(0).toLowerCase() + name.slice(1);
  }
  erode(b, seed);
  settle(b);
  const t = b.build();
  t.label = name; t.style = style;
  return t;
}
