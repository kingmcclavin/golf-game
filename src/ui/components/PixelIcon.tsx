/** Tiny pixel-art icon set drawn as crisp SVG rectangles (one character per pixel). */
const COLORS: Record<string, string> = {
  k: '#181425', w: '#ffffff', y: '#fee761', o: '#feae34', O: '#f77622', r: '#e43b44', g: '#63c74d', d: '#3e8948',
  b: '#0099db', c: '#2ce8f5', n: '#733e39', s: '#c0cbdc', a: '#5a6988', p: '#b55088', l: '#ead4aa', t: '#e4a672',
};

export const ICONS = {
  coin: ['..kkkkkk..', '.kyyyyook.', 'kyywyyyook', 'kywyyyyOok', 'kyyyyyyOok', 'kyyyyyyOok', 'kyyyyyyOok', 'koyyyyOOok', '.kooooook.', '..kkkkkk..'],
  flag: ['.kkkk.....', '.kwrrkk...', '.kwrrrrkk.', '.kwrrrrrrk', '.kwrrrkkk.', '.kwkkk....', '.kwk......', '.kwk......', 'kgwgkk....', 'kggggggk..'],
  bolt: ['....kkkkk.', '...kyyyk..', '..kyyyk...', '.kyyykkkk.', '.kyyyyyyk.', '..kkkyyk..', '....kyk...', '...kyk....', '..kyk.....', '..kk......'],
  map: ['kkkkkkkkkk', 'kggdbbbggk', 'kgdbbbgggk', 'kggbgggrgk', 'kgggggrrrk', 'kllggggrgk', 'kllldgggdk', 'kgllldggdk', 'kggllldddk', 'kkkkkkkkkk'],
  bag: ['..s.s.s...', '..s.s.s...', '.kkkkkkk..', '.kgggggk..', '.kgdgggkk.', '.kgdgggkn.', '.kgggggkn.', '.kgdgggk..', '.kgggggk..', '.kkkkkkk..'],
  gift: ['.kk..kk...', 'kyykkyyk..', '.kkyykk...', 'kkkkkkkkkk', 'krrryyrrrk', 'kkkkkkkkkk', '.krryyrrk.', '.krryyrrk.', '.krryyrrk.', '.kkkkkkkk.'],
  cap: ['..........', '...kkkk...', '..kbbbbk..', '.kbwbbbbk.', '.kbbbbbbk.', '.kbbbbbbk.', 'kkkkkkkkkk', '.....kbbbk', '......kkk.', '..........'],
  shop: ['...kkkk...', '..k....k..', '.kkkkkkkk.', '.kppppppk.', '.kppppppk.', '.kpwppwpk.', '.kppppppk.', '.kppwwppk.', '.kppppppk.', '.kkkkkkkk.'],
  calendar: ['.k..k..k..', 'kkkkkkkkkk', 'krrrrrrrrk', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kwkwwkwwkk', 'kwwwwwwwwk', 'kwkwwkwwwk', 'kwwwwwwwwk', 'kkkkkkkkkk'],
  trophy: ['kkkkkkkkkk', 'kyyyyyyyok', 'kyywyyyyok', '.kyyyyyok.', '..kyyyok..', '...kyok...', '....kk....', '...kook...', '..kkkkkk..', '..koooook.'],
  gear: ['....kk....', '.k.kssk.k.', 'kskssssksk', '.kssaassk.', 'kssakkassk', 'kssakkassk', '.kssaassk.', 'kskssssksk', '.k.kssk.k.', '....kk....'],
  star: ['....kk....', '...kyyk...', '...kyyk...', 'kkkkyykkkk', 'kyyyyyyyyk', '.kyyyyyyk.', '..kyyyyk..', '..kyykyyk.', '.kyk..kyk.', '.kk....kk.'],
  camera: ['..........', '.kkk......', 'kkkkkkkkk.', 'kaaaaaaakk', 'kaakkkaaka', 'kakbbbkaka', 'kakbwbkaka', 'kakbbbkakk', 'kaakkkaak.', 'kkkkkkkkk.'],
  pin: ['.kk.......', '.kwkk.....', '.kwrrkk...', '.kwrrrrk..', '.kwrrkk...', '.kwkk.....', '.kwk......', '.kwk......', '.kwk......', '.kkk......'],
  gem: ['..kkkkkk..', '.kcwccbbk.', 'kcwccccbbk', 'kkkkkkkkkk', '.kcccccbk.', '..kcccbk..', '...kccbk..', '....kbk...', '.....k....', '..........'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 22, grid }: { name?: IconName; size?: number; grid?: string[] }) {
  const g = grid ?? ICONS[name!];
  const h = g.length;
  const w = Math.max(...g.map((r) => r.length));
  const rects: JSX.Element[] = [];
  g.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = COLORS[ch];
      if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />);
    }),
  );
  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" style={{ display: 'inline-block', flex: 'none', verticalAlign: 'middle' }} aria-hidden>
      {rects}
    </svg>
  );
}

/** A shaded pixel ball (used for the swing button). */
export function pixelBallGrid(n = 16): string[] {
  const out: string[] = [];
  const r = n / 2 - 0.5;
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const dx = x - r, dy = y - r;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.45) row += '.';
      else if (d > r - 0.7) row += 'k';
      else if (dx + dy > r * 0.55) row += 'a';
      else if (dx + dy > -r * 0.2) row += 's';
      else if (dx + dy < -r * 0.9 && d < r * 0.55) row += 'w';
      else row += 'w';
      // dimples
      if ((x * 7 + y * 3) % 11 === 0 && d < r - 2 && row[row.length - 1] !== 'k') row = row.slice(0, -1) + (dx + dy > 0 ? 'a' : 's');
    }
    out.push(row);
  }
  return out;
}
