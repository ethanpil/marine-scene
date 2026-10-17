// Seeded RNG + fast value/simplex-style noise used by every generator.
// Everything procedural derives from deterministic seeds so the world is stable.

export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

// Integer hash -> [0,1)
export function hash1(n) {
  n = Math.imul(n ^ 61 ^ (n >>> 16), 9);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}
export function hash2i(x, y, seed = 0) {
  return hash1((Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 1442695041)) | 0);
}
export function hash3i(x, y, z, seed = 0) {
  return hash1((Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519) ^ Math.imul(seed, 3266489917)) | 0);
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

// Gradient noise 1D, range ~[-1,1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const g0 = hash2i(i, 0, seed) * 2 - 1, g1 = hash2i(i + 1, 0, seed) * 2 - 1;
  return lerp(g0 * f, g1 * (f - 1), fade(f)) * 2;
}

// 2D gradient (Perlin) noise, range ~[-1,1]
const G = [];
for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; G.push([Math.cos(a), Math.sin(a)]); }
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g = (cx, cy) => G[(hash2i(cx, cy, seed) * 16) | 0];
  const g00 = g(ix, iy), g10 = g(ix + 1, iy), g01 = g(ix, iy + 1), g11 = g(ix + 1, iy + 1);
  const n00 = g00[0] * fx + g00[1] * fy;
  const n10 = g10[0] * (fx - 1) + g10[1] * fy;
  const n01 = g01[0] * fx + g01[1] * (fy - 1);
  const n11 = g11[0] * (fx - 1) + g11[1] * (fy - 1);
  const u = fade(fx), v = fade(fy);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
}

export function fbm2(x, y, oct = 4, seed = 0, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f, seed + i * 17);
    n += a; a *= gain; f *= lac;
  }
  return s / n;
}

// Ridged noise in [0,1], sharp crests
export function ridge2(x, y, oct = 3, seed = 0) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise2(x * f, y * f, seed + i * 31));
    s += a * v * v; n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

// Cellular (worley) F1 distance in 2D, for cell-ish features.
export function worley2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let d = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const px = cx + hash2i(cx, cy, seed), py = cy + hash2i(cx, cy, seed + 7);
    const dx = px - x, dy = py - y;
    d = Math.min(d, dx * dx + dy * dy);
  }
  return Math.sqrt(d);
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export { lerp };
