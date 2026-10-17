// Encounter director: blended per-biome tables with rarity, cooldowns, novelty and budgets.
// Spawns ahead of the camera at the fog edge (or behind it, out of view, for overtakers).
import { mulberry32, hash2i } from '../noise.js';
import { speciesOf } from './species.js';

// [species key | 'proc:<kind>', weight, cooldown (s)]
// target = desired simultaneous encounters, lat = max lateral offset from the camera path.
export const TABLES = {
  reef: { cover: 3, target: 17, lat: 45, list: [
    ['chromis', 6, 25], ['anthias', 6, 25], ['bluetang', 4, 45], ['yellowtang', 4, 45], ['clownfish', 3, 60], ['butterfly', 4, 45],
    ['copperband', 2, 70], ['moorish', 3, 60], ['emperorAngel', 2, 90], ['queenAngel', 2, 90], ['parrotfish', 4, 45], ['lionfish', 2, 90],
    ['puffer', 2, 90], ['boxfish', 2, 100], ['coralGrouper', 2, 70], ['snapper', 3, 60], ['sweetlips', 2, 80], ['picasso', 2, 90],
    ['sergeant', 3, 60], ['napoleon', 1, 200], ['barracuda', 1.5, 150], ['jack', 1.2, 160], ['reefShark', 2, 100], ['whitetip', 1.5, 120],
    ['blacktip', 1.2, 140], ['eagleRay', 1.2, 150], ['bluespotRay', 1.5, 90], ['moray', 2, 60], ['spotMoray', 1.5, 80], ['gardenEel', 2, 90],
    ['splendidEel', 1, 120], ['greenTurtle', 1.8, 120], ['octopus', 1.2, 120], ['cuttlefish', 1.2, 120], ['reefSquid', 1, 120],
    ['manta', 0.7, 360], ['whaleShark', 0.45, 600], ['bottlenose', 0.4, 500], ['proc:reef', 7, 12],
  ] },
  kelp: { cover: 3, target: 12, lat: 40, list: [
    ['garibaldi', 5, 40], ['sheephead', 3, 60], ['kelpBass', 4, 45], ['blacksmith', 5, 40], ['senorita', 4, 45], ['opaleye', 3, 60],
    ['giantSeaBass', 1, 220], ['leopardShark', 1.5, 120], ['batRay', 1.5, 120], ['harbourSeal', 1.5, 150], ['seaLion', 1.8, 120],
    ['seaNettle', 2, 90], ['moonJelly', 1.5, 100], ['sardine', 1.2, 150], ['octopus', 1, 140], ['blueWhale', 0.25, 900], ['proc:kelp', 5, 15],
  ] },
  seagrass: { cover: 3, target: 10, lat: 45, list: [
    ['seahorse', 4, 45], ['pipefish', 3, 60], ['silverside', 5, 40], ['filefish', 3, 60], ['greenTurtle', 3, 80], ['cuttlefish', 2.5, 80],
    ['southernRay', 2.5, 80], ['bluespotRay', 1.5, 100], ['puffer', 2, 90], ['manatee', 0.8, 300], ['dugong', 0.6, 360],
    ['moonJelly', 1.5, 100], ['parrotfish', 1.5, 90], ['proc:seagrass', 5, 15],
    ['eagleRay', 1, 150], ['blacktip', 1, 140], ['snapper', 2, 80],
  ] },
  pelagic: { cover: 3, target: 11, lat: 90, list: [
    ['sardine', 4, 70], ['anchovy', 3, 70], ['yellowfin', 3, 80], ['bluefin', 1.5, 140], ['mahi', 2, 100], ['sailfish', 0.8, 240],
    ['oceanicWhitetip', 1.2, 160], ['blueShark', 2, 120], ['greatWhite', 0.5, 420], ['hammerhead', 0.8, 300], ['mola', 1.2, 220],
    ['manta', 0.8, 300], ['whaleShark', 0.7, 420], ['humpback', 0.9, 360], ['blueWhale', 0.5, 600], ['spermWhale', 0.5, 600],
    ['orca', 0.6, 500], ['commonDolphin', 1.6, 200], ['bottlenose', 1, 240], ['pilotWhale', 0.6, 400], ['moonJelly', 2, 90],
    ['pelagia', 1.5, 120], ['seaNettle', 1, 140], ['siphonophore', 0.6, 300], ['greenTurtle', 1, 160],
  ] },
  cave: { cover: 2.5, target: 7, lat: 4, list: [
    ['tarpon', 4, 50], ['sweeper', 5, 40], ['silverside', 4, 45], ['jack', 1, 150], ['moray', 1.5, 90], ['proc:cave', 3, 25],
    ['blenny', 1.5, 60], ['eelpout', 0.5, 120],
  ] },
  wreck: { cover: 3, target: 10, lat: 45, list: [
    ['barracuda', 3, 80], ['goliath', 2, 120], ['sweeper', 4, 50], ['batfish', 3, 70], ['sandTiger', 2, 120], ['moray', 2, 60],
    ['jack', 2, 100], ['snapper', 3, 60], ['eagleRay', 1.2, 150], ['greenTurtle', 1.2, 150], ['lionfish', 2, 90], ['reefShark', 1.5, 120],
    ['proc:wreck', 4, 15], ['manta', 0.4, 400],
  ] },
  ruins: { cover: 3, target: 13, lat: 40, list: [
    ['snapper', 3, 60], ['parrotfish', 3, 60], ['napoleon', 1.2, 200], ['coralGrouper', 2, 90], ['goliath', 1, 150], ['jack', 2, 100],
    ['barracuda', 2, 100], ['eagleRay', 1.5, 120], ['southernRay', 1.5, 100], ['octopus', 1.5, 100], ['greenTurtle', 1.5, 120],
    ['moray', 1.5, 80], ['bluetang', 2, 60], ['butterfly', 2, 60], ['moorish', 2, 70], ['chromis', 3, 40], ['anthias', 3, 40],
    ['proc:ruins', 6, 12], ['bottlenose', 0.4, 400], ['manta', 0.4, 400],
  ] },
  vents: { cover: 3, target: 9, lat: 30, list: [
    ['eelpout', 4, 40], ['rattail', 3, 60], ['anglerfish', 2.5, 90], ['chimaera', 2, 100], ['helmetJelly', 2, 90], ['atolla', 2, 90],
    ['viperfish', 1.5, 110], ['lanternfish', 2, 90], ['siphonophore', 0.8, 240], ['octopus', 0.8, 160], ['proc:vents', 2, 30],
  ] },
  tidepool: { cover: 2.5, target: 7, lat: 3, list: [
    ['sculpin', 4, 40], ['blenny', 4, 40], ['silverside', 4, 40], ['opaleye', 3, 60], ['garibaldi', 2, 80], ['octopus', 1, 150],
    ['proc:tidepool', 3, 25],
  ] },
  abyss: { cover: 3, target: 9, lat: 80, list: [
    ['lanternfish', 5, 50], ['hatchetfish', 4, 60], ['anglerfish', 2.5, 90], ['viperfish', 2.5, 90], ['dragonfish', 2, 100],
    ['atolla', 3, 70], ['combJelly', 3, 70], ['helmetJelly', 2.5, 80], ['pelagia', 2, 80], ['siphonophore', 1.5, 160],
    ['vampireSquid', 1.5, 140], ['giantSquid', 0.35, 700], ['spermWhale', 0.3, 700], ['proc:abyss', 2, 40],
  ] },
  polar: { cover: 3, target: 11, lat: 50, list: [
    ['emperorPenguin', 2.5, 90], ['adeliePenguin', 3, 70], ['leopardSeal', 1.5, 150], ['weddellSeal', 1.5, 150], ['krill', 3, 60],
    ['icefish', 3, 60], ['toothfish', 1.5, 120], ['orca', 0.6, 400], ['humpback', 0.5, 450],
    ['beluga', 2, 140], ['narwhal', 1.3, 200], ['arcticCod', 4, 50], ['harbourSeal', 1.5, 150], ['greenlandShark', 0.5, 450],
    ['lionsMane', 1.5, 140], ['moonJelly', 1.5, 100], ['combJelly', 1, 120],
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
    const cov = this.coverage(c), want = this.coverWant(c);
    // keep a pipeline of lead groups: one swimming ahead of the camera, the next one closing in
    let leads = 0;
    for (const e of sys.enc) if (!e.done && e.route === 'lead' && e.leadT > 4 && -(e.anchorZ + e.bounds.z) - c.s > -2) leads++;
    this.wantLead = leads < 2 && this.clock - (this.leadFail || -99) > 3;
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
      if (e.route === 'lead' && e.leadT > 0 && ahead > -2) { n++; continue; }
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
    const hemi = hash2i(region, 7, 3) < 0.5 ? 'N' : 'S';
    const cands = []; let tot = 0;
    const activeCount = new Map();
    for (const e of sys.enc) activeCount.set(e.sp.key, (activeCount.get(e.sp.key) || 0) + 1);
    const instBudget = sys.maxInstances - sys.instances;
    const triBudget = sys.maxTris - sys.trisTotal;
    const addCand = (key, w, cd, bw, small) => {
      let k = key;
      if (key.startsWith('proc:')) k = `${key}:${(region % 100000) * 16 + Math.floor(rng() * 6)}`;
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
      if (lead && (rd < 7 || ['shoal', 'hover', 'drift', 'colony', 'peek', 'octo', 'mill'].includes(sp.beh.kind) && !(sp.beh.kind === 'shoal' && rd >= 7))) return;
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
    this.cool.set(pick.ck, this.clock + pick.cd * (0.7 + 0.6 * rng()));
    this.seen.set(pick.ck, this.clock);
    if (pick.sp.hl) this.hlTimer = 70 + rng() * 90;
    return enc;
  }

  plan(sp, c, near, ws, instBudget, triBudget, prime, lead = false) {
    const sys = this.sys, sh = sys.shape, rng = this.rng, beh = sp.beh;
    let lat = 0; for (const e of ws) lat += (TABLES[e.key]?.lat ?? 40) * e.w;
    const fogD = sys.fogD;
    const rr = (a) => a[0] + (a[1] - a[0]) * rng();
    // spawn distance: fog edge normally; closer (with a dithered fade-in) when coverage is short
    const D = prime ? rr([10, fogD * 0.75]) : near ? rr([fogD * 0.45, fogD * 0.7]) : fogD * rr([0.75, 0.95]);
    let n = Math.round(beh.n[0] + (beh.n[1] - beh.n[0]) * rng());
    n = Math.max(1, Math.min(n, instBudget));
    const tris = sys.cache.map.get(sp.key)?.tris ?? 1500;
    while (n > 1 && n * tris > triBudget) n = Math.floor(n * 0.7);
    if (n * tris > triBudget && n === 1 && tris > triBudget) return null;
    const side = rng() < 0.5 ? -1 : 1;
    const plan = { n, seed: (rng() * 4294967296) >>> 0, variant: (this.region(c.s + D) ^ hash2i(sp.key.length, 3, 9) * 1e9) >>> 0, fadeIn: near || prime, latMax: lat, s0: c.s + D, l0: 0 };
    const speed = beh.speed ? rr(beh.speed) : 0.5;
    const latLim = (x) => Math.max(-lat, Math.min(lat, x));
    // Readable lateral offset: when a group leaves the frame while being passed it should still project
    // to >= ~25 px at 720p (K ~ 600 px/rad): lateral <= size * 16; schools read at about size * 40.
    const sz = (sp.size[0] + sp.size[1]) * 0.5, big = sz > 4;
    const readLat = Math.min(lat, Math.max(1.5, sz * (n >= 20 ? 40 : 16)));
    plan.readLat = readLat;
    const midH = () => (big ? rr([-8, 1]) : rr([-2.5, 1.5]));
    const altUp = () => (beh.alt ? beh.alt[0] + (beh.alt[1] - beh.alt[0]) * (0.4 + 0.6 * rng()) : 1.5); // bias toward eye level
    let kind = beh.kind;
    // medium-size shoaling fish sometimes travel as a group that leads the camera
    if (kind === 'shoal' && sz * (n >= 20 ? 75 : 24) >= 7 && (lead || rng() < 0.65)) { kind = 'school'; plan.kind = 'school'; }
    if (kind === 'shoal' || kind === 'hover' || kind === 'colony' || kind === 'peek' || kind === 'octo') {
      const lo = kind === 'colony' || kind === 'peek' ? 1.8 : 1.0;
      plan.l0 = latLim(side * (lo + rng() * Math.max(0.5, readLat - lo)));
      plan.h0 = rr([-2.5, 1.5]);
      plan.alt = altUp();
    } else if (kind === 'drift') {
      plan.l0 = latLim(side * rng() * Math.min(8, readLat + 4));
      plan.h0 = rr([-3, 2]);
    } else {
      const routes = { ...(beh.routes || { hold: 1 }) };
      if (beh.speed && beh.speed[1] >= 1.2 && kind !== 'bait' && kind !== 'mill') routes.pace = (routes.pace || 0) + 1;
      // readable distance: ~25 px for a single animal, ~8 px each for a school of 20+
      const readDist = sz * (n >= 20 ? 75 : 24);
      if (readDist >= 7) routes.lead = (routes.lead || 0) + 4;
      let route = kind === 'mill' ? 'hold' : kind === 'bait' || (lead && readDist >= 7) ? 'lead' : pickW(rng, routes);
      if (route === 'lead') {
        const R = kind === 'bait' ? sz * 2.0 * Math.cbrt(n) * 0.75 : 0;
        const A = big ? rr([25, 40]) : kind === 'bait' ? R + rr([2.5, 4]) : Math.max(7, Math.min(28, readDist * rr([0.55, 0.8])));
        plan.leadA = A; plan.leadT = kind === 'bait' ? rr([8, 16]) : rr([12, 35]);
        const maxSwim = Math.max((beh.speed?.[1] ?? 1) * 2.2, sz >= 0.35 ? 4.2 : 2.6);
        const fromBehind = !prime && (beh.speed?.[1] ?? 0) * 1.5 > c.speed + 1 && rng() < 0.5;
        plan.s0 = fromBehind ? c.s - rr([15, 30]) : c.s + A + (prime ? rr([0, 10]) : rr([5, 15]));
        plan.fadeIn = !fromBehind;
        plan.vs = fromBehind ? c.speed + 1.5 : c.speed * 0.6;
        const l = side * (kind === 'bait' ? rr([0, R * 0.5]) : big ? rr([A * 0.3, A * 0.55]) : rr([Math.max(1.5, A * 0.2), Math.max(2, A * 0.45)])); // three-quarter views
        plan.l0 = latLim(l); plan.route = route; plan.speed = speed; plan.wobble = Math.min(2, 0.3 + A * 0.05);
        plan.h0 = big ? rr([-6, 0]) : rr([-1.5, 1]);
        if (beh.zone === 'floor') plan.zone = 'mid'; // swim at eye level while leading
        plan.alt = altUp();
      }
      if (route === 'lead') {
        // planned above
      } else {
      if ((route === 'overtake' || route === 'escort') && (beh.speed[1] * 1.7 < c.speed + 1 || near || prime)) route = 'pace';
      let l = side * (big ? rr([25, 45]) : rng() * readLat * 0.9 + Math.min(1.5, readLat * 0.3));
      if (kind === 'bait' || kind === 'mill') {
        const R = sz * (kind === 'bait' ? 2.0 : 1.9) * Math.cbrt(n) * 0.8;
        l = side * (R + rr([1, 5]));
        plan.vs = kind === 'bait' ? Math.min(c.speed * 0.45, 1.2) : 0.2;
        plan.wobble = 1;
      } else if (route === 'hold') {
        plan.vs = speed * (rng() - 0.5) * 0.6; plan.wobble = Math.min(3, 0.5 + readLat * 0.3);
      } else if (route === 'pace') { // swim forward ahead of the camera so it catches up slowly
        plan.vs = Math.min(c.speed * rr([0.45, 0.8]), (beh.speed?.[1] ?? 1) * 1.8); plan.wobble = Math.min(3, 0.5 + readLat * 0.2);
      } else if (route === 'cross') { // cross the path 15-40 m ahead of the camera
        const vl = Math.max(0.3, speed * 0.9);
        const L = Math.min(lat, big ? 40 : Math.max(readLat * 1.5, Math.min(vl * 6, 25)));
        const T = L / vl;
        plan.s0 = c.s + c.speed * T + rr([15, 40]);
        l = -side * L; plan.vl = side * vl; plan.vs = speed * (rng() - 0.5) * 0.3; plan.wobble = 1;
        if (plan.s0 - c.s > fogD * 1.6) { route = 'oncoming'; plan.s0 = c.s + D; l = side * Math.abs(l) * 0.5; plan.vl = 0; }
      }
      if (route === 'oncoming') { plan.vs = -speed; plan.wobble = 1 + rng() * 2; }
      else if (route === 'along') { plan.vs = speed; plan.wobble = 1 + rng() * 2; }
      else if (route === 'overtake') { plan.s0 = c.s - 30 - rng() * 15; plan.vs = c.speed + 1.5 + rng() * 1.5; plan.wobble = 1; }
      else if (route === 'escort') { plan.s0 = c.s - 30 - rng() * 10; plan.vs = c.speed + 2; l = side * rr([5, 10]); plan.wobble = 1; }
      plan.l0 = latLim(l);
      plan.route = route;
      plan.speed = speed;
      plan.h0 = midH();
      plan.alt = altUp();
      }
    }
    // validate water column at the spawn point; shrink lateral offset if needed
    for (let k = 0; k < 4; k++) {
      const x = sh.pathX(plan.s0) + plan.l0;
      const fl = sh.floorAt(x, plan.s0), ce = Math.min(sh.ceilingAt(x, plan.s0), -0.4);
      if (ce - fl > 1.2 + sp.size[1] * (sp.plan === 'jelly' ? 1 : 0.4)) return plan;
      plan.l0 *= 0.45;
    }
    return null;
  }
}
