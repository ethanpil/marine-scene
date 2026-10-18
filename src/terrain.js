// Terrain chunks (floor + optional ceiling) streamed along the path, built incrementally
// across frames so generation never causes a hitch. Also maintains the sky-visibility map.
import * as THREE from 'three';
import { BIOMES } from './biomes.js';
import { applyWater, U } from './water.js';
import { mulberry32, noise2, fbm2, smoothstep, clamp } from './noise.js';
import { obstacles } from './obstacles.js';

export const CHUNK = 64;          // metres of travel per chunk
const DX = 1.5;                   // lateral grid spacing (globally aligned)
const HALF_W = 165;               // half width of a chunk around the path
const NZ = 43;                    // rows per chunk (spacing 64/42)
const AHEAD = 330, BEHIND = 40;

function floorMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return applyWater(m, {
    key: 'floor',
    vertexHead: 'attribute vec2 aDetail; varying vec2 vDetail;',
    fragmentHead: 'varying vec2 vDetail;',
    patch(sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDetail = aDetail;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec4 n1 = texture2D(uNoiseTex, vWPos.xz / 8.0);
            vec4 n2 = texture2D(uNoiseTex, vWPos.xz / 32.0);
            vec4 n3 = texture2D(uNoiseTex, vWPos.xz / 2.0);
            diffuseColor.rgb *= 0.72 + 0.42 * (n1.r * 0.45 + n2.g * 0.35 + n3.b * 0.2);
            diffuseColor.rgb *= mix(1.0, 0.8 + 0.4 * n3.a, vDetail.y);
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec2 q = vWPos.xz;
            vec4 nn = texture2D(uNoiseTex, q / 32.0);
            float ph = q.x * 0.90198 + q.y * 0.34974 + nn.r * 7.0;
            float c = cos(ph);
            vec3 g = vec3(c * 0.902, 0.0, c * 0.35) * 0.16 * vDetail.x;
            float e = 0.08;
            float h0 = texture2D(uNoiseTex, q / 3.0).a;
            float hx = texture2D(uNoiseTex, (q + vec2(e, 0.0)) / 3.0).a;
            float hz = texture2D(uNoiseTex, (q + vec2(0.0, e)) / 3.0).a;
            g += vec3(hx - h0, 0.0, hz - h0) / e * (0.25 + 0.9 * vDetail.y);
            normal = normalize(normal - mat3(viewMatrix) * g);
          }`);
    },
  });
}

function ceilingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.FrontSide });
  return applyWater(m, {
    key: 'ceiling',
    vertexHead: 'attribute float aIce; varying float vIce;',
    fragmentHead: 'varying float vIce;',
    patch(sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvIce = aIce;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWPos.y > uSurfaceY + 0.05) discard;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          { vec4 n = texture2D(uNoiseTex, vWPos.xz / 8.0); diffuseColor.rgb *= 0.75 + 0.4 * n.g; }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec4 n = texture2D(uNoiseTex, vWPos.xz / 16.0);
            float thin = smoothstep(-9.0, -0.8, vWPos.y);
            totalEmissiveRadiance += vIce * vec3(0.3, 0.62, 0.78) * (0.55 + 0.8 * n.r + 1.2 * thin * thin) * uSunColor * uSunScatter;
          }`);
    },
  });
}

export class Terrain {
  constructor(world, shape, seq) {
    this.world = world; this.shape = shape; this.seq = seq;
    this.chunks = new Map();     // index -> chunk
    this.queue = [];             // pending build generators
    this.populators = [];        // (ctx) => {object, dispose} | null
    this.floorMat = floorMaterial();
    this.ceilMat = ceilingMaterial();
    this.sky = new SkyMap(shape, seq);
  }

  // Row data depends only on s; cache per build.
  _row(s) {
    const ws = this.seq.weights(s);
    return { s, ws, px: this.shape.pathX(s), py: this.shape.pathY(s), hasCeil: ws.some((e) => BIOMES[e.key].ceil) };
  }

  *_buildChunk(idx) {
    const s0 = idx * CHUNK;
    const rows = [];
    for (let j = -1; j <= NZ; j++) rows.push(this._row(s0 + (j * CHUNK) / (NZ - 1)));
    const pxMid = rows[(NZ / 2) | 0].px;
    const x0 = Math.floor((pxMid - HALF_W) / DX) * DX;
    const NX = Math.round((2 * HALF_W) / DX) + 1;
    const W = NX + 2, H = NZ + 2;
    const hf = new Float32Array(W * H);
    const hc = new Float32Array(W * H);
    let anyCeil = false, minCeil = 1e9;
    const shape = this.shape;
    for (let j = 0; j < H; j++) {
      const r = rows[j];
      for (let i = 0; i < W; i++) {
        const x = x0 + (i - 1) * DX;
        const ad = Math.abs(x - r.px);
        let h = 0;
        for (const e of r.ws) { const b = BIOMES[e.key]; h += (r.py - b.clearance + b.floor(x, r.s, ad)) * e.w; }
        hf[j * W + i] = Math.min(h, r.py - 2.2 + Math.max(0, ad - 4) * 2.5);
        if (r.hasCeil) {
          let c = 0;
          for (const e of r.ws) { const b = BIOMES[e.key]; c += (b.ceil ? r.py + b.ceil(x, r.s, ad) : 60) * e.w; }
          c = Math.max(c, r.py + 2.4 - Math.max(0, ad - 4) * 2.5);
          hc[j * W + i] = c; anyCeil = true; if (c < minCeil) minCeil = c;
        }
      }
      if ((j & 7) === 7) yield;
    }
    const chunk = { idx, s0, group: new THREE.Group(), floor: null, ceil: null, props: [], obstacles: [], labels: [] };
    chunk.group.position.set(0, 0, -s0);
    chunk.floor = new THREE.Mesh(this._gridGeometry(hf, rows, x0, NX, false), this.floorMat);
    chunk.floor.receiveShadow = !!this.shadows;
    chunk.group.add(chunk.floor);
    yield;
    if (anyCeil && minCeil < U.uSurfaceY.value + 0.5) {
      chunk.ceil = new THREE.Mesh(this._gridGeometry(hc, rows, x0, NX, true), this.ceilMat);
      chunk.group.add(chunk.ceil);
      yield;
    }
    this.world.add(chunk.group);
    this.chunks.set(idx, chunk);
    // props
    const ctx = this._ctx(chunk, x0, x0 + (NX - 1) * DX);
    for (const pop of this.populators) {
      yield;
      if (this.chunks.get(idx) !== chunk) return; // chunk was unloaded mid-build
      try {
        const r = pop(ctx);
        if (r && r.object) {
          if (this.shadows) r.object.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
          chunk.group.add(r.object); chunk.props.push(r);
        }
      } catch (e) { console.error('populator failed', e); }
    }
  }

  _ctx(chunk, xMin, xMax) {
    const sh = this.shape, seq = this.seq;
    return {
      s0: chunk.s0, s1: chunk.s0 + CHUNK, xMin, xMax,
      rng: mulberry32((chunk.idx * 2654435761) ^ seq.seed),
      group: chunk.group, // local frame: x global, y global, z = -(s - s0)
      floorAt: (x, s) => sh.floorAt(x, s),
      floorNormal: (x, s) => sh.floorNormal(x, s),
      ceilingAt: (x, s) => sh.ceilingAt(x, s),
      pathX: (s) => sh.pathX(s), pathY: (s) => sh.pathY(s),
      weights: (s) => seq.weights(s),
      weightOf: (s, k) => seq.weightOf(s, k),
      segments: seq.segmentsBetween(chunk.s0, chunk.s0 + CHUNK),
      surfaceY: U.uSurfaceY.value,
      // Register a solid capsule (GLOBAL x/y and travel distance s) that creatures must avoid.
      // Pass a = b for a sphere. Removed automatically when the chunk unloads.
      addObstacle: (ax, ay, as, bx, by, bs, r) => { chunk.obstacles.push(obstacles.add({ ax, ay, as, bx, by, bs, r })); },
      // Name shown by the "i" overlay, anchored at GLOBAL (x, y, s).
      addLabel: (name, x, y, s) => { chunk.labels.push({ name, x, y, z: -s }); },
    };
  }

  _gridGeometry(hgt, rows, x0, NX, isCeil) {
    const W = NX + 2;
    const n = NX * NZ;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const det = isCeil ? new Float32Array(n) : new Float32Array(n * 2);
    const dz = CHUNK / (NZ - 1);
    const s0 = rows[1].s;
    let k = 0;
    for (let j = 0; j < NZ; j++) {
      const r = rows[j + 1];
      for (let i = 0; i < NX; i++, k++) {
        const g = (j + 1) * W + (i + 1);
        const h = hgt[g];
        const x = x0 + i * DX;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = -(r.s - s0);
        // normal from central differences (z = -s)
        const hx = hgt[g + 1] - hgt[g - 1];
        const hs = hgt[g + W] - hgt[g - W];
        let nx = -hx / (2 * DX), ny = 1, nz = hs / (2 * dz);
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        if (isCeil) { nx = -nx; ny = -ny; nz = -nz; }
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        // occlusion from local concavity
        const mean = (hgt[g + 1] + hgt[g - 1] + hgt[g + W] + hgt[g - W]) * 0.25;
        const conc = isCeil ? h - mean : mean - h;
        const ao = clamp(1 - conc * 0.35, 0.45, 1.1);
        // colour blend across biomes
        const slope = 1 - Math.abs(ny);
        const nn = noise2(x / 7, r.s / 7, 5);
        const rocky = smoothstep(0.2, 0.5, slope + nn * 0.12);
        let cr = 0, cg = 0, cb = 0, ice = 0, rip = 0;
        for (const e of r.ws) {
          const b = BIOMES[e.key];
          if (isCeil) {
            if (e.key === 'polar') { cr += 0.72 * e.w; cg += 0.86 * e.w; cb += 0.95 * e.w; ice += e.w; }
            else { cr += b.rock[0] * 0.8 * e.w; cg += b.rock[1] * 0.8 * e.w; cb += b.rock[2] * 0.8 * e.w; }
            continue;
          }
          let sr = b.sand[0], sg = b.sand[1], sb = b.sand[2];
          let rr = b.rock[0], rg = b.rock[1], rb = b.rock[2];
          if (e.key === 'tidepool') { const p = smoothstep(0.1, 0.5, nn); rr += 0.25 * p; rg += 0.05 * p; rb += 0.12 * p; }
          if (e.key === 'vents') { const p = smoothstep(0.35, 0.7, fbm2(x / 11, r.s / 11, 2, 9)); rr += 0.35 * p; rg += 0.18 * p; rb += 0.02 * p; sr += 0.2 * p; sg += 0.1 * p; }
          if (e.key === 'kelp' || e.key === 'reef') { const p = smoothstep(0.2, 0.6, nn); rr -= 0.06 * p; rg += 0.04 * p; }
          cr += (sr + (rr - sr) * rocky) * e.w;
          cg += (sg + (rg - sg) * rocky) * e.w;
          cb += (sb + (rb - sb) * rocky) * e.w;
          rip += (e.key === 'pelagic' || e.key === 'abyss' || e.key === 'vents' || e.key === 'tidepool' ? 0.2 : e.key === 'sandflat' ? 1.6 : 1) * e.w;
        }
        const v = 0.9 + 0.2 * nn;
        col[k * 3] = cr * ao * v; col[k * 3 + 1] = cg * ao * v; col[k * 3 + 2] = cb * ao * v;
        if (isCeil) det[k] = ice;
        else { det[k * 2] = rip * (1 - rocky) * smoothstep(0.08, 0.0, slope - 0.05); det[k * 2 + 1] = rocky; }
      }
    }
    const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    let t = 0;
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
      // rows advance toward -z; winding chosen so floor faces +y
      if (!isCeil) { idx[t++] = a; idx[t++] = b; idx[t++] = c; idx[t++] = b; idx[t++] = d; idx[t++] = c; }
      else { idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (isCeil) geo.setAttribute('aIce', new THREE.BufferAttribute(det, 1));
    else geo.setAttribute('aDetail', new THREE.BufferAttribute(det, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  _disposeChunk(c) {
    this.world.remove(c.group);
    c.floor.geometry.dispose();
    if (c.ceil) c.ceil.geometry.dispose();
    for (const p of c.props) { try { p.dispose && p.dispose(); } catch (e) { console.error(e); } }
    for (const o of c.obstacles) obstacles.remove(o);
    c.obstacles.length = 0; c.labels.length = 0;
  }

  // Label provider for the "i" overlay.
  labels(out) { for (const c of this.chunks.values()) for (const l of c.labels) out.push(l); }

  // Build everything needed immediately (startup).
  prime(camS) {
    this.update(camS, Infinity);
  }

  update(camS, budgetMs = 4, visDist = AHEAD) {
    // props in chunks entirely beyond the fog's visibility are hidden (terrain stays: it's cheap)
    for (const c of this.chunks.values()) {
      const vis = c.s0 - camS < visDist;
      for (const p of c.props) p.object.visible = vis;
    }
    const first = Math.floor((camS - BEHIND) / CHUNK), last = Math.floor((camS + AHEAD) / CHUNK);
    for (const [i, c] of this.chunks) if (i < first || i > last + 2) { this._disposeChunk(c); this.chunks.delete(i); }
    this.queue = this.queue.filter((q) => q.idx >= first && q.idx <= last + 2);
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i) && !this.queue.some((q) => q.idx === i)) this.queue.push({ idx: i, gen: this._buildChunk(i) });
    }
    this.queue.sort((a, b) => a.idx - b.idx);
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue[0];
      if (q.gen.next().done) this.queue.shift();
    }
    this.sky.update(camS, budgetMs === Infinity ? Infinity : 2);
  }
}

// ---------- Sky visibility map: 128x128 texels @ 2m, recentred as we travel ----------
class SkyMap {
  constructor(shape, seq) {
    this.shape = shape; this.seq = seq;
    this.N = 128; this.cell = 2;
    this.data = new Uint8Array(this.N * this.N * 4).fill(255);
    this.tex = new THREE.DataTexture(this.data, this.N, this.N, THREE.RGBAFormat);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    U.uSkyMap.value = this.tex;
    U.uSkySize.value = this.N * this.cell;
    this.origin = null; // global {x, s} of texel row 0 (s increases with rows)
    this.job = null;
  }
  *_compute(ox, os) {
    const N = this.N, cell = this.cell, buf = new Float32Array(N * N);
    const surf = U.uSurfaceY.value;
    for (let j = 0; j < N; j++) {
      const s = os + j * cell;
      const ws = this.seq.weights(s);
      const hasCeil = ws.some((e) => BIOMES[e.key].ceil);
      const polar = ws.reduce((a, e) => a + (e.key === 'polar' ? e.w : 0), 0);
      for (let i = 0; i < N; i++) {
        if (!hasCeil) { buf[j * N + i] = 1; continue; }
        const c = this.shape.ceilingAt(ox + i * cell, s);
        const open = smoothstep(-1.2, 0.6, c - surf);
        buf[j * N + i] = Math.max(open, 0.38 * polar + 0.03);
      }
      if ((j & 15) === 15) yield;
    }
    // 3x3 blur for soft light pools
    const out = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let a = 0, n = 0;
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const ii = i + x, jj = j + y;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N) { a += buf[jj * N + ii]; n++; }
      }
      // texel (i, j): u -> x, v -> render z. Row j is at s = os + j*cell, i.e. z = -s,
      // so store rows flipped so that v increases with z.
      const o = ((N - 1 - j) * N + i) * 4;
      out[o] = out[o + 1] = out[o + 2] = (a / n) * 255; out[o + 3] = 255;
    }
    this.data.set(out);
    this.tex.needsUpdate = true;
    this.origin = { x: ox, s: os };
  }
  update(camS, budgetMs) {
    const active = this.seq.segmentsBetween(camS - 60, camS + 260).some((g) => BIOMES[g.key].ceil);
    U.uSkyActive.value = active && this.origin ? 1 : 0;
    if (!active) { this.origin = null; return; }
    const N = this.N, cell = this.cell;
    const wantS = Math.floor((camS - 40) / 32) * 32;
    if (!this.job && (!this.origin || Math.abs(this.origin.s - wantS) >= 32)) {
      const ox = Math.round((this.shape.pathX(camS + 80) - (N * cell) / 2) / cell) * cell;
      this.job = this._compute(ox, wantS);
    }
    if (this.job) {
      const t0 = performance.now();
      while (performance.now() - t0 < budgetMs) { if (this.job.next().done) { this.job = null; break; } }
    }
  }
  // Called each frame with the floating origin offset (render = global - O)
  syncUniforms(Oz) {
    if (!this.origin) return;
    const N = this.N, cell = this.cell;
    // texel v=0 corresponds to the farthest row: s = os + (N-1)*cell -> z = -s
    const zFar = -(this.origin.s + (N - 1) * cell);
    U.uSkyOrigin.value.set(this.origin.x - cell * 0.5, zFar - Oz - cell * 0.5);
  }
}
