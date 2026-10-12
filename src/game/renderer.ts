import * as THREE from 'three';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number, time: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

export type Quality = 'low' | 'medium' | 'high';

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
      this.applyQuality(this.quality);
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
    const dpr = window.devicePixelRatio || 1;
    const q = this.quality;
    return Math.min(dpr, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2);
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
    this.renderer.setSize(w, h, false);
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(w, h);
    }
  }

  /** Keep phones smooth: trade pixels for frame rate (and back) a step at a time. */
  private adaptResolution() {
    if (!this.renderer || this.throttle > 1) return;
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
    this.renderer.render(this.view.scene, this.view.camera);
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
