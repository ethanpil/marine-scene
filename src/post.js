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
    this.opts = Object.assign({ msaa: 4, shaftDiv: 2, shaftSteps: 24, ao: false, fxaa: false }, opts);
    this.params = { shafts: 1, depth: 10, exposure: 1, softStart: 12, softEnd: 70, focus: 12, aperture: 1.8, night: 0 };
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
    // Screen-space ambient occlusion (high tier): half-res, 12 hemisphere samples, view-space radius.
    const kernel = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 * 2.618, z = 0.15 + 0.85 * ((i * 7) % 12) / 12, r = Math.sqrt(1 - z * z);
      const sc = 0.25 + 0.75 * ((i + 0.5) / 12) ** 2;
      kernel.push(new THREE.Vector3(Math.cos(a) * r * sc, Math.sin(a) * r * sc, z * sc));
    }
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uKernel: { value: kernel }, uRadius: { value: 0.9 }, uFrame: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDepth;
        uniform mat4 uProj, uProjInv;
        uniform vec3 uKernel[12];
        uniform float uRadius, uFrame;
        vec3 viewPos(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          return p.xyz / p.w;
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
        void main() {
          float z0 = texture2D(tDepth, vUv).x;
          if (z0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
          vec3 P = viewPos(vUv);
          if (-P.z > 45.0) { gl_FragColor = vec4(1.0); return; }
          vec3 N = normalize(cross(dFdx(P), dFdy(P)));
          if (dot(N, P) > 0.0) N = -N;
          float a = hash(gl_FragCoord.xy) * 6.2831853;
          vec3 rv = vec3(cos(a), sin(a), 0.0);
          vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
          float occ = 0.0;
          for (int i = 0; i < 12; i++) {
            vec3 k = uKernel[i];
            vec3 sp = P + (T * k.x + B * k.y + N * k.z) * uRadius;
            vec4 q = uProj * vec4(sp, 1.0);
            vec2 suv = q.xy / q.w * 0.5 + 0.5;
            float sz = viewPos(suv).z;
            float range = smoothstep(0.0, 1.0, uRadius / max(1e-3, abs(P.z - sz)));
            occ += (sz >= sp.z + 0.03 ? 1.0 : 0.0) * range;
          }
          float ao = 1.0 - occ / 12.0;
          gl_FragColor = vec4(vec3(pow(clamp(ao, 0.0, 1.0), 1.4)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      defines: Object.assign({}, this.opts.fxaa ? { FXAA: 1 } : {}, this.opts.ao ? { AO: 1 } : {}),
      uniforms: {
        tScene: { value: null }, tShafts: { value: null }, tBloom: { value: null }, tSoft: { value: null }, tDepth: { value: null },
        uNear: { value: 0.1 }, uFar: { value: 1400 }, uSoft: { value: new THREE.Vector2(12, 70) },
        tSoftA: { value: null }, tAO: { value: null }, uFocus: { value: 12 }, uAperture: { value: 1.8 }, uNight: { value: 0 },
        uTexel: { value: new THREE.Vector2() }, uAOTexel: { value: new THREE.Vector2() }, uSigma: U.uSigma,
        uShaftTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uTime: { value: 0 },
        uWaterDeep: U.uWaterDeep, uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tScene, tShafts, tBloom, tSoft, tDepth, tSoftA, tAO;
        uniform float uNear, uFar, uFocus, uAperture, uNight;
        uniform vec2 uSoft, uTexel, uAOTexel;
        uniform vec3 uSigma;
        float luma(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
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
          vec3 col;
#ifdef FXAA
          // FXAA-lite on the HDR scene (low tier has no MSAA): blend along the local edge direction
          {
            vec3 rgbM = texture2D(tScene, uv).rgb;
            float lM = luma(rgbM);
            float lN = luma(texture2D(tScene, uv + vec2(0.0, uTexel.y)).rgb), lS = luma(texture2D(tScene, uv - vec2(0.0, uTexel.y)).rgb);
            float lE = luma(texture2D(tScene, uv + vec2(uTexel.x, 0.0)).rgb), lW = luma(texture2D(tScene, uv - vec2(uTexel.x, 0.0)).rgb);
            float lMin = min(lM, min(min(lN, lS), min(lE, lW))), lMax = max(lM, max(max(lN, lS), max(lE, lW)));
            col = rgbM;
            if (lMax - lMin > max(0.03, lMax * 0.12)) {
              vec2 dir = vec2(-(lN - lS), lE - lW);
              float red = max((lN + lS + lE + lW) * 0.03125, 1.0 / 128.0);
              dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -6.0, 6.0) * uTexel;
              vec3 A = 0.5 * (texture2D(tScene, uv - dir / 6.0).rgb + texture2D(tScene, uv + dir / 6.0).rgb);
              vec3 Bc = A * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
              float lB = luma(Bc);
              col = (lB < lMin || lB > lMax) ? A : Bc;
            }
          }
#else
          vec2 ca = cc * r2 * 0.012;
          col.r = texture2D(tScene, uv - ca).r;
          col.g = texture2D(tScene, uv).g;
          col.b = texture2D(tScene, uv + ca).b;
#endif
          float zd = texture2D(tDepth, uv).x * 2.0 - 1.0;
          float vz = 2.0 * uNear * uFar / (uFar + uNear - zd * (uFar - uNear));
#ifdef AO
          {
            float ao = texture2D(tAO, uv).r * 0.4;
            ao += texture2D(tAO, uv + uAOTexel * vec2(1.0, 0.5)).r * 0.15;
            ao += texture2D(tAO, uv - uAOTexel * vec2(1.0, 0.5)).r * 0.15;
            ao += texture2D(tAO, uv + uAOTexel * vec2(-0.5, 1.0)).r * 0.15;
            ao += texture2D(tAO, uv - uAOTexel * vec2(-0.5, 1.0)).r * 0.15;
            // occlusion darkens surfaces, not the water haze in front of them
            float T = exp(-dot(uSigma, vec3(0.3333)) * vz);
            col *= mix(1.0, ao, 0.85 * T);
          }
#endif
          // focus pull (thin-lens circle of confusion) + turbidity softening of distant detail
          {
            float coc = clamp(abs(1.0 / uFocus - 1.0 / max(vz, 0.05)) * uAperture, 0.0, 1.0);
            float kd = smoothstep(0.1, 0.55, coc);
            float kt = smoothstep(uSoft.x, uSoft.y, vz) * 0.6;
            vec3 blurA = texture2D(tSoftA, uv).rgb, blurB = texture2D(tSoft, uv).rgb;
            vec3 blur = mix(blurA, blurB, smoothstep(0.45, 1.0, max(coc, kt)));
            col = mix(col, blur, max(kd, kt));
          }
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
          // night: scotopic vision — slightly desaturated and blue
          col = mix(col, vec3(dot(col, vec3(0.25, 0.55, 0.2))) * vec3(0.78, 0.95, 1.22), 0.32 * uNight);
          // vignette
          col *= mix(1.0, smoothstep(1.05, 0.15, r2 * 1.6), 0.75);
          col = aces(col * 1.05);
          // gentle grade: lift shadows toward deep water hue, slight contrast
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
          col += uWaterDeep * 0.025;
          col = toSRGB(col);
          float n = hash(uv * 1000.0 + fract(uTime * 13.37) * 100.0) - 0.5;
          col += n * (0.012 + 0.014 * (1.0 - dot(col, vec3(0.333)))) * (1.0 + 0.8 * uNight);
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
      this.sceneRT.dispose(); this.shaftRT.dispose(); this.shaftRT2.dispose(); this.softA.dispose(); this.softB.dispose();
      if (this.aoRT) this.aoRT.dispose();
      for (const t of this.mips) t.dispose();
    }
    this.sceneRT = rt(w, h, { depthBuffer: true, samples: this.opts.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    const d = this.opts.shaftDiv;
    this.shaftRT = rt(Math.ceil(w / d), Math.ceil(h / d));
    this.shaftRT2 = rt(Math.ceil(w / d), Math.ceil(h / d));
    this.histValid = false;
    this.softA = rt(Math.ceil(w / 2), Math.ceil(h / 2));
    this.softB = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.aoRT = this.opts.ao ? rt(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.UnsignedByteType }) : null;
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

    // quarter-res blurred copy of the scene for distance softening
    this.downMat.uniforms.tSrc.value = this.sceneRT.texture;
    this.downMat.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this._pass(this.downMat, this.softA);
    this.downMat.uniforms.tSrc.value = this.softA.texture;
    this.downMat.uniforms.uTexel.value.set(1 / this.softA.width, 1 / this.softA.height);
    this._pass(this.downMat, this.softB);

    if (this.aoRT) {
      const au = this.aoMat.uniforms;
      au.tDepth.value = this.sceneRT.depthTexture;
      au.uProj.value.copy(cam.projectionMatrix);
      au.uProjInv.value.copy(cam.projectionMatrixInverse);
      au.uFrame.value = this.frame % 64;
      this._pass(this.aoMat, this.aoRT);
    }

    const cu = this.compMat.uniforms;
    cu.tSoft.value = this.softB.texture;
    cu.tSoftA.value = this.softA.texture;
    cu.tAO.value = this.aoRT ? this.aoRT.texture : null;
    cu.uFocus.value = Math.max(0.5, this.params.focus);
    cu.uAperture.value = this.params.aperture;
    cu.uNight.value = this.params.night;
    cu.uTexel.value.set(1 / this.w, 1 / this.h);
    if (this.aoRT) cu.uAOTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
    cu.tDepth.value = this.sceneRT.depthTexture;
    cu.uNear.value = cam.near; cu.uFar.value = cam.far;
    cu.uSoft.value.set(this.params.softStart, this.params.softEnd);
    cu.tScene.value = this.sceneRT.texture;
    cu.tShafts.value = this.shaftRT.texture;
    cu.tBloom.value = m[0].texture;
    cu.uShaftTexel.value.set(1 / this.shaftRT.width, 1 / this.shaftRT.height);
    cu.uExposure.value = this.params.exposure;
    cu.uTime.value = time;
    this._pass(this.compMat, null);
  }
}
