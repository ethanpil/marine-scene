// Species catalogue: ~70 named archetypes + seeded procedural fish.
// Geometry params are relative to unit body length; `size` is length in metres.
// Pattern ids are documented in shader.js (crPat). Motion modes: 0 fish, 1 cetacean, 2 ray,
// 3 flipper, 4 jelly, 5 cephalopod, 6 octopus, 7 mola, 8 anchored, 9 seahorse.
import { mulberry32 } from '../noise.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function merge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k];
  return o;
}

// ---------- behaviour presets ----------
const SHOAL = { kind: 'shoal', n: [6, 14], speed: [0.25, 0.6], zone: 'floor', alt: [0.4, 2.5], spread: 5 };
const SCHOOL = { kind: 'school', n: [40, 110], speed: [0.6, 1.1], zone: 'mid', routes: { hold: 3, cross: 1, along: 1 } };
const SOLO = { kind: 'solo', n: [1, 1], speed: [0.4, 0.9], zone: 'floor', alt: [0.8, 3], dist: [5, 22], routes: { hold: 2, cross: 1, along: 1, oncoming: 1 } };
const CRUISE = { kind: 'solo', n: [1, 1], speed: [0.8, 1.5], zone: 'mid', dist: [10, 40], routes: { cross: 2, oncoming: 2, along: 1, overtake: 0.5 } };
const POD = { kind: 'pod', n: [3, 8], speed: [1.5, 3], zone: 'mid', dist: [15, 50], routes: { cross: 1, oncoming: 2, overtake: 1 } };
const GIANT = { kind: 'solo', n: [1, 1], speed: [1.2, 2.2], zone: 'mid', dist: [30, 80], routes: { cross: 1, oncoming: 2, along: 1, overtake: 0.6 } };
const HOVER = { kind: 'hover', n: [1, 3], speed: [0.05, 0.2], zone: 'floor', alt: [0.3, 1.6], spread: 4 };
const DRIFT = { kind: 'drift', n: [6, 18], speed: [0.06, 0.18], zone: 'mid', spread: 22 };

// ---------- base archetypes ----------
const FISH = {
  plan: 'fish', det: 1,
  body: { depth: 0.3, width: 0.45, tm: 0.34, nose: 0.65, tail: 1.6, ped: 0.11, tEnd: 0.8, n: 2.2 },
  fins: {
    dorsal: [{ t0: 0.3, t1: 0.62, h: 0.09, shape: 'round', sweep: 0.4 }],
    anal: [{ t0: 0.56, t1: 0.7, h: 0.07, shape: 'round', sweep: 0.45 }],
    pect: { t: 0.24, span: 0.015, a: -0.4, aSpan: 0.6, h: 0.11, dip: 0.3, sweep: 1.4, shape: 'pect' },
    pelv: { t: 0.32, span: 0.035, a: -1.25, h: 0.07, dip: 1.2, sweep: 1.1, shape: 'tri' },
    caudal: { shape: 'forked', size: 0.22 },
  },
  eye: { t: 0.1, v: 0.3, r: 0.034 },
  col: { d: 0x55606a, b: 0xdde2e6, p: 0x222222, f: 0x8090a0, p2: 0x000000, a: 0xc0a060 },
  pat: [0, 1, 0.5], pat2: [0, 1, 0.5], cs: [0.0, 0.12],
  finEdge: 0, finRays: 0.45, iris: 0.6, glowMode: 0, glow: 0, sheen: 0.3, rough: 0.42,
  mot: { mode: 0, amp: 0.07, waves: 0.9, c0: 0.12, beat: 1.4, idle: 0.7 },
  beh: SHOAL, size: [0.15, 0.3],
};
export const fish = (o) => merge(FISH, o);

const SHARK = fish({
  det: 2,
  body: { depth: 0.17, width: 0.95, tm: 0.33, tmb: 0.3, nose: 1.05, noseB: 0.9, tail: 1.25, ped: 0.2, pedW: 0.16, tEnd: 0.72, n: 2.1, nb: 2.6, snout: 0.25, hump: 0.05 },
  fins: {
    dorsal: [{ t0: 0.32, t1: 0.45, h: 0.13, shape: 'shark', sweep: 0.75, thick: 0.06 }, { t0: 0.64, t1: 0.68, h: 0.035, shape: 'shark', sweep: 0.8 }],
    anal: [{ t0: 0.64, t1: 0.68, h: 0.03, shape: 'shark', sweep: 0.9 }],
    pect: { t: 0.24, span: 0.08, a: -0.55, aSpan: 0, h: 0.17, dip: 0.35, sweep: 0.75, shape: 'falcate', thick: 0.07 },
    pelv: { t: 0.53, span: 0.05, a: -1.2, h: 0.05, dip: 0.8, sweep: 1.2, shape: 'tri' },
    caudal: { shape: 'hetero', size: 0.27, tilt: 0.12 },
  },
  eye: { t: 0.085, v: 0.25, r: 0.0085 },
  col: { d: 0x6a7480, b: 0xeef0f0, p: 0x222222, f: 0x6a7480, a: 0x101010 },
  pat: [24, 0.18, 0], cs: [-0.05, 0.25], sheen: 0.15, rough: 0.42, iris: 0.2, scars: 0.9,
  mot: { mode: 0, amp: 0.065, waves: 0.8, c0: 0.1, beat: 0.8, idle: 0.35 },
  beh: CRUISE, size: [1.6, 2.4],
});
const EEL = fish({
  body: { depth: 0.06, width: 0.75, tm: 0.12, nose: 0.7, tail: 1.0, ped: 0.25, tEnd: 0.97, n: 2.0, segL: 1.8 },
  fins: {
    dorsal: [{ t0: 0.16, t1: 0.99, h: 0.022, shape: 'long', sweep: 0.2 }],
    anal: [{ t0: 0.45, t1: 0.99, h: 0.018, shape: 'long', sweep: 0.2 }],
    pect: { t: 0.12, span: 0.02, a: 0, h: 0.02, dip: 0.2, sweep: 1 }, pelv: null,
    caudal: { shape: 'pointed', size: 0.03 },
  },
  eye: { t: 0.035, v: 0.45, r: 0.0055 },
  mot: { mode: 0, amp: 0.06, waves: 1.4, c0: 0.35, beat: 1.4, idle: 0.5 },
});
const CETACEAN = fish({
  det: 2,
  body: { n: 2.1, st: null },
  fins: { anal: null, pelv: null, pect: null, dorsal: null, caudal: { shape: 'fluke', size: 0.13 } },
  eye: { t: 0.105, v: 0.0, r: 0.006, axis: [1, 0, 0.3] },
  sheen: 0.22, rough: 0.28, iris: 0.15, cs: [-0.15, 0.2],
  mot: { mode: 1, amp: 0.05, waves: 0.6, c0: 0.08, beat: 0.9, idle: 0.25 },
  beh: POD,
});
const RAY = fish({
  det: 2,
  body: { n: 2, thinW: 0.15, thinB: 0.1, segA: 1.5, segL: 1.1 },
  fins: { dorsal: null, anal: null, pect: null, pelv: null, caudal: null },
  eye: { t: 0.06, v: 0.5, r: 0.012, axis: [1, 0.6, 0.2] },
  mot: { mode: 2, amp: 0.25, waves: 0.35, c0: 0, beat: 0.5, idle: 0.3 },
  sheen: 0.12, rough: 0.45, cs: [0.0, 1.0],
  beh: { ...CRUISE, zone: 'floor', alt: [1, 5] },
});
const JELLY = {
  plan: 'jelly', det: 1, jelly: { h: 0.3, th: 1.45, nT: 16, tl: 1.2, nO: 4, ol: 0.6 },
  col: { d: 0xe0ecff, b: 0xe0ecff, p: 0xc8b0f0, f: 0xe8f0ff, p2: 0, a: 0x7ab8ff },
  pat: [0, 1, 0.5], pat2: [0, 1, 0.5], cs: [-2, 0], finEdge: 0, finRays: 0, iris: 0,
  glowMode: 2, glow: 0.6, sheen: 0.2, rough: 0.25, translucent: true,
  mot: { mode: 4, amp: 0.14, waves: 0, c0: 0, beat: 0, idle: 0.6 },
  beh: DRIFT, size: [0.25, 0.45],
};
const jelly = (o) => merge(JELLY, o);

const C = (d, b, p, f, p2 = 0, a = 0x101010) => ({ d, b, p, f, p2, a });
const ST = (t, top, bot, wid, yc) => ({ st: { t, top, bot, wid, yc } });

// ---------- catalogue ----------
export const SPECIES = {
  // ======== REEF ========
  clownfish: fish({
    body: { depth: 0.36, width: 0.42, tm: 0.34, nose: 0.55, tail: 1.2, ped: 0.16, tEnd: 0.8 },
    fins: { dorsal: [{ t0: 0.27, t1: 0.5, h: 0.07, shape: 'low' }, { t0: 0.5, t1: 0.74, h: 0.1, shape: 'round' }], anal: [{ t0: 0.58, t1: 0.74, h: 0.09 }], caudal: { shape: 'rounded', size: 0.2 } },
    col: C(0xff6a10, 0xff8a3a, 0xffffff, 0xff7020, 0, 0x111111), pat: [9, 1, 0.045], cs: [-0.6, 0.05], finEdge: 0.9,
    beh: { ...SHOAL, n: [2, 5], alt: [0.3, 1.2], spread: 2.5, speed: [0.2, 0.4] }, size: [0.08, 0.11], sheen: 0.15,
  }),
  bluetang: fish({
    body: { depth: 0.46, width: 0.3, tm: 0.36, nose: 0.6, ped: 0.1, tail: 1.4 },
    fins: { dorsal: [{ t0: 0.22, t1: 0.78, h: 0.06, shape: 'long' }], anal: [{ t0: 0.5, t1: 0.78, h: 0.055, shape: 'long' }], caudal: { shape: 'emarginate', size: 0.2 } },
    col: C(0x1a50dc, 0x3a78f0, 0x0a0a22, 0x1a3fc0, 0xffd400, 0x0a0a22), pat: [12, 0.28, 0.2], pat2: [23, 0.83, 0], finEdge: 0.85,
    beh: { ...SHOAL, n: [4, 12] }, size: [0.18, 0.28], sheen: 0.2,
  }),
  yellowtang: fish({
    body: { depth: 0.52, width: 0.25, tm: 0.38, nose: 0.95, ped: 0.1, snout: 0.15 },
    fins: { dorsal: [{ t0: 0.22, t1: 0.78, h: 0.1, shape: 'long' }], anal: [{ t0: 0.5, t1: 0.78, h: 0.09, shape: 'long' }], caudal: { shape: 'emarginate', size: 0.19 } },
    col: C(0xffd000, 0xffe060, 0xfff0a0, 0xffd000), cs: [-0.3, 0.05], sheen: 0.12,
    beh: { ...SHOAL, n: [5, 16] }, size: [0.15, 0.2],
  }),
  moorish: fish({
    body: { depth: 0.7, width: 0.18, tm: 0.3, nose: 1.25, ped: 0.08, tail: 1.6, snout: 0.1 },
    fins: { dorsal: [{ t0: 0.3, t1: 0.66, h: 0.55, shape: 'idol', sweep: 1.4 }], anal: [{ t0: 0.42, t1: 0.68, h: 0.22, shape: 'tri', sweep: 0.8 }], caudal: { shape: 'forked', size: 0.17 }, pelv: { t: 0.3, h: 0.08 } },
    col: C(0xf4f0e0, 0xfaf6ec, 0x101010, 0xf5d030, 0xf5d030, 0x101010), pat: [1, 2.9, 0.28], pat2: [23, 0.62, 0.6], finEdge: 0.4,
    beh: { ...SHOAL, n: [1, 4] }, size: [0.15, 0.22], sheen: 0.1,
  }),
  emperorAngel: fish({
    body: { depth: 0.52, width: 0.22, tm: 0.36, nose: 0.6, ped: 0.13 },
    fins: { dorsal: [{ t0: 0.24, t1: 0.78, h: 0.09, shape: 'long', sweep: 0.6 }], anal: [{ t0: 0.5, t1: 0.78, h: 0.09, shape: 'long', sweep: 0.6 }], caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0x1d3fa8, 0x2a4fd0, 0xffd34a, 0xffc830, 0x0a0a30, 0x3a9aff), pat: [2, 22, 0.38], pat2: [8, 0.12, 0.03], finEdge: 0.5,
    beh: { ...SOLO, n: [1, 2] }, size: [0.25, 0.38],
  }),
  queenAngel: fish({
    body: { depth: 0.55, width: 0.22, tm: 0.36, nose: 0.6, ped: 0.13 },
    fins: { dorsal: [{ t0: 0.24, t1: 0.78, h: 0.12, shape: 'falcate', sweep: 1.2 }], anal: [{ t0: 0.5, t1: 0.78, h: 0.12, shape: 'falcate', sweep: 1.2 }], caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0x3a8ab8, 0xe8d040, 0x1a4a8a, 0xf2c823, 0, 0x2060ff), pat: [25, 60, 0.6], cs: [-0.2, 0.08], finEdge: 0.9,
    beh: { ...SOLO, n: [1, 2] }, size: [0.25, 0.4],
  }),
  butterfly: fish({
    body: { depth: 0.6, width: 0.2, tm: 0.4, nose: 0.7, ped: 0.12, snout: 0.1 },
    extra: { bill: { len: 0.05, r: 0.024, y: 0.02, part: 0, blunt: 1 } },
    fins: { dorsal: [{ t0: 0.24, t1: 0.78, h: 0.08, shape: 'long', sweep: 0.6 }], anal: [{ t0: 0.5, t1: 0.78, h: 0.07, shape: 'long' }], caudal: { shape: 'truncate', size: 0.15 } },
    col: C(0xffd84a, 0xfff2b0, 0x111111, 0xffd030, 0x111111, 0x111111), pat: [5, 1, 0.07], pat2: [8, 0.11, 0.028], finEdge: 0.4,
    beh: { ...SHOAL, n: [2, 6] }, size: [0.12, 0.2],
  }),
  copperband: fish({
    body: { depth: 0.58, width: 0.18, tm: 0.42, nose: 0.7, ped: 0.12, snout: 0.05 },
    extra: { bill: { len: 0.11, r: 0.02, y: 0.015, part: 0, blunt: 1 } },
    fins: { dorsal: [{ t0: 0.26, t1: 0.78, h: 0.09, shape: 'long', sweep: 0.6 }], anal: [{ t0: 0.5, t1: 0.78, h: 0.08, shape: 'long' }], caudal: { shape: 'truncate', size: 0.14 } },
    col: C(0xf8f4ec, 0xffffff, 0xff8a1a, 0xf8f0e0, 0x101010, 0x101010), pat: [1, 4.2, 0.3], pat2: [5, 1, 0.06],
    beh: { ...SHOAL, n: [1, 3] }, size: [0.12, 0.18],
  }),
  parrotfish: fish({
    body: { depth: 0.34, width: 0.5, tm: 0.3, nose: 0.45, tail: 1.3, ped: 0.14, snout: 0.15, bumps: [['t', 0.06, 0.05, 0.12]] },
    fins: { dorsal: [{ t0: 0.25, t1: 0.75, h: 0.05, shape: 'long' }], anal: [{ t0: 0.55, t1: 0.75, h: 0.05, shape: 'long' }], caudal: { shape: 'lyre', size: 0.2 }, pect: { h: 0.12 } },
    col: C(0x17b39a, 0x56d6bb, 0x0b6f6a, 0x2a9ad0, 0xff8ac8, 0xff70b0), pat: [4, 28, 0.22], pat2: [22, 0.1, 0.5], finEdge: 0.8, sheen: 0.25,
    beh: { ...SHOAL, n: [3, 8], alt: [0.3, 1.5] }, size: [0.35, 0.6],
  }),
  lionfish: fish({
    det: 2,
    body: { depth: 0.32, width: 0.45, tm: 0.34, nose: 0.6, tail: 1.3, ped: 0.13 },
    fins: { dorsal: [{ t0: 0.2, t1: 0.75, h: 0.32, shape: 'spiny', spikes: 13, sweep: 0.55 }], anal: [{ t0: 0.58, t1: 0.74, h: 0.12, shape: 'round' }], pect: { t: 0.24, span: 0.08, a: -0.3, h: 0.38, dip: 0.35, sweep: 1.0, shape: 'paddle' }, pelv: { h: 0.12 }, caudal: { shape: 'rounded', size: 0.18 } },
    col: C(0x8a2216, 0xf2e2d4, 0xf6eadf, 0xd8b4a0, 0, 0x7a1a10), pat: [15, 9, 0.42], finRays: 0.95,
    mot: { amp: 0.03, beat: 0.8, idle: 0.6 }, beh: { ...HOVER, n: [1, 2] }, size: [0.25, 0.38],
  }),
  puffer: fish({
    body: { depth: 0.52, width: 0.72, tm: 0.42, nose: 0.4, tail: 1.2, ped: 0.2, n: 2 },
    fins: { dorsal: [{ t0: 0.66, t1: 0.74, h: 0.07 }], anal: [{ t0: 0.66, t1: 0.74, h: 0.06 }], pelv: null, caudal: { shape: 'rounded', size: 0.18 }, pect: { h: 0.08, dip: 0.2 } },
    col: C(0x3a3a38, 0x8a8a84, 0xf4f4f0, 0x4a4a46), pat: [3, 22, 0.25], cs: [-0.4, 0.1], eye: { r: 0.045 },
    mot: { amp: 0.035, beat: 0.9, idle: 0.9 }, beh: { ...SOLO, speed: [0.2, 0.4] }, size: [0.3, 0.5], sheen: 0.12,
  }),
  boxfish: fish({
    body: { depth: 0.42, width: 0.5, tm: 0.45, nose: 0.3, tail: 1.1, ped: 0.15, n: 3.6 },
    fins: { dorsal: [{ t0: 0.68, t1: 0.74, h: 0.07 }], anal: [{ t0: 0.68, t1: 0.74, h: 0.06 }], pelv: null, caudal: { shape: 'rounded', size: 0.22 } },
    col: C(0xffd21a, 0xffe060, 0x101010, 0xffd21a), pat: [3, 16, 0.2], cs: [-0.4, 0.1],
    mot: { amp: 0.03, beat: 0.9, idle: 1.2 }, beh: { ...SOLO, speed: [0.15, 0.3] }, size: [0.12, 0.25], sheen: 0.15,
  }),
  coralGrouper: fish({
    body: { depth: 0.3, width: 0.52, tm: 0.33, nose: 0.75, tail: 1.4, ped: 0.13, snout: 0.15 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.75, h: 0.07, shape: 'long' }], caudal: { shape: 'truncate', size: 0.18 } },
    col: C(0xc8201e, 0xd84a3a, 0x3ab0ff, 0xb81a18, 0, 0x2a90ff), pat: [3, 20, 0.22], finEdge: 0.5,
    beh: { ...SOLO, n: [1, 2], speed: [0.3, 0.6] }, size: [0.45, 0.8],
  }),
  goliath: fish({
    det: 2,
    body: { depth: 0.33, width: 0.62, tm: 0.33, nose: 0.6, tail: 1.3, ped: 0.15, snout: 0.15 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.75, h: 0.08, shape: 'long' }], caudal: { shape: 'rounded', size: 0.18 }, pect: { h: 0.14 } },
    col: C(0x6a5a3a, 0x8a7a5a, 0x3a3020, 0x5a4a32), pat: [15, 6, 0.35], pat2: [3, 30, 0.2], eye: { r: 0.022 },
    mot: { amp: 0.045, beat: 0.9 }, beh: { ...SOLO, speed: [0.2, 0.5] }, size: [1.5, 2.4], sheen: 0.08, rough: 0.55,
  }),
  snapper: fish({
    det: 0,
    body: { depth: 0.3, width: 0.42, tm: 0.36, nose: 0.8, tail: 1.5 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.72, h: 0.08, shape: 'long' }] },
    col: C(0xffd23a, 0xfff0a0, 0x3aa0ff, 0xffd23a), pat: [2, 7, 0.22], sheen: 0.4,
    beh: { ...SCHOOL, n: [30, 80], speed: [0.3, 0.6], zone: 'floor', alt: [1.5, 5] }, size: [0.25, 0.35],
  }),
  sweetlips: fish({
    body: { depth: 0.33, width: 0.42, tm: 0.36, nose: 0.55, tail: 1.5, snout: -0.1 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.72, h: 0.08, shape: 'long' }], caudal: { shape: 'truncate', size: 0.2 } },
    col: C(0xf6f4ee, 0xffffff, 0x151515, 0xf5d23a, 0, 0x151515), pat: [2, 14, 0.4], finEdge: 0,
    beh: { ...SHOAL, n: [5, 14], speed: [0.15, 0.3] }, size: [0.35, 0.5],
  }),
  picasso: fish({
    body: { depth: 0.45, width: 0.3, tm: 0.38, nose: 0.85, tail: 1.4, snout: 0.1 },
    fins: { dorsal: [{ t0: 0.25, t1: 0.3, h: 0.06, shape: 'tri' }, { t0: 0.48, t1: 0.75, h: 0.09, shape: 'long' }], anal: [{ t0: 0.5, t1: 0.75, h: 0.08, shape: 'long' }], caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0xd8c8a0, 0xf6f0e0, 0x1e5aa0, 0xe0d4b0, 0x101010, 0x101010), pat: [7, 7, 0.9], pat2: [8, 0.16, 0.015],
    beh: { ...SOLO, speed: [0.2, 0.4] }, size: [0.18, 0.28],
  }),
  anthias: fish({
    det: 0,
    body: { depth: 0.3, width: 0.38, tm: 0.36, nose: 0.75 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.72, h: 0.08, shape: 'long' }], caudal: { shape: 'lyre', size: 0.24 } },
    col: C(0xff8a5a, 0xffb08a, 0xffd0a0, 0xff7a4a, 0, 0xc040ff), pat: [12, 0.0, 0.05], finEdge: 0.6, sheen: 0.25,
    beh: { ...SHOAL, n: [30, 90], alt: [0.6, 4], spread: 7, speed: [0.3, 0.7] }, size: [0.09, 0.14],
  }),
  chromis: fish({
    det: 0,
    body: { depth: 0.38, width: 0.36, tm: 0.38, nose: 0.6 },
    fins: { caudal: { shape: 'forked', size: 0.24 } },
    col: C(0x5ad0e4, 0x9aeaf2, 0, 0x6ad8ea), sheen: 0.55,
    beh: { ...SHOAL, n: [30, 90], alt: [0.6, 3.5], spread: 6, speed: [0.3, 0.7] }, size: [0.07, 0.11],
  }),
  sergeant: fish({
    det: 0,
    body: { depth: 0.45, width: 0.3, tm: 0.38, nose: 0.6 },
    fins: { caudal: { shape: 'forked', size: 0.2 } },
    col: C(0xe8e070, 0xf4f4e8, 0x141414, 0xe8e070), pat: [1, 5.2, 0.2], sheen: 0.25,
    beh: { ...SHOAL, n: [15, 40], alt: [0.8, 3], spread: 5 }, size: [0.12, 0.18],
  }),
  napoleon: fish({
    det: 2,
    body: { depth: 0.36, width: 0.48, tm: 0.33, nose: 0.55, tail: 1.3, ped: 0.15, bumps: [['t', 0.09, 0.05, 0.35]] },
    fins: { dorsal: [{ t0: 0.28, t1: 0.75, h: 0.06, shape: 'long' }], caudal: { shape: 'rounded', size: 0.17 }, pect: { h: 0.14 } },
    col: C(0x2a7a72, 0x4a9a8a, 0x174a50, 0x3a8a80, 0, 0xf0d040), pat: [4, 30, 0.2], pat2: [7, 12, 0.3], sheen: 0.15,
    mot: { amp: 0.045, beat: 0.8 }, beh: { ...SOLO, speed: [0.4, 0.7], alt: [1.5, 4] }, size: [1.2, 1.8],
  }),
  barracuda: fish({
    body: { depth: 0.12, width: 0.8, tm: 0.42, nose: 1.3, tail: 1.6, ped: 0.32, tEnd: 0.82, snout: -0.15 },
    fins: { dorsal: [{ t0: 0.35, t1: 0.4, h: 0.05, shape: 'tri' }, { t0: 0.62, t1: 0.68, h: 0.05, shape: 'tri' }], anal: [{ t0: 0.63, t1: 0.68, h: 0.045, shape: 'tri' }], caudal: { shape: 'forked', size: 0.2 } },
    col: C(0x4f5f68, 0xe8eef0, 0x22303a, 0x5f6a70), pat: [1, 9, 0.18], sheen: 0.95, eye: { r: 0.02 },
    mot: { amp: 0.05, beat: 1.0, idle: 0.3 },
    beh: { ...SCHOOL, n: [12, 40], speed: [0.3, 0.6], zone: 'mid' }, size: [0.8, 1.3],
  }),
  jack: fish({
    det: 0,
    body: { depth: 0.33, width: 0.42, tm: 0.36, nose: 0.6, tail: 1.6, ped: 0.06, tEnd: 0.8 },
    fins: { dorsal: [{ t0: 0.3, t1: 0.38, h: 0.05, shape: 'tri' }, { t0: 0.45, t1: 0.72, h: 0.11, shape: 'falcate', sweep: 0.8 }], anal: [{ t0: 0.5, t1: 0.72, h: 0.1, shape: 'falcate', sweep: 0.8 }], pect: { h: 0.18, shape: 'falcate', sweep: 2 }, caudal: { shape: 'lunate', size: 0.26 } },
    col: C(0x56677a, 0xe4e8ec, 0, 0x60707e), sheen: 1.0, eye: { r: 0.04 },
    mot: { amp: 0.05, waves: 0.75, c0: 0.06 },
    beh: { kind: 'mill', n: [60, 150], speed: [0.9, 1.4], zone: 'mid', spread: 1 }, size: [0.5, 0.8],
  }),
  reefShark: SHARK,
  whitetip: merge(SHARK, { body: { depth: 0.15 }, col: { d: 0x7a7a74, b: 0xe6e6e0, a: 0xf6f6f2 }, finEdge: 0.95, beh: { ...SOLO, dist: [6, 25], speed: [0.5, 1] } }),
  blacktip: merge(SHARK, { col: { d: 0x8a8e88, a: 0x0c0c0c }, finEdge: 0.95, size: [1.3, 1.8] }),
  eagleRay: merge(RAY, {
    // angular diamond wings, a distinct duck-bill head set forward of the wings, very long whip tail
    body: { ...ST([0, 0.02, 0.05, 0.075, 0.09, 0.13, 0.18, 0.22, 0.26, 0.29, 0.32, 0.36, 0.5, 0.75, 1.0],
      [0.01, 0.018, 0.022, 0.021, 0.024, 0.028, 0.026, 0.022, 0.016, 0.01, 0.007, 0.004, 0.0025, 0.0015, 0],
      [0.008, 0.012, 0.014, 0.013, 0.014, 0.016, 0.015, 0.012, 0.009, 0.006, 0.004, 0.003, 0.002, 0.001, 0],
      [0.012, 0.022, 0.028, 0.026, 0.05, 0.16, 0.27, 0.3, 0.2, 0.08, 0.025, 0.008, 0.004, 0.002, 0]), thinW: 0.035, thinB: 0.12, segL: 1.4 },
    eye: { t: 0.05, v: 0.5, r: 0.006, x: 0.024, axis: [1, 0.5, 0.2] },
    col: C(0x1c2430, 0xf2f2ee, 0xf2f2ee, 0x1c2430), pat: [27, 30, 0.28], cs: [0.0, 1.0],
    mot: { amp: 0.6, waves: 2.0, c0: 0.03, beat: 0.45, idle: 0.28 },
    beh: { ...POD, n: [2, 6], zone: 'floor', alt: [1.5, 4], speed: [0.8, 1.3], dist: [4, 20], routes: { cross: 2, oncoming: 2, lead: 1 } }, size: [2.4, 3.6],
  }),
  bluespotRay: merge(RAY, {
    body: ST([0, 0.04, 0.1, 0.18, 0.26, 0.36, 0.44, 0.5, 0.6, 0.8, 1.0],
      [0, 0.03, 0.045, 0.05, 0.05, 0.045, 0.03, 0.014, 0.008, 0.005, 0.0],
      [0, 0.02, 0.025, 0.03, 0.03, 0.025, 0.018, 0.01, 0.006, 0.004, 0.0],
      [0, 0.18, 0.3, 0.355, 0.36, 0.32, 0.2, 0.05, 0.016, 0.008, 0.0]),
    eye: { t: 0.13, v: 0.6, r: 0.014, x: 0.05 },
    col: C(0xb09060, 0xf0eadc, 0x2a80ff, 0x9a7a50), pat: [3, 14, 0.24], pat2: [6, 9, 0.62],
    mot: { amp: 0.14, waves: 4.0, c0: 0.07 }, beh: { kind: 'rest', n: [1, 3], spread: 3, lift: [5, 9], speed: [0.5, 0.9], alt: [0.3, 1] }, size: [0.45, 0.75],
  }),
  southernRay: merge(RAY, {
    body: ST([0, 0.04, 0.1, 0.18, 0.26, 0.36, 0.44, 0.5, 0.6, 0.8, 1.0],
      [0, 0.03, 0.045, 0.05, 0.05, 0.045, 0.03, 0.014, 0.008, 0.005, 0.0],
      [0, 0.02, 0.025, 0.03, 0.03, 0.025, 0.018, 0.01, 0.006, 0.004, 0.0],
      [0, 0.2, 0.33, 0.39, 0.4, 0.36, 0.22, 0.05, 0.016, 0.008, 0.0]),
    eye: { t: 0.13, v: 0.6, r: 0.012, x: 0.05 },
    col: C(0xa89c84, 0xf0eadc, 0x6e6454, 0x988c76, 0xc4b89e), pat: [6, 3, 0.55], pat2: [25, 70, 0.55],
    mot: { amp: 0.12, waves: 4.0, c0: 0.08 }, beh: { kind: 'rest', n: [1, 2], spread: 5, lift: [6, 11], speed: [0.5, 0.9], alt: [0.3, 1.2] }, size: [1.0, 1.6],
  }),
  manta: merge(RAY, {
    body: ST([0, 0.04, 0.1, 0.2, 0.32, 0.42, 0.48, 0.55, 0.62, 0.7, 0.78, 0.86, 0.94],
      [0.03, 0.05, 0.07, 0.085, 0.09, 0.085, 0.08, 0.07, 0.06, 0.04, 0.02, 0.008, 0],
      [0.03, 0.04, 0.05, 0.06, 0.06, 0.055, 0.05, 0.045, 0.04, 0.03, 0.015, 0.006, 0],
      [0.13, 0.2, 0.33, 0.62, 0.95, 1.12, 1.08, 0.72, 0.3, 0.12, 0.05, 0.02, 0]),
    fins: { ceph: { t: 0.0, span: 0.04, a: 0, h: 0.13, dip: 0.5, sweep: 0, fwd: 1.4, shape: 'paddle', inset: 0.95, vN: 1 } },
    eye: { t: 0.05, v: 0.2, r: 0.012, x: 0.2, axis: [1, 0.2, 0.3] },
    col: C(0x14181e, 0xf2f2f0, 0x2a2a2a, 0x14181e, 0xe8e8e4), pat: [3, 5, 0.22], pat2: [6, 2.0, 0.72], cs: [0.0, 1.0],
    mot: { amp: 0.26, waves: 1.0, c0: 0.12, beat: 0.3, idle: 0.18 },
    beh: { ...GIANT, n: [1, 3], speed: [0.8, 1.3], dist: [8, 30], over: [2, 5] }, size: [2.2, 3.2], hl: true, scars: 0.4,
  }),
  moray: merge(EEL, {
    body: { depth: 0.085, width: 0.62, tm: 0.13, nose: 0.6, bumps: [['t', 0.07, 0.04, 0.18]] },
    fins: { pect: null },
    col: C(0x4f6a22, 0x6a8a32, 0x2a3a14, 0x4f6a22), pat: [6, 5, 0.6], eye: { r: 0.007 },
    mot: { mode: 8, amp: 0.035, waves: 0.6 }, beh: { kind: 'peek', n: [1, 2] }, size: [1.0, 1.6], sheen: 0.3, rough: 0.3,
  }),
  spotMoray: merge(EEL, {
    body: { depth: 0.08, width: 0.62, tm: 0.13, nose: 0.6, bumps: [['t', 0.07, 0.04, 0.15]] },
    fins: { pect: null },
    col: C(0xe8dcc0, 0xf2eadc, 0x2a2018, 0xe0d4b8), pat: [3, 34, 0.32], eye: { r: 0.007 },
    mot: { mode: 8, amp: 0.035, waves: 0.6 }, beh: { kind: 'peek', n: [1, 2] }, size: [0.8, 1.2], sheen: 0.3, rough: 0.3,
  }),
  gardenEel: merge(EEL, {
    det: 0, body: { depth: 0.028, width: 0.9, tm: 0.1, segL: 1.2 }, fins: { pect: null, anal: null },
    col: C(0xf2efe4, 0xf8f6ee, 0x111111, 0xf0ece0), pat: [3, 38, 0.3], eye: { r: 0.006 },
    mot: { mode: 8, amp: 0.05, waves: 0.5 }, beh: { kind: 'colony', n: [25, 60], spread: 6 }, size: [0.4, 0.6],
  }),
  splendidEel: merge(EEL, {
    det: 0, body: { depth: 0.028, width: 0.9, tm: 0.1, segL: 1.2 }, fins: { pect: null, anal: null },
    col: C(0xff8c3a, 0xffa860, 0xfff4e8, 0xff8c3a), pat: [1, 14, 0.32], eye: { r: 0.006 },
    mot: { mode: 8, amp: 0.05, waves: 0.5 }, beh: { kind: 'colony', n: [20, 50], spread: 5 }, size: [0.35, 0.5],
  }),
  greenTurtle: fish({
    det: 2,
    body: { ...ST([0, 0.03, 0.08, 0.13, 0.17, 0.22, 0.3, 0.42, 0.55, 0.68, 0.78, 0.86, 0.92],
      [0, 0.028, 0.04, 0.035, 0.032, 0.09, 0.135, 0.15, 0.14, 0.11, 0.06, 0.02, 0],
      [0, 0.025, 0.033, 0.03, 0.03, 0.05, 0.06, 0.065, 0.065, 0.055, 0.035, 0.015, 0],
      [0, 0.035, 0.05, 0.045, 0.045, 0.22, 0.34, 0.38, 0.37, 0.3, 0.19, 0.06, 0]), n: 2.3, nb: 3.5, parts: [[0.185, 0.84, 10]] },
    fins: {
      dorsal: null, anal: null, caudal: null, pect: null,
      flip: { t: 0.25, span: 0.07, a: -0.15, h: 0.44, dip: 0.25, sweep: 1.0, shape: 'flipper', thick: 0.1, inset: 0.85, part: 7 },
      pelv: { t: 0.74, span: 0.05, a: -0.3, h: 0.14, dip: 0.2, sweep: 1.7, shape: 'paddle', thick: 0.08, inset: 0.85 },
    },
    eye: { t: 0.05, v: 0.3, r: 0.01 },
    col: C(0x5e4a28, 0xe0d4a8, 0x9a7a44, 0x5a4a30, 0x2a2416, 0x3a2a10), pat: [20, 5.5, 0], pat2: [4, 45, 0.25], cs: [-0.2, 0.3], sheen: 0.15, rough: 0.4,
    mot: { mode: 3, amp: 0.7, beat: 0.5, idle: 0.22 },
    beh: { ...SOLO, speed: [0.4, 0.8], dist: [6, 25], zone: 'floor', alt: [1, 4] }, size: [0.9, 1.2], barnacles: 0.3, scars: 0.3,
  }),
  octopus: {
    plan: 'octopus', det: 1, octo: { armLen: 0.55 },
    col: C(0xb8542c, 0xe8b08a, 0x5e2010, 0xc8683e, 0xf6dcc0, 0xe0a040), pat: [30, 6, 1.0], pat2: [3, 32, 0.2], cs: [-2, 0],
    finEdge: 0, finRays: 0, iris: 0.8, glowMode: 0, glow: 0, sheen: 0.28, rough: 0.42,
    mot: { mode: 6, amp: 0, waves: 0, c0: 0, beat: 0, idle: 0.5 },
    beh: { kind: 'octo', n: [1, 2], speed: [0.08, 0.2], spread: 3, lift: [4, 6.5] }, size: [0.9, 1.4],
  },
  cuttlefish: fish({
    plan: 'squid', det: 1,
    body: ST([0, 0.06, 0.14, 0.2, 0.3, 0.5, 0.7, 0.85, 0.95, 1.0],
      [0, 0.04, 0.06, 0.055, 0.07, 0.08, 0.075, 0.06, 0.035, 0],
      [0, 0.035, 0.05, 0.05, 0.065, 0.075, 0.07, 0.055, 0.03, 0],
      [0, 0.05, 0.075, 0.07, 0.11, 0.13, 0.12, 0.09, 0.05, 0]),
    squid: { eyeT: 0.12, eyeR: 0.024, armsFront: true, armLen: 0.13, armR: 0.012, spread: 0.1, skirt: { t0: 0.2, t1: 0.97, h: 0.035 } },
    col: C(0x6a5040, 0xd8c8b0, 0x2a1a12, 0x8a7060, 0xf0e8d8, 0x30c060), pat: [14, 9, 0.6], pat2: [6, 4, 0.6], cs: [-0.3, 0.2], iris: 0.9,
    mot: { mode: 5, amp: 0.5, beat: 0.6, idle: 0.6 }, beh: { kind: 'school', n: [1, 4], speed: [0.1, 0.4], zone: 'mid', routes: { hold: 3, lead: 1 } }, size: [0.3, 0.5], sheen: 0.25,
  }),
  reefSquid: fish({
    plan: 'squid', det: 1,
    body: ST([0, 0.04, 0.12, 0.25, 0.4, 0.48, 0.52, 0.56, 0.6, 0.63],
      [0, 0.02, 0.04, 0.052, 0.055, 0.05, 0.04, 0.045, 0.04, 0],
      [0, 0.02, 0.04, 0.052, 0.055, 0.05, 0.04, 0.045, 0.04, 0],
      [0, 0.02, 0.04, 0.055, 0.058, 0.052, 0.042, 0.05, 0.045, 0]),
    squid: { fin: { t0: 0.02, t1: 0.42, h: 0.06, shape: 'long', sweep: 0.25 }, eyeT: 0.555, eyeR: 0.02, armLen: 0.2, armR: 0.008, tentacles: true, tentLen: 0.3, spread: 0.25 },
    col: C(0xb8907a, 0xe8d8c8, 0x7a3020, 0xc8a890, 0, 0x40d0a0), pat: [3, 45, 0.28], cs: [-0.2, 0.2], iris: 0.9, sheen: 0.4,
    mot: { mode: 5, amp: 0.6, beat: 0.5, idle: 0.5 },
    beh: { kind: 'school', n: [4, 12], speed: [0.15, 0.5], zone: 'mid', routes: { hold: 3, lead: 1 } }, size: [0.28, 0.42],
  }),
  whaleShark: merge(SHARK, {
    body: { depth: 0.18, width: 1.05, tm: 0.3, nose: 0.4, noseB: 0.5, tail: 1.2, ped: 0.15, tEnd: 0.73, n: 2.0, nb: 2.8, snout: -0.1, bumps: [['w', 0.03, 0.05, 0.45], ['t', 0.04, 0.05, -0.25]] },
    fins: { dorsal: [{ t0: 0.42, t1: 0.54, h: 0.09, shape: 'shark', sweep: 0.8 }, { t0: 0.68, t1: 0.71, h: 0.03 }], caudal: { shape: 'hetero', size: 0.26, tilt: 0.25 }, pect: { h: 0.15 } },
    eye: { t: 0.06, v: 0.0, r: 0.006, axis: [1, 0, 0.2] },
    col: C(0x3a4a5a, 0xe8ecee, 0xe8ecf0, 0x3a4a5a, 0xc8d0d8), pat: [10, 28, 0.36], pat2: [24, 0.14, 0], cs: [-0.15, 0.4], sheen: 0.12,
    mot: { amp: 0.06, beat: 0.6, idle: 0.2 }, beh: { ...GIANT, speed: [0.8, 1.3], dist: [20, 50] }, size: [8, 12], hl: true,
  }),
  // ======== OPEN OCEAN ========
  sardine: fish({
    det: 0,
    body: { depth: 0.18, width: 0.55, tm: 0.38, nose: 0.9, tail: 1.4, ped: 0.1, tEnd: 0.82 },
    fins: { dorsal: [{ t0: 0.38, t1: 0.48, h: 0.06, shape: 'tri' }], anal: [{ t0: 0.66, t1: 0.74, h: 0.03 }], pect: { h: 0.07 }, pelv: { h: 0.04 }, caudal: { shape: 'forked', size: 0.2 } },
    col: C(0x2c4a6a, 0xeef2f4, 0x1a2a3a, 0x8a9aa8), pat: [12, 0.45, 0.04], cs: [0.45, 0.45], sheen: 1.0, eye: { r: 0.045 },
    mot: { amp: 0.06, beat: 1.8, idle: 1.2 },
    beh: { kind: 'bait', n: [260, 420], speed: [1.0, 1.6], zone: 'mid', spread: 1 }, size: [0.15, 0.22],
  }),
  anchovy: fish({
    det: 0,
    body: { depth: 0.15, width: 0.6, tm: 0.38, nose: 0.9, tail: 1.4, ped: 0.1, tEnd: 0.82, snout: 0.1 },
    fins: { dorsal: [{ t0: 0.4, t1: 0.48, h: 0.06, shape: 'tri' }], pect: { h: 0.06 }, pelv: { h: 0.04 }, caudal: { shape: 'forked', size: 0.2 } },
    col: C(0x3a5a58, 0xe8eef0, 0xf4f8fa, 0x8a9a9a), pat: [12, 0.05, 0.09], cs: [0.4, 0.4], sheen: 1.0, eye: { r: 0.05 },
    mot: { amp: 0.06, beat: 1.8, idle: 1.2 },
    beh: { ...SCHOOL, n: [150, 300], speed: [0.8, 1.4] }, size: [0.1, 0.15],
  }),
  yellowfin: fish({
    det: 1,
    body: { depth: 0.25, width: 0.75, tm: 0.38, nose: 0.85, tail: 1.3, ped: 0.07, pedW: 0.1, tEnd: 0.8 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.36, h: 0.09, shape: 'tri', sweep: 0.6 }, { t0: 0.5, t1: 0.56, h: 0.17, shape: 'falcate', sweep: 0.9 }], anal: [{ t0: 0.56, t1: 0.62, h: 0.16, shape: 'falcate', sweep: 0.9 }], pect: { h: 0.18, shape: 'falcate', dip: 0.15, sweep: 2.4 }, caudal: { shape: 'lunate', size: 0.27 } },
    col: C(0x14204a, 0xe8ecef, 0xffd43a, 0xffd43a, 0x8a9ab0), pat: [12, 0.1, 0.07], pat2: [1, 18, 0.12], sheen: 0.95, cs: [0.15, 0.3],
    mot: { amp: 0.042, waves: 0.65, c0: 0.04, beat: 1.3, idle: 0.6 },
    beh: { ...SCHOOL, n: [12, 35], speed: [1.6, 2.8], routes: { cross: 2, oncoming: 1, overtake: 1 } }, size: [1.0, 1.7],
  }),
  bluefin: fish({
    det: 1,
    body: { depth: 0.27, width: 0.78, tm: 0.4, nose: 0.85, tail: 1.3, ped: 0.07, pedW: 0.1, tEnd: 0.8 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.38, h: 0.08, shape: 'tri', sweep: 0.6 }, { t0: 0.5, t1: 0.56, h: 0.08, shape: 'falcate', sweep: 0.9 }], anal: [{ t0: 0.56, t1: 0.62, h: 0.07, shape: 'falcate' }], pect: { h: 0.12, shape: 'falcate', dip: 0.15, sweep: 2.2 }, caudal: { shape: 'lunate', size: 0.27 } },
    col: C(0x0e1a3a, 0xe4e8ec, 0, 0x2a3450, 0x8a9ab0), pat2: [1, 20, 0.1], sheen: 0.95, cs: [0.1, 0.35],
    mot: { amp: 0.04, waves: 0.65, c0: 0.04, beat: 1.2, idle: 0.6 },
    beh: { ...SCHOOL, n: [8, 25], speed: [1.8, 3], routes: { cross: 2, oncoming: 1, overtake: 1 } }, size: [1.8, 2.6],
  }),
  mahi: fish({
    det: 1,
    body: { depth: 0.24, width: 0.42, tm: 0.14, nose: 0.3, tail: 1.1, ped: 0.08, hump: 0.25, tEnd: 0.8 },
    fins: { dorsal: [{ t0: 0.06, t1: 0.8, h: 0.08, shape: 'long', sweep: 0.3 }], anal: [{ t0: 0.45, t1: 0.8, h: 0.06, shape: 'long' }], caudal: { shape: 'forked', size: 0.24 } },
    col: C(0x1f8a5a, 0xf0d23a, 0x3a90ff, 0x2a7aa0, 0, 0x2a9ad0), pat: [3, 34, 0.18], cs: [-0.1, 0.12], sheen: 0.75,
    beh: { ...SCHOOL, n: [3, 9], speed: [1.5, 2.5], routes: { cross: 1, oncoming: 1, along: 1 } }, size: [0.9, 1.4],
  }),
  sailfish: fish({
    det: 2,
    body: { depth: 0.12, width: 0.7, tm: 0.35, nose: 0.9, tail: 1.3, ped: 0.06, tEnd: 0.82 },
    fins: { dorsal: [{ t0: 0.13, t1: 0.62, h: 0.27, shape: 'sail', sweep: 0.25 }], anal: [{ t0: 0.6, t1: 0.66, h: 0.06, shape: 'falcate' }], pelv: { h: 0.12, dip: 1.4 }, pect: { h: 0.11, shape: 'falcate', sweep: 1.5 }, caudal: { shape: 'lunate', size: 0.25 } },
    extra: { bill: { len: 0.24, r: 0.007, y: 0.005 } },
    col: C(0x1a2e5a, 0xeaeef2, 0x6ac8ff, 0x24407a, 0, 0x2a50a0), pat: [1, 12, 0.18], sheen: 0.9, cs: [0.1, 0.3], eye: { r: 0.012 },
    mot: { amp: 0.045, waves: 0.7, c0: 0.05, beat: 1.0 },
    beh: { ...POD, n: [1, 4], speed: [1.5, 3] }, size: [2.2, 3], hl: true,
  }),
  oceanicWhitetip: merge(SHARK, {
    body: { depth: 0.19 }, fins: { dorsal: [{ t0: 0.3, t1: 0.45, h: 0.15, shape: 'round', sweep: 0.5, thick: 0.06 }, { t0: 0.64, t1: 0.68, h: 0.035 }], pect: { h: 0.25, shape: 'paddle', dip: 0.3 } },
    col: { d: 0x7a746a, b: 0xf0eee8, a: 0xf6f4ee }, finEdge: 1.0, size: [2, 2.8],
  }),
  blueShark: merge(SHARK, {
    body: { depth: 0.12, nose: 1.3, tm: 0.36 }, fins: { pect: { h: 0.22, shape: 'falcate', sweep: 1.1 } },
    col: { d: 0x1f4fa8, b: 0xf2f4f6 }, cs: [-0.1, 0.4], sheen: 0.3, size: [2, 3],
  }),
  greatWhite: merge(SHARK, {
    body: { depth: 0.24, width: 0.95, nose: 0.85, tm: 0.36, ped: 0.15, pedW: 0.2 },
    fins: { dorsal: [{ t0: 0.32, t1: 0.45, h: 0.13, shape: 'shark', sweep: 0.55, thick: 0.07 }, { t0: 0.66, t1: 0.68, h: 0.02 }], caudal: { shape: 'lunate', size: 0.28, tilt: 0.06 } },
    col: { d: 0x5a646e, b: 0xf6f6f4, a: 0x101010 }, cs: [-0.12, 0.85], finEdge: 0.7, mot: { amp: 0.05, waves: 0.7 },
    beh: { ...GIANT, speed: [1, 1.6], dist: [15, 45] }, size: [4, 5.5], hl: true,
  }),
  hammerhead: merge(SHARK, {
    body: { depth: 0.15, nose: 0.6, bumps: [['w', 0.035, 0.03, 3.4], ['t', 0.035, 0.03, -0.45], ['b', 0.035, 0.03, -0.45]] },
    fins: { dorsal: [{ t0: 0.3, t1: 0.42, h: 0.2, shape: 'falcate', sweep: 0.55, thick: 0.06 }, { t0: 0.64, t1: 0.68, h: 0.04 }] },
    eye: { t: 0.035, v: 0, r: 0.009, x: 0.118, axis: [1, 0, 0.1] },
    col: { d: 0x6e7a7c, b: 0xf0f0ec }, beh: { ...POD, n: [4, 14], speed: [0.8, 1.3], dist: [15, 45] }, size: [2.5, 3.5], hl: true,
  }),
  sandTiger: merge(SHARK, {
    body: { depth: 0.2, nose: 0.85, snout: 0.15, tm: 0.38 },
    fins: { dorsal: [{ t0: 0.42, t1: 0.52, h: 0.09, shape: 'round', sweep: 0.5 }, { t0: 0.62, t1: 0.68, h: 0.08, shape: 'round', sweep: 0.5 }], caudal: { shape: 'hetero', size: 0.26, tilt: 0.05 } },
    extra: { teeth: { t: 0.05, n: 14, len: 0.016, r: 0.0025 } },
    col: { d: 0x8a7a64, b: 0xe8e2d4, p: 0x5a4a34 }, pat2: [3, 16, 0.18], mot: { amp: 0.05 },
    beh: { ...SOLO, speed: [0.3, 0.6], zone: 'mid', dist: [6, 20] }, size: [2.2, 3],
  }),
  greenlandShark: merge(SHARK, {
    body: { depth: 0.2, nose: 0.5, tm: 0.4, ped: 0.2 },
    fins: { dorsal: [{ t0: 0.45, t1: 0.52, h: 0.04, shape: 'round' }, { t0: 0.62, t1: 0.66, h: 0.035, shape: 'round' }], caudal: { shape: 'hetero', size: 0.2, tilt: -0.05 }, pect: { h: 0.1, shape: 'round' } },
    col: { d: 0x4a4440, b: 0x5e5854, a: 0xc0d0d8 }, pat2: [6, 4, 0.55], iris: 0.9, cs: [-0.6, 0.1], mot: { amp: 0.05, beat: 0.5 },
    beh: { ...GIANT, speed: [0.3, 0.5], zone: 'floor', alt: [3, 8], dist: [10, 30] }, size: [4, 5.5], hl: true,
  }),
  mola: fish({
    det: 2,
    body: { depth: 0.85, width: 0.2, tm: 0.42, nose: 0.4, tail: 0.6, ped: 0.55, tEnd: 0.82, n: 2.1 },
    fins: { dorsal: [{ t0: 0.52, t1: 0.66, h: 0.55, shape: 'falcate', sweep: 0.35, thick: 0.05 }], anal: [{ t0: 0.52, t1: 0.66, h: 0.55, shape: 'falcate', sweep: 0.35, thick: 0.05 }], pelv: null, pect: { t: 0.3, h: 0.08, shape: 'round', a: 0 }, caudal: { shape: 'rounded', size: 0.12 } },
    eye: { t: 0.14, v: 0.25, r: 0.025 },
    col: C(0x8a929a, 0xd8dcdc, 0xe8ecec, 0x7a828a, 0, 0x3a3a3a), pat: [6, 3, 0.6], cs: [-0.2, 0.08], sheen: 0.3, rough: 0.55,
    mot: { mode: 7, amp: 0.35, waves: 0, beat: 0.6, idle: 0.35 },
    beh: { ...GIANT, speed: [0.3, 0.6], dist: [12, 35] }, size: [1.6, 2.4], hl: true,
  }),
  humpback: merge(CETACEAN, {
    body: ST([0, 0.02, 0.06, 0.12, 0.2, 0.3, 0.42, 0.55, 0.66, 0.76, 0.84, 0.9, 0.92],
      [0, 0.02, 0.04, 0.06, 0.08, 0.095, 0.1, 0.095, 0.075, 0.05, 0.028, 0.015, 0],
      [0, 0.03, 0.06, 0.085, 0.1, 0.105, 0.1, 0.085, 0.06, 0.035, 0.018, 0.01, 0],
      [0, 0.035, 0.06, 0.08, 0.1, 0.11, 0.108, 0.095, 0.07, 0.04, 0.018, 0.009, 0],
      [-0.02, -0.018, -0.012, -0.006, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    fins: {
      dorsal: [{ t0: 0.62, t1: 0.68, h: 0.03, shape: 'hump', sweep: 0.5 }],
      flip: { t: 0.24, span: 0.06, a: -0.5, h: 0.32, dip: 0.5, sweep: 0.55, shape: 'wing', thick: 0.07, part: 7 },
      caudal: { shape: 'fluke', size: 0.16 },
    },
    eye: { t: 0.13, v: -0.1, r: 0.006 },
    col: C(0x22262c, 0x8a9096, 0xd8dcdc, 0xe0e4e4, 0xb0b4b0), pat: [16, 26, 0], pat2: [3, 28, 0.14], cs: [-0.4, 0.2],
    mot: { amp: 0.045, waves: 0.55, beat: 0.8, idle: 0.12 },
    beh: { ...GIANT, n: [1, 2], speed: [1.2, 2], dist: [30, 80] }, size: [12, 15], hl: true, flukeId: 0.95, barnacles: 0.35, scars: 0.6,
  }),
  blueWhale: merge(CETACEAN, {
    body: ST([0, 0.02, 0.06, 0.12, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.87, 0.92, 0.94],
      [0, 0.012, 0.025, 0.04, 0.05, 0.056, 0.058, 0.055, 0.045, 0.03, 0.018, 0.01, 0],
      [0, 0.02, 0.035, 0.048, 0.055, 0.06, 0.058, 0.05, 0.038, 0.025, 0.014, 0.008, 0],
      [0, 0.035, 0.05, 0.058, 0.062, 0.064, 0.062, 0.055, 0.042, 0.026, 0.012, 0.006, 0],
      [-0.01, -0.008, -0.005, -0.003, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    fins: { dorsal: [{ t0: 0.76, t1: 0.79, h: 0.012, shape: 'falcate', sweep: 1 }], flip: { t: 0.22, span: 0.03, a: -0.5, h: 0.1, dip: 0.6, sweep: 0.8, shape: 'wing', thick: 0.08, part: 7 }, caudal: { shape: 'fluke', size: 0.1 } },
    eye: { t: 0.11, v: -0.1, r: 0.004 },
    col: C(0x4a6278, 0x7a8ea0, 0x9aaebe, 0x4a6278), pat: [6, 5, 0.58], pat2: [16, 34, 0], cs: [-0.6, 0.1],
    mot: { amp: 0.035, waves: 0.55, beat: 0.6, idle: 0.08 },
    beh: { ...GIANT, speed: [1.5, 2.4], dist: [40, 90] }, size: [20, 26], hl: true,
  }),
  spermWhale: merge(CETACEAN, {
    body: { ...ST([0, 0.01, 0.05, 0.15, 0.28, 0.35, 0.42, 0.55, 0.66, 0.76, 0.84, 0.9, 0.92],
      [0, 0.07, 0.085, 0.09, 0.09, 0.088, 0.09, 0.085, 0.068, 0.045, 0.026, 0.014, 0],
      [0, 0.03, 0.05, 0.06, 0.08, 0.09, 0.09, 0.08, 0.06, 0.035, 0.018, 0.01, 0],
      [0, 0.05, 0.065, 0.07, 0.075, 0.08, 0.085, 0.08, 0.06, 0.035, 0.016, 0.008, 0],
      [0.03, 0.025, 0.02, 0.015, 0.008, 0.003, 0, 0, 0, 0, 0, 0, 0]), n: 2.6 },
    fins: { dorsal: [{ t0: 0.6, t1: 0.68, h: 0.022, shape: 'hump', sweep: 0.4 }], flip: { t: 0.3, span: 0.03, a: -0.6, h: 0.06, dip: 0.7, sweep: 0.8, shape: 'paddle', thick: 0.1, part: 7 }, caudal: { shape: 'fluke', size: 0.13 } },
    eye: { t: 0.27, v: -0.15, r: 0.005 },
    col: C(0x3a3836, 0x4a4644, 0x2a2826, 0x3a3836), pat: [6, 14, 0.5], cs: [-0.6, 0.1], rough: 0.4,
    mot: { amp: 0.045, waves: 0.55, beat: 0.8, idle: 0.12 },
    beh: { ...GIANT, n: [1, 3], speed: [1.2, 1.8], dist: [30, 70] }, size: [12, 16], hl: true, flukeId: 0.4, scars: 0.9,
  }),
  orca: merge(CETACEAN, {
    body: ST([0, 0.02, 0.05, 0.1, 0.18, 0.28, 0.4, 0.52, 0.64, 0.74, 0.82, 0.88, 0.9],
      [0, 0.03, 0.055, 0.085, 0.11, 0.122, 0.122, 0.11, 0.08, 0.05, 0.03, 0.018, 0],
      [0, 0.03, 0.055, 0.08, 0.1, 0.112, 0.11, 0.095, 0.065, 0.035, 0.018, 0.012, 0],
      [0, 0.035, 0.06, 0.085, 0.105, 0.115, 0.112, 0.1, 0.07, 0.035, 0.016, 0.008, 0]),
    fins: { dorsal: [{ t0: 0.36, t1: 0.5, h: 0.19, shape: 'tri', sweep: 0.22, thick: 0.08 }], flip: { t: 0.22, span: 0.06, a: -0.6, h: 0.14, dip: 0.6, sweep: 0.75, shape: 'paddle', thick: 0.1, part: 7 }, caudal: { shape: 'fluke', size: 0.14 } },
    eye: { t: 0.12, v: 0.12, r: 0.006 },
    col: C(0x0b0c0e, 0x0b0c0e, 0xf4f4f0, 0x0b0c0e), pat: [11, 1, 0], cs: [-2, 0], sheen: 0.3,
    beh: { ...POD, n: [3, 7], speed: [1.8, 3], dist: [20, 55] }, size: [6, 8], hl: true,
  }),
  bottlenose: merge(CETACEAN, {
    body: ST([0, 0.02, 0.05, 0.08, 0.12, 0.2, 0.3, 0.42, 0.55, 0.68, 0.78, 0.86, 0.9],
      [0, 0.012, 0.022, 0.045, 0.068, 0.088, 0.098, 0.095, 0.078, 0.05, 0.03, 0.018, 0],
      [0, 0.012, 0.02, 0.035, 0.055, 0.075, 0.088, 0.085, 0.065, 0.035, 0.018, 0.012, 0],
      [0, 0.014, 0.022, 0.04, 0.058, 0.075, 0.085, 0.08, 0.062, 0.035, 0.016, 0.008, 0],
      [-0.012, -0.01, -0.008, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    fins: { dorsal: [{ t0: 0.4, t1: 0.54, h: 0.1, shape: 'falcate', sweep: 1.0, thick: 0.08 }], flip: { t: 0.2, span: 0.05, a: -0.6, h: 0.12, dip: 0.55, sweep: 1.0, shape: 'flipper', thick: 0.1, part: 7 } },
    col: C(0x5a6470, 0xe0e4e8, 0, 0x5a6470), cs: [-0.15, 0.25],
    beh: { ...POD, n: [4, 10], speed: [2, 3.5], zone: 'surface', routes: { cross: 1, oncoming: 1, escort: 2 } }, size: [2.4, 3.2], hl: true, scars: 0.5,
  }),
  commonDolphin: null, // filled below (variant of bottlenose)
  pilotWhale: null,
  beluga: null,
  narwhal: null,
  // ======== KELP ========
  garibaldi: fish({
    body: { depth: 0.42, width: 0.4, tm: 0.35, nose: 0.5, tail: 1.3, ped: 0.14 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.74, h: 0.09, shape: 'long' }], anal: [{ t0: 0.56, t1: 0.74, h: 0.08 }], caudal: { shape: 'emarginate', size: 0.2 } },
    col: C(0xff5e00, 0xff7a1a, 0xffa040, 0xff6000), cs: [-0.4, 0.05], sheen: 0.15,
    beh: { ...SHOAL, n: [1, 4], spread: 4, speed: [0.2, 0.45] }, size: [0.22, 0.32],
  }),
  sheephead: fish({
    body: { depth: 0.32, width: 0.42, tm: 0.33, nose: 0.55, tail: 1.4, bumps: [['t', 0.1, 0.05, 0.12]] },
    fins: { dorsal: [{ t0: 0.25, t1: 0.75, h: 0.07, shape: 'long' }], caudal: { shape: 'truncate', size: 0.18 } },
    col: C(0xc84444, 0xd86060, 0x161414, 0x2a1a1a, 0x161414, 0xffffff), pat: [22, 0.24, 1], pat2: [23, 0.62, 1],
    beh: { ...SOLO, speed: [0.3, 0.6] }, size: [0.5, 0.8],
  }),
  kelpBass: fish({
    body: { depth: 0.28, width: 0.45, tm: 0.35, nose: 0.75, snout: 0.15 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.72, h: 0.08, shape: 'spiny', spikes: 9 }], caudal: { shape: 'truncate', size: 0.18 } },
    col: C(0x5a5a3a, 0xc8c0a0, 0xd8d0b0, 0x5a5a3a), pat: [6, 6, 0.55], pat2: [3, 18, 0.18],
    beh: { ...SHOAL, n: [3, 8] }, size: [0.35, 0.55],
  }),
  blacksmith: fish({
    det: 0,
    body: { depth: 0.36, width: 0.4, tm: 0.38, nose: 0.6 },
    fins: { caudal: { shape: 'forked', size: 0.22 } },
    col: C(0x2a3a52, 0x4a5a72, 0x101418, 0x2a3a52), pat: [3, 30, 0.22], sheen: 0.3,
    beh: { ...SCHOOL, n: [40, 120], speed: [0.3, 0.7], routes: { hold: 1 } }, size: [0.15, 0.25],
  }),
  senorita: fish({
    det: 0,
    body: { depth: 0.18, width: 0.55, tm: 0.38, nose: 0.85 },
    fins: { caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0xf0c040, 0xf8e0a0, 0, 0xf0c040), sheen: 0.3,
    beh: { ...SHOAL, n: [10, 30], alt: [1, 6] }, size: [0.15, 0.22],
  }),
  opaleye: fish({
    body: { depth: 0.4, width: 0.4, tm: 0.38, nose: 0.55 },
    col: C(0x4a6040, 0x8a9a7a, 0xe8e8e0, 0x4a6040, 0, 0x2a8ad0), pat: [3, 3, 0.18], iris: 0.9,
    beh: { ...SHOAL, n: [6, 20] }, size: [0.25, 0.4],
  }),
  giantSeaBass: fish({
    det: 2,
    body: { depth: 0.3, width: 0.55, tm: 0.36, nose: 0.65, tail: 1.4 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.42, h: 0.07, shape: 'spiny', spikes: 7 }, { t0: 0.45, t1: 0.68, h: 0.08 }], caudal: { shape: 'truncate', size: 0.18 } },
    col: C(0x3e4448, 0x6a7074, 0x15181a, 0x3e4448), pat: [3, 10, 0.22], beh: { ...SOLO, speed: [0.2, 0.5], alt: [1, 4] }, size: [1.6, 2.2],
  }),
  leopardShark: merge(SHARK, {
    body: { depth: 0.13, nose: 0.75 },
    col: { d: 0x8a8070, b: 0xece6da, p: 0x2a2620, p2: 0x3a342c }, pat: [21, 9, 0.48], pat2: [3, 22, 0.22],
    beh: { ...SOLO, speed: [0.5, 0.9], alt: [0.5, 2], dist: [5, 20] }, size: [1.2, 1.6],
  }),
  batRay: merge(RAY, {
    body: ST([0, 0.03, 0.07, 0.12, 0.2, 0.28, 0.34, 0.4, 0.45, 0.52, 0.7, 1.0],
      [0.025, 0.04, 0.055, 0.06, 0.065, 0.06, 0.05, 0.035, 0.02, 0.01, 0.005, 0.002],
      [0.015, 0.025, 0.035, 0.04, 0.04, 0.035, 0.03, 0.02, 0.012, 0.006, 0.003, 0.001],
      [0.04, 0.06, 0.08, 0.3, 0.6, 0.72, 0.52, 0.25, 0.07, 0.012, 0.006, 0.0]),
    eye: { t: 0.05, v: 0.6, r: 0.01, x: 0.05 },
    col: C(0x2a2622, 0xf0ece4, 0, 0x2a2622), mot: { amp: 0.22, waves: 1.0, c0: 0.05 },
    beh: { ...CRUISE, zone: 'floor', alt: [1, 3], speed: [0.6, 1.0] }, size: [0.8, 1.3],
  }),
  harbourSeal: fish({
    det: 2,
    body: { ...ST([0, 0.02, 0.05, 0.1, 0.14, 0.18, 0.28, 0.4, 0.55, 0.7, 0.8, 0.86, 0.88],
      [0, 0.03, 0.05, 0.065, 0.062, 0.065, 0.1, 0.115, 0.105, 0.07, 0.035, 0.02, 0],
      [0, 0.025, 0.04, 0.055, 0.055, 0.065, 0.1, 0.115, 0.1, 0.065, 0.03, 0.018, 0],
      [0, 0.03, 0.05, 0.065, 0.06, 0.065, 0.1, 0.12, 0.11, 0.075, 0.04, 0.025, 0]), n: 2.0 },
    fins: { dorsal: null, anal: null, pelv: null, pect: { t: 0.24, span: 0.04, a: -0.6, aSpan: 0, h: 0.09, dip: 0.8, sweep: 1.2, shape: 'paddle', thick: 0.12 }, caudal: { shape: 'seal', size: 0.15, inset: 0.02 } },
    eye: { t: 0.055, v: 0.35, r: 0.012 },
    col: C(0x6a6c6c, 0xb8b6ae, 0x2a2c2e, 0x5a5c5c), pat: [3, 26, 0.3], cs: [-0.3, 0.15], sheen: 0.3, rough: 0.3, iris: 0.1,
    mot: { mode: 0, amp: 0.06, waves: 0.6, c0: 0.12, beat: 0.9, idle: 0.3 },
    beh: { ...POD, n: [1, 3], speed: [1, 2.2], zone: 'mid', dist: [6, 25], routes: { cross: 1, oncoming: 1, escort: 1 } }, size: [1.4, 1.8],
  }),
  seaLion: null,
  leopardSeal: null,
  weddellSeal: null,
  seaNettle: jelly({
    jelly: { h: 0.38, th: 1.5, nT: 24, tl: 2.6, tw: 0.004, nO: 4, ol: 1.8, ow: 0.06, twist: 1.5, lappets: 16 },
    col: C(0xd89a4a, 0xd89a4a, 0x8a3a1a, 0xe0b080, 0, 0xffb060), pat: [17, 16, 0.35], sheen: 0.3, glow: 0.3, size: [0.3, 0.5],
  }),
  moonJelly: jelly({
    jelly: { h: 0.2, th: 1.3, nT: 32, tl: 0.12, tw: 0.003, nO: 4, ol: 0.22, ow: 0.035, scallop: 0.06, lappets: 8 },
    col: C(0xdde8ff, 0xdde8ff, 0xc890e0, 0xe8eeff, 0, 0x8ab0ff), pat: [19, 1, 0], sheen: 0.16, size: [0.25, 0.4],
    beh: { ...DRIFT, n: [10, 30] },
  }),
  // ======== SEAGRASS / TIDEPOOL ========
  seahorse: {
    plan: 'seahorse', det: 1,
    col: C(0xd8a040, 0xe8c070, 0x8a5a20, 0xe8c070, 0xffffff, 0x302010), pat: [1, 26, 0.3], pat2: [3, 50, 0.15], cs: [-2, 0],
    finEdge: 0, finRays: 0.6, iris: 0.6, glowMode: 0, glow: 0, sheen: 0.15, rough: 0.45,
    mot: { mode: 9, amp: 0, waves: 0, c0: 0, beat: 0, idle: 0.5 },
    beh: { kind: 'hover', n: [1, 4], speed: [0.0, 0.05], zone: 'floor', alt: [0.15, 0.6], spread: 2, upright: true }, size: [0.12, 0.2],
  },
  manatee: merge(CETACEAN, {
    body: { ...ST([0, 0.03, 0.07, 0.12, 0.18, 0.28, 0.4, 0.52, 0.64, 0.74, 0.8, 0.84],
      [0, 0.04, 0.06, 0.07, 0.085, 0.11, 0.125, 0.12, 0.1, 0.07, 0.045, 0],
      [0, 0.05, 0.065, 0.075, 0.09, 0.115, 0.13, 0.125, 0.1, 0.065, 0.04, 0],
      [0, 0.045, 0.06, 0.07, 0.09, 0.12, 0.135, 0.13, 0.11, 0.075, 0.045, 0],
      [-0.02, -0.015, -0.01, -0.005, 0, 0, 0, 0, 0, 0, 0, 0]), n: 2.0 },
    fins: { flip: { t: 0.2, span: 0.04, a: -0.6, h: 0.11, dip: 0.8, sweep: 0.6, shape: 'paddle', thick: 0.12, part: 7 }, caudal: { shape: 'paddle', horiz: true, size: 0.17, thick: 0.1, root: 0.9 } },
    eye: { t: 0.06, v: 0.2, r: 0.006 },
    col: C(0x6a6658, 0x7a7668, 0x5a6a48, 0x6a6658), pat: [6, 5, 0.55], cs: [-0.6, 0.1], sheen: 0.05, rough: 0.6,
    mot: { amp: 0.035, waves: 0.5, beat: 0.6, idle: 0.15 },
    beh: { ...SOLO, n: [1, 2], speed: [0.3, 0.6], zone: 'floor', alt: [0.6, 1.5], dist: [6, 20] }, size: [2.8, 3.5], hl: true,
  }),
  dugong: null,
  silverside: fish({
    det: 0,
    body: { depth: 0.16, width: 0.6, tm: 0.36, nose: 0.85 },
    fins: { caudal: { shape: 'forked', size: 0.2 } },
    col: C(0x9ab0a8, 0xe8f0ec, 0xf8fcfc, 0xa8b8b0), pat: [12, 0.05, 0.1], sheen: 0.9, eye: { r: 0.05 },
    beh: { ...SCHOOL, n: [80, 200], speed: [0.4, 0.9], zone: 'floor', alt: [0.5, 2.5] }, size: [0.05, 0.09],
  }),
  filefish: fish({
    body: { depth: 0.48, width: 0.22, tm: 0.4, nose: 1.1, snout: 0.1 },
    fins: { dorsal: [{ t0: 0.2, t1: 0.24, h: 0.08, shape: 'tri' }, { t0: 0.5, t1: 0.74, h: 0.06, shape: 'long' }], anal: [{ t0: 0.5, t1: 0.74, h: 0.06, shape: 'long' }], caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0x6a7a3a, 0x9aa060, 0x3a4a1a, 0x7a8a4a), pat: [6, 8, 0.5], pat2: [7, 14, 0.4],
    beh: { ...HOVER, n: [1, 3] }, size: [0.12, 0.2],
  }),
  pipefish: merge(EEL, {
    det: 0, body: { depth: 0.035, width: 0.8, tm: 0.25, nose: 1.5, segL: 1.2 }, fins: { anal: null, dorsal: [{ t0: 0.45, t1: 0.6, h: 0.02 }], caudal: { shape: 'rounded', size: 0.03 } },
    col: C(0x7a8a3a, 0xc8c890, 0x3a4a1a, 0x7a8a3a), pat: [1, 30, 0.3],
    mot: { amp: 0.04, waves: 0.9, c0: 0.3 }, beh: { ...HOVER, n: [2, 6], alt: [0.2, 0.8] }, size: [0.2, 0.3],
  }),
  sculpin: fish({
    body: { depth: 0.24, width: 0.6, tm: 0.2, nose: 0.4, tail: 1.0, ped: 0.15, nb: 3 },
    fins: { dorsal: [{ t0: 0.22, t1: 0.42, h: 0.07, shape: 'spiny', spikes: 6 }, { t0: 0.45, t1: 0.75, h: 0.06 }], pect: { t: 0.22, h: 0.18, shape: 'paddle', dip: 0.2, sweep: 0.6 }, caudal: { shape: 'rounded', size: 0.16 } },
    col: C(0x7a3a2a, 0xc89a7a, 0x3a1a12, 0x8a4a3a), pat: [6, 6, 0.5], pat2: [3, 24, 0.2], cs: [-0.2, 0.15],
    mot: { amp: 0.04 }, beh: { ...HOVER, n: [1, 3], alt: [0.05, 0.3] }, size: [0.12, 0.25],
  }),
  blenny: merge(EEL, {
    det: 0, body: { depth: 0.12, width: 0.7, tm: 0.12, nose: 0.4, segL: 1 }, fins: { pect: { t: 0.12, h: 0.08, dip: 0.6, sweep: 0.6, shape: 'round' } },
    col: C(0x6a5a40, 0xc8b898, 0x2a2014, 0x8a7a60), pat: [15, 10, 0.4], eye: { r: 0.016, v: 0.6 },
    beh: { ...HOVER, n: [2, 6], alt: [0.03, 0.3] }, size: [0.08, 0.14],
  }),
  // ======== CAVE / WRECK ========
  tarpon: fish({
    det: 2,
    body: { depth: 0.24, width: 0.45, tm: 0.36, nose: 0.75, tail: 1.5, ped: 0.08, snout: 0.25 },
    fins: { dorsal: [{ t0: 0.42, t1: 0.52, h: 0.14, shape: 'idol', sweep: 1.2 }], anal: [{ t0: 0.64, t1: 0.72, h: 0.08, shape: 'falcate' }], caudal: { shape: 'forked', size: 0.24 } },
    col: C(0x4a5a64, 0xe8ecef, 0x2a343a, 0x5a6a74), pat: [4, 24, 0.12], sheen: 1.0, eye: { r: 0.03 },
    mot: { amp: 0.05, beat: 1.0, idle: 0.3 },
    beh: { ...SOLO, n: [1, 4], speed: [0.4, 0.8], zone: 'mid', dist: [1, 4], routes: { oncoming: 1, along: 1, hold: 1 } }, size: [1.3, 2],
  }),
  sweeper: fish({
    det: 0,
    body: { depth: 0.4, width: 0.3, tm: 0.3, nose: 0.55, tail: 1.6, ped: 0.08 },
    fins: { dorsal: [{ t0: 0.3, t1: 0.42, h: 0.1, shape: 'tri' }], anal: [{ t0: 0.42, t1: 0.75, h: 0.06, shape: 'long' }], caudal: { shape: 'emarginate', size: 0.18 } },
    col: C(0xb0784a, 0xe0c0a0, 0, 0xc09060), sheen: 0.6, eye: { r: 0.06 },
    beh: { ...SCHOOL, n: [60, 160], speed: [0.2, 0.4], zone: 'mid', routes: { hold: 1 } }, size: [0.08, 0.12],
  }),
  batfish: fish({
    body: { depth: 0.6, width: 0.2, tm: 0.38, nose: 0.6, ped: 0.12 },
    fins: { dorsal: [{ t0: 0.25, t1: 0.7, h: 0.32, shape: 'falcate', sweep: 0.9 }], anal: [{ t0: 0.4, t1: 0.7, h: 0.3, shape: 'falcate', sweep: 0.9 }], caudal: { shape: 'truncate', size: 0.16 } },
    col: C(0xc8ccd0, 0xe8eaec, 0x2a2a28, 0xb8bcc0, 0, 0xf0d040), pat: [1, 3.4, 0.22], sheen: 0.6,
    beh: { ...SCHOOL, n: [6, 20], speed: [0.2, 0.5], zone: 'mid', routes: { hold: 1, along: 1 } }, size: [0.35, 0.5],
  }),
  // ======== VENTS / ABYSS ========
  anglerfish: fish({
    det: 2,
    body: { depth: 0.6, width: 0.55, tm: 0.3, nose: 0.35, tail: 1.3, ped: 0.12, tEnd: 0.78, snout: -0.25, n: 2.0 },
    fins: { dorsal: [{ t0: 0.6, t1: 0.7, h: 0.08 }], anal: [{ t0: 0.62, t1: 0.7, h: 0.07 }], pelv: null, pect: { t: 0.38, h: 0.09, a: 0 }, caudal: { shape: 'rounded', size: 0.22 } },
    eye: { t: 0.14, v: 0.45, r: 0.016 },
    extra: { lure: { t: 0.1, h: 0.2, fwd: 0.12, r: 0.006, glow: 0.024 }, teeth: { t: 0.07, n: 16, len: 0.07, r: 0.006 } },
    col: C(0x1a1412, 0x2a221e, 0x0e0a08, 0x241c18, 0, 0x7af0ff), pat: [6, 9, 0.5], cs: [-0.5, 0.1], sheen: 0.12, rough: 0.6, glow: 1.0,
    mot: { amp: 0.04, beat: 0.6, idle: 0.4 }, beh: { ...HOVER, n: [1, 1], zone: 'mid', speed: [0.05, 0.15] }, size: [0.45, 0.8],
  }),
  lanternfish: fish({
    det: 0,
    body: { depth: 0.2, width: 0.55, tm: 0.3, nose: 0.55, tail: 1.4 },
    fins: { dorsal: [{ t0: 0.4, t1: 0.52, h: 0.05 }], anal: [{ t0: 0.58, t1: 0.7, h: 0.04 }], caudal: { shape: 'forked', size: 0.2 } },
    col: C(0x1a2a40, 0x6a7a8a, 0x8ae0ff, 0x2a3a50, 0, 0x5ad0ff), pat: [13, 14, 0.014], glowMode: 1, glow: 1.0, sheen: 0.6, eye: { r: 0.06 },
    beh: { ...SCHOOL, n: [120, 260], speed: [0.4, 0.8] }, size: [0.08, 0.14],
  }),
  hatchetfish: fish({
    det: 0,
    body: { depth: 0.55, width: 0.2, tm: 0.28, nose: 0.6, tail: 1.6, ped: 0.08, belly: 0.4 },
    fins: { caudal: { shape: 'forked', size: 0.18 } },
    col: C(0x3a4a5a, 0xd8e0e8, 0x8ae0ff, 0x8a9aa8, 0, 0x6ad8ff), pat: [13, 10, 0.02], glowMode: 1, glow: 1.2, sheen: 1.0, eye: { r: 0.07, v: 0.45 },
    beh: { ...SCHOOL, n: [30, 90], speed: [0.2, 0.5] }, size: [0.06, 0.1],
  }),
  viperfish: fish({
    det: 1,
    body: { depth: 0.11, width: 0.5, tm: 0.2, nose: 0.6, tail: 1.2, ped: 0.18, tEnd: 0.86 },
    fins: { dorsal: [{ t0: 0.2, t1: 0.24, h: 0.12, shape: 'tri', sweep: 1.5 }], caudal: { shape: 'forked', size: 0.14 } },
    extra: { teeth: { t: 0.05, n: 8, len: 0.08, r: 0.005 }, photo: { rows: [-1.2, -1.45], n: 14, t0: 0.12, t1: 0.82, r: 0.004 } },
    col: C(0x10181f, 0x1a2a34, 0, 0x14202a, 0, 0x4aa0ff), sheen: 0.6, eye: { r: 0.02 }, glow: 0.8,
    beh: { ...HOVER, n: [1, 2], zone: 'mid', speed: [0.1, 0.3] }, size: [0.3, 0.45],
  }),
  dragonfish: merge(EEL, {
    body: { depth: 0.07, tm: 0.12, nose: 0.55 }, fins: { dorsal: [{ t0: 0.8, t1: 0.92, h: 0.04 }], anal: [{ t0: 0.8, t1: 0.92, h: 0.04 }], caudal: { shape: 'forked', size: 0.06 } },
    extra: { barbel: { len: 0.25, glow: 0.01 }, teeth: { t: 0.035, n: 8, len: 0.03, r: 0.003 } },
    col: C(0x050608, 0x0a0c10, 0, 0x08090c, 0, 0xff6a3a), sheen: 0.3, glow: 1.0, eye: { r: 0.01 },
    mot: { amp: 0.05, waves: 1.0 }, beh: { ...HOVER, n: [1, 1], zone: 'mid', speed: [0.1, 0.3] }, size: [0.35, 0.5],
  }),
  rattail: fish({
    body: { depth: 0.16, width: 0.6, tm: 0.16, nose: 0.6, tail: 0.6, ped: 0.0, tEnd: 0.98, snout: 0.2 },
    fins: { dorsal: [{ t0: 0.18, t1: 0.24, h: 0.08, shape: 'tri' }, { t0: 0.3, t1: 0.97, h: 0.015, shape: 'long' }], anal: [{ t0: 0.3, t1: 0.97, h: 0.02, shape: 'long' }], caudal: null },
    col: C(0x5a5048, 0x7a6e64, 0, 0x5a5048), sheen: 0.35, eye: { r: 0.032, v: 0.5 },
    mot: { amp: 0.05, waves: 1.1, c0: 0.25 }, beh: { ...HOVER, n: [1, 3], alt: [0.3, 1.5], speed: [0.1, 0.3] }, size: [0.5, 0.8],
  }),
  eelpout: merge(EEL, {
    body: { depth: 0.1, tm: 0.12, nose: 0.5 }, fins: { pect: { h: 0.05, shape: 'round' } },
    col: C(0xe0c8c0, 0xf0e0d8, 0xc0a098, 0xe0c8c0), pat: [6, 8, 0.6], sheen: 0.2,
    mot: { amp: 0.05 }, beh: { ...HOVER, n: [2, 6], alt: [0.05, 0.5], speed: [0.05, 0.2] }, size: [0.4, 0.6],
  }),
  chimaera: fish({
    det: 2,
    body: { depth: 0.18, width: 0.6, tm: 0.22, nose: 0.5, tail: 0.7, ped: 0.0, tEnd: 0.96, snout: 0.1 },
    fins: { dorsal: [{ t0: 0.22, t1: 0.28, h: 0.13, shape: 'tri', sweep: 0.6 }, { t0: 0.32, t1: 0.7, h: 0.035, shape: 'long' }], anal: [{ t0: 0.55, t1: 0.9, h: 0.02, shape: 'long' }], pelv: null, pect: null,
      flip: { t: 0.2, span: 0.09, a: -0.4, h: 0.26, dip: 0.15, sweep: 0.8, shape: 'wing', thick: 0.04, part: 7 }, caudal: { shape: 'pointed', size: 0.06 } },
    eye: { t: 0.09, v: 0.35, r: 0.03 },
    col: C(0x7a6a5a, 0xb0a090, 0xe0d8c8, 0x5a4a3a, 0, 0x50ff90), pat: [3, 12, 0.15], sheen: 0.7, iris: 1.0,
    mot: { mode: 3, amp: 0.4, beat: 0.6, idle: 0.35 }, beh: { ...SOLO, speed: [0.2, 0.4], alt: [0.5, 2] }, size: [0.7, 1.1],
  }),
  atolla: jelly({
    det: 1, jelly: { h: 0.16, th: 1.35, nT: 20, tl: 0.3, tw: 0.004, nO: 0, lappets: 20, scallop: 0.1 },
    col: C(0x6a0812, 0x6a0812, 0x4a9aff, 0x8a1018, 0x4a9aff, 0x3a8aff), pat: [18, 1, 0.25], pat2: [0, 1, 0], glowMode: 3, glow: 2.0, sheen: 0.5, size: [0.2, 0.4],
    beh: { ...DRIFT, n: [3, 10] },
  }),
  combJelly: jelly({
    det: 1, jelly: { h: 1.2, th: Math.PI, closed: true, nT: 0, nO: 0, scallop: 0 },
    col: C(0xe8f0ff, 0xe8f0ff, 0, 0xe8f0ff, 0, 0xffffff), glowMode: 4, glow: 1.5, sheen: 0.12,
    mot: { amp: 0.0 }, beh: { ...DRIFT, n: [8, 24] }, size: [0.08, 0.16],
  }),
  pelagia: jelly({
    jelly: { h: 0.32, th: 1.45, nT: 8, tl: 2.0, tw: 0.004, nO: 4, ol: 1.0, ow: 0.04, lappets: 16 },
    col: C(0xb070c0, 0xb070c0, 0xe0a0f0, 0xd090e0, 0, 0x7aa0ff), pat: [3, 12, 0.3], glowMode: 2, glow: 1.2, sheen: 0.28, size: [0.1, 0.18],
    beh: { ...DRIFT, n: [10, 30] },
  }),
  helmetJelly: jelly({
    jelly: { h: 0.75, th: 1.25, nT: 12, tl: 0.6, tw: 0.006, nO: 0, lappets: 16 },
    col: C(0x5a1030, 0x5a1030, 0x9a2050, 0x7a1838, 0, 0x5aa0ff), pat: [18, 1, 0.3], glowMode: 2, glow: 1.2, sheen: 0.45, size: [0.2, 0.35],
    beh: { ...DRIFT, n: [4, 12] },
  }),
  siphonophore: {
    plan: 'siphon', det: 1,
    col: C(0xc8d8f0, 0xc8d8f0, 0xffffff, 0xd0e0ff, 0, 0x60c8ff), pat: [0, 1, 0], pat2: [0, 1, 0], cs: [-2, 0],
    finEdge: 0, finRays: 0, iris: 0, glowMode: 2, glow: 0.4, sheen: 0.4, rough: 0.2, translucent: true,
    mot: { mode: 0, amp: 0.012, waves: 2.2, c0: 0.6, beat: 0, idle: 0.15 },
    beh: { ...DRIFT, n: [1, 2], spread: 10 }, size: [6, 14],
  },
  vampireSquid: fish({
    plan: 'squid', det: 1,
    body: ST([0, 0.06, 0.15, 0.3, 0.42, 0.5, 0.55, 0.6],
      [0, 0.05, 0.085, 0.1, 0.095, 0.08, 0.075, 0], [0, 0.05, 0.085, 0.1, 0.095, 0.08, 0.075, 0], [0, 0.05, 0.085, 0.1, 0.095, 0.08, 0.075, 0]),
    squid: { fin: { t0: 0.06, t1: 0.2, h: 0.08, shape: 'round', sweep: 0.2 }, eyeT: 0.48, eyeR: 0.035, armLen: 0.4, armR: 0.02, spread: 1.4, glowTips: true },
    col: C(0x3a0812, 0x4a0c18, 0, 0x2a0610, 0, 0x5ab0ff), cs: [-2, 0], iris: 1.0, glow: 1.0, sheen: 0.2, rough: 0.5,
    mot: { mode: 5, amp: 0.6, beat: 0.4, idle: 0.35 }, beh: { ...HOVER, n: [1, 1], zone: 'mid', speed: [0.05, 0.2] }, size: [0.2, 0.3],
  }),
  giantSquid: fish({
    plan: 'squid', det: 2,
    body: ST([0, 0.03, 0.1, 0.2, 0.3, 0.36, 0.39, 0.42, 0.45, 0.47],
      [0, 0.015, 0.03, 0.04, 0.042, 0.04, 0.032, 0.036, 0.034, 0], [0, 0.015, 0.03, 0.04, 0.042, 0.04, 0.032, 0.036, 0.034, 0], [0, 0.015, 0.03, 0.04, 0.042, 0.04, 0.032, 0.036, 0.034, 0]),
    squid: { fin: { t0: 0.0, t1: 0.1, h: 0.04, shape: 'rhomb', sweep: 0.2 }, eyeT: 0.42, eyeR: 0.02, armLen: 0.22, armR: 0.007, tentacles: true, tentLen: 0.52, spread: 0.2 },
    col: C(0x8a2a22, 0xc06050, 0x5a1410, 0xa03a30, 0, 0xd0d8ff), pat: [3, 30, 0.3], cs: [-0.4, 0.2], iris: 0.4, sheen: 0.35,
    mot: { mode: 5, amp: 0.5, beat: 0.4, idle: 0.25 }, beh: { ...GIANT, speed: [0.5, 1], dist: [15, 35] }, size: [9, 12], hl: true,
  }),
  // ======== POLAR ========
  emperorPenguin: fish({
    det: 1,
    body: { ...ST([0, 0.03, 0.07, 0.1, 0.14, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9, 0.95],
      [0, 0.008, 0.02, 0.04, 0.055, 0.06, 0.08, 0.1, 0.1, 0.085, 0.055, 0.025, 0],
      [0, 0.006, 0.014, 0.03, 0.05, 0.065, 0.09, 0.11, 0.11, 0.09, 0.055, 0.025, 0],
      [0, 0.008, 0.018, 0.035, 0.05, 0.055, 0.075, 0.095, 0.095, 0.08, 0.05, 0.022, 0]), parts: [[0, 0.075, 9]], n: 2.0 },
    fins: { dorsal: null, anal: null, pect: null, pelv: null, flip: { t: 0.28, span: 0.08, a: -0.1, h: 0.24, dip: 0.55, sweep: 0.9, shape: 'flipper', thick: 0.08, part: 7 }, caudal: { shape: 'pointed', size: 0.05 } },
    eye: { t: 0.1, v: 0.45, r: 0.009 },
    col: C(0x101318, 0xf2f2ee, 0xf5c23a, 0x101318, 0, 0xe08a3a), pat: [8, 0.13, 0.025], cs: [0.05, 0.9], sheen: 0.25, rough: 0.35,
    mot: { mode: 3, amp: 0.85, beat: 1.4, idle: 1.2 },
    beh: { kind: 'pod', n: [3, 10], speed: [2, 3.5], zone: 'ceiling', alt: [1, 5], dist: [5, 25], dart: 1, routes: { cross: 1, oncoming: 1, escort: 1 } }, size: [1.0, 1.2],
  }),
  adeliePenguin: null,
  krill: fish({
    det: 0,
    body: { depth: 0.16, width: 0.7, tm: 0.25, nose: 0.7, tail: 0.8, ped: 0.25, tEnd: 0.9, segA: 0.75 },
    fins: { dorsal: null, anal: null, pect: null, caudal: { shape: 'forked', size: 0.12 }, pelv: { t: 0.3, span: 0.2, a: -1.4, h: 0.12, dip: 1.4, sweep: 0.4, shape: 'long' } },
    col: C(0xe88a70, 0xf0c0b0, 0x8ae0ff, 0xf09a80, 0, 0x6ae0ff), pat: [13, 10, 0.03], glowMode: 1, glow: 0.6, sheen: 0.4, eye: { r: 0.05 },
    mot: { amp: 0.03, beat: 2.5, idle: 3 },
    beh: { ...SCHOOL, n: [200, 340], speed: [0.2, 0.4], routes: { hold: 1 } }, size: [0.04, 0.06],
  }),
  icefish: fish({
    body: { depth: 0.12, width: 0.75, tm: 0.38, nose: 1.0, tail: 1.3, snout: 0.05, bumps: [['w', 0.05, 0.05, 0.5], ['t', 0.05, 0.05, -0.3]] },
    fins: { dorsal: [{ t0: 0.3, t1: 0.36, h: 0.07, shape: 'tri' }, { t0: 0.4, t1: 0.75, h: 0.05, shape: 'long' }], pect: { h: 0.16, shape: 'paddle', dip: 0.15 }, caudal: { shape: 'truncate', size: 0.16 } },
    col: C(0xc8ccd0, 0xe8eaec, 0x8a9098, 0xd8dcdf), pat: [1, 7, 0.25], sheen: 0.5, eye: { r: 0.03, v: 0.55 },
    beh: { ...HOVER, n: [1, 3], alt: [0.05, 0.6] }, size: [0.4, 0.6],
  }),
  toothfish: fish({
    det: 2,
    body: { depth: 0.22, width: 0.6, tm: 0.33, nose: 0.65, tail: 1.4 },
    fins: { dorsal: [{ t0: 0.28, t1: 0.42, h: 0.06 }, { t0: 0.46, t1: 0.75, h: 0.06, shape: 'long' }], caudal: { shape: 'truncate', size: 0.17 } },
    col: C(0x4a5058, 0x8a9096, 0x2a3036, 0x4a5058), pat: [6, 5, 0.6], eye: { r: 0.03 },
    beh: { ...SOLO, speed: [0.3, 0.6], zone: 'floor', alt: [1, 5] }, size: [1.2, 1.8],
  }),
  arcticCod: fish({
    det: 0,
    body: { depth: 0.18, width: 0.55, tm: 0.33, nose: 0.75 },
    fins: { dorsal: [{ t0: 0.3, t1: 0.42, h: 0.05 }, { t0: 0.46, t1: 0.6, h: 0.05 }], caudal: { shape: 'emarginate', size: 0.18 } },
    col: C(0x5a6a6a, 0xdee4e6, 0x2a3434, 0x6a7a7a), pat: [25, 50, 0.6], sheen: 0.7,
    beh: { ...SCHOOL, n: [80, 200], speed: [0.4, 0.8] }, size: [0.15, 0.25],
  }),
  lionsMane: jelly({
    det: 1, jelly: { h: 0.32, th: 1.35, nT: 56, tl: 4.5, tw: 0.004, nO: 6, ol: 1.2, ow: 0.08, twist: 2, lappets: 8, scallop: 0.1 },
    col: C(0xb0401a, 0xb0401a, 0x6a1a08, 0xe0a070, 0, 0xffa060), pat: [17, 16, 0.4], glow: 0.2, sheen: 0.4, size: [0.8, 1.6],
    beh: { ...DRIFT, n: [1, 3] },
  }),
};

// ---------- sand dwellers & extra cephalopods ----------
Object.assign(SPECIES, {
  flounder: fish({
    body: { depth: 0.48, width: 0.12, tm: 0.42, nose: 0.5, tail: 1.2, ped: 0.1, tEnd: 0.84, n: 2.4 },
    fins: { dorsal: [{ t0: 0.06, t1: 0.82, h: 0.05, shape: 'long', sweep: 0.2 }], anal: [{ t0: 0.25, t1: 0.82, h: 0.05, shape: 'long', sweep: 0.2 }], pelv: null, pect: { h: 0.06 }, caudal: { shape: 'rounded', size: 0.15 } },
    eye: { t: 0.12, v: 0.25, r: 0.03, axis: [1, 0.4, 0.3] },
    col: C(0xd2c4a2, 0xece6d6, 0x5a8ac0, 0xc0b090, 0x8a7a5a, 0x3a3020), pat: [26, 16, 0.32], pat2: [6, 5, 0.6], cs: [-2, 0], sheen: 0.08, rough: 0.6,
    mot: { amp: 0.06, waves: 1.0, c0: 0.25, beat: 1.2, idle: 0.3 },
    beh: { kind: 'rest', n: [1, 3], spread: 4, lift: [2.8, 4.5], speed: [0.4, 0.8], side: true }, size: [0.28, 0.45],
  }),
  guitarfish: fish({
    det: 2,
    body: { ...ST([0, 0.03, 0.08, 0.16, 0.26, 0.36, 0.46, 0.58, 0.7, 0.8, 0.86],
      [0.006, 0.014, 0.022, 0.032, 0.04, 0.042, 0.038, 0.032, 0.025, 0.018, 0],
      [0.004, 0.008, 0.012, 0.016, 0.02, 0.022, 0.022, 0.02, 0.016, 0.012, 0],
      [0.03, 0.06, 0.09, 0.13, 0.15, 0.12, 0.07, 0.045, 0.03, 0.02, 0]), n: 2.0, nb: 3, thinW: 0.05, thinB: 0.25 },
    fins: { dorsal: [{ t0: 0.5, t1: 0.57, h: 0.06, shape: 'shark', sweep: 0.6 }, { t0: 0.68, t1: 0.74, h: 0.05, shape: 'shark', sweep: 0.6 }], anal: null, pelv: null, pect: null, caudal: { shape: 'hetero', size: 0.15, tilt: 0.1 } },
    eye: { t: 0.12, v: 0.8, r: 0.008, axis: [0.6, 1, 0.2] },
    col: C(0xccb88e, 0xf0ead8, 0xf0e4c8, 0xbca880), pat: [3, 22, 0.18], cs: [0, 1], sheen: 0.12, rough: 0.5,
    mot: { amp: 0.06, waves: 0.8, c0: 0.05, beat: 0.9, idle: 0.25 },
    beh: { kind: 'rest', n: [1, 2], spread: 4, lift: [5, 8], speed: [0.5, 0.9] }, size: [1.0, 1.5],
  }),
  lizardfish: fish({
    body: { depth: 0.14, width: 0.9, tm: 0.3, nose: 0.6, tail: 1.3, ped: 0.22, snout: 0.2 },
    fins: { dorsal: [{ t0: 0.32, t1: 0.42, h: 0.07, shape: 'tri' }], anal: [{ t0: 0.66, t1: 0.74, h: 0.04 }], pelv: { t: 0.34, h: 0.08, dip: 1.0, sweep: 0.5 }, caudal: { shape: 'forked', size: 0.18 } },
    eye: { t: 0.07, v: 0.55, r: 0.03 },
    col: C(0xb4a482, 0xe8e0cc, 0x6a5a40, 0xa89878), pat: [15, 8, 0.4], pat2: [6, 9, 0.55], sheen: 0.2,
    beh: { kind: 'rest', n: [1, 3], spread: 4, lift: [2.6, 3.8], speed: [0.6, 1.2] }, size: [0.22, 0.35],
  }),
  goatfish: fish({
    det: 1,
    body: { depth: 0.22, width: 0.6, tm: 0.33, nose: 0.75, tail: 1.5, snout: -0.2 },
    fins: { dorsal: [{ t0: 0.25, t1: 0.36, h: 0.08, shape: 'tri' }, { t0: 0.5, t1: 0.6, h: 0.06 }], caudal: { shape: 'forked', size: 0.22 } },
    extra: { barbels: { len: 0.12 } },
    col: C(0xd8c890, 0xf4f0e2, 0xf0c020, 0xf0d040), pat: [12, 0.1, 0.08], sheen: 0.45,
    beh: { ...SHOAL, n: [4, 12], alt: [0.05, 0.35], speed: [0.2, 0.5], spread: 4, browse: true }, size: [0.25, 0.4],
  }),
  nurseShark: merge(SHARK, {
    body: { depth: 0.16, width: 1.1, nose: 0.4, tm: 0.3, ped: 0.18, nb: 3.2 },
    fins: { dorsal: [{ t0: 0.52, t1: 0.6, h: 0.07, shape: 'round', sweep: 0.5 }, { t0: 0.66, t1: 0.72, h: 0.06, shape: 'round', sweep: 0.5 }],
      pect: { h: 0.12, shape: 'paddle', dip: 0.6 }, caudal: { shape: 'hetero', size: 0.25, tilt: -0.25 } },
    extra: { barbels: { len: 0.04 } },
    col: { d: 0xa48c68, b: 0xc8b698, a: 0x7a6848 }, cs: [-0.3, 0.2], pat: [24, 0.17, 0], sheen: 0.1, rough: 0.5,
    mot: { amp: 0.07, waves: 0.9, c0: 0.15, beat: 0.6 },
    beh: { kind: 'rest', n: [1, 3], spread: 5, lift: [4.5, 6], speed: [0.3, 0.6] }, size: [2.0, 2.8],
  }),
  rainbowRunner: fish({
    det: 0,
    body: { depth: 0.17, width: 0.6, tm: 0.38, nose: 0.95, tail: 1.5, ped: 0.06, tEnd: 0.82 },
    fins: { dorsal: [{ t0: 0.3, t1: 0.38, h: 0.05, shape: 'tri' }, { t0: 0.45, t1: 0.7, h: 0.05, shape: 'long' }], anal: [{ t0: 0.55, t1: 0.7, h: 0.04, shape: 'long' }], caudal: { shape: 'lunate', size: 0.24 } },
    col: C(0x2a5a8a, 0xe8eef0, 0x6ac0ff, 0xf0d040, 0xf0d040, 0x101010), pat: [2, 7, 0.18], pat2: [23, 0.84, 1], cs: [0.15, 0.3], sheen: 0.8,
    beh: { ...SCHOOL, n: [10, 40], speed: [0.9, 1.4] }, size: [0.6, 0.9],
  }),
  oceanicSquid: fish({
    plan: 'squid', det: 1,
    body: ST([0, 0.04, 0.12, 0.25, 0.4, 0.5, 0.54, 0.58, 0.62, 0.65],
      [0, 0.018, 0.035, 0.045, 0.047, 0.043, 0.035, 0.04, 0.036, 0],
      [0, 0.018, 0.035, 0.045, 0.047, 0.043, 0.035, 0.04, 0.036, 0],
      [0, 0.018, 0.035, 0.046, 0.048, 0.045, 0.037, 0.044, 0.04, 0]),
    squid: { fin: { t0: 0.0, t1: 0.2, h: 0.07, shape: 'rhomb', sweep: 0.3 }, eyeT: 0.58, eyeR: 0.019, armLen: 0.24, armR: 0.007, tentacles: true, tentLen: 0.36, spread: 0.2 },
    col: C(0xa83a2a, 0xe0a090, 0x6a1a12, 0xb85040, 0, 0xd0e0ff), pat: [30, 14, 1.4], cs: [-0.3, 0.2], iris: 0.5, sheen: 0.4,
    mot: { mode: 5, amp: 0.6, beat: 0.5, idle: 0.6 },
    beh: { kind: 'school', n: [12, 30], speed: [1.0, 2.0], zone: 'mid', routes: { lead: 2, cross: 2, oncoming: 1 } }, size: [0.5, 0.9],
  }),
  glowSquid: fish({
    plan: 'squid', det: 1,
    body: ST([0, 0.04, 0.12, 0.25, 0.4, 0.5, 0.54, 0.58, 0.62, 0.65],
      [0, 0.022, 0.04, 0.05, 0.05, 0.045, 0.036, 0.042, 0.038, 0],
      [0, 0.022, 0.04, 0.05, 0.05, 0.045, 0.036, 0.042, 0.038, 0],
      [0, 0.022, 0.04, 0.05, 0.052, 0.047, 0.038, 0.046, 0.042, 0]),
    squid: { fin: { t0: 0.02, t1: 0.3, h: 0.08, shape: 'round', sweep: 0.2 }, eyeT: 0.58, eyeR: 0.024, armLen: 0.26, armR: 0.008, spread: 0.35, glowTips: true },
    col: C(0x5a1828, 0x8a3048, 0x7ad8ff, 0x6a2030, 0, 0x5ac8ff), pat: [13, 16, 0.02], pat2: [30, 10, 1], cs: [-0.4, 0.2], glowMode: 1, glow: 1.4, iris: 1.0, sheen: 0.3,
    mot: { mode: 5, amp: 0.6, beat: 0.5, idle: 0.5 },
    beh: { kind: 'school', n: [5, 14], speed: [0.4, 1.0], zone: 'mid', routes: { lead: 2, hold: 2, cross: 1 } }, size: [0.35, 0.6],
  }),
});
for (const k of ['flounder', 'guitarfish', 'lizardfish', 'goatfish', 'nurseShark', 'oceanicSquid', 'glowSquid', 'rainbowRunner']) { SPECIES[k].key = k; SPECIES[k].name = k; }

// ---------- derived variants ----------
const S = SPECIES;
S.commonDolphin = merge(S.bottlenose, {
  col: C(0x22272e, 0xf2f2f0, 0xd8c08a, 0x22272e, 0x8a9098), pat: [12, -0.05, 0.25], pat2: [23, 0.55, 1.5], size: [1.9, 2.4],
  beh: { ...S.bottlenose.beh, n: [8, 20] },
});
S.pilotWhale = merge(S.orca, {
  body: { bumps: [['t', 0.06, 0.06, 0.25]] },
  fins: { dorsal: [{ t0: 0.28, t1: 0.42, h: 0.08, shape: 'falcate', sweep: 0.9, thick: 0.08 }], flip: { h: 0.17, shape: 'wing' } },
  col: C(0x16181a, 0x2a2c2e, 0, 0x16181a), pat: [0, 1, 0], cs: [-0.6, 0.15], size: [4, 6], beh: { ...POD, n: [5, 14], speed: [1.2, 2] },
});
S.beluga = merge(S.orca, {
  body: { bumps: [['t', 0.07, 0.05, 0.3]] },
  fins: { dorsal: null, flip: { h: 0.11, shape: 'paddle' } },
  col: C(0xe8ecec, 0xf0f2f2, 0, 0xe0e4e4), pat: [0, 1, 0], cs: [-0.5, 0.1], size: [3.5, 4.5],
  beh: { ...POD, n: [3, 10], speed: [1, 1.8] }, hemi: 'N',
});
S.narwhal = merge(S.beluga, {
  extra: { bill: { len: 0.45, r: 0.008, x: -0.006, y: -0.004, part: 8 } },
  col: C(0x5a6068, 0xd8dcdc, 0x2a2e34, 0x5a6068), pat: [3, 20, 0.3], cs: [-0.1, 0.2], size: [4, 5],
});
S.seaLion = merge(S.harbourSeal, {
  body: { bumps: [['a', 0.14, 0.05, -0.08]] },
  fins: { pect: null, flip: { t: 0.24, span: 0.06, a: -0.6, h: 0.2, dip: 0.55, sweep: 0.9, shape: 'flipper', thick: 0.1, part: 7 }, caudal: { shape: 'seal', size: 0.12 } },
  col: C(0x6a4a30, 0x8a6a4a, 0, 0x4a3420), pat: [0, 1, 0], cs: [-0.3, 0.2],
  mot: { mode: 3, amp: 0.65, beat: 0.9, idle: 0.3 }, size: [1.6, 2.2],
});
S.leopardSeal = merge(S.harbourSeal, {
  body: { bumps: [['a', 0.06, 0.04, 0.18]] },
  col: C(0x4e5458, 0xc8cccc, 0x1a1c1e, 0x4e5458), pat: [3, 18, 0.25], cs: [-0.15, 0.6], size: [2.6, 3.2], hemi: 'S',
});
S.weddellSeal = merge(S.harbourSeal, { col: C(0x3a3e44, 0x6a7078, 0xa8b0b8, 0x3a3e44), pat: [3, 14, 0.3], size: [2.4, 3], hemi: 'S' });
S.adeliePenguin = merge(S.emperorPenguin, { col: C(0x0e1014, 0xf4f4f2, 0, 0x0e1014, 0, 0x1a1a1a), pat: [0, 1, 0], size: [0.6, 0.7], beh: { ...S.emperorPenguin.beh, n: [5, 14], speed: [2.2, 3.8] }, hemi: 'S' });
S.emperorPenguin.hemi = 'S';
S.krill.hemi = 'S';
S.icefish.hemi = 'S';
S.toothfish.hemi = 'S';
S.arcticCod.hemi = 'N';
S.greenlandShark.hemi = 'N';
S.dugong = merge(S.manatee, {
  fins: { caudal: { shape: 'fluke', horiz: true, size: 0.15, thick: 0.1 } },
  col: C(0x8a807a, 0xa89a90, 0x6a625c, 0x8a807a), size: [2.4, 3],
});

// ---------- procedural species ----------
const hsv = (h, s, v) => {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
};
const PROC_PAT = [0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 12, 15, 21, 22, 23, 26];
export function proceduralFish(kind, seed) {
  const r = mulberry32(seed * 7919 + 13);
  const deep = r.range(0.2, 0.62);
  const reef = kind === 'reef', temperate = kind === 'kelp' || kind === 'polar', abyss = kind === 'abyss' || kind === 'vents';
  const hue = r(), sat = reef ? r.range(0.55, 1) : temperate ? r.range(0.12, 0.45) : abyss ? r.range(0.1, 0.4) : r.range(0.3, 0.8);
  const val = abyss ? r.range(0.08, 0.25) : r.range(0.45, 0.95);
  const d = hsv(hue, sat, val * r.range(0.7, 1)), b = hsv(hue + r.range(-0.05, 0.05), sat * 0.6, Math.min(1, val + 0.25));
  const contrast = r.chance(0.5);
  const p = contrast ? (r.chance(0.5) ? hsv(hue + 0.5, sat, 0.9) : hsv(0, 0, r.chance(0.5) ? 0.06 : 0.95)) : hsv(hue + r.range(-0.12, 0.12), sat, val * 0.5);
  const f = r.chance(0.5) ? d : hsv(hue + r.range(-0.2, 0.2), sat, val);
  const pt = PROC_PAT[r.int(0, PROC_PAT.length - 1)];
  const scale = { 1: r.range(3, 9), 2: r.range(5, 16), 3: r.range(10, 40), 4: r.range(15, 40), 5: 1, 6: r.range(3, 8), 7: r.range(5, 12), 8: r.range(0.1, 0.16), 12: r.range(-0.2, 0.4), 15: r.range(5, 10), 21: r.range(5, 10), 22: r.range(0.15, 0.3), 23: r.range(0.55, 0.75), 26: r.range(10, 20) }[pt] ?? 1;
  const prm = { 1: r.range(0.15, 0.4), 2: r.range(0.15, 0.4), 3: r.range(0.15, 0.32), 4: r.range(0.15, 0.3), 5: r.range(0.05, 0.08), 6: r.range(0.45, 0.6), 7: r.range(0.3, 1), 8: r.range(0.02, 0.04), 12: r.range(0.05, 0.12), 15: r.range(0.3, 0.45), 21: r.range(0.45, 0.6), 22: 1, 23: 1, 26: r.range(0.3, 0.45) }[pt] ?? 0.5;
  const dorsalLen = r.range(0.3, 0.55), t0 = r.range(0.22, 0.32);
  const sw = r.range(0.2, 0.9), n = Math.round(reef ? r.range(4, 14) : r.range(5, 20));
  const caud = r.pick(['forked', 'forked', 'emarginate', 'truncate', 'rounded', 'lunate', 'lyre']);
  return fish({
    key: `proc:${kind}:${seed}`, name: `${kind} fish #${seed % 1000}`,
    body: { depth: deep, width: r.range(0.22, 0.6), tm: r.range(0.3, 0.42), nose: r.range(0.45, 1.2), tail: r.range(1.1, 1.8), ped: r.range(0.08, 0.16), snout: r.range(-0.1, 0.2), hump: r.chance(0.2) ? r.range(0, 0.25) : 0 },
    fins: {
      dorsal: r.chance(0.35) ? [{ t0, t1: t0 + dorsalLen * 0.45, h: r.range(0.05, 0.12), shape: 'spiny', spikes: r.int(5, 11) }, { t0: t0 + dorsalLen * 0.5, t1: t0 + dorsalLen, h: r.range(0.05, 0.14), shape: r.pick(['round', 'long', 'falcate']), sweep: sw }]
        : [{ t0, t1: t0 + dorsalLen, h: r.range(0.05, 0.16), shape: r.pick(['round', 'long', 'falcate', 'tri']), sweep: sw }],
      anal: [{ t0: 0.52, t1: r.range(0.66, 0.76), h: r.range(0.05, 0.12), shape: r.pick(['round', 'long', 'falcate']), sweep: sw }],
      pect: { h: r.range(0.08, 0.16) },
      caudal: { shape: caud, size: r.range(0.17, 0.26) },
    },
    eye: { r: r.range(0.03, 0.05) },
    col: { d, b, p, f, p2: hsv(0, 0, 0.05), a: r.chance(0.5) ? p : hsv(hue + 0.5, 0.8, 0.9) },
    pat: [pt, scale, prm], pat2: r.chance(0.25) ? [8, r.range(0.1, 0.14), 0.025] : [0, 1, 0],
    cs: [r.range(-0.4, 0.2), r.range(0.05, 0.3)], finEdge: r.chance(0.3) ? r.range(0.4, 1) : 0,
    sheen: reef ? r.range(0.1, 0.35) : r.range(0.2, 0.8),
    det: n > 12 ? 0 : 1,
    beh: { ...SHOAL, n: [Math.max(1, n - 4), n + 4], alt: [0.4, 3] },
    size: [0.1 + 0.15 * r(), 0.2 + 0.25 * r()],
    glowMode: abyss && r.chance(0.6) ? 1 : 0, glow: abyss ? 1 : 0,
  });
}
// photophores for abyssal procedural fish replace pattern 2
export function speciesOf(key) {
  if (key.startsWith('proc:')) {
    const [, kind, seed] = key.split(':');
    const sp = proceduralFish(kind, parseInt(seed, 10));
    if (sp.glowMode === 1) { sp.pat = [13, 12, 0.016]; sp.col = { ...sp.col, a: 0x5ad0ff }; }
    return sp;
  }
  const sp = SPECIES[key];
  if (!sp) return null;
  if (!sp.key) { sp.key = key; sp.name = key; }
  return sp;
}
for (const k in SPECIES) if (SPECIES[k]) { SPECIES[k].key = k; SPECIES[k].name = k; }

// ---------- common names (for the `i` label overlay) ----------
export const NAMES = {
  clownfish: 'Clown anemonefish', bluetang: 'Blue tang', yellowtang: 'Yellow tang', moorish: 'Moorish idol',
  emperorAngel: 'Emperor angelfish', queenAngel: 'Queen angelfish', butterfly: 'Threadfin butterflyfish', copperband: 'Copperband butterflyfish',
  parrotfish: 'Bumphead parrotfish', lionfish: 'Red lionfish', puffer: 'Guineafowl puffer', boxfish: 'Yellow boxfish',
  coralGrouper: 'Coral hind', goliath: 'Atlantic goliath grouper', snapper: 'Bluestripe snapper', sweetlips: 'Oriental sweetlips',
  picasso: 'Picasso triggerfish', anthias: 'Sea goldie', chromis: 'Blue-green chromis', sergeant: 'Sergeant major',
  napoleon: 'Humphead wrasse', barracuda: 'Great barracuda', jack: 'Bigeye trevally', reefShark: 'Grey reef shark',
  whitetip: 'Whitetip reef shark', blacktip: 'Blacktip reef shark', eagleRay: 'Spotted eagle ray', bluespotRay: 'Bluespotted ribbontail ray',
  southernRay: 'Southern stingray', manta: 'Reef manta ray', moray: 'Green moray', spotMoray: 'Spotted moray',
  gardenEel: 'Spotted garden eel', splendidEel: 'Splendid garden eel', greenTurtle: 'Green sea turtle', octopus: 'Common octopus',
  cuttlefish: 'Broadclub cuttlefish', reefSquid: 'Bigfin reef squid', whaleShark: 'Whale shark', sardine: 'Pacific sardine',
  anchovy: 'Northern anchovy', yellowfin: 'Yellowfin tuna', bluefin: 'Atlantic bluefin tuna', mahi: 'Mahi-mahi',
  sailfish: 'Indo-Pacific sailfish', oceanicWhitetip: 'Oceanic whitetip shark', blueShark: 'Blue shark', greatWhite: 'Great white shark',
  hammerhead: 'Scalloped hammerhead', sandTiger: 'Sand tiger shark', greenlandShark: 'Greenland shark', mola: 'Ocean sunfish',
  humpback: 'Humpback whale', blueWhale: 'Blue whale', spermWhale: 'Sperm whale', orca: 'Orca', bottlenose: 'Bottlenose dolphin',
  commonDolphin: 'Short-beaked common dolphin', pilotWhale: 'Long-finned pilot whale', beluga: 'Beluga whale', narwhal: 'Narwhal',
  garibaldi: 'Garibaldi', sheephead: 'California sheephead', kelpBass: 'Kelp bass', blacksmith: 'Blacksmith', senorita: 'Señorita',
  opaleye: 'Opaleye', giantSeaBass: 'Giant sea bass', leopardShark: 'Leopard shark', batRay: 'Bat ray', harbourSeal: 'Harbour seal',
  seaLion: 'California sea lion', leopardSeal: 'Leopard seal', weddellSeal: 'Weddell seal', seaNettle: 'Pacific sea nettle',
  moonJelly: 'Moon jellyfish', seahorse: 'Thorny seahorse', manatee: 'West Indian manatee', dugong: 'Dugong', silverside: 'Atlantic silverside',
  filefish: 'Scrawled filefish', pipefish: 'Banded pipefish', sculpin: 'Tidepool sculpin', blenny: 'Rockpool blenny', tarpon: 'Atlantic tarpon',
  sweeper: 'Glassy sweeper', batfish: 'Longfin batfish', anglerfish: 'Humpback anglerfish', lanternfish: 'Lanternfish',
  hatchetfish: 'Silver hatchetfish', viperfish: "Sloane's viperfish", dragonfish: 'Black dragonfish', rattail: 'Grenadier',
  eelpout: 'Vent eelpout', chimaera: 'Spotted ratfish', atolla: 'Atolla jellyfish', combJelly: 'Comb jelly', pelagia: 'Mauve stinger',
  helmetJelly: 'Helmet jellyfish', siphonophore: 'Siphonophore', vampireSquid: 'Vampire squid', giantSquid: 'Giant squid',
  emperorPenguin: 'Emperor penguin', adeliePenguin: 'Adélie penguin', krill: 'Antarctic krill', icefish: 'Blackfin icefish',
  toothfish: 'Antarctic toothfish', arcticCod: 'Arctic cod', lionsMane: "Lion's mane jellyfish", flounder: 'Peacock flounder',
  guitarfish: 'Shovelnose guitarfish', lizardfish: 'Variegated lizardfish', goatfish: 'Yellowfin goatfish', nurseShark: 'Nurse shark',
  oceanicSquid: 'Humboldt squid', glowSquid: 'Bioluminescent squid', rainbowRunner: 'Rainbow runner',
};
const FAMILIES = {
  reef: ['Wrasse', 'Damselfish', 'Butterflyfish', 'Snapper', 'Cardinalfish', 'Surgeonfish', 'Hawkfish', 'Grunt', 'Rabbitfish', 'Fusilier'],
  ruins: ['Wrasse', 'Damselfish', 'Snapper', 'Cardinalfish', 'Grunt', 'Fusilier', 'Hogfish'],
  kelp: ['Rockfish', 'Surfperch', 'Greenling', 'Halfmoon', 'Wrasse'],
  seagrass: ['Wrasse', 'Pinfish', 'Grunt', 'Parrotfish', 'Pipefish'],
  sandflat: ['Sand perch', 'Wrasse', 'Goby', 'Jawfish', 'Mojarra'],
  wreck: ['Grunt', 'Snapper', 'Cardinalfish', 'Soldierfish', 'Bigeye'],
  cave: ['Cardinalfish', 'Silverside', 'Bigeye'],
  tidepool: ['Goby', 'Blenny', 'Sculpin', 'Clingfish'],
  vents: ['Eelpout', 'Cusk-eel', 'Snailfish'],
  abyss: ['Bristlemouth', 'Hatchetfish', 'Lanternfish', 'Dragonfish'],
  polar: ['Notothen', 'Sculpin', 'Snailfish'],
  pelagic: ['Scad', 'Jack', 'Driftfish'],
};
export function commonName(sp) {
  const k = sp.key || '';
  if (k.startsWith('proc:')) {
    const [, kind, seed] = k.split(':');
    const list = FAMILIES[kind] || FAMILIES.reef;
    return list[(parseInt(seed, 10) >>> 0) % list.length];
  }
  return NAMES[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase());
}
