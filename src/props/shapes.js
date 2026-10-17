// Shared procedural shape generators (rocks, stones, branching structures and common organisms).
// Every function returns a Template, built once at startup. Colours are linear RGB; most are near-neutral
// so per-instance tints provide the hue. aFx semantics: see materials.js.
import { Builder, TAU, fbm3, vn3, sat, sstep, lerp } from './core.js';
import { mulberry32 } from '../noise.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotAxis(v, k, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = v[0] * k[0] + v[1] * k[1] + v[2] * k[2], x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}
function perp(d, rng) {
  const r = norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
  return norm(cross(d, r));
}

// ---------- rocks ----------
export function rockInto(b, seed, { detail = 3, sx = 1, sy = 0.7, sz = 1, rough = 0.38, flat = 0.3, growth = 0.6, col = [0.85, 0.83, 0.8], strata = 0 } = {}) {
  const v0 = b.vc, ox = (seed * 3.71) % 17;
  b.blob(detail, (x, y, z, o) => {
    let d = 1 + rough * fbm3(x * 1.1 + ox, y * 1.1, z * 1.1, 3, seed) + 0.09 * vn3(x * 4.3 + ox, y * 4.3, z * 4.3, seed + 3);
    if (strata) d += strata * Math.abs(Math.sin(y * 7 + vn3(x * 2, y * 2, z * 2, seed + 9) * 2)) - strata * 0.5;
    let px = x * d * sx, py = y * d * sy, pz = z * d * sz;
    const fl = -flat * sy;
    if (py < fl) py = fl + (py - fl) * 0.12;
    o[0] = px; o[1] = py - fl; o[2] = pz;
  });
  let top = 0;
  for (let i = v0; i < b.vc; i++) top = Math.max(top, b.P[i * 3 + 1]);
  b.paint(v0, (i, x, y, z, nx, ny, nz, o) => {
    const h = sat(y / (top * 0.6 + 1e-3));
    const ao = (0.4 + 0.6 * sstep(0, 1, h)) * (0.75 + 0.25 * Math.max(0, ny));
    const v = 0.85 + 0.3 * vn3(x * 3, y * 3, z * 3, seed + 21);
    o[0] = col[0] * ao * v; o[1] = col[1] * ao * v; o[2] = col[2] * ao * v;
    o[3] = growth * sstep(0.1, 0.7, ny); o[4] = 0;
  });
  return v0;
}
export function rock(seed, opts) { const b = new Builder(); rockInto(b, seed, opts); return b.build(); }

// superquadric "rounded box" stone, centred at origin (full sizes sx, sy, sz)
export function stoneInto(b, { sx = 1, sy = 1, sz = 1, p = 6, rough = 0.05, seed = 0, detail = 2, col = [0.8, 0.77, 0.7], growth = 0.8, mode = 0 } = {}) {
  const v0 = b.vc;
  b.blob(detail, (x, y, z, o) => {
    const k = Math.pow(Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p) + Math.pow(Math.abs(z), p), 1 / p);
    const d = 1 + rough * fbm3(x * 2.1 + seed * 0.37, y * 2.1, z * 2.1, 2, seed);
    o[0] = (x / k) * d * sx * 0.5; o[1] = (y / k) * d * sy * 0.5; o[2] = (z / k) * d * sz * 0.5;
  });
  b.paint(v0, (i, x, y, z, nx, ny, nz, o) => {
    const v = 0.85 + 0.25 * vn3(x * 2.3 + seed, y * 2.3, z * 2.3, seed + 4);
    const ao = 0.7 + 0.3 * sat(y / (sy * 0.5) * 0.5 + 0.5);
    o[0] = col[0] * v * ao; o[1] = col[1] * v * ao; o[2] = col[2] * v * ao; o[3] = growth; o[4] = mode;
  });
  return v0;
}

// ---------- recursive branching (corals, fans, trees, soft corals) ----------
// spec: depth, len, rad, radial, segs, kids [min,max], spread, up, wiggle, lenK, radK, tipK, plane (bool),
//       childAt [a,b], paint(level, v, x,y,z,o) (o = grid out array), tip (bool), onTip(p, dir, level)
export function branchesInto(b, rng, spec, start = [0, 0, 0], dir0 = [0, 1, 0]) {
  const grow = (p, d, len, rad, level) => {
    const segs = spec.segs, pts = [p], radii = [rad];
    let c = p, dir = d;
    const last = level >= spec.depth;
    const tipR = last ? rad * (spec.tipK ?? 0.5) : rad * spec.radK;
    for (let i = 1; i <= segs; i++) {
      let w = [(rng() - 0.5) * spec.wiggle, (rng() - 0.5) * spec.wiggle + spec.up, spec.plane ? 0 : (rng() - 0.5) * spec.wiggle];
      if (spec.gravity) w[1] -= spec.gravity * (i / segs);
      dir = norm([dir[0] + w[0], dir[1] + w[1], dir[2] + w[2]]);
      c = [c[0] + dir[0] * len / segs, c[1] + dir[1] * len / segs, c[2] + dir[2] * len / segs];
      if (spec.plane) c[2] = spec.curve ? spec.curve * c[0] * c[0] : 0;
      pts.push(c); radii.push(lerp(rad, tipR, i / segs));
    }
    b.tube(pts, radii, spec.radial, (v, a, x, y, z, o, j) => spec.paint(level, j / segs, x, y, z, o), { tip: last && spec.tip !== false });
    if (spec.onTip && last) spec.onTip(c, dir, level);
    if (!last) {
      const nk = spec.kids[0] + Math.floor(rng() * (spec.kids[1] - spec.kids[0] + 1));
      for (let k = 0; k < nk; k++) {
        const t = lerp(spec.childAt[0], spec.childAt[1], nk === 1 ? 1 : k / (nk - 1)) * (0.92 + rng() * 0.08);
        const ji = Math.min(segs, Math.max(1, Math.round(t * segs)));
        const axis = spec.plane ? [0, 0, (k % 2 ? 1 : -1)] : perp(dir, rng);
        const ang = spec.spread * (0.6 + 0.6 * rng());
        const nd = rotAxis(dir, axis, ang);
        grow(pts[ji], nd, len * spec.lenK * (0.75 + 0.5 * rng()), radii[ji] * (spec.childRad ?? 0.85), level + 1);
      }
      if (spec.continueTrunk) grow(c, dir, len * spec.lenK, tipR, level + 1);
    }
  };
  grow(start, norm(dir0), spec.len, spec.rad, 0);
}

// ---------- common organisms ----------
export function urchin(seed, { spines = 46, len = 1.3, body = [0.32, 0.26, 0.34] } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  b.blob(1, (x, y, z, o) => {
    o[0] = x; o[1] = 0.55 + y * (y < 0 ? 0.45 : 0.75); o[2] = z;
    o[3] = body[0]; o[4] = body[1]; o[5] = body[2];
  });
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < spines; i++) {
    const yy = 1 - (i / (spines - 1)) * 1.4, r = Math.sqrt(Math.max(0, 1 - yy * yy)), th = ga * i;
    const d = norm([Math.cos(th) * r + (rng() - 0.5) * 0.2, yy, Math.sin(th) * r + (rng() - 0.5) * 0.2]);
    const base = [d[0] * 0.85, 0.55 + d[1] * 0.6, d[2] * 0.85];
    const L = len * (0.7 + 0.5 * rng());
    const apex = [base[0] + d[0] * L, base[1] + d[1] * L, base[2] + d[2] * L];
    const p1 = perp(d, rng), p2 = cross(d, p1), w = 0.07;
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU, c = Math.cos(a), s = Math.sin(a);
      const n = norm([p1[0] * c + p2[0] * s + d[0] * 0.3, p1[1] * c + p2[1] * s + d[1] * 0.3, p1[2] * c + p2[2] * s + d[2] * 0.3]);
      v.push(b.v(base[0] + (p1[0] * c + p2[0] * s) * w, base[1] + (p1[1] * c + p2[1] * s) * w, base[2] + (p1[2] * c + p2[2] * s) * w, n[0], n[1], n[2], body[0], body[1], body[2]));
    }
    const ap = b.v(apex[0], apex[1], apex[2], d[0], d[1], d[2], body[0] * 1.5, body[1] * 1.4, body[2] * 1.5);
    for (let k = 0; k < 3; k++) b.t(v[k], v[(k + 1) % 3], ap);
  }
  return b.build();
}

export function seastar(seed, { arms = 5, fat = 2.2, detail = 3 } = {}) {
  const b = new Builder(), rot = (seed % 7) * 0.3;
  b.blob(detail, (x, y, z, o) => {
    const th = Math.atan2(z, x) + rot, h = Math.hypot(x, z);
    const arm = Math.pow(Math.abs(Math.cos((arms * th) / 2)), fat);
    const R = 0.22 + 0.78 * arm;
    const rr = h * R;
    const thick = 0.2 * (1 - 0.65 * rr) + 0.03;
    let py = y * thick; if (py < 0) py *= 0.35;
    py += 0.06 * rr * rr + thick * 0.35;
    o[0] = (x * R); o[1] = py; o[2] = (z * R);
    const ao = y < 0 ? 0.45 : 0.9 + 0.2 * arm;
    o[3] = o[4] = o[5] = ao; o[6] = 0; o[7] = 2;
  });
  return b.build();
}

export function anemone(seed, { tentacles = 52, tlen = 0.55, rows = 3, body = [0.55, 0.42, 0.38], tent = [0.7, 0.9, 0.6], tipC = [1.2, 1.1, 1.3], disc = 0.3, height = 0.25, thick = 0.035 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  b.lathe(12, 3, (v) => [disc * (0.85 + 0.25 * v + (v > 0.9 ? 0.05 : 0)), v * height], null, (v, a, x, y, z, o) => {
    const ao = 0.45 + 0.55 * v; o[3] = body[0] * ao; o[4] = body[1] * ao; o[5] = body[2] * ao; o[6] = 0.02 * v; o[7] = 0;
  });
  // oral disc
  const c = b.v(0, height + 0.02, 0, 0, 1, 0, body[0] * 0.8, body[1] * 0.7, body[2] * 0.8);
  const ring = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ring.push(b.v(Math.cos(a) * disc * 1.1, height, Math.sin(a) * disc * 1.1, 0, 1, 0, body[0], body[1], body[2])); }
  for (let i = 0; i < 12; i++) b.t(ring[(i + 1) % 12], ring[i], c);
  for (let i = 0; i < tentacles; i++) {
    const row = i % rows, a = (i / tentacles) * TAU + row * 0.4 + rng() * 0.1;
    const rr = disc * (0.45 + 0.6 * (row + 1) / rows);
    const out = [Math.cos(a), 0, Math.sin(a)];
    let d = norm([out[0] * (0.35 + row * 0.25), 1, out[2] * (0.35 + row * 0.25)]);
    let p = [out[0] * rr, height, out[2] * rr];
    const L = tlen * (0.75 + 0.5 * rng()) * (1 - row * 0.12), pts = [p], radii = [thick];
    for (let k = 1; k <= 3; k++) {
      d = norm([d[0] + out[0] * 0.45, d[1] - 0.24, d[2] + out[2] * 0.45]);
      p = [p[0] + d[0] * L / 3, p[1] + d[1] * L / 3, p[2] + d[2] * L / 3];
      pts.push(p); radii.push(thick * (1 - k / 4));
    }
    b.tube(pts, radii, 3, (v, ang, x, y, z, o) => {
      const t = v; o[3] = lerp(tent[0], tipC[0] * tent[0], t); o[4] = lerp(tent[1], tipC[1] * tent[1], t); o[5] = lerp(tent[2], tipC[2] * tent[2], t);
      o[6] = 0.045 * Math.pow(t, 1.4) * (L / 0.5); o[7] = 3;
    }, { tip: true });
  }
  return b.build();
}

export function tubeSponges(seed, { n = 4, h = 1, r = 0.12 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const hh = h * (0.5 + 0.6 * rng()), rr = r * (0.75 + 0.5 * rng());
    const ox = k === 0 ? 0 : (rng() - 0.5) * r * 5, oz = k === 0 ? 0 : (rng() - 0.5) * r * 5;
    const lean = [(rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25];
    const v0 = b.vc;
    const prof = (v) => rr * (0.8 + 0.3 * v + 0.06 * Math.sin(v * 9 + k));
    b.lathe(10, 6, (v) => [prof(v), v * hh], (a, v) => 1 + 0.05 * vn3(Math.cos(a) * 2, v * 4, Math.sin(a) * 2, seed + k), (v, a, x, y, z, o) => {
      const ao = 0.35 + 0.65 * sstep(0, 0.5, v); o[3] = o[4] = o[5] = ao; o[6] = 0; o[7] = 2;
    });
    // rim
    b.grid(10, 1, (u, v, i, j, o) => {
      const a = u * TAU, R = lerp(prof(1), prof(1) * 0.75, v);
      o[0] = Math.cos(a) * R; o[1] = hh + 0.005; o[2] = Math.sin(a) * R; o[3] = o[4] = o[5] = 1.05; o[7] = 2;
    }, { wrapU: true });
    // inner wall (dark)
    b.lathe(10, 2, (v) => [prof(1 - v * 0.6) * 0.75, hh * (1 - v * 0.6)], null, (v, a, x, y, z, o) => {
      const d = 0.5 - 0.42 * v; o[3] = o[4] = o[5] = d;
    }, { flip: true });
    for (let i = v0; i < b.vc; i++) {
      const y = b.P[i * 3 + 1] / hh;
      b.P[i * 3] += ox + lean[0] * y * hh; b.P[i * 3 + 2] += oz + lean[1] * y * hh;
    }
  }
  return b.build();
}

export function softCoral(seed, { h = 0.8 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  const lobes = [];
  branchesInto(b, rng, {
    depth: 2, len: h * 0.45, rad: h * 0.06, radial: 5, segs: 2, kids: [2, 3], spread: 0.6, up: 0.25, wiggle: 0.35,
    lenK: 0.6, radK: 0.7, tipK: 0.6, childAt: [0.45, 1], tip: false,
    paint(level, v, x, y, z, o) { const t = sat(y / h); o[3] = o[4] = o[5] = 1.0 + 0.25 * t; o[6] = 0.06 * h * t * t; o[7] = 0; },
    onTip(p) { lobes.push(p); },
  });
  for (const p of lobes) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const s = h * (0.08 + 0.06 * rng()), q = [p[0] + (rng() - 0.5) * s * 1.6, p[1] + (rng() - 0.2) * s * 1.2, p[2] + (rng() - 0.5) * s * 1.6];
      b.blob(0, (x, y, z, o) => {
        const d = 1 + 0.25 * vn3(x * 3 + k, y * 3, z * 3, seed);
        o[0] = q[0] + x * s * d; o[1] = q[1] + y * s * d * 0.85; o[2] = q[2] + z * s * d;
        const t = sat(o[1] / h);
        o[3] = 0.9 + 0.3 * Math.max(0, y); o[4] = o[3] * 0.97; o[5] = o[3]; o[6] = 0.06 * h * t * t; o[7] = 0;
      });
    }
  }
  return b.build();
}

export function leatherCoral(seed) {
  const b = new Builder();
  b.lathe(10, 3, (v) => [0.12 + 0.03 * v, v * 0.22], null, (v, a, x, y, z, o) => { o[3] = o[4] = o[5] = 0.55 + 0.4 * v; o[6] = 0.01 * v; });
  const cap = (top) => b.grid(24, 5, (u, v, i, j, o) => {
    const a = u * TAU, r = (top ? v : 1 - v) * (0.45 + 0.05 * Math.sin(a * 3 + seed));
    const fold = 0.07 * Math.sin(a * 7 + seed) * r * r * 4;
    o[0] = Math.cos(a) * r; o[1] = 0.22 + 0.06 * r + fold + (top ? 0.035 * (1 - r) : -0.01); o[2] = Math.sin(a) * r;
    const c = top ? 0.95 + 0.15 * (1 - r) : 0.45; o[3] = o[4] = o[5] = c; o[6] = 0.03 * r; o[7] = top ? 2 : 0;
  }, { wrapU: true, flip: true });
  cap(true); cap(false);
  return b.build();
}

export function seaFan(seed, { h = 1.2 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  branchesInto(b, rng, {
    depth: 3, len: h * 0.34, rad: h * 0.026, radial: 3, segs: 2, kids: [2, 2], spread: 0.6, up: 0.18, wiggle: 0.3,
    lenK: 0.78, radK: 0.72, tipK: 0.5, childAt: [0.55, 1], plane: true, curve: 0.08, childRad: 0.9,
    paint(level, v, x, y, z, o) { const t = sat(y / h); o[3] = o[4] = o[5] = 0.55 + 0.45 * t; o[6] = 0.1 * h * Math.pow(t, 1.5); o[7] = 0; },
  });
  // lattice sheet (style 4 => netted by the shader), fan outline with irregular rim
  const W = h * (0.55 + 0.15 * rng());
  b.grid(12, 8, (u, v, i, j, o) => {
    const a = (u - 0.5) * 2.3, rim = 1 + 0.12 * Math.sin(u * 17 + seed) + 0.08 * Math.sin(u * 7 + seed * 3);
    const r = h * 0.12 + v * (h * 0.95 - h * 0.12) * rim;
    const x = Math.sin(a) * r * (W / h) * 1.15, y = Math.cos(a) * r * 0.95 + h * 0.05;
    o[0] = x; o[1] = y; o[2] = 0.08 * x * x + 0.01 * Math.sin(x * 9 + y * 7);
    const t = sat(y / h); o[3] = o[4] = o[5] = 0.6 + 0.45 * t; o[6] = 0.1 * h * Math.pow(t, 1.5); o[7] = 4;
  });
  return b.build();
}

export function seaWhips(seed, { n = 5, h = 1.4 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const L = h * (0.5 + 0.6 * rng()), a = rng() * TAU, lean = 0.15 + rng() * 0.3;
    let d = norm([Math.cos(a) * lean, 1, Math.sin(a) * lean]), p = [(rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06];
    const pts = [p], radii = [0.016];
    for (let i = 1; i <= 7; i++) {
      d = norm([d[0] + Math.cos(a) * 0.05, d[1], d[2] + Math.sin(a) * 0.05]);
      p = [p[0] + d[0] * L / 7, p[1] + d[1] * L / 7, p[2] + d[2] * L / 7];
      pts.push(p); radii.push(0.016 * (1 - i / 8.5));
    }
    b.tube(pts, radii, 4, (v, ang, x, y, z, o) => { o[3] = o[4] = o[5] = 0.7 + 0.4 * v; o[6] = 0.22 * L * v * v; o[7] = 0; }, { tip: true });
  }
  return b.build();
}

export function musselBed(seed, { n = 55, r = 0.6, col = [0.08, 0.085, 0.12], edge = [0.35, 0.28, 0.15], len = 0.07 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const rr = r * Math.sqrt(rng()), a = rng() * TAU, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const yaw = rng() * TAU, up = 0.3 + rng() * 0.9, s = len * (0.6 + 0.6 * rng());
    const dir = norm([Math.cos(yaw), up, Math.sin(yaw)]), side = norm(cross(dir, [0, 1, 0]));
    const nrm = cross(side, dir);
    const hgt = (1 - rr / r) * 0.04;
    b.blob(1, (x, y, z, o) => {
      const t = x; // along length
      const w = 0.42 * (1 - 0.35 * t) * Math.sqrt(Math.max(0, 1 - t * t * 0.2));
      const lx = t * 0.5 * s, ly = y * w * 0.5 * s * 0.8, lz = z * w * 0.5 * s;
      o[0] = cx + dir[0] * lx + nrm[0] * ly + side[0] * lz;
      o[1] = hgt + 0.012 + dir[1] * lx + nrm[1] * ly + side[1] * lz;
      o[2] = cz + dir[2] * lx + nrm[2] * ly + side[2] * lz;
      const e = sstep(0.6, 1, Math.abs(z)) * 0.6;
      o[3] = lerp(col[0], edge[0], e); o[4] = lerp(col[1], edge[1], e); o[5] = lerp(col[2], edge[2], e); o[7] = 0;
    });
  }
  return b.build();
}

export function barnacles(seed, { n = 36, r = 0.35 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const rr = r * Math.sqrt(rng()), a = rng() * TAU, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, s = 0.6 + 0.8 * rng();
    const v0 = b.vc;
    b.lathe(7, 2, (v) => [lerp(0.024, 0.011, v), 0.02 * Math.sqrt(v)], (ang) => 1 + 0.12 * Math.sin(ang * 6),
      (v, ang, x, y, z, o) => { o[3] = 0.82 - 0.2 * v; o[4] = 0.8 - 0.2 * v; o[5] = 0.74 - 0.2 * v; });
    const c = b.v(0, 0.012, 0, 0, 1, 0, 0.12, 0.1, 0.1);
    const top = v0 + 7 * 2;
    for (let i = 0; i < 7; i++) b.t(top + ((i + 1) % 7), top + i, c);
    b.xform(v0, [1, 0, 0, 0, 1, 0, 0, 0, 1], cx, 0, cz, s, s, s);
  }
  return b.build();
}

export function snail(seed, { col = [0.35, 0.26, 0.18] } = {}) {
  const b = new Builder();
  b.lathe(9, 6, (v) => [0.5 * Math.pow(1 - v, 0.8) + 0.02, v * 0.9], (a, v) => 1 + 0.12 * Math.sin(a + v * 22), (v, a, x, y, z, o) => {
    const band = 0.75 + 0.35 * Math.sin(a + v * 22 + 1);
    o[3] = col[0] * band; o[4] = col[1] * band; o[5] = col[2] * band; o[7] = 2;
  });
  return b.build();
}

// seagrass / surfgrass patch: n ribbon blades in a disc of radius r. sway style 2.
export function grassPatch(seed, { n = 16, r = 0.6, h = 0.55, w = 0.022, segs = 3, base = [0.06, 0.12, 0.04], mid = [0.2, 0.42, 0.1], tipc = [0.42, 0.42, 0.16], sway = 0.18 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const rr = r * Math.sqrt(rng()), a = rng() * TAU, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const L = h * (0.55 + 0.7 * rng()), lean = rng() * TAU, la = 0.1 + rng() * 0.35, face = rng() * TAU;
    const lx = Math.cos(lean), lz = Math.sin(lean);
    const fx = Math.cos(face), fz = Math.sin(face); // ribbon width direction
    const ww = w * (0.7 + 0.6 * rng());
    let px = cx, py = 0, pz = cz, ang = la;
    const rows = [];
    for (let i = 0; i <= segs; i++) {
      rows.push([px, py, pz, i / segs]);
      ang += 0.25 + 0.2 * rng();
      const st = L / segs;
      px += Math.sin(ang) * lx * st; pz += Math.sin(ang) * lz * st; py += Math.cos(ang) * st;
    }
    for (let i = 0; i <= segs; i++) {
      const [x, y, z, t] = rows[i], wt = ww * (i === segs ? 0.25 : 1 - 0.3 * t);
      const c = t < 0.5 ? [lerp(base[0], mid[0], t * 2), lerp(base[1], mid[1], t * 2), lerp(base[2], mid[2], t * 2)]
        : [lerp(mid[0], tipc[0], (t - 0.5) * 2), lerp(mid[1], tipc[1], (t - 0.5) * 2), lerp(mid[2], tipc[2], (t - 0.5) * 2)];
      const sw = sway * L * Math.pow(t, 1.5);
      const nx = -fz * 0.45, nz = fx * 0.45; // normals biased upward for soft lighting
      b.v(x - fx * wt, y, z - fz * wt, nx, 0.9, nz, c[0], c[1], c[2], sw, 2);
      b.v(x + fx * wt, y, z + fz * wt, nx, 0.9, nz, c[0], c[1], c[2], sw, 2);
    }
    const v0 = b.vc - (segs + 1) * 2;
    for (let i = 0; i < segs; i++) { const a0 = v0 + i * 2; b.t(a0, a0 + 1, a0 + 2); b.t(a0 + 1, a0 + 3, a0 + 2); }
  }
  // normalise normals
  for (let i = 0; i < b.N.length; i += 3) { const l = Math.hypot(b.N[i], b.N[i + 1], b.N[i + 2]); b.N[i] /= l; b.N[i + 1] /= l; b.N[i + 2] /= l; }
  return b.build();
}

// small branching tuft (coralline algae, bryozoans), pink by tint
export function tuft(seed, { h = 0.12, depth = 3 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < 3; k++) {
    branchesInto(b, rng, {
      depth, len: h * 0.4, rad: h * 0.05, radial: 3, segs: 1, kids: [2, 2], spread: 0.5, up: 0.2, wiggle: 0.3,
      lenK: 0.75, radK: 0.8, tipK: 0.7, childAt: [1, 1],
      paint(level, v, x, y, z, o) { o[3] = o[4] = o[5] = 0.7 + 0.5 * sat(y / h); },
    }, [(rng() - 0.5) * h * 0.6, 0, (rng() - 0.5) * h * 0.6], [(rng() - 0.5) * 0.6, 1, (rng() - 0.5) * 0.6]);
  }
  return b.build();
}

// wavy translucent sheets (sea lettuce, Ulva). sway style 0.
export function seaLettuce(seed, { n = 4, s = 0.25 } = {}) {
  const b = new Builder(), rng = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const yaw = rng() * TAU, up = 0.5 + rng() * 0.6, L = s * (0.6 + 0.7 * rng());
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    b.grid(5, 4, (u, v, i, j, o) => {
      const wdt = L * 0.55 * Math.sin(Math.min(1, v * 1.3 + 0.15) * Math.PI) * (u - 0.5) * 2;
      const ruffle = 0.04 * L * Math.sin(u * 13 + v * 7 + k) * v;
      const along = v * L, lift = along * up;
      const lx = along * Math.sqrt(Math.max(0, 1 - up * up * 0.5));
      const x = cy * lx - sy * wdt, z = sy * lx + cy * wdt;
      o[0] = x + ruffle * sy; o[1] = lift * 0.7 + ruffle + 0.01; o[2] = z - ruffle * cy;
      o[3] = 0.25 + 0.15 * v; o[4] = 0.62 + 0.25 * v; o[5] = 0.12 + 0.05 * v; o[6] = 0.05 * v; o[7] = 0;
    });
  }
  return b.build();
}
