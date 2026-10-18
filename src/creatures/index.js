// Creatures system: procedural species, instanced encounters, behaviours and the encounter director.
// Contract: new Creatures(world, env); update(dt, time, cam).
// Debug URL params: cr=<speciesKey> forces every spawn to that species; crstats=1 logs a summary every 5 s.
import * as THREE from 'three';
import { makeMaterials } from './shader.js';
import { GeoCache, Encounter } from './encounter.js';
import { Director } from './director.js';
import { commonName } from './species.js';

const _v = new THREE.Vector3();
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export class Creatures {
  constructor(world, env) {
    this.world = world; this.env = env;
    this.shape = env.shape; this.seq = env.seq; this.U = env.U; this.seed = env.seed | 0;
    this.mats = makeMaterials();
    this.cache = new GeoCache(64);
    this.enc = [];
    this.maxEnc = 34; this.maxInstances = 2500; this.maxTris = 420000;
    this.instances = 0; this.trisTotal = 0;
    this.forceSpecies = qs.get('cr');
    this.logStats = qs.get('crstats') === '1';
    this.director = new Director(this);
    this.frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
    this.lastS = null; this.camSpeed = 3; this.fogD = 130;
    this.ctx = { s: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 3, Oz: 0, frustum: this.frustum, jumped: false };
    this.stats = { enc: 0, visible: 0, instances: 0, tris: 0, ms: 0 };
    this._logT = 0;
    this._idleQueued = false;
    this._idleCb = (deadline) => {
      this._idleQueued = false;
      for (let k = 0; k < 3 && (deadline.timeRemaining() > 8 || (k === 0 && deadline.didTimeout)); k++) {
        const sp = this.director.nextPrewarm(this.ctx);
        if (!sp) break;
        this.cache.prebuild(sp);
      }
    };
  }

  // Label overlay (`i` key): one entry per visible group, anchored on a visible instance near its centre
  // (two for large schools). GLOBAL coordinates (z = -s).
  labels(out) {
    const camera = this.env.camera, cp = camera.position, maxD = this.fogD * 0.7, v = _v, Oz = this.ctx.Oz;
    for (const e of this.enc) {
      if (!e.visible || e.dist > maxD || e.fade < 0.5) continue;
      const name = e._label || (e._label = commonName(e.sp));
      const b = e.bounds, step = Math.max(1, Math.floor(e.n / 40));
      let best = -1, bd = 1e9, far = -1, fd = -1;
      for (let i = 0; i < e.n; i += step) {
        v.set(e.P[i * 3], e.P[i * 3 + 1], e.anchorZ + e.P[i * 3 + 2] - Oz);
        if (!this.frustum.containsPoint(v) || v.distanceTo(cp) > maxD) continue;
        const dc = Math.hypot(e.P[i * 3] - b.x, e.P[i * 3 + 1] - b.y, e.P[i * 3 + 2] - b.z);
        if (dc < bd) { bd = dc; best = i; }
        if (dc > fd) { fd = dc; far = i; }
      }
      if (best < 0) continue;
      const lift = e.SZ[best] * (e.sp.plan === 'jelly' || e.sp.plan === 'octopus' ? 0.8 : 0.45);
      out.push({ name, x: e.P[best * 3], y: e.P[best * 3 + 1] + lift, z: e.anchorZ + e.P[best * 3 + 2] });
      if (e.n >= 40 && far >= 0 && fd > 6) out.push({ name, x: e.P[far * 3], y: e.P[far * 3 + 1] + lift, z: e.anchorZ + e.P[far * 3 + 2] });
    }
    return out;
  }

  spawn(sp, plan) {
    if (this.enc.length >= this.maxEnc) return null;
    const e = new Encounter(this, sp, plan);
    this.enc.push(e);
    this.instances += e.n; this.trisTotal += e.tris;
    return e;
  }

  // Dev metric (enable with window.__crMetric = {}): fraction of frames with something worth watching
  // in frame: an instance inside the frustum within 0.6 x fog distance that projects to >= 25 px at
  // 1280x720, or a school (>= 12 in view) whose extent projects to >= 60 px.
  _measure(cam, M) {
    const camera = cam.camera, cp = camera.position;
    const K = 360 / Math.tan((camera.fov * Math.PI) / 360);
    const maxD = this.fogD * 0.6, fr = this.frustum, v = _v;
    let hit = false;
    for (const e of this.enc) {
      if (!e.visible) continue;
      // readable size: thin / translucent bodies count for less than their length
      const pl = e.sp.plan, eb = e.sp.body || {};
      const vis = pl === 'siphon' ? 0.12 : pl === 'jelly' ? 0.6 : (eb.depth ?? 0.2) < 0.08 ? 0.5 : 1;
      const step = Math.max(1, Math.floor(e.n / 48));
      let small = 0;
      for (let i = 0; i < e.n; i += step) {
        v.set(e.P[i * 3], e.P[i * 3 + 1], e.anchorZ + e.P[i * 3 + 2] - cam.Oz);
        const d = v.distanceTo(cp);
        if (d > maxD || !fr.containsPoint(v)) continue;
        const px = (e.SZ[i] * vis * K) / Math.max(d, 0.5);
        if (px >= 25) { hit = true; break; }
        if (px >= 8) small += step;
      }
      if (small >= 20) hit = true; // a school of clearly visible fish
      if (hit) break;
    }
    const key = this.seq.weights(cam.s)[0].key;
    const r = M[key] || (M[key] = { f: 0, hit: 0, ray: 0, ceph: 0, peng: 0 });
    r.f++; if (hit) r.hit++;
    // how often a ray / a cephalopod is readable in frame (>= 20 px)
    let ray = false, ceph = false, peng = false;
    for (const e of this.enc) {
      if (!e.visible) continue;
      const isRay = e.sp.mot.mode === 2, isCeph = e.sp.plan === 'squid' || e.sp.plan === 'octopus', isPeng = e.sp.key.endsWith('Penguin');
      if (!(isRay && !ray) && !(isCeph && !ceph) && !(isPeng && !peng)) continue;
      for (let i = 0; i < e.n; i++) {
        v.set(e.P[i * 3], e.P[i * 3 + 1], e.anchorZ + e.P[i * 3 + 2] - cam.Oz);
        const d = v.distanceTo(cp);
        if (d > maxD || !fr.containsPoint(v) || (e.SZ[i] * K) / Math.max(d, 0.5) < 20) continue;
        if (isRay) ray = true; else if (isCeph) ceph = true; else peng = true; break;
      }
    }
    if (ray) r.ray++; if (ceph) r.ceph++; if (peng) r.peng++;
  }

  update(dt, time, cam) {
    const t0 = performance.now();
    const c = this.ctx;
    // camera kinematics (global coordinates)
    let jumped = false;
    if (this.lastS !== null) {
      const ds = cam.s - this.lastS;
      if (Math.abs(ds) > 40) jumped = true;
      else if (dt > 0) this.camSpeed += (ds / dt - this.camSpeed) * Math.min(1, dt * 1.5);
    }
    this.lastS = cam.s;
    const f = cam.forward;
    c.s = cam.s; c.x = cam.x; c.y = cam.y; c.z = cam.z; c.Oz = cam.Oz; c.jumped = jumped;
    c.speed = Math.max(0, this.camSpeed);
    // camera velocity ~ along the forward direction projected on the path
    const fl = Math.hypot(f.x, f.z) || 1;
    c.vx = (f.x / fl) * c.speed * 0.3; c.vz = -c.speed;
    // view frustum in render space
    const camera = cam.camera;
    camera.updateMatrixWorld();
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);
    // fog visibility distance from the current water extinction
    const sg = this.U.uSigma.value;
    const sMin = Math.max(1e-3, Math.min(sg.x, sg.y, sg.z));
    this.fogD = Math.max(70, Math.min(190, 3.0 / sMin));

    if (dt > 0 || jumped || !this.director.primed) this.director.update(dt, c);
    let vis = 0, visTris = 0;
    for (let i = this.enc.length - 1; i >= 0; i--) {
      const e = this.enc[i];
      e.update(dt, c);
      if (e.done) {
        e.dispose();
        this.enc.splice(i, 1);
        this.instances -= e.n; this.trisTotal -= e.tris;
        continue;
      }
      if (e.visible) { vis++; visTris += e.tris; }
    }
    if (!this._idleQueued && typeof requestIdleCallback === 'function') { this._idleQueued = true; requestIdleCallback(this._idleCb, { timeout: 1500 }); }
    if (window.__crMetric) this._measure(cam, window.__crMetric);
    const st = this.stats;
    st.enc = this.enc.length; st.visible = vis; st.instances = this.instances; st.tris = visTris;
    st.ms = st.ms * 0.95 + (performance.now() - t0) * 0.05;
    if (this.logStats) {
      this._logT += dt;
      if (this._logT > 5) {
        this._logT = 0;
        console.log(`[creatures] enc ${st.enc} vis ${st.visible} inst ${st.instances} visTris ${(st.tris / 1000).toFixed(0)}k cpu ${st.ms.toFixed(2)}ms fog ${this.fogD.toFixed(0)}m :: ` +
          this.enc.map((e) => `${e.sp.key}x${e.n}${e.visible ? '*' : ''}@${Math.round(e.dist)}`).join(' '));
      }
    }
  }
}
