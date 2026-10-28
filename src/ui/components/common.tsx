import { useEffect, useRef, type ReactNode } from 'react';
import { sound } from '../../audio/sound';
import { CATEGORY_LABEL, clubPerformance, effectiveStats, RARITY_INFO, STAT_KEYS, STAT_LABEL, SUBTYPES, type ClubDef, type Rarity } from '../../data/clubs';
import { describeAbility, EFFECTS } from '../../data/abilities';
import { levelFromXp } from '../../data/progression';
import { host } from '../../game2d/host';
import { useStore } from '../../state/store';
import { yd } from '../../core/units';

export function Coins({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="coins" style={{ fontSize: size }}>
      <i className="coin-icon" style={{ width: size + 2, height: size + 2 }} />
      {n.toLocaleString()}
    </span>
  );
}

export function RarityTag({ r }: { r: Rarity }) {
  return <span className={`tag bg-${r}`}>{RARITY_INFO[r].label}</span>;
}

export function GameCanvas({ className, onPointerDown, onPointerMove, onPointerUp, children }: {
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    host.attach(el);
    return () => host.detach(el);
  }, []);
  return (
    <div className={className ?? 'canvas-layer'} ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ touchAction: 'none' }}>
      {children}
    </div>
  );
}

export function TopBar({ title, back = 'menu', right }: { title: string; back?: string | null; right?: ReactNode }) {
  const go = useStore((s) => s.go);
  const coins = useStore((s) => s.profile.coins);
  return (
    <div className="screen-head">
      {back !== null && (
        <button className="btn icon" aria-label="Back" onClick={() => { sound.play('click'); go(back as any); }}>←</button>
      )}
      <h2 className="grow">{title}</h2>
      {right}
      <div className="pill"><Coins n={coins} /></div>
    </div>
  );
}

export function LevelPill() {
  const xp = useStore((s) => s.profile.xp);
  const L = levelFromXp(xp);
  return (
    <div className="pill" title={`${L.into}/${L.need} XP`}>
      <div className="lvl-badge">{L.level}</div>
      <div className="col" style={{ gap: 2 }}>
        <span style={{ fontSize: 12, lineHeight: 1 }} className="muted">Level {L.level}</span>
        <div className="xpbar"><div style={{ width: `${(L.into / L.need) * 100}%` }} /></div>
      </div>
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(860px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.icon && <span>{t.icon}</span>}<span>{t.text}</span></div>
      ))}
    </div>
  );
}

export function ClubIcon({ def, size = 46 }: { def: ClubDef; size?: number }) {
  const r = RARITY_INFO[def.rarity];
  return (
    <div className="club-icon" style={{ width: size, height: size, background: `linear-gradient(145deg, ${def.color}, #10282a)`, boxShadow: `0 0 0 2px ${r.color}, 0 0 ${def.rarity === 'legendary' ? 16 : def.rarity === 'epic' ? 10 : 0}px ${r.color}` }}>
      {SUBTYPES[def.subtype].short}
    </div>
  );
}

const STAT_COLORS: Record<string, string> = {
  power: '#ff7a5a', accuracy: '#4cd17a', control: '#3d9bff', loft: '#7ad8ff', spin: '#b05cff', forgiveness: '#ffd23a', ability: '#ff7ac0',
};

export function StatBars({ def, level, compare }: { def: ClubDef; level: number; compare?: { def: ClubDef; level: number } }) {
  const s = effectiveStats(def, level);
  const c = compare ? effectiveStats(compare.def, compare.level) : null;
  return (
    <div className="col" style={{ gap: 4 }}>
      {STAT_KEYS.map((k) => {
        const diff = c ? s[k] - c[k] : 0;
        return (
          <div className="stat" key={k}>
            <span className="muted">{STAT_LABEL[k]}</span>
            <div className="bar"><div style={{ width: `${s[k]}%`, background: STAT_COLORS[k] }} /></div>
            <span style={{ textAlign: 'right' }}>
              {s[k]}
              {c && diff !== 0 && <span style={{ fontSize: 11, color: diff > 0 ? '#6ae38f' : '#ff7a7a' }}> {diff > 0 ? '+' : ''}{diff}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function clubStrengths(def: ClubDef): { strong: string; weak: string } {
  const entries = STAT_KEYS.filter((k) => k !== 'ability').map((k) => [k, def.stats[k]] as const);
  entries.sort((a, b) => b[1] - a[1]);
  return { strong: STAT_LABEL[entries[0][0]], weak: STAT_LABEL[entries[entries.length - 1][0]] };
}

export function ClubCard({ def, level = 1, shards, compare, footer, onClick, selected }: {
  def: ClubDef; level?: number; shards?: number; compare?: { def: ClubDef; level: number }; footer?: ReactNode; onClick?: () => void; selected?: boolean;
}) {
  const r = RARITY_INFO[def.rarity];
  const perf = clubPerformance(def, level);
  const sw = clubStrengths(def);
  const isPutter = def.category === 'putter';
  return (
    <div className={`card club-card ${selected ? 'sel' : ''}`} style={{ borderColor: selected ? undefined : `${r.color}66` }} onClick={onClick}>
      <div className="row">
        <ClubIcon def={def} />
        <div className="grow">
          <div className="name">{def.name}</div>
          <div className="row" style={{ gap: 6, marginTop: 3 }}>
            <RarityTag r={def.rarity} />
            <span className="muted" style={{ fontSize: 12 }}>{CATEGORY_LABEL[def.category]}{level > 1 ? ` · Lv ${level}` : ''}</span>
          </div>
        </div>
      </div>
      <div className="row muted" style={{ fontSize: 13, justifyContent: 'space-between' }}>
        <span>{isPutter ? `Max putt ${Math.round(perf.maxCarry * 3.28)} ft` : `Carry ${Math.round(yd(perf.maxCarry))} yd`}</span>
        <span>▲ {sw.strong} · ▼ {sw.weak}</span>
      </div>
      <StatBars def={def} level={level} compare={compare} />
      <div className="ability-box">
        <b className={`r-${def.rarity}`}>✦ {def.ability.name} <span className="muted" style={{ fontSize: 11, fontFamily: 'var(--body)' }}>{EFFECTS[def.ability.effect].kind}</span></b>
        {describeAbility(def.ability, def.stats.ability + (level - 1) * 2)}
      </div>
      {shards !== undefined && shards > 0 && <div className="muted" style={{ fontSize: 12 }}>Duplicates stored: {shards}</div>}
      <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>{def.flavor}</div>
      {footer}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
