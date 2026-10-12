import type { V2 } from '../core/math';

export type Surface =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'deepRough'
  | 'green'
  | 'fringe'
  | 'bunker'
  | 'waste'
  | 'water'
  | 'oob';

export interface Ellipse {
  c: V2;
  rx: number;
  rz: number;
  rot: number;
}

export interface Bunker extends Ellipse {
  depth: number;
  kind: 'bunker' | 'waste';
}

export interface WaterBody extends Ellipse {
  level: number;
}

export type TreeKind = 'pine' | 'oak' | 'palm' | 'cactus' | 'cypress' | 'birch';

export interface Tree {
  x: number;
  z: number;
  s: number;
  kind: TreeKind;
  /** collision data */
  trunkR: number;
  canopyY: number;
  canopyR: number;
}

export interface Rock {
  x: number;
  z: number;
  r: number;
}

export interface Hill {
  c: V2;
  r: number;
  h: number;
}

export interface CourseTheme {
  id: string;
  sky: [string, string];
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  fairway: string;
  fairwayAlt: string;
  rough: string;
  deepRough: string;
  green: string;
  fringe: string;
  sand: string;
  waste: string;
  water: string;
  tee: string;
  trees: TreeKind[];
  treeDensity: number;
  rockDensity: number;
  rockColor: string;
  noiseAmp: number;
  noiseScale: number;
  lateralRise: number;
  /** rolling friction coefficient on greens (lower = faster) */
  greenSpeed: number;
  /** fairway firmness multiplier for bounce/roll */
  firmness: number;
  wind: [number, number];
  /** desert style: outside corridor is waste sand rather than rough */
  wasteRough: boolean;
  ocean?: { side: 1 | -1; offset: number };
  mountains: string;
  flag: string;
  grassTufts: string;
}

export interface HoleSpec {
  par: 3 | 4 | 5;
  /** yards along the path tee → green center */
  length: number;
  name: string;
  bend?: number;
  bendAt?: number;
  bend2?: number;
  fw?: number;
  elev?: number;
  teeElev?: number;
  hills?: number;
  bunkers?: Array<[number, number, number] | [number, number, number, number]>;
  greenBunkers?: Array<'L' | 'R' | 'F' | 'B' | 'FL' | 'FR' | 'BL' | 'BR'>;
  water?: Array<[number, number, number, number]>;
  creek?: number[];
  waste?: Array<[number, number, number, number]>;
  greenR?: number;
  greenSlope?: number;
  greenTilt?: number;
  treeMul?: number;
  pin?: [number, number];
  rocks?: number;
}

export interface HoleLayout {
  index: number;
  name: string;
  par: number;
  seed: number;
  tee: V2;
  pin: V2;
  path: V2[];
  cum: number[];
  pathLen: number;
  fairwayHalf: number;
  fairwayStart: number;
  fairwayEnd: number;
  green: Ellipse;
  greenSlope: { x: number; z: number };
  greenBumps: Hill[];
  bunkers: Bunker[];
  water: WaterBody[];
  hills: Hill[];
  trees: Tree[];
  rocks: Rock[];
  heights: { tee: number; green: number; profile: Array<[number, number]> };
  boundsHalf: number;
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  theme: CourseTheme;
  mirrored: boolean;
  treeMul: number;
  rockMul: number;
}

export interface CourseDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4;
  theme: CourseTheme;
  holes: HoleSpec[];
  unlock: { level: number; wins?: number };
  rewardMul: number;
  preview: [string, string, string];
}
