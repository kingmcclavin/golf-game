import * as THREE from 'three';
import { getHoleWorld } from '../golf/course';
import type { Outfit } from '../data/cosmetics';
import { clubById } from '../data/clubs';
import { GolferModel } from './golferModel';
import { HoleScene } from './holeScene';
import type { Quality, View } from './renderer';

/** Main-menu backdrop: a slowly orbiting camera around the golfer on the first tee. */
export class MenuView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 6000);
  private hole: HoleScene;
  private golfer: GolferModel;
  private t = Math.random() * 10;
  private center: THREE.Vector3;
  private wind = { x: 1.5, z: 0.5 };

  constructor(courseId: string, outfit: Outfit, quality: Quality) {
    const world = getHoleWorld(courseId, 0);
    this.hole = new HoleScene(world, this.scene, quality === 'high' ? 'medium' : quality);
    const tee = world.hole.tee;
    const pin = world.hole.pin;
    const yaw = Math.atan2(pin.x - tee.x, -(pin.z - tee.z));
    this.golfer = new GolferModel(outfit, clubById('drv_timberline'));
    const ball = new THREE.Vector3(tee.x, world.height(tee.x, tee.z) + 0.05, tee.z);
    this.golfer.placeAtBall(ball, yaw, (x, z) => this.hole.terrain.visualHeight(x, z));
    this.golfer.reset();
    this.scene.add(this.golfer.root, this.golfer.bag);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff' }));
    b.position.copy(ball);
    this.scene.add(b);
    this.center = this.golfer.root.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.hole.setFocus(this.center);
  }

  setOutfit(o: Outfit) {
    this.golfer.setOutfit(o);
  }

  update(dt: number, time: number) {
    this.t += dt * 0.08;
    const r = 5.2;
    this.camera.position.set(this.center.x + Math.cos(this.t) * r, this.center.y + 0.9 + Math.sin(this.t * 0.7) * 0.3, this.center.z + Math.sin(this.t) * r);
    this.camera.lookAt(this.center.x, this.center.y - 0.1, this.center.z);
    this.golfer.update(dt);
    this.hole.update(dt, time, this.wind);
  }

  dispose() {
    this.hole.dispose(this.scene);
    this.golfer.dispose();
  }
}

/** Character customisation preview on a turntable. */
export class PreviewView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  golfer: GolferModel;
  yaw = -0.6;
  private targetYaw = -0.6;
  zoom = 1;

  constructor(outfit: Outfit) {
    this.scene.background = new THREE.Color('#123a3a');
    this.scene.fog = new THREE.Fog('#123a3a', 8, 22);
    const hemi = new THREE.HemisphereLight('#dff4ff', '#2a4a3a', 1.4);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight('#7ad8ff', 1.2);
    rim.position.set(-4, 3, -4);
    this.scene.add(hemi, sun, rim);
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.2, 48), new THREE.MeshStandardMaterial({ color: '#5fbf3f', roughness: 0.9 }));
    podium.position.y = -0.1;
    podium.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.03, 8, 64), new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.0;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a4a40', roughness: 1 }));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.scene.add(podium, ring, floor);
    this.golfer = new GolferModel(outfit, clubById('i7_copper'));
    this.golfer.reset();
    this.scene.add(this.golfer.root, this.golfer.bag);
    this.golfer.root.position.set(-0.15, 0, 0);
    this.golfer.bag.position.set(-0.7, 0, 0.8);
  }

  setOutfit(o: Outfit) {
    this.golfer.setOutfit(o);
  }

  rotate(dx: number) {
    this.targetYaw += dx * 0.012;
  }

  update(dt: number) {
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    this.golfer.root.rotation.y = this.yaw;
    this.golfer.bag.rotation.y = this.yaw + 0.6;
    const d = 5.4 * this.zoom;
    this.camera.position.set(0, 1.45, d);
    this.camera.lookAt(0, 0.95, 0);
    this.golfer.update(dt);
  }

  dispose() {
    this.golfer.dispose();
  }
}
