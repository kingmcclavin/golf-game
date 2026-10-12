import { courseById } from '../data/courses';
import { generateHole } from './holeGen';
import { HoleWorld } from './world';

const cache = new Map<string, HoleWorld>();

/** Hole index 0-8 is the front nine; 9-17 is the mirrored "back nine" with alternate pins. */
export function getHoleWorld(courseId: string, holeIndex: number): HoleWorld {
  const key = `${courseId}:${holeIndex}`;
  let w = cache.get(key);
  if (!w) {
    const course = courseById(courseId);
    const n = course.holes.length;
    const spec = course.holes[holeIndex % n];
    const back = holeIndex >= n;
    const s = back ? { ...spec, pin: undefined, name: `${spec.name} II` } : spec;
    w = new HoleWorld(generateHole(s, course.theme, holeIndex, course.id, back));
    if (cache.size > 4) cache.delete(cache.keys().next().value as string);
    cache.set(key, w);
  }
  return w;
}

export function holeCount(courseId: string) {
  return courseById(courseId).holes.length;
}
