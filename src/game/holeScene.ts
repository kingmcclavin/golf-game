import * as THREE from 'three';
import type { HoleWorld } from '../golf/world';
import { makeSky } from './materials';
import { disposeObject, type Quality } from './renderer';
import { buildScenery, type SceneryBuild } from './scenery';
import { buildTerrain, type TerrainBuild } from './terrainMesh';

/** Everything that makes up one rendered hole: lights, sky, terrain, water, scenery. */
export class HoleScene {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly terrain: TerrainBuild;
  readonly scenery: SceneryBuild;
  readonly sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  private sky: THREE.Mesh;
  private slopeArrows: THREE.InstancedMesh | null = null;
  private slopeData: Array<{ x: number; y: number; z: number; ang: number; s: number }> = [];

  constructor(public readonly world: HoleWorld, scene: THREE.Scene, public readonly quality: Quality) {
    const t = world.hole.theme;
    scene.background = new THREE.Color(t.fog);
    scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar * (quality === 'low' ? 0.8 : 1.2));
    this.sky = makeSky(t.sky[0], t.sky[1], this.sunDir);
    this.group.add(this.sky);
    const hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, 1.6);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(t.sun, t.sunIntensity);
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    if (quality !== 'low') {
      this.sun.castShadow = true;
      const s = quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(s, s);
      const cam = this.sun.shadow.camera;
      cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 260;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.group.add(this.sun, this.sun.target);
    this.terrain = buildTerrain(world, quality, this.sunDir);
    this.group.add(this.terrain.group);
    this.scenery = buildScenery(world, quality, this.terrain.visualHeight);
    this.group.add(this.scenery.group);
    this.buildSlopeArrows();
    scene.add(this.group);
  }

  private buildSlopeArrows() {
    const h = this.world.hole;
    const g = h.green;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.22);
    shape.lineTo(0.13, 0);
    shape.lineTo(0.05, 0);
    shape.lineTo(0.05, -0.18);
    shape.lineTo(-0.05, -0.18);
    shape.lineTo(-0.05, 0);
    shape.lineTo(-0.13, 0);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const R = Math.max(g.rx, g.rz) * 1.25;
    const pts: typeof this.slopeData = [];
    for (let x = -R; x <= R; x += 1.3)
      for (let z = -R; z <= R; z += 1.3) {
        const px = g.c.x + x, pz = g.c.z + z;
        const s = this.world.surface(px, pz);
        if (s !== 'green' && s !== 'fringe') continue;
        const n = this.world.normal(px, pz);
        const slope = Math.hypot(n.x, n.z);
        // downhill direction is (n.x, n.z)
        pts.push({ x: px, y: this.terrain.visualHeight(px, pz) + 0.04, z: pz, ang: Math.atan2(n.x, n.z), s: slope });
      }
    this.slopeData = pts;
    const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, vertexColors: false });
    const inst = new THREE.InstancedMesh(geo, m, Math.max(1, pts.length));
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      const k = Math.min(1, p.s / 0.035);
      c.setHSL(0.33 - k * 0.33, 0.9, 0.55);
      inst.setColorAt(i, c);
    });
    inst.count = pts.length;
    inst.visible = false;
    inst.renderOrder = 5;
    this.slopeArrows = inst;
    this.group.add(inst);
  }

  setSlopeArrows(v: boolean) {
    if (this.slopeArrows) this.slopeArrows.visible = v;
  }

  setFocus(p: THREE.Vector3) {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(p);
  }

  update(dt: number, time: number, wind: { x: number; z: number }) {
    for (const w of this.terrain.waters) w.uniforms.time.value = time;
    // flag waving toward wind
    const sc = this.scenery;
    const arr = sc.flagGeo.attributes.position.array as Float32Array;
    const ws = Math.hypot(wind.x, wind.z);
    for (let i = 0; i < arr.length; i += 3) {
      const x = sc.flagBase[i];
      arr[i + 2] = sc.flagBase[i + 2] + Math.sin(time * (3 + ws) - x * 7) * 0.06 * (x / 0.75) * (0.4 + ws * 0.15);
    }
    sc.flagGeo.attributes.position.needsUpdate = true;
    sc.flagGeo.computeVertexNormals();
    sc.flag.rotation.y = Math.atan2(-wind.z, wind.x);
    if (this.slopeArrows?.visible) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const ph = (time * 0.6) % 1;
      this.slopeData.forEach((p, i) => {
        const k = Math.min(1, p.s / 0.035);
        const off = (ph - 0.5) * 0.5 * (0.4 + k);
        q.setFromAxisAngle(up, p.ang + Math.PI);
        const sc2 = 0.6 + k * 0.8;
        m.compose(new THREE.Vector3(p.x + Math.sin(p.ang) * off, p.y, p.z + Math.cos(p.ang) * off), q, new THREE.Vector3(sc2, 1, sc2));
        this.slopeArrows!.setMatrixAt(i, m);
      });
      this.slopeArrows.instanceMatrix.needsUpdate = true;
    }
    void dt;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    disposeObject(this.group);
  }
}
