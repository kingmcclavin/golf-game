import * as THREE from 'three';
import { cosmeticById, SKIN_TONES, type Outfit } from '../data/cosmetics';
import { SUBTYPES, type ClubDef } from '../data/clubs';

const texCache = new Map<string, THREE.Texture>();

function patternTexture(style: string, c1: string, c2: string): THREE.Texture | null {
  if (!['stripe', 'argyle', 'flame', 'floral', 'plaid'].includes(style)) return null;
  const key = `${style}:${c1}:${c2}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = c1;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = c2;
  if (style === 'stripe') for (let y = 0; y < 128; y += 22) g.fillRect(0, y, 128, 9);
  if (style === 'argyle') {
    for (let y = -32; y < 160; y += 64)
      for (let x = -32; x < 160; x += 64) {
        g.beginPath();
        g.moveTo(x + 32, y);
        g.lineTo(x + 64, y + 32);
        g.lineTo(x + 32, y + 64);
        g.lineTo(x, y + 32);
        g.closePath();
        g.fill();
      }
  }
  if (style === 'plaid') {
    g.globalAlpha = 0.55;
    for (let i = 0; i < 128; i += 32) {
      g.fillRect(i, 0, 12, 128);
      g.fillRect(0, i, 128, 12);
    }
    g.globalAlpha = 1;
  }
  if (style === 'flame') {
    for (let x = -10; x < 140; x += 26) {
      g.beginPath();
      g.moveTo(x, 128);
      g.quadraticCurveTo(x + 6, 70, x + 14, 40 + (x % 3) * 10);
      g.quadraticCurveTo(x + 20, 80, x + 28, 128);
      g.fill();
    }
  }
  if (style === 'floral') {
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 128, y = (i * 53) % 128;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x + Math.cos(k * 1.26) * 7, y + Math.sin(k * 1.26) * 7, 5, 0, 7);
        g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  texCache.set(key, tex);
  return tex;
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

interface Pose {
  hipsYaw: number;
  shoulderYaw: number;
  bend: number;
  headYaw: number;
  hands: THREE.Vector3;
  shaft: THREE.Vector3;
  legTurn: number;
  hipShift?: number;
  heel?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const ARM_UPPER = 0.33;
const ARM_FORE = 0.32;
const LEG_UPPER = 0.47;
const LEG_LOWER = 0.46;
// elbow hints: both elbows point toward the ground, the lead one slightly toward the target
const LEAD_POLE = new THREE.Vector3(-0.25, -1, -0.45).normalize();
const TRAIL_POLE = new THREE.Vector3(-0.25, -1, 0.5).normalize();

export type SwingPhase = 'idle' | 'address' | 'backswing' | 'downswing' | 'follow' | 'finish' | 'celebrate' | 'sad';

/**
 * Modular low-poly golfer assembled from primitives. Cosmetic items swap individual parts, so any
 * combination of outfit pieces works without bespoke models.
 */
export class GolferModel {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private armRig: Array<{ side: number; shoulderJoint: THREE.Mesh; upper: THREE.Mesh; elbowJoint: THREE.Mesh; fore: THREE.Mesh; hand: THREE.Mesh }> = [];
  private shoulderW = 0.2;
  private hipW = 0.11;
  private legRig: Array<{ side: number; foot: THREE.Group; thigh: THREE.Mesh; knee: THREE.Mesh; shin: THREE.Mesh }> = [];
  private wristAcc: THREE.Mesh | null = null;
  private clubPivot = new THREE.Group();
  private clubMesh = new THREE.Group();
  readonly bag = new THREE.Group();
  phase: SwingPhase = 'idle';
  private phaseT = 0;
  private back = 0;
  private swingFrom = 0;
  private followAmt = 1;
  private putter = false;
  private onImpact: (() => void) | null = null;
  ballOffset = 0.9;
  clubLen = 0.95;
  private bend = -0.45;
  private time = Math.random() * 10;

  constructor(public outfit: Outfit, club?: ClubDef) {
    this.build();
    if (club) this.setClub(club);
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.bag.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  setOutfit(o: Outfit) {
    this.outfit = o;
    const keepClub = this.clubDef;
    this.root.clear();
    this.bag.clear();
    this.hips = new THREE.Group();
    this.spine = new THREE.Group();
    this.head = new THREE.Group();
    this.armRig = [];
    this.legRig = [];
    this.wristAcc = null;
    this.clubPivot = new THREE.Group();
    this.clubMesh = new THREE.Group();
    this.build();
    if (keepClub) this.setClub(keepClub);
  }

  private clubDef: ClubDef | null = null;

  private build() {
    const o = this.outfit;
    const skin = mat(SKIN_TONES[o.skin] ?? SKIN_TONES[1], { roughness: 0.6 });
    const shirt = cosmeticById(o.shirt);
    const pants = cosmeticById(o.pants);
    const shoes = cosmeticById(o.shoes);
    const widthMul = o.body === 'slim' ? 0.86 : o.body === 'broad' ? 1.17 : 1;
    const shirtTex = shirt ? patternTexture(shirt.style, shirt.color, shirt.color2 ?? '#ffffff') : null;
    const shirtMat = mat(shirtTex ? '#ffffff' : shirt?.color ?? '#ffffff', shirtTex ? { map: shirtTex } : {});
    const sleeveMat = shirt?.style === 'vest' ? mat(shirt.color2 ?? '#ffffff') : shirtMat;
    const pantsTex = pants ? patternTexture(pants.style, pants.color, pants.color2 ?? '#000000') : null;
    const pantsMat = mat(pantsTex ? '#ffffff' : pants?.color ?? '#c8b48a', pantsTex ? { map: pantsTex } : {});
    const shoeMat = mat(shoes?.color ?? '#ffffff', { roughness: 0.4 });
    const soleMat = mat(shoes?.color2 ?? '#222222');

    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    // legs
    const shorts = pants?.style === 'shorts';
    const skirt = pants?.style === 'skirt';
    // legs: thigh + shin solved by IK between the hip and a planted foot (pivoting on the toe)
    const legMat = skirt ? skin : pantsMat;
    const shinMat = shorts || skirt ? skin : pantsMat;
    const unitLeg = (r1: number, r2: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 1, 8).translate(0, 0.5, 0), m);
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    this.legRig = [-1, 1].map((side) => {
      const foot = new THREE.Group();
      foot.rotation.order = 'YZX';
      // group origin is the toe on the ground; the heel lifts by pitching about it
      foot.position.set(0.23, 0, side * (0.11 * widthMul + 0.1));
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.12), shoeMat);
      shoe.position.set(-0.14, 0.045, 0);
      shoe.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.03, 0.125), soleMat);
      sole.position.set(-0.14, 0.0, 0);
      foot.add(shoe, sole);
      if (shorts || skirt) {
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.16, 8), mat('#f4f4f4'));
        sock.position.set(-0.2, 0.13, 0);
        foot.add(sock);
      }
      this.root.add(foot);
      const thigh = unitLeg(0.085 * widthMul, 0.075 * widthMul, legMat);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.072 * widthMul, 10, 8), shinMat);
      knee.castShadow = true;
      this.root.add(knee);
      const shin = unitLeg(0.07 * widthMul, 0.055, shinMat);
      return { side, foot, thigh, knee, shin };
    });
    this.hipW = 0.11 * widthMul;
    if (skirt) {
      const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * widthMul, 0.26 * widthMul, 0.32, 12), pantsMat);
      sk.position.y = -0.12;
      sk.castShadow = true;
      this.hips.add(sk);
    }
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17 * widthMul, 12, 8), pantsMat);
    pelvis.scale.set(0.8, 0.7, 1.15);
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // spine / torso
    this.hips.add(this.spine);
    // twist about the spine's own axis, then tilt forward: the shoulder plane tilts like a real turn
    this.spine.rotation.order = 'ZYX';
    this.spine.rotation.z = this.bend;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * widthMul, 0.16 * widthMul, 0.56, 12), shirtMat);
    torso.scale.set(0.75, 1, 1.15);
    torso.position.y = 0.28;
    torso.castShadow = true;
    this.spine.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2 * widthMul, 12, 8), shirtMat);
    chest.scale.set(0.75, 0.55, 1.15);
    chest.position.y = 0.52;
    chest.castShadow = true;
    this.spine.add(chest);
    if (shirt?.style === 'polo' || shirt?.style === 'vest') {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), mat(shirt.color2 ?? '#ffffff'));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.62;
      this.spine.add(collar);
    }
    // accessory: towel / chain / cape / scarf
    const acc = cosmeticById(o.accessory);
    if (acc?.style === 'chain') {
      const ch = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), mat(acc.color, { metalness: 0.8, roughness: 0.25 }));
      ch.rotation.set(Math.PI / 2 - 0.5, 0, 0);
      ch.position.set(0.06, 0.58, 0);
      ch.rotation.y = Math.PI / 2;
      this.spine.add(ch);
    }
    if (acc?.style === 'scarf') {
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 16), mat(acc.color));
      sc.rotation.x = Math.PI / 2;
      sc.position.y = 0.62;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.1), mat(acc.color2 ?? acc.color));
      tail.position.set(0.12, 0.48, 0.08);
      this.spine.add(sc, tail);
    }
    if (acc?.style === 'cape') {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75, 1, 3), mat(acc.color, { side: THREE.DoubleSide }));
      cape.rotation.y = Math.PI / 2;
      cape.position.set(-0.17, 0.25, 0);
      cape.rotation.z = 0.08;
      this.spine.add(cape);
    }
    if (acc?.style === 'towel') {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.16), mat(acc.color));
      tw.position.set(0, -0.12, -0.2 * widthMul);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.162), mat(acc.color2 ?? '#2a6ad8'));
      stripe.position.copy(tw.position).add(new THREE.Vector3(0, -0.08, 0));
      this.hips.add(tw, stripe);
    }

    // head
    this.spine.add(this.head);
    this.head.position.y = 0.78;
    this.head.rotation.z = -this.bend * 0.7; // keep looking at the ball
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 8), skin);
    neck.position.y = -0.1;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    skull.scale.set(1, 1.08, 0.95);
    skull.castShadow = true;
    this.head.add(skull);
    this.buildFace(o);
    this.buildHair(o);
    this.buildHat(o);
    this.buildGlasses(o);

    // arms: upper arm + forearm per side, posed every frame by two-bone IK so the hands stay on the grip
    const glove = cosmeticById(o.gloves);
    const gloveMat = glove ? mat(glove.color) : skin;
    const longSleeve = !(shirt?.style === 'tee' || shirt?.style === 'polo' || shirt?.style === 'floral' || !shirt);
    const unitLimb = (r1: number, r2: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 1, 8).translate(0, 0.5, 0), m);
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    const ball = (r: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    this.armRig = [-1, 1].map((side) => ({
      side,
      shoulderJoint: ball(0.07 * widthMul, sleeveMat),
      upper: unitLimb(0.066 * widthMul, 0.055 * widthMul, sleeveMat),
      elbowJoint: ball(0.05, longSleeve ? sleeveMat : skin),
      fore: unitLimb(0.05, 0.042, longSleeve ? sleeveMat : skin),
      // the lead (left, target-side) hand wears the glove
      hand: ball(0.05, side === -1 ? gloveMat : skin),
    }));
    this.shoulderW = 0.2 * widthMul;
    if (acc?.style === 'watch' || acc?.style === 'wristband') {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.016, 6, 12), mat(acc.color, { metalness: acc.style === 'watch' ? 0.8 : 0, roughness: 0.3 }));
      this.wristAcc = w;
      this.root.add(w);
    }
    this.root.add(this.clubPivot);
    this.clubPivot.add(this.clubMesh);
    this.pose(this.addressPose());

    this.buildBag(o);
  }

  private buildFace(o: Outfit) {
    const dark = mat('#1d1d22', { roughness: 0.3 });
    const f = o.face;
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(f === 1 ? 0.016 : 0.02, 8, 6), dark);
      eye.position.set(0.115, 0.025, side * 0.045);
      if (f === 2) eye.scale.y = 0.6;
      this.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 0.045), mat(o.hairColor));
      brow.position.set(0.12, 0.07, side * 0.047);
      brow.rotation.x = f === 1 ? side * 0.35 : f === 3 ? -side * 0.15 : 0;
      this.head.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), mat(SKIN_TONES[o.skin] ?? '#e8b896'));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.135, -0.01, 0);
    this.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10, f === 1 ? 0.8 : Math.PI * 0.8), mat('#8a3a3a'));
    mouth.rotation.set(0, Math.PI / 2, f === 1 ? Math.PI : Math.PI + 0.3);
    mouth.position.set(0.118, -0.05, f === 1 ? 0.013 : 0.022);
    if (f !== 1) mouth.rotation.z = Math.PI * 1.1;
    this.head.add(mouth);
  }

  private buildHair(o: Outfit) {
    const hat = cosmeticById(o.hat);
    const hm = mat(o.hairColor, { roughness: 0.9 });
    const style = o.hairStyle;
    if (style === 'bald') return;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * (style === 'buzz' ? 0.42 : 0.55)), hm);
    cap.position.y = 0.012;
    cap.rotation.z = 0.25;
    this.head.add(cap);
    if (hat && hat.style !== 'headband' && hat.style !== 'visor') {
      // most hair hidden by the hat; keep a back fringe for long styles
    } else {
      if (style === 'spiky') for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), hm);
        sp.position.set(-0.04 + (i % 3) * 0.05, 0.13, -0.06 + (i % 4) * 0.04);
        sp.rotation.set((i - 3) * 0.12, 0, (i % 3 - 1) * 0.3 + 0.2);
        this.head.add(sp);
      }
      if (style === 'mohawk') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), hm);
        m.position.set(-0.02, 0.15, 0);
        this.head.add(m);
      }
      if (style === 'curly') for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), hm);
        const a = (i / 9) * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.08 - 0.02, 0.1 + (i % 2) * 0.02, Math.sin(a) * 0.09);
        this.head.add(b);
      }
      if (style === 'slick') {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), hm);
        s.position.set(-0.01, 0.03, 0);
        s.scale.set(1.08, 1.05, 1.02);
        this.head.add(s);
      }
    }
    if (style === 'long' || style === 'bob') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, style === 'long' ? 0.32 : 0.18, 0.26), hm);
      back.position.set(-0.09, style === 'long' ? -0.08 : 0.0, 0);
      this.head.add(back);
    }
    if (style === 'ponytail') {
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 8), hm);
      pt.position.set(-0.17, -0.02, 0);
      pt.rotation.z = -0.6;
      this.head.add(pt);
    }
    if (style === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hm);
      bun.position.set(-0.1, 0.12, 0);
      this.head.add(bun);
    }
  }

  private buildHat(o: Outfit) {
    const hat = cosmeticById(o.hat);
    if (!hat) return;
    const m1 = mat(hat.color);
    const m2 = mat(hat.color2 ?? hat.color);
    const g = new THREE.Group();
    g.position.y = 0.04;
    g.rotation.z = 0.12;
    switch (hat.style) {
      case 'cap': {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m1);
        const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 14, 1, false, -Math.PI / 2, Math.PI), m1);
        bill.position.set(0.11, 0.0, 0);
        bill.scale.set(1.1, 1, 1);
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), m2);
        button.position.y = 0.145;
        const logo = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), m2);
        logo.position.set(0.128, 0.07, 0);
        logo.rotation.y = Math.PI / 2;
        g.add(crown, bill, button, logo);
        break;
      }
      case 'visor': {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.02, 6, 20), m1);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.04;
        const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.014, 14, 1, false, -Math.PI / 2, Math.PI), m2);
        bill.position.set(0.11, 0.03, 0);
        g.add(band, bill);
        break;
      }
      case 'bucket': {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 0.13, 14), m1);
        crown.position.y = 0.07;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.02, 16), m1);
        brim.position.y = 0.01;
        g.add(crown, brim);
        break;
      }
      case 'beanie': {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m1);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), m2);
        cuff.position.y = 0.0;
        const bob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m2);
        bob.position.y = 0.16;
        g.add(crown, cuff, bob);
        break;
      }
      case 'flat': {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m1);
        crown.scale.set(1.15, 0.6, 1);
        const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.016, 12, 1, false, -Math.PI / 2, Math.PI), m2);
        bill.position.set(0.12, 0.01, 0);
        g.add(crown, bill);
        break;
      }
      case 'wide': {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.15, 14), m1);
        crown.position.y = 0.08;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 18), m1);
        brim.scale.set(1, 1, 0.85);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.03, 14), m2);
        band.position.y = 0.03;
        g.add(crown, brim, band);
        break;
      }
      case 'crown': {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10, 1, true), mat(hat.color, { metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide }));
        ring.position.y = 0.08;
        g.add(ring);
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5), mat(hat.color, { metalness: 0.9, roughness: 0.2 }));
          const a = (i / 5) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 0.12, 0.15, Math.sin(a) * 0.12);
          const gem = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), mat(hat.color2 ?? '#ff0000', { roughness: 0.1 }));
          gem.position.set(Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13);
          g.add(sp, gem);
        }
        break;
      }
      case 'headband': {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.136, 0.022, 6, 20), m1);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.03;
        g.add(band);
        break;
      }
    }
    this.head.add(g);
  }

  private buildGlasses(o: Outfit) {
    const gl = cosmeticById(o.glasses);
    if (!gl) return;
    const m = mat(gl.color, { roughness: 0.2, metalness: 0.3 });
    const g = new THREE.Group();
    g.position.set(0.125, 0.025, 0);
    if (gl.style === 'sport') {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.2), m);
      g.add(visor);
    } else {
      for (const side of [-1, 1]) {
        let lens: THREE.Mesh;
        if (gl.style === 'round') lens = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), m);
        else if (gl.style === 'star') lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 5), m);
        else lens = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.06), m);
        lens.position.z = side * 0.046;
        if (gl.style !== 'shades') lens.rotation.y = Math.PI / 2;
        g.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.03), m);
      g.add(bridge);
    }
    this.head.add(g);
  }

  private buildBag(o: Outfit) {
    const b = cosmeticById(o.bag);
    const m1 = mat(b?.color ?? '#3a6a3a');
    const m2 = mat(b?.color2 ?? '#c8b48a');
    const style = b?.style ?? 'carry';
    const r = style === 'staff' ? 0.16 : style === 'stand' ? 0.13 : 0.11;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.85, 14), m1);
    body.position.y = 0.45;
    body.castShadow = true;
    const top = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 16), m2);
    top.rotation.x = Math.PI / 2;
    top.position.y = 0.87;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, r * 1.2), m2);
    pocket.position.set(r, 0.4, 0);
    this.bag.add(body, top, pocket);
    if (style === 'staff') {
      for (const y of [0.2, 0.7]) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.05, 14), m2);
        band.position.y = y;
        this.bag.add(band);
      }
    }
    if (style === 'stand') {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), mat('#333333'));
        leg.position.set(-0.12, 0.38, s * 0.08);
        leg.rotation.z = -0.3;
        this.bag.add(leg);
      }
    }
    const headMat = mat('#c8ccd2', { metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), headMat);
      const a = (i / 5) * Math.PI * 2;
      shaft.position.set(Math.cos(a) * r * 0.5, 1.0, Math.sin(a) * r * 0.5);
      const hd = new THREE.Mesh(i < 2 ? new THREE.SphereGeometry(0.05, 8, 6) : new THREE.BoxGeometry(0.08, 0.04, 0.03), i < 2 ? mat('#202020') : headMat);
      hd.position.set(shaft.position.x, 1.18, shaft.position.z);
      this.bag.add(shaft, hd);
    }
    this.bag.rotation.z = 0.18;
  }

  setClub(def: ClubDef) {
    this.clubDef = def;
    this.clubMesh.clear();
    const st = SUBTYPES[def.subtype];
    this.clubLen = st.length;
    this.putter = def.category === 'putter';
    const dy = 0.8;
    this.ballOffset = 0.38 + Math.sqrt(Math.max(0.05, st.length * st.length - dy * dy)) * (this.putter ? 0.9 : 1);
    const shaftMat = mat('#d8dce2', { metalness: 0.8, roughness: 0.25 });
    const gripMat = mat('#202024');
    const headCol = def.category === 'driver' || def.category === 'wood' ? '#2a2a30' : '#c8ccd4';
    const headMat = mat(headCol, { metalness: 0.7, roughness: 0.25 });
    const accent = mat(def.color, { emissive: def.color, emissiveIntensity: 0.25 });
    const L = st.length;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, L, 6), shaftMat);
    shaft.position.y = -L / 2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.24, 8), gripMat);
    grip.position.y = -0.1;
    let head: THREE.Mesh;
    if (def.category === 'driver' || def.category === 'wood') head = new THREE.Mesh(new THREE.SphereGeometry(def.category === 'driver' ? 0.065 : 0.05, 12, 8), headMat);
    else if (def.category === 'hybrid') head = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), headMat);
    else if (this.putter) head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.11), headMat);
    else head = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.012), headMat);
    if (def.category === 'driver' || def.category === 'wood' || def.category === 'hybrid') head.scale.set(1.4, 0.6, 1);
    head.position.set(0.04, -L, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.04, 6), accent);
    band.position.y = -L + 0.12;
    for (const m of [shaft, grip, head, band]) m.castShadow = true;
    this.clubMesh.add(shaft, grip, head, band);
    this.pose(this.addressPose());
  }

  /** Place the golfer so the club meets the ball, facing along the aim yaw. */
  placeAtBall(ball: THREE.Vector3, aimYaw: number, groundY: (x: number, z: number) => number) {
    const th = -aimYaw;
    this.root.rotation.y = th;
    // local +x (toward ball) in world after rotation
    const fx = Math.cos(th), fz = -Math.sin(th);
    const x = ball.x - fx * this.ballOffset;
    const z = ball.z - fz * this.ballOffset;
    this.root.position.set(x, groundY(x, z), z);
    // bag behind the golfer
    const bx = x - fx * 1.0 + Math.sin(th) * -0.9;
    const bz = z - fz * 1.0 + Math.cos(th) * -0.9;
    this.bag.position.set(bx, groundY(bx, bz), bz);
    this.bag.rotation.y = th + 0.6;
  }

  setBackswing(b: number) {
    if (this.phase !== 'address' && this.phase !== 'backswing' && this.phase !== 'idle') return;
    this.phase = b > 0.01 ? 'backswing' : 'address';
    this.back = Math.max(0, Math.min(1.12, b));
  }

  swing(onImpact: () => void, power = 1) {
    this.onImpact = onImpact;
    this.swingFrom = Math.max(this.back, 0.12);
    this.followAmt = this.putter ? 0.45 + Math.min(1, power) * 0.5 : Math.max(0.45, Math.min(1, 0.3 + power * 0.75));
    this.phase = 'downswing';
    this.phaseT = 0;
  }

  /** Bots wind up automatically before swinging. */
  autoSwing(power: number, onImpact: () => void) {
    this.phase = 'backswing';
    this.phaseT = 0;
    this.autoTarget = power;
    this.autoCb = onImpact;
  }
  private autoTarget = 0;
  private autoCb: (() => void) | null = null;

  react(kind: 'celebrate' | 'sad') {
    this.phase = kind;
    this.phaseT = 0;
  }

  reset() {
    this.phase = 'address';
    this.back = 0;
    this.phaseT = 0;
    this.onImpact = null;
    this.autoCb = null;
  }

  // ------------------------------------------------------------------ swing rig
  // Root frame: +x toward the ball, +y up, target along -z (the golfer's lead side).
  // A pose places the hips and shoulders (turning about the tilted spine), the hands on the swing
  // path and the club shaft direction; the arms are then solved with two-bone IK.

  private ballPos() {
    return new THREE.Vector3(this.ballOffset, 0.03, 0);
  }

  private addressPose(): Pose {
    const hands = new THREE.Vector3(0.38, 0.82, 0);
    return { hipsYaw: 0, shoulderYaw: 0, bend: this.bend, headYaw: 0, hands, shaft: this.ballPos().sub(hands).normalize(), legTurn: 0 };
  }

  private impactPose(): Pose {
    const hands = new THREE.Vector3(0.41, 0.84, -0.06);
    return { hipsYaw: 0.5, shoulderYaw: 0.22, bend: this.bend + 0.03, headYaw: -0.22, hands, shaft: this.ballPos().sub(hands).normalize(), legTurn: 0.4, hipShift: -0.04, heel: 0.1 };
  }

  /** Backswing keyed to a real swing: takeaway, lead arm parallel (wrists set), top. */
  private backKeys(): Array<[number, Pose]> {
    const P = (h: number, s: number, hands: [number, number, number], shaft: [number, number, number], leg = 0): Pose => ({
      hipsYaw: h, shoulderYaw: s, bend: this.bend, headYaw: -s * 0.85, hands: new THREE.Vector3(...hands), shaft: new THREE.Vector3(...shaft).normalize(), legTurn: leg,
    });
    return [
      [0, this.addressPose()],
      [0.3, P(-0.16, -0.55, [0.37, 0.9, 0.3], [0.12, -0.18, 1])],
      [0.62, P(-0.45, -1.18, [0.24, 1.2, 0.44], [0.12, 1, 0.22], -0.12)],
      [1.0, P(-0.78, -1.62, [0.12, 1.88, 0.26], [-0.22, 0.14, -1], -0.22)],
      [1.12, P(-0.85, -1.8, [0.08, 1.9, 0.22], [-0.3, -0.25, -0.92], -0.26)],
    ];
  }

  /** Follow-through: release (club parallel toward the target), arms up, high wrapped finish. */
  private followKeys(): Array<[number, Pose]> {
    const P = (h: number, s: number, bend: number, head: number, hands: [number, number, number], shaft: [number, number, number], leg: number): Pose => ({
      hipsYaw: h, shoulderYaw: s, bend, headYaw: head, hands: new THREE.Vector3(...hands), shaft: new THREE.Vector3(...shaft).normalize(), legTurn: leg,
    });
    return [
      [0, this.impactPose()],
      [0.3, { ...P(0.95, 0.95, -0.36, -0.55, [0.35, 0.98, -0.38], [0.12, 0.02, -1], 0.75), hipShift: -0.08, heel: 0.35 }],
      [0.62, { ...P(1.3, 1.5, -0.24, -0.5, [0.12, 1.42, -0.48], [0.0, 1, -0.25], 1.0), hipShift: -0.13, heel: 0.75 }],
      [1.0, { ...P(1.55, 1.95, -0.06, 0, [-0.22, 1.74, -0.2], [-0.5, -0.5, 0.7], 1.2), hipShift: -0.16, heel: 1 }],
    ];
  }

  private sample(keys: Array<[number, Pose]>, t: number): Pose {
    t = Math.max(keys[0][0], Math.min(keys[keys.length - 1][0], t));
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)][1], k1 = keys[i][1], k2 = keys[i + 1][1], k3 = keys[Math.min(keys.length - 1, i + 2)][1];
    const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0] || 1);
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    const v = (f: (p: Pose) => THREE.Vector3) =>
      new THREE.Vector3(cr(f(k0).x, f(k1).x, f(k2).x, f(k3).x), cr(f(k0).y, f(k1).y, f(k2).y, f(k3).y), cr(f(k0).z, f(k1).z, f(k2).z, f(k3).z));
    return {
      hipsYaw: cr(k0.hipsYaw, k1.hipsYaw, k2.hipsYaw, k3.hipsYaw),
      shoulderYaw: cr(k0.shoulderYaw, k1.shoulderYaw, k2.shoulderYaw, k3.shoulderYaw),
      bend: cr(k0.bend, k1.bend, k2.bend, k3.bend),
      headYaw: cr(k0.headYaw, k1.headYaw, k2.headYaw, k3.headYaw),
      hands: v((p) => p.hands),
      // slerp-like: normalised Catmull-Rom of the direction keeps the club sweeping smoothly
      shaft: v((p) => p.shaft).normalize(),
      legTurn: cr(k0.legTurn, k1.legTurn, k2.legTurn, k3.legTurn),
      hipShift: cr(k0.hipShift ?? 0, k1.hipShift ?? 0, k2.hipShift ?? 0, k3.hipShift ?? 0),
      heel: Math.max(0, cr(k0.heel ?? 0, k1.heel ?? 0, k2.heel ?? 0, k3.heel ?? 0)),
    };
  }

  private mixPose(a: Pose, b: Pose, k: number): Pose {
    const l = (x: number, y: number) => x + (y - x) * k;
    return {
      hipsYaw: l(a.hipsYaw, b.hipsYaw), shoulderYaw: l(a.shoulderYaw, b.shoulderYaw), bend: l(a.bend, b.bend), headYaw: l(a.headYaw, b.headYaw),
      hands: a.hands.clone().lerp(b.hands, k), shaft: a.shaft.clone().lerp(b.shaft, k).normalize(), legTurn: l(a.legTurn, b.legTurn),
      hipShift: l(a.hipShift ?? 0, b.hipShift ?? 0), heel: l(a.heel ?? 0, b.heel ?? 0),
    };
  }

  /** Putting stroke: shoulders rock, wrists stay quiet. b > 0 back, b < 0 through. */
  private puttPose(b: number): Pose {
    const hands = new THREE.Vector3(0.38, 0.82 + Math.abs(b) * 0.025, b * 0.17);
    const head = this.ballPos().add(new THREE.Vector3(0, Math.abs(b) * 0.04, b * 0.34));
    return { hipsYaw: 0, shoulderYaw: -b * 0.22, bend: this.bend, headYaw: b * 0.18, hands, shaft: head.sub(hands).normalize(), legTurn: 0 };
  }

  private v = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();

  private shoulderPos(side: number): THREE.Vector3 {
    const w = this.spine.localToWorld(new THREE.Vector3(0, 0.5, side * this.shoulderW));
    return this.root.worldToLocal(w);
  }

  private placeLimb(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    const d = this.v.copy(b).sub(a);
    const len = d.length() || 1e-4;
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    mesh.scale.set(1, len, 1);
  }

  private solveArm(S: THREE.Vector3, T: THREE.Vector3, pole: THREE.Vector3) {
    return this.solveLimb(S, T, ARM_UPPER, ARM_FORE, pole);
  }

  /** Two-bone IK: returns the middle joint ("elbow") and the reached end position ("hand"). */
  private solveLimb(S: THREE.Vector3, T: THREE.Vector3, L1: number, L2: number, pole: THREE.Vector3) {
    const d = T.clone().sub(S);
    let dist = d.length();
    const dir = d.divideScalar(dist || 1);
    dist = Math.max(0.12, Math.min(L1 + L2 - 1e-4, dist));
    const hand = S.clone().addScaledVector(dir, dist);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
    p.normalize();
    const elbow = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
    return { elbow, hand };
  }

  private pose(p: Pose) {
    if (!this.armRig.length) return;
    this.hips.rotation.y = p.hipsYaw;
    this.spine.rotation.z = p.bend;
    this.spine.rotation.y = p.shoulderYaw - p.hipsYaw;
    this.head.rotation.y = p.headYaw;
    // weight shift: the pelvis slides toward the target and drops a touch as the knees flex
    const shift = p.hipShift ?? 0;
    this.hips.position.set(0, 0.95 - Math.abs(shift) * 0.25, shift);
    this.root.updateMatrixWorld(true);
    // legs: feet stay planted, the trail heel peels up onto the toe in the follow-through
    for (const leg of this.legRig) {
      const trail = leg.side === 1;
      const heel = trail ? p.heel ?? 0 : 0;
      leg.foot.rotation.y = trail ? Math.max(0, p.legTurn) * 0.55 : Math.max(0, p.legTurn) * 0.15;
      leg.foot.rotation.z = -heel * 0.95;
      leg.foot.updateMatrixWorld(true);
      const ankle = this.root.worldToLocal(leg.foot.localToWorld(new THREE.Vector3(-0.2, 0.07, 0)));
      const hip = this.root.worldToLocal(this.hips.localToWorld(new THREE.Vector3(0, 0, leg.side * this.hipW)));
      // knees point over the toes; the lead knee kicks toward the ball at the top, the trail knee toward the target at the finish
      const pole = new THREE.Vector3(1, 0, trail ? -Math.max(0, p.legTurn) * 0.9 : -p.legTurn * 0.6).normalize();
      const sol = this.solveLimb(hip, ankle, LEG_UPPER, LEG_LOWER, pole);
      this.placeLimb(leg.thigh, hip, sol.elbow);
      leg.knee.position.copy(sol.elbow);
      this.placeLimb(leg.shin, sol.elbow, sol.hand);
    }

    const lead = this.armRig[0], trail = this.armRig[1];
    const Sl = this.shoulderPos(-1), St = this.shoulderPos(1);
    const L = this.solveArm(Sl, p.hands, LEAD_POLE);
    const trailTarget = L.hand.clone().addScaledVector(p.shaft, 0.075);
    const T = this.solveArm(St, trailTarget, TRAIL_POLE);
    for (const [rig, S, sol] of [[lead, Sl, L], [trail, St, T]] as const) {
      rig.shoulderJoint.position.copy(S);
      this.placeLimb(rig.upper, S, sol.elbow);
      rig.elbowJoint.position.copy(sol.elbow);
      this.placeLimb(rig.fore, sol.elbow, sol.hand);
      rig.hand.position.copy(sol.hand);
    }
    if (this.wristAcc) {
      this.wristAcc.position.copy(L.hand).lerp(L.elbow, 0.2);
      this.wristAcc.quaternion.copy(lead.fore.quaternion);
      this.wristAcc.rotateX(Math.PI / 2);
    }
    // club: grip end just above the lead hand, shaft along the pose direction, face turning with the chest
    const yc = p.shaft.clone().negate();
    const ref = new THREE.Vector3(-Math.sin(p.shoulderYaw), 0, -Math.cos(p.shoulderYaw));
    let xc = ref.clone().cross(yc);
    if (xc.lengthSq() < 1e-4) xc = new THREE.Vector3(1, 0, 0).cross(yc);
    xc.normalize();
    const zc = xc.clone().cross(yc).normalize();
    this.tmpM.makeBasis(xc, yc, zc);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    this.clubPivot.quaternion.copy(this.tmpQ);
    this.clubPivot.position.copy(L.hand).addScaledVector(p.shaft, -0.05);
  }

  private downPose(e: number): Pose {
    // hips start the downswing, then the shoulders and arms follow into impact
    const b = this.swingFrom * (1 - e * e * (3 - 2 * e));
    const from = this.sample(this.backKeys(), b);
    const imp = this.impactPose();
    const pose = this.mixPose(from, imp, Math.pow(e, 2.2));
    pose.hipsYaw = from.hipsYaw + (imp.hipsYaw - from.hipsYaw) * Math.min(1, e * 1.6);
    return pose;
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case 'idle':
      case 'address': {
        const p = this.putter ? this.puttPose(0) : this.addressPose();
        p.hands.z += Math.sin(this.time * 1.6) * 0.01;
        p.shoulderYaw += Math.sin(this.time * 1.6) * 0.015;
        this.pose(p);
        break;
      }
      case 'backswing': {
        if (this.autoCb) {
          const target = Math.min(1.05, this.autoTarget);
          const dur = this.putter ? 0.6 : 0.9;
          const k = Math.min(1, this.phaseT / dur);
          this.back = target * (1 - (1 - k) * (1 - k));
          if (this.phaseT > dur + 0.15) {
            const cb = this.autoCb;
            this.autoCb = null;
            this.swing(cb, target);
          }
        }
        this.pose(this.putter ? this.puttPose(this.back) : this.sample(this.backKeys(), this.back));
        break;
      }
      case 'downswing': {
        const dur = this.putter ? 0.3 : 0.24;
        const k = Math.min(1, this.phaseT / dur);
        this.pose(this.putter ? this.puttPose(this.swingFrom * (1 - k)) : this.downPose(k));
        if (k >= 1) {
          this.phase = 'follow';
          this.phaseT = 0;
          const cb = this.onImpact;
          this.onImpact = null;
          cb?.();
        }
        break;
      }
      case 'follow': {
        const dur = this.putter ? 0.45 : 0.6;
        const k = Math.min(1, this.phaseT / dur);
        const e = 1 - Math.pow(1 - k, 2.4);
        this.pose(this.putter ? this.puttPose(-this.followAmt * e) : this.sample(this.followKeys(), this.followAmt * e));
        if (k >= 1) {
          this.phase = 'finish';
          this.phaseT = 0;
        }
        break;
      }
      case 'finish': {
        this.pose(this.putter ? this.puttPose(-this.followAmt) : this.sample(this.followKeys(), this.followAmt));
        break;
      }
      case 'celebrate': {
        const k = Math.min(1, this.phaseT / 0.3);
        const hop = Math.abs(Math.sin(this.phaseT * 8)) * 0.05 * k;
        const up: Pose = { hipsYaw: 0.3, shoulderYaw: 0.4, bend: -0.1, headYaw: -0.2, hands: new THREE.Vector3(0.28, 1.85 + hop, -0.05), shaft: new THREE.Vector3(0.1, 1, -0.3).normalize(), legTurn: 0.3 };
        this.pose(this.mixPose(this.sample(this.followKeys(), this.followAmt), up, k));
        break;
      }
      case 'sad': {
        const k = Math.min(1, this.phaseT / 0.4);
        const down: Pose = { hipsYaw: 0.2, shoulderYaw: 0.15, bend: -0.6, headYaw: Math.sin(this.time * 3) * 0.25, hands: new THREE.Vector3(0.36, 0.72, 0), shaft: new THREE.Vector3(0.35, -1, 0.05).normalize(), legTurn: 0.1 };
        this.pose(this.mixPose(this.sample(this.followKeys(), this.followAmt), down, k));
        break;
      }
    }
  }
}
