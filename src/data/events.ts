export interface GameEvent {
  id: string;
  name: string;
  desc: string;
  color: string;
}

export const EVENTS: GameEvent[] = [
  { id: 'harvest', name: 'Harvest Classic', desc: 'Autumn colours and the Harvest Moon Driver.', color: '#ff8a1a' },
  { id: 'frost', name: 'Frost Open', desc: 'Cold-weather golf with the Frostbite 7 Iron.', color: '#9ae0ff' },
  { id: 'bloom', name: 'Blossom Cup', desc: 'Spring is in the air. Chase the Blossom Gap Wedge.', color: '#ff9ad0' },
  { id: 'summer', name: 'Summer Sparkler', desc: 'Fireworks on the greens and the Sparkler Putter.', color: '#ffe04a' },
];

/** Rotating weekly event (deterministic from the date, no server needed). */
export function currentEvent(now = new Date()): GameEvent {
  const week = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000));
  return EVENTS[week % EVENTS.length];
}

export function eventEndsAt(now = new Date()): Date {
  const wk = 7 * 24 * 3600 * 1000;
  return new Date((Math.floor(now.getTime() / wk) + 1) * wk);
}
