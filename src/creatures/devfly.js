// Dev-only helper (not imported by the app): drive the camera + creatures from the console when the
// page's rAF is throttled. Usage: const { fly } = await import('/src/creatures/devfly.js'); fly(s0, seconds, yaw, pitch)
import * as THREE from 'three';

// Approximation of main.js updateEnvironment (dev only) so captures are lit like the app.
function env(s) {
  const o = window.__ocean, U = o.U, B = o.BIOMES || null;
  const P = { sigma: [0, 0, 0], lightSigma: [0, 0, 0], deep: [0, 0, 0], up: [0, 0, 0], sun: 0, caustic: 0, shafts: 0, ambient: 0, glow: 0 };
  const BI = env.B;
  if (!BI) return;
  for (const e of o.seq.weights(s + 10)) {
    const b = BI[e.key];
    for (const k of ['sigma', 'lightSigma', 'deep', 'up']) for (let i = 0; i < 3; i++) P[k][i] += b[k][i] * e.w;
    for (const k of ['sun', 'caustic', 'shafts', 'ambient', 'glow']) P[k] += b[k] * e.w;
  }
  U.uSigma.value.set(...P.sigma); U.uLightSigma.value.set(...P.lightSigma);
  U.uWaterDeep.value.setRGB(...P.deep); U.uWaterUp.value.setRGB(...P.up);
  U.uSunScatter.value = P.sun; U.uCausticStr.value = P.caustic; U.uAmbientScale.value = P.ambient; U.uGlow.value = P.glow;
  if (U.uLamp) U.uLamp.value = Math.max(0, Math.min(1, (0.45 - P.sun) / 0.37));
  o.scene.traverse((x) => {
    if (x.isDirectionalLight) { x.intensity = 2.0 * P.sun; x.position.copy(o.camera.position).addScaledVector(U.uSunDir.value, 50); x.target.position.copy(o.camera.position); x.target.updateMatrixWorld(); }
    if (x.isHemisphereLight) { x.color.setRGB(...P.up).multiplyScalar(1.6); x.groundColor.setRGB(...P.deep).multiplyScalar(0.5); x.intensity = 1.1 * P.ambient; }
  });
  o.post.params.shafts = P.shafts * P.sun; o.post.params.depth = Math.max(0, -o.camera.position.y);
  o.post.params.exposure = 1 + 1.4 * P.glow + 0.4 * (1 - Math.min(1, P.sun));
}
export async function initEnv() { env.B = (await import('../biomes.js')).BIOMES; }

// Render one frame and POST the canvas to the dev server (saved under the scratchpad /shots).
export async function snap(name = 'shot.jpg', render = true) {
  const o = window.__ocean, r = o.post.renderer;
  if (render) o.post.render((fly.t || 0) % 4096);
  const url = r.domElement.toDataURL('image/jpeg', 0.85);
  await fetch('/' + name, { method: 'POST', body: url });
  return name;
}
// Point the camera (yaw/pitch relative to the path) at the nearest encounter of `key`.
export function aimAt(key) {
  const o = window.__ocean, c = o.creatures;
  const e = c.enc.filter((x) => !key || x.sp.key === key).sort((a, b) => a.dist - b.dist)[0];
  if (!e) return null;
  const b = e.bounds, s = fly.s || c.ctx.s;
  const dx = b.x - o.shape.pathX(s), dz = (e.anchorZ + b.z) + s, dy = b.y - o.shape.pathY(s);
  const base = Math.atan2(-(o.shape.pathX(s + 16) - o.shape.pathX(s)), 16);
  return { yaw: Math.atan2(-dx, -dz) - base, pitch: dy / Math.hypot(dx, dz), d: Math.hypot(dx, dy, dz) };
}

export function fly(s0, secs, yaw = 0, pitch = 0, speed = 3.2, step = 1 / 30) {
  const o = window.__ocean, c = o.creatures, world = c.world;
  let t = fly.t || 0, s = s0;
  const up = new THREE.Vector3(0, 1, 0), f = new THREE.Vector3();
  const n = Math.max(1, Math.round(secs / step));
  for (let k = 0; k < n; k++, s += speed * step) {
    const Oz = Math.ceil(-s / 1024) * 1024; world.position.z = -Oz;
    const x = o.shape.pathX(s), y = o.shape.pathY(s);
    o.camera.position.set(x, y, -s - Oz);
    const d = new THREE.Vector3(o.shape.pathX(s + 16) - x, o.shape.pathY(s + 16) - y, -16).normalize().applyAxisAngle(up, yaw);
    d.y += pitch; d.normalize();
    o.camera.lookAt(o.camera.position.clone().add(d));
    o.camera.updateMatrixWorld();
    if (k % 10 === 0 || k === n - 1) o.terrain.update(s);
    o.camera.getWorldDirection(f);
    t += step;
    o.U.uTime.value = t % 4096;
    c.update(step, t % 4096, { s, x, y, z: -s, forward: f, camera: o.camera, Oz });
  }
  fly.t = t; fly.s = s;
  o.U.uCamPos.value.copy(o.camera.position);
  env(s);
  o.terrain.sky.syncUniforms(Math.ceil(-s / 1024) * 1024);
  o.post.render(t % 4096);
  return c.enc.filter((e) => e.visible).map((e) => `${e.sp.key}x${e.n}@${Math.round(e.dist)}`).join(' ');
}

// Stop the app's own frame loop (so captures are deterministic) and load biome data.
export async function boot() {
  await new Promise((r) => setTimeout(r, 2000));
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  await new Promise((r) => setTimeout(r, 1500));
  window.requestAnimationFrame = raf;
  await initEnv();
  fly.t = 0;
}

// On-screen presence metric over `secs` of simulated time using the core's __ocean.advance hook.
export async function measure(secs = 180) {
  await new Promise((r) => setTimeout(r, 1500));
  window.__crMetric = {};
  const t0 = performance.now();
  for (let t = 0; t < secs; t += 10) window.__ocean.advance(10);
  const M = window.__crMetric; window.__crMetric = null;
  if (measure.shot) { window.__ocean.advance(0.4); await snap(measure.shot, false); }
  const out = {};
  for (const k in M) out[k] = `${((100 * M[k].hit) / M[k].f).toFixed(0)}% (${M[k].f}f)`;
  out.wall = ((performance.now() - t0) / 1000).toFixed(0) + 's';
  return out;
}

// Miss diagnosis: run `secs` in 2.5 s chunks and describe the groups at frames that missed.
export async function diagnose(secs = 120, maxLogs = 6) {
  await new Promise((r) => setTimeout(r, 1500));
  const o = window.__ocean, c = o.creatures, THREE = await import('three');
  const logs = [], spawns = []; let miss = 0, tot = 0;
  const os = c.spawn.bind(c); c.spawn = (sp, p) => { spawns.push(`${sp.key}/${p.kind || sp.beh.kind}/${p.route || '-'}`); return os(sp, p); };
  for (let k = 0; k < secs / 2.5; k++) {
    window.__crMetric = {}; o.advance(2.5); const M = window.__crMetric; window.__crMetric = null;
    const key = Object.keys(M)[0]; tot++;
    if (M[key].hit / M[key].f >= 0.5) continue;
    miss++;
    if (logs.length >= maxLogs) continue;
    logs.push(`t${k} ${key} lead? ${c.director.wantLead} :: ` + c.enc.map((e) => {
      const b = e.bounds, ahead = -(e.anchorZ + b.z) - c.ctx.s;
      const v = new THREE.Vector3(b.x, b.y, e.anchorZ + b.z - c.ctx.Oz).project(o.camera);
      return `${e.sp.key}x${e.n}[${e.kind}/${e.route}${e.route === 'lead' ? ':' + e.leadT.toFixed(0) : ''}] a${ahead.toFixed(0)} l${(b.x - c.ctx.x).toFixed(0)} dy${(b.y - c.ctx.y).toFixed(1)} rd${e.readDist.toFixed(0)} ndc${v.x.toFixed(1)},${v.y.toFixed(1)}${e.visible ? ' V' : ''}`;
    }).join(' | '));
  }
  c.spawn = os;
  return { miss, tot, spawns: spawns.join(' '), logs };
}
