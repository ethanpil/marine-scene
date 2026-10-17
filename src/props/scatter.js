// Placement helpers shared by the biome populators.
import { orient, tubeClear, TAU } from './core.js';

export function pickW(rng, list) {
  let tot = 0;
  for (const e of list) tot += e.w;
  let r = rng() * tot;
  for (const e of list) { r -= e.w; if (r <= 0) return e; }
  return list[list.length - 1];
}
export const pick = (rng, a) => a[(rng() * a.length) | 0];

// spec: { tpl: Template|Template[], scale: [a,b], ys: [a,b] (y-stretch), follow, sink, tint(rng) -> rgb,
//         sway (bool: scale fx by size), fa, tilt, maxSlope, minK }
// Places at explicit y with normal n. Returns the placed scale, or 0 if rejected.
export function putAt(ctx, batch, spec, x, y, s, nx, ny, nz, rng, sizeK = 1) {
  const tpl = Array.isArray(spec.tpl) ? spec.tpl[(rng() * spec.tpl.length) | 0] : spec.tpl;
  if (spec.maxSlope && ny < spec.maxSlope) return 0;
  let sc = (spec.scale[0] + (spec.scale[1] - spec.scale[0]) * rng()) * sizeK;
  const ys = spec.ys ? spec.ys[0] + (spec.ys[1] - spec.ys[0]) * rng() : 1;
  const minSc = spec.scale[0] * (spec.minK ?? 0.35);
  const top = ctx.surfaceY - 0.08;
  let ok = false;
  for (let t = 0; t < 4; t++) {
    const h = tpl.maxY * sc * ys;
    if (y + h < top && tubeClear(ctx, x, s, y, y + h, tpl.r * sc)) { ok = true; break; }
    sc *= 0.65;
    if (sc < minSc) break;
  }
  if (!ok) return 0;
  const tilt = spec.tilt || 0;
  const R = orient(nx, ny, nz, spec.follow ?? 0.6, rng() * TAU, (rng() - 0.5) * tilt, (rng() - 0.5) * tilt);
  const c = spec.tint ? spec.tint(rng) : [1, 1, 1];
  const sink = (spec.sink ?? 0.04) * sc * ys + (1 - ny) * tpl.r * sc * 0.5;
  const fa = (spec.sway ? sc : 1) * (spec.fa ?? 1);
  return batch.add(tpl, x, y - sink, -(s - ctx.s0), R, sc, sc * ys, sc, c[0], c[1], c[2], fa) ? sc : 0;
}

export function putFloor(ctx, fs, batch, spec, x, s, rng, sizeK = 1) {
  const y = fs.at(x, s);
  return putAt(ctx, batch, spec, x, y, s, fs.nx, fs.ny, fs.nz, rng, sizeK);
}

// random spot in chunk at lateral distance in [d0, d1] from the path (bias > 1 favours near)
export function spot(ctx, rng, d0, d1, bias = 1) {
  const s = ctx.s0 + rng() * 64;
  const d = d0 + (d1 - d0) * Math.pow(rng(), bias);
  const side = rng() < 0.5 ? -1 : 1;
  return { s, x: ctx.pathX(s) + side * d, d, side };
}

// tint helpers: pick a base colour and jitter brightness / hue slightly
export function tintFrom(list, amt = 0.15) {
  return (rng) => {
    const c = list[(rng() * list.length) | 0], k = 1 + (rng() - 0.5) * 2 * amt;
    return [c[0] * k * (1 + (rng() - 0.5) * amt), c[1] * k * (1 + (rng() - 0.5) * amt), c[2] * k * (1 + (rng() - 0.5) * amt)];
  };
}
export const grey = (c, amt = 0.15) => tintFrom([c], amt);
