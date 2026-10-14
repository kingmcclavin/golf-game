import * as THREE from 'three';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number, time: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

export type Quality = 'low' | 'medium' | 'high';
export type Retro = 'off' | 'fine' | 'classic' | 'chunky';

/** Endesga-32 style palette: every pixel of the 3D world snaps to one of these colours. */
export const PALETTE = [
  '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
  '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
  '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
  '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
  // extra greens, sky blues, sand and greys so courses stay readable
  '#9ad84a', '#7fbf3a', '#4fa83a', '#b4e05a', '#2f7a3a', '#1d5a30',
  '#3ca0e8', '#5fbcf0', '#8ad0f4', '#b8e2f8', '#dceff8', '#eef6fa',
  '#f0e0b0', '#d8c088', '#a0a8b0', '#707880', '#4a5058', '#e8e8e8',
];

/** Short side of the low-resolution frame for each retro preset (in game pixels). */
const RETRO_SHORT: Record<Exclude<Retro, 'off'>, number> = { fine: 300, classic: 210, chunky: 150 };

function makeRetroPass(): { scene: THREE.Scene; camera: THREE.OrthographicCamera; material: THREE.ShaderMaterial } {
  const cols = PALETTE.map((c) => new THREE.Color(c));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      palette: { value: cols.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
      exposure: { value: 1.0 },
      dither: { value: 0.055 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      #define N ${cols.length}
      uniform sampler2D tDiffuse;
      uniform vec3 palette[N];
      uniform float exposure;
      uniform float dither;
      varying vec2 vUv;
      // ACES filmic fit (matches three's ACESFilmicToneMapping closely enough)
      vec3 aces(vec3 x) {
        x *= exposure * 0.6;
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      float bayer(vec2 p) {
        // 4x4 ordered dither matrix
        int x = int(mod(p.x, 4.0));
        int y = int(mod(p.y, 4.0));
        int i = x + y * 4;
        float m[16];
        m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
        m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
        for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
        return 0.0;
      }
      void main() {
        vec3 c = toSRGB(aces(texture2D(tDiffuse, vUv).rgb));
        c += vec3(bayer(gl_FragCoord.xy) * dither);
        vec3 best = palette[0];
        float bd = 1e9;
        for (int i = 0; i < N; i++) {
          vec3 d = c - palette[i];
          // weight green more: the eye is most sensitive to it
          float dist = dot(d * d, vec3(0.30, 0.59, 0.11));
          if (dist < bd) { bd = dist; best = palette[i]; }
        }
        gl_FragColor = vec4(best, 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
}

/**
 * Single shared WebGL renderer. Mobile Safari limits the number of WebGL contexts, so every 3D
 * view in the game (menu backdrop, character preview, golf round) renders through this host.
 */
class RendererHost {
  renderer: THREE.WebGLRenderer | null = null;
  failed = false;
  private view: View | null = null;
  private container: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private last = 0;
  private running = false;
  quality: Quality = 'medium';
  retro: Retro = 'classic';
  private rt: THREE.WebGLRenderTarget | null = null;
  private retroPass: ReturnType<typeof makeRetroPass> | null = null;
  fps = 60;
  /** render every Nth frame (used when the 3D view is mostly covered by menus) */
  throttle = 1;
  private frameN = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  init(): boolean {
    if (this.renderer || this.failed) return !!this.renderer;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) ?? canvas.getContext('webgl', { antialias: true });
      if (!gl) throw new Error('WebGL unavailable');
      const r = new THREE.WebGLRenderer({ canvas, context: gl as WebGLRenderingContext, antialias: true });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.0;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      this.renderer = r;
      this.applyRetro(this.retro);
      document.addEventListener('visibilitychange', () => {
        this.last = performance.now();
      });
      return true;
    } catch (e) {
      console.error(e);
      this.failed = true;
      return false;
    }
  }

  /** dynamic resolution factor (0.55..1) lowered automatically when the frame rate drops */
  private dyn = 1;
  private slowT = 0;
  private fastT = 0;

  private basePixelRatio() {
    if (this.retro !== 'off') {
      // render at a fixed low resolution; CSS scales the canvas up with crisp, square pixels
      const w = this.container?.clientWidth ?? window.innerWidth;
      const h = this.container?.clientHeight ?? window.innerHeight;
      const px = Math.max(2, Math.round(Math.min(w, h) / RETRO_SHORT[this.retro]));
      return 1 / px;
    }
    const dpr = window.devicePixelRatio || 1;
    const q = this.quality;
    return Math.min(dpr, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2);
  }

  applyRetro(r: Retro) {
    this.retro = r;
    if (!this.renderer) return;
    const c = this.renderer.domElement;
    c.style.imageRendering = r === 'off' ? 'auto' : 'pixelated';
    this.renderer.shadowMap.type = r === 'off' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.applyQuality(this.quality);
  }

  applyQuality(q: Quality) {
    this.quality = q;
    this.dyn = 1;
    if (!this.renderer) return;
    this.renderer.setPixelRatio(this.basePixelRatio());
    this.renderer.shadowMap.enabled = q !== 'low';
    this.resize();
  }

  attach(el: HTMLElement) {
    if (!this.init() || !this.renderer) return;
    this.container = el;
    el.appendChild(this.renderer.domElement);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }
  }

  detach(el: HTMLElement) {
    if (this.container === el) {
      this.ro?.disconnect();
      this.container = null;
      if (this.renderer?.domElement.parentElement === el) el.removeChild(this.renderer.domElement);
    }
  }

  get canvas() {
    return this.renderer?.domElement ?? null;
  }

  setView(v: View | null) {
    if (this.view && this.view !== v) this.view.dispose();
    this.view = v;
    this.resize();
  }

  getView() {
    return this.view;
  }

  resize() {
    if (!this.renderer || !this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (this.retro !== 'off') this.renderer.setPixelRatio(this.basePixelRatio());
    this.renderer.setSize(w, h, false);
    if (this.retro !== 'off') {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      if (!this.rt) {
        this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
        this.retroPass = makeRetroPass();
      } else this.rt.setSize(size.x, size.y);
    }
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(w, h);
    }
  }

  /** Keep phones smooth: trade pixels for frame rate (and back) a step at a time. */
  private adaptResolution() {
    if (!this.renderer || this.throttle > 1 || this.retro !== 'off') return;
    if (this.fps < 42) { this.slowT++; this.fastT = 0; } else if (this.fps > 57) { this.fastT++; this.slowT = 0; } else { this.slowT = 0; this.fastT = 0; }
    let next = this.dyn;
    if (this.slowT >= 2 && this.dyn > 0.56) next = Math.max(0.55, this.dyn - 0.15);
    if (this.fastT >= 5 && this.dyn < 1) next = Math.min(1, this.dyn + 0.1);
    if (next !== this.dyn) {
      this.dyn = next;
      this.slowT = 0;
      this.fastT = 0;
      this.renderer.setPixelRatio(this.basePixelRatio() * next);
      this.resize();
    }
  }

  private loop = (t: number) => {
    requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (dt > 0) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 1) {
        this.fps = this.fpsN / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsN = 0;
        this.adaptResolution();
      }
    }
    if (!this.renderer || !this.view || !this.container) return;
    if (this.throttle > 1 && this.frameN++ % this.throttle !== 0) return;
    this.view.update(this.throttle > 1 ? dt * this.throttle : dt, t / 1000);
    if (this.retro !== 'off' && this.rt && this.retroPass) {
      // 1) scene into a low-res linear target, 2) tone map + dither + palette snap onto the canvas
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.view.scene, this.view.camera);
      this.renderer.setRenderTarget(null);
      this.retroPass.material.uniforms.tDiffuse.value = this.rt.texture;
      this.renderer.render(this.retroPass.scene, this.retroPass.camera);
    } else {
      this.renderer.render(this.view.scene, this.view.camera);
    }
  };
}

export const host = new RendererHost();

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMat);
    else if (mat) disposeMat(mat);
  });
}

function disposeMat(m: THREE.Material) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  m.dispose();
}
