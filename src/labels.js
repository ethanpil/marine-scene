// "i" overlay: names of the things currently on screen (creatures and props).
// Providers push candidates { name, x, y, z, fact? } in GLOBAL coordinates (z = -s) into an array.
// The thing the camera is watching (labels.focus, global) also shows its fun fact.
import * as THREE from 'three';

const MAX = 16, RANGE = 70, HZ = 8;

export class Labels {
  constructor() {
    this.providers = [];
    this.on = false;
    this.root = document.createElement('div');
    this.root.id = 'labels';
    document.body.appendChild(this.root);
    this.pool = [];
    for (let i = 0; i < MAX; i++) {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.innerHTML = '<span class="dot"></span><span class="txt"></span><span class="fact"></span>';
      this.root.appendChild(el);
      this.pool.push({ el, txt: el.children[1], fact: el.children[2] });
    }
    this.cands = [];
    this.focus = null;
    this.v = new THREE.Vector3();
    this.t = 0;
  }
  add(provider) { this.providers.push(provider); }
  toggle() {
    this.on = !this.on;
    this.root.style.display = this.on ? 'block' : 'none';
  }
  update(dt, camera, Oz) {
    if (!this.on) return;
    this.t += dt;
    if (this.t < 1 / HZ) return;
    this.t = 0;
    const c = this.cands; c.length = 0;
    for (const p of this.providers) { try { p(c); } catch (e) { console.error(e); } }
    const W = innerWidth, H = innerHeight, cam = camera.position;
    const shown = [];
    // the watched subject's label (nearest candidate with a fact, within a few metres)
    let focusE = null;
    if (this.focus) {
      let bd = 16;
      for (const e of c) {
        if (!e.fact) continue;
        const d2 = (e.x - this.focus.x) ** 2 + (e.y - this.focus.y) ** 2 + (e.z - this.focus.z) ** 2;
        if (d2 < bd) { bd = d2; focusE = e; }
      }
    }
    // nearest first, one label per distinct name+spot
    for (const e of c) e.d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - Oz - cam.z);
    c.sort((a, b) => a.d - b.d);
    for (const e of c) {
      if (shown.length >= MAX) break;
      if (e.d > RANGE || e.d < 1.5) continue;
      this.v.set(e.x, e.y, e.z - Oz).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 0.95 || Math.abs(this.v.y) > 0.92) continue;
      const sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
      const w = 9 + e.name.length * 7.2, h = 22;
      if (shown.some((o) => Math.abs(o.sx - sx) < (o.w + w) / 2 && Math.abs(o.sy - sy) < h)) continue;
      if (shown.some((o) => o.name === e.name && Math.hypot(o.sx - sx, o.sy - sy) < 160)) continue;
      shown.push({ sx, sy, w, name: e.name, d: e.d, fact: e === focusE ? e.fact : '' });
    }
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i], s = shown[i];
      if (!s) { p.el.style.display = 'none'; continue; }
      p.el.style.display = 'block';
      p.el.style.transform = `translate(${s.sx.toFixed(0)}px, ${s.sy.toFixed(0)}px)`;
      p.el.style.opacity = (1 - Math.max(0, (s.d - RANGE * 0.6) / (RANGE * 0.4)) * 0.7).toFixed(2);
      if (p.txt.textContent !== s.name) p.txt.textContent = s.name;
      if (p.fact.textContent !== s.fact) { p.fact.textContent = s.fact; p.fact.style.display = s.fact ? 'block' : 'none'; }
    }
  }
}
