import { sound } from '../../audio/sound';
import { ACHIEVEMENTS } from '../../data/achievements';
import { courseById } from '../../data/courses';
import { currentEvent, eventEndsAt } from '../../data/events';
import { fmtRel } from '../../golf/scoring';
import { useStore, type Screen } from '../../state/store';
import { Coins, LevelPill } from '../components/common';
import { startQuickMatch } from './PlaySetup';

export function MainMenu() {
  const p = useStore((s) => s.profile);
  const go = useStore((s) => s.go);
  const claimableAch = ACHIEVEMENTS.filter((a) => p.achievements[a.id] && !p.achievements[a.id].claimed).length;
  const claimableCh = p.daily.challenges.filter((c) => c.progress >= c.target && !c.claimed).length;
  const newClubs = Object.values(p.clubs).filter((c) => !c.seen).length;
  const ev = currentEvent();
  const days = Math.max(1, Math.ceil((eventEndsAt().getTime() - Date.now()) / 86400000));
  const last = p.matchHistory[0];
  const tiles: Array<{ id: Screen; label: string; ico: string; badge?: number }> = [
    { id: 'courses', label: 'Courses', ico: '🗺️' },
    { id: 'bag', label: 'Golf Bag', ico: '🏌️', badge: newClubs },
    { id: 'packs', label: 'Club Packs', ico: '🎁' },
    { id: 'character', label: 'Character', ico: '🧢' },
    { id: 'shop', label: 'Shop', ico: '🛍️' },
    { id: 'challenges', label: 'Challenges', ico: '📅', badge: claimableCh },
    { id: 'progress', label: 'Achievements', ico: '🏆', badge: claimableAch },
    { id: 'settings', label: 'Settings', ico: '⚙️' },
  ];
  const nav = (s: Screen) => {
    sound.play('click');
    go(s);
  };
  return (
    <div className="screen">
      <div className="topbar">
        <LevelPill />
        <div className="grow" />
        <div className="pill"><Coins n={p.coins} /></div>
      </div>
      <div className="menu">
        <div className="menu-left">
          <div className="logo">Fairway<span>Legends</span></div>
          <button className="btn primary play-btn" onClick={() => nav('play')}>⛳ Play Golf</button>
          <button className="btn blue" onClick={() => { sound.play('click'); startQuickMatch(); }}>
            ⚡ Quick 3-Hole Match {last ? `· ${courseById(last.courseId).name}` : ''}
          </button>
          <div className="menu-grid">
            {tiles.map((t) => (
              <button key={t.id} className="menu-tile" onClick={() => nav(t.id)}>
                <span className="ico">{t.ico}</span>
                {t.label}
                {!!t.badge && <span className="badge">{t.badge}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="menu-right">
          <div className="panel quick-card" style={{ borderColor: ev.color }}>
            <div className="row"><span className="tag" style={{ background: ev.color, color: '#201000' }}>Event</span><span className="muted" style={{ fontSize: 13 }}>{days} day{days > 1 ? 's' : ''} left</span></div>
            <h3 style={{ marginTop: 6 }}>{ev.name}</h3>
            <div className="muted" style={{ fontSize: 14 }}>{ev.desc}</div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => nav('packs')}>View Event Pack →</button>
          </div>
          <div className="panel quick-card">
            <h3>Daily Challenges</h3>
            {p.daily.challenges.map((c, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <div className="row" style={{ fontSize: 14, justifyContent: 'space-between' }}>
                  <span>{c.claimed ? '✅ ' : ''}{c.text}</span><span className="muted">{c.progress}/{c.target}</span>
                </div>
                <div className="progress" style={{ marginTop: 4 }}><div style={{ width: `${(c.progress / c.target) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          {last && (
            <div className="panel quick-card">
              <div className="muted" style={{ fontSize: 13 }}>Last round</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>
                {courseById(last.courseId).name} · {last.holes} holes · {fmtRel(last.rel)} · {last.position === 1 && last.players > 1 ? '🏆 Won' : `${last.position}/${last.players}`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
