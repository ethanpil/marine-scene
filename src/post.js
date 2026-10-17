// Post pipeline: HDR scene -> half-res volumetric light shafts -> dual-filter bloom -> composite
// (ACES tonemap, grade, vignette, subtle chromatic aberration, grain, dithering).
import * as THREE from 'three';
import { U, WATER_PARS } from './water.js';

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, Object.assign({
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, generateMipmaps: false,
  }, opts));
}

export class Post {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.opts = Object.assign({ msaa: 4, shaftDiv: 2, shaftSteps: 24 }, opts);
    this.params = { shafts: 1, depth: 10, exposure: 1 };
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, {
        tDepth: { value: null }, tHist: { value: null }, uHist: { value: 0 }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uCamR: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uStrength: { value: 1 }, uFrame: { value: 0 },
      }),
      defines: { STEPS: this.opts.shaftSteps },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDepth, tHist;
        uniform float uHist;
        uniform mat4 uProjInv, uCamWorld;
        uniform vec3 uCamR;
        uniform float uStrength, uFrame;
        ${WATER_PARS}
        float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        void main() {
          float z = texture2D(tDepth, vUv).x;
          vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          vp.xyz /= vp.w;
          vec3 dir = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
          float dist = z >= 0.99999 ? 75.0 : min(length(vp.xyz), 110.0);
          const int N = STEPS;
          float stepL = dist / float(N);
          float j = hash(vec3(gl_FragCoord.xy, uFrame));
          vec3 acc = vec3(0.0);
          float cosT = dot(dir, uSunDir);
          float g = 0.55;
          float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5) * 0.3 + 0.04;
          for (int i = 0; i < N; i++) {
            float t = (float(i) + j) * stepL;
            vec3 p = uCamR + dir * t;
            float dB = uSurfaceY - p.y;
            if (dB < 0.0) break;
            vec2 q = p.xz - uSunDir.xz / max(uSunDir.y, 0.35) * (p.y - uSurfaceY);
            float c = texture2D(uCaustics, q / 16.0, 3.0).r;
            float c2 = texture2D(uCaustics, q / 42.666667 + vec2(0.37, 0.61), 4.0).r;
            float sh = pow(c * (0.4 + c2) * 2.0, 3.0) + 0.008;
            vec3 Tl = exp(-uLightSigma * dB);
            acc += sh * Tl * exp(-uSigma * t) * skyVis(p) * stepL;
          }
          vec3 cur = acc * uSunColor * phase * uStrength * 0.13;
          if (uLamp > 0.001) {
            // forward-scattered lamp beams (camera-space cone around the view axis)
            vec3 fwd = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
            float cone = smoothstep(0.55, 1.0, dot(dir, fwd));
            float L = 0.0;
            float ld = min(dist, 40.0), st = ld / 8.0;
            for (int i = 0; i < 8; i++) {
              float t = (float(i) + j) * st + 0.3;
              L += exp(-dot(uSigma, vec3(0.33)) * 2.0 * t) / (1.0 + 0.15 * t * t) * st;
            }
            cur += vec3(0.0025, 0.0045, 0.005) * L * cone * uLamp;
          }
          gl_FragColor = vec4(mix(cur, texture2D(tHist, vUv).rgb, uHist), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
        void main() {
          vec3 c = vec3(0.0);
          c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
          c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          c *= 0.25;
          float l = max(c.r, max(c.g, c.b));
          float k = smoothstep(0.75, 2.0, l);
          gl_FragColor = vec4(min(c * k, vec3(30.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv - uTexel).rgb;
          c += texture2D(tSrc, vUv + uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
          c += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
        void main() {
          vec2 o = uTexel;
          vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
          c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
          gl_FragColor = vec4(c / 12.0, 1.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tShafts: { value: null }, tBloom: { value: null },
        uShaftTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uTime: { value: 0 },
        uWaterDeep: U.uWaterDeep, uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tScene, tShafts, tBloom;
        uniform vec2 uShaftTexel;
        uniform float uExposure, uTime, uAspect;
        uniform vec3 uWaterDeep;
        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec2 uv = vUv;
          vec2 cc = uv - 0.5;
          float r2 = dot(cc * vec2(uAspect, 1.0), cc * vec2(uAspect, 1.0));
          // subtle radial chromatic aberration (housing port)
          vec2 ca = cc * r2 * 0.012;
          vec3 col;
          col.r = texture2D(tScene, uv - ca).r;
          col.g = texture2D(tScene, uv).g;
          col.b = texture2D(tScene, uv + ca).b;
          vec3 sh = texture2D(tShafts, uv).rgb * 0.2;
          sh += texture2D(tShafts, uv + uShaftTexel * vec2(2.5, 1.0)).rgb * 0.1;
          sh += texture2D(tShafts, uv - uShaftTexel * vec2(2.5, 1.0)).rgb * 0.1;
          sh += texture2D(tShafts, uv + uShaftTexel * vec2(-1.0, 2.5)).rgb * 0.1;
          sh += texture2D(tShafts, uv - uShaftTexel * vec2(-1.0, 2.5)).rgb * 0.1;
          sh += texture2D(tShafts, uv + uShaftTexel * vec2(1.2, 1.2)).rgb * 0.1;
          sh += texture2D(tShafts, uv - uShaftTexel * vec2(1.2, 1.2)).rgb * 0.1;
          sh += texture2D(tShafts, uv + uShaftTexel * vec2(1.2, -1.2)).rgb * 0.1;
          sh += texture2D(tShafts, uv - uShaftTexel * vec2(1.2, -1.2)).rgb * 0.1;
          col += sh;
          col += texture2D(tBloom, uv).rgb * 0.55;
          col *= uExposure;
          // vignette
          col *= mix(1.0, smoothstep(1.05, 0.15, r2 * 1.6), 0.75);
          col = aces(col * 1.05);
          // gentle grade: lift shadows toward deep water hue, slight contrast
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
          col += uWaterDeep * 0.025;
          col = toSRGB(col);
          float n = hash(uv * 1000.0 + fract(uTime * 13.37) * 100.0) - 0.5;
          col += n * (0.012 + 0.014 * (1.0 - dot(col, vec3(0.333))));
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.frame = 0;
    this.setSize();
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
    if (this.sceneRT) {
      this.sceneRT.dispose(); this.shaftRT.dispose(); this.shaftRT2.dispose();
      for (const t of this.mips) t.dispose();
    }
    this.sceneRT = rt(w, h, { depthBuffer: true, samples: this.opts.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    const d = this.opts.shaftDiv;
    this.shaftRT = rt(Math.ceil(w / d), Math.ceil(h / d));
    this.shaftRT2 = rt(Math.ceil(w / d), Math.ceil(h / d));
    this.histValid = false;
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < 6; i++) { mw = Math.max(1, Math.ceil(mw / 2)); mh = Math.max(1, Math.ceil(mh / 2)); this.mips.push(rt(mw, mh)); }
    this.w = w; this.h = h;
    this.compMat.uniforms.uAspect.value = w / h;
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(time) {
    const r = this.renderer, cam = this.camera;
    this.frame++;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, cam);

    // light shafts
    const su = this.shaftMat.uniforms;
    if (this.params.shafts > 0.01 || U.uLamp.value > 0.001) {
      su.tDepth.value = this.sceneRT.depthTexture;
      su.uProjInv.value.copy(cam.projectionMatrixInverse);
      su.uCamWorld.value.copy(cam.matrixWorld);
      su.uCamR.value.copy(cam.position);
      su.uStrength.value = this.params.shafts;
      su.uFrame.value = this.frame % 1024;
      [this.shaftRT, this.shaftRT2] = [this.shaftRT2, this.shaftRT];
      su.tHist.value = this.shaftRT2.texture;
      su.uHist.value = this.histValid ? 0.82 : 0;
      this._pass(this.shaftMat, this.shaftRT);
      this.histValid = true;
    } else {
      r.setRenderTarget(this.shaftRT); r.setClearColor(0x000000, 1); r.clear();
      this.histValid = false;
    }

    // bloom: bright-pass into mip0, downsample chain, then additive upsample back to mip0
    const m = this.mips;
    this.brightMat.uniforms.tSrc.value = this.sceneRT.texture;
    this.brightMat.uniforms.uTexel.value.set(0.5 / this.w, 0.5 / this.h);
    this._pass(this.brightMat, m[0]);
    for (let i = 1; i < m.length; i++) {
      this.downMat.uniforms.tSrc.value = m[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
      this._pass(this.downMat, m[i]);
    }
    for (let i = m.length - 1; i > 0; i--) {
      this.upMat.uniforms.tSrc.value = m[i].texture;
      this.upMat.uniforms.uTexel.value.set(0.5 / m[i].width, 0.5 / m[i].height);
      this.quad.material = this.upMat;
      r.setRenderTarget(m[i - 1]);
      r.autoClear = false;
      r.render(this.quadScene, this.quadCam);
      r.autoClear = true;
    }

    const cu = this.compMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tShafts.value = this.shaftRT.texture;
    cu.tBloom.value = m[0].texture;
    cu.uShaftTexel.value.set(1 / this.shaftRT.width, 1 / this.shaftRT.height);
    cu.uExposure.value = this.params.exposure;
    cu.uTime.value = time;
    this._pass(this.compMat, null);
  }
}
