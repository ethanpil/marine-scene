// Shared underwater look: global uniforms, procedural textures, and `applyWater`,
// which patches any MeshStandardMaterial (or Physical) with:
//   - depth-dependent sunlight extinction (reds die first)
//   - projected animated caustics with slight chromatic dispersion
//   - per-channel water absorption + in-scattering "fog" toward the water colour
//
// Floating-origin note: the world group is rebased by multiples of 1024 m, so every
// world-space pattern here uses periods that divide 1024 to stay seamless.
import * as THREE from 'three';
import { hash2i } from './noise.js';

export const U = {
  uTime: { value: 0 },
  uSigma: { value: new THREE.Vector3(0.12, 0.04, 0.03) },      // view-path extinction per metre
  uLightSigma: { value: new THREE.Vector3(0.06, 0.025, 0.02) }, // sunlight-path extinction per metre
  uWaterDeep: { value: new THREE.Color(0x02304a) },  // colour looking down / horizon
  uWaterUp: { value: new THREE.Color(0x1b8fb5) },    // colour looking up
  uSunDir: { value: new THREE.Vector3(0.25, 0.9, -0.3).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.97, 0.9) },
  uSunScatter: { value: 1 },
  uSurfaceY: { value: 0 },
  uCausticStr: { value: 1 },
  uAmbientScale: { value: 1 },
  uCaustics: { value: null },
  uNoiseTex: { value: null },
  uGlow: { value: 0 },
  uLamp: { value: 0 },          // camera-mounted ROV lamps (deep / caves)
  uFloorCol: { value: new THREE.Color(0.3, 0.3, 0.25) }, // lit floor colour, for surface reflections          // 0..1 bioluminescence emphasis (deep / night)
  uCamPos: { value: new THREE.Vector3() },
  // Sky-visibility map (caves / ice): R = how much sunlight reaches this xz column.
  uSkyMap: { value: null },
  uSkyOrigin: { value: new THREE.Vector2(-1e5, -1e5) }, // render-space xz of texel (0,0)
  uSkySize: { value: 256 },
  uSkyActive: { value: 0 },
};

export const WATER_PARS = /* glsl */`
uniform float uTime;
uniform vec3 uSigma;
uniform vec3 uLightSigma;
uniform vec3 uWaterDeep;
uniform vec3 uWaterUp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunScatter;
uniform float uSurfaceY;
uniform float uCausticStr;
uniform float uAmbientScale;
uniform float uGlow;
uniform float uLamp;
uniform vec3 uFloorCol;
uniform sampler2D uCaustics;
uniform sampler2D uNoiseTex;
uniform sampler2D uSkyMap;
uniform vec2 uSkyOrigin;
uniform float uSkySize;
uniform float uSkyActive;

float skyVis(vec3 wp) {
  if (uSkyActive < 0.5) return 1.0;
  vec2 p = wp.xz - uSunDir.xz / max(uSunDir.y, 0.35) * (wp.y - uSurfaceY) * 0.5;
  vec2 uv = (p - uSkyOrigin) / uSkySize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uSkyMap, uv).r;
}

vec3 waterColor(vec3 dir) {
  float y = dir.y;
  vec3 c = uWaterDeep * (0.45 + 0.55 * smoothstep(-0.9, 0.05, y));
  c = mix(c, uWaterUp, pow(smoothstep(-0.05, 1.0, y), 1.6));
  float s = max(dot(dir, uSunDir), 0.0);
  c += uSunColor * uSunScatter * (0.05 * pow(s, 5.0) + 0.22 * pow(s, 36.0));
  return c;
}

vec3 causticRGB(vec3 wp) {
  vec2 p = wp.xz - uSunDir.xz / max(uSunDir.y, 0.35) * (wp.y - uSurfaceY);
  vec2 uv = p / 8.0;
  float r = texture2D(uCaustics, uv + vec2(0.006, 0.0)).r;
  float g = texture2D(uCaustics, uv).r;
  float b = texture2D(uCaustics, uv - vec2(0.006, 0.0)).r;
  float m = texture2D(uCaustics, p / 21.333333 + vec2(0.37, 0.61)).r;
  return vec3(r, g, b) * (0.25 + 1.2 * m);
}

vec3 waterFog(vec3 col, vec3 wp) {
  vec3 toP = wp - cameraPosition;
  float d = length(toP);
  vec3 T = exp(-uSigma * d);
  return col * T + waterColor(toP / max(d, 1e-4)) * (1.0 - T);
}
`;

const VERT_HEAD = /* glsl */`
varying vec3 vWPos;
`;
const FRAG_HEAD = /* glsl */`
varying vec3 vWPos;
${WATER_PARS}
`;

const LIGHT_PATCH = /* glsl */`
#include <lights_fragment_end>
{
  vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float dB = max(0.0, uSurfaceY - vWPos.y);
  float sky = skyVis(vWPos);
  vec3 Tl = exp(-uLightSigma * dB) * sky;
  vec3 ca = causticRGB(vWPos) * uCausticStr * smoothstep(-0.25, 0.7, wN.y) * exp(-dB * 0.035);
  reflectedLight.directDiffuse *= Tl * (0.45 + 2.0 * ca);
  reflectedLight.directSpecular *= Tl * (0.6 + 1.5 * ca);
  reflectedLight.indirectDiffuse *= mix(Tl, vec3(1.0), 0.45) * uAmbientScale * mix(0.4, 1.0, sky);
  reflectedLight.indirectSpecular *= Tl * 0.5;
  if (uLamp > 0.001) {
    // two lamps either side of the camera, aimed forward (view space)
    for (int k = 0; k < 2; k++) {
      vec3 lp = vec3(k == 0 ? -0.8 : 0.8, -0.3, 0.0);
      vec3 toL = lp + vViewPosition;
      float d = length(toL);
      vec3 L = toL / d;
      float cone = smoothstep(0.6, 0.92, dot(-L, normalize(vec3(-lp.x * 0.04, 0.02, -1.0))));
      float ndl = max(dot(normal, L), 0.0);
      vec3 irr = vec3(1.0, 0.93, 0.82) * uLamp * 14.0 * cone * ndl * exp(-uSigma * d) / (1.0 + 0.04 * d * d);
      reflectedLight.directDiffuse += irr * BRDF_Lambert(material.diffuseColor);
      reflectedLight.directSpecular += irr * 0.08 * pow(max(dot(normal, normalize(L + normalize(vViewPosition))), 0.0), 40.0);
    }
  }
}
`;

/**
 * Patch a MeshStandardMaterial / MeshPhysicalMaterial / MeshLambertMaterial-like
 * material with the underwater look.
 * opts.key       REQUIRED unique string per distinct shader variant (program cache key)
 * opts.uniforms  extra uniforms merged in
 * opts.vertexHead / opts.fragmentHead  GLSL injected after <common>
 * opts.patch(shader)  further string replacements (runs after the water patch)
 * opts.additive  true for additive/glow materials (fog only attenuates, no in-scatter)
 * opts.noLight   true to skip the lighting/caustic patch (e.g. MeshBasicMaterial)
 */
export function applyWater(material, opts = {}) {
  if (!opts.key) throw new Error('applyWater: opts.key required');
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, opts.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD + (opts.vertexHead || ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);');
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD + (opts.fragmentHead || ''));
    if (!opts.noLight) fs = fs.replace('#include <lights_fragment_end>', LIGHT_PATCH);
    const fog = opts.additive
      ? `{ float d_ = length(vWPos - cameraPosition); outgoingLight *= exp(-uSigma * d_); }`
      : `outgoingLight = waterFog(outgoingLight, vWPos);`;
    fs = fs.replace('#include <opaque_fragment>', fog + '\n#include <opaque_fragment>');
    shader.fragmentShader = fs;
    if (opts.patch) opts.patch(shader);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'water:' + opts.key;
  return material;
}

// ---------- Procedural tileable noise texture (RGBA: 3 fbm + ridged) ----------
function periodicNoise(x, y, P, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const h = (a, b) => hash2i(((a % P) + P) % P, ((b % P) + P) % P, seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    for (let ch = 0; ch < 4; ch++) {
      let s = 0, amp = 0.5, P = 8, tot = 0;
      for (let k = 0; k < 5; k++) {
        let n = periodicNoise((x / size) * P, (y / size) * P, P, ch * 101 + k * 7);
        if (ch === 3) n = 1 - Math.abs(n * 2 - 1);
        s += n * amp; tot += amp; amp *= 0.5; P *= 2;
      }
      data[o + ch] = Math.max(0, Math.min(255, (s / tot) * 255));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Animated tileable caustics rendered to a small target each frame ----------
export class Caustics {
  constructor(size = 512) {
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float t;
        vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
        float edge(vec2 uv, float N, float tt){
          vec2 p = uv * N, ip = floor(p), fp = fract(p);
          float f1 = 8.0, f2 = 8.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = h2(mod(ip + g, N) + N * 13.0);
            o = 0.5 + 0.42 * sin(tt * (0.5 + o.yx * 0.6) + 6.2831 * o);
            vec2 r = g + o - fp; float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
          }
          return sqrt(f2) - sqrt(f1);
        }
        void main(){
          vec2 uv = vUv;
          vec2 w = vec2(sin(6.2831853 * 2.0 * uv.y + t * 0.5), sin(6.2831853 * 2.0 * uv.x + t * 0.43)) * 0.06
            + vec2(sin(6.2831853 * 5.0 * uv.y - t * 0.7), sin(6.2831853 * 4.0 * uv.x + t * 0.6)) * 0.015;
          float e1 = edge(uv + w, 5.0, t * 0.9);
          float e2 = edge(uv - w * 0.8 + 0.5, 8.0, t * 1.2);
          float c = pow(1.0 - smoothstep(0.0, 0.3, e1), 3.5) * 0.85 + pow(1.0 - smoothstep(0.0, 0.26, e2), 3.0) * 0.45;
          gl_FragColor = vec4(vec3(c), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    q.frustumCulled = false;
    this.scene.add(q);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    U.uCaustics.value = this.rt.texture;
  }
  update(renderer, time) {
    this.mat.uniforms.t.value = time;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prev);
  }
}
