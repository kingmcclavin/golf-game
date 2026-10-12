import { sound } from '../../audio/sound';
import { useStore } from '../../state/store';
import { Coins, TopBar } from '../components/common';

export function ChallengesScreen() {
  const p = useStore((s) => s.profile);
  const claim = useStore((s) => s.claimChallenge);
  const toast = useStore((s) => s.toast);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const hrs = Math.ceil((midnight.getTime() - now.getTime()) / 3600000);
  return (
    <div className="screen dim">
      <TopBar title="Daily Challenges" />
      <div className="screen-body" style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <div className="muted" style={{ marginBottom: 10 }}>New challenges in {hrs}h. Each claimed challenge also grants 25 XP.</div>
        {p.daily.challenges.map((c, i) => {
          const done = c.progress >= c.target;
          return (
            <div key={i} className={`ach ${done ? 'done' : ''}`} style={{ marginBottom: 10 }}>
              <div className="ic">{c.claimed ? '✅' : done ? '🎁' : '📅'}</div>
              <div className="grow">
                <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{c.text}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  <div className="progress grow"><div style={{ width: `${(c.progress / c.target) * 100}%` }} /></div>
                  <span className="muted" style={{ fontSize: 13 }}>{c.progress}/{c.target}</span>
                </div>
              </div>
              {c.claimed ? (
                <span className="muted">Claimed</span>
              ) : (
                <button className="btn primary small" disabled={!done} onClick={() => { const n = claim(i); if (n) { sound.play('coin'); toast(`+${n} coins`, 'good', '🪙'); } }}>
                  Claim <Coins n={c.reward} size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
