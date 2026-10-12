export interface LifetimeStats {
  rounds: number;
  holes: number;
  wins: number;
  birdies: number;
  eagles: number;
  holeInOnes: number;
  longestDrive: number; // m
  longestPutt: number; // m
  packsOpened: number;
  coursesPlayed: string[];
  upgrades: number;
  roundsUnderPar: number;
  expertWins: number;
  rareWins: number;
  perfectShots: number;
  bogeyFreeRounds: number;
  maxPerfectInRound: number;
  clubsOwned: number;
  cosmeticsOwned: number;
  legendaryOwned: number;
  bestRound: Record<string, number>;
}

export const emptyLifetime = (): LifetimeStats => ({
  rounds: 0, holes: 0, wins: 0, birdies: 0, eagles: 0, holeInOnes: 0, longestDrive: 0, longestPutt: 0, packsOpened: 0,
  coursesPlayed: [], upgrades: 0, roundsUnderPar: 0, expertWins: 0, rareWins: 0, perfectShots: 0, bogeyFreeRounds: 0,
  maxPerfectInRound: 0, clubsOwned: 0, cosmeticsOwned: 0, legendaryOwned: 0, bestRound: {},
});

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  coins: number;
  xp: number;
  /** progress value and target */
  progress: (s: LifetimeStats) => number;
  target: number;
}

const YD = 0.9144;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_birdie', name: 'First Birdie', desc: 'Make your first birdie.', icon: '🐦', coins: 100, xp: 30, progress: (s) => s.birdies, target: 1 },
  { id: 'birdie25', name: 'Birdie Machine', desc: 'Make 25 birdies.', icon: '🦜', coins: 400, xp: 100, progress: (s) => s.birdies, target: 25 },
  { id: 'eagle', name: 'Eagle Eye', desc: 'Score an eagle.', icon: '🦅', coins: 300, xp: 80, progress: (s) => s.eagles, target: 1 },
  { id: 'hio', name: 'Ace!', desc: 'Make a hole in one.', icon: '🎯', coins: 1000, xp: 250, progress: (s) => s.holeInOnes, target: 1 },
  { id: 'win1', name: 'First Victory', desc: 'Win a match.', icon: '🏆', coins: 150, xp: 40, progress: (s) => s.wins, target: 1 },
  { id: 'win5', name: 'Contender', desc: 'Win five matches.', icon: '🥇', coins: 400, xp: 100, progress: (s) => s.wins, target: 5 },
  { id: 'win25', name: 'Champion', desc: 'Win 25 matches.', icon: '👑', coins: 1500, xp: 400, progress: (s) => s.wins, target: 25 },
  { id: 'drive250', name: 'Big Hitter', desc: 'Hit a drive beyond 250 yards.', icon: '💥', coins: 200, xp: 50, progress: (s) => Math.floor(s.longestDrive / YD), target: 250 },
  { id: 'drive300', name: 'Bomber', desc: 'Hit a drive beyond 300 yards.', icon: '🚀', coins: 600, xp: 150, progress: (s) => Math.floor(s.longestDrive / YD), target: 300 },
  { id: 'rare_win', name: 'Rare Form', desc: 'Win a match using a Rare or better club.', icon: '💎', coins: 250, xp: 60, progress: (s) => s.rareWins, target: 1 },
  { id: 'under_par', name: 'Red Numbers', desc: 'Finish a 9 or 18-hole round under par.', icon: '🔴', coins: 300, xp: 80, progress: (s) => s.roundsUnderPar, target: 1 },
  { id: 'expert_win', name: 'Giant Slayer', desc: 'Beat Expert opponents.', icon: '⚔️', coins: 800, xp: 200, progress: (s) => s.expertWins, target: 1 },
  { id: 'all_courses', name: 'Globetrotter', desc: 'Play a round on all four courses.', icon: '🗺️', coins: 500, xp: 120, progress: (s) => s.coursesPlayed.length, target: 4 },
  { id: 'collect15', name: 'Collector', desc: 'Own 15 different clubs.', icon: '🧳', coins: 250, xp: 60, progress: (s) => s.clubsOwned, target: 15 },
  { id: 'collect35', name: 'Curator', desc: 'Own 35 different clubs.', icon: '🏛️', coins: 800, xp: 200, progress: (s) => s.clubsOwned, target: 35 },
  { id: 'legendary', name: 'Legend', desc: 'Own a Legendary club.', icon: '🌟', coins: 500, xp: 120, progress: (s) => s.legendaryOwned, target: 1 },
  { id: 'rounds10', name: 'Regular', desc: 'Complete 10 rounds.', icon: '📅', coins: 200, xp: 60, progress: (s) => s.rounds, target: 10 },
  { id: 'long_putt', name: 'Downtown', desc: 'Hole a putt from over 40 feet.', icon: '📏', coins: 250, xp: 60, progress: (s) => (s.longestPutt >= 12.19 ? 1 : 0), target: 1 },
  { id: 'upgrade', name: 'Tinkerer', desc: 'Upgrade a club.', icon: '🔧', coins: 100, xp: 30, progress: (s) => s.upgrades, target: 1 },
  { id: 'dress', name: 'Dressed to Impress', desc: 'Own 15 cosmetic items.', icon: '👔', coins: 250, xp: 60, progress: (s) => s.cosmeticsOwned, target: 15 },
  { id: 'packs10', name: 'Pack Rat', desc: 'Open 10 club packs.', icon: '📦', coins: 300, xp: 80, progress: (s) => s.packsOpened, target: 10 },
  { id: 'bogey_free', name: 'Clean Card', desc: 'Complete a 9-hole round without a bogey.', icon: '🧼', coins: 500, xp: 120, progress: (s) => s.bogeyFreeRounds, target: 1 },
  { id: 'perfect15', name: 'Pure Strikes', desc: 'Hit 15 perfect shots in one round.', icon: '✨', coins: 300, xp: 80, progress: (s) => s.maxPerfectInRound, target: 15 },
];
