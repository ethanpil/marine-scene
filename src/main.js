// Endless Ocean — entry point: renderer, floating origin, biome blending, conditions, frame loop.
import * as THREE from 'three';
import { U, Caustics, makeNoiseTexture } from './water.js';
import { BIOMES, BIOME_KEYS, BiomeSequence, WorldShape, sv } from './biomes.js';
import { Terrain } from './terrain.js';
import { Background, Surface, MarineSnow } from './env.js';
import { Post } from './post.js';
import { registerProps } from './props/index.js';
import { registerNewBiomeProps } from './props/newbiomes.js';
import { Creatures } from './creatures/index.js';
import { noise1, mulberry32 } from './noise.js';
import { obstacles } from './obstacles.js';
import { Labels } from './labels.js';
import { Conditions } from './conditions.js';
import { CameraDirector } from './camera.js';

const qs = new URLSearchParams(location.search);
const SEED = qs.has('seed') ? parseInt(qs.get('seed'), 10) : (Math.random() * 1e9) | 0;
let speed = qs.has('speed') ? parseFloat(qs.get('speed')) : 3.2;
const QUALITY = qs.get('quality') || 'auto'; // auto | low | high
const FPS_CAP = qs.has('fps') ? Math.max(0, parseFloat(qs.get('fps'))) : 60; // 0 = uncapped

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
// GPU tier: integrated / mobile GPUs get a cheaper pipeline by default.
const gpuName = (() => {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
})();
const weakGPU = /Intel\(R\) (HD|UHD)|Intel HD|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Apple GPU/i.test(gpuName) || /Android|iPhone|iPad/i.test(navigator.userAgent);
const tier = QUALITY === 'auto' ? (weakGPU ? 'low' : 'high') : QUALITY;
const maxDPR = tier === 'high' ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 1);
let resScale = tier === 'low' ? 0.8 : 1;
renderer.setPixelRatio(maxDPR * resScale);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
renderer.info.autoReset = false;

const SHADOWS = tier === 'high' && qs.get('shadows') !== '0';
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1400);
scene.add(camera);
const world = new THREE.Group();   // everything at global coordinates lives here
scene.add(world);

U.uNoiseTex.value = makeNoiseTexture(256);
const caustics = new Caustics(tier === 'low' ? 256 : 512);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
const hemi = new THREE.HemisphereLight(0x88ccff, 0x0a2030, 1.0);
scene.add(sun, sun.target, hemi);
if (SHADOWS) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.intensity = 0.8;
}

// Every load starts somewhere new: a seed-derived zone and a point far along the endless path
// (path/terrain noise is a function of distance, so this randomises their shape too).
const startRng = mulberry32(SEED ^ 0x51ed270b);
const START_KEY = qs.get('biome') || BIOME_KEYS[Math.floor(startRng() * BIOME_KEYS.length)];
const START_S = Math.floor(startRng() * 1e6);
const seq = new BiomeSequence(SEED, START_KEY, START_S);
const shape = new WorldShape(seq);
const terrain = new Terrain(world, shape, seq, tier);
terrain.shadows = SHADOWS;
const env = {
  shape, seq, world, scene, camera, renderer, U, BIOMES, seed: SEED, shadows: SHADOWS, obstacles, tier,
  // points of interest registered by props (set pieces): query(s0, s1, outArray) -> [{type, x, y, s, r, data}]
  pois: { query: (s0, s1, out = []) => terrain.queryPOIs(s0, s1, out) },
};
registerProps(terrain, env);
registerNewBiomeProps(terrain, env);
const creatures = new Creatures(world, env);
const labels = new Labels();
labels.add((out) => terrain.labels(out));
labels.add((out) => { if (creatures.labels) creatures.labels(out); });

const conditions = new Conditions(SEED, { time: qs.get('time'), weather: qs.get('weather'), dayMinutes: parseFloat(qs.get('day')) || 60 });
const director = new CameraDirector(camera, shape);

const background = new Background(); scene.add(background.mesh);
const surface = new Surface(); scene.add(surface.mesh);
const snow = new MarineSnow(); scene.add(snow.mesh);
const post = new Post(renderer, scene, camera, tier === 'low'
  ? { msaa: 0, shaftDiv: 4, shaftSteps: 16, ao: false, fxaa: true }
  : { msaa: 4, shaftDiv: 2, shaftSteps: 24, ao: true, fxaa: false });
window.__ocean = { scene, camera, terrain, shape, seq, creatures, post, U, obstacles, labels, conditions, director, renderer, tier };

// ---------- blended environment parameters ----------
const P = { sigma: [0, 0, 0], lightSigma: [0, 0, 0], deep: [0, 0, 0], up: [0, 0, 0], sun: 0, caustic: 0, shafts: 0, ambient: 0, glow: 0, snow: 0, cave: 0 };
function blendParams(s) {
  for (const k of ['sigma', 'lightSigma', 'deep', 'up']) P[k].fill(0);
  P.sun = P.caustic = P.shafts = P.ambient = P.glow = P.snow = P.cave = 0;
  for (const e of seq.weights(s)) {
    const b = BIOMES[e.key];
    // every segment has its own water: clarity and a slight green/blue shift
    const clar = 0.85 + 0.3 * sv(e.g, 10), hue = sv(e.g, 11) - 0.5;
    for (let i = 0; i < 3; i++) {
      P.sigma[i] += b.sigma[i] * clar * e.w;
      P.lightSigma[i] += b.lightSigma[i] * e.w;
      const ht = i === 1 ? 1 + 0.28 * hue : i === 2 ? 1 - 0.14 * hue : 1;
      P.deep[i] += b.deep[i] * ht * e.w;
      P.up[i] += b.up[i] * ht * e.w;
    }
    for (const k of ['sun', 'caustic', 'shafts', 'ambient', 'glow', 'snow']) P[k] += b[k] * e.w;
    if (e.key === 'cave') P.cave += e.w;
  }
  // drifting turbidity: patches of clearer and murkier water as we travel
  const turb = 1 + 0.16 * noise1(s / 240, 31);
  for (let i = 0; i < 3; i++) P.sigma[i] *= turb;
  return P;
}

// ---------- floating origin ----------
let Oz = 0; // render z = global z - Oz ; Oz is a multiple of 1024 so tiled patterns stay seamless
function rebase(globalZ) {
  const want = Math.ceil(globalZ / 1024) * 1024; // globalZ is negative; keep render z in (-1024, 0]
  if (want !== Oz) { Oz = want; world.position.z = -Oz; }
}

// ---------- camera ----------
let s = START_S + (qs.has('start') ? parseFloat(qs.get('start')) : 0);
const camState = { s: 0, x: 0, y: 0, z: 0, forward: new THREE.Vector3(), camera, Oz: 0 };
const subjectsFn = (out) => { if (creatures.subjects) creatures.subjects(out); };
const poisFn = (s0, s1, out) => terrain.queryPOIs(s0, s1, out);
function placeCamera(dt, time, C) {
  rebase(-s);
  const r = director.update(dt, time, s, Oz, Math.max(0.005, U.uSigma.value.y), C.surge, subjectsFn, poisFn);
  camState.s = s; camState.x = r.x; camState.y = r.y; camState.z = r.gz; camState.Oz = Oz;
  camera.getWorldDirection(camState.forward);
}

// ---------- captions ----------
const captionEl = document.getElementById('caption');
let showCaptions = qs.get('captions') !== '0', lastSegId = -1, captionTimer = 0;
const SUBTITLES = {
  reef: 'shallow tropical reef', kelp: 'temperate forest of giant kelp', seagrass: 'sunlit meadow',
  pelagic: 'the blue — open water', sandflat: 'rippled plains of rays and garden eels', cave: 'flooded limestone passages', wreck: 'graveyard of ships',
  ruins: 'a drowned civilisation', vents: 'black smokers of the deep', tidepool: 'where the sea meets the shore',
  abyss: 'the midnight zone', polar: 'beneath the sea ice',
  softcoral: 'a garden of soft corals', wall: 'along the edge of the abyss', mangrove: 'a nursery among the roots',
  deepplain: 'the abyssal plain, lit only by our lamps',
};
function updateCaption(dt, C) {
  const g = seq.segs[seq.segAt(s + 40)];
  if (g.id !== lastSegId) {
    lastSegId = g.id; captionTimer = 0;
    const extra = [C.timeLabel, C.weatherLabel].filter(Boolean).join(' · ');
    captionEl.innerHTML = `${BIOMES[g.key].label}<small>${SUBTITLES[g.key] || ''}${extra ? ' · ' + extra : ''}</small>`;
  }
  captionTimer += dt;
  captionEl.style.opacity = showCaptions && captionTimer > 2 && captionTimer < 9 ? '0.85' : '0';
}

// ---------- narrative notes: small moments worth naming ----------
const noteEl = document.getElementById('note');
let noteTimer = 0, lastTime = '', lastWeather = null, lastSpawn = 0, lastNight = 0;
const TIME_NOTES = { dawn: 'dawn — light returns to the water', dusk: 'dusk — the light turns gold, then blue',
  night: 'night falls — nocturnal life awakens' };
function note(text) { if (!showCaptions) return; noteEl.textContent = text; noteTimer = 8; }
function updateNotes(dt, C, spawn) {
  if (C.timeLabel !== lastTime) { if (lastTime && TIME_NOTES[C.timeLabel]) note(TIME_NOTES[C.timeLabel]); lastTime = C.timeLabel; }
  const w = C.weatherLabel;
  if (lastWeather !== null && w !== lastWeather && w) note(w);
  lastWeather = w;
  if (spawn > 0.3 && lastSpawn <= 0.3) note('the corals are spawning — a few nights each year');
  lastSpawn = spawn;
  noteTimer -= dt;
  noteEl.style.opacity = noteTimer > 0 && noteTimer < 7 && showCaptions ? '0.8' : '0';
}

// ---------- controls ----------
let paused = false, statsOn = false;
const statsEl = document.getElementById('stats'), helpEl = document.getElementById('help');
let helpTimer = 0;
addEventListener('keydown', (e) => {
  helpTimer = 4;
  const k = e.key.toLowerCase();
  if (k === 'h') showCaptions = !showCaptions;
  else if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if (k === 's') { statsOn = !statsOn; statsEl.style.display = statsOn ? 'block' : 'none'; }
  else if (e.key === ' ') paused = !paused;
  else if (k === 'i') labels.toggle();
  else if (k === 't') conditions.skipTime(1 / 8);
  else if (k === 'w') conditions.nextWeather();
  else if (e.key === 'ArrowRight') speed = Math.min(40, speed * 1.4);
  else if (e.key === 'ArrowLeft') speed = Math.max(0.5, speed / 1.4);
  else if (k === 'n') { const g = seq.segs[seq.segAt(s)]; s = g.end - 60; terrain.prime(s); }
});
addEventListener('mousemove', () => { helpTimer = 3; document.body.style.cursor = 'default'; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); post.setSize();
});

// ---------- per-frame environment ----------
let envSpawn = 0;
function updateEnvironment(C) {
  const p = blendParams(s + 10);
  const depth = Math.max(0, -camera.position.y);
  U.uSigma.value.set(p.sigma[0] * C.sigmaMul[0], p.sigma[1] * C.sigmaMul[1], p.sigma[2] * C.sigmaMul[2]);
  U.uLightSigma.value.set(p.lightSigma[0] * C.sigmaMul[0], p.lightSigma[1] * C.sigmaMul[1], p.lightSigma[2] * C.sigmaMul[2]);
  // the water's own colour follows the light that reaches it (time of day, weather, plankton)
  const lightLevel = 0.06 + 0.94 * Math.min(1, C.sunMul + 0.25 * C.ambientMul);
  U.uWaterDeep.value.setRGB(p.deep[0] * C.tint[0] * lightLevel, p.deep[1] * C.tint[1] * lightLevel, p.deep[2] * C.tint[2] * lightLevel);
  U.uWaterUp.value.setRGB(p.up[0] * C.tint[0] * lightLevel, p.up[1] * C.tint[1] * lightLevel, p.up[2] * C.tint[2] * lightLevel);
  // sun (or moon) direction underwater: refraction keeps it within ~48 degrees of vertical
  const elevAir = C.night > 0.5 ? 0.9 : Math.max(0.06, C.elevAir);
  const sinW = Math.cos(elevAir) / 1.333, elevW = Math.PI / 2 - Math.asin(sinW);
  U.uSunDir.value.set(Math.cos(C.azimuth) * Math.cos(elevW), Math.sin(elevW), Math.sin(C.azimuth) * Math.cos(elevW)).normalize();
  U.uSunColor.value.setRGB(C.sunColor[0], C.sunColor[1], C.sunColor[2]);
  U.uSunScatter.value = p.sun * C.sunMul;
  U.uCausticStr.value = p.caustic * C.causticMul;
  U.uAmbientScale.value = p.ambient * C.ambientMul;
  U.uGlow.value = Math.min(1, p.glow + C.glowAdd);
  U.uNight.value = C.night;
  U.uRain.value = C.rain;
  U.uSurge.value = C.surge;
  const deepDark = Math.min(1, Math.max(0, (0.45 - p.sun) / 0.37));
  U.uLamp.value = Math.max(deepDark, p.cave * 0.55, C.lampAdd);
  sun.color.setRGB(C.sunColor[0], C.sunColor[1], C.sunColor[2]);
  sun.intensity = 3.0 * p.sun * C.sunMul;
  placeSun();
  hemi.color.setRGB(p.up[0] * C.tint[0], p.up[1] * C.tint[1], p.up[2] * C.tint[2]).multiplyScalar(1.6);
  hemi.groundColor.setRGB(...p.deep).multiplyScalar(0.5);
  hemi.intensity = 0.7 * p.ambient * C.ambientMul;
  U.uCamPos.value.copy(camera.position);
  { // approximate lit seabed colour for the surface's mirror reflection
    let r = 0, g = 0, b = 0;
    for (const e of seq.weights(s)) { const c = BIOMES[e.key].sand; r += c[0] * e.w; g += c[1] * e.w; b += c[2] * e.w; }
    const l = p.sun * C.sunMul * 0.9, ls = U.uLightSigma.value;
    U.uFloorCol.value.setRGB(r * l * Math.exp(-ls.x * depth * 2), g * l * Math.exp(-ls.y * depth * 2), b * l * Math.exp(-ls.z * depth * 2));
  }
  const sg = U.uSigma.value.y;
  post.params.shafts = p.shafts * p.sun * C.sunMul * C.shaftMul;
  post.params.softStart = 0.45 / sg;
  post.params.softEnd = 2.8 / sg;
  post.params.depth = depth;
  post.params.exposure = 1 + 1.4 * p.glow + 0.4 * (1 - Math.min(1, p.sun)) + C.exposureAdd;
  post.params.focus = director.focus.x;
  post.params.night = C.night;
  // some nights on the reef the corals spawn: bundles of eggs drift up toward the moon
  const dayIndex = Math.floor(conditions.t / conditions.cycle);
  const spawnNight = ((dayIndex * 2654435761) >>> 0) % 100 < 40 ? 1 : 0;
  const reefy = seq.weightOf(s + 10, 'reef') + seq.weightOf(s + 10, 'softcoral');
  const spawn = spawnNight * reefy * C.night * (conditions.phase < 0.9 ? 1 : 0);
  snow.setDensity(Math.min(2.5, p.snow * C.snowMul), U.uGlow.value, spawn, speed * director.speedMul.x);
  envSpawn = spawn;
  post.params.aperture = 1.6 + 0.8 * C.night;
}

// Shadow frustum follows the camera (centred ~32 m ahead), snapped to shadow texels to avoid shimmer.
const sunU = new THREE.Vector3(), sunV = new THREE.Vector3(), sunC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function placeSun() {
  const L = U.uSunDir.value;
  sunC.copy(camera.position).addScaledVector(camState.forward, 32);
  if (SHADOWS) {
    const texel = 96 / 2048;
    sunU.crossVectors(L, UP).normalize(); sunV.crossVectors(sunU, L);
    const cu = Math.round(sunC.dot(sunU) / texel) * texel, cv = Math.round(sunC.dot(sunV) / texel) * texel, cl = sunC.dot(L);
    sunC.copy(sunU).multiplyScalar(cu).addScaledVector(sunV, cv).addScaledVector(L, cl);
  }
  sun.target.position.copy(sunC);
  sun.position.copy(sunC).addScaledVector(L, 130);
  sun.target.updateMatrixWorld();
}

// ---------- adaptive resolution (aware of the frame cap) ----------
let frameAvg = 16, adaptTimer = 0, adaptOn = QUALITY === 'auto';
function adapt(dt) {
  if (!adaptOn || document.hidden) return;
  frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
  adaptTimer += dt;
  if (adaptTimer < 2) return;
  adaptTimer = 0;
  const target = FPS_CAP > 0 ? Math.max(1000 / FPS_CAP, 16.6) : 16.6;
  let ns = resScale;
  if (frameAvg > target * 1.2) ns = Math.max(0.5, resScale - 0.08);
  else if (frameAvg < target * 1.04) ns = Math.min(1, resScale + 0.04);
  if (ns !== resScale) { resScale = ns; renderer.setPixelRatio(maxDPR * resScale); post.setSize(); }
}

// ---------- boot ----------
let C = conditions.update(0);
blendParams(s);
placeCamera(0, 0, C);
terrain.prime(s);
const clock = new THREE.Clock();
let time = 0, simTime = 0, lastFrame = 0, causticFrame = 0;
setTimeout(() => { document.getElementById('loader').style.opacity = 0; }, 900);
setTimeout(() => document.getElementById('loader').remove(), 3600);

function frame(now) {
  requestAnimationFrame(frame);
  // frame cap: a calm 60 fps is plenty for a slow glide and halves the work on 120/144 Hz screens
  if (FPS_CAP > 0 && now - lastFrame < 1000 / FPS_CAP - 1.5) return;
  lastFrame = now;
  tick(Math.min(clock.getDelta(), 0.1), true);
}
// Debug: advance the simulation without rAF (hidden tabs throttle it).
window.__ocean.advance = (seconds, step = 1 / 30) => {
  for (let t = 0; t < seconds; t += step) tick(step, t + step * 12 >= seconds);
};
// Debug: GPU benchmark at a fixed size (ms per rendered frame, synchronous).
window.__ocean.bench = (w = 1280, h = 720, n = 20) => {
  adaptOn = false; renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix(); post.setSize();
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const run = (k) => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now();
    for (let i = 0; i < k; i++) { renderer.info.reset(); post.render(time); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t0) / k; };
  run(3);
  return { ms: +run(n).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
};
function tick(dt, draw) {
  renderer.info.reset();
  C = conditions.update(paused ? 0 : dt);
  if (!paused) {
    simTime += dt;
    const v = speed * (1 + 0.12 * noise1(simTime / 40, 77)) * director.speedMul.x;
    s += v * dt;
  }
  time = simTime % 4096; // shader time wraps to keep float precision
  U.uTime.value = time;
  placeCamera(paused ? 0 : dt, simTime, C);
  terrain.update(s, 4, Math.min(330, Math.max(90, 4.5 / Math.min(U.uSigma.value.y, U.uSigma.value.z))));
  terrain.sky.syncUniforms(Oz);
  updateEnvironment(C);
  // the caustic pattern moves slowly: weak GPUs refresh it at half rate
  if (tier !== 'low' || (causticFrame++ & 1) === 0) caustics.update(renderer, time);
  background.update(camera);
  surface.update(camera, paused ? 0 : dt, camera.position.y > -16 && !shape.hasCeiling(s + 30) && C.night < 0.6, Oz);
  snow.update(camera, dt, renderer);
  creatures.update(paused ? 0 : dt, time, camState);
  updateCaption(dt, C);
  updateNotes(dt, C, envSpawn);
  labels.focus = director.hasSubject ? director.focusPos : null;
  labels.update(dt, camera, Oz);
  helpTimer -= dt; helpEl.style.opacity = helpTimer > 0 ? '0.7' : '0';
  if (helpTimer < 0) document.body.style.cursor = 'none';
  if (!draw) return;
  post.render(time);
  adapt(dt);
  if (statsOn) {
    const i = renderer.info;
    statsEl.textContent = `fps ${(1000 / frameAvg).toFixed(0)}  res ${resScale.toFixed(2)}  cap ${FPS_CAP || 'off'}\n` +
      `calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k\n` +
      `s ${s.toFixed(0)} m  depth ${(-camera.position.y).toFixed(1)} m  ${C.timeLabel} ${C.weatherLabel}\n` +
      seq.weights(s).map((e) => `${e.key} ${e.w.toFixed(2)}`).join('  ') +
      `\ngeo ${i.memory.geometries} tex ${i.memory.textures}  seed ${SEED}  ${tier}`;
  }
}
requestAnimationFrame(frame);
