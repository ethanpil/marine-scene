// Encounter director: blended per-biome tables with rarity, cooldowns, novelty and budgets.
// Spawns ahead of the camera at the fog edge (or behind it, out of view, for overtakers).
import { mulberry32, hash2i } from '../noise.js';
import { speciesOf } from './species.js';
import { Obstacles } from '../obstacles.js';

// [species key | 'proc:<kind>', weight, cooldown (s)]
// target = desired simultaneous encounters, lat = max lateral offset from the camera path.
export const TABLES = {
  reef: { cover: 3, target: 17, lat: 45, list: [
    ['chromis', 6, 25], ['anthias', 6, 25], ['bluetang', 4, 45], ['yellowtang', 4, 45], ['clownfish', 3, 60], ['butterfly', 4, 45],
    ['copperband', 2, 70], ['moorish', 3, 60], ['emperorAngel', 2, 90], ['queenAngel', 2, 90], ['parrotfish', 4, 45], ['lionfish', 2, 90],
    ['puffer', 2, 90], ['boxfish', 2, 100], ['coralGrouper', 2, 70], ['snapper', 3, 60], ['sweetlips', 2, 80], ['picasso', 2, 90],
    ['sergeant', 3, 60], ['napoleon', 1, 200], ['barracuda', 1.5, 150], ['jack', 1.2, 160], ['reefShark', 2, 100], ['whitetip', 1.5, 120],
    ['blacktip', 1.2, 140], ['eagleRay', 1.2, 150], ['bluespotRay', 1.5, 90], ['moray', 2, 60], ['spotMoray', 1.5, 80], ['gardenEel', 2, 90],
    ['splendidEel', 1, 120], ['greenTurtle', 1.8, 120], ['octopus', 2.5, 80], ['cuttlefish', 2, 80], ['reefSquid', 2, 80],
    ['manta', 0.7, 360], ['whaleShark', 0.45, 600], ['bottlenose', 0.4, 500], ['proc:reef', 8, 10], ['rainbowRunner', 0.8, 120],
    ['southernRay', 1.2, 120], ['flounder', 1.5, 90], ['lizardfish', 1.5, 80], ['goatfish', 2, 60], ['nurseShark', 0.8, 160],
  ] },
  sandflat: { cover: 3, target: 12, lat: 50, list: [
    ['southernRay', 4, 50], ['bluespotRay', 3, 50], ['eagleRay', 2.5, 90], ['manta', 0.8, 300], ['gardenEel', 3, 60], ['splendidEel', 1.5, 90],
    ['flounder', 3, 45], ['guitarfish', 2, 70], ['lizardfish', 2.5, 50], ['goatfish', 3, 40], ['nurseShark', 1.5, 100], ['greenTurtle', 2, 90],
    ['reefSquid', 1.5, 80], ['cuttlefish', 1.5, 80], ['octopus', 1.5, 90], ['blacktip', 0.8, 150], ['silverside', 2, 60], ['jack', 0.6, 160],
    ['barracuda', 0.6, 150], ['proc:sandflat', 2, 30],
  ] },
  kelp: { cover: 3, target: 12, lat: 40, list: [
    ['garibaldi', 5, 40], ['sheephead', 3, 60], ['kelpBass', 4, 45], ['blacksmith', 5, 40], ['senorita', 4, 45], ['opaleye', 3, 60],
    ['giantSeaBass', 1, 220], ['leopardShark', 1.5, 120], ['batRay', 1.5, 120], ['harbourSeal', 1.5, 150], ['seaLion', 1.8, 120],
    ['seaNettle', 2, 90], ['moonJelly', 1.5, 100], ['sardine', 1.2, 150], ['octopus', 2, 90], ['reefSquid', 1.5, 90], ['blueWhale', 0.25, 900], ['proc:kelp', 5, 15],
  ] },
  seagrass: { cover: 3, target: 10, lat: 45, list: [
    ['seahorse', 4, 45], ['pipefish', 3, 60], ['silverside', 5, 40], ['filefish', 3, 60], ['greenTurtle', 3, 80], ['cuttlefish', 2.5, 80],
    ['southernRay', 2.5, 80], ['bluespotRay', 1.5, 100], ['puffer', 2, 90], ['manatee', 0.8, 300], ['dugong', 0.6, 360],
    ['moonJelly', 1.5, 100], ['parrotfish', 1.5, 90], ['proc:seagrass', 5, 15], ['flounder', 2, 70], ['goatfish', 1.5, 70], ['reefSquid', 1.5, 90],
    ['eagleRay', 1, 150], ['blacktip', 1, 140], ['snapper', 2, 80],
  ] },
  pelagic: { cover: 3, target: 11, lat: 90, list: [
    ['sardine', 4, 70], ['anchovy', 3, 70], ['yellowfin', 3, 80], ['bluefin', 1.5, 140], ['mahi', 2, 100], ['sailfish', 0.8, 240],
    ['oceanicWhitetip', 1.2, 160], ['blueShark', 2, 120], ['greatWhite', 0.5, 420], ['hammerhead', 0.8, 300], ['mola', 1.2, 220],
    ['manta', 0.8, 300], ['whaleShark', 0.7, 420], ['humpback', 0.9, 360], ['blueWhale', 0.5, 600], ['spermWhale', 0.5, 600],
    ['orca', 0.6, 500], ['commonDolphin', 1.6, 200], ['bottlenose', 1, 240], ['pilotWhale', 0.6, 400], ['moonJelly', 2, 90],
    ['pelagia', 1.5, 120], ['seaNettle', 1, 140], ['siphonophore', 0.6, 300], ['greenTurtle', 1, 160], ['oceanicSquid', 2, 120], ['proc:pelagic', 1.5, 40], ['rainbowRunner', 1.5, 90],
  ] },
  cave: { cover: 2.5, target: 7, lat: 4, list: [
    ['tarpon', 4, 50], ['sweeper', 5, 40], ['silverside', 4, 45], ['jack', 1, 150], ['moray', 1.5, 90], ['proc:cave', 3, 25],
    ['blenny', 1.5, 60], ['eelpout', 0.5, 120],
  ] },
  wreck: { cover: 3, target: 10, lat: 45, list: [
    ['barracuda', 3, 80], ['goliath', 2, 120], ['sweeper', 4, 50], ['batfish', 3, 70], ['sandTiger', 2, 120], ['moray', 2, 60],
    ['jack', 2, 100], ['snapper', 3, 60], ['eagleRay', 1.2, 150], ['greenTurtle', 1.2, 150], ['lionfish', 2, 90], ['reefShark', 1.5, 120],
    ['proc:wreck', 4, 15], ['manta', 0.4, 400], ['octopus', 2, 80], ['southernRay', 1.5, 90], ['flounder', 1, 100], ['nurseShark', 1, 130],
  ] },
  ruins: { cover: 3, target: 13, lat: 40, list: [
    ['snapper', 3, 60], ['parrotfish', 3, 60], ['napoleon', 1.2, 200], ['coralGrouper', 2, 90], ['goliath', 1, 150], ['jack', 2, 100],
    ['barracuda', 2, 100], ['eagleRay', 1.5, 120], ['southernRay', 1.5, 100], ['octopus', 2.5, 80], ['greenTurtle', 1.5, 120],
    ['moray', 1.5, 80], ['bluetang', 2, 60], ['butterfly', 2, 60], ['moorish', 2, 70], ['chromis', 3, 40], ['anthias', 3, 40],
    ['proc:ruins', 6, 12], ['bottlenose', 0.4, 400], ['manta', 0.4, 400],
  ] },
  vents: { cover: 3, target: 9, lat: 30, list: [
    ['eelpout', 4, 40], ['rattail', 3, 60], ['anglerfish', 2.5, 90], ['chimaera', 2, 100], ['helmetJelly', 2, 90], ['atolla', 2, 90],
    ['viperfish', 1.5, 110], ['lanternfish', 2, 90], ['siphonophore', 0.8, 240], ['octopus', 1.5, 120], ['glowSquid', 1, 120], ['proc:vents', 2, 30],
  ] },
  tidepool: { cover: 2.5, target: 7, lat: 3, list: [
    ['sculpin', 4, 40], ['blenny', 4, 40], ['silverside', 4, 40], ['opaleye', 3, 60], ['garibaldi', 2, 80], ['octopus', 1, 150],
    ['proc:tidepool', 3, 25],
  ] },
  abyss: { cover: 3, target: 9, lat: 80, list: [
    ['lanternfish', 5, 50], ['hatchetfish', 4, 60], ['anglerfish', 2.5, 90], ['viperfish', 2.5, 90], ['dragonfish', 2, 100],
    ['atolla', 3, 70], ['combJelly', 3, 70], ['helmetJelly', 2.5, 80], ['pelagia', 2, 80], ['siphonophore', 1.5, 160],
    ['vampireSquid', 1.5, 140], ['giantSquid', 0.35, 700], ['glowSquid', 2.5, 80], ['spermWhale', 0.3, 700], ['proc:abyss', 2, 40],
  ] },
  polar: { cover: 3, target: 11, lat: 50, ensure: { S: ['adeliePenguin', 'emperorPenguin'], N: ['beluga', 'narwhal', 'harbourSeal'] }, list: [
    ['emperorPenguin', 5, 35], ['adeliePenguin', 6, 25], ['leopardSeal', 1.5, 150], ['weddellSeal', 1.5, 150], ['krill', 3, 60],
    ['icefish', 3, 60], ['toothfish', 1.5, 120], ['orca', 0.6, 400], ['humpback', 0.5, 450],
    ['beluga', 4, 60], ['narwhal', 3, 80], ['arcticCod', 4, 50], ['harbourSeal', 1.5, 150], ['greenlandShark', 0.5, 450],
    ['lionsMane', 1.5, 140], ['moonJelly', 1.5, 100], ['combJelly', 1, 120], ['proc:polar', 1.5, 40],
  ] },
};

const pickW = (rng, obj) => { let t = 0; for (const k in obj) t += obj[k]; let r = rng() * t; for (const k in obj) { r -= obj[k]; if (r <= 0) return k; } return Object.keys(obj)[0]; };

export class Director {
  constructor(sys) {
    this.sys = sys;
    this.rng = mulberry32((sys.seed ^ 0x5eed1234) >>> 0);
    this.clock = 0; this.timer = 0; this.hlTimer = 45 + this.rng() * 40;
    this.cool = new Map(); this.seen = new Map(); this.spCache = new Map();
    this.emptyTime = 0; this.primed = false; this.lastSpawn = -1;
    this.forced = sys.forceSpecies || null;
  }

  species(key) {
    let sp = this.spCache.get(key);
    if (!sp) {
      sp = speciesOf(key);
      if (!sp) return null;
      if (this.spCache.size > 300) this.spCache.delete(this.spCache.keys().next().value);
      this.spCache.set(key, sp);
    }
    return sp;
  }

  update(dt, c) {
    this.clock += dt; this.hlTimer -= dt; this.timer -= dt;
    const sys = this.sys;
    if (!this.primed || c.jumped) { this.prime(c, !this.primed); this.primed = true; return; }
    // Coverage control: keep enough groups that are (or will soon be) readable inside the forward view.
    if (this.ensureTick(c)) return;
    const cov = this.coverage(c), want = this.coverWant(c);
    // keep a pipeline of lead groups: one swimming ahead of the camera, the next one closing in
    let leads = 0;
    for (const e of sys.enc) if (!e.done && e.route === 'lead' && e.leadT > 4 && -(e.anchorZ + e.bounds.z) - c.s > -2) leads++;
    this.wantLead = leads < 1 && this.clock - (this.leadFail || -99) > 3;
    const urgent = cov < want || this.wantLead;
    if (urgent) { if (this.clock - this.lastSpawn < 0.35 / Math.max(1, c.speed / 4)) return; }
    else if (this.timer > 0) return;
    this.timer = (0.6 + this.rng() * 0.7) / Math.max(1, c.speed / 4);
    if (!urgent && sys.enc.length >= Math.min(this.target(c), sys.maxEnc)) return;
    if (sys.enc.length >= sys.maxEnc) { // make room: retire the least useful group that is out of view
      let worst = null, ws = -1;
      for (const e of sys.enc) {
        if (e.visible || e.done) continue;
        const ahead = -(e.anchorZ + e.bounds.z) - c.s;
        const score = ahead < 0 ? 1e4 - ahead : Math.abs(e.bounds.x - c.x) / (e.readLat + 1);
        if (score > ws) { ws = score; worst = e; }
      }
      if (!worst) return;
      worst.done = true;
    }
    const lead = this.wantLead;
    const e = this.spawnOne(c, urgent, true, false, lead);
    if (e) this.lastSpawn = this.clock;
    else if (lead) this.leadFail = this.clock; // no lead-capable species here right now
  }

  // Next species likely to be spawned soon whose geometry is not cached yet (or null).
  nextPrewarm(c) {
    const sys = this.sys;
    if (!this._pw || this.clock - this._pwT > 20) { this._pw = new Set(); this._pwT = this.clock; }
    for (const ds of [sys.fogD, sys.fogD + 300]) {
      const s = c.s + ds, region = this.region(s);
      for (const e of sys.seq.weights(s)) {
        const T = TABLES[e.key]; if (!T) continue;
        for (const [key] of T.list) {
          const keys = key.startsWith('proc:') ? [0, 1, 2].map((k) => `${key}:${(region % 100000) * 16 + k}`) : [key];
          for (const k of keys) {
            if (this._pw.has(k)) continue;
            this._pw.add(k);
            const sp = this.species(k);
            if (sp && !sys.cache.map.has(sp.key)) return sp;
          }
        }
      }
    }
    return null;
  }

  // Signature animals that must reliably be present in a biome (e.g. penguins under Antarctic ice):
  // when none is active, spawn one right away, ignoring cooldowns.
  ensureTick(c) {
    const sys = this.sys;
    this.ensureT = (this.ensureT || 0) - 1;
    if (this.ensureT > 0) return false;
    this.ensureT = 20; // checked a few times per second at most
    const s = c.s + 40, w = sys.seq.weights(s)[0];
    const T = TABLES[w.key];
    if (!T || !T.ensure || w.w < 0.6) return false;
    const set = T.ensure[this.hemi(this.region(s))] || [];
    if (!set.length || sys.enc.some((e) => set.includes(e.sp.key) && !e.done && -(e.anchorZ + e.bounds.z) - c.s > -10)) return false;
    if (sys.enc.length >= sys.maxEnc) return false;
    const sp = this.species(set[Math.floor(this.rng() * set.length)]);
    const plan = sp && this.plan(sp, c, true, sys.seq.weights(c.s + 50), sys.maxInstances - sys.instances, sys.maxTris - sys.trisTotal, !this.primedEnsure, false);
    this.primedEnsure = true;
    if (!plan) return false;
    if (sys.spawn(sp, plan)) { this.seen.set(sp.key, this.clock); this.lastSpawn = this.clock; return true; }
    return false;
  }

  coverWant(c) {
    let t = 0;
    for (const e of this.sys.seq.weights(c.s + 60)) t += (TABLES[e.key]?.cover ?? 3) * e.w;
    return t;
  }

  // Groups that are readable in view now, or are lined up to pass through the forward view cone.
  coverage(c) {
    const fogD = this.sys.fogD;
    let n = 0;
    for (const e of this.sys.enc) {
      if (e.done) continue;
      const b = e.bounds, ahead = -(e.anchorZ + b.z) - c.s, lat = Math.abs(b.x - c.x);
      if (e.visible && e.dist < Math.min(fogD * 0.6, e.readDist)) { n++; continue; }
      if ((e.route === 'lead' || e.route === 'swirl') && e.leadT > 0 && ahead > -3) { n++; continue; }
      if (e.readDist >= 6 && ahead > 0 && ahead < e.readDist + 25 && lat < e.readDist * 0.5 + 2) { n++; continue; }
      if ((e.route === 'overtake' || e.route === 'escort') && ahead > -60 && ahead < 6) n++;
    }
    return n;
  }

  target(c) {
    let t = 0;
    for (const e of this.sys.seq.weights(c.s + 110)) t += (TABLES[e.key]?.target ?? 8) * e.w;
    return Math.round(t);
  }

  prime(c, first) {
    const t = this.target(c);
    for (let k = 0; k < t + 2 && this.sys.enc.length < this.sys.maxEnc; k++) {
      const e = this.spawnOne(c, true, true, true);
      if (e && first) { e.fade = 1; e.plan.fadeIn = false; } // the loader covers the very first frames
    }
  }

  // Polar segments: ~75% Antarctic (penguins, leopard seals, krill), ~25% Arctic (belugas, narwhals).
  hemi(region) { return hash2i(region, 7, 3) < 0.25 ? 'N' : 'S'; }

  // Region seed for procedural species / colour variants (stable within a biome segment).
  region(s) {
    const seq = this.sys.seq, g = seq.segs[seq.segAt(s)];
    return g ? g.seed >>> 0 : 1;
  }

  spawnOne(c, near, allowHl, prime = false, lead = false) {
    const sys = this.sys, rng = this.rng;
    const sProbe = c.s + (near ? 50 : sys.fogD);
    const ws = sys.seq.weights(sProbe);
    const region = this.region(sProbe);
    const hemi = this.hemi(region);
    const cands = []; let tot = 0;
    const activeCount = new Map();
    for (const e of sys.enc) activeCount.set(e.sp.key, (activeCount.get(e.sp.key) || 0) + 1);
    const instBudget = sys.maxInstances - sys.instances;
    const triBudget = sys.maxTris - sys.trisTotal;
    const addCand = (key, w, cd, bw, small) => {
      let k = key;
      if (key.startsWith('proc:')) k = `${key}:${(region % 100000) * 16 + Math.floor(rng() * 12)}`;
      if (this.forced) k = this.forced;
      const sp = this.species(k); if (!sp) return;
      const ck = key.startsWith('proc:') ? key : sp.key;
      const cooling = (this.cool.get(ck) ?? -1) > this.clock && !this.forced;
      if (cooling && !lead) return; // lead requests may reuse a cooling species (at lower weight) to keep the view alive
      if (sp.hemi && sp.hemi !== hemi && ws.some((x) => x.key === 'polar')) return;
      if (sp.hl && (!allowHl || this.hlTimer > 0) && !this.forced) return;
      if ((activeCount.get(sp.key) || 0) >= (sp.beh.kind === 'shoal' || key.startsWith('proc:') || small ? 2 : 1) && !this.forced) return;
      const nMin = sp.beh.n[0];
      if (nMin > instBudget) return;
      const novelty = 1 + Math.min(2, (this.clock - (this.seen.get(ck) ?? -1e4)) / 400);
      const rd = (sp.size[0] + sp.size[1]) * 0.5 * (sp.beh.n[1] >= 20 ? 75 : 24) * (sp.plan === 'jelly' ? 0.6 : sp.plan === 'siphon' ? 0.12 : 1);
      if (lead && (rd < 7 || ['shoal', 'hover', 'drift', 'colony', 'peek', 'octo', 'mill', 'rest'].includes(sp.beh.kind) && !(sp.beh.kind === 'shoal' && rd >= 7))) return;
      const ww = w * bw * novelty * (near ? (rd >= 8 ? 3 : 0.4) : 1) * (cooling ? 0.3 : 1);
      cands.push({ sp, ck, ww, cd }); tot += ww;
    };
    for (const e of ws) {
      const T = TABLES[e.key]; if (!T) continue;
      for (const [k, w, cd] of T.list) addCand(k, w, T.list.length < 10 ? cd * 0.5 : cd, e.w, T.list.length < 10);
    }
    if (!cands.length) return null;
    let r = rng() * tot, pick = cands[0];
    for (const cd of cands) { r -= cd.ww; if (r <= 0) { pick = cd; break; } }
    const plan = this.plan(pick.sp, c, near, ws, instBudget, triBudget, prime, lead);
    if (!plan) return null;
    const enc = sys.spawn(pick.sp, plan);
    if (!enc) return null;
    this.mixWith(enc, pick.sp, plan, c, ws, region);
    this.cool.set(pick.ck, this.clock + pick.cd * (0.7 + 0.6 * rng()));
    this.seen.set(pick.ck, this.clock);
    if (pick.sp.hl) this.hlTimer = 70 + rng() * 90;
    return enc;
  }

  // Mixed-species groups: companions share the primary group's path (schools) or patch (shoals),
  // e.g. jacks with rainbow runners, sardines with anchovies, reef shoals of 2-4 species.
  mixWith(enc, sp, plan, c, ws, region) {
    const sys = this.sys, rng = this.rng, kind = enc.kind;
    if (!['school', 'shoal', 'bait', 'mill'].includes(kind) || plan.route === 'swirl' || sys.enc.length > sys.maxEnc - 4 || rng() > 0.35) return;
    const PAIR = { jack: ['rainbowRunner'], rainbowRunner: ['jack'], sardine: ['anchovy'], anchovy: ['sardine'], silverside: ['anchovy'],
      snapper: ['sweetlips', 'proc'], bluetang: ['yellowtang', 'proc'], yellowtang: ['bluetang'], chromis: ['anthias', 'proc'], anthias: ['chromis', 'proc'],
      sergeant: ['proc', 'chromis'], blacksmith: ['senorita'], senorita: ['blacksmith', 'proc'], goatfish: ['proc'], butterfly: ['proc', 'bluetang'] };
    let opts = PAIR[sp.key] || (sp.key.startsWith('proc:') ? ['proc', 'proc'] : null);
    if (!opts) return;
    const extra = 1 + Math.floor(rng() * Math.min(2, opts.length));
    for (let k = 0; k < extra; k++) {
      let key = opts[k % opts.length];
      if (key === 'proc') {
        const t = ws[0] ? ws[0].key : 'reef';
        if (!(TABLES[t]?.list || []).some((e) => e[0] === 'proc:' + t)) continue;
        key = `proc:${t}:${(region % 100000) * 16 + Math.floor(rng() * 12)}`;
      }
      const sp2 = this.species(key);
      if (!sp2 || sp2.key === sp.key) continue;
      const kind2 = sp2.beh.kind === 'shoal' && kind !== 'shoal' ? kind : sp2.beh.kind;
      if (!['school', 'shoal', 'bait', 'mill'].includes(kind2)) continue;
      const n2 = Math.max(1, Math.min(Math.round(plan.n * (0.2 + rng() * 0.6)), sys.maxInstances - sys.instances));
      const tris = sys.cache.map.get(sp2.key)?.tris ?? 1500;
      if (n2 * tris > sys.maxTris - sys.trisTotal) continue;
      const p2 = { ...plan, n: n2, seed: (rng() * 4294967296) >>> 0, variant: (plan.variant ^ (k + 1) * 2654435761) >>> 0, kind: kind === 'shoal' ? undefined : kind, evade: enc.evade, fadeIn: true };
      if (kind === 'shoal') { // same patch: the companions' homes start at the primary's (structure-seeking) spot
        const s0 = -(enc.homeZ + enc.anchorZ); p2.s0 = s0; p2.l0 = enc.homeX - sys.shape.pathX(s0); p2.noSeek = true; p2.kind = 'shoal';
      }
      sys.spawn(sp2, p2);
    }
  }

  plan(sp, c, near, ws, instBudget, triBudget, prime, lead = false) {
    const sys = this.sys, sh = sys.shape, rng = this.rng, beh = sp.beh;
    let lat = 0; for (const e of ws) lat += (TABLES[e.key]?.lat ?? 40) * e.w;
    const fogD = sys.fogD;
    const rr = (a) => a[0] + (a[1] - a[0]) * rng();
    // spawn distance: fog edge normally; closer (with a dithered fade-in) when coverage is short
    const D = prime ? rr([10, fogD * 0.75]) : near ? rr([fogD * 0.45, fogD * 0.7]) : fogD * rr([0.75, 0.95]);
    let n = Math.round(beh.n[0] + (beh.n[1] - beh.n[0]) * rng());
    // group sizes from singletons / stragglers to occasional huge aggregations
    if (beh.n[1] > 3 && beh.kind !== 'colony') {
      const r = rng();
      if (r < 0.1) n = Math.max(1, Math.round(n * (0.1 + rng() * 0.25)));
      else if (r > 0.93 && sp.size[1] < 2) n = Math.round(n * (1.5 + rng() * 0.7));
    }
    n = Math.max(1, Math.min(n, instBudget, 400));
    const tris = sys.cache.map.get(sp.key)?.tris ?? 1500;
    while (n > 1 && n * tris > triBudget) n = Math.floor(n * 0.7);
    if (n * tris > triBudget && n === 1 && tris > triBudget) return null;
    const side = rng() < 0.5 ? -1 : 1;
    const plan = { n, formation: pickW(rng, { ellipsoid: 3, ball: 1, ribbon: 1.5, wall: 1, loose: 1.5, column: 0.5 }), mood: pickW(rng, { calm: 2, feeding: 1, alert: 1 }), wseed: (rng() * 4294967296) >>> 0, seed: (rng() * 4294967296) >>> 0, variant: (this.region(c.s + D) ^ hash2i(sp.key.length, 3, 9) * 1e9) >>> 0, fadeIn: near || prime, latMax: lat, s0: c.s + D, l0: 0 };
    const speed = beh.speed ? rr(beh.speed) : 0.5;
    const latLim = (x) => Math.max(-lat, Math.min(lat, x));
    // Readable lateral offset: when a group leaves the frame while being passed it should still project
    // to >= ~25 px at 720p (K ~ 600 px/rad): lateral <= size * 16; schools read at about size * 40.
    const sz = (sp.size[0] + sp.size[1]) * 0.5, big = sz > 4;
    const readLat = Math.min(lat, Math.max(1.5, sz * (n >= 20 ? 40 : 16)));
    plan.readLat = readLat;
    const altUp = () => (beh.alt ? beh.alt[0] + (beh.alt[1] - beh.alt[0]) * (0.4 + 0.6 * rng()) : 1.5); // bias toward eye level
    let kind = beh.kind;
    // medium-size shoaling fish sometimes travel as a group
    if (kind === 'shoal' && sz * (n >= 20 ? 75 : 24) >= 7 && (lead || rng() < 0.55)) { kind = 'school'; plan.kind = 'school'; }
    const eye = () => rr([-1, 0.6]);        // camera height (relative to the path)
    if (kind === 'shoal' || kind === 'hover' || kind === 'colony' || kind === 'peek' || kind === 'octo' || kind === 'rest') {
      // bottom life right under / beside the path: reef fish picking at the bottom, rays on the sand, octopus
      plan.l0 = latLim(side * rr([0, kind === 'rest' && sz > 1.5 ? 5 : 3.5]));
      plan.h0 = eye();
      plan.alt = altUp();
    } else if (kind === 'drift') {
      plan.l0 = latLim(side * rr([0, 6]));
      plan.h0 = rr([-2, 2]);
    } else {
      const readDist = sz * (n >= 20 ? 75 : 24);
      const routes = {};
      for (const k in (beh.routes || {})) routes[k] = beh.routes[k] * 0.5;
      if (big) { routes.lead = (routes.lead || 0) + 2; routes.cross = (routes.cross || 0) + 1; routes.oncoming = (routes.oncoming || 0) + 1; }
      else {
        routes.crossNear = (routes.crossNear || 0) + 2.5;
        if (sz < 3) routes.toward = (routes.toward || 0) + 2;
        if (readDist >= 7) routes.lead = (routes.lead || 0) + 2;
        if ((kind === 'school' || kind === 'bait' || kind === 'mill') && n >= 12 && sz <= 1.2) routes.swirl = (routes.swirl || 0) + 1.5;
        if (kind === 'school') routes.hold = (routes.hold || 0) + 1;
      }
      let route = kind === 'bait' ? (rng() < 0.6 ? 'lead' : 'swirl') : kind === 'mill' ? (rng() < 0.5 ? 'swirl' : 'hold') : lead && readDist >= 7 ? 'lead' : pickW(rng, routes);
      if ((route === 'overtake' || route === 'escort') && (beh.speed[1] * 1.7 < c.speed + 1 || near || prime)) route = 'lead';
      const fromFloor = beh.zone === 'floor';
      plan.route = route; plan.speed = speed; plan.alt = altUp(); plan.wobble = 0.6;
      let l = 0;
      if (route === 'lead') {
        const R = kind === 'bait' ? sz * 2.0 * Math.cbrt(n) * 0.75 : 0;
        const A = big ? rr([25, 40]) : kind === 'bait' ? R + rr([2.5, 4]) : Math.max(7, Math.min(28, readDist * rr([0.55, 0.8])));
        plan.leadA = A; plan.leadT = kind === 'bait' ? rr([8, 16]) : rr([12, 35]);
        const fromBehind = !prime && (beh.speed?.[1] ?? 0) * 1.5 > c.speed + 1 && rng() < 0.5;
        plan.s0 = fromBehind ? c.s - rr([15, 30]) : c.s + A + (prime ? rr([0, 10]) : rr([5, 15]));
        plan.fadeIn = !fromBehind;
        plan.vs = fromBehind ? c.speed + 1.5 : c.speed * 0.6;
        l = side * (kind === 'bait' ? rr([0, R * 0.5]) : big ? rr([A * 0.2, A * 0.45]) : rr([0, A * 0.3]));
        plan.h0 = big ? (beh.over ? rr(beh.over) : rr([-6, 0])) : eye();
        if (fromFloor) plan.zone = 'mid';
      } else if (route === 'crossNear' || route === 'cross') {
        // cross the path right in front of the camera, at eye level (big animals: further out)
        const vl = Math.max(0.5, speed * 0.95);
        const L = Math.min(lat, big ? 40 : Math.max(4, Math.min(vl * 7, 18)));
        const T = L / vl;
        const dC = big ? rr([25, 40]) : readDist < 10 ? rr([5, 12]) : rr([8, 30]);
        plan.s0 = c.s + c.speed * T + dC;
        l = -side * L; plan.vl = side * vl; plan.vs = speed * (rng() - 0.5) * 0.3;
        plan.h0 = big ? (beh.over ? rr(beh.over) : rr([-6, 0])) : eye();
        if (sp.mot.mode === 3 && sz >= 0.7) { plan.h0 = -2.5; plan.vh = 3 / T; } // turtles rising across the path
        if (fromFloor) plan.zone = 'mid';
        plan.fadeIn = plan.fadeIn || plan.s0 - c.s < fogD * 0.8;
      } else if (route === 'toward') {
        // swim straight at the camera and part / veer around it
        plan.vs = -speed; l = rr([-1.2, 1.2]); plan.h0 = eye();
        if (fromFloor) plan.zone = 'mid';
      } else if (route === 'swirl') {
        // wait on the path; the camera enters the school and it circles around the camera
        plan.kind = 'mill'; plan.leadT = rr([10, 20]);
        plan.s0 = c.s + rr([14, 26]); l = 0; plan.h0 = rr([-0.5, 0.3]); plan.zone = 'mid'; plan.vs = 0;
        plan.fadeIn = true;
      } else if (route === 'hold') {
        plan.vs = speed * (rng() - 0.5) * 0.6; l = rr([-1.5, 1.5]); plan.h0 = eye();
        if (fromFloor && rng() < 0.6) plan.zone = 'mid';
      } else if (route === 'pace') {
        plan.vs = Math.min(c.speed * rr([0.45, 0.8]), (beh.speed?.[1] ?? 1) * 1.8); l = side * rr([0, 4]); plan.h0 = eye();
      } else {
        const dist = beh.dist || [4, 20];
        l = side * (big ? rr([25, 45]) : rr([0, Math.min(dist[1], 8)]));
        plan.h0 = big ? (beh.over ? rr(beh.over) : rr([-8, 1])) : (beh.over ? rr(beh.over) : eye());
        if (route === 'oncoming') plan.vs = -speed;
        else if (route === 'along') plan.vs = speed;
        else if (route === 'overtake') { plan.s0 = c.s - 30 - rng() * 15; plan.vs = c.speed + 1.5 + rng() * 1.5; }
        else if (route === 'escort') { plan.s0 = c.s - 30 - rng() * 10; plan.vs = c.speed + 2; l = side * rr([4, 8]); }
      }
      plan.l0 = latLim(l);
      if (beh.zone === 'ceiling' && route !== 'hold' && rng() < 0.5) plan.zone = 'mid'; // penguins also swoop past at eye level
    }
    // validate water column at the spawn point; shrink lateral offset if needed
    const reg = sys.env && sys.env.obstacles;
    // floor dwellers find a free spot locally (beside / on top of rocks); only mid-water groups are checked here
    const local = ['shoal', 'hover', 'rest', 'octo', 'colony', 'peek'].includes(plan.kind || beh.kind);
    const OFF = [[0, 0], [1.5, 0], [-1.5, 0], [0, 4], [3, 0], [-3, 0], [0, -4], [4.5, 3]];
    const l0 = plan.l0, s0 = plan.s0;
    for (let k = 0; k < OFF.length; k++) {
      plan.l0 = l0 + OFF[k][0]; plan.s0 = s0 + OFF[k][1];
      const x = sh.pathX(plan.s0) + plan.l0;
      const fl = sh.floorAt(x, plan.s0), ce = Math.min(sh.ceilingAt(x, plan.s0), -0.4);
      if (!(ce - fl > 1.2 + sp.size[1] * (sp.plan === 'jelly' ? 1 : 0.4))) continue;
      if (local || !reg || !reg.count) return plan;
      const y = Math.max(fl + 1, sh.pathY(plan.s0) + (plan.h0 || 0)), need = 0.6 + sp.size[1] * 0.4;
      let ok = true;
      for (const o of reg.query(x, plan.s0, need + 3, this._q || (this._q = []))) if (Obstacles.dist(o, x, y, plan.s0, null) < need) { ok = false; break; }
      if (ok) return plan;
    }
    return null;
  }
}
