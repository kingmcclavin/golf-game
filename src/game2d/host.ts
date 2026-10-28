import { Px } from './sprites';

/** Anything the 2D host can show: menu backdrop, character preview or a golf round. */
export interface View2D {
  update(dt: number, time: number): void;
  draw(px: Px, w: number, h: number, time: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

export type PixelSize = 'chunky' | 'classic' | 'fine';
/** Short side of the screen in game pixels for each preset. */
const SHORT_SIDE: Record<PixelSize, number> = { chunky: 170, classic: 230, fine: 320 };

/**
 * One shared low-resolution canvas, scaled up with crisp square pixels. Every screen that shows the
 * game world (menu backdrop, character preview, golf round) draws through it.
 */
class Host2D {
  canvas: HTMLCanvasElement | null = null;
  px: Px | null = null;
  failed = false;
  private view: View2D | null = null;
  private container: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private running = false;
  private last = 0;
  pixelSize: PixelSize = 'classic';
  /** CSS pixels per game pixel */
  scale = 2;
  width = 1;
  height = 1;
  fps = 60;
  throttle = 1;
  private frameN = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  init(): boolean {
    if (this.canvas || this.failed) return !!this.canvas;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) {
      this.failed = true;
      return false;
    }
    c.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none';
    this.canvas = c;
    this.px = new Px(ctx);
    document.addEventListener('visibilitychange', () => (this.last = performance.now()));
    return true;
  }

  setPixelSize(p: PixelSize) {
    this.pixelSize = p;
    this.resize();
  }

  attach(el: HTMLElement) {
    if (!this.init() || !this.canvas) return;
    this.container = el;
    el.appendChild(this.canvas);
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
      if (this.canvas?.parentElement === el) el.removeChild(this.canvas);
    }
  }

  setView(v: View2D | null) {
    if (this.view && this.view !== v) this.view.dispose();
    this.view = v;
    this.resize();
  }

  getView() {
    return this.view;
  }

  resize() {
    if (!this.canvas || !this.container) return;
    const cw = Math.max(1, this.container.clientWidth);
    const ch = Math.max(1, this.container.clientHeight);
    this.scale = Math.max(1, Math.round(Math.min(cw, ch) / SHORT_SIDE[this.pixelSize]));
    this.width = Math.ceil(cw / this.scale);
    this.height = Math.ceil(ch / this.scale);
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
    this.px!.ctx.imageSmoothingEnabled = false;
    this.view?.resize?.(this.width, this.height);
  }

  /** CSS client coordinates → game pixel coordinates */
  toGame(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.width, y: ((clientY - r.top) / r.height) * this.height };
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
      }
    }
    if (!this.px || !this.view || !this.container) return;
    if (this.throttle > 1 && this.frameN++ % this.throttle !== 0) return;
    this.view.update(this.throttle > 1 ? dt * this.throttle : dt, t / 1000);
    this.px.ctx.imageSmoothingEnabled = false;
    this.view.draw(this.px, this.width, this.height, t / 1000);
  };
}

export const host = new Host2D();
