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
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: WORLD_VERT,
      fragmentShader: /* glsl */`
        varying vec3 vWPos;
        ${WATER_PARS}
        void main() {
          vec3 V = normalize(vWPos - cameraPosition);
          vec2 q = vWPos.xz;
          float t = uTime;
          vec2 g = (texture2D(uNoiseTex, q / 32.0 + vec2(t * 0.011, t * 0.007)).rg - 0.5) * 1.3
                 + (texture2D(uNoiseTex, q / 8.0 - vec2(t * 0.023, -t * 0.017)).ba - 0.5) * 0.7
                 + (texture2D(uNoiseTex, q / 2.0 + vec2(-t * 0.05, t * 0.04)).rg - 0.5) * 0.25;
          float distFade = exp(-length(vWPos - cameraPosition) * 0.012);
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
            sky += uSunColor * (pow(sunD, 600.0) * 60.0 + pow(sunD, 18.0) * 1.6);
            float cosT = clamp(-dot(V, N), 0.0, 1.0);
            float fr = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
            float win = smoothstep(0.0, 0.12, T.y);
            col = mix(refl, sky * uSunScatter * (1.0 - fr), win);
          }
          gl_FragColor = vec4(waterFog(col, vWPos), 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 1, 1), mat);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.frustumCulled = false;
  }
  update(camera) {
    this.mesh.position.set(camera.position.x, U.uSurfaceY.value, camera.position.z);
    this.mesh.visible = camera.position.y > -110;
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
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 aRand;
        uniform float uBox, uDensity, uGlowAmt, uPx, uTime;
        uniform vec3 uCamR, uSigma, uLightSigma, uSunColor, uWaterUp;
        uniform float uSunScatter, uSurfaceY;
        varying vec4 vCol;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.13 + aRand.x * 6.28) * 0.6,
                                   -uTime * 0.04 * (0.4 + aRand.y),
                                   cos(uTime * 0.11 + aRand.z * 6.28) * 0.6);
          p = mod(p - uCamR, uBox) - uBox * 0.5 + uCamR;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          bool glow = aRand.w < uGlowAmt * 0.22;
          float size = glow ? 0.05 + aRand.x * 0.05 : 0.012 + aRand.x * aRand.x * 0.05;
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
  setDensity(snow, glow) {
    this.uniforms.uDensity.value = Math.min(1, 0.25 + snow * 0.45);
    this.uniforms.uGlowAmt.value = glow;
  }
  update(camera, dt, renderer) {
    this.uniforms.uCamR.value.copy(camera.position);
    const h = window.innerHeight * (renderer ? renderer.getPixelRatio() : 1);
    this.uniforms.uPx.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}
