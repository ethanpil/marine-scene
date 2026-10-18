// Biome catalogue + endless seeded sequence along the travel distance `s` (metres).
// Each biome defines water optics, camera depth and a terrain shape relative to the path.
import { mulberry32, noise1, noise2, fbm2, ridge2, smoothstep } from './noise.js';

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Shape functions return floor height RELATIVE to (pathY - clearance); positive = up.
// ceil() returns ceiling height RELATIVE to pathY, or undefined for open water.
// x, s are global; ad = |x - pathX(s)|.
export const BIOMES = {
  reef: {
    label: 'Coral Reef', camY: -9, clearance: 4.5, len: [700, 1100], weight: 1.3,
    sigma: [0.11, 0.035, 0.028], lightSigma: [0.045, 0.016, 0.013],
    deep: C(0x0b5d8c), up: C(0x5cc8ea), sun: 1.15, caustic: 1.0, shafts: 1.0, ambient: 1.0, glow: 0, snow: 0.6,
    sand: [0.86, 0.79, 0.63], rock: [0.5, 0.44, 0.4],
    floor(x, s, ad) {
      const m = fbm2(x / 18, s / 18, 4, 11) * 1.6;
      const b = Math.max(0, noise2(x / 9, s / 9, 12)) ** 2 * 5 * smoothstep(5, 12, ad);
      const wall = smoothstep(24, 75, ad) * (9 + 9 * fbm2(x / 40, s / 40, 3, 13));
      return m + b + wall;
    },
  },
  kelp: {
    label: 'Kelp Forest', camY: -11, clearance: 6, len: [650, 1000], weight: 1.0,
    sigma: [0.16, 0.06, 0.07], lightSigma: [0.07, 0.028, 0.035],
    deep: C(0x0f4c43), up: C(0x5fb39f), sun: 1.0, caustic: 0.75, shafts: 1.35, ambient: 0.95, glow: 0, snow: 1.0,
    sand: [0.5, 0.47, 0.38], rock: [0.3, 0.29, 0.26],
    floor(x, s, ad) {
      return fbm2(x / 14, s / 14, 5, 21) * 2.6 + ridge2(x / 30, s / 30, 3, 22) * 3.5 + smoothstep(30, 85, ad) * 7;
    },
  },
  seagrass: {
    label: 'Seagrass Meadow', camY: -4.2, clearance: 2.4, len: [600, 900], weight: 0.9,
    sigma: [0.14, 0.05, 0.06], lightSigma: [0.06, 0.022, 0.028],
    deep: C(0x1d6f6a), up: C(0x8adccb), sun: 1.2, caustic: 1.25, shafts: 0.8, ambient: 1.05, glow: 0, snow: 0.8,
    sand: [0.78, 0.74, 0.56], rock: [0.48, 0.46, 0.4],
    floor(x, s, ad) {
      return fbm2(x / 25, s / 25, 3, 31) * 0.8 + smoothstep(40, 95, ad) * 3;
    },
  },
  sandflat: {
    label: 'Sand Flats', camY: -7, clearance: 3.0, len: [550, 850], weight: 0.9,
    sigma: [0.1, 0.032, 0.03], lightSigma: [0.045, 0.016, 0.014],
    deep: C(0x0f6f93), up: C(0x6fd6ee), sun: 1.15, caustic: 1.3, shafts: 1.0, ambient: 1.05, glow: 0, snow: 0.5,
    sand: [0.9, 0.84, 0.7], rock: [0.6, 0.55, 0.48],
    floor(x, s, ad) {
      const dune = Math.sin(s * 0.11 + x * 0.04 + noise2(x / 30, s / 30, 121) * 3) * 0.45;
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
    floor(x, s, ad) {
      const w = 8 + 5 * noise1(s / 50, 51);
      return fbm2(x / 8, s / 8, 4, 52) * 1.5 + Math.max(0, noise2(x / 5, s / 5, 53)) * 2 * smoothstep(3, 7, ad)
        + smoothstep(w, w + 9, ad) * 26;
    },
    ceil(x, s, ad) {
      const w = 8 + 5 * noise1(s / 50, 51);
      let c = 3.5 + 1.8 * fbm2(x / 10, s / 10, 4, 54) + Math.max(0, noise2(x / 3, s / 3, 55)) ** 3 * -2.5 * smoothstep(3, 6, ad);
      c -= smoothstep(w, w + 8, ad) * 26;
      const o = noise2(x / 34, s / 34, 56);
      if (o > 0.32) c += (o - 0.32) * 260; // cenote openings to the sky
      return c;
    },
  },
  wreck: {
    label: 'Sunken Wrecks', camY: -20, clearance: 5.5, len: [650, 1000], weight: 1.0,
    sigma: [0.12, 0.042, 0.038], lightSigma: [0.055, 0.02, 0.018],
    deep: C(0x0a3e50), up: C(0x3e93a6), sun: 0.85, caustic: 0.5, shafts: 1.0, ambient: 0.9, glow: 0, snow: 1.3,
    sand: [0.56, 0.54, 0.48], rock: [0.36, 0.35, 0.33],
    floor(x, s, ad) { return fbm2(x / 30, s / 30, 3, 61) * 1.2 + smoothstep(50, 110, ad) * 6; },
  },
  ruins: {
    label: 'Sunken City', camY: -14, clearance: 5.5, len: [700, 1100], weight: 1.0,
    sigma: [0.12, 0.04, 0.034], lightSigma: [0.05, 0.018, 0.015],
    deep: C(0x08446a), up: C(0x39a9cf), sun: 1.0, caustic: 0.85, shafts: 1.1, ambient: 1.0, glow: 0, snow: 0.8,
    sand: [0.8, 0.76, 0.66], rock: [0.66, 0.62, 0.55],
    floor(x, s, ad) {
      const t = fbm2(x / 45, s / 45, 3, 71) * 7 + 4;
      const f = t / 2.2, terr = (Math.floor(f) + smoothstep(0.82, 1, f - Math.floor(f))) * 2.2;
      return fbm2(x / 12, s / 12, 2, 72) * 0.4 + terr * smoothstep(9, 30, ad);
    },
  },
  vents: {
    label: 'Hydrothermal Vents', camY: -42, clearance: 6, len: [550, 850], weight: 0.8,
    sigma: [0.1, 0.045, 0.035], lightSigma: [0.05, 0.02, 0.015],
    deep: C(0x01080e), up: C(0x041d2a), sun: 0.06, caustic: 0, shafts: 0.05, ambient: 0.3, glow: 0.75, snow: 1.6,
    sand: [0.36, 0.33, 0.31], rock: [0.25, 0.23, 0.23],
    floor(x, s, ad) {
      return ridge2(x / 22, s / 22, 4, 81) * 9 * smoothstep(5, 20, ad) + fbm2(x / 6, s / 6, 3, 82) * 1.2 + smoothstep(40, 90, ad) * 6;
    },
  },
  tidepool: {
    label: 'Tide Pools', camY: -1.7, clearance: 1.4, len: [450, 700], weight: 0.8,
    sigma: [0.13, 0.042, 0.048], lightSigma: [0.06, 0.022, 0.026],
    deep: C(0x2c8079), up: C(0xb0ebe0), sun: 1.35, caustic: 1.6, shafts: 0.6, ambient: 1.1, glow: 0, snow: 0.7,
    sand: [0.62, 0.57, 0.47], rock: [0.42, 0.33, 0.34],
    floor(x, s, ad) {
      return fbm2(x / 6, s / 6, 4, 91) * 1.0 + Math.max(0, noise2(x / 4, s / 4, 92)) * 1.2 * smoothstep(2.5, 5, ad)
        + smoothstep(4.5, 13, ad) * (4.8 + 2.2 * fbm2(x / 9, s / 9, 3, 93));
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
    ceil(x, s, ad) {
      let c = 7.6 + 0.6 * fbm2(x / 7, s / 7, 3, 112);
      c -= ridge2(x / 24, s / 24, 3, 113) ** 3 * 9 * smoothstep(5, 16, ad); // pressure-ridge keels
      const lead = noise2(x / 45, s / 45, 114);
      if (lead > 0.38) c += (lead - 0.38) * 120; // open leads between floes
      return c;
    },
  },
};
// Colours above are authored in sRGB; shaders work in linear light.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
for (const b of Object.values(BIOMES)) for (const k of ['deep', 'up', 'sand', 'rock']) b[k] = b[k].map(toLin);
export const BIOME_KEYS = Object.keys(BIOMES);
const NO_CEIL = 60; // metres above the surface: "no ceiling" for open-water biomes

// ---------- Endless sequence ----------
const TH = 90; // half-width of the cross-fade between biomes (m)

export class BiomeSequence {
  constructor(seed, startKey = 'reef') {
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.seed = seed;
    this.segs = [];
    this.recent = [];
    this._push(BIOMES[startKey] ? startKey : 'reef');
  }
  _push(key) {
    const start = this.segs.length ? this.segs[this.segs.length - 1].end : -200;
    const b = BIOMES[key];
    const len = this.rng.range(b.len[0], b.len[1]);
    this.segs.push({ key, start, end: start + len, id: this.segs.length, seed: (this.rng() * 1e9) | 0 });
    this.recent.push(key);
    if (this.recent.length > 4) this.recent.shift();
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
  // Returns [{key, w}] (1-2 entries) summing to 1.
  weights(s) {
    const i = this.segAt(s), a = this.segs, g = a[i];
    if (i > 0 && s < g.start + TH) {
      const t = smoothstep(-TH, TH, s - g.start);
      if (t < 1) return [{ key: g.key, w: t }, { key: a[i - 1].key, w: 1 - t }];
    }
    if (s > g.end - TH) {
      this._extend(g.end + 10);
      const n = a[a.indexOf(g) + 1];
      const t = smoothstep(-TH, TH, s - g.end);
      return [{ key: g.key, w: 1 - t }, { key: n.key, w: t }];
    }
    return [{ key: g.key, w: 1 }];
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
  constructor(seq) { this.seq = seq; }
  pathX(s) { return 30 * noise1(s / 260, 3) + 9 * noise1(s / 85, 5) + 3.5 * noise1(s / 38, 9); }
  // Signed lateral curvature d2x/ds2 (+ = bending toward +x). Tall obstacles placed on the
  // OUTSIDE of a bend (offset opposite the sign) appear dead ahead and the camera curves around them.
  pathCurv(s) { const e = 6; return (this.pathX(s + e) - 2 * this.pathX(s) + this.pathX(s - e)) / (e * e); }
  pathY(s) {
    let y = 0, amp = 0;
    for (const e of this.seq.weights(s)) { y += BIOMES[e.key].camY * e.w; }
    amp = Math.min(1, -y / 8);
    return y + 1.1 * amp * noise1(s / 70, 7);
  }
  _baseFloor(x, s) {
    const ws = this.seq.weights(s);
    const px = this.pathX(s), py = this.pathY(s), ad = Math.abs(x - px);
    let h = 0;
    for (const e of ws) { const b = BIOMES[e.key]; h += (py - b.clearance + b.floor(x, s, ad)) * e.w; }
    return { h, py, ad };
  }
  floorAt(x, s) {
    const { h, py, ad } = this._baseFloor(x, s);
    // guarantee a clear tube around the camera path
    return Math.min(h, py - 2.2 + Math.max(0, ad - 4) * 2.5);
  }
  // Absolute ceiling height (y). Returns surface+NO_CEIL when open water.
  ceilingAt(x, s) {
    const ws = this.seq.weights(s);
    const px = this.pathX(s), py = this.pathY(s), ad = Math.abs(x - px);
    let c = 0;
    for (const e of ws) {
      const b = BIOMES[e.key];
      c += (b.ceil ? py + b.ceil(x, s, ad) : NO_CEIL) * e.w;
    }
    return Math.max(c, py + 2.4 - Math.max(0, ad - 4) * 2.5);
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
