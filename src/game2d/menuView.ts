import { clubById } from '../data/clubs';
import type { Outfit } from '../data/cosmetics';
import { getHoleWorld } from '../golf/course';
import type { Camera } from './course';
import { CourseMap } from './course';
import { Golfer } from './golfer';
import type { View2D } from './host';
import { drawBag, drawGolfer, INK, project, Px } from './sprites';

/** Main-menu backdrop: the first hole drifting by, with your golfer taking practice swings on the tee. */
export class MenuView implements View2D {
  private map: CourseMap;
  private golfer = new Golfer(clubById('drv_timberline'));
  private t = Math.random() * 10;
  private swingT = 2;

  constructor(courseId: string, private outfit: Outfit, quality: 'low' | 'medium' | 'high') {
    this.map = new CourseMap(getHoleWorld(courseId, 0), quality);
  }

  setOutfit(o: Outfit) {
    this.outfit = o;
  }

  update(dt: number) {
    this.t += dt;
    this.swingT -= dt;
    if (this.swingT <= 0 && this.golfer.phase === 'address') {
      this.golfer.autoSwing(0.9, () => undefined);
      this.swingT = 6;
    }
    if (this.golfer.phase === 'finish' && this.swingT < 3) this.golfer.reset();
    this.golfer.update(dt);
  }

  draw(px: Px, W: number, H: number, time: number) {
    const m = this.map;
    // slow drift up and down the hole near the tee
    const ppm = Math.max(3, Math.min(W, H) / 40);
    // tee sits right of centre (clear of the menu buttons) and in the lower part of the screen
    const right = W > H ? W * 0.22 : 0;
    const cam: Camera = { u: -right / ppm + Math.sin(this.t * 0.05) * 2, w: (H * 0.22) / ppm + (Math.sin(this.t * 0.04) * 0.5 + 0.5) * 6, ppm };
    m.draw(px, cam, W, H, time);
    const tee = m.world.hole.tee;
    const q = m.toScreen(cam, W, H, tee.x, tee.z);
    const s = Math.min(W, H) / 9;
    const view = { x: 0, y: 0, s, yaw: 0 };
    const pb = project({ x: this.golfer.ballOffset, y: 0.03, z: 0 }, view);
    view.x = q.x - pb.x;
    view.y = q.y - pb.y;
    const bag = project({ x: -0.55, y: 0, z: -0.55 }, view);
    drawBag(px, bag.x, bag.y, s, this.outfit);
    drawGolfer(px, this.golfer.skeleton(), this.outfit, view, { color: '#e43b44', category: 'driver' });
    if (this.golfer.phase === 'address' || this.golfer.phase === 'backswing') {
      px.rect(q.x - 1, q.y - 1, 3, 3, INK);
      px.rect(q.x, q.y, 2, 2, '#ffffff');
    }
  }

  dispose() {}
}
