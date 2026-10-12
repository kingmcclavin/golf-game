export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in One!';
  const d = strokes - par;
  if (d <= -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double Bogey';
  if (d === 3) return 'Triple Bogey';
  return `+${d}`;
}

export function fmtRel(rel: number): string {
  if (rel === 0) return 'E';
  return rel > 0 ? `+${rel}` : `${rel}`;
}

export function scoreClass(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1 || d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';
}
