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

function limb(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r2, r1, len, 8);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  return mesh;
}

function joint(p: THREE.Vector3, r: number, m: THREE.Material) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
  s.position.copy(p);
  s.castShadow = true;
  return s;
}

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
  private arms = new THREE.Group();
  private clubPivot = new THREE.Group();
  private clubMesh = new THREE.Group();
  readonly bag = new THREE.Group();
  private legs: THREE.Group[] = [];
  phase: SwingPhase = 'idle';
  private phaseT = 0;
  private back = 0;
  private swingFrom = 0;
  private fullBack = 2.3;
  private follow = 2.5;
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
    this.arms = new THREE.Group();
    this.clubPivot = new THREE.Group();
    this.clubMesh = new THREE.Group();
    this.legs = [];
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
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0, 0, side * 0.11 * widthMul);
      const hip = new THREE.Vector3(0, 0, 0);
      const knee = new THREE.Vector3(0.09, -0.47, side * 0.05);
      const foot = new THREE.Vector3(0.02, -0.9, side * 0.1);
      leg.add(limb(hip, knee, 0.085 * widthMul, 0.075 * widthMul, skirt ? skin : pantsMat));
      leg.add(joint(knee, 0.072 * widthMul, shorts || skirt ? skin : pantsMat));
      leg.add(limb(knee, foot, 0.07 * widthMul, 0.055, shorts || skirt ? skin : pantsMat));
      if (shorts || skirt) {
        const sock = limb(foot.clone().add(new THREE.Vector3(0.01, 0.16, 0)), foot, 0.058, 0.058, mat('#f4f4f4'));
        leg.add(sock);
      }
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.12), shoeMat);
      shoe.position.set(foot.x + 0.07, foot.y - 0.02, foot.z);
      shoe.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.03, 0.125), soleMat);
      sole.position.set(foot.x + 0.07, foot.y - 0.075, foot.z);
      leg.add(shoe, sole);
      this.hips.add(leg);
      this.legs.push(leg);
    }
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

    // arms swing group (pivot between the shoulders)
    this.spine.add(this.arms);
    this.arms.position.y = 0.52;
    const hands = new THREE.Vector3(0.4, -0.47, 0);
    const glove = cosmeticById(o.gloves);
    const gloveMat = glove ? mat(glove.color) : skin;
    for (const side of [-1, 1]) {
      const sh = new THREE.Vector3(0, 0, side * 0.2 * widthMul);
      const elbow = sh.clone().lerp(hands, 0.5).add(new THREE.Vector3(0.02, 0, side * 0.03));
      const sleeveEnd = sh.clone().lerp(elbow, shirt?.style === 'tee' || shirt?.style === 'polo' || shirt?.style === 'floral' ? 0.7 : 1.4);
      this.arms.add(joint(sh, 0.07 * widthMul, sleeveMat));
      this.arms.add(limb(sh, sleeveEnd, 0.068 * widthMul, 0.06 * widthMul, sleeveMat));
      this.arms.add(limb(sleeveEnd, elbow, 0.052, 0.048, sleeveEnd.distanceTo(sh) > elbow.distanceTo(sh) ? sleeveMat : skin));
      this.arms.add(limb(elbow, hands.clone().add(new THREE.Vector3(0, 0, side * 0.02)), 0.048, 0.042, skin));
      // lead (left) hand is side -1 (toward the target)
      this.arms.add(joint(hands.clone().add(new THREE.Vector3(0, side * 0.03, side * 0.015)), 0.05, side === -1 ? gloveMat : skin));
    }
    if (acc?.style === 'watch' || acc?.style === 'wristband') {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.016, 6, 12), mat(acc.color, { metalness: acc.style === 'watch' ? 0.8 : 0, roughness: 0.3 }));
      w.position.copy(hands).add(new THREE.Vector3(-0.07, 0.08, -0.03));
      w.rotation.set(0.3, 0, 0.6);
      this.arms.add(w);
    }
    this.clubPivot.position.copy(hands);
    this.arms.add(this.clubPivot);
    this.clubPivot.add(this.clubMesh);

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
    this.orientClub();
  }

  /** Point the club at the ball at address. */
  private orientClub() {
    const prev = { a: this.arms.rotation.x, c: this.clubPivot.rotation.x, s: this.spine.rotation.y, h: this.hips.rotation.y };
    this.arms.rotation.x = 0;
    this.clubPivot.rotation.set(0, 0, 0);
    this.clubPivot.quaternion.identity();
    this.spine.rotation.y = 0;
    this.hips.rotation.y = 0;
    this.root.updateMatrixWorld(true);
    const ballWorld = this.root.localToWorld(new THREE.Vector3(this.ballOffset, 0.03, 0));
    const local = this.clubPivot.worldToLocal(ballWorld.clone());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), local.normalize());
    this.clubBase.copy(q);
    this.clubPivot.quaternion.copy(q);
    this.arms.rotation.x = prev.a;
    this.spine.rotation.y = prev.s;
    this.hips.rotation.y = prev.h;
  }
  private clubBase = new THREE.Quaternion();

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
    this.follow = this.putter ? 0.45 + power * 0.25 : 1.4 + Math.min(1, power) * 1.1;
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

  private applyPose(angle: number, hinge: number, twist: number) {
    this.arms.rotation.x = angle;
    const hingeQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hinge);
    this.clubPivot.quaternion.copy(hingeQ).multiply(this.clubBase);
    this.spine.rotation.y = twist;
    this.hips.rotation.y = twist * 0.35;
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    const fb = this.putter ? 0.42 : this.fullBack;
    const hingeMax = this.putter ? 0 : -1.1;
    const twistMax = this.putter ? -0.08 : -0.85;
    switch (this.phase) {
      case 'idle':
      case 'address': {
        const sway = Math.sin(this.time * 1.6) * 0.02;
        this.applyPose(sway, 0, sway * 0.5);
        break;
      }
      case 'backswing': {
        if (this.autoCb) {
          const target = Math.min(1.05, this.autoTarget);
          const dur = this.putter ? 0.6 : 0.85;
          this.back = target * Math.min(1, this.phaseT / dur);
          if (this.phaseT > dur + 0.2) {
            const cb = this.autoCb;
            this.autoCb = null;
            this.swing(cb, target);
          }
        }
        const b = this.back;
        this.applyPose(-fb * b, hingeMax * Math.min(1, b * 1.3), twistMax * b);
        break;
      }
      case 'downswing': {
        const dur = this.putter ? 0.28 : 0.2;
        const k = Math.min(1, this.phaseT / dur);
        const e = k * k;
        const b = this.swingFrom * (1 - e);
        this.applyPose(-fb * b, hingeMax * Math.min(1, b * 1.3) * (1 - e * 0.6), twistMax * b);
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
        const dur = this.putter ? 0.4 : 0.38;
        const k = Math.min(1, this.phaseT / dur);
        const e = 1 - (1 - k) * (1 - k);
        const a = this.follow * e;
        this.applyPose(a, this.putter ? 0 : 0.9 * e, (this.putter ? 0.1 : 1.15) * e);
        if (k >= 1) {
          this.phase = 'finish';
          this.phaseT = 0;
        }
        break;
      }
      case 'finish': {
        const a = this.follow;
        this.applyPose(a, this.putter ? 0 : 0.9, this.putter ? 0.1 : 1.15);
        break;
      }
      case 'celebrate': {
        const k = Math.sin(Math.min(1, this.phaseT / 0.3) * Math.PI * 0.5);
        this.applyPose(1.9 * k + Math.sin(this.phaseT * 9) * 0.15 * k, 0, 0.3 * k);
        this.root.position.y += Math.max(0, Math.sin(this.phaseT * 9)) * 0.004;
        break;
      }
      case 'sad': {
        const k = Math.min(1, this.phaseT / 0.4);
        this.applyPose(0.2 * k, 0, -0.2 * k);
        this.head.rotation.x = Math.sin(this.time * 3) * 0.2 * k;
        break;
      }
    }
  }
}
