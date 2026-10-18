// Tide pools: rocks crusted with coralline algae, green / pink anemones, ochre & purple sea stars,
// purple urchins, mussel & barnacle clusters, turban snails, sea lettuce, surfgrass and pink tufts.
import { Batch, T, TAU, floorSampler, presence, sstep, budgetK, bendSpots, vary, Builder } from './core.js';
import { anemone, seastar, urchin, musselBed, barnacles, snail, seaLettuce, tuft, grassPatch, rock, rockSet } from './shapes.js';
import { putFloor, putAt, pickW, tintFrom, spot, bendX, microDetail, clusterer } from './scatter.js';
import { MAT } from './materials.js';
import { noise2, mulberry32 } from '../noise.js';

// a scatter of limpets: low ribbed cones with mottled shells
function limpets(seed) {
  const b = new Builder(), rng = mulberry32(seed * 17), n = 3 + Math.floor(rng() * 10);
  for (let k = 0; k < n; k++) {
    const rr = 0.3 * Math.sqrt(rng()), a = rng() * TAU, R = 0.018 + rng() * 0.025, H = R * (0.4 + rng() * 0.5), ribs = 8 + Math.floor(rng() * 10), v0 = b.vc;
    const c = [0.55 + rng() * 0.3, 0.5 + rng() * 0.25, 0.42 + rng() * 0.2];
    b.lathe(10, 3, (v) => [R * (1 - v) * (1 - 0.15 * v), H * Math.sin(v * Math.PI * 0.5)], (an) => 1 + 0.08 * Math.abs(Math.sin(an * ribs / 2)), (v, an, x, y, z, o) => {
      const m = 0.75 + 0.4 * Math.abs(Math.sin(an * 3 + v * 5)); o[3] = c[0] * m; o[4] = c[1] * m; o[5] = c[2] * m; o[7] = 2;
    });
    b.xform(v0, [1, 0, 0, 0, 1, 0, 0, 0, 1], Math.cos(a) * rr, 0, Math.sin(a) * rr, 1, 1, 0.7 + rng() * 0.4);
  }
  return b.build();
}

export function initTidepool() {
  T.tpRock = rockSet(['boulder', 'angular', 'volcanic', 'sediment', 'undercut'], 3, { detail: 3, growth: 1.0 });
  T.tpAnemGreen = [1, 2, 3, 4, 5].map((k) => anemone(50 + k, { tentacles: 18 + k * 5, tlen: 0.18 + k * 0.03, thick: 0.03 + k * 0.003, body: [0.25, 0.35, 0.2], tent: [0.35, 0.75, 0.4], tipC: [1.3, 1.1, 1.4], disc: 0.16 + k * 0.025, height: 0.08 + k * 0.02, rows: 2 + (k % 2) }));
  T.tpAnemPink = [1, 2, 3, 4].map((k) => anemone(60 + k, { tentacles: 20 + k * 5, tlen: 0.16 + k * 0.03, thick: 0.03, body: [0.45, 0.3, 0.3], tent: [0.85, 0.45, 0.6], tipC: [1.2, 1.3, 1.2], disc: 0.15 + k * 0.03, height: 0.1, rows: 2 + (k % 2) }));
  T.tpStar = [1, 2, 3, 4, 5, 6].map((s) => seastar(60 + s, { arms: s === 6 ? 6 : 5, fat: 1.0 + (s % 3) * 0.35, curl: 0.04 + (s % 3) * 0.04 }));
  T.tpUrchin = [1, 2, 3, 4].map((s) => urchin(70 + s, { len: 0.6 + s * 0.15, spines: 36 + s * 6, body: [0.42, 0.22, 0.5] }));
  T.tpMussel = vary([musselBed(81, { n: 45, r: 0.45 }), musselBed(82, { n: 30, r: 0.3 }), musselBed(83, { n: 18, r: 0.22 })], 3, 81, { disp: 0.08, bend: 0.05, twist: 0.5 });
  T.tpBarnacle = vary([barnacles(91), barnacles(92, { n: 24, r: 0.25 }), barnacles(93, { n: 50, r: 0.45 })], 2, 91, { disp: 0.06, bend: 0, twist: 0.5 });
  T.tpSnail = vary([snail(1), snail(2, { col: [0.15, 0.12, 0.1] }), snail(3, { col: [0.45, 0.3, 0.2] })], 3, 101, { disp: 0.12, bend: 0.1 });
  T.tpLimpet = [1, 2, 3, 4, 5].map(limpets);
  T.tpLettuce = [1, 2, 3, 4, 5, 6].map((k) => seaLettuce(k, { n: 2 + k, s: 0.18 + 0.03 * k }));
  T.tpTuft = [tuft(1), tuft(2, { h: 0.09 })];
  T.tpSurf = [1, 2, 3, 4, 5, 6].map((k) => grassPatch(70 + k, { n: 8 + k * 2, r: 0.2 + 0.04 * k, h: 0.3 + 0.06 * k, w: 0.01 + 0.002 * k, segs: 3, base: [0.1, 0.25, 0.06], mid: [0.25, 0.6, 0.12], tipc: [0.35, 0.7, 0.2], sway: 0.3 }));
}

const S = {};
function specs() {
  if (S.rock) return S;
  Object.assign(S, {
    big: { tpl: T.tpRock, scale: [1.2, 2.6], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.4, sink: 0.12, tint: tintFrom([[0.5, 0.4, 0.4], [0.45, 0.42, 0.4], [0.55, 0.45, 0.42]]) },
    rock: { tpl: T.tpRock, scale: [0.3, 1.0], ys: [0.7, 1.35], xz: 0.5, grow: [0.1, 1.5], follow: 0.6, tint: tintFrom([[0.5, 0.4, 0.4], [0.45, 0.42, 0.4], [0.55, 0.45, 0.42]]) },
    anemG: { tpl: T.tpAnemGreen, scale: [0.5, 1.0], follow: 0.85, sway: true, tint: tintFrom([[1, 1, 1]], 0.15) },
    anemP: { tpl: T.tpAnemPink, scale: [0.5, 1.0], follow: 0.85, sway: true, tint: tintFrom([[1, 1, 1]], 0.15) },
    star: { tpl: T.tpStar, scale: [0.12, 0.22], follow: 1, sink: 0, tint: tintFrom([[0.85, 0.35, 0.05], [0.5, 0.15, 0.55], [0.75, 0.2, 0.35]]) },
    urchin: { tpl: T.tpUrchin, scale: [0.05, 0.09], follow: 0.9, tint: tintFrom([[1, 1, 1]], 0.15) },
    mussel: { tpl: T.tpMussel, scale: [0.7, 1.4], follow: 0.95, tint: tintFrom([[1, 1, 1], [0.7, 0.75, 0.95]]) },
    barnacle: { tpl: T.tpBarnacle, scale: [0.8, 1.4], follow: 1, sink: 0, tint: tintFrom([[1, 1, 1]], 0.1) },
    snail: { tpl: T.tpSnail, scale: [0.03, 0.05], follow: 0.8, tint: tintFrom([[1, 1, 1]], 0.2) },
    limpet: { tpl: T.tpLimpet, scale: [0.8, 1.4], follow: 1, sink: 0, tint: tintFrom([[1, 1, 1]], 0.2) },
    lettuce: { tpl: T.tpLettuce, scale: [0.6, 1.3], follow: 0.7, sway: true, tint: tintFrom([[1, 1, 1], [0.8, 1, 0.7]]) },
    tuft: { tpl: T.tpTuft, scale: [0.8, 1.6], follow: 0.7, tint: tintFrom([[0.85, 0.4, 0.5], [0.75, 0.35, 0.55], [0.9, 0.55, 0.6]]) },
    surf: { tpl: T.tpSurf, scale: [0.8, 1.3], follow: 0.8, sway: true, tint: tintFrom([[1, 1, 1]], 0.15) },
  });
  S.pebbles = { tpl: T.pebbles, scale: [0.8, 1.6], follow: 1, sink: 0.02, tint: tintFrom([[0.6, 0.55, 0.52], [0.5, 0.45, 0.45]], 0.1) };
  S.micro = [{ w: 3, spec: S.pebbles }, { w: 1.5, spec: S.barnacle }, { w: 1.2, spec: S.snail }];
  S.list = [
    { w: 1.2, k: 'rock' }, { w: 2.6, k: 'anemG', sway: true }, { w: 1.5, k: 'anemP', sway: true }, { w: 1.6, k: 'star' }, { w: 1.6, k: 'urchin' },
    { w: 1.6, k: 'mussel' }, { w: 1.4, k: 'barnacle' }, { w: 1.2, k: 'snail' }, { w: 1.3, k: 'limpet' }, { w: 1.6, k: 'lettuce', sway: true }, { w: 1.6, k: 'tuft' }, { w: 1.6, k: 'surf', sway: true },
  ];
  return S;
}

// a rock outcrop with life on its dome and around its foot
function outcrop(ctx, fs, st, sw, rng, x, s, size) {
  const sp = specs();
  const y0 = fs.at(x, s);
  const csc = putFloor(ctx, fs, st, sp.big, x, s, rng, size);
  const tpl = T.tpRock[0];
  const domeR = csc ? tpl.r * csc * 0.8 : 0, domeH = csc ? tpl.maxY * csc * 0.8 : 0;
  const n = Math.round(10 + 14 * size);
  for (let k = 0; k < n; k++) {
    const e = pickW(rng, sp.list), a = rng() * TAU, rr = (domeR + 0.8) * Math.sqrt(rng());
    const ix = x + Math.cos(a) * rr, is = s + Math.sin(a) * rr;
    let y = fs.at(ix, is), nx = fs.nx, ny = fs.ny, nz = fs.nz;
    if (rr < domeR) {
      const q = rr / domeR; y = Math.max(y, y0 + domeH * Math.sqrt(Math.max(0, 1 - q * q)) - 0.05);
      const l = Math.hypot(Math.cos(a) * q, 1, Math.sin(a) * q); nx = Math.cos(a) * q / l; ny = 1 / l; nz = -Math.sin(a) * q / l;
    }
    putAt(ctx, e.sway ? sw : st, sp[e.k], ix, y, is, nx, ny, nz, rng, 1.1);
  }
}

export function layoutTidepool(ctx) {
  if (presence(ctx, 'tidepool') <= 0) return null;
  const sp = specs(), rng = ctx.rng, fs = floorSampler(ctx);
  const st = new Batch(MAT.static, 72000 * budgetK(ctx, 'tidepool')), sw = new Batch(MAT.sway, 44000 * budgetK(ctx, 'tidepool'));
  const spots = [];
  for (let k = 0; k < 22; k++) {
    const p = spot(ctx, rng, 0, 18, 1.0);
    if (rng() > ctx.weightOf(p.s, 'tidepool')) continue;
    spots.push(p);
  }
  spots.sort((a, b) => a.d - b.d);
  for (const p of spots) outcrop(ctx, fs, st, sw, rng, p.x, p.s, 0.6 + rng() * 0.7);
  const nextP98 = clusterer(ctx, rng, 0, 20, 1.1);
  for (let k = 0; k < 160; k++) {
    const p = nextP98();
    if (!p) continue;
    const w = ctx.weightOf(p.s, 'tidepool') * (0.65 + 0.35 * noise2(p.x / 5, p.s / 5, 811));
    if (rng() > w) continue;
    const e = pickW(rng, sp.list);
    putFloor(ctx, fs, e.sway ? sw : st, sp[e.k], p.x, p.s, rng, 1.1);
  }
  for (const b of bendSpots(ctx)) if (rng() < ctx.weightOf(b.s, 'tidepool') * 0.8) outcrop(ctx, fs, st, sw, rng, bendX(ctx, b, 2.4, rng, 1.0), b.s, 1.1);
  microDetail(ctx, fs, st, rng, 'tidepool', sp.micro, 90, 18);
  st.split = 3; sw.split = 1; sw.from = 3;
  return { batches: [st, sw] };
}
