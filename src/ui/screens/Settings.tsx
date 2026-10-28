import { useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { host } from '../../game2d/host';
import { loadProfileFromJSON, newProfile } from '../../state/profile';
import { exportSave, resetSave } from '../../state/storage';
import { useStore } from '../../state/store';
import { Modal, Seg, Toggle, TopBar } from '../components/common';

export function SettingsScreen() {
  const p = useStore((s) => s.profile);
  const upd = useStore((s) => s.updateSettings);
  const replace = useStore((s) => s.replaceProfile);
  const mutate = useStore((s) => s.mutate);
  const toast = useStore((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const st = p.settings;

  const onImport = async (f: File) => {
    try {
      const txt = await f.text();
      const prof = loadProfileFromJSON(txt);
      replace(prof);
      toast('Save imported successfully', 'good');
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : 'invalid file'}`, 'bad');
    }
  };

  return (
    <div className="screen dim">
      <TopBar title="Settings" />
      <div className="screen-body" style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <div className="setting"><span>Golfer name</span>
          <input defaultValue={p.name} maxLength={16} onBlur={(e) => mutate((pr) => { pr.name = e.target.value.trim() || 'You'; })}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', color: 'inherit', font: 'inherit', width: 160 }} />
        </div>
        <div className="setting"><span>Sound effects</span><Toggle on={st.sfx} onChange={(v) => upd({ sfx: v })} /></div>
        <div className="setting"><span>Music</span><Toggle on={st.music} onChange={(v) => upd({ music: v })} /></div>
        <div className="setting"><span>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => upd({ volume: Number(e.target.value) })} onPointerUp={() => sound.play('coin')} style={{ width: 180 }} />
        </div>
        <div className="setting"><span>Pixel size<div className="muted" style={{ fontSize: 12 }}>How chunky the pixel-art course looks. Bigger pixels also run faster.</div></span>
          <Seg value={st.retro} options={[['chunky', 'Chunky'], ['classic', 'Classic'], ['fine', 'Fine']]} onChange={(v) => upd({ retro: v })} />
        </div>
        <div className="setting"><span>Graphics quality<div className="muted" style={{ fontSize: 12 }}>Low turns off water shimmer and thins particles for older phones. Current: {Math.round(host.fps)} fps</div></span>
          <Seg value={st.quality} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} onChange={(v) => upd({ quality: v })} />
        </div>
        <div className="setting"><span>Opponent shot speed</span>
          <Seg value={st.botSpeed} options={[['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Fastest']]} onChange={(v) => upd({ botSpeed: v })} />
        </div>
        <div className="setting"><span>Haptic feedback<div className="muted" style={{ fontSize: 12 }}>Taps on swing, perfect strikes and holed putts (iPhone: iOS 18+)</div></span><Toggle on={st.haptics} onChange={(v) => upd({ haptics: v })} /></div>
        <div className="setting"><span>Green slope arrows</span><Toggle on={st.showSlopeGrid} onChange={(v) => upd({ showSlopeGrid: v })} /></div>
        <div className="setting"><span>Skip pack animations</span><Toggle on={st.fastPacks} onChange={(v) => upd({ fastPacks: v })} /></div>
        <h3 style={{ margin: '16px 0 8px' }}>Save data</h3>
        <div className="panel" style={{ padding: 12, fontSize: 14 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Progress is saved automatically in this browser's local storage. It is lost if you clear site data, use private browsing, or switch device/browser.
            Export a backup file to keep it safe or move it to another device.
          </p>
          <div className="row wrap">
            <button className="btn blue" onClick={() => exportSave(p)}>⬇ Export save</button>
            <button className="btn" onClick={() => file.current?.click()}>⬆ Import save</button>
            <input ref={file} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            <div className="grow" />
            <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset progress</button>
          </div>
        </div>
        <h3 style={{ margin: '16px 0 8px' }}>How to play</h3>
        <div className="panel" style={{ padding: 12, fontSize: 14, lineHeight: 1.5 }}>
          <b>Aim:</b> drag across the course (or use ◀ ▶) to turn. Tap the mini-map to aim at a spot.<br />
          <b>Swing:</b> press the ball button and pull down: the further you pull, the more power (past the white line is overpower: longer but riskier).<br />
          <b>Timing:</b> while pulling, a needle swings across the arc. Release when it is in the green zone for a PERFECT strike. Releasing late or early hooks or slices the ball.<br />
          <b>Shaping (Lv 3+):</b> pull diagonally to draw or fade the ball. <b>Trajectory (Lv 4+):</b> choose low or high flight.<br />
          <b>Putting:</b> read the slope arrows; power shows the distance the ball would roll on a flat green.
        </div>
        <div className="muted center" style={{ fontSize: 12, marginTop: 14 }}>Fairway Legends v1.0 · save format v{p.version}</div>
      </div>
      {confirmReset && (
        <Modal onClose={() => setConfirmReset(false)}>
          <h2>Reset all progress?</h2>
          <p className="muted">This deletes your coins, clubs, cosmetics and achievements in this browser. This cannot be undone (unless you exported a backup).</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button className="btn danger" onClick={() => { resetSave(); replace(newProfile()); setConfirmReset(false); toast('Progress reset', 'info'); }}>Reset</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
