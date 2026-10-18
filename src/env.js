// Ambient environment: water-volume background, the surface seen from below (Snell's window),
// and drifting marine snow / bioluminescent motes.
import * as THREE from 'three';
import { U, WATER_PARS } from './water.js';

const WORLD_VERT = /* glsl */`
varying vec3 vWPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export class Background {
  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: WORLD_VERT,
      fragmentShader: /* glsl */`
        varying vec3 vWPos;
        ${WATER_PARS}
        void main() {
          vec3 dir = normalize(vWPos - cameraPosition);
          gl_FragColor = vec4(waterColor(dir), 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }
  update(camera) { this.mesh.position.copy(camera.position); }
}

export class Surface {
  constructor() {
    this.uniforms = Object.assign({}, U, {
      uBoat: { value: new THREE.Vector4(0, 0, 1, 0) },    // render x, z, heading cos, sin
      uBoatDim: { value: new THREE.Vector3(5, 1.4, 0) },  // half length, half width, opacity
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WORLD_VERT,
      fragmentShader: /* glsl */`
        varying vec3 vWPos;
        uniform vec4 uBoat;
        uniform vec3 uBoatDim;
        ${WATER_PARS}
        // expanding raindrop rings on the surface (cells of 0.8 m; 1024 / 0.8 is whole, so seamless)
        vec2 rainGrad(vec2 q, float t) {
          vec2 g = vec2(0.0);
          vec2 cell = floor(q / 0.8);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = cell + vec2(float(i), float(j));
            vec2 h = fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 center = (c + h) * 0.8;
            float ph = fract(t * 0.85 + h.x * 7.0 + h.y * 3.0);
            vec2 dv = q - center;
            float d = length(dv), r = ph * 0.45;
            float ring = exp(-pow((d - r) / 0.04, 2.0)) * (1.0 - ph) * (1.0 - ph);
            g += dv / max(d, 1e-3) * ring * sin((d - r) * 55.0);
          }
          return g;
        }
        void main() {
          vec3 V = normalize(vWPos - cameraPosition);
          vec2 q = vWPos.xz;
          float t = uTime;
          vec2 g = (texture2D(uNoiseTex, q / 32.0 + vec2(t * 0.011, t * 0.007)).rg - 0.5) * 1.3
                 + (texture2D(uNoiseTex, q / 8.0 - vec2(t * 0.023, -t * 0.017)).ba - 0.5) * 0.7
                 + (texture2D(uNoiseTex, q / 2.0 + vec2(-t * 0.05, t * 0.04)).rg - 0.5) * 0.25;
          g *= 1.0 + 1.6 * uSurge;
          float distFade = exp(-length(vWPos - cameraPosition) * 0.012);
          if (uRain > 0.01) g += rainGrad(q, t) * 0.9 * uRain * exp(-length(vWPos - cameraPosition) * 0.03);
          vec3 N = normalize(vec3(g.x * 0.55 * distFade, -1.0, g.y * 0.55 * distFade));
          vec3 T = refract(V, N, 1.333);
          vec3 R = reflect(V, N);
          // total internal reflection mirrors the lit seabed in shallow water
          float shallow = exp(-max(0.0, -cameraPosition.y) * 0.12);
          vec3 refl = mix(waterColor(R), uFloorCol, shallow * smoothstep(-0.05, -0.5, R.y) * 0.8);
          refl *= 0.75 + 0.6 * (g.x + 0.5 * g.y);
          vec3 col = refl;
          if (dot(T, T) > 1e-4) {
            float sunD = max(dot(T, uSunDir), 0.0);
            vec3 sky = mix(vec3(0.75, 0.88, 1.0), vec3(0.32, 0.58, 0.92), clamp(T.y, 0.0, 1.0)) * 1.9;
            sky = mix(sky, sky * uSunColor * 1.25, 0.6);   // warm skies at dusk, silver under the moon
            sky += uSunColor * (pow(sunD, 600.0) * 60.0 + pow(sunD, 18.0) * 1.6);
            float cosT = clamp(-dot(V, N), 0.0, 1.0);
            float fr = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
            float win = smoothstep(0.0, 0.12, T.y);
            col = mix(refl, sky * uSunScatter * (1.0 - fr), win);
          }
          // a boat passing overhead: dark hull silhouette and a churning white wake behind it
          if (uBoatDim.z > 0.001) {
            vec2 bd = vWPos.xz - uBoat.xy;
            float u = dot(bd, uBoat.zw), v = dot(bd, vec2(-uBoat.w, uBoat.z));
            float L = uBoatDim.x, W = uBoatDim.y;
            float taper = 1.0 - smoothstep(0.15, 1.0, u / L) * 0.85;
            float hull = 1.0 - smoothstep(0.85, 1.05, length(vec2(u / L, v / (W * taper))));
            float behind = max(0.0, -u - L * 0.8);
            float wakeW = 0.9 + behind * 0.09;
            float wn = texture2D(uNoiseTex, vWPos.xz / 4.0 + vec2(t * 0.15, 0.0)).r;
            float wake = exp(-v * v / (wakeW * wakeW)) * exp(-behind / 45.0) * step(0.0, behind) * (0.5 + wn);
            col = mix(col, vec3(0.92, 0.97, 1.0) * uSunScatter * 1.8, clamp(wake * 0.8, 0.0, 1.0) * uBoatDim.z);
            col = mix(col, waterColor(R) * 0.12, hull * uBoatDim.z);
          }
          gl_FragColor = vec4(waterFog(col, vWPos), 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 1, 1), mat);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.frustumCulled = false;
  }
  // allowBoat: open sky and shallow enough to see the surface. Oz: floating-origin offset.
  update(camera, dt = 0, allowBoat = false, Oz = 0) {
    this.mesh.position.set(camera.position.x, U.uSurfaceY.value, camera.position.z);
    this.mesh.visible = camera.position.y > -110;
    // occasional boat crossing overhead (a little moment of life from the world above)
    if (this.boatTimer === undefined) { this.boatTimer = 90 + Math.random() * 150; this.boat = null; this._f = new THREE.Vector3(); }
    const ub = this.uniforms.uBoat.value, dim = this.uniforms.uBoatDim.value;
    if (!this.boat) {
      this.boatTimer -= dt;
      dim.z = 0;
      if (this.boatTimer <= 0) {
        if (allowBoat) {
          const f = camera.getWorldDirection(this._f); f.y = 0; f.normalize();
          const side = Math.random() < 0.5 ? -1 : 1, rx = -f.z * side, rz = f.x * side;
          const L = 6 + Math.random() * 9, sp = 3.5 + Math.random() * 3;
          this.boat = { x: camera.position.x + f.x * 35 + rx * 75, gz: camera.position.z + Oz + f.z * 35 + rz * 75,
            dx: -rx + f.x * 0.25, dz: -rz + f.z * 0.25, sp, L, W: L * 0.17, life: 150 / sp, age: 0 };
          const n = Math.hypot(this.boat.dx, this.boat.dz); this.boat.dx /= n; this.boat.dz /= n;
        }
        this.boatTimer = 200 + Math.random() * 360;
      }
    } else {
      const b = this.boat;
      b.x += b.dx * b.sp * dt; b.gz += b.dz * b.sp * dt; b.age += dt;
      if (b.age > b.life) this.boat = null;
      else {
        ub.set(b.x, b.gz - Oz, b.dx, b.dz);
        dim.set(b.L * 0.5, b.W, Math.min(1, b.age / 3, (b.life - b.age) / 3) * (allowBoat ? 1 : 0));
      }
    }
  }
}

export class MarineSnow {
  constructor(count = 6000) {
    const B = 64;
    const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * B; pos[i * 3 + 1] = Math.random() * B; pos[i * 3 + 2] = Math.random() * B;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    this.uniforms = Object.assign({}, U, {
      uBox: { value: B }, uDensity: { value: 0.6 }, uGlowAmt: { value: 0 }, uPx: { value: 800 }, uCamR: { value: new THREE.Vector3() },
      uSpawn: { value: 0 }, uCamSpeed: { value: 3 },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aRand;
        uniform float uBox, uDensity, uGlowAmt, uPx, uTime, uSpawn, uCamSpeed, uNight, uLamp;
        uniform vec3 uCamR, uSigma, uLightSigma, uSunColor, uWaterUp;
        uniform float uSunScatter, uSurfaceY;
        varying vec4 vCol;
        void main() {
          bool spawn = aRand.w > 1.0 - 0.3 * uSpawn;     // coral-spawning bundles rise instead of sink
          vec3 p = position + vec3(sin(uTime * 0.13 + aRand.x * 6.28) * 0.6,
                                   spawn ? uTime * 0.11 * (0.5 + aRand.y) : -uTime * 0.04 * (0.4 + aRand.y),
                                   cos(uTime * 0.11 + aRand.z * 6.28) * 0.6);
          p = mod(p - uCamR, uBox) - uBox * 0.5 + uCamR;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          bool glow = aRand.w < uGlowAmt * 0.22;
          float size = spawn ? 0.03 + aRand.x * 0.025 : glow ? 0.05 + aRand.x * 0.05 : 0.012 + aRand.x * aRand.x * 0.05;
          gl_PointSize = clamp(size * uPx / max(d, 0.1), 1.0, 40.0);
          gl_Position = projectionMatrix * mv;
          float edge = smoothstep(uBox * 0.5, uBox * 0.3, length(p - uCamR));
          float near = smoothstep(0.3, 1.5, d);
          float vis = step(aRand.y, uDensity) * edge * near;
          vec3 T = exp(-uSigma * d);
          float dB = max(0.0, uSurfaceY - p.y);
          vec3 lit = (uSunColor * uSunScatter * exp(-uLightSigma * dB) * 0.9 + uWaterUp * 0.6);
          vec3 c = lit * T * 0.5;
          if (glow) {
            float tw = 0.5 + 0.5 * sin(uTime * (0.7 + aRand.z * 2.0) + aRand.x * 40.0);
            c = mix(vec3(0.2, 0.9, 1.0), vec3(0.3, 1.0, 0.6), aRand.z) * 2.5 * tw * tw * exp(-uSigma * d * 0.6);
            vis = edge * near;
          }
          // night: plankton flashes blue-green as the camera disturbs the water around it
          float stir = uNight * smoothstep(3.2, 0.9, d) * clamp(uCamSpeed / 3.0, 0.2, 1.6);
          if (stir > 0.01 && aRand.z < 0.35) {
            float fl = pow(0.5 + 0.5 * sin(uTime * (3.0 + aRand.x * 5.0) + aRand.y * 50.0), 6.0);
            c += vec3(0.25, 0.95, 1.0) * 4.0 * stir * fl;
            vis = max(vis, edge * near * step(0.001, stir));
          }
          if (spawn) {
            vec3 lampLit = vec3(1.0, 0.95, 0.85) * (uLamp * 1.6 * exp(-d * 0.15) + 0.15);
            c = vec3(1.0, 0.5, 0.55) * (lit * 0.6 + lampLit) * T;
            vis = edge * near;
          }
          // big out-of-focus motes close to the lens are dimmer and softer
          float bokeh = smoothstep(4.0, 1.0, d);
          vCol = vec4(c, vis * (1.0 - bokeh * 0.6));
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(c));
          if (vCol.a * a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }
  setDensity(snow, glow, spawn = 0, camSpeed = 3) {
    this.uniforms.uDensity.value = Math.min(1, 0.25 + snow * 0.45);
    this.uniforms.uGlowAmt.value = glow;
    this.uniforms.uSpawn.value = spawn;
    this.uniforms.uCamSpeed.value = camSpeed;
  }
  update(camera, dt, renderer) {
    this.uniforms.uCamR.value.copy(camera.position);
    const h = window.innerHeight * (renderer ? renderer.getPixelRatio() : 1);
    this.uniforms.uPx.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}
