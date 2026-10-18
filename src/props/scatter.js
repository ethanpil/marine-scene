// Placement helpers shared by the biome populators.
import { orient, propClear, TAU } from './core.js';

export function pickW(rng, list) {
  let tot = 0;
  for (const e of list) tot += e.w;
  let r = rng() * tot;
  for (const e of list) { r -= e.w; if (r <= 0) return e; }
  return list[list.length - 1];
}
export const pick = (rng, a) => a[(rng() * a.length) | 0];

// spec: { tpl: Template|Template[], scale: [a,b], ys: [a,b] (y-stretch), xz (depth-stretch amount), follow, sink,
//         tint(rng) -> rgb, sway (bool: scale fx by size), fa, grow [a,b], tilt, maxSlope, minK,
//         giant (probability of a rare 2.2-3x showpiece, labelled "Giant ...") }
// Every placement also gets mild default non-uniform scale, lean and a per-instance texture-key offset.
// Places at explicit y with normal n. Returns the placed scale, or 0 if rejected.
// Seat an item on the visible floor: sample the exact floor mesh under its bottom footprint (lowest box
// corners, plus a grid over the base for big upright items) and return the y that leaves no gap anywhere.
export function groundY(fs, x, s, tpl, R, sx, sy, sz) {
  const [x0, y0, z0, x1, y1, z1] = tpl.box;
  const P = [];
  for (const cx of [x0, x1]) for (const cy of [y0, y1]) for (const cz of [z0, z1]) P.push([cx * sx, cy * sy, cz * sz]);
  const w = P.map((p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]);
  let mn = 1e9, mx = -1e9;
  for (const q of w) { mn = Math.min(mn, q[1]); mx = Math.max(mx, q[1]); }
  const thr = mn + 0.3 * (mx - mn) + 1e-3;
  let y = 1e9;
  for (const q of w) if (q[1] <= thr) y = Math.min(y, fs.at(x + q[0], s - q[2]) - q[1]);
  // grid across the base of large, upright items (terrace edges, uneven ground)
  const ext = Math.max((x1 - x0) * sx, (z1 - z0) * sz);
  if (R[4] > 0.6 && ext > 0.5) {
    const n = ext > 8 ? 8 : ext > 3 ? 4 : 2;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const lx = (x0 + (x1 - x0) * i / n) * sx, lz = (z0 + (z1 - z0) * j / n) * sz, ly = y0 * sy;
      const ox = R[0] * lx + R[1] * ly + R[2] * lz, oy = R[3] * lx + R[4] * ly + R[5] * lz, oz = R[6] * lx + R[7] * ly + R[8] * lz;
      y = Math.min(y, fs.at(x + ox, s - oz) - oy);
    }
  }
  return y;
}

export function putAt(ctx, batch, spec, x, y, s, nx, ny, nz, rng, sizeK = 1, fs = null) {
  const tpl = Array.isArray(spec.tpl) ? spec.tpl[(rng() * spec.tpl.length) | 0] : spec.tpl;
  if (spec.maxSlope && ny < spec.maxSlope) return 0;
  let sc = (spec.scale[0] + (spec.scale[1] - spec.scale[0]) * Math.pow(rng(), 1.3)) * sizeK;
  const giant = spec.giant && rng() < spec.giant;
  if (giant) sc *= 2.2 + rng() * 0.8;
  const ys = spec.ys ? spec.ys[0] + (spec.ys[1] - spec.ys[0]) * rng() : 0.85 + rng() * 0.32;
  const minSc = spec.scale[0] * (spec.minK ?? 0.35);
  const zs = 1 + (rng() - 0.5) * (spec.xz ?? 0.3);
  const top = ctx.surfaceY - 0.08;
  const tilt = spec.tilt ?? ((spec.follow ?? 0.6) >= 0.95 ? 0.03 : 0.14);
  const yaw = spec.yaw !== undefined ? spec.yaw + (rng() - 0.5) * (spec.yawJ ?? 0.15) : rng() * TAU;
  const R = spec.R || orient(nx, ny, nz, spec.follow ?? 0.6, yaw, (rng() - 0.5) * tilt, (rng() - 0.5) * tilt);
  const lean = Math.sqrt(R[1] * R[1] + R[7] * R[7]), up = Math.max(0.2, R[4]); // tilted items reach sideways
  let ok = false;
  for (let t = 0; t < 4; t++) {
    const h = tpl.maxY * sc * ys;
    if (y + h * up < top && propClear(ctx, x, s, y, y + h * up + tpl.r * sc * lean, tpl.r * sc * Math.max(1, zs) + h * lean, spec.sway || spec.soft)) { ok = true; break; }
    sc *= 0.65;
    if (sc < minSc) break;
  }
  if (!ok) return 0;
  const c = spec.tint ? spec.tint(rng) : [1, 1, 1];
  let sink = (spec.sink ?? 0.04) * sc * ys + (1 - ny) * tpl.r * sc * 0.5;
  if (fs) { // seat on the floor mesh under the whole footprint, then embed slightly
    const hgt = (tpl.box[4] - tpl.box[1]) * sc * ys;
    y = groundY(fs, x, s, tpl, R, sc, sc * ys, sc * zs);
    sink = Math.min((spec.sink ?? 0.04) * sc * ys, 0.2 * hgt) + 0.01;
  }
  const fa = (spec.sway ? sc : 1) * (spec.fa ?? 1) * (spec.grow ? spec.grow[0] + (spec.grow[1] - spec.grow[0]) * rng() : 0.5 + rng());
  if (!batch.add(tpl, x, y - sink, -(s - ctx.s0), R, sc, sc * ys, sc * zs, c[0], c[1], c[2], fa)) return 0;
  if (fs) batch.items[batch.items.length - 1].g = 1;
  batch.tag(rng(), giant && tpl.label ? 'Giant ' + tpl.label.charAt(0).toLowerCase() + tpl.label.slice(1) : null);
  return sc;
}

export function putFloor(ctx, fs, batch, spec, x, s, rng, sizeK = 1) {
  const y = fs.at(x, s);
  return putAt(ctx, batch, spec, x, y, s, fs.nx, fs.ny, fs.nz, rng, sizeK, fs);
}

// random spot in chunk at lateral distance in [d0, d1] from the path (bias > 1 favours near)
export function spot(ctx, rng, d0, d1, bias = 1) {
  const s = ctx.s0 + rng() * 64;
  const d = d0 + (d1 - d0) * Math.pow(rng(), bias);
  const side = rng() < 0.5 ? -1 : 1;
  return { s, x: ctx.pathX(s) + side * d, d, side };
}

// tint helpers: pick a base colour and jitter value, saturation and hue per instance
export function tintFrom(list, amt = 0.15) {
  return (rng) => {
    const c = list[(rng() * list.length) | 0], k = 1 + (rng() - 0.5) * 2.4 * amt;
    const l = (c[0] + c[1] + c[2]) / 3, sat = 1 + (rng() - 0.5) * 3 * amt;
    const h = (rng() - 0.5) * 1.6 * amt; // small hue shift: rotate energy between channels
    const r = l + (c[0] - l) * sat, g = l + (c[1] - l) * sat, b = l + (c[2] - l) * sat;
    return [Math.max(0, (r + h * (g - b)) * k), Math.max(0, (g + h * (b - r)) * k), Math.max(0, (b + h * (r - g)) * k)];
  };
}

// Natural, non-grid distribution: clusters of varied size and count with gaps, occasional singletons,
// and patch-to-patch density from a noise field. next() -> {x, s, d} or null (rejected by density).
export function clusterer(ctx, rng, d0, d1, bias = 1.2, { r: [r0, r1] = [0.6, 4], n: [n0, n1] = [2, 12], single = 0.15, patch = 19, seed = 7 } = {}) {
  let left = 0, cx = 0, cs = 0, cr = 1;
  return () => {
    if (left <= 0) {
      const p = spot(ctx, rng, d0, d1, bias);
      cx = p.x; cs = p.s; cr = r0 + (r1 - r0) * Math.pow(rng(), 1.5);
      left = rng() < single ? 1 : n0 + Math.floor(rng() * (n1 - n0 + 1));
    }
    left--;
    const a = rng() * TAU, rr = cr * Math.sqrt(-Math.log(1 - rng() * 0.95)) * 0.6;
    const x = cx + Math.cos(a) * rr, s = cs + Math.sin(a) * rr;
    if (s < ctx.s0 || s >= ctx.s1) return null;
    const dens = 0.25 + 0.75 * Math.min(1, Math.max(0, 0.5 + noise2(x / patch, s / patch, seed)));
    if (rng() > dens) return null;
    return { x, s, d: Math.abs(x - ctx.pathX(s)) };
  };
}
import { noise2 } from '../noise.js';
export const grey = (c, amt = 0.15) => tintFrom([c], amt);

// Solid obstacle on the outside of a bend apex (b from bendSpots): reads dead ahead, camera curves past.
import { TUBE } from './core.js';
export function bendX(ctx, b, radius, rng, extra = 1.6) {
  return ctx.pathX(b.s) + b.side * (TUBE + 0.45 + radius + rng() * extra);
}
export function putBend(ctx, fs, batch, spec, b, rng) {
  const tpl = Array.isArray(spec.tpl) ? spec.tpl[(rng() * spec.tpl.length) | 0] : spec.tpl;
  const sc = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * rng();
  const x = bendX(ctx, b, tpl.r * sc, rng);
  const y = fs.at(x, b.s);
  return putAt(ctx, batch, { ...spec, tpl, scale: [sc, sc], tilt: 0, follow: Math.min(spec.follow ?? 0.3, 0.25) }, x, y, b.s, fs.nx, fs.ny, fs.nz, rng, 1, fs) ? x : null;
}

// Dense low micro detail across the floor, including directly under the path.
// list: [{ w, spec }] ; n attempts; d1 lateral range
export function microDetail(ctx, fs, batch, rng, key, list, n, d1 = 30) {
  const next = clusterer(ctx, rng, 0, d1, 1.25, { r: [0.4, 3], n: [2, 9], single: 0.25, patch: 13, seed: 41 });
  for (let k = 0; k < n; k++) {
    const p = next();
    if (!p || rng() > ctx.weightOf(p.s, key)) continue;
    const e = pickW(rng, list);
    putFloor(ctx, fs, batch, e.spec, p.x, p.s, rng);
  }
}
