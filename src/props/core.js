// Props infrastructure: geometry Builder -> immutable Template (generated once at startup),
// per-chunk merge Batches (one draw call per material, any number of variants), instancing helper,
// a floor sampler that reproduces the terrain mesh exactly, and flight-tube clearance tests.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3i } from '../noise.js';

export const TUBE = 3.5;        // hard clearance radius around the camera path
export const TAU = Math.PI * 2;
export const CHUNK = 64;

// ---------- 3D value noise for geometry displacement ----------
export function vn3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h000 = hash3i(ix, iy, iz, seed), h100 = hash3i(ix + 1, iy, iz, seed);
  const h010 = hash3i(ix, iy + 1, iz, seed), h110 = hash3i(ix + 1, iy + 1, iz, seed);
  const h001 = hash3i(ix, iy, iz + 1, seed), h101 = hash3i(ix + 1, iy, iz + 1, seed);
  const h011 = hash3i(ix, iy + 1, iz + 1, seed), h111 = hash3i(ix + 1, iy + 1, iz + 1, seed);
  const a = h000 + (h100 - h000) * u, b = h010 + (h110 - h010) * u;
  const c = h001 + (h101 - h001) * u, d = h011 + (h111 - h011) * u;
  const e = a + (b - a) * v, f = c + (d - c) * v;
  return (e + (f - e) * w) * 2 - 1;
}
export function fbm3(x, y, z, oct = 3, seed = 0) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vn3(x * f, y * f, z * f, seed + i * 13); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}
export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------- rotations (row-major 3x3) ----------
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
export function mul3(A, B) {
  const R = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return R;
}
// Rotation taking +Y to unit vector n (Rodrigues).
export function alignY(nx, ny, nz) {
  const ax = nz, az = -nx; // Y x n
  const sn = Math.hypot(ax, az);
  if (sn < 1e-5) return ny > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const kx = ax / sn, kz = az / sn, c = ny, t = 1 - c;
  return [
    t * kx * kx + c, -kz * sn, t * kx * kz,
    kz * sn, c, -kx * sn,
    t * kx * kz, kx * sn, t * kz * kz + c,
  ];
}
// yaw about local up, then tilt local up toward (nx,ny,nz) by `follow` (0..1), plus extra tilt.
export function orient(nx, ny, nz, follow, yaw, tiltX = 0, tiltZ = 0) {
  let ux = nx * follow, uy = 1 - follow + ny * follow, uz = nz * follow;
  const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
  let R = mul3(alignY(ux, uy, uz), rotY(yaw));
  if (tiltX || tiltZ) R = mul3(R, mul3(rotX(tiltX), rotZ(tiltZ)));
  return R;
}
export function applyR(R, x, y, z) {
  return [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];
}

// ---------- unit icosphere cache ----------
const icoCache = new Map();
export function icosphere(detail) {
  let c = icoCache.get(detail);
  if (!c) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-5);
    c = { pos: Float32Array.from(g.attributes.position.array), idx: Uint32Array.from(g.index.array) };
    for (let i = 0; i < c.pos.length; i += 3) { // re-normalise
      const l = Math.hypot(c.pos[i], c.pos[i + 1], c.pos[i + 2]);
      c.pos[i] /= l; c.pos[i + 1] /= l; c.pos[i + 2] /= l;
    }
    g.dispose();
    icoCache.set(detail, c);
  }
  return c;
}

// ---------- Builder ----------
// Vertex format: position, normal, color (rgb), aFx (vec2: x = growth/sway/glow amount, y = mode/style)
export class Builder {
  constructor() { this.P = []; this.N = []; this.C = []; this.F = []; this.I = []; }
  get vc() { return this.P.length / 3; }
  v(x, y, z, nx = 0, ny = 1, nz = 0, r = 1, g = 1, b = 1, f0 = 0, f1 = 0) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g, b); this.F.push(f0, f1);
    return this.P.length / 3 - 1;
  }
  t(a, b, c) { this.I.push(a, b, c); }
  // area-weighted smooth normals for vertices >= v0 from triangles >= i0
  smooth(v0 = 0, i0 = 0) {
    const P = this.P, N = this.N, I = this.I;
    for (let k = v0 * 3; k < N.length; k++) N[k] = 0;
    for (let k = i0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const q of [a, b, c]) if (q >= v0 * 3) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
    }
    for (let k = v0 * 3; k < N.length; k += 3) {
      const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1;
      N[k] /= l; N[k + 1] /= l; N[k + 2] /= l;
    }
  }
  // paint(i, x,y,z, nx,ny,nz, out[r,g,b,f0,f1]) for vertices >= v0
  paint(v0, fn) {
    const o = [1, 1, 1, 0, 0], P = this.P, N = this.N;
    for (let i = v0; i < this.vc; i++) {
      o[0] = this.C[i * 3]; o[1] = this.C[i * 3 + 1]; o[2] = this.C[i * 3 + 2]; o[3] = this.F[i * 2]; o[4] = this.F[i * 2 + 1];
      fn(i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], o);
      this.C[i * 3] = o[0]; this.C[i * 3 + 1] = o[1]; this.C[i * 3 + 2] = o[2]; this.F[i * 2] = o[3]; this.F[i * 2 + 1] = o[4];
    }
  }
  // transform vertices >= v0: p' = R*(s.p) + t
  xform(v0, R, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1) {
    const P = this.P, N = this.N;
    for (let i = v0 * 3; i < P.length; i += 3) {
      const x = P[i] * sx, y = P[i + 1] * sy, z = P[i + 2] * sz;
      P[i] = R[0] * x + R[1] * y + R[2] * z + tx; P[i + 1] = R[3] * x + R[4] * y + R[5] * z + ty; P[i + 2] = R[6] * x + R[7] * y + R[8] * z + tz;
      const nx = N[i] / sx, ny = N[i + 1] / sy, nz = N[i + 2] / sz;
      let ax = R[0] * nx + R[1] * ny + R[2] * nz, ay = R[3] * nx + R[4] * ny + R[5] * nz, az = R[6] * nx + R[7] * ny + R[8] * nz;
      const l = Math.hypot(ax, ay, az) || 1; N[i] = ax / l; N[i + 1] = ay / l; N[i + 2] = az / l;
    }
  }
  // Param grid; fn(u, v, i, j, out[x,y,z,r,g,b,f0,f1]). Outward normal = dP/dv x dP/du.
  grid(nu, nv, fn, { wrapU = false, flip = false, smooth = true } = {}) {
    const v0 = this.vc, i0 = this.I.length, cols = wrapU ? nu : nu + 1;
    const o = [0, 0, 0, 1, 1, 1, 0, 0];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
      o[3] = o[4] = o[5] = 1; o[6] = o[7] = 0;
      fn(i / nu, j / nv, i, j, o);
      this.v(o[0], o[1], o[2], 0, 1, 0, o[3], o[4], o[5], o[6], o[7]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = v0 + j * cols + i, b = v0 + j * cols + ((i + 1) % cols), c = a + cols, d = b + cols;
      if (!flip) { this.t(a, c, b); this.t(b, c, d); } else { this.t(a, b, c); this.t(b, d, c); }
    }
    if (smooth) this.smooth(v0, i0);
    return v0;
  }
  // Displaced icosphere; fn(nx,ny,nz,out[x,y,z,r,g,b,f0,f1]) maps the unit direction to a point.
  blob(detail, fn) {
    const ico = icosphere(detail), v0 = this.vc, i0 = this.I.length;
    const o = [0, 0, 0, 1, 1, 1, 0, 0];
    for (let k = 0; k < ico.pos.length; k += 3) {
      o[3] = o[4] = o[5] = 1; o[6] = o[7] = 0;
      fn(ico.pos[k], ico.pos[k + 1], ico.pos[k + 2], o);
      this.v(o[0], o[1], o[2], 0, 1, 0, o[3], o[4], o[5], o[6], o[7]);
    }
    for (let k = 0; k < ico.idx.length; k++) this.I.push(v0 + ico.idx[k]);
    this.smooth(v0, i0);
    return v0;
  }
  // Generalised cylinder along pts ([x,y,z]...), radii per point. paint(v, ang, x,y,z, out) optional.
  tube(pts, radii, radial, paint, { tip = false, cap = false } = {}) {
    const n = pts.length, T = [], N1 = [], N2 = [];
    for (let j = 0; j < n; j++) {
      const a = pts[Math.max(0, j - 1)], b = pts[Math.min(n - 1, j + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      let nx, ny, nz;
      if (j === 0) { // any perpendicular
        if (Math.abs(ty) < 0.9) { nx = tz; ny = 0; nz = -tx; } else { nx = 0; ny = -tz; nz = ty; }
      } else { [nx, ny, nz] = N1[j - 1]; }
      const d = nx * tx + ny * ty + nz * tz; nx -= d * tx; ny -= d * ty; nz -= d * tz;
      const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
      T.push([tx, ty, tz]); N1.push([nx, ny, nz]);
      N2.push([ny * tz - nz * ty, nz * tx - nx * tz, nx * ty - ny * tx]); // N1 x T
    }
    const iStart = this.I.length;
    const v0 = this.grid(radial, n - 1, (u, v, i, j, o) => {
      const a = u * TAU, c = Math.cos(a), s = Math.sin(a), r = radii[j], p = pts[j], A = N1[j], B = N2[j];
      o[0] = p[0] + r * (c * A[0] + s * B[0]); o[1] = p[1] + r * (c * A[1] + s * B[1]); o[2] = p[2] + r * (c * A[2] + s * B[2]);
      if (paint) paint(v, a, o[0], o[1], o[2], o, j);
    }, { wrapU: true, smooth: false });
    if (tip || cap) {
      const j = n - 1, p = pts[j], t = T[j], r = radii[j];
      const o = [0, 0, 0, this.C[(v0 + j * radial) * 3], this.C[(v0 + j * radial) * 3 + 1], this.C[(v0 + j * radial) * 3 + 2], this.F[(v0 + j * radial) * 2], this.F[(v0 + j * radial) * 2 + 1]];
      const ext = tip ? r * 1.2 : 0;
      const A = this.v(p[0] + t[0] * ext, p[1] + t[1] * ext, p[2] + t[2] * ext, t[0], t[1], t[2], o[3], o[4], o[5], o[6], o[7]);
      const base = v0 + j * radial;
      for (let i = 0; i < radial; i++) this.t(base + ((i + 1) % radial), base + i, A);
    }
    this.smooth(v0, iStart);
    return v0;
  }
  // lathe: profile(v) -> [r, y]; rad(ang, v) multiplier; paint(v, ang, x,y,z,out)
  lathe(nu, nv, profile, rad, paint, opts = {}) {
    return this.grid(nu, nv, (u, v, i, j, o) => {
      const a = u * TAU, [r0, y] = profile(v), r = r0 * (rad ? rad(a, v) : 1);
      o[0] = Math.cos(a) * r; o[1] = y; o[2] = Math.sin(a) * r;
      if (paint) paint(v, a, o[0], o[1], o[2], o);
    }, { wrapU: true, flip: !!opts.flip });
  }
  // flat-shaded box (24 verts) centred at origin, then transformed
  box(w, h, d, R = null, tx = 0, ty = 0, tz = 0, col = [1, 1, 1], fx = [0, 0]) {
    const v0 = this.vc, x = w / 2, y = h / 2, z = d / 2;
    const F = [
      [[1, 0, 0], [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]],
      [[-1, 0, 0], [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]],
      [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]],
      [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
      [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
      [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
    ];
    for (const [n, q] of F) {
      const b = this.vc;
      for (const p of q) this.v(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], fx[0], fx[1]);
      this.t(b, b + 1, b + 2); this.t(b, b + 2, b + 3);
    }
    if (R || tx || ty || tz) this.xform(v0, R || [1, 0, 0, 0, 1, 0, 0, 0, 1], tx, ty, tz);
    return v0;
  }
  // append another builder's content
  append(o) {
    const off = this.vc;
    for (let i = 0; i < o.P.length; i++) { this.P.push(o.P[i]); this.N.push(o.N[i]); this.C.push(o.C[i]); }
    for (let i = 0; i < o.F.length; i++) this.F.push(o.F[i]);
    for (let i = 0; i < o.I.length; i++) this.I.push(o.I[i] + off);
  }
  build() { return new Template(this); }
}

// ---------- Template: immutable geometry variant ----------
export class Template {
  constructor(b) {
    this.pos = Float32Array.from(b.P); this.nor = Float32Array.from(b.N);
    this.col = Float32Array.from(b.C); this.fx = Float32Array.from(b.F);
    this.idx = Uint32Array.from(b.I);
    this.vc = this.pos.length / 3; this.tris = this.idx.length / 3;
    let minY = 1e9, maxY = -1e9, r = 0;
    for (let i = 0; i < this.pos.length; i += 3) {
      const y = this.pos[i + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y;
      r = Math.max(r, Math.hypot(this.pos[i], this.pos[i + 2]));
    }
    this.minY = minY; this.maxY = maxY; this.r = r; this.h = maxY;
    this._geo = null; this._pts = null;
  }
  // shared BufferGeometry for instancing (never disposed)
  geometry() {
    if (!this._geo) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('aFx', new THREE.BufferAttribute(this.fx, 2));
      g.setIndex(new THREE.BufferAttribute(this.vc > 65535 ? this.idx : Uint16Array.from(this.idx), 1));
      g.computeBoundingSphere();
      this._geo = g;
    }
    return this._geo;
  }
  // subsample of vertices for clearance tests of big set pieces
  points(max = 300) {
    if (!this._pts) {
      const step = Math.max(1, Math.floor(this.vc / max)), p = [];
      for (let i = 0; i < this.vc; i += step) p.push(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this._pts = p;
    }
    return this._pts;
  }
}

// ---------- Batch: merges template instances into one mesh per chunk ----------
export class Batch {
  constructor(material, maxTris = 120000) {
    this.mat = material; this.max = maxTris; this.items = []; this.vc = 0; this.ic = 0;
  }
  get tris() { return this.ic / 3; }
  // place template with rotation R (row-major 3x3), scale, tint and fx.x multiplier
  add(tpl, x, y, z, R, sx, sy = sx, sz = sx, cr = 1, cg = 1, cb = 1, fa = 1) {
    if (!tpl || (this.ic + tpl.idx.length) / 3 > this.max) return false;
    this.items.push({ tpl, x, y, z, R, sx, sy, sz, cr, cg, cb, fa });
    this.vc += tpl.vc; this.ic += tpl.idx.length;
    return true;
  }
  // Split items into n slices of similar vertex count; build(k, n) merges slice k only.
  build(k = 0, n = 1, pad = 1) {
    if (!this.items.length) return null;
    let i0 = 0, i1 = this.items.length;
    if (n > 1) {
      const per = this.vc / n;
      let acc = 0, part = 0; i0 = -1; i1 = this.items.length;
      for (let i = 0; i < this.items.length; i++) {
        const p = Math.min(n - 1, Math.floor(acc / per));
        if (p === k && i0 < 0) i0 = i;
        if (p > k) { i1 = i; break; }
        acc += this.items[i].tpl.vc;
      }
      if (i0 < 0 || i0 >= i1) return null;
    }
    let vc = 0, ic = 0;
    for (let i = i0; i < i1; i++) { vc += this.items[i].tpl.vc; ic += this.items[i].tpl.idx.length; }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3);
    const col = new Float32Array(vc * 3), fx = new Float32Array(vc * 2);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (let q = i0; q < i1; q++) {
      const it = this.items[q];
      const t = it.tpl, R = it.R, sx = it.sx, sy = it.sy, sz = it.sz;
      const r0 = R[0], r1 = R[1], r2 = R[2], r3 = R[3], r4 = R[4], r5 = R[5], r6 = R[6], r7 = R[7], r8 = R[8];
      const P = t.pos, N = t.nor, C = t.col, F = t.fx, tx = it.x, ty = it.y, tz = it.z;
      const cr = it.cr, cg = it.cg, cb = it.cb, fa = it.fa;
      const uni = sx === sy && sy === sz;
      const isx = 1 / sx, isy = 1 / sy, isz = 1 / sz;
      const nv = t.vc, ob = vo * 3;
      for (let k3 = 0, e = nv * 3; k3 < e; k3 += 3) {
        const o = ob + k3;
        const px = P[k3] * sx, py = P[k3 + 1] * sy, pz = P[k3 + 2] * sz;
        pos[o] = r0 * px + r1 * py + r2 * pz + tx;
        pos[o + 1] = r3 * px + r4 * py + r5 * pz + ty;
        pos[o + 2] = r6 * px + r7 * py + r8 * pz + tz;
        let nx = N[k3], ny = N[k3 + 1], nz = N[k3 + 2];
        if (uni) {
          nor[o] = r0 * nx + r1 * ny + r2 * nz; nor[o + 1] = r3 * nx + r4 * ny + r5 * nz; nor[o + 2] = r6 * nx + r7 * ny + r8 * nz;
        } else {
          nx *= isx; ny *= isy; nz *= isz;
          const ax = r0 * nx + r1 * ny + r2 * nz, ay = r3 * nx + r4 * ny + r5 * nz, az = r6 * nx + r7 * ny + r8 * nz;
          const l = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
          nor[o] = ax * l; nor[o + 1] = ay * l; nor[o + 2] = az * l;
        }
        col[o] = C[k3] * cr; col[o + 1] = C[k3 + 1] * cg; col[o + 2] = C[k3 + 2] * cb;
      }
      const fo = vo * 2;
      for (let i = 0, e = nv * 2; i < e; i += 2) { fx[fo + i] = F[i] * fa; fx[fo + i + 1] = F[i + 1]; }
      const I = t.idx;
      for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
      vo += nv; io += I.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += pad;
    const m = new THREE.Mesh(g, this.mat);
    m.matrixAutoUpdate = false;
    return m;
  }
}

// ---------- Instanced helper (shared template geometry, per-chunk instance buffers) ----------
export class Inst {
  constructor(tpl, material, max) { this.tpl = tpl; this.mat = material; this.max = max; this.m = []; this.c = []; }
  get count() { return this.m.length / 16; }
  get tris() { return this.count * this.tpl.tris; }
  add(x, y, z, R, sx, sy = sx, sz = sx, r = 1, g = 1, b = 1) {
    if (this.count >= this.max) return false;
    // column-major 4x4 for InstancedMesh
    this.m.push(R[0] * sx, R[3] * sx, R[6] * sx, 0, R[1] * sy, R[4] * sy, R[7] * sy, 0, R[2] * sz, R[5] * sz, R[8] * sz, 0, x, y, z, 1);
    this.c.push(r, g, b);
    return true;
  }
  build() {
    const n = this.count;
    if (!n) return null;
    const im = new THREE.InstancedMesh(this.tpl.geometry(), this.mat, n);
    im.instanceMatrix.array.set(this.m);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.c), 3);
    im.computeBoundingSphere();
    im.boundingSphere.radius += 1;
    im.matrixAutoUpdate = false;
    return im;
  }
}

// ---------- Floor sampler: reproduces the terrain mesh (1.5 m grid, same triangle split) ----------
const DXG = 1.5, NZG = 43, DZG = CHUNK / (NZG - 1);
const samplers = new WeakMap();
export function floorSampler(ctx) {
  let f = samplers.get(ctx.group);
  if (!f) { f = new FloorSampler(ctx); samplers.set(ctx.group, f); }
  return f;
}
class FloorSampler {
  constructor(ctx) {
    this.ctx = ctx; this.s0 = ctx.s0;
    this.k0 = Math.round(ctx.xMin / DXG);
    this.W = Math.round((ctx.xMax - ctx.xMin) / DXG) + 1;
    this.h = new Float32Array(this.W * NZG).fill(NaN);
    this.nx = 0; this.ny = 1; this.nz = 0;
  }
  node(i, j) {
    const o = j * this.W + i;
    let v = this.h[o];
    if (v !== v) { v = this.ctx.floorAt((this.k0 + i) * DXG, this.s0 + j * DZG); this.h[o] = v; }
    return v;
  }
  // floor height at (x, s); sets this.nx/ny/nz (local frame normal, z = -s)
  at(x, s) {
    const u = x / DXG - this.k0, v = (s - this.s0) / DZG;
    const i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= this.W - 1 || j >= NZG - 1) {
      const h = this.ctx.floorAt(x, s), n = this.ctx.floorNormal(x, s);
      this.nx = n.x; this.ny = n.y; this.nz = n.z;
      return h;
    }
    const fu = u - i, fv = v - j;
    const ha = this.node(i, j), hb = this.node(i + 1, j), hc = this.node(i, j + 1), hd = this.node(i + 1, j + 1);
    let h, gx, gs;
    if (fu + fv <= 1) { h = ha + (hb - ha) * fu + (hc - ha) * fv; gx = (hb - ha) / DXG; gs = (hc - ha) / DZG; }
    else { h = hd + (hc - hd) * (1 - fu) + (hb - hd) * (1 - fv); gx = (hd - hc) / DXG; gs = (hd - hb) / DZG; }
    const l = Math.sqrt(gx * gx + 1 + gs * gs);
    this.nx = -gx / l; this.ny = 1 / l; this.nz = gs / l;
    return h;
  }
}

// ---------- flight-tube clearance ----------
// Object occupying x +- r horizontally, s +- r, heights [yLo, yHi]
export function tubeClear(ctx, x, s, yLo, yHi, r = 0, margin = 0.35) {
  const lim = TUBE + margin;
  for (let k = -1; k <= 1; k++) {
    if (r === 0 && k !== 0) continue;
    const ss = s + k * r, px = ctx.pathX(ss), py = ctx.pathY(ss);
    const dx = Math.max(0, Math.abs(x - px) - r);
    const dy = py < yLo ? yLo - py : py > yHi ? py - yHi : 0;
    if (dx * dx + dy * dy < lim * lim) return false;
  }
  return true;
}
// flat array of global [x, y, s] points
export function pointsClear(ctx, pts, margin = 0.5) {
  const lim = TUBE + margin;
  for (let i = 0; i < pts.length; i += 3) {
    const s = pts[i + 2], dx = pts[i] - ctx.pathX(s), dy = pts[i + 1] - ctx.pathY(s);
    if (dx * dx + dy * dy < lim * lim) return false;
  }
  return true;
}
// transform template sample points into global [x, y, s]
export function placedPoints(tpl, x, y, s, R, sx, sy = sx, sz = sx, max = 300) {
  const p = tpl.points(max), out = [];
  for (let i = 0; i < p.length; i += 3) {
    const a = p[i] * sx, b = p[i + 1] * sy, c = p[i + 2] * sz;
    out.push(R[0] * a + R[1] * b + R[2] * c + x, R[3] * a + R[4] * b + R[5] * c + y, s - (R[6] * a + R[7] * b + R[8] * c));
  }
  return out;
}

// Max biome weight over the chunk (0 => skip populator)
export function presence(ctx, key) {
  let w = 0;
  for (let k = 0; k <= 4; k++) w = Math.max(w, ctx.weightOf(ctx.s0 + k * 16, key));
  return w;
}

// Staged populators: stage 0 runs layout(ctx) -> parts (Batches / builder fns) and caches it per chunk;
// stages 1..n each merge one slice of every batch (keeps each call within the frame budget).
export function staged(layout, nBuild = 2) {
  const cache = new WeakMap();
  const pops = [(ctx) => {
    const L = layout(ctx);
    if (!L) return null;
    cache.set(ctx.group, L);
    // meshes built directly during layout (shafts, plumes...) are returned here
    return L.extra && L.extra.length ? finish(L.extra) : null;
  }];
  for (let k = 0; k < nBuild; k++) {
    pops.push((ctx) => {
      const L = cache.get(ctx.group);
      if (!L) return null;
      if (k === nBuild - 1) cache.delete(ctx.group);
      const out = [];
      for (const b of L.batches) {
        if (!b) continue;
        const n = b.split ?? nBuild, q = k - (b.from ?? 0);
        if (q >= 0 && q < n) out.push(b.build(q, n));
      }
      return finish(out);
    });
  }
  return pops;
}

// Assemble populator output from batches / meshes
export function finish(parts) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const meshes = [];
  for (const p of parts) {
    if (!p) continue;
    const m = p.build ? p.build() : p;
    if (m) { g.add(m); meshes.push(m); }
  }
  if (!meshes.length) return null;
  return {
    object: g,
    dispose() {
      for (const m of meshes) {
        if (m.isInstancedMesh) m.dispose(); // frees instance buffers; template geometry is shared
        else m.geometry.dispose();
      }
    },
  };
}

// colour helpers
export function hsl(h, s, l) { const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l); return [c.r, c.g, c.b]; }
export function jitter(rng, c, amt = 0.12) { const k = 1 + (rng() * 2 - 1) * amt; return [c[0] * k * (1 + (rng() - 0.5) * amt), c[1] * k * (1 + (rng() - 0.5) * amt), c[2] * k * (1 + (rng() - 0.5) * amt)]; }

// shared template registry (filled by the init functions at startup)
export const T = {};

// Budget multiplier: average biome weight over the chunk, so cross-fade chunks stay within budget
export function budgetK(ctx, key) {
  let w = 0;
  for (let k = 0; k <= 4; k++) w += ctx.weightOf(ctx.s0 + k * 16, key);
  return Math.max(0.15, Math.min(1, w / 5 + 0.05));
}
