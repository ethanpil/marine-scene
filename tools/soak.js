// In-page soak helper: const r = await (await import('/tools/soak.js')).soak(90, { obs: true });
import { Obstacles } from '/src/obstacles.js';
// Chrome throttles chained setTimeout to ~1/min in hidden panes; MessageChannel-based timers are not throttled.
export function fastTO(fn, ms = 0) {
  const t = performance.now() + ms, ch = new MessageChannel();
  ch.port1.onmessage = () => { if (performance.now() >= t) { ch.port1.close(); fn(); } else ch.port2.postMessage(0); };
  ch.port2.postMessage(0); return 0;
}
export const sleep = (ms) => new Promise((r) => fastTO(r, ms));

export async function soak(secs = 90, o = {}) {
  const O = window.__ocean, errs = [], warns = [];
  if (!window.__soakWrapped) {
    window.__soakWrapped = true; const e0 = console.error, w0 = console.warn;
    console.error = (...a) => { (window.__soakE ||= []).push(a.map(String).join(' ').slice(0, 160)); e0.apply(console, a); };
    console.warn = (...a) => { (window.__soakW ||= []).push(a.map(String).join(' ').slice(0, 160)); w0.apply(console, a); };
    addEventListener('error', (ev) => (window.__soakE ||= []).push('uncaught ' + ev.message));
  }
  const c = O.creatures.ctx, tmp = [];
  const W = { floor: 1e9, ceil: 1e9, surf: 1e9, obs: 1e9, maxFloorUnder: 0 };
  let ns = 0;
  for (let t = 0; t < secs; t++) {
    O.advance(1, 1 / 15);
    const x = c.x, y = c.y, s = c.s;
    const f = O.shape.floorAt(x, s), ce = O.shape.ceilingAt(x, s);
    W.floor = Math.min(W.floor, y - f);
    if (isFinite(ce) && ce < 1e5) W.ceil = Math.min(W.ceil, ce - y);
    W.surf = Math.min(W.surf, -0.3 - y) === -0.3 - y ? W.surf : W.surf; // placeholder
    W.surf = Math.min(W.surf, -y); // headroom to surface (>0.3 required)
    O.obstacles.query(x, s, 6, tmp);
    for (const ob of tmp) W.obs = Math.min(W.obs, Obstacles.dist(ob, x, y, s, null));
    ns++;
    if (t % 10 === 9) await sleep(0);
  }
  const sub = O.director.subject;
  const pois = O.terrain.queryPOIs(c.s - 60, c.s + 200, []);
  const lab = O.labels; let nl = 0; try { const a = []; O.terrain.labels(a); nl = a.length; } catch (e) {}
  return {
    floorMargin: +W.floor.toFixed(2), ceilMargin: W.ceil > 1e8 ? null : +W.ceil.toFixed(2), surfHeadroom: +W.surf.toFixed(2), obsDist: W.obs > 1e8 ? null : +W.obs.toFixed(2),
    errs: (window.__soakE || []).length, warns: (window.__soakW || []).length, e0: (window.__soakE || []).slice(0, 2), w0: (window.__soakW || []).slice(0, 2),
    grp: O.creatures.enc.length, inst: O.creatures.instances, obsN: O.obstacles.count, labels: nl, pois: pois.length, subj: sub ? sub.kind + ':' + (sub.id) : null, chunks: O.terrain.chunks.size,
  };
}

// Runs each URL query in a hidden same-origin iframe, sequentially. cfgs: [{q:'biome=reef&seed=101&time=day&quality=low', ot:true}]
export async function matrix(cfgs, secs = 90) {
  const out = [];
  for (const cfg of cfgs) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;opacity:0;pointer-events:none';
    f.src = '/?captions=0&' + cfg.q; document.body.appendChild(f);
    let r;
    try {
      for (let i = 0; i < 100 && !(f.contentWindow.__ocean && f.contentWindow.__ocean.advance); i++) await sleep(200);
      await sleep(cfg.wait ?? 8000);
      const w = f.contentWindow; w.setTimeout = fastTO;
      r = await w.eval(`import('/tools/soak.js').then(m=>m.soak(${secs}))`);
      if (cfg.ot) { const o = await w.eval(`import('/src/creatures/devfly.js').then(m=>m.obstacleTest(60,false))`); r.ot = [o.worstPenetration, o.over5cm, o.samples, o.worstKey]; }
    } catch (e) { r = { fail: String(e) }; }
    r.q = cfg.q; out.push(r); (window.__all ||= []).push(r);
    try { f.contentWindow.__ocean.renderer.forceContextLoss(); } catch (e) {}
    f.remove();
  }
  return out;
}
