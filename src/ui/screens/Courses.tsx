import { COURSES, courseById } from '../../data/courses';
import { DIFFICULTY_INFO } from '../../data/bots';
import { ECONOMY } from '../../data/economy';
import { courseUnlocked, levelFromXp } from '../../data/progression';
import { fmtRel } from '../../golf/scoring';
import { useStore } from '../../state/store';
import { TopBar } from '../components/common';
import { YD_TO_M } from '../../core/units';

/** Stylised course "postcard" drawn with CSS (works without WebGL). */
export function CourseArt({ id, small }: { id: string; small?: boolean }) {
  const c = courseById(id);
  const [grass, sky, accent] = c.preview;
  const t = c.theme;
  return (
    <div className="course-art" style={{ height: small ? 70 : 110, background: `linear-gradient(180deg, ${sky} 0%, ${t.sky[1]} 52%, ${grass} 52%, ${t.rough} 100%)` }}>
      <div style={{ position: 'absolute', left: '8%', right: '30%', top: '38%', height: '20%', background: t.mountains, clipPath: 'polygon(0 100%, 18% 20%, 35% 80%, 55% 0, 75% 70%, 100% 100%)', opacity: 0.85 }} />
      {t.ocean && <div style={{ position: 'absolute', right: 0, top: '52%', width: '38%', bottom: 0, background: t.water, clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0 100%)' }} />}
      <div style={{ position: 'absolute', left: '20%', right: '25%', top: '62%', height: '18%', borderRadius: '50%', background: t.fairway }} />
      <div style={{ position: 'absolute', left: '58%', top: '60%', width: '16%', height: '12%', borderRadius: '50%', background: t.green }} />
      <div style={{ position: 'absolute', left: '30%', top: '76%', width: '10%', height: '8%', borderRadius: '50%', background: accent }} />
      <div style={{ position: 'absolute', left: '66%', top: '35%', width: 2, height: '30%', background: '#fff' }} />
      <div style={{ position: 'absolute', left: 'calc(66% + 2px)', top: '35%', width: 14, height: 9, background: t.flag }} />
    </div>
  );
}

export function CoursesScreen() {
  const p = useStore((s) => s.profile);
  const go = useStore((s) => s.go);
  const level = levelFromXp(p.xp).level;
  return (
    <div className="screen dim">
      <TopBar title="Courses" />
      <div className="screen-body">
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {COURSES.map((c) => {
            const ok = courseUnlocked(c.id, level, p.lifetime.wins);
            const par = c.holes.reduce((a, h) => a + h.par, 0);
            const yards = c.holes.reduce((a, h) => a + h.length, 0);
            const best9 = p.lifetime.bestRound[`${c.id}:9`];
            const est = Math.round(ECONOMY.perHole * 9 * c.rewardMul * DIFFICULTY_INFO.intermediate.rewardMul + ECONOMY.winBonusPerHole * 9 * c.rewardMul);
            return (
              <div key={c.id} className={`card ${ok ? '' : 'locked'}`}>
                <CourseArt id={c.id} />
                <div className="row">
                  <h3 className="grow">{c.name}</h3>
                  <span className="diff-dots">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= c.difficulty ? 'on' : ''} />)}</span>
                </div>
                <div className="muted" style={{ fontSize: 14, margin: '4px 0 8px' }}>{c.description}</div>
                <div className="row wrap" style={{ fontSize: 13, gap: 6 }}>
                  <span className="tag">{c.holes.length} holes (+ back nine)</span>
                  <span className="tag">Par {par}</span>
                  <span className="tag">{yards.toLocaleString()} yd</span>
                  <span className="tag">Wind {Math.round(c.theme.wind[0] * 2.237)}-{Math.round(c.theme.wind[1] * 2.237)} mph</span>
                  <span className="tag">Rewards ×{c.rewardMul}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  {best9 !== undefined ? `Best 9-hole score: ${fmtRel(best9)}` : 'Not yet completed'} · Win up to ~{est} coins per 9 holes
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Holes: {c.holes.map((h) => `${h.name} (P${h.par}, ${h.length}y)`).join(' · ')}
                </div>
                <div style={{ marginTop: 10 }}>
                  {ok ? (
                    <button className="btn green small" onClick={() => go('play', c.id)}>Play this course</button>
                  ) : (
                    <span className="tag" style={{ fontSize: 13 }}>🔒 Unlocks at level {c.unlock.level}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Course lengths in yards ({(YD_TO_M * 100).toFixed(0)} m per 100 yd).</div>
      </div>
    </div>
  );
}
