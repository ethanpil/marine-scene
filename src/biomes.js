// Biome catalogue + endless seeded sequence along the travel distance `s` (metres).
// Each biome defines water optics, camera depth and a terrain shape relative to the path.
import { mulberry32, noise1, noise2, fbm2, ridge2, worley2, smoothstep, hash1, hash2i } from './noise.js';

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Per-segment random value in [0,1): every biome segment varies its own shape and character.
export const sv = (g, k) => (g ? hash1((g.seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0) : 0.5);

// Shape functions return floor height RELATIVE to (pathY - clearance); positive = up.
// ceil() returns ceiling height RELATIVE to pathY, or undefined for open water.
// canopy() returns sunlight transmission (0..1) from above-water cover (mangroves).
// Args: x, s global; ad = |x - pathX(s)|; g = the biome segment {key, seed, ...}; dx = x - pathX(s).
export const BIOMES = {
  reef: {
    label: 'Coral Reef', camY: -9, clearance: 4.5, len: [700, 1100], weight: 1.3,
    sigma: [0.11, 0.035, 0.028], lightSigma: [0.045, 0.016, 0.013],
    deep: C(0x0b5d8c), up: C(0x5cc8ea), sun: 1.15, caustic: 1.0, shafts: 1.0, ambient: 1.0, glow: 0, snow: 0.6,
    sand: [0.86, 0.79, 0.63], rock: [0.5, 0.44, 0.4],
    floor(x, s, ad, g) {
      const m = fbm2(x / 18, s / 18, 4, 11) * 1.6 * (0.6 + 0.8 * sv(g, 3));
      const b = Math.max(0, noise2(x / 9, s / 9, 12)) ** 2 * 5 * (0.6 + 0.8 * sv(g, 4)) * smoothstep(5, 12, ad);
      const w0 = 18 + 22 * sv(g, 2);
      const wall = smoothstep(w0, w0 + 50, ad) * (9 + 9 * fbm2(x / 40, s / 40, 3, 13)) * (0.5 + sv(g, 1));
      return m + b + wall;
    },
  },
  softcoral: {
    label: 'Soft Coral Garden', camY: -11, clearance: 4.2, len: [600, 950], weight: 0.95,
    sigma: [0.1, 0.03, 0.022], lightSigma: [0.042, 0.015, 0.012],
    deep: C(0x0a5e96), up: C(0x5ccdf2), sun: 1.1, caustic: 0.95, shafts: 1.1, ambient: 1.05, glow: 0, snow: 0.7,
    sand: [0.84, 0.8, 0.68], rock: [0.55, 0.48, 0.44],
    floor(x, s, ad, g) {
      const pin = Math.max(0, noise2(x / 14, s / 14, 151) - 0.1) ** 1.5 * (7 + 5 * sv(g, 1)) * smoothstep(5, 12, ad);
      return pin + fbm2(x / 16, s / 16, 4, 152) * 1.4 + smoothstep(30, 80, ad) * 8 * (0.6 + 0.8 * sv(g, 2));
    },
  },
  wall: {
    label: 'The Wall', camY: -15, clearance: 6, len: [600, 950], weight: 0.95,
    sigma: [0.09, 0.027, 0.019], lightSigma: [0.04, 0.014, 0.011],
    deep: C(0x05396b), up: C(0x3aa3df), sun: 1.05, caustic: 0.8, shafts: 1.3, ambient: 1.0, glow: 0, snow: 0.6,
    sand: [0.78, 0.74, 0.62], rock: [0.52, 0.47, 0.42],
    // A vertical reef wall on one side of the path, the blue abyss falling away on the other.
    floor(x, s, ad, g, dx) {
      const side = sv(g, 1) < 0.5 ? -1 : 1, t = dx * side; // t > 0 toward the wall
      const wd = 7 + 3 * noise1(s / 60, 141) + 2 * sv(g, 2);
      const rise = smoothstep(wd - 2, wd + 6, t) * (16 + 4 * fbm2(x / 25, s / 25, 3, 142));
      const ledge = fbm2(x / 5, s / 5, 3, 143) * 1.4 * smoothstep(wd - 3, wd + 2, t);
      const drop = smoothstep(3, 30, -t) * (120 + 40 * fbm2(x / 50, s / 50, 2, 144));
      return fbm2(x / 10, s / 10, 3, 145) * 0.8 + rise + ledge - drop;
    },
  },
  kelp: {
    label: 'Kelp Forest', camY: -11, clearance: 6, len: [650, 1000], weight: 1.0,
    sigma: [0.16, 0.06, 0.07], lightSigma: [0.07, 0.028, 0.035],
    deep: C(0x0f4c43), up: C(0x5fb39f), sun: 1.0, caustic: 0.75, shafts: 1.35, ambient: 0.95, glow: 0, snow: 1.0,
    sand: [0.5, 0.47, 0.38], rock: [0.3, 0.29, 0.26],
    floor(x, s, ad, g) {
      return fbm2(x / 14, s / 14, 5, 21) * 2.6 + ridge2(x / 30, s / 30, 3, 22) * 3.5 * (0.5 + sv(g, 1))
        + smoothstep(30, 85, ad) * 7 * (0.5 + sv(g, 2));
    },
  },
  seagrass: {
    label: 'Seagrass Meadow', camY: -4.2, clearance: 2.4, len: [600, 900], weight: 0.9,
    sigma: [0.14, 0.05, 0.06], lightSigma: [0.06, 0.022, 0.028],
    deep: C(0x1d6f6a), up: C(0x8adccb), sun: 1.2, caustic: 1.25, shafts: 0.8, ambient: 1.05, glow: 0, snow: 0.8,
    sand: [0.78, 0.74, 0.56], rock: [0.48, 0.46, 0.4],
    floor(x, s, ad, g) {
      return fbm2(x / 25, s / 25, 3, 31) * 0.8 * (0.5 + sv(g, 1)) + smoothstep(40, 95, ad) * 3;
    },
  },
  mangrove: {
    label: 'Mangrove Roots', camY: -1.9, clearance: 2.3, len: [450, 700], weight: 0.8,
    sigma: [0.15, 0.075, 0.12], lightSigma: [0.06, 0.03, 0.05],
    deep: C(0x2b4a35), up: C(0xa8c38e), sun: 1.1, caustic: 1.2, shafts: 0.9, ambient: 1.0, glow: 0, snow: 1.2,
    sand: [0.5, 0.43, 0.32], rock: [0.32, 0.27, 0.22],
    floor(x, s, ad, g) {
      return fbm2(x / 12, s / 12, 3, 131) * 0.5 + smoothstep(9, 26, ad) * (1.6 + 1.2 * sv(g, 1));
    },
    // dappled shade from the mangrove canopy above the surface; more open over the channel
    canopy(x, s, ad) {
      const leaf = smoothstep(-0.25, 0.45, noise2(x / 7, s / 7, 132)) * 0.55 + smoothstep(0, 0.6, noise2(x / 2.5, s / 2.5, 133)) * 0.25;
      return Math.min(1, 0.22 + leaf + smoothstep(9, 3, ad) * 0.35);
    },
  },
  sandflat: {
    label: 'Sand Flats', camY: -7, clearance: 3.0, len: [550, 850], weight: 0.9,
    sigma: [0.1, 0.032, 0.03], lightSigma: [0.045, 0.016, 0.014],
    deep: C(0x0f6f93), up: C(0x6fd6ee), sun: 1.15, caustic: 1.3, shafts: 1.0, ambient: 1.05, glow: 0, snow: 0.5,
    sand: [0.9, 0.84, 0.7], rock: [0.6, 0.55, 0.48],
    floor(x, s, ad, g) {
      const k = 0.07 + 0.08 * sv(g, 1), dir = (sv(g, 2) - 0.5) * 0.12;
      const dune = Math.sin(s * k + x * dir + noise2(x / 30, s / 30, 121) * 3) * 0.45 * (0.4 + 1.4 * sv(g, 3));
      return fbm2(x / 40, s / 40, 3, 122) * 1.4 + dune + smoothstep(60, 120, ad) * 4;
    },
  },
  pelagic: {
    label: 'Open Ocean', camY: -16, clearance: 260, len: [700, 1100], weight: 1.1,
    sigma: [0.085, 0.024, 0.016], lightSigma: [0.04, 0.014, 0.01],
    deep: C(0x022a55), up: C(0x2a86d6), sun: 1.05, caustic: 0.6, shafts: 0.85, ambient: 1.0, glow: 0, snow: 0.5,
    sand: [0.3, 0.3, 0.32], rock: [0.2, 0.2, 0.22],
    floor(x, s) { return fbm2(x / 60, s / 60, 3, 41) * 20; },
  },
  cave: {
    label: 'Cenote Caves', camY: -13, clearance: 4, len: [600, 900], weight: 0.9,
    sigma: [0.08, 0.022, 0.018], lightSigma: [0.04, 0.012, 0.01],
    deep: C(0x05324a), up: C(0x3ca6c8), sun: 1.0, caustic: 0.7, shafts: 1.0, ambient: 0.55, glow: 0.15, snow: 0.5,
    sand: [0.78, 0.75, 0.66], rock: [0.62, 0.58, 0.5],
    floor(x, s, ad, g) {
      const w = (8 + 5 * noise1(s / 50, 51)) * (0.8 + 0.5 * sv(g, 1));
      return fbm2(x / 8, s / 8, 4, 52) * 1.5 + Math.max(0, noise2(x / 5, s / 5, 53)) * 2 * smoothstep(3, 7, ad)
        + smoothstep(w, w + 9, ad) * 26;
    },
    ceil(x, s, ad, g) {
      const w = (8 + 5 * noise1(s / 50, 51)) * (0.8 + 0.5 * sv(g, 1));
      let c = 3.5 + 1.8 * fbm2(x / 10, s / 10, 4, 54) + Math.max(0, noise2(x / 3, s / 3, 55)) ** 3 * -2.5 * smoothstep(3, 6, ad);
      c -= smoothstep(w, w + 8, ad) * 26;
      const o = noise2(x / 34, s / 34, 56), th = 0.26 + 0.14 * sv(g, 2);
      if (o > th) c += (o - th) * 260; // cenote openings to the sky
      return c;
    },
  },
  wreck: {
    label: 'Sunken Wrecks', camY: -20, clearance: 5.5, len: [650, 1000], weight: 1.0,
    sigma: [0.12, 0.042, 0.038], lightSigma: [0.055, 0.02, 0.018],
    deep: C(0x0a3e50), up: C(0x3e93a6), sun: 0.85, caustic: 0.5, shafts: 1.0, ambient: 0.9, glow: 0, snow: 1.3,
    sand: [0.56, 0.54, 0.48], rock: [0.36, 0.35, 0.33],
    floor(x, s, ad, g) { return fbm2(x / 30, s / 30, 3, 61) * 1.2 * (0.5 + sv(g, 1)) + smoothstep(50, 110, ad) * 6; },
  },
  ruins: {
    label: 'Sunken City', camY: -14, clearance: 5.5, len: [700, 1100], weight: 1.0,
    sigma: [0.12, 0.04, 0.034], lightSigma: [0.05, 0.018, 0.015],
    deep: C(0x08446a), up: C(0x39a9cf), sun: 1.0, caustic: 0.85, shafts: 1.1, ambient: 1.0, glow: 0, snow: 0.8,
    sand: [0.8, 0.76, 0.66], rock: [0.66, 0.62, 0.55],
    floor(x, s, ad, g) {
      const step = 1.6 + 1.4 * sv(g, 1);
      const t = fbm2(x / 45, s / 45, 3, 71) * 7 * (0.6 + 0.8 * sv(g, 2)) + 4;
      const f = t / step, terr = (Math.floor(f) + smoothstep(0.82, 1, f - Math.floor(f))) * step;
      return fbm2(x / 12, s / 12, 2, 72) * 0.4 + terr * smoothstep(9, 30, ad);
    },
  },
  vents: {
    label: 'Hydrothermal Vents', camY: -42, clearance: 6, len: [550, 850], weight: 0.8,
    sigma: [0.1, 0.045, 0.035], lightSigma: [0.05, 0.02, 0.015],
    deep: C(0x01080e), up: C(0x041d2a), sun: 0.06, caustic: 0, shafts: 0.05, ambient: 0.3, glow: 0.75, snow: 1.6,
    sand: [0.36, 0.33, 0.31], rock: [0.25, 0.23, 0.23],
    floor(x, s, ad, g) {
      return ridge2(x / 22, s / 22, 4, 81) * 9 * (0.6 + 0.8 * sv(g, 1)) * smoothstep(5, 20, ad)
        + fbm2(x / 6, s / 6, 3, 82) * 1.2 + smoothstep(40, 90, ad) * 6;
    },
  },
  deepplain: {
    label: 'Abyssal Plain', camY: -50, clearance: 4.5, len: [550, 850], weight: 0.75,
    sigma: [0.09, 0.04, 0.032], lightSigma: [0.05, 0.02, 0.015],
    deep: C(0x01060c), up: C(0x02121e), sun: 0.03, caustic: 0, shafts: 0, ambient: 0.25, glow: 0.7, snow: 1.9,
    sand: [0.6, 0.58, 0.54], rock: [0.36, 0.35, 0.34],
    // soft sediment with occasional brine-pool basins (see brineBasins below)
    floor(x, s, ad, g) {
      const base = fbm2(x / 50, s / 50, 3, 161) * 2.5 + fbm2(x / 9, s / 9, 2, 162) * 0.3;
      const w = worley2(x / BASIN, s / BASIN, basinSeed(g));
      const basin = -smoothstep(0.32, 0.12, w) * (2.5 + 1.5 * sv(g, 2)) * (sv(g, 3) < 0.7 ? 1 : 0);
      return base + basin + smoothstep(50, 110, ad) * 6;
    },
  },
  tidepool: {
    label: 'Tide Pools', camY: -1.7, clearance: 1.4, len: [450, 700], weight: 0.8,
    sigma: [0.13, 0.042, 0.048], lightSigma: [0.06, 0.022, 0.026],
    deep: C(0x2c8079), up: C(0xb0ebe0), sun: 1.35, caustic: 1.6, shafts: 0.6, ambient: 1.1, glow: 0, snow: 0.7,
    sand: [0.62, 0.57, 0.47], rock: [0.42, 0.33, 0.34],
    floor(x, s, ad, g) {
      return fbm2(x / 6, s / 6, 4, 91) * 1.0 + Math.max(0, noise2(x / 4, s / 4, 92)) * 1.2 * smoothstep(2.5, 5, ad)
        + smoothstep(4.5, 13, ad) * (4.8 + 2.2 * fbm2(x / 9, s / 9, 3, 93)) * (0.8 + 0.4 * sv(g, 1));
    },
  },
  abyss: {
    label: 'Midnight Zone', camY: -55, clearance: 260, len: [500, 800], weight: 0.7,
    sigma: [0.1, 0.04, 0.03], lightSigma: [0.05, 0.02, 0.015],
    deep: C(0x000307), up: C(0x010c18), sun: 0.02, caustic: 0, shafts: 0, ambient: 0.22, glow: 1.0, snow: 1.4,
    sand: [0.32, 0.31, 0.33], rock: [0.22, 0.22, 0.24],
    floor(x, s) { return fbm2(x / 60, s / 60, 3, 101) * 20; },
  },
  polar: {
    label: 'Polar Ice', camY: -9, clearance: 45, len: [600, 950], weight: 0.85,
    sigma: [0.13, 0.05, 0.045], lightSigma: [0.06, 0.022, 0.02],
    deep: C(0x0a3442), up: C(0x3a8794), sun: 0.75, caustic: 0.35, shafts: 1.0, ambient: 0.85, glow: 0, snow: 1.0,
    sand: [0.42, 0.42, 0.42], rock: [0.3, 0.3, 0.31],
    floor(x, s) { return fbm2(x / 30, s / 30, 4, 111) * 8; },
    ceil(x, s, ad, g) {
      let c = 7.6 + 0.6 * fbm2(x / 7, s / 7, 3, 112);
      c -= ridge2(x / 24, s / 24, 3, 113) ** 3 * 9 * (0.5 + sv(g, 1)) * smoothstep(5, 16, ad); // pressure-ridge keels
      const lead = noise2(x / 45, s / 45, 114), th = 0.3 + 0.16 * sv(g, 2);
      if (lead > th) c += (lead - th) * 120; // open leads between floes
      return c;
    },
  },
};
// Colours above are authored in sRGB; shaders work in linear light.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
for (const b of Object.values(BIOMES)) for (const k of ['deep', 'up', 'sand', 'rock']) b[k] = b[k].map(toLin);
export const BIOME_KEYS = Object.keys(BIOMES);
const NO_CEIL = 60; // metres above the surface: "no ceiling" for open-water biomes

// ---------- Brine-pool basins (deepplain): worley cells of size BASIN ----------
const BASIN = 45;
const basinSeed = (g) => 163 + ((g ? g.seed : 0) & 7);
// Basin centres (global x, s) with radius r (m) overlapping [s0, s1] x [x0, x1] for segment g.
// The flat-bottomed depression has full depth within ~0.12*BASIN and its rim at ~0.32*BASIN.
export function brineBasins(g, x0, x1, s0, s1) {
  const out = [];
  if (!g || g.key !== 'deepplain' || sv(g, 3) >= 0.7) return out;
  const seed = basinSeed(g);
  for (let cy = Math.floor(s0 / BASIN) - 1; cy <= Math.floor(s1 / BASIN) + 1; cy++)
    for (let cx = Math.floor(x0 / BASIN) - 1; cx <= Math.floor(x1 / BASIN) + 1; cx++) {
      const px = (cx + hash2i(cx, cy, seed)) * BASIN, ps = (cy + hash2i(cx, cy, seed + 7)) * BASIN;
      if (ps >= s0 && ps < s1 && px >= x0 && px < x1) out.push({ x: px, s: ps, r: 0.32 * BASIN, rFlat: 0.12 * BASIN });
    }
  return out;
}

// ---------- Endless sequence ----------
const TH = 90; // half-width of the cross-fade between biomes (m)

export class BiomeSequence {
  constructor(seed, startKey = 'reef', startS = 0) {
    this.startS = startS;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.seed = seed;
    this.segs = [];
    this.recent = [];
    this._push(BIOMES[startKey] ? startKey : 'reef');
  }
  _push(key) {
    const start = this.segs.length ? this.segs[this.segs.length - 1].end : this.startS - 200;
    const b = BIOMES[key];
    const len = this.rng.range(b.len[0], b.len[1]);
    this.segs.push({ key, start, end: start + len, id: this.segs.length, seed: (this.rng() * 1e9) | 0 });
    this.recent.push(key);
    if (this.recent.length > 5) this.recent.shift();
  }
  _extend(s) {
    while (this.segs[this.segs.length - 1].end < s + 400) {
      const opts = BIOME_KEYS.filter((k) => !this.recent.includes(k));
      let tot = 0; for (const k of opts) tot += BIOMES[k].weight;
      let r = this.rng() * tot, pick = opts[0];
      for (const k of opts) { r -= BIOMES[k].weight; if (r <= 0) { pick = k; break; } }
      this._push(pick);
    }
    // forget far-behind segments (keep a few for lookups)
    while (this.segs.length > 12 && this.segs[1].end < s - 2000) this.segs.shift();
  }
  segAt(s) {
    this._extend(s);
    const a = this.segs;
    for (let i = a.length - 1; i >= 0; i--) if (s >= a[i].start) return i;
    return 0;
  }
  // Returns [{key, w, g}] (1-2 entries) summing to 1; g is the segment record.
  weights(s) {
    const i = this.segAt(s), a = this.segs, g = a[i];
    if (i > 0 && s < g.start + TH) {
      const t = smoothstep(-TH, TH, s - g.start);
      if (t < 1) return [{ key: g.key, w: t, g }, { key: a[i - 1].key, w: 1 - t, g: a[i - 1] }];
    }
    if (s > g.end - TH) {
      this._extend(g.end + 10);
      const n = a[a.indexOf(g) + 1];
      const t = smoothstep(-TH, TH, s - g.end);
      return [{ key: g.key, w: 1 - t, g }, { key: n.key, w: t, g: n }];
    }
    return [{ key: g.key, w: 1, g }];
  }
  weightOf(s, key) { let w = 0; for (const e of this.weights(s)) if (e.key === key) w += e.w; return w; }
  // Segments overlapping [s0, s1)
  segmentsBetween(s0, s1) {
    this._extend(s1);
    return this.segs.filter((g) => g.end > s0 && g.start < s1);
  }
}

// ---------- World shape: path, floor, ceiling ----------
export class WorldShape {
  constructor(seq) {
    this.seq = seq;
    // Optional fast exact samplers over the built terrain meshes (set by Terrain).
    this.gridFloor = null; this.gridCeil = null;
  }
  pathX(s) { return 30 * noise1(s / 260, 3) + 9 * noise1(s / 85, 5) + 3.5 * noise1(s / 38, 9); }
  // Signed lateral curvature d2x/ds2 (+ = bending toward +x). Tall obstacles placed on the
  // OUTSIDE of a bend (offset opposite the sign) appear dead ahead and the camera curves around them.
  pathCurv(s) { const e = 6; return (this.pathX(s + e) - 2 * this.pathX(s) + this.pathX(s - e)) / (e * e); }
  pathY(s) {
    let y = 0;
    for (const e of this.seq.weights(s)) { y += BIOMES[e.key].camY * e.w; }
    const amp = Math.min(1, -y / 8);
    return y + 1.1 * amp * noise1(s / 70, 7);
  }
  // Analytic floor (before any mesh exists). Prefer floorAt, which samples the rendered mesh.
  floorExact(x, s) {
    const ws = this.seq.weights(s);
    const px = this.pathX(s), py = this.pathY(s), dx = x - px, ad = Math.abs(dx);
    let h = 0;
    for (const e of ws) { const b = BIOMES[e.key]; h += (py - b.clearance + b.floor(x, s, ad, e.g, dx)) * e.w; }
    // guarantee a clear tube around the camera path
    return Math.min(h, py - 2.2 + Math.max(0, ad - 4) * 2.5);
  }
  floorAt(x, s) {
    if (this.gridFloor) { const v = this.gridFloor(x, s); if (v !== undefined) return v; }
    return this.floorExact(x, s);
  }
  // Absolute ceiling height (y). Returns surface+NO_CEIL when open water.
  ceilingExact(x, s) {
    const ws = this.seq.weights(s);
    const px = this.pathX(s), py = this.pathY(s), dx = x - px, ad = Math.abs(dx);
    let c = 0;
    for (const e of ws) {
      const b = BIOMES[e.key];
      c += (b.ceil ? py + b.ceil(x, s, ad, e.g, dx) : NO_CEIL) * e.w;
    }
    return Math.max(c, py + 2.4 - Math.max(0, ad - 4) * 2.5);
  }
  ceilingAt(x, s) {
    if (this.gridCeil) { const v = this.gridCeil(x, s); if (v !== undefined) return v; }
    return this.ceilingExact(x, s);
  }
  // Sunlight transmission from above-water cover (1 = open sky).
  canopyAt(x, s) {
    let t = 0;
    const ws = this.seq.weights(s);
    let any = false;
    for (const e of ws) if (BIOMES[e.key].canopy) { any = true; break; }
    if (!any) return 1;
    const ad = Math.abs(x - this.pathX(s));
    for (const e of ws) { const b = BIOMES[e.key]; t += (b.canopy ? b.canopy(x, s, ad, e.g) : 1) * e.w; }
    return t;
  }
  hasCeiling(s) { return this.seq.weights(s).some((e) => BIOMES[e.key].ceil); }
  floorNormal(x, s) {
    const e = 0.75;
    const hx = this.floorAt(x + e, s) - this.floorAt(x - e, s);
    const hz = this.floorAt(x, s + e) - this.floorAt(x, s - e); // +s is -z
    const nx = -hx, ny = 2 * e, nz = hz; // z = -s
    const l = Math.hypot(nx, ny, nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  }
}
export const NO_CEILING = NO_CEIL;
