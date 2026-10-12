import type { BotDef } from '../data/bots';
import { clubById, clubPerformance } from '../data/clubs';
import type { Outfit } from '../data/cosmetics';
import { emptyStats, type PlayerState } from './match';
import type { ClubRef } from './shot';

export function sortBag(bag: ClubRef[]): ClubRef[] {
  return [...bag].sort((a, b) => {
    if (a.def.category === 'putter') return 1;
    if (b.def.category === 'putter') return -1;
    return clubPerformance(b.def, b.level).maxCarry - clubPerformance(a.def, a.level).maxCarry;
  });
}

export function makePlayer(id: string, name: string, color: string, outfit: Outfit, bag: ClubRef[], bot?: BotDef): PlayerState {
  return {
    id,
    name,
    isBot: !!bot,
    bot,
    color,
    outfit,
    bag: sortBag(bag),
    scores: [],
    ball: { x: 0, y: 0, z: 0 },
    lie: 'tee',
    strokes: 0,
    holed: false,
    pickedUp: false,
    teedOff: false,
    prevShotSurface: null,
    afterPenalty: false,
    reachedGreenIn: null,
    stats: emptyStats(),
  };
}

export function makeBotPlayer(bot: BotDef): PlayerState {
  return makePlayer(bot.id, bot.name, bot.color, bot.outfit, bot.clubs.map((id) => ({ def: clubById(id), level: bot.clubLevel })), bot);
}
