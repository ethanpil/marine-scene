// Endless Ocean — entry point: renderer, floating origin, camera path, biome blending, frame loop.
import * as THREE from 'three';
import { U, Caustics, makeNoiseTexture } from './water.js';
import { BIOMES, BIOME_KEYS, BiomeSequence, WorldShape } from './biomes.js';
import { Terrain } from './terrain.js';
import { Background, Surface, MarineSnow } from './env.js';
import { Post } from './post.js';
import { registerProps } from './props/index.js';
import { Creatures } from './creatures/index.js';
import { noise1, smoothstep, mulberry32 } from './noise.js';
import { obstacles } from './obstacles.js';
import { Labels } from './labels.js';

const qs = new URLSearchParams(location.search);
const SEED = qs.has('seed') ? parseInt(qs.get('seed'), 10) : (Math.random() * 1e9) | 0;
let speed = qs.has('speed') ? parseFloat(qs.get('speed')) : 3.2;
const QUALITY = qs.get('quality') || 'auto'; // auto | low | high

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
const caustics = new Caustics(512);

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
const terrain = new Terrain(world, shape, seq);
terrain.shadows = SHADOWS;
const env = { shape, seq, world, scene, camera, renderer, U, BIOMES, seed: SEED, shadows: SHADOWS, obstacles };
registerProps(terrain, env);
const creatures = new Creatures(world, env);
const labels = new Labels();
labels.add((out) => terrain.labels(out));
labels.add((out) => { if (creatures.labels) creatures.labels(out); });

const background = new Background(); scene.add(background.mesh);
const surface = new Surface(); scene.add(surface.mesh);
const snow = new MarineSnow(); scene.add(snow.mesh);
const post = new Post(renderer, scene, camera, tier === 'low' ? { msaa: 0, shaftDiv: 4, shaftSteps: 16 } : { msaa: 4, shaftDiv: 2, shaftSteps: 24 });
window.__ocean = { scene, camera, terrain, shape, seq, creatures, post, U, obstacles, labels };

// ---------- blended environment parameters ----------
const P = { sigma: [0, 0, 0], lightSigma: [0, 0, 0], deep: [0, 0, 0], up: [0, 0, 0], sun: 0, caustic: 0, shafts: 0, ambient: 0, glow: 0, snow: 0 };
function blendParams(s) {
  for (const k of ['sigma', 'lightSigma', 'deep', 'up']) P[k].fill(0);
  P.sun = P.caustic = P.shafts = P.ambient = P.glow = P.snow = 0;
  for (const e of seq.weights(s)) {
    const b = BIOMES[e.key];
    for (const k of ['sigma', 'lightSigma', 'deep', 'up']) for (let i = 0; i < 3; i++) P[k][i] += b[k][i] * e.w;
    for (const k of ['sun', 'caustic', 'shafts', 'ambient', 'glow', 'snow']) P[k] += b[k] * e.w;
  }
  return P;
}

// ---------- floating origin ----------
let Oz = 0; // render z = global z - Oz ; Oz is a multiple of 1024 so tiled patterns stay seamless
function rebase(globalZ) {
  const want = Math.ceil(globalZ / 1024) * 1024; // globalZ is negative; keep render z in (-1024, 0]
  if (want !== Oz) { Oz = want; world.position.z = -Oz; }
}

// ---------- camera path ----------
let s = START_S + (qs.has('start') ? parseFloat(qs.get('start')) : 0);
const camState = { s: 0, x: 0, y: 0, z: 0, forward: new THREE.Vector3(), camera, Oz: 0 };
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function placeCamera(time) {
  const x = shape.pathX(s), y = shape.pathY(s);
  const la = 16;
  const tx = shape.pathX(s + la), ty = shape.pathY(s + la);
  // gentle wandering gaze so the viewer "looks around"
  const yaw = 0.22 * noise1(time / 23, 901) + 0.08 * noise1(time / 7.3, 902);
  const pitch = 0.08 * noise1(time / 17, 903) - 0.03;
  const gz = -(s);
  rebase(gz);
  camera.position.set(x, y + 0.25 * Math.sin(time * 0.35), gz - Oz);
  const dir = tmpA.set(tx - x, ty - y, -la).normalize();
  // apply yaw/pitch
  dir.applyAxisAngle(tmpB.set(0, 1, 0), yaw);
  dir.y += pitch; dir.normalize();
  camera.lookAt(camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z);
  // bank into turns
  const curv = shape.pathX(s + la) - 2 * x + shape.pathX(s - la);
  camera.rotateZ(THREE.MathUtils.clamp(curv * 0.012, -0.08, 0.08));
  camState.s = s; camState.x = x; camState.y = camera.position.y; camState.z = gz; camState.Oz = Oz;
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
};
function updateCaption(dt) {
  const g = seq.segs[seq.segAt(s + 40)];
  if (g.id !== lastSegId) {
    lastSegId = g.id; captionTimer = 0;
    captionEl.innerHTML = `${BIOMES[g.key].label}<small>${SUBTITLES[g.key] || ''}</small>`;
  }
  captionTimer += dt;
  captionEl.style.opacity = showCaptions && captionTimer > 2 && captionTimer < 9 ? '0.85' : '0';
}

// ---------- controls ----------
let paused = false, statsOn = false;
const statsEl = document.getElementById('stats'), helpEl = document.getElementById('help');
let helpTimer = 0;
addEventListener('keydown', (e) => {
  helpTimer = 4;
  if (e.key === 'h' || e.key === 'H') showCaptions = !showCaptions;
  else if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if (e.key === 's' || e.key === 'S') { statsOn = !statsOn; statsEl.style.display = statsOn ? 'block' : 'none'; }
  else if (e.key === ' ') paused = !paused;
  else if (e.key === 'i' || e.key === 'I') labels.toggle();
  else if (e.key === 'ArrowRight') speed = Math.min(40, speed * 1.4);
  else if (e.key === 'ArrowLeft') speed = Math.max(0.5, speed / 1.4);
  else if (e.key === 'n' || e.key === 'N') { const g = seq.segs[seq.segAt(s)]; s = g.end - 60; terrain.prime(s); }
});
addEventListener('mousemove', () => { helpTimer = 3; document.body.style.cursor = 'default'; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); post.setSize();
});

// ---------- per-frame environment ----------
const sunCol = new THREE.Color(), warm = new THREE.Color(1.0, 0.72, 0.45), white = new THREE.Color(1, 0.98, 0.93);
function updateEnvironment(time) {
  const p = blendParams(s + 10);
  const depth = Math.max(0, -camera.position.y);
  U.uSigma.value.set(...p.sigma);
  U.uLightSigma.value.set(...p.lightSigma);
  U.uWaterDeep.value.setRGB(...p.deep);
  U.uWaterUp.value.setRGB(...p.up);
  // slow day cycle: sun elevation & warmth drift over ~40 minutes
  const day = 0.5 + 0.5 * Math.sin(time / 2400 * Math.PI * 2);
  const elev = THREE.MathUtils.lerp(0.62, 1.32, day);
  const az = time / 3000 * Math.PI * 2;
  U.uSunDir.value.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
  sunCol.copy(white).lerp(warm, smoothstep(0.45, 0.0, day) * 0.55);
  U.uSunColor.value.copy(sunCol);
  U.uSunScatter.value = p.sun * (0.8 + 0.2 * day);
  U.uCausticStr.value = p.caustic;
  U.uAmbientScale.value = p.ambient;
  U.uGlow.value = p.glow;
  U.uLamp.value = Math.max(smoothstep(0.45, 0.08, p.sun), seq.weightOf(s + 10, 'cave') * 0.55);
  sun.color.copy(sunCol); sun.intensity = 3.0 * p.sun;
  placeSun();
  hemi.color.setRGB(...p.up).multiplyScalar(1.6);
  hemi.groundColor.setRGB(...p.deep).multiplyScalar(0.5);
  hemi.intensity = 0.7 * p.ambient;
  U.uCamPos.value.copy(camera.position);
  { // approximate lit seabed colour for the surface's mirror reflection
    let r = 0, g = 0, b = 0;
    for (const e of seq.weights(s)) { const c = BIOMES[e.key].sand; r += c[0] * e.w; g += c[1] * e.w; b += c[2] * e.w; }
    const l = p.sun * 0.9;
    U.uFloorCol.value.setRGB(r * l * Math.exp(-p.lightSigma[0] * depth * 2), g * l * Math.exp(-p.lightSigma[1] * depth * 2), b * l * Math.exp(-p.lightSigma[2] * depth * 2));
  }
  post.params.shafts = p.shafts * p.sun;
  post.params.softStart = 0.45 / p.sigma[1];
  post.params.softEnd = 2.8 / p.sigma[1];
  post.params.depth = depth;
  post.params.exposure = 1 + 1.4 * p.glow + 0.4 * (1 - Math.min(1, p.sun));
  snow.setDensity(p.snow, p.glow);
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

// ---------- adaptive resolution ----------
let frameAvg = 16, adaptTimer = 0;
function adapt(dt) {
  if (QUALITY !== 'auto' || document.hidden) return;
  frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
  adaptTimer += dt;
  if (adaptTimer < 2) return;
  adaptTimer = 0;
  let ns = resScale;
  if (frameAvg > 19) ns = Math.max(0.5, resScale - 0.08);
  else if (frameAvg < 14.5) ns = Math.min(1, resScale + 0.05);
  if (ns !== resScale) { resScale = ns; renderer.setPixelRatio(maxDPR * resScale); post.setSize(); }
}

// ---------- boot ----------
placeCamera(0);
blendParams(s);
terrain.prime(s);
const clock = new THREE.Clock();
let time = 0, simTime = 0;
document.getElementById('loader').style.opacity = 0;
setTimeout(() => document.getElementById('loader').remove(), 1600);

function frame() {
  tick(Math.min(clock.getDelta(), 0.1), true);
  requestAnimationFrame(frame);
}
// Debug: advance the simulation without rAF (hidden tabs throttle it).
window.__ocean.advance = (seconds, step = 1 / 30) => {
  for (let t = 0; t < seconds; t += step) tick(step, t + step * 12 >= seconds);
};
function tick(dt, draw) {
  renderer.info.reset();
  if (!paused) {
    simTime += dt;
    const v = speed * (1 + 0.12 * noise1(simTime / 40, 77));
    s += v * dt;
  }
  time = simTime % 4096; // shader time wraps to keep float precision
  U.uTime.value = time;
  placeCamera(simTime);
  terrain.update(s, 4, Math.min(330, Math.max(90, 4.5 / Math.min(P.sigma[1], P.sigma[2]))));
  terrain.sky.syncUniforms(Oz);
  updateEnvironment(simTime);
  caustics.update(renderer, time);
  background.update(camera);
  surface.update(camera);
  snow.update(camera, dt, renderer);
  creatures.update(paused ? 0 : dt, time, camState);
  updateCaption(dt);
  labels.update(dt, camera, Oz);
  helpTimer -= dt; helpEl.style.opacity = helpTimer > 0 ? '0.7' : '0';
  if (helpTimer < 0) document.body.style.cursor = 'none';
  if (!draw) return;
  post.render(time);
  adapt(dt);
  if (statsOn) {
    const i = renderer.info;
    statsEl.textContent = `fps ${(1000 / frameAvg).toFixed(0)}  res ${resScale.toFixed(2)}\n` +
      `calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k\n` +
      `s ${s.toFixed(0)} m  depth ${(-camera.position.y).toFixed(1)} m\n` +
      seq.weights(s).map((e) => `${e.key} ${e.w.toFixed(2)}`).join('  ') +
      `\ngeo ${i.memory.geometries} tex ${i.memory.textures}  seed ${SEED}  ${tier}`;
  }
}
requestAnimationFrame(frame);
