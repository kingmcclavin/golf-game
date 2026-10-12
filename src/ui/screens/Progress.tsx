import { useState } from 'react';
import { sound } from '../../audio/sound';
import { ACHIEVEMENTS } from '../../data/achievements';
import { CLUBS } from '../../data/clubs';
import { COSMETICS } from '../../data/cosmetics';
import { courseById } from '../../data/courses';
import { levelFromXp, levelUpReward, upcomingUnlocks } from '../../data/progression';
import { fmtRel } from '../../golf/scoring';
import { useStore } from '../../state/store';
import { Coins, TopBar } from '../components/common';
import { yd } from '../../core/units';

export function ProgressScreen() {
  const p = useStore((s) => s.profile);
  const claim = useStore((s) => s.claimAchievement);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<'ach' | 'stats' | 'history'>('ach');
  const L = levelFromXp(p.xp);
  const unlocks = upcomingUnlocks(L.level).slice(0, 5);
  const s = p.lifetime;
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const sa = p.achievements[a.id], sb = p.achievements[b.id];
    const ka = sa && !sa.claimed ? 0 : !sa ? 1 : 2;
    const kb = sb && !sb.claimed ? 0 : !sb ? 1 : 2;
    return ka - kb;
  });
  return (
    <div className="screen dim">
      <TopBar title="Progression" />
      <div className="row wrap" style={{ flex: 'none', gap: 12 }}>
        <div className="panel" style={{ padding: 12, flex: '1 1 260px' }}>
          <div className="row"><div className="lvl-badge" style={{ width: 52, height: 52, fontSize: 24 }}>{L.level}</div>
            <div className="grow">
              <div style={{ fontFamily: 'var(--display)', fontSize: 20 }}>Level {L.level}</div>
              <div className="progress" style={{ marginTop: 4 }}><div style={{ width: `${(L.into / L.need) * 100}%` }} /></div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{L.into} / {L.need} XP · next level reward <Coins n={levelUpReward(L.level + 1)} size={13} /></div>
            </div>
          </div>
        </div>
        <div className="panel" style={{ padding: 12, flex: '1 1 260px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>Next unlocks</div>
          {unlocks.length === 0 && <div className="muted">Everything unlocked!</div>}
          {unlocks.map((u, i) => <div key={i} className="muted" style={{ fontSize: 14 }}>Lv {u.level}: {u.text}</div>)}
        </div>
        <div className="panel" style={{ padding: 12, flex: '1 1 200px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>Collection</div>
          <div className="muted" style={{ fontSize: 14 }}>Clubs {s.clubsOwned}/{CLUBS.length}</div>
          <div className="progress"><div style={{ width: `${(s.clubsOwned / CLUBS.length) * 100}%` }} /></div>
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Cosmetics {p.cosmetics.length}/{COSMETICS.length}</div>
          <div className="progress"><div style={{ width: `${(p.cosmetics.length / COSMETICS.length) * 100}%` }} /></div>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'ach' ? 'on' : ''}`} onClick={() => setTab('ach')}>🏆 Achievements</button>
        <button className={`tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>📊 Career stats</button>
        <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>🕘 Match history</button>
      </div>
      <div className="screen-body">
        {tab === 'ach' && (
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {sorted.map((a) => {
              const st = p.achievements[a.id];
              const prog = Math.min(a.target, a.progress(s));
              return (
                <div key={a.id} className={`ach ${st ? 'done' : ''}`}>
                  <div className="ic" style={{ filter: st ? 'none' : 'grayscale(1)' }}>{a.icon}</div>
                  <div className="grow">
                    <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{a.desc}</div>
                    {!st && <div className="row" style={{ marginTop: 4 }}><div className="progress grow"><div style={{ width: `${(prog / a.target) * 100}%` }} /></div><span className="muted" style={{ fontSize: 12 }}>{prog}/{a.target}</span></div>}
                  </div>
                  {st && !st.claimed && <button className="btn primary small" onClick={() => { claim(a.id); sound.play('coin'); toast(`+${a.coins} coins, +${a.xp} XP`, 'good', '🏅'); }}>Claim <Coins n={a.coins} size={13} /></button>}
                  {st?.claimed && <span>✅</span>}
                  {!st && <span className="muted" style={{ fontSize: 13 }}><Coins n={a.coins} size={12} /></span>}
                </div>
              );
            })}
          </div>
        )}
        {tab === 'stats' && (
          <div className="cards">
            {[
              ['Rounds played', s.rounds], ['Holes played', s.holes], ['Wins', s.wins], ['Birdies', s.birdies], ['Eagles', s.eagles], ['Holes in one', s.holeInOnes],
              ['Longest drive', `${Math.round(yd(s.longestDrive))} yd`], ['Longest putt holed', `${Math.round(s.longestPutt * 3.28)} ft`], ['Packs opened', s.packsOpened],
              ['Perfect strikes', s.perfectShots], ['Rounds under par', s.roundsUnderPar], ['Club upgrades', s.upgrades],
            ].map(([k, v]) => (
              <div key={k as string} className="card"><div className="muted" style={{ fontSize: 13 }}>{k}</div><div style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{v}</div></div>
            ))}
            {Object.entries(s.bestRound).map(([k, v]) => {
              const [cid, holes] = k.split(':');
              return <div key={k} className="card"><div className="muted" style={{ fontSize: 13 }}>Best {holes}-hole · {courseById(cid).name}</div><div style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{fmtRel(v)}</div></div>;
            })}
          </div>
        )}
        {tab === 'history' && (
          <div className="col" style={{ gap: 6 }}>
            {p.matchHistory.length === 0 && <div className="muted">No matches yet. Go play!</div>}
            {p.matchHistory.map((m, i) => (
              <div key={i} className="lb-row" style={{ fontSize: 15 }}>
                <div className={`pos ${m.position === 1 ? 'p1' : ''}`}>{m.position}</div>
                <div className="grow">
                  {courseById(m.courseId).name} · {m.holes} holes · {fmtRel(m.rel)} ({m.strokes})
                  <div className="muted" style={{ fontSize: 12, fontFamily: 'var(--body)' }}>{new Date(m.at).toLocaleString()} · vs {m.opponents.join(', ') || 'solo'} · {m.difficulty}</div>
                </div>
                <Coins n={m.coins} size={14} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
