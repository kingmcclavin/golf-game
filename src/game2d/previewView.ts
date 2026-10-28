import { clubById } from '../data/clubs';
import type { Outfit } from '../data/cosmetics';
import { Golfer } from './golfer';
import type { View2D } from './host';
import { drawBag, drawGolfer, INK, Px } from './sprites';

/** Character customisation: the golfer sprite on a podium, rotatable and gently animated. */
export class PreviewView implements View2D {
  golfer = new Golfer(clubById('i7_copper'));
  yaw = -0.6;
  private targetYaw = -0.6;
  private sprite: HTMLCanvasElement;
  private sctx: Px;
  private t = 0;
  private demoT = 3;

  constructor(public outfit: Outfit) {
    this.sprite = document.createElement('canvas');
    this.sprite.width = 64;
    this.sprite.height = 64;
    this.sctx = new Px(this.sprite.getContext('2d')!);
  }

  setOutfit(o: Outfit) {
    this.outfit = o;
  }

  rotate(dx: number) {
    this.targetYaw += dx * 0.02;
  }

  update(dt: number) {
    this.t += dt;
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    // every few seconds, show off a practice swing
    this.demoT -= dt;
    if (this.demoT <= 0 && (this.golfer.phase === 'address' || this.golfer.phase === 'idle')) {
      this.golfer.autoSwing(0.95, () => undefined);
      this.demoT = 7;
    }
    if (this.golfer.phase === 'finish' && this.demoT < 4.5) this.golfer.reset();
    this.golfer.update(dt);
  }

  draw(px: Px, w: number, h: number) {
    const ctx = px.ctx;
    // backdrop: banded sky and grass
    const bands = ['#124e89', '#0099db', '#2ce8f5'];
    for (let i = 0; i < 3; i++) px.rect(0, (h * 0.55 * i) / 3, w, h * 0.55 / 3 + 1, bands[i]);
    px.rect(0, h * 0.55, w, h * 0.45, '#3e8948');
    for (let x = 0; x < w; x += 4) px.dot(x + ((x / 4) % 2) * 2, h * 0.55 + 2, '#63c74d');
    // sprite at native resolution, then scaled up with whole pixels
    const sp = this.sctx;
    sp.ctx.clearRect(0, 0, 64, 64);
    const sk = this.golfer.skeleton();
    const view = { x: 30, y: 52, s: 15, yaw: this.yaw };
    drawBag(sp, 30 - Math.cos(this.yaw) * 14 - 2, 52 + Math.sin(this.yaw) * 4 - 2, 15, this.outfit);
    drawGolfer(sp, sk, this.outfit, view, { color: this.golfer.club?.color ?? '#fff', category: this.golfer.club?.category ?? 'iron' });
    const k = Math.max(2, Math.floor(Math.min(w / 40, h / 46)));
    const ox = Math.round(w / 2 - 32 * k), oy = Math.round(h * 0.86 - 52 * k);
    // podium
    px.ellipse(w / 2, h * 0.86, 15 * k, 4 * k, INK);
    px.ellipse(w / 2, h * 0.86 - 1, 14 * k, 3.5 * k, '#feae34');
    px.ellipse(w / 2, h * 0.86 - 2, 13 * k, 3 * k, '#63c74d');
    ctx.drawImage(this.sprite, ox, oy, 64 * k, 64 * k);
  }

  dispose() {}
}
