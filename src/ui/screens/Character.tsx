import { useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { RARITY_INFO } from '../../data/clubs';
import { BODY_STYLES, COSMETIC_SLOTS, COSMETICS, FACES, HAIR_COLORS, HAIR_STYLES, OPTIONAL_SLOTS, SKIN_TONES, SLOT_NAMES, type CosmeticItem, type CosmeticSlot, type Outfit } from '../../data/cosmetics';
import { host } from '../../game2d/host';
import { PreviewView } from '../../game2d/previewView';
import { useStore } from '../../state/store';
import { GameCanvas, Coins, Modal, RarityTag, TopBar } from '../components/common';

type Tab = 'look' | CosmeticSlot;
const ICON: Record<CosmeticSlot, string> = { hat: '🧢', shirt: '👕', pants: '👖', shoes: '👟', gloves: '🧤', glasses: '🕶️', accessory: '⌚', bag: '🎒' };

export function CharacterScreen({ shop }: { shop: boolean }) {
  const p = useStore((s) => s.profile);
  const equip = useStore((s) => s.equipCosmetic);
  const setAppearance = useStore((s) => s.setAppearance);
  const buy = useStore((s) => s.buyCosmetic);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<Tab>(shop ? 'hat' : 'look');
  const [filter, setFilter] = useState<'all' | 'owned' | 'sale'>(shop ? 'sale' : 'all');
  const [tryOn, setTryOn] = useState<CosmeticItem | null>(null);
  const [confirm, setConfirm] = useState<CosmeticItem | null>(null);
  const viewRef = useRef<PreviewView | null>(null);
  const drag = useRef<number | null>(null);

  const shown: Outfit = useMemo(() => (tryOn ? { ...p.outfit, [tryOn.slot]: tryOn.id } : p.outfit), [p.outfit, tryOn]);

  useEffect(() => {
    if (!host.init()) return;
    const v = new PreviewView(shown);
    viewRef.current = v;
    host.setView(v);
    return () => {
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    viewRef.current?.setOutfit(shown);
  }, [shown]);

  const items = COSMETICS.filter((c) => tab !== 'look' && c.slot === tab).filter((c) => {
    const owned = p.cosmetics.includes(c.id);
    if (filter === 'owned') return owned;
    if (filter === 'sale') return !owned;
    return true;
  });

  const clickItem = (c: CosmeticItem) => {
    sound.play('click');
    const owned = p.cosmetics.includes(c.id);
    if (owned) {
      setTryOn(null);
      const on = p.outfit[c.slot] === c.id;
      if (on && OPTIONAL_SLOTS.includes(c.slot)) equip(c.slot, null);
      else equip(c.slot, c.id);
    } else setTryOn(c);
  };

  const doBuy = (c: CosmeticItem) => {
    const r = buy(c.id);
    setConfirm(null);
    if (r.ok) {
      equip(c.slot, c.id);
      setTryOn(null);
      sound.play('coin');
      toast(`${c.name} purchased and equipped!`, 'good', '🛍️');
    } else {
      sound.play('error');
      toast(r.reason ?? 'Could not buy', 'bad');
    }
  };

  return (
    <div className="screen" style={{ background: 'linear-gradient(180deg, #0d2f2c, #071a19)' }}>
      <TopBar title={shop ? 'Cosmetics Shop' : 'Character'} />
      <div className="char-layout">
        <GameCanvas
          className="char-stage panel"
          onPointerDown={(e) => { drag.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current !== null) { viewRef.current?.rotate(e.clientX - drag.current); drag.current = e.clientX; } }}
          onPointerUp={() => { drag.current = null; }}
        >
          {host.failed && <div className="center muted" style={{ padding: 40 }}>Preview unavailable on this device.</div>}
          <div style={{ position: 'absolute', left: 10, bottom: 10, pointerEvents: 'none' }} className="muted">↔ Drag to rotate</div>
          {tryOn && (
            <div className="panel" style={{ position: 'absolute', left: 10, top: 10, right: 10, padding: 10 }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="row">
                <div className="grow">
                  <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Trying on: {tryOn.name}</div>
                  <div className="row" style={{ gap: 6 }}><RarityTag r={tryOn.rarity} />{tryOn.collection && <span className="tag">{tryOn.collection}</span>}</div>
                </div>
                <button className="btn small" onClick={() => setTryOn(null)}>Cancel</button>
                {tryOn.event ? <span className="tag">Event pack only</span> : <button className="btn primary small" onClick={() => setConfirm(tryOn)}>Buy <Coins n={tryOn.price} size={14} /></button>}
              </div>
            </div>
          )}
        </GameCanvas>
        <div className="panel char-panel">
          <div className="tabs">
            {!shop && <button className={`tab ${tab === 'look' ? 'on' : ''}`} onClick={() => setTab('look')}>🙂 Look</button>}
            {COSMETIC_SLOTS.map((s) => (
              <button key={s} className={`tab ${tab === s ? 'on' : ''}`} onClick={() => { setTab(s); setTryOn(null); }}>{ICON[s]} {SLOT_NAMES[s]}</button>
            ))}
          </div>
          {tab === 'look' ? (
            <div className="col" style={{ overflowY: 'auto', minHeight: 0, touchAction: 'pan-y' }}>
              <div className="muted" style={{ fontSize: 13 }}>Body, face and hair are free to change at any time.</div>
              <h3>Body</h3>
              <div className="seg">{BODY_STYLES.map((b) => <button key={b} className={p.outfit.body === b ? 'on' : ''} onClick={() => setAppearance({ body: b })}>{b}</button>)}</div>
              <h3>Skin tone</h3>
              <div className="row wrap">{SKIN_TONES.map((c, i) => <button key={c} className={`chip ${p.outfit.skin === i ? 'on' : ''}`} style={{ background: c }} onClick={() => setAppearance({ skin: i })} aria-label={`Skin ${i + 1}`} />)}</div>
              <h3>Face</h3>
              <div className="seg">{FACES.map((f, i) => <button key={f} className={p.outfit.face === i ? 'on' : ''} onClick={() => setAppearance({ face: i })}>{f}</button>)}</div>
              <h3>Hairstyle</h3>
              <div className="row wrap" style={{ gap: 6 }}>{HAIR_STYLES.map((h) => <button key={h} className={`tab ${p.outfit.hairStyle === h ? 'on' : ''}`} onClick={() => setAppearance({ hairStyle: h })}>{h}</button>)}</div>
              <h3>Hair colour</h3>
              <div className="row wrap">{HAIR_COLORS.map((c) => <button key={c} className={`chip ${p.outfit.hairColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAppearance({ hairColor: c })} aria-label={`Hair ${c}`} />)}</div>
            </div>
          ) : (
            <>
              <div className="seg" style={{ alignSelf: 'flex-start' }}>
                {(['all', 'owned', 'sale'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'owned' ? 'Owned' : 'For sale'}</button>)}
              </div>
              <div className="items">
                {OPTIONAL_SLOTS.includes(tab) && filter !== 'sale' && (
                  <button className={`item ${!p.outfit[tab] ? 'on' : ''}`} onClick={() => { equip(tab, null); setTryOn(null); }}>
                    <div className="swatch">✕</div>None
                  </button>
                )}
                {items.map((c) => {
                  const owned = p.cosmetics.includes(c.id);
                  const on = p.outfit[c.slot] === c.id;
                  return (
                    <button key={c.id} className={`item ${on || tryOn?.id === c.id ? 'on' : ''}`} onClick={() => clickItem(c)} style={{ borderColor: tryOn?.id === c.id ? '#7ad8ff' : undefined }}>
                      <div className="swatch" style={{ background: `linear-gradient(135deg, ${c.color} 55%, ${c.color2 ?? c.color} 55%)`, boxShadow: `0 0 0 2px ${RARITY_INFO[c.rarity].color}` }}>{ICON[c.slot]}</div>
                      <div style={{ lineHeight: 1.1 }}>{c.name}</div>
                      {owned ? <span className="muted">{on ? '✓ Equipped' : 'Owned'}</span> : c.event ? <span className="r-legendary" style={{ fontSize: 11 }}>Event</span> : <Coins n={c.price} size={13} />}
                    </button>
                  );
                })}
              </div>
              {items.length === 0 && <div className="muted center" style={{ padding: 20 }}>{filter === 'sale' ? 'You own everything here!' : 'Nothing here yet.'}</div>}
            </>
          )}
        </div>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <h2>Buy {confirm.name}?</h2>
          <p className="muted">Cosmetics are permanent and purely visual: they never affect gameplay.</p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Balance after: <Coins n={p.coins - confirm.price} /></span>
            <div className="row">
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn primary" disabled={p.coins < confirm.price} onClick={() => doBuy(confirm)}>Buy <Coins n={confirm.price} size={15} /></button>
            </div>
          </div>
          {p.coins < confirm.price && <div className="muted" style={{ marginTop: 8, color: 'var(--red)' }}>Not enough coins: play a round to earn more.</div>}
        </Modal>
      )}
    </div>
  );
}
