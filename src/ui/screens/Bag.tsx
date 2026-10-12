import { useEffect, useMemo, useState } from 'react';
import { sound } from '../../audio/sound';
import { BAG_SLOTS, CATEGORY_LABEL, CLUBS, clubById, clubPerformance, MAX_CLUB_LEVEL, RARITIES, RARITY_INFO, SLOT_CATEGORY, SLOT_LABEL, effectiveStats, shardsForLevel, type BagSlot, type ClubCategory, type ClubDef, type Rarity } from '../../data/clubs';
import { canUpgrade } from '../../state/profile';
import { useStore } from '../../state/store';
import { ClubCard, ClubIcon, Coins, Modal, RarityTag, TopBar } from '../components/common';
import { yd } from '../../core/units';

type SortKey = 'rarity' | 'power' | 'accuracy' | 'control' | 'spin' | 'forgiveness' | 'ability' | 'recent' | 'distance';

export function BagScreen() {
  const p = useStore((s) => s.profile);
  const mutate = useStore((s) => s.mutate);
  const equip = useStore((s) => s.equipClub);
  const upgrade = useStore((s) => s.upgradeClub);
  const toast = useStore((s) => s.toast);
  const [slot, setSlot] = useState<BagSlot>('driver');
  const [cat, setCat] = useState<ClubCategory | 'all' | 'new'>('driver');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [inspect, setInspect] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);
  const [newIds] = useState(() => Object.entries(p.clubs).filter(([, c]) => !c.seen).map(([id]) => id));
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // mark clubs as seen once the bag has been opened
    if (newIds.length) mutate((pr) => { for (const id of newIds) if (pr.clubs[id]) pr.clubs[id].seen = true; });
    if (newIds.length) setCat('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owned = Object.keys(p.clubs).map(clubById);
  const list = useMemo(() => {
    let l: ClubDef[] = showAll ? CLUBS : owned;
    if (cat === 'new') l = l.filter((c) => newIds.includes(c.id));
    else if (cat !== 'all') l = l.filter((c) => c.category === cat);
    if (rarity !== 'all') l = l.filter((c) => c.rarity === rarity);
    const lv = (c: ClubDef) => p.clubs[c.id]?.level ?? 1;
    const val = (c: ClubDef): number => {
      if (sort === 'rarity') return RARITIES.indexOf(c.rarity) * 1000 + effectiveStats(c, lv(c)).power;
      if (sort === 'recent') return p.clubs[c.id]?.obtainedAt ?? 0;
      if (sort === 'distance') return clubPerformance(c, lv(c)).maxCarry;
      return effectiveStats(c, lv(c))[sort];
    };
    return [...l].sort((a, b) => val(b) - val(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, rarity, sort, p.clubs, showAll]);

  const equippedIn = (id: string) => BAG_SLOTS.find((s) => p.bag[s] === id);
  const pickSlot = (s: BagSlot) => {
    sound.play('click');
    setSlot(s);
    setCat(SLOT_CATEGORY[s]);
  };
  const doEquip = (id: string) => {
    const def = clubById(id);
    let target = slot;
    if (SLOT_CATEGORY[target] !== def.category) target = BAG_SLOTS.find((s) => SLOT_CATEGORY[s] === def.category && !p.bag[s]) ?? BAG_SLOTS.find((s) => SLOT_CATEGORY[s] === def.category)!;
    if (equip(target, id)) {
      sound.play('coin');
      toast(`${def.name} equipped (${SLOT_LABEL[target]})`, 'good');
      setSlot(target);
    }
  };

  const insp = inspect ? clubById(inspect) : null;
  const inspOwned = inspect ? p.clubs[inspect] : null;
  const slotForInsp = insp ? (SLOT_CATEGORY[slot] === insp.category ? slot : BAG_SLOTS.find((s) => SLOT_CATEGORY[s] === insp.category)!) : null;
  const cmpId = compareTo ?? (slotForInsp ? p.bag[slotForInsp] : null);
  const cmp = cmpId && cmpId !== inspect ? clubById(cmpId) : null;
  const up = inspect && inspOwned ? canUpgrade(p, inspect) : null;

  return (
    <div className="screen dim">
      <TopBar title="Golf Bag" />
      <div className="bag-layout">
        <div className="panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="muted hide-portrait" style={{ fontSize: 13, marginBottom: 6 }}>Tap a slot, then pick a club. Max 9 clubs; a putter is required.</div>
          <div className="bag-slots">
            {BAG_SLOTS.map((s) => {
              const id = p.bag[s];
              const def = id ? clubById(id) : null;
              return (
                <button key={s} className={`slot ${slot === s ? 'sel' : ''}`} onClick={() => pickSlot(s)}>
                  {def ? <ClubIcon def={def} size={40} /> : <div className="club-icon" style={{ width: 40, height: 40, border: '2px dashed rgba(255,255,255,0.25)' }}>+</div>}
                  <div className="grow">
                    <div className="lbl">{SLOT_LABEL[s]}</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 15, lineHeight: 1.1 }}>{def ? def.name : 'Empty'}</div>
                    {def && <div className="muted" style={{ fontSize: 12 }}>✦ {def.ability.name}{p.clubs[def.id].level > 1 ? ` · Lv ${p.clubs[def.id].level}` : ''}</div>}
                  </div>
                  {def && s !== 'putter' && (
                    <span className="btn small ghost" role="button" onClick={(e) => { e.stopPropagation(); equip(s, null); }}>✕</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="col" style={{ minHeight: 0 }}>
          <div className="tabs">
            {newIds.length > 0 && <button className={`tab ${cat === 'new' ? 'on' : ''}`} onClick={() => setCat('new')}>✨ New ({newIds.length})</button>}
            <button className={`tab ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
            {(Object.keys(CATEGORY_LABEL) as ClubCategory[]).map((c) => (
              <button key={c} className={`tab ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}s</button>
            ))}
          </div>
          <div className="tabs">
            <button className={`tab ${rarity === 'all' ? 'on' : ''}`} onClick={() => setRarity('all')}>Any rarity</button>
            {RARITIES.map((r) => (
              <button key={r} className={`tab ${rarity === r ? 'on' : ''}`} onClick={() => setRarity(r)}><span className={rarity === r ? '' : `r-${r}`}>{RARITY_INFO[r].label}</span></button>
            ))}
            <span style={{ width: 10 }} />
            <select className="tab" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ color: 'inherit', background: 'rgba(255,255,255,0.06)' }}>
              {(['rarity', 'distance', 'power', 'accuracy', 'control', 'spin', 'forgiveness', 'ability', 'recent'] as SortKey[]).map((k) => (
                <option key={k} value={k} style={{ color: '#000' }}>Sort: {k}</option>
              ))}
            </select>
            <button className={`tab ${showAll ? 'on' : ''}`} onClick={() => setShowAll(!showAll)}>📖 Catalog</button>
          </div>
          <div className="screen-body">
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{owned.length} / {CLUBS.length} clubs collected</div>
            <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {list.map((c) => {
                const own = p.clubs[c.id];
                const eq = equippedIn(c.id);
                return (
                  <button key={c.id} className="card" style={{ borderColor: `${RARITY_INFO[c.rarity].color}55`, opacity: own ? 1 : 0.45 }} onClick={() => { sound.play('click'); setCompareTo(null); setInspect(c.id); }}>
                    <div className="row">
                      <ClubIcon def={c} />
                      <div className="grow">
                        <div style={{ fontFamily: 'var(--display)', fontSize: 16, lineHeight: 1.1 }}>{c.name}</div>
                        <div className="row" style={{ gap: 4, marginTop: 3 }}><RarityTag r={c.rarity} />{own && own.level > 1 && <span className="tag">Lv {own.level}</span>}</div>
                      </div>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>✦ {c.ability.name} · {c.category === 'putter' ? `${Math.round(clubPerformance(c, own?.level ?? 1).maxCarry * 3.28)} ft` : `${Math.round(yd(clubPerformance(c, own?.level ?? 1).maxCarry))} yd`}</div>
                    {eq && <div className="tag" style={{ marginTop: 6, background: 'rgba(76,209,122,0.2)', color: '#8af0b0' }}>In bag · {SLOT_LABEL[eq]}</div>}
                    {!own && <div className="tag" style={{ marginTop: 6 }}>Not owned</div>}
                    {own && own.shards > 0 && own.level < MAX_CLUB_LEVEL && <div className="tag" style={{ marginTop: 6, marginLeft: 4 }}>⬆ {own.shards}/{shardsForLevel(own.level)}</div>}
                  </button>
                );
              })}
            </div>
            {list.length === 0 && <div className="muted center" style={{ padding: 30 }}>No clubs here yet. Open packs to find more!</div>}
          </div>
        </div>
      </div>
      {insp && (
        <Modal onClose={() => setInspect(null)} wide>
          <div className="row wrap" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="grow" style={{ minWidth: 260 }}>
              <ClubCard def={insp} level={inspOwned?.level ?? 1} shards={inspOwned?.shards} compare={cmp ? { def: cmp, level: p.clubs[cmp.id]?.level ?? 1 } : undefined} />
            </div>
            {cmp && (
              <div className="grow" style={{ minWidth: 260 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Comparing with {equippedIn(cmp.id) ? 'equipped' : ''}:</div>
                <ClubCard def={cmp} level={p.clubs[cmp.id]?.level ?? 1} />
              </div>
            )}
          </div>
          {inspOwned && (
            <div className="row wrap" style={{ marginTop: 12 }}>
              {equippedIn(insp.id) ? (
                <span className="tag" style={{ fontSize: 14 }}>✓ Equipped ({SLOT_LABEL[equippedIn(insp.id)!]})</span>
              ) : (
                <button className="btn green" onClick={() => { doEquip(insp.id); setInspect(null); }}>Equip in {SLOT_LABEL[slotForInsp!]} slot</button>
              )}
              <select className="btn small" value={compareTo ?? ''} onChange={(e) => setCompareTo(e.target.value || null)} style={{ background: 'rgba(255,255,255,0.06)' }}>
                <option value="" style={{ color: '#000' }}>Compare with equipped</option>
                {owned.filter((c) => c.category === insp.category && c.id !== insp.id).map((c) => <option key={c.id} value={c.id} style={{ color: '#000' }}>Compare: {c.name}</option>)}
              </select>
              <div className="grow" />
              {up && inspOwned.level < MAX_CLUB_LEVEL && (
                <button className="btn primary" disabled={!up.ok} onClick={() => { if (upgrade(insp.id)) { sound.play('levelup'); toast(`${insp.name} upgraded to level ${inspOwned.level + 1}!`, 'epic', '⬆️'); } }}>
                  ⬆ Upgrade to Lv {inspOwned.level + 1} · <Coins n={up.cost} size={15} />
                </button>
              )}
              {up && !up.ok && up.reason && <span className="muted" style={{ fontSize: 13 }}>{up.reason} ({inspOwned.shards}/{up.shards || '—'} duplicates)</span>}
            </div>
          )}
          {!inspOwned && <div className="muted" style={{ marginTop: 10 }}>Find this club in {insp.event ? 'Event Packs' : 'club packs'}.</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Upgrades use duplicate copies from packs (+2 to every stat per level, max level {MAX_CLUB_LEVEL}). Extra duplicates at max level convert to {RARITY_INFO[insp.rarity].dupeCoins} coins.</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn" onClick={() => setInspect(null)}>Close</button></div>
        </Modal>
      )}
    </div>
  );
}
