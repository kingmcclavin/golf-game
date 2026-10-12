import { useMemo, useState } from 'react';
import { sound } from '../../audio/sound';
import { RNG } from '../../core/rng';
import { ARCHETYPE_INFO, BOTS, DIFFICULTY_INFO, type BotDef, type Difficulty } from '../../data/bots';
import { BAG_SLOTS, clubById, SLOT_LABEL } from '../../data/clubs';
import { COURSES } from '../../data/courses';
import { courseUnlocked, DIFFICULTY_UNLOCK, FEATURE_UNLOCKS, levelFromXp } from '../../data/progression';
import type { MatchLength } from '../../golf/match';
import type { MatchSetup } from '../../game/matchController';
import { bagIssues, type Profile } from '../../state/profile';
import { useStore } from '../../state/store';
import { ClubIcon, TopBar } from '../components/common';
import { CourseArt } from './Courses';

export let pendingMatch: MatchSetup | null = null;

export function bagFromProfile(p: Profile) {
  return BAG_SLOTS.map((s) => p.bag[s]).filter((x): x is string => !!x).map((id) => ({ def: clubById(id), level: p.clubs[id]?.level ?? 1 }));
}

export function pickOpponents(difficulty: Difficulty, count: number, seed = Date.now()): BotDef[] {
  const rng = new RNG(seed);
  const pool = BOTS.filter((b) => b.difficulty === difficulty);
  const out: BotDef[] = [];
  const copy = [...pool];
  while (out.length < count && copy.length) out.push(copy.splice(rng.int(0, copy.length - 1), 1)[0]);
  return out;
}

export function launchMatch(setup: Omit<MatchSetup, 'profile' | 'bag'>) {
  const st = useStore.getState();
  const issues = bagIssues(st.profile);
  if (issues.length) {
    st.toast(issues[0], 'bad');
    st.go('bag');
    return;
  }
  pendingMatch = { ...setup, profile: st.profile, bag: bagFromProfile(st.profile) };
  useStore.setState({ matchKey: st.matchKey + 1 });
  st.go('match');
}

export function startQuickMatch() {
  const p = useStore.getState().profile;
  const level = levelFromXp(p.xp).level;
  const last = p.matchHistory[0];
  const courseId = last && courseUnlocked(last.courseId, level, p.lifetime.wins) ? last.courseId : 'pinecrest';
  const difficulty: Difficulty = last?.difficulty ?? 'beginner';
  launchMatch({ courseId, length: 3, difficulty, opponents: pickOpponents(difficulty, 2) });
}

export function PlaySetup() {
  const p = useStore((s) => s.profile);
  const go = useStore((s) => s.go);
  const param = useStore((s) => s.screenParam);
  const level = levelFromXp(p.xp).level;
  const [courseId, setCourse] = useState(() => param ?? p.matchHistory[0]?.courseId ?? 'pinecrest');
  const [length, setLength] = useState<MatchLength>(9);
  const [difficulty, setDifficulty] = useState<Difficulty>(p.matchHistory[0]?.difficulty ?? 'beginner');
  const [count, setCount] = useState(2);
  const [seed, setSeed] = useState(() => Date.now());
  const opponents = useMemo(() => pickOpponents(difficulty, count, seed), [difficulty, count, seed]);
  const course = COURSES.find((c) => c.id === courseId)!;
  const unlocked = courseUnlocked(courseId, level, p.lifetime.wins);
  const bag = bagFromProfile(p);

  return (
    <div className="screen dim">
      <TopBar title="Play Golf" />
      <div className="screen-body">
        <h3 style={{ margin: '4px 0 8px' }}>Course</h3>
        <div className="cards">
          {COURSES.map((c) => {
            const ok = courseUnlocked(c.id, level, p.lifetime.wins);
            return (
              <button key={c.id} className={`card ${c.id === courseId ? 'sel' : ''} ${ok ? '' : 'locked'}`} onClick={() => { sound.play('click'); setCourse(c.id); }}>
                <CourseArt id={c.id} small />
                <div className="row"><b style={{ fontFamily: 'var(--display)', fontSize: 18 }} className="grow">{c.name}</b>{!ok && <span>🔒 Lv {c.unlock.level}</span>}</div>
                <div className="muted" style={{ fontSize: 13 }}>{c.tagline}</div>
              </button>
            );
          })}
        </div>
        <div className="row wrap" style={{ marginTop: 14, gap: 18, alignItems: 'flex-start' }}>
          <div className="col">
            <h3>Holes</h3>
            <div className="seg">
              {([3, 9, 18] as MatchLength[]).map((l) => (
                <button key={l} className={length === l ? 'on' : ''} disabled={l === 18 && level < FEATURE_UNLOCKS.eighteen} onClick={() => setLength(l)}>
                  {l}{l === 18 && level < FEATURE_UNLOCKS.eighteen ? ` 🔒${FEATURE_UNLOCKS.eighteen}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="col">
            <h3>Opponent skill</h3>
            <div className="seg">
              {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
                <button key={d} className={difficulty === d ? 'on' : ''} disabled={level < DIFFICULTY_UNLOCK[d]} onClick={() => setDifficulty(d)}>
                  {DIFFICULTY_INFO[d].label}{level < DIFFICULTY_UNLOCK[d] ? ` 🔒${DIFFICULTY_UNLOCK[d]}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="col">
            <h3>Opponents</h3>
            <div className="seg">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n === 0 ? 'Solo' : n}</button>
              ))}
            </div>
          </div>
        </div>
        {count > 0 && (
          <>
            <div className="row" style={{ marginTop: 14 }}><h3 className="grow">Your rivals</h3><button className="btn small" onClick={() => setSeed(Date.now())}>🎲 Shuffle</button></div>
            <div className="cards" style={{ marginTop: 8 }}>
              {opponents.map((b) => (
                <div key={b.id} className="card">
                  <div className="row">
                    <div className="club-icon" style={{ background: b.color, fontSize: 22 }}>{ARCHETYPE_INFO[b.archetype].icon}</div>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{b.name}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{ARCHETYPE_INFO[b.archetype].label} · <span style={{ color: DIFFICULTY_INFO[b.difficulty].color }}>{'★'.repeat(DIFFICULTY_INFO[b.difficulty].stars)}</span></div>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{b.bio}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row" style={{ marginTop: 14 }}><h3 className="grow">Your bag</h3><button className="btn small" onClick={() => go('bag')}>Edit bag</button></div>
        <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
          {BAG_SLOTS.map((s) => {
            const id = p.bag[s];
            return id ? (
              <div key={s} className="col" style={{ alignItems: 'center', gap: 2, width: 64 }} title={clubById(id).name}>
                <ClubIcon def={clubById(id)} size={44} />
                <span className="muted" style={{ fontSize: 11 }}>{SLOT_LABEL[s]}</span>
              </div>
            ) : (
              <div key={s} className="col" style={{ alignItems: 'center', gap: 2, width: 64 }}>
                <div className="club-icon" style={{ width: 44, height: 44, border: '2px dashed rgba(255,255,255,0.25)' }}>—</div>
                <span className="muted" style={{ fontSize: 11 }}>{SLOT_LABEL[s]}</span>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{bag.length} clubs ready.</div>
      </div>
      <div className="row" style={{ flex: 'none' }}>
        <div className="grow muted" style={{ fontSize: 14 }}>
          {course.name} · {length} holes · {count === 0 ? 'Solo practice round' : `${count} ${DIFFICULTY_INFO[difficulty].label} opponent${count > 1 ? 's' : ''}`} · Rewards ×{(course.rewardMul * DIFFICULTY_INFO[difficulty].rewardMul).toFixed(2)}
        </div>
        <button className="btn primary" style={{ minWidth: 180, fontSize: 22 }} disabled={!unlocked} onClick={() => { sound.play('click'); launchMatch({ courseId, length, difficulty, opponents }); }}>
          {unlocked ? 'Tee Off →' : `🔒 Level ${course.unlock.level}`}
        </button>
      </div>
    </div>
  );
}
