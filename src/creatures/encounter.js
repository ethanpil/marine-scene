// One encounter = one species group = one InstancedMesh (one draw call).
// Positions are simulated relative to an anchor (global z) so float32 instance matrices
// stay precise no matter how far the journey has gone.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { buildSpecies } from './build.js';

const TAU = Math.PI * 2, PH_WRAP = 200 * Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- LRU geometry cache (CPU arrays persist; GPU buffers freed when unused) ----------
export class GeoCache {
  constructor(cap = 40) { this.map = new Map(); this.cap = cap; }
  // Build ahead of time (idle callbacks) so spawning never pays for geometry generation.
  prebuild(sp) {
    if (this.map.has(sp.key)) return false;
    this.acquire(sp).refs--;
    return true;
  }
  acquire(sp) {
    let e = this.map.get(sp.key);
    if (e) { this.map.delete(sp.key); this.map.set(sp.key, e); } else {
      const g = buildSpecies(sp);
      e = {
        key: sp.key, refs: 0, tris: g.tris,
        index: new THREE.BufferAttribute(g.idx, 1), pos: new THREE.BufferAttribute(g.pos, 3),
        nor: new THREE.BufferAttribute(g.nor, 3), g: new THREE.BufferAttribute(g.g, 4),
      };
      this.map.set(sp.key, e);
    }
    e.refs++;
    this._evict();
    return e;
  }
  // Dispose an encounter geometry. Shared attributes are detached first unless this was
  // the last user, in which case their GPU buffers go too (CPU data stays cached).
  release(e, geo) {
    e.refs--;
    if (e.refs > 0) {
      geo.deleteAttribute('position'); geo.deleteAttribute('normal'); geo.deleteAttribute('aG'); geo.setIndex(null);
    }
    geo.dispose();
    this._evict();
  }
  _evict() {
    if (this.map.size <= this.cap) return;
    for (const [k, e] of this.map) { if (this.map.size <= this.cap) break; if (e.refs === 0) this.map.delete(k); }
  }
}

// ---------- colour helpers ----------
function jitter(hex, r, amt) {
  let R = (hex >> 16) & 255, G = (hex >> 8) & 255, B = hex & 255;
  const v = 1 + (r() - 0.5) * 0.24 * amt;
  const h = (r() - 0.5) * 18 * amt;
  R = clamp(Math.round(R * v + h), 0, 255); G = clamp(Math.round(G * v - h * 0.3), 0, 255); B = clamp(Math.round(B * v - h * 0.7), 0, 255);
  return R * 65536 + G * 256 + B;
}
const bytes = (a, b, c) => Math.round(clamp(a, 0, 1) * 255) * 65536 + Math.round(clamp(b, 0, 1) * 255) * 256 + Math.round(clamp(c, 0, 1) * 255);

const STATIC_KINDS = new Set(['colony', 'peek', 'octo']);
const FLOCK_KINDS = new Set(['school', 'bait', 'mill', 'solo', 'pod']);

export class Encounter {
  constructor(sys, sp, plan) {
    const rng = mulberry32(plan.seed);
    this.rng = rng; this.sys = sys; this.sp = sp; this.plan = plan;
    const beh = sp.beh, n = plan.n;
    this.n = n; this.kind = plan.kind || beh.kind; this.age = 0; this.done = false; this.visible = false;
    this.fade = plan.fadeIn ? 0 : 1; this.dying = false;
    this.anchorZ = Math.round(-plan.s0 / 16) * 16;
    this.baseSize = sp.size[0] + (sp.size[1] - sp.size[0]) * rng();
    this.readLat = plan.readLat ?? Math.max(1.5, this.baseSize * 16);
    this.readDist = this.baseSize * (plan.n >= 20 ? 75 : 24) * (sp.plan === 'jelly' ? 0.6 : sp.plan === 'siphon' ? 0.12 : 1);
    this.route = plan.route || 'hold';
    this.maxAge = beh.kind === 'drift' || STATIC_KINDS.has(beh.kind) ? 900 : 600;

    // ---- geometry + instancing ----
    this.entry = sys.cache.acquire(sp);
    const geo = new THREE.BufferGeometry();
    geo.setIndex(this.entry.index);
    geo.setAttribute('position', this.entry.pos);
    geo.setAttribute('normal', this.entry.nor);
    geo.setAttribute('aG', this.entry.g);
    const mk = (k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); geo.setAttribute(k, a); return a; };
    const aCol = mk('aCol'), aCol2 = mk('aCol2'), aPat = mk('aPat'), aPat2 = mk('aPat2'), aMot = mk('aMot');
    this.aAnim = mk('aAnim'); this.aAnim.setUsage(THREE.DynamicDrawUsage);
    this.geo = geo;
    this.tris = this.entry.tris * n;
    const mat = sp.translucent ? sys.mats.jelly : sys.mats.opaque;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.position.set(0, 0, this.anchorZ);
    mesh.renderOrder = sp.translucent ? 3 : 1;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.name = 'creature:' + sp.key;
    this.mesh = mesh;
    sys.world.add(mesh);

    // ---- per-instance appearance ----
    const vr = mulberry32(plan.variant), c = sp.col;
    const base = { d: jitter(c.d, vr, 1), b: jitter(c.b, vr, 0.6), p: jitter(c.p, vr, 0.8), f: jitter(c.f, vr, 1), p2: jitter(c.p2 || 0, vr, 0.6), a: jitter(c.a || 0, vr, 0.5) };
    const indiv = sp.det === 0 || n > 20 ? 0.35 : 0.6;
    const cs = sp.cs || [0, 0.1], pat = sp.pat || [0, 1, 0], pat2 = sp.pat2 || [0, 1, 0], mot = sp.mot;
    const packed2z = bytes(sp.finEdge ?? 0, sp.finRays ?? 0.4, sp.iris ?? 0.5);
    const packed2w = bytes((cs[0] + 1) / 2, cs[1], (sp.glowMode ?? 0) / 255);
    const scaleJ = 1 + (vr() - 0.5) * 0.2;
    const roughGlow = Math.floor((sp.glow ?? 0) * 10) + clamp(sp.rough ?? 0.42, 0.02, 0.98);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      aCol.array[o] = jitter(base.d, rng, indiv); aCol.array[o + 1] = jitter(base.b, rng, indiv * 0.5);
      aCol.array[o + 2] = jitter(base.p, rng, indiv * 0.5); aCol.array[o + 3] = jitter(base.f, rng, indiv);
      aCol2.array[o] = base.p2; aCol2.array[o + 1] = base.a; aCol2.array[o + 2] = packed2z; aCol2.array[o + 3] = packed2w;
      const pj = 1 + (rng() - 0.5) * 0.12;
      aPat.array[o] = pat[0]; aPat.array[o + 1] = pat[1] * (pat[0] === 8 || pat[0] === 12 || pat[0] === 22 || pat[0] === 23 || pat[0] === 24 || pat[0] === 28 ? 1 : scaleJ * pj); aPat.array[o + 2] = pat[2]; aPat.array[o + 3] = pat2[0];
      aPat2.array[o] = pat2[1] * (pat2[0] === 3 || pat2[0] === 1 || pat2[0] === 4 || pat2[0] === 6 ? pj : 1); aPat2.array[o + 1] = pat2[2];
      aPat2.array[o + 2] = sp.sheen ?? 0.3; aPat2.array[o + 3] = roughGlow;
      aMot.array[o] = mot.mode; aMot.array[o + 1] = mot.amp * (1 + (rng() - 0.5) * 0.15); aMot.array[o + 2] = mot.waves; aMot.array[o + 3] = mot.c0;
    }

    // ---- agent state ----
    this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3); this.F = new Float32Array(n * 3);
    this.SL = new Float32Array(n * 4); this.RP = new Float32Array(n * 4);
    this.SZ = new Float32Array(n); this.PH = new Float32Array(n); this.AMP = new Float32Array(n).fill(0.6);
    this.BEND = new Float32Array(n); this.BANK = new Float32Array(n);
    this.FLO = new Float32Array(n).fill(-1e4); this.CEI = new Float32Array(n).fill(1e4);
    this.EXP = kindNeedsExpose(this.kind) ? new Float32Array(n * 2) : null;
    for (let i = 0; i < n; i++) {
      this.SZ[i] = this.baseSize * (1 + (rng() - 0.5) * (n > 1 ? 0.18 : 0));
      this.PH[i] = rng() * TAU;
      for (let k = 0; k < 4; k++) this.RP[i * 4 + k] = rng();
    }
    this.speed = beh.speed ? beh.speed[0] + (beh.speed[1] - beh.speed[0]) * rng() : 0.3;
    this.maxPitch = mot.mode === 1 || mot.mode === 2 ? 0.35 : mot.mode === 3 ? 0.7 : 0.5;
    this.turnRate = clamp(3.2 / Math.sqrt(this.baseSize + 0.2), 0.5, 6);
    this.surfY = beh.zone === 'surface' || beh.zone === 'ceiling' ? -0.35 - this.baseSize * 0.1 : -0.8 - this.baseSize * 0.35;
    this.mFloor = 0.25 + this.baseSize * (sp.plan === 'jelly' ? 2.5 : 0.35);
    this.mCeil = 0.3 + this.baseSize * 0.3;
    this.hardR = 2.6 + this.baseSize * (sp.plan === 'jelly' ? 1.5 : 0.55);
    this.rr = 0;
    this.bounds = { x: 0, y: 0, z: 0, r: 1 };
    this.matrixDirty = true;
    this._init(plan);
  }

  // ======================================================================
  _init(plan) {
    const { sys, n, rng, sp } = this, sh = sys.shape, beh = sp.beh;
    let s0 = plan.s0, x0 = sh.pathX(s0) + plan.l0;
    this.zone = plan.zone || beh.zone || 'mid';
    if (this.zone === 'floor' && sh.pathY(s0) - sh.floorAt(x0, s0) > 30) this.zone = 'mid';
    if ((this.kind === 'shoal' || this.kind === 'hover') && this.zone === 'floor') {
      // reef fish gather around structure: prefer the highest nearby floor point (coral heads, rocks)
      let best = sh.floorAt(x0, s0), bx = x0, bs = s0;
      for (let k = 0; k < 6; k++) {
        const x = x0 + (rng() - 0.5) * Math.min(4, (plan.readLat ?? 4) * 0.8), s = s0 + (rng() - 0.5) * 10, f = sh.floorAt(x, s);
        if (f > best && Math.abs(x - sh.pathX(s)) > 1.5) { best = f; bx = x; bs = s; }
      }
      x0 = bx; s0 = bs;
    }
    const z0 = -s0 - this.anchorZ;
    const P = this.P, V = this.V, F = this.F, SL = this.SL;
    // leader (path-relative)
    this.ls = s0; this.ll = plan.l0; this.lh = plan.h0 ?? 0; this.alt = plan.alt ?? 1;
    this.vs = plan.vs ?? 0; this.vl = plan.vl ?? 0; this.route = plan.route || 'hold';
    this.wA = plan.wobble ?? 0; this.wF = 0.03 + rng() * 0.05; this.wP = rng() * TAU;
    this.escortT = 15 + rng() * 25; this.side = plan.l0 >= 0 ? 1 : -1;
    this.leadA = plan.leadA ?? 15; this.leadT = plan.leadT ?? 20;
    this.maxSwim = Math.max((beh.speed?.[1] ?? 1) * 2.2, 4.2); // lead groups must be able to keep pace with the camera
    const fl0 = sh.floorAt(x0, s0), ce0 = Math.min(sh.ceilingAt(x0, s0), 0);
    this.Cx = x0; this.Cz = z0;
    this.Cy = this._zoneY(x0, s0, fl0, ce0, 0);
    this.Cvx = 0; this.Cvy = 0; this.Cvz = 0; this.psi = Math.atan2(plan.vl ?? 0, -(plan.vs ?? 0)) || 0;
    if (Math.abs((plan.vs ?? 0)) + Math.abs(plan.vl ?? 0) < 0.05) this.psi = rng() * TAU;
    this.cvx = Math.sin(this.psi); this.cvz = Math.cos(this.psi);
    const kind = this.kind;
    const size = this.baseSize;
    if (FLOCK_KINDS.has(kind)) {
      const spacing = size * (kind === 'pod' ? 2.6 : kind === 'solo' ? 1.5 : kind === 'bait' ? 2.0 : 1.9);
      const R = spacing * Math.cbrt(n) * (kind === 'bait' ? 0.75 : 0.95);
      this.R = R;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (kind === 'bait' || kind === 'mill') {
          const r = R * (kind === 'mill' ? 0.45 + 0.55 * Math.sqrt(rng()) : 0.25 + 0.75 * Math.cbrt(rng()));
          SL[o] = r; SL[o + 1] = rng() * TAU;
          const hh = kind === 'mill' ? R * 1.3 : Math.sqrt(Math.max(0, R * R - r * r)) * 0.9;
          SL[o + 2] = (rng() * 2 - 1) * hh;
          SL[o + 3] = this.speed * (0.85 + 0.3 * rng()) / Math.max(r, 0.3);
        } else if (kind === 'pod') {
          const a = rng() * TAU, r = i === 0 ? 0 : spacing * (0.45 + Math.sqrt(rng()) * Math.sqrt(n) * 0.35);
          SL[o] = Math.cos(a) * r; SL[o + 1] = (rng() - 0.5) * size * (this.zone === 'surface' ? 0.8 : 1.6); SL[o + 2] = Math.sin(a) * r - r * 0.3;
        } else if (kind === 'solo') {
          SL[o] = 0; SL[o + 1] = 0; SL[o + 2] = 0;
        } else {
          let x, y, z; do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; } while (x * x + y * y + z * z > 1);
          SL[o] = x * R * 0.85; SL[o + 1] = y * R * 0.42; SL[o + 2] = z * R * 1.4;
        }
        const t = this._slotTarget(i, 0);
        P[i * 3] = t[0] + (rng() - 0.5) * size; P[i * 3 + 1] = t[1]; P[i * 3 + 2] = t[2] + (rng() - 0.5) * size;
        const hx = kind === 'bait' || kind === 'mill' ? -Math.sin(SL[o + 1]) : this.cvx, hz = kind === 'bait' || kind === 'mill' ? Math.cos(SL[o + 1]) : this.cvz;
        F[i * 3] = hx; F[i * 3 + 1] = 0; F[i * 3 + 2] = hz;
        V[i * 3] = hx * this.speed; V[i * 3 + 2] = hz * this.speed;
      }
    } else if (kind === 'shoal' || kind === 'hover') {
      // aggregations are tighter for small fish: radius ~ sqrt(n) body lengths
      const spread = Math.min(beh.spread ?? 4, Math.max(1.2, Math.sqrt(n) * size * 3.5));
      this.spread = spread; this.homeX = x0; this.homeZ = z0;
      const alt = beh.alt || [0.5, 2];
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * spread;
        const hx = x0 + Math.cos(a) * r, hz = z0 + Math.sin(a) * r * 1.4;
        this._setHome(i, hx, hz, alt[0] + (alt[1] - alt[0]) * rng(), plan);
        P[i * 3] = SL[i * 4]; P[i * 3 + 1] = SL[i * 4 + 1]; P[i * 3 + 2] = SL[i * 4 + 2];
        const h = rng() * TAU; F[i * 3] = Math.sin(h); F[i * 3 + 2] = Math.cos(h);
        this.RP[i * 4 + 3] = 5 + rng() * 25; // relocation timer
      }
    } else if (kind === 'drift') {
      const spread = beh.spread ?? 20;
      for (let i = 0; i < n; i++) {
        const x = x0 + (rng() - 0.5) * spread, z = z0 + (rng() - 0.5) * spread * 1.6;
        const s = -(z + this.anchorZ), fl = sh.floorAt(x, s), ce = Math.min(sh.ceilingAt(x, s), 0);
        const lo = fl + this.mFloor, hi = Math.min(ce - this.mCeil, this.surfY);
        const yt = sh.pathY(s) + (plan.h0 ?? 0) + (rng() - 0.5) * spread * 0.6;
        const y = hi > lo ? clamp(yt, lo, hi) : (lo + hi) / 2;
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
        if (P[i * 3 + 1] < lo) P[i * 3 + 1] = lo;
        let hx = (rng() - 0.5) * 0.8, hy = 1, hz = (rng() - 0.5) * 0.8; const l = Math.hypot(hx, hy, hz);
        F[i * 3] = hx / l; F[i * 3 + 1] = hy / l; F[i * 3 + 2] = hz / l;
        this.FLO[i] = lo; this.CEI[i] = hi;
      }
      this.curX = (rng() - 0.5) * 0.08; this.curZ = (rng() - 0.5) * 0.08;
    } else if (kind === 'colony') {
      const spread = beh.spread ?? 5;
      const ca = rng() * TAU; this.curDir = [Math.cos(ca), 0, Math.sin(ca)];
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * spread;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        const s = -(z + this.anchorZ);
        SL[i * 4] = x; SL[i * 4 + 1] = sh.floorAt(x, s) - 0.02; SL[i * 4 + 2] = z;
        SL[i * 4 + 3] = 0.35 + 0.35 * rng();
        this.EXP[i * 2] = SL[i * 4 + 3]; this.EXP[i * 2 + 1] = SL[i * 4 + 3];
      }
    } else if (kind === 'peek') {
      for (let i = 0; i < n; i++) {
        // pick the steepest of a few nearby floor points (a rock face)
        let best = null;
        for (let k = 0; k < 6; k++) {
          const x = x0 + (rng() - 0.5) * 6, z = z0 + (rng() - 0.5) * 6, s = -(z + this.anchorZ);
          const nn = sh.floorNormal(x, s), steep = 1 - nn.y;
          if (!best || steep > best.steep) best = { x, z, s, nn, steep };
        }
        const nn = best.nn;
        let zx = nn.x * 0.9, zy = 0.55 + nn.y * 0.3, zz = nn.z * 0.9;
        if (Math.hypot(zx, zz) < 0.15) { const a = rng() * TAU; zx = Math.cos(a) * 0.6; zz = Math.sin(a) * 0.6; }
        const l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
        SL[i * 4] = best.x; SL[i * 4 + 1] = sh.floorAt(best.x, best.s); SL[i * 4 + 2] = best.z; SL[i * 4 + 3] = 0.3 + 0.12 * rng();
        F[i * 3] = zx; F[i * 3 + 1] = zy; F[i * 3 + 2] = zz;
        this.EXP[i * 2] = SL[i * 4 + 3]; this.EXP[i * 2 + 1] = SL[i * 4 + 3];
      }
    } else if (kind === 'octo') {
      for (let i = 0; i < n; i++) {
        const x = x0 + (rng() - 0.5) * 2, z = z0 + (rng() - 0.5) * 2, s = -(z + this.anchorZ);
        const nn = sh.floorNormal(x, s), a = rng() * TAU;
        P[i * 3] = x; P[i * 3 + 1] = sh.floorAt(x, s) + 0.01 * this.SZ[i]; P[i * 3 + 2] = z;
        SL[i * 4] = nn.x; SL[i * 4 + 1] = nn.y; SL[i * 4 + 2] = nn.z;
        F[i * 3] = Math.cos(a); F[i * 3 + 2] = Math.sin(a);
      }
    }
    this.matrixDirty = true;
    this._writeAll(0);
  }

  _setHome(i, x, z, alt, plan) {
    const sh = this.sys.shape, s = -(z + this.anchorZ);
    const fl = sh.floorAt(x, s), ce = Math.min(sh.ceilingAt(x, s), 0);
    let y = this.zone === 'mid' ? sh.pathY(s) + (plan?.h0 ?? 0) + alt * 0.3 : fl + alt;
    const lo = fl + this.mFloor * 0.6, hi = Math.min(ce - this.mCeil, this.surfY);
    y = hi > lo ? clamp(y, lo, hi) : (lo + hi) * 0.5;
    const o = i * 4; this.SL[o] = x; this.SL[o + 1] = y; this.SL[o + 2] = z;
    this.FLO[i] = lo; this.CEI[i] = hi;
  }

  _zoneY(x, s, fl, ce, wh) {
    const zone = this.zone, sh = this.sys.shape;
    let y;
    if (zone === 'floor') y = fl + this.alt + wh;
    else if (zone === 'surface') y = -1.0 - this.baseSize * 0.3 + wh * 0.5;
    else if (zone === 'ceiling') y = ce - this.alt + wh;
    else y = sh.pathY(s) + this.lh + wh;
    const lo = fl + this.mFloor + this.R0(), hi = Math.min(ce - this.mCeil, this.surfY) - this.R0() * 0.5;
    return hi > lo ? clamp(y, lo, hi) : (lo + hi) * 0.5;
  }
  R0() { return this.R ? Math.min(this.R * 0.4, 3) : 0; }

  _slotTarget(i, dt) {
    const o = i * 4, SL = this.SL, out = _t;
    const k = this.kind;
    if (k === 'bait' || k === 'mill') {
      SL[o + 1] += SL[o + 3] * dt;
      if (SL[o + 1] > TAU) SL[o + 1] -= TAU;
      const a = SL[o + 1], r = SL[o];
      const bob = Math.sin(this.age * 0.4 + this.RP[o] * 6) * r * 0.15;
      out[0] = this.Cx + Math.cos(a) * r; out[1] = this.Cy + SL[o + 2] + bob; out[2] = this.Cz + Math.sin(a) * r;
      out[3] = -Math.sin(a) * SL[o + 3] * r; out[4] = 0; out[5] = Math.cos(a) * SL[o + 3] * r;
      return out;
    }
    const c = this.cvz, s = this.cvx; // heading (sin psi = s, cos psi = c)
    const sx = SL[o], sy = SL[o + 1], sz = SL[o + 2];
    const w = this.age * (0.15 + this.RP[o + 1] * 0.2) + this.RP[o + 2] * TAU;
    const wob = k === 'school' ? this.R * 0.12 : k === 'pod' ? this.baseSize * 0.6 : 0;
    const dart = this.sp.beh.dart ? Math.sin(this.age * 0.7 + this.RP[o] * 9) * this.baseSize * 3 : 0;
    const ox = sx + Math.sin(w) * wob + dart, oz = sz + Math.cos(w * 0.8) * wob;
    out[0] = this.Cx + ox * c + oz * s;
    out[1] = this.Cy + sy + Math.sin(w * 1.3) * wob * 0.4;
    out[2] = this.Cz - ox * s + oz * c;
    out[3] = this.Cvx; out[4] = this.Cvy; out[5] = this.Cvz;
    if (this.zone === 'surface' && k === 'pod') { // porpoising arcs near the surface
      const ph = this.age * (0.35 + this.RP[o + 3] * 0.15) + this.RP[o] * TAU;
      out[1] += -Math.abs(Math.sin(ph)) * 2.2 + 1.0;
    }
    return out;
  }

  // ======================================================================
  update(dt, c) {
    if (dt <= 0) { this._visibility(c); return; }
    this.age += dt;
    if (this.plan.fadeIn && !this.dying) this.fade = Math.min(1, this.fade + dt * 0.5);
    if (this.dying) { this.fade -= dt * 0.6; if (this.fade <= 0) { this.done = true; return; } }
    const k = this.kind;
    if (FLOCK_KINDS.has(k)) { this._leader(dt, c); this._steer(dt, c, true); }
    else if (k === 'shoal' || k === 'hover') this._steer(dt, c, false);
    else if (k === 'drift') this._drift(dt, c);
    else this._static(dt, c);
    this._visibility(c);
    // despawn rules
    const b = this.bounds;
    const sMax = -(this.anchorZ + b.z) + b.r;
    // out of view and already passed (behind, or off to the side of the view cone) -> retire early
    this.unseen = this.visible ? 0 : (this.unseen || 0) + dt;
    const ahead = -(this.anchorZ + b.z) - c.s, lat = Math.abs(b.x - c.x);
    const fromBehind = (this.route === 'overtake' || this.route === 'escort' || this.route === 'lead') && this.age < 45;
    if (sMax < c.s - 14) this.done = true;
    else if (this.unseen > 6 && !fromBehind && (ahead < 3 || lat > ahead * 1.2 + 8 + b.r)) this.done = true;
    else if (Math.abs(b.x - c.x) > 320 || Math.abs(-(this.anchorZ + b.z) - c.s) > 520) this.done = true;
    else if (this.age > this.maxAge && !this.visible) this.done = true;
  }

  _leader(dt, c) {
    const sh = this.sys.shape;
    // route logic
    if (this.route === 'escort') {
      const ds = this.ls - c.s;
      if (this.age < 200 && this.escortT > 0) {
        const want = ds < -4 ? c.speed + 1.8 : c.speed + (ds > 6 ? -0.6 : 0.15);
        this.vs += (want - this.vs) * Math.min(1, dt * 0.4);
        if (ds > -6) this.escortT -= dt;
      } else { this.vs += (c.speed * 0.4 - this.vs) * dt * 0.2; this.vl += (this.side * this.speed * 0.8 - this.vl) * dt * 0.15; }
    } else if (this.route === 'lead') {
      // Swim ahead of the camera at a readable distance, then slow so the camera passes alongside / through.
      const ds = this.ls - c.s, A = this.leadA;
      let want;
      if (this.leadT > 0) {
        if (ds > A) want = c.speed - Math.min(3, 0.8 + (ds - A) * 0.05); // let the camera close in
        else want = c.speed + Math.min(2.5, (A - ds) * 0.45);
        want = Math.min(want, this.maxSwim);
        if (Math.abs(ds - A) < 6 || this.age > 90) this.leadT -= dt;
      } else want = Math.min(c.speed * 0.35, this.speed);
      this.vs += (Math.max(0, want) - this.vs) * Math.min(1, dt * 0.6);
    }
    this.ls += this.vs * dt; this.ll += this.vl * dt;
    const latMax = this.plan.latMax ?? 80;
    if (this.route !== 'cross' && this.route !== 'escort' && Math.abs(this.ll) > latMax) this.ll -= Math.sign(this.ll) * (Math.abs(this.ll) - latMax) * dt * 0.3;
    // keep clear of the camera tube
    const k0 = this.kind;
    const R = k0 === 'school' || k0 === 'bait' ? this.hardR : // the camera may pass through schools; fish part around it
      this.hardR + (this.R ? this.R * (k0 === 'pod' ? 0.35 : 0.8) : 0) + this.baseSize * 0.5 + 2;
    const ds = this.ls - c.s;
    const wl = this.wA * Math.sin(this.age * this.wF + this.wP);
    const wh = this.wA * 0.25 * Math.sin(this.age * this.wF * 1.37 + this.wP * 2);
    if (ds > -R && ds < R * 2 + c.speed * 3) {
      const l = this.ll + wl, al = Math.abs(l);
      if (al < R) this.ll += (l >= 0 ? 1 : -1) * (R - al) * Math.min(1, dt * 0.9);
    }
    const s = this.ls, x = sh.pathX(s) + this.ll + wl;
    const fl = sh.floorAt(x, s), ce = Math.min(sh.ceilingAt(x, s), 0);
    this.lFloor = fl; this.lCeil = ce;
    const y = this._zoneY(x, s, fl, ce, wh);
    const ny = this.Cy + (y - this.Cy) * (1 - Math.exp(-dt * 0.9));
    const nz = -s - this.anchorZ;
    const k = 1 - Math.exp(-dt * 3);
    this.Cvx += ((x - this.Cx) / dt - this.Cvx) * k;
    this.Cvy += ((ny - this.Cy) / dt - this.Cvy) * k;
    this.Cvz += ((nz - this.Cz) / dt - this.Cvz) * k;
    this.Cx = x; this.Cy = ny; this.Cz = nz;
    const hs = Math.hypot(this.Cvx, this.Cvz);
    if (hs > 0.05) {
      const tx = this.Cvx / hs, tz = this.Cvz / hs, kk = Math.min(1, dt * 0.6);
      this.cvx += (tx - this.cvx) * kk; this.cvz += (tz - this.cvz) * kk;
      const l = Math.hypot(this.cvx, this.cvz) || 1; this.cvx /= l; this.cvz /= l;
    }
    // open water? then members can skip per-agent floor sampling
    this.openWater = this.Cy - fl > (this.R || 0) + 12 && ce - this.Cy > (this.R || 0) + 12;
  }

  _steer(dt, c, flock) {
    const { n, P, V, F, SL, RP, SZ, FLO, CEI } = this;
    const sh = this.sys.shape, az = this.anchorZ;
    const kind = this.kind;
    const cx = c.x, cy = c.y, cz = c.z - az;
    const px2 = cx + c.vx * 1.2, py2 = cy, pz2 = cz + c.vz * 1.2;
    const sgx = px2 - cx, sgz = pz2 - cz, sgl = sgx * sgx + sgz * sgz;
    const spd0 = this.speed;
    const maxS = flock ? Math.max(spd0 * 2.2, Math.hypot(this.Cvx, this.Cvz) * 1.5 + 0.5) : spd0 * 4 + 0.6;
    const kp = flock ? (kind === 'solo' ? 0.6 : kind === 'pod' ? 0.7 : 1.1) : 0.5;
    const ka = flock ? (this.baseSize > 3 ? 0.8 : 2.5) : 2.2;
    const avR = this.hardR + (flock ? 3 + this.baseSize : 2.5);
    // per-agent floor/ceiling sampling (round-robin)
    const needFloor = !flock || !this.openWater;
    if (needFloor) {
      const K = Math.min(n, Math.max(2, Math.ceil(n / 12)));
      const ceil = sh.hasCeiling(-(this.bounds.z + az));
      for (let j = 0; j < K; j++) {
        const i = this.rr = (this.rr + 1) % n;
        const x = P[i * 3], s = -(P[i * 3 + 2] + az);
        const fl = sh.floorAt(x, s), ce = ceil ? Math.min(sh.ceilingAt(x, s), 0) : 0;
        FLO[i] = fl + this.mFloor * 0.5 + SZ[i] * 0.15; CEI[i] = Math.min(ce - this.mCeil * 0.6, this.surfY);
      }
    } else {
      const lo = this.lFloor + this.mFloor * 0.5, hi = Math.min(this.lCeil - this.mCeil * 0.6, this.surfY);
      if (FLO[0] !== lo) { FLO.fill(lo); CEI.fill(hi); }
    }
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, o = i * 4;
      let tx, ty, tz, tvx = 0, tvy = 0, tvz = 0;
      if (flock) {
        const t = this._slotTarget(i, dt);
        tx = t[0]; ty = t[1]; tz = t[2]; tvx = t[3]; tvy = t[4]; tvz = t[5];
      } else {
        const w = this.age * (0.08 + RP[o] * 0.12) + RP[o + 1] * TAU;
        const rw = kind === 'hover' ? 0.35 : (0.6 + RP[o + 2] * 0.8) * clamp(this.baseSize * 8, 0.5, 2.5);
        tx = SL[o] + Math.sin(w) * rw; ty = SL[o + 1] + Math.sin(w * 1.7) * rw * 0.25; tz = SL[o + 2] + Math.cos(w * 0.77) * rw;
        RP[o + 3] -= dt;
        if (RP[o + 3] < 0 && kind === 'shoal') { // drift to a new spot within the patch
          RP[o + 3] = 6 + this.rng() * 20;
          const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * this.spread;
          const alt = this.sp.beh.alt || [0.5, 2];
          this._setHome(i, this.homeX + Math.cos(a) * r, this.homeZ + Math.sin(a) * r * 1.4, alt[0] + (alt[1] - alt[0]) * this.rng(), this.plan);
        }
      }
      const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
      let dvx = (tx - px) * kp + tvx, dvy = (ty - py) * kp + tvy, dvz = (tz - pz) * kp + tvz;
      let dl = Math.hypot(dvx, dvy, dvz);
      if (dl > maxS) { const f = maxS / dl; dvx *= f; dvy *= f; dvz *= f; }
      // camera avoidance (capsule along the camera's motion)
      let qx = px - cx, qz = pz - cz;
      let tq = sgl > 1e-6 ? clamp((qx * sgx + qz * sgz) / sgl, 0, 1) : 0;
      let ex = px - (cx + sgx * tq), ey = py - py2, ez = pz - (cz + sgz * tq);
      let ed = Math.hypot(ex, ey, ez);
      if (ed < avR && ed > 1e-4) {
        const push = (avR - ed) / avR * (2.5 + spd0 * 2) * (flock ? 1.6 : 2.4);
        dvx += ex / ed * push; dvy += ey / ed * push * 0.7; dvz += ez / ed * push;
      }
      const ka2 = Math.min(1, ka * dt);
      let vx = V[i3] + (dvx - V[i3]) * ka2, vy = V[i3 + 1] + (dvy - V[i3 + 1]) * ka2, vz = V[i3 + 2] + (dvz - V[i3 + 2]) * ka2;
      // floor / ceiling (soft)
      const lo = FLO[i], hi = CEI[i];
      if (hi > lo) {
        if (py < lo) vy += (lo - py) * 3 * dt + 0.5 * dt;
        else if (py > hi) vy -= (py - hi) * 3 * dt + 0.5 * dt;
      } else { // inside a wall: head back toward the path centre
        const s = -(pz + az); vx += (sh.pathX(s) - px) * 0.5 * dt; vy += (sh.pathY(s) - py) * 0.5 * dt;
      }
      let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      if (hi > lo) { if (ny < lo - 0.4) { ny = lo - 0.4; if (vy < 0) vy = 0; } if (ny > hi + 0.3) { ny = hi + 0.3; if (vy > 0) vy = 0; } }
      // hard bubble
      qx = nx - cx; qz = nz - cz;
      tq = sgl > 1e-6 ? clamp((qx * sgx + qz * sgz) / sgl, 0, 1) * 0.3 : 0;
      ex = nx - (cx + sgx * tq); ey = ny - cy; ez = nz - (cz + sgz * tq);
      ed = Math.hypot(ex, ey, ez);
      const hr = this.hardR + SZ[i] * 0.2;
      if (ed < hr) {
        const f = (ed > 1e-4 ? 1 / ed : 0);
        const ux = ed > 1e-4 ? ex * f : 0, uy = ed > 1e-4 ? ey * f : 1, uz = ed > 1e-4 ? ez * f : 0;
        nx = cx + sgx * tq + ux * hr; ny = cy + uy * hr; nz = cz + sgz * tq + uz * hr;
        const vn = vx * ux + vy * uy + vz * uz; if (vn < 0) { vx -= vn * ux; vy -= vn * uy; vz -= vn * uz; }
      }
      V[i3] = vx; V[i3 + 1] = vy; V[i3 + 2] = vz;
      P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz;
      if (kind === 'bait' || kind === 'mill') // a drifting ball: fish face their milling direction, not the drift
        this._orient(i, dt, vx - this.Cvx * 0.85, vy - this.Cvy * 0.85, vz - this.Cvz * 0.85);
      else this._orient(i, dt, vx, vy, vz);
    }
    this._writeAll(dt);
  }

  // heading, bank, body bend and tail-beat phase from velocity
  _orient(i, dt, vx, vy, vz) {
    const F = this.F, i3 = i * 3;
    const spd = Math.hypot(vx, vy, vz);
    const ofx = F[i3], ofz = F[i3 + 2];
    if (spd > 0.04) {
      const k = Math.min(1, this.turnRate * dt * clamp(spd / (this.speed + 0.1), 0.3, 1.5));
      let fx = F[i3] + (vx / spd - F[i3]) * k, fy = F[i3 + 1] + (vy / spd - F[i3 + 1]) * k, fz = F[i3 + 2] + (vz / spd - F[i3 + 2]) * k;
      const mp = this.maxPitch;
      let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
      if (fy > mp || fy < -mp) { fy = fy > 0 ? mp : -mp; const h = Math.hypot(fx, fz) || 1, sc = Math.sqrt(1 - mp * mp) / h; fx *= sc; fz *= sc; }
      F[i3] = fx; F[i3 + 1] = fy; F[i3 + 2] = fz;
    } else if (this.kind !== 'hover') { // level out when idle
      F[i3 + 1] *= 1 - Math.min(1, dt); const h = Math.hypot(F[i3], F[i3 + 2]) || 1, sc = Math.sqrt(1 - F[i3 + 1] * F[i3 + 1]) / h; F[i3] *= sc; F[i3 + 2] *= sc;
    }
    // yaw rate from the change of heading projected on the right vector (Fz, 0, -Fx)
    const h = Math.hypot(F[i3], F[i3 + 2]) || 1;
    const yaw = ((F[i3] - ofx) * (F[i3 + 2] / h) + (F[i3 + 2] - ofz) * (-F[i3] / h)) / Math.max(dt, 1e-3);
    const sz = this.SZ[i];
    // body curvature follows the path: bend = kappa * L / 2 (unit-length body coordinates)
    const bt = clamp((yaw / Math.max(spd, 0.3)) * sz * 0.5, -0.25, 0.25) * (this.sp.mot.mode === 1 ? 0.6 : 1);
    this.BEND[i] += (bt - this.BEND[i]) * Math.min(1, dt * 4);
    const bankT = clamp(yaw * spd * 0.35, -0.6, 0.6) * (this.baseSize > 4 ? 0.5 : 1);
    this.BANK[i] += (bankT - this.BANK[i]) * Math.min(1, dt * 2);
    const m = this.sp.mot;
    const freq = (m.beat || 0) * spd / sz + (m.idle || 0.5) * (0.85 + 0.3 * this.RP[i * 4 + 2]);
    let ph = this.PH[i] + TAU * freq * dt; if (ph > PH_WRAP) ph -= PH_WRAP; this.PH[i] = ph;
    const at = clamp(0.3 + 0.75 * spd / (this.speed + 0.15), 0.3, 1.6);
    this.AMP[i] += (at - this.AMP[i]) * Math.min(1, dt * 1.5);
  }

  _drift(dt, c) {
    const { n, P, F, FLO, CEI } = this;
    const sh = this.sys.shape, az = this.anchorZ;
    const cx = c.x, cy = c.y, cz = c.z - az;
    // occasional limit refresh
    for (let j = 0; j < 2; j++) {
      const i = this.rr = (this.rr + 1) % n;
      const x = P[i * 3], s = -(P[i * 3 + 2] + az);
      FLO[i] = sh.floorAt(x, s) + this.mFloor; CEI[i] = Math.min(Math.min(sh.ceilingAt(x, s), 0) - this.mCeil, this.surfY);
    }
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const ph = this.PH[i];
      const pulse = Math.max(0, Math.sin(ph)); const thrust = this.speed * (0.25 + 2.2 * pulse * pulse);
      let hx = F[i3], hy = F[i3 + 1], hz = F[i3 + 2];
      // wander / avoid limits
      const w = this.age * 0.05 + this.RP[i * 4] * TAU;
      let tx = Math.sin(w) * 0.5, ty = 0.75, tz = Math.cos(w * 1.3) * 0.5;
      const y = P[i3 + 1];
      if (y > CEI[i] - 1) ty = -0.6; else if (y < FLO[i] + 1) ty = 1.2;
      const k = Math.min(1, dt * 0.15);
      hx += (tx - hx) * k; hy += (ty - hy) * k; hz += (tz - hz) * k;
      const l = Math.hypot(hx, hy, hz) || 1; hx /= l; hy /= l; hz /= l;
      F[i3] = hx; F[i3 + 1] = hy; F[i3 + 2] = hz;
      let nx = P[i3] + (hx * thrust + this.curX) * dt, ny = P[i3 + 1] + hy * thrust * dt, nz = P[i3 + 2] + (hz * thrust + this.curZ) * dt;
      if (CEI[i] > FLO[i]) ny = clamp(ny, FLO[i] - 0.5, CEI[i] + 0.3);
      // camera bubble (jellies drift slowly, so push them gently aside)
      const ex = nx - cx, ey = ny - cy, ez = nz - cz, ed = Math.hypot(ex, ey, ez), hr = this.hardR + 1;
      if (ed < hr + 2 && ed > 1e-4) { const pu = (hr + 2 - ed) * dt * 0.8; nx += ex / ed * pu; ny += ey / ed * pu * 0.5; nz += ez / ed * pu; }
      if (ed < hr && ed > 1e-4) { nx = cx + ex / ed * hr; ny = cy + ey / ed * hr; nz = cz + ez / ed * hr; }
      P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz;
      const m = this.sp.mot;
      let p2 = ph + TAU * m.idle * (0.8 + 0.4 * this.RP[i * 4 + 1]) * dt; if (p2 > PH_WRAP) p2 -= PH_WRAP; this.PH[i] = p2;
      this.AMP[i] = 1;
    }
    this._writeAll(dt);
  }

  _static(dt, c) {
    const { n, SL } = this, az = this.anchorZ;
    const cx = c.x, cy = c.y, cz = c.z - az;
    const m = this.sp.mot;
    let moved = false;
    for (let i = 0; i < n; i++) {
      let p2 = this.PH[i] + TAU * (m.idle || 0.4) * (0.8 + 0.4 * this.RP[i * 4 + 1]) * dt; if (p2 > PH_WRAP) p2 -= PH_WRAP; this.PH[i] = p2;
      this.AMP[i] = 1;
      if (this.EXP) { // garden eels / morays retreat when the camera comes close
        const o = i * 4, dx = SL[o] - cx, dy = SL[o + 1] - cy, dz = SL[o + 2] - cz;
        const d = Math.hypot(dx, dy, dz);
        const want = d < (this.kind === 'colony' ? 9 : 5) ? (this.kind === 'colony' ? 0.06 : 0.15) : SL[o + 3];
        const cur = this.EXP[i * 2];
        const nv = cur + clamp(want - cur, -dt * 0.5, dt * 0.08);
        if (nv !== cur) { this.EXP[i * 2] = nv; moved = true; }
      }
    }
    if (moved) this.matrixDirty = true;
    this._writeAll(dt);
  }

  // ======================================================================
  _writeAll(dt) {
    const { n, P, F, SZ, BANK } = this;
    const M = this.mesh.instanceMatrix.array, A = this.aAnim.array;
    const kind = this.kind, upright = this.sp.beh.upright, plan = this.sp.plan;
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    const isStatic = STATIC_KINDS.has(kind);
    const writeM = !isStatic || this.matrixDirty;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, o = i * 16, s = SZ[i];
      if (writeM) {
        let px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
        let Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz;
        if (kind === 'colony') {
          const c = this.curDir, e = this.EXP[i * 2];
          Zx = 0; Zy = 1; Zz = 0; Yx = c[0]; Yy = 0; Yz = c[2];
          Xx = Yy * Zz - Yz * Zy; Xy = Yz * Zx - Yx * Zz; Xz = Yx * Zy - Yy * Zx;
          px = this.SL[i * 4]; py = this.SL[i * 4 + 1] + (e - 0.5) * s; pz = this.SL[i * 4 + 2];
          P[i3] = px; P[i3 + 1] = py; P[i3 + 2] = pz;
        } else if (kind === 'peek') {
          Zx = F[i3]; Zy = F[i3 + 1]; Zz = F[i3 + 2];
          const d = Zy; Yx = -d * Zx; Yy = 1 - d * Zy; Yz = -d * Zz;
          const l = Math.hypot(Yx, Yy, Yz) || 1; Yx /= l; Yy /= l; Yz /= l;
          Xx = Yy * Zz - Yz * Zy; Xy = Yz * Zx - Yx * Zz; Xz = Yx * Zy - Yy * Zx;
          const e = this.EXP[i * 2];
          px = this.SL[i * 4] + Zx * (e - 0.5) * s; py = this.SL[i * 4 + 1] + Zy * (e - 0.5) * s; pz = this.SL[i * 4 + 2] + Zz * (e - 0.5) * s;
          P[i3] = px; P[i3 + 1] = py; P[i3 + 2] = pz;
        } else if (kind === 'octo') {
          Yx = this.SL[i * 4]; Yy = this.SL[i * 4 + 1]; Yz = this.SL[i * 4 + 2];
          let zx = F[i3], zz = F[i3 + 2]; const d = zx * Yx + zz * Yz;
          Zx = zx - d * Yx; Zy = -d * Yy; Zz = zz - d * Yz;
          const l = Math.hypot(Zx, Zy, Zz) || 1; Zx /= l; Zy /= l; Zz /= l;
          Xx = Yy * Zz - Yz * Zy; Xy = Yz * Zx - Yx * Zz; Xz = Yx * Zy - Yy * Zx;
        } else if (plan === 'jelly') {
          Yx = F[i3]; Yy = F[i3 + 1]; Yz = F[i3 + 2];
          // X = Y x (0,0,1)
          Xx = Yy; Xy = -Yx; Xz = 0; let l = Math.hypot(Xx, Xy) || 1; Xx /= l; Xy /= l;
          Zx = Xy * Yz - Xz * Yy; Zy = Xz * Yx - Xx * Yz; Zz = Xx * Yy - Xy * Yx;
        } else if (upright) {
          Yx = 0; Yy = 1; Yz = 0;
          let zx = F[i3], zz = F[i3 + 2]; const l = Math.hypot(zx, zz) || 1; Zx = zx / l; Zy = 0; Zz = zz / l;
          Xx = Zz; Xy = 0; Xz = -Zx;
        } else {
          Zx = F[i3]; Zy = F[i3 + 1]; Zz = F[i3 + 2];
          let rx = Zz, rz = -Zx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
          // up = Z x R
          let ux = Zy * rz, uy = Zz * rx - Zx * rz, uz = -Zy * rx;
          const b = BANK[i], cb = Math.cos(b), sb = Math.sin(b);
          Yx = ux * cb + rx * sb; Yy = uy * cb; Yz = uz * cb + rz * sb;
          Xx = rx * cb - ux * sb; Xy = -uy * sb; Xz = rz * cb - uz * sb;
        }
        M[o] = Xx * s; M[o + 1] = Xy * s; M[o + 2] = Xz * s; M[o + 3] = 0;
        M[o + 4] = Yx * s; M[o + 5] = Yy * s; M[o + 6] = Yz * s; M[o + 7] = 0;
        M[o + 8] = Zx * s; M[o + 9] = Zy * s; M[o + 10] = Zz * s; M[o + 11] = 0;
        M[o + 12] = px; M[o + 13] = py; M[o + 14] = pz; M[o + 15] = 1;
      }
      const a = i * 4;
      A[a] = this.PH[i]; A[a + 1] = this.AMP[i]; A[a + 2] = this.BEND[i]; A[a + 3] = this.fade;
      const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
      if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py; if (pz < mnz) mnz = pz; if (pz > mxz) mxz = pz;
    }
    const ext = this.baseSize * (plan === 'jelly' ? 3 : plan === 'octopus' ? 0.8 : 0.75) + 0.5;
    const b = this.bounds;
    b.x = (mnx + mxx) * 0.5; b.y = (mny + mxy) * 0.5; b.z = (mnz + mxz) * 0.5;
    b.r = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) * 0.5 + ext;
    if (writeM) { this.matrixDirty = false; this._mUp = true; }
    this._aUp = true;
    void dt;
  }

  _visibility(c) {
    const b = this.bounds;
    _sphere.center.set(b.x, b.y, this.anchorZ + b.z - c.Oz);
    _sphere.radius = b.r;
    const vis = c.frustum.intersectsSphere(_sphere);
    this.visible = vis;
    this.mesh.visible = vis;
    if (vis) {
      if (this._mUp) { this.mesh.instanceMatrix.needsUpdate = true; this._mUp = false; }
      if (this._aUp) { this.aAnim.needsUpdate = true; this._aUp = false; }
    }
    const dx = b.x - c.x, dy = b.y - c.y, dz = this.anchorZ + b.z - c.z;
    this.dist = Math.max(0, Math.hypot(dx, dy, dz) - b.r);
  }

  dispose() {
    this.sys.world.remove(this.mesh);
    this.sys.cache.release(this.entry, this.geo);
    this.mesh.dispose();
  }
}
const _t = new Float64Array(6);
const _sphere = new THREE.Sphere();
function kindNeedsExpose(k) { return k === 'colony' || k === 'peek'; }
