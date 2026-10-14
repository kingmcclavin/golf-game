import { useEffect, useState } from 'react';
import { sound } from '../../audio/sound';
import { RARITY_INFO } from '../../data/clubs';
import type { MatchController } from '../../game/matchController';
import { fmtRel, scoreClass } from '../../golf/scoring';
import { useHud, useSwing } from '../../state/matchStore';
import { useStore } from '../../state/store';
import { fmtDist, yd } from '../../core/units';
import { Coins, Modal, Seg, Toggle } from '../components/common';
import { ACHIEVEMENTS } from '../../data/achievements';
import { courseById } from '../../data/courses';
import { Minimap } from './Minimap';
import { usePhonePortrait } from '../hooks';
import { PixelIcon } from '../components/PixelIcon';
import { SwingPad } from './SwingPad';

const LIE_LABEL: Record<string, string> = {
  tee: 'Tee', fairway: 'Fairway', rough: 'Rough', deepRough: 'Deep rough', green: 'Green', fringe: 'Fringe', bunker: 'Bunker', waste: 'Waste sand', water: 'Water', oob: 'OOB',
};

export function HUD({ ctl, onQuit, onAgain }: { ctl: MatchController; onQuit: () => void; onAgain: () => void }) {
  const h = useHud();
  const pulling = useSwing((s) => s.pulling);
  const portrait = usePhonePortrait();
  const [abilityOpen, setAbilityOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [clubList, setClubList] = useState(false);
  const [card, setCard] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') ctl.nudgeAim(e.shiftKey ? -2 : -0.5);
      if (e.key === 'ArrowRight') ctl.nudgeAim(e.shiftKey ? 2 : 0.5);
      if (e.key === 'ArrowUp') ctl.cycleClub(-1);
      if (e.key === 'ArrowDown') ctl.cycleClub(1);
      if (e.key === 'c') ctl.cycleCamera();
      if (e.key === ' ') ctl.skip();
      if (e.key === 'Escape') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  const aiming = h.phase === 'aim' && h.isHumanTurn;
  const club = h.bag[h.clubIdx];
  const me = h.players[0];
  return (
    <div className={`hud ${portrait ? 'portrait' : ''} ${pulling ? 'is-pulling' : ''}`}>
      {/* ---------- top */}
      <div className="hud-top">
        <div className="hole-card pe" onClick={() => setCard(true)}>
          <div className="h">Hole {h.holeNumber}/{h.totalHoles} · Par {h.par}</div>
          <div className="n">{h.holeName}</div>
          <div className="h">{h.holeYards} yd{portrait ? '' : ' · tap for card'}</div>
        </div>
        <div className="board">
          {h.players.map((p, i) => (
            <div key={i} className={`board-row ${i === h.current && h.phase !== 'holeOver' ? 'cur' : ''}`}>
              <span className="dot" style={{ background: p.color }} />
              <span>{i === 0 ? 'You' : p.name.split(' ')[0]}</span>
              <span className="muted" style={{ fontSize: 11 }}>{p.holed ? '✓' : p.holeStrokes ? `(${p.holeStrokes})` : ''}</span>
              <span className="sc">{fmtRel(p.rel)}</span>
            </div>
          ))}
        </div>
        <div className="grow" />
        <div className="wind" title="Wind">
          <div className="arrow" style={{ transform: `rotate(${h.wind.angle}rad)` }} />
          <div className="mph">{Math.round(h.wind.mph)}</div>
          <div style={{ fontSize: 10, zIndex: 1 }} className="muted">mph</div>
        </div>
        {h.phase !== 'loading' && <Minimap ctl={ctl} />}
        <div className="col" style={{ gap: 6 }}>
          <button className="btn icon pe" aria-label="Pause" onClick={() => { sound.play('click'); setPaused(true); }}><svg width="16" height="18" viewBox="0 0 16 18"><rect x="1" y="1" width="5" height="16" rx="1.5" fill="#fff" /><rect x="10" y="1" width="5" height="16" rx="1.5" fill="#fff" /></svg></button>
          {aiming && <button className="btn icon pe" aria-label="Camera" onClick={() => ctl.cycleCamera()}><PixelIcon name="camera" size={22} /></button>}
        </div>
      </div>

      {portrait ? (
        <>
          {aiming && club && !pulling && (
            <div className="p-info">
              <div className="row wrap" style={{ gap: 5, justifyContent: 'center' }}>
                <span className="info-chip"><PixelIcon name="pin" size={13} /> {fmtDist(h.distToPin)}</span>
                {h.shotType && <span className="info-chip" style={{ color: '#ffe9a0' }}>{h.shotType}</span>}
                <span className="info-chip">{LIE_LABEL[h.lie]}{h.liePenalty > 0.01 ? ` −${Math.round(h.liePenalty * 100)}%` : ''}</span>
                {Math.abs(h.elevation) > 1 && <span className="info-chip">{h.elevation > 0 ? '▲' : '▼'} {Math.round(Math.abs(h.elevation) * 3.28)} ft</span>}
                {h.preview && !h.isPutt && <span className="info-chip">Carry {Math.round(yd(h.preview.carry))} · ~{Math.round(yd(h.preview.total))}</span>}
              </div>
              {h.ability && (
                <button className={`ability-chip pe ${h.ability.state}`} onClick={() => setAbilityOpen(!abilityOpen)}>
                  <b>✦ {h.ability.name}</b> · {h.ability.state === 'active' ? 'ACTIVE' : h.ability.state === 'conditional' ? 'On perfect' : 'Inactive'} {abilityOpen ? '▴' : 'ⓘ'}
                  {abilityOpen && <><br /><span style={{ opacity: 0.85 }}>{h.ability.desc}</span></>}
                </button>
              )}
              {(h.canShape || h.canTraj) && !h.isPutt && (
                <div className="row pe" style={{ gap: 5, justifyContent: 'center' }}>
                  {h.canShape && <Seg value={h.shape < -0.2 ? 'draw' : h.shape > 0.2 ? 'fade' : 'straight'} options={[['draw', '↰'], ['straight', 'Straight'], ['fade', '↱']]} onChange={(v) => ctl.setShape(v === 'draw' ? -0.6 : v === 'fade' ? 0.6 : 0)} />}
                  {h.canTraj && <Seg value={h.traj} options={[['low', 'Low'], ['normal', 'Mid'], ['high', 'High']]} onChange={(v) => ctl.setTraj(v)} />}
                </div>
              )}
            </div>
          )}
          {aiming && !pulling && (
            <>
              <div className="pe p-aim left"><HoldButton label="◀" onTick={() => ctl.nudgeAim(-0.4)} /></div>
              <div className="pe p-aim right"><HoldButton label="▶" onTick={() => ctl.nudgeAim(0.4)} /></div>
            </>
          )}
          <div className="p-pad">
            <SwingPad ctl={ctl} />
          </div>
          {aiming && club && (
            <div className={`p-clubs pe ${pulling ? 'faded' : ''}`}>
              {clubList && (
                <div className="panel p-club-list">
                  {h.bag.map((c, i) => (
                    <button key={c.id} className={`btn small ${i === h.clubIdx ? 'active' : ''}`} style={{ flexDirection: 'column', gap: 0, borderColor: RARITY_INFO[c.rarity].color }} onClick={() => { ctl.selectClub(i); setClubList(false); }}>
                      <span>{c.short}</span><span style={{ fontSize: 11 }} className="muted">{c.category === 'putter' ? 'putt' : `${c.carry}y`}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="club-sel">
                <button className="btn icon" onClick={() => ctl.cycleClub(-1)} aria-label="Longer club">‹</button>
                <button className="club-btn grow" style={{ borderColor: RARITY_INFO[club.rarity].color }} onClick={() => setClubList(!clubList)}>
                  <span className="cn">{club.short} · {club.name}</span>
                  <span className="cs">{club.category === 'putter' ? 'Putter' : `${club.carry} yd max`} · <span className={`r-${club.rarity}`}>{RARITY_INFO[club.rarity].label}</span> · tap for bag</span>
                </button>
                <button className="btn icon" onClick={() => ctl.cycleClub(1)} aria-label="Shorter club">›</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
      {/* ---------- bottom left: club & info */}
      {aiming && club && (
        <div className="hud-left">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="info-chip"><PixelIcon name="pin" size={13} /> {fmtDist(h.distToPin)}</span>
            {h.shotType && <span className="info-chip" style={{ color: '#ffe9a0' }}>{h.shotType}</span>}
            <span className="info-chip">{LIE_LABEL[h.lie]}{h.liePenalty > 0.01 ? ` −${Math.round(h.liePenalty * 100)}%` : ''}</span>
            {Math.abs(h.elevation) > 1 && <span className="info-chip">{h.elevation > 0 ? '▲' : '▼'} {Math.round(Math.abs(h.elevation) * 3.28)} ft</span>}
            {h.preview && !h.isPutt && <span className="info-chip">Carry {Math.round(yd(h.preview.carry))} · Total ~{Math.round(yd(h.preview.total))}</span>}
          </div>
          {h.ability && (
            <div className={`ability-chip ${h.ability.state}`}>
              <b>✦ {h.ability.name}</b> · {h.ability.state === 'active' ? 'ACTIVE' : h.ability.state === 'conditional' ? 'Ready on perfect release' : 'Inactive'}<br />
              <span style={{ opacity: 0.85 }}>{h.ability.desc}</span>
            </div>
          )}
          {(h.canShape || h.canTraj) && !h.isPutt && (
            <div className="row pe" style={{ gap: 6 }}>
              {h.canShape && <Seg value={h.shape < -0.2 ? 'draw' : h.shape > 0.2 ? 'fade' : 'straight'} options={[['draw', '↰ Draw'], ['straight', 'Straight'], ['fade', 'Fade ↱']]} onChange={(v) => ctl.setShape(v === 'draw' ? -0.6 : v === 'fade' ? 0.6 : 0)} />}
              {h.canTraj && <Seg value={h.traj} options={[['low', 'Low'], ['normal', 'Mid'], ['high', 'High']]} onChange={(v) => ctl.setTraj(v)} />}
            </div>
          )}
          <div className="club-sel pe">
            <button className="btn icon" onClick={() => ctl.cycleClub(-1)} aria-label="Previous club">▲</button>
            <button className="club-btn" style={{ borderColor: RARITY_INFO[club.rarity].color }} onClick={() => setClubList(!clubList)}>
              <span className="cn">{club.short} · {club.name}</span>
              <span className="cs">{club.category === 'putter' ? 'Putter' : `${club.carry} yd max carry`} · <span className={`r-${club.rarity}`}>{RARITY_INFO[club.rarity].label}</span></span>
            </button>
            <button className="btn icon" onClick={() => ctl.cycleClub(1)} aria-label="Next club">▼</button>
          </div>
          {clubList && (
            <div className="panel pe" style={{ padding: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 420 }}>
              {h.bag.map((c, i) => (
                <button key={c.id} className={`btn small ${i === h.clubIdx ? 'active' : ''}`} style={{ flexDirection: 'column', gap: 0, borderColor: RARITY_INFO[c.rarity].color }} onClick={() => { ctl.selectClub(i); setClubList(false); }}>
                  <span>{c.short}</span><span style={{ fontSize: 11 }} className="muted">{c.category === 'putter' ? 'putt' : `${c.carry}y`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- aim nudge */}
      {aiming && !pulling && (
        <div className="pe hud-btns" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(12px + var(--safe-b))' }}>
          <HoldButton label="◀" onTick={() => ctl.nudgeAim(-0.4)} />
          <span className="info-chip" style={{ alignSelf: 'center' }}>Aim</span>
          <HoldButton label="▶" onTick={() => ctl.nudgeAim(0.4)} />
        </div>
      )}

      {/* ---------- swing */}
      <div className="hud-right">
        <SwingPad ctl={ctl} />
      </div>
        </>
      )}
      {h.showHint && aiming && <div className="hint">Press the ball and <b>pull down</b> to set power. Release when the needle is in the <b>green</b>! Drag on the course to aim.</div>}

      {(h.phase === 'flight' || h.phase === 'botThink' || h.phase === 'swing' || h.phase === 'result') && !h.isHumanTurn && (
        <button className="btn small pe skip-btn" onClick={() => ctl.skip()}>⏩ Skip</button>
      )}
      {h.botThinking && <div className="thinking">🤔 {h.botThinking}</div>}

      {/* ---------- messages */}
      <div className="hud-center-msg">
        {h.message && (
          <div key={h.message.id} className={`msg ${h.message.kind}`}>
            <div className="t">{h.message.text}</div>
            {h.message.sub && <div className="s">{h.message.sub}</div>}
          </div>
        )}
      </div>

      {/* ---------- overlays */}
      {h.phase === 'loading' && (
        <div className="loading pe"><div className="spinner" /><div>Preparing hole {h.holeNumber}...</div></div>
      )}
      {h.phase === 'intro' && (
        <div className="pe" style={{ position: 'absolute', inset: 0 }} onClick={() => ctl.skip()}>
          <div style={{ position: 'absolute', left: '50%', top: '30%', transform: 'translateX(-50%)' }} className="intro-card">
            <div className="muted">Hole {h.holeNumber} of {h.totalHoles}</div>
            <h1 style={{ fontSize: 40 }}>{h.holeName}</h1>
            <div style={{ fontSize: 20 }}>Par {h.par} · {h.holeYards} yards · Wind {Math.round(h.wind.mph)} mph</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Tap to skip flyover</div>
          </div>
        </div>
      )}
      {h.phase === 'holeOver' && h.holeSummary && (
        <div className="overlay-center pe">
          <div className="modal" style={{ width: 'min(520px, 100%)' }}>
            <div className="muted">Hole {h.holeNumber} · Par {h.par}</div>
            <h2>{h.holeSummary[0].label}{h.holeSummary[0].rel < 0 ? '!' : ''}</h2>
            <div style={{ margin: '10px 0' }}>
              {[...h.holeSummary].map((r, i) => (
                <div key={i} className={`lb-row ${i === 0 ? 'me' : ''}`}>
                  <span className="dot" style={{ width: 12, height: 12, borderRadius: 6, background: r.color, display: 'inline-block' }} />
                  <span className="grow">{i === 0 ? 'You' : r.name}</span>
                  <span className={`sc-${scoreClass(r.strokes, r.par)}`} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{r.strokes}</span>
                  <span className="muted" style={{ width: 110, fontSize: 14 }}>{r.label}</span>
                  <span style={{ width: 40, textAlign: 'right' }}>{fmtRel(r.total)}</span>
                </div>
              ))}
            </div>
            {h.commentary && <div className="muted center" style={{ marginBottom: 10 }}>🎙️ {h.commentary}</div>}
            <div className="row">
              <button className="btn" onClick={() => setCard(true)}>Scorecard</button>
              <div className="grow" />
              <button className="btn primary" onClick={() => ctl.continueAfterHole()}>{h.holeNumber < h.totalHoles ? `Next hole →` : 'Final results →'}</button>
            </div>
          </div>
        </div>
      )}
      {h.phase === 'roundOver' && h.outcome && h.finalRows && <RoundResults ctl={ctl} onQuit={onQuit} onAgain={onAgain} />}

      {card && (
        <Modal onClose={() => setCard(false)} wide>
          <h2>Scorecard</h2>
          <Scorecard />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" onClick={() => setCard(false)}>Close</button></div>
        </Modal>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onQuit={onQuit} />}
      {me && null}
    </div>
  );
}

function HoldButton({ label, onTick }: { label: string; onTick: () => void }) {
  const [timer, setTimer] = useState<number | null>(null);
  const start = (e: React.PointerEvent) => {
    e.stopPropagation();
    onTick();
    const id = window.setInterval(onTick, 60);
    setTimer(id);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    setTimer(null);
  };
  return <button className="btn icon" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>{label}</button>;
}

export function Scorecard() {
  const h = useHud();
  const n = h.pars.length;
  const holes = Array.from({ length: n }, (_, i) => i);
  return (
    <div style={{ overflowX: 'auto', touchAction: 'pan-x' }}>
      <table className="score-table">
        <thead>
          <tr><th style={{ textAlign: 'left' }}>Hole</th>{holes.map((i) => <th key={i}>{i + 1}</th>)}<th>Tot</th><th>±</th></tr>
          <tr><td className="name muted">Par</td>{holes.map((i) => <td key={i} className="muted">{h.pars[i]}</td>)}<td className="muted">{h.pars.reduce((a, b) => a + b, 0)}</td><td /></tr>
        </thead>
        <tbody>
          {h.players.map((p, pi) => (
            <tr key={pi}>
              <td className="name" style={{ color: p.color }}>{pi === 0 ? 'You' : p.name.split(' ')[0]}</td>
              {holes.map((i) => {
                const s = p.scores[i];
                return <td key={i}><span className={s ? `sc-${scoreClass(s, h.pars[i])}` : ''} style={{ display: 'inline-block', minWidth: 22, lineHeight: '22px' }}>{s ?? ''}</span></td>;
              })}
              <td>{p.scores.reduce<number>((a, s) => a + (s ?? 0), 0)}</td>
              <td>{fmtRel(p.rel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PauseMenu({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  const st = useStore((s) => s.profile.settings);
  const upd = useStore((s) => s.updateSettings);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal onClose={onResume}>
      <h2>Paused</h2>
      <div style={{ marginTop: 10 }}>
        <div className="setting"><span>Sound effects</span><Toggle on={st.sfx} onChange={(v) => upd({ sfx: v })} /></div>
        <div className="setting"><span>Music</span><Toggle on={st.music} onChange={(v) => upd({ music: v })} /></div>
        <div className="setting"><span>Opponent speed</span><Seg value={st.botSpeed} options={[['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Fastest']]} onChange={(v) => upd({ botSpeed: v })} /></div>
        <div className="setting"><span>Slope arrows</span><Toggle on={st.showSlopeGrid} onChange={(v) => upd({ showSlopeGrid: v })} /></div>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>Keyboard: ←/→ aim, ↑/↓ club, C camera, Space skip, Esc pause.</div>
      <div className="row" style={{ marginTop: 12 }}>
        {confirm ? (
          <>
            <span className="grow muted">Quit and forfeit this round? No rewards will be given.</span>
            <button className="btn" onClick={() => setConfirm(false)}>No</button>
            <button className="btn danger" onClick={onQuit}>Quit</button>
          </>
        ) : (
          <>
            <button className="btn danger" onClick={() => setConfirm(true)}>Quit round</button>
            <div className="grow" />
            <button className="btn primary" onClick={onResume}>Resume</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function RoundResults({ ctl, onQuit, onAgain }: { ctl: MatchController; onQuit: () => void; onAgain: () => void }) {
  const h = useHud();
  const o = h.outcome!;
  const rows = h.finalRows!;
  const meRow = rows.find((r) => !r.isBot)!;
  const won = rows.length > 1 && meRow.position === 1 && rows.filter((r) => r.position === 1).length === 1;
  const [showCard, setShowCard] = useState(false);
  return (
    <div className="overlay-center pe" style={{ background: 'rgba(0,12,12,0.6)' }}>
      <div className="modal" style={{ width: 'min(820px, 100%)' }}>
        <div className="row">
          <div className="grow">
            <div className="muted">{courseById(ctl.match.config.courseId).name} · {h.totalHoles} holes</div>
            <h1 style={{ fontSize: 40, color: won ? 'var(--accent)' : undefined }}>{rows.length === 1 ? 'Round complete' : won ? '🏆 Victory!' : meRow.position === 1 ? 'Tied for the lead!' : `You finished ${meRow.position}${['st', 'nd', 'rd'][meRow.position - 1] ?? 'th'}`}</h1>
          </div>
          <div className="center"><div className="muted">Your score</div><div style={{ fontFamily: 'var(--display)', fontSize: 40 }}>{fmtRel(meRow.rel)}</div></div>
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16, marginTop: 10 }}>
          <div className="grow" style={{ minWidth: 260 }}>
            <h3 style={{ marginBottom: 6 }}>Leaderboard</h3>
            {rows.map((r, i) => (
              <div key={i} className={`lb-row ${!r.isBot ? 'me' : ''}`}>
                <div className={`pos ${r.position === 1 ? 'p1' : ''}`}>{r.position}</div>
                <span className="dot" style={{ width: 10, height: 10, borderRadius: 5, background: r.color, display: 'inline-block' }} />
                <span className="grow">{r.isBot ? r.name : 'You'}</span>
                <span className="muted" style={{ fontSize: 14 }}>{r.strokes}</span>
                <span style={{ width: 44, textAlign: 'right' }}>{fmtRel(r.rel)}</span>
              </div>
            ))}
            <button className="btn small" onClick={() => setShowCard(!showCard)}>{showCard ? 'Hide' : 'Show'} scorecard</button>
          </div>
          <div className="grow" style={{ minWidth: 260 }}>
            <h3 style={{ marginBottom: 6 }}>Rewards</h3>
            {o.lines.map((l, i) => (
              <div key={i} className="reward-line" style={{ animation: `pop ${0.3 + i * 0.12}s` }}><span>{l.label}</span><Coins n={l.coins} size={15} /></div>
            ))}
            {o.levelRewards > 0 && <div className="reward-line"><span>Level-up bonus</span><Coins n={o.levelRewards} size={15} /></div>}
            <div className="reward-line" style={{ fontFamily: 'var(--display)', fontSize: 20, borderBottom: 0 }}><span>Total</span><Coins n={o.coins + o.levelRewards} size={20} /></div>
            <div className="muted">+{o.xp} XP{o.levelAfter > o.levelBefore ? ` · 🎉 Level up! Now level ${o.levelAfter}` : ''}</div>
            {o.newCourses.map((c) => <div key={c} style={{ color: 'var(--accent)' }}>🗺️ New course unlocked: {courseById(c).name}</div>)}
            {o.newAchievements.map((a) => <div key={a} style={{ color: 'var(--accent)' }}>🏅 Achievement: {ACHIEVEMENTS.find((x) => x.id === a)?.name} (claim it in Achievements)</div>)}
            <div style={{ marginTop: 6 }}>
              {o.challengeProgress.map((c, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{c.done ? '✅' : '▫️'} {c.text} ({c.progress}/{c.target})</div>)}
            </div>
          </div>
        </div>
        {showCard && <div style={{ marginTop: 10 }}><Scorecard /></div>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onQuit}>Main menu</button>
          <div className="grow" />
          <button className="btn primary" onClick={onAgain}>Play again</button>
        </div>
      </div>
    </div>
  );
}
