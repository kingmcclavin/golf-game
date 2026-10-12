import { useEffect } from 'react';
import { sound } from './audio/sound';
import { host } from './game/renderer';
import { useStore } from './state/store';
import { Toasts } from './ui/components/common';
import { MenuBackdrop } from './ui/components/MenuBackdrop';
import { MainMenu } from './ui/screens/MainMenu';
import { PlaySetup } from './ui/screens/PlaySetup';
import { CoursesScreen } from './ui/screens/Courses';
import { BagScreen } from './ui/screens/Bag';
import { PacksScreen } from './ui/screens/Packs';
import { CharacterScreen } from './ui/screens/Character';
import { ChallengesScreen } from './ui/screens/Challenges';
import { ProgressScreen } from './ui/screens/Progress';
import { SettingsScreen } from './ui/screens/Settings';
import { GameScreen } from './ui/screens/Game';

export default function App() {
  const screen = useStore((s) => s.screen);
  const settings = useStore((s) => s.profile.settings);
  const matchKey = useStore((s) => s.matchKey);

  useEffect(() => {
    sound.sfxOn = settings.sfx;
    sound.hapticsOn = settings.haptics;
    sound.setVolume(settings.volume);
    sound.setMusic(settings.music);
    if (host.quality !== settings.quality) host.applyQuality(settings.quality);
  }, [settings]);

  useEffect(() => {
    // iOS Safari only unlocks Web Audio from touchend/click, not touchstart/pointerdown
    const unlock = () => sound.unlock();
    const evs = ['pointerdown', 'touchend', 'click'];
    evs.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  const backdrop = screen !== 'match' && screen !== 'character' && screen !== 'shop';
  // the menu backdrop is mostly hidden behind full panels on sub-screens: render it less often
  host.throttle = backdrop && screen !== 'menu' ? 3 : 1;
  return (
    <div className={`app ${screen === 'match' ? 'in-game' : ''}`}>
      {backdrop && <MenuBackdrop />}
      <div className="ui-layer">
        {screen === 'menu' && <MainMenu />}
        {screen === 'play' && <PlaySetup />}
        {screen === 'courses' && <CoursesScreen />}
        {screen === 'bag' && <BagScreen />}
        {screen === 'packs' && <PacksScreen />}
        {(screen === 'character' || screen === 'shop') && <CharacterScreen shop={screen === 'shop'} />}
        {screen === 'challenges' && <ChallengesScreen />}
        {screen === 'progress' && <ProgressScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'match' && <GameScreen key={matchKey} />}
      </div>
      <Toasts />
    </div>
  );
}
