// Dev-only CPU profiler for the creature system: wraps Encounter methods + director, runs __ocean.advance.
// Usage (console): (await import('/src/creatures/prof.js')).prof(20)
export async function prof(secs = 20, warm = 4) {
  const o = window.__ocean, c = o.creatures;
  const { Encounter } = await import('./encounter.js');
  const T = {}, now = () => performance.now();
  const restore = [];
  const wrap = (obj, m, key = m) => {
    const f = obj[m]; if (typeof f !== 'function') return;
    obj[m] = function (...a) { const t = now(); const r = f.apply(this, a); T[key] = (T[key] || 0) + now() - t; return r; };
    restore.push(() => { obj[m] = f; });
  };
  o.advance(warm);
  for (const m of ['_leader', '_steer', '_obsRefresh', '_writeAll', '_octo', '_rest', '_visibility', '_drift', '_static', '_pushOut']) wrap(Encounter.prototype, m);
  wrap(c.director, 'update', 'director');
  let frames = 0, max = 0;
  const cu = c.update;
  c.update = function (...a) { const t = now(); const r = cu.apply(this, a); const d = now() - t; T.total = (T.total || 0) + d; if (d > max) max = d; frames++; return r; };
  restore.push(() => { c.update = cu; });
  o.advance(secs);
  restore.forEach((f) => f());
  const out = { frames, max: +max.toFixed(2) };
  for (const k in T) out[k] = +(T[k] / Math.max(1, frames)).toFixed(3);
  let inst = 0; for (const e of c.enc) inst += e.n;
  out.groups = c.enc.length; out.inst = inst;
  out.obs = o.obstacles ? o.obstacles.count : 0;
  return out;
}
