import { useEffect, useState } from 'react';
import { sound } from '../../audio/sound';
import { BAG_SLOTS, clubById, RARITIES, RARITY_INFO, SLOT_CATEGORY, type Rarity } from '../../data/clubs';
import { cosmeticById } from '../../data/cosmetics';
import { currentEvent } from '../../data/events';
import { PACKS, type PackDef, type PackReward } from '../../data/packs';
import { levelFromXp } from '../../data/progression';
import type { GrantResult } from '../../state/profile';
import { useStore } from '../../state/store';
import { ClubCard, Coins, Modal, Toggle, TopBar } from '../components/common';

interface Opening {
  pack: PackDef;
  rewards: PackReward[];
  grants: GrantResult[];
  stage: 'pack' | 'reveal' | 'summary';
  idx: number;
}

const best = (rs: PackReward[]): Rarity => rs.reduce<Rarity>((b, r) => (RARITIES.indexOf(r.rarity) > RARITIES.indexOf(b) ? r.rarity : b), 'common');

export function PacksScreen() {
  const p = useStore((s) => s.profile);
  const buyPack = useStore((s) => s.buyPack);
  const toast = useStore((s) => s.toast);
  const updateSettings = useStore((s) => s.updateSettings);
  const [confirm, setConfirm] = useState<PackDef | null>(null);
  const [open, setOpen] = useState<Opening | null>(null);
  const level = levelFromXp(p.xp).level;
  const ev = currentEvent();
  const fast = p.settings.fastPacks;

  const purchase = (pack: PackDef) => {
    const r = buyPack(pack.id);
    setConfirm(null);
    if (!r.ok || !r.rewards || !r.grants) {
      sound.play('error');
      toast(r.reason ?? 'Purchase failed', 'bad');
      return;
    }
    sound.play('coin');
    setOpen({ pack, rewards: r.rewards, grants: r.grants, stage: fast ? 'summary' : 'pack', idx: 0 });
  };

  return (
    <div className="screen dim">
      <TopBar title="Club Packs" right={<div className="row" style={{ fontSize: 14 }}><span className="muted">Skip<span className="hide-portrait"> animations</span></span><Toggle on={fast} onChange={(v) => updateSettings({ fastPacks: v })} /></div>} />
      <div className="screen-body">
        <div className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
          Packs are bought only with coins earned by playing. Rarity odds shown are the exact per-club probabilities used by the game; within a rarity, clubs you don't own yet are 3× as likely as duplicates.
        </div>
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {PACKS.map((pk) => {
            const locked = level < pk.minLevel;
            return (
              <div key={pk.id} className={`card ${locked ? 'locked' : ''}`}>
                <div className="pack-art" style={{ background: `radial-gradient(circle at 50% 40%, ${pk.color[0]}55, transparent 70%), linear-gradient(160deg, ${pk.color[1]}, #0a1c1c)` }}>
                  <div className="pk" style={{ background: `linear-gradient(160deg, ${pk.color[0]}, ${pk.color[1]})` }}>{pk.event ? '🎉' : pk.id === 'elite' ? '💎' : pk.id === 'premium' ? '⭐' : '🎁'}</div>
                </div>
                <div className="row"><h3 className="grow">{pk.event ? `${ev.name} Pack` : pk.name}</h3><span className="tag">{pk.clubs} clubs</span></div>
                <div className="muted" style={{ fontSize: 13, margin: '4px 0' }}>{pk.desc}{pk.event ? ` ${pk.eventChance}% per slot for an event club (${ev.name}), ${pk.cosmeticChance}% chance of a bonus event cosmetic.` : ''}</div>
                <div className="odds">
                  {RARITIES.map((r) => (
                    <div key={r}><div className={`r-${r}`} style={{ fontFamily: 'var(--display)', fontSize: 13 }}>{pk.odds[r]}%</div><div className="muted">{RARITY_INFO[r].label}</div></div>
                  ))}
                </div>
                <button className="btn primary" style={{ width: '100%' }} disabled={locked || p.coins < pk.price} onClick={() => { sound.play('click'); setConfirm(pk); }}>
                  {locked ? `🔒 Level ${pk.minLevel}` : <>Buy · <Coins n={pk.price} size={16} /></>}
                </button>
                {!locked && p.coins < pk.price && <div className="muted center" style={{ fontSize: 12, marginTop: 4 }}>Need {pk.price - p.coins} more coins</div>}
              </div>
            );
          })}
        </div>
        <h3 style={{ marginTop: 16 }}>Recent packs</h3>
        {p.packHistory.length === 0 && <div className="muted" style={{ fontSize: 14 }}>No packs opened yet.</div>}
        {p.packHistory.slice(0, 8).map((h, i) => (
          <div key={i} className="row" style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="muted" style={{ width: 90 }}>{new Date(h.at).toLocaleDateString()}</span>
            <span style={{ width: 110 }}>{PACKS.find((x) => x.id === h.pack)?.name}</span>
            <span className="grow">{h.items.map((id) => { const c = safeClub(id); return c ? <span key={id + Math.random()} className={`r-${c.rarity}`}>{c.name} · </span> : <span key={id}>{cosmeticById(id)?.name} · </span>; })}</span>
          </div>
        ))}
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <h2>Buy {confirm.event ? `${ev.name} Pack` : confirm.name}?</h2>
          <p className="muted">Contains {confirm.clubs} clubs. Duplicates become upgrade material, or coins once a club is maxed.</p>
          <div className="odds">
            {RARITIES.map((r) => (<div key={r}><div className={`r-${r}`}>{confirm.odds[r]}%</div><div className="muted">{RARITY_INFO[r].label}</div></div>))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span>Balance after: <Coins n={p.coins - confirm.price} /></span>
            <div className="row">
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn primary" onClick={() => purchase(confirm)}>Buy for <Coins n={confirm.price} size={16} /></button>
            </div>
          </div>
        </Modal>
      )}
      {open && <PackOpening o={open} setO={setOpen} />}
    </div>
  );
}

function safeClub(id: string) {
  try {
    return clubById(id);
  } catch {
    return null;
  }
}

function PackOpening({ o, setO }: { o: Opening; setO: (o: Opening | null) => void }) {
  const p = useStore((s) => s.profile);
  const equip = useStore((s) => s.equipClub);
  const toast = useStore((s) => s.toast);
  const top = best(o.rewards);
  const r = o.rewards[o.idx];
  const grantFor = (i: number) => {
    // grants are only for clubs, in the same order
    const clubIdx = o.rewards.slice(0, i + 1).filter((x) => x.type === 'club').length - 1;
    return o.rewards[i].type === 'club' ? o.grants[clubIdx] : null;
  };

  useEffect(() => {
    if (o.stage === 'reveal' && r) {
      sound.play(`reveal_${r.rarity}` as any);
      if (r.rarity === 'legendary' || r.rarity === 'epic') sound.haptic(60);
    }
    if (o.stage === 'summary') sound.play('coin');
  }, [o.stage, o.idx]);

  const openPack = () => {
    sound.play('whoosh');
    setO({ ...o, stage: 'reveal', idx: 0 });
  };
  const next = () => {
    if (o.idx + 1 < o.rewards.length) setO({ ...o, idx: o.idx + 1 });
    else setO({ ...o, stage: 'summary' });
  };
  const color = RARITY_INFO[r?.rarity ?? top].color;

  if (o.stage === 'pack') {
    return (
      <div className="opening" onClick={openPack}>
        <div className="burst" style={{ background: `repeating-conic-gradient(from 0deg, ${RARITY_INFO[top === 'legendary' || top === 'epic' ? 'rare' : 'common'].color}22 0deg 10deg, transparent 10deg 20deg)` }} />
        <div className="big-pack" style={{ background: `linear-gradient(160deg, ${o.pack.color[0]}, ${o.pack.color[1]})` }}>🎁</div>
        <h2 style={{ marginTop: 24 }}>Tap to open!</h2>
        <button className="btn small" style={{ marginTop: 12 }} onClick={(e) => { e.stopPropagation(); setO({ ...o, stage: 'summary' }); }}>Skip</button>
      </div>
    );
  }
  if (o.stage === 'reveal' && r) {
    const g = grantFor(o.idx);
    return (
      <div className="opening" onClick={next}>
        <div className="burst" style={{ background: `repeating-conic-gradient(from 0deg, ${color}${r.rarity === 'legendary' ? '55' : '30'} 0deg 8deg, transparent 8deg 16deg)` }} />
        <div className="flash" style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }} key={o.idx} />
        <div className="muted" style={{ marginBottom: 10, zIndex: 1 }}>{o.idx + 1} / {o.rewards.length}</div>
        <div key={`c${o.idx}`} className={`reveal-card ${r.rarity}`} style={{ borderColor: color, boxShadow: `0 0 ${r.rarity === 'legendary' ? 80 : r.rarity === 'epic' ? 50 : 24}px ${color}` }} onClick={(e) => e.stopPropagation()}>
          {g?.isNew && <span className="new-flag">NEW!</span>}
          {r.type === 'club' && r.club ? (
            <ClubCard def={r.club} level={p.clubs[r.club.id]?.level ?? 1} />
          ) : (
            <div className="center">
              <div style={{ fontSize: 60 }}>🎽</div>
              <h3>{r.cosmetic?.name}</h3>
              <div className={`r-${r.rarity}`}>{RARITY_INFO[r.rarity].label} event cosmetic</div>
            </div>
          )}
          {g && !g.isNew && <div className="tag" style={{ marginTop: 8 }}>{g.shardAdded ? 'Duplicate → +1 upgrade material' : `Duplicate (maxed) → +${g.coins} coins`}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small" onClick={() => setO({ ...o, stage: 'summary' })}>Skip all</button>
            <div className="grow" />
            <button className="btn primary small" onClick={next}>{o.idx + 1 < o.rewards.length ? 'Next →' : 'Done'}</button>
          </div>
        </div>
      </div>
    );
  }
  // summary
  return (
    <div className="opening">
      <h2>Pack contents</h2>
      <div className="col" style={{ width: 'min(620px, 100%)', marginTop: 12, gap: 8, overflowY: 'auto', maxHeight: '70vh', touchAction: 'pan-y' }}>
        {o.rewards.map((rw, i) => {
          const g = grantFor(i);
          const c = rw.club;
          const slot = c ? BAG_SLOTS.find((s) => SLOT_CATEGORY[s] === c.category && !p.bag[s]) ?? BAG_SLOTS.find((s) => SLOT_CATEGORY[s] === c.category) : null;
          const inBag = c ? BAG_SLOTS.some((s) => p.bag[s] === c.id) : false;
          return (
            <div key={i} className="row panel" style={{ padding: 10, borderColor: RARITY_INFO[rw.rarity].color, animation: `pop ${0.2 + i * 0.1}s` }}>
              <div className="club-icon" style={{ background: c?.color ?? '#555', boxShadow: `0 0 0 2px ${RARITY_INFO[rw.rarity].color}` }}>{c ? '🏌️' : '🎽'}</div>
              <div className="grow">
                <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>{c?.name ?? rw.cosmetic?.name} {g?.isNew && <span className="tag" style={{ background: 'var(--red)' }}>NEW</span>}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  <span className={`r-${rw.rarity}`}>{RARITY_INFO[rw.rarity].label}</span>
                  {c && ` · ✦ ${c.ability.name}`}
                  {g && !g.isNew && (g.shardAdded ? ' · duplicate → upgrade material' : ` · duplicate → +${g.coins} coins`)}
                  {rw.cosmetic && ' · added to your wardrobe'}
                </div>
              </div>
              {c && slot && !inBag && p.clubs[c.id] && (
                <button className="btn small green" onClick={() => { if (equip(slot, c.id)) { toast(`${c.name} equipped`, 'good'); sound.play('click'); } }}>Equip</button>
              )}
              {inBag && <span className="tag">In bag</span>}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => setO(null)}>Keep & Close</button>
      </div>
    </div>
  );
}
