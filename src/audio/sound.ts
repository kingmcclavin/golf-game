/**
 * All sound is synthesised with the Web Audio API, so the game ships with no audio assets.
 */
type Sfx =
  | 'hit' | 'putt' | 'perfect' | 'cup' | 'splash' | 'sand' | 'tree' | 'bounce' | 'click' | 'coin' | 'whoosh'
  | 'reveal_common' | 'reveal_uncommon' | 'reveal_rare' | 'reveal_epic' | 'reveal_legendary' | 'levelup' | 'cheer' | 'groan' | 'error' | 'ability';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  sfxOn = true;
  musicOn = true;
  volume = 0.7;
  private musicTimer: number | null = null;
  private noiseBuf: AudioBuffer | null = null;

  unlock() {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx!.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx!.destination);
      this.musicGain = this.ctx!.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      const len = this.ctx!.sampleRate;
      this.noiseBuf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    if (this.musicOn && this.musicTimer === null) this.startMusic();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on) this.stopMusic();
    else if (this.ctx) this.startMusic();
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slide?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, q: number, vol: number, delay = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, vol, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name: Sfx, intensity = 1) {
    if (!this.sfxOn || !this.ctx) return;
    switch (name) {
      case 'hit':
        this.noise(0.09, 2400, 1.2, 0.6 * intensity);
        this.tone(180, 0.12, 'triangle', 0.35 * intensity, 0, 90);
        this.noise(0.4, 900, 0.5, 0.08 * intensity, 0.05);
        break;
      case 'putt':
        this.tone(900, 0.06, 'sine', 0.2);
        this.noise(0.04, 3000, 2, 0.15);
        break;
      case 'perfect':
        [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.16, i * 0.06));
        break;
      case 'ability':
        [660, 990, 1320, 1980].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, i * 0.05));
        break;
      case 'cup':
        for (let i = 0; i < 4; i++) this.tone(1200 - i * 150, 0.05, 'square', 0.06, i * 0.07);
        this.tone(300, 0.2, 'sine', 0.2, 0.3);
        break;
      case 'splash':
        this.noise(0.6, 700, 0.6, 0.5);
        this.noise(0.3, 2500, 1, 0.2, 0.05);
        break;
      case 'sand':
        this.noise(0.25, 1800, 0.4, 0.3);
        break;
      case 'tree':
        this.noise(0.35, 1400, 0.3, 0.3);
        this.tone(220, 0.08, 'square', 0.12);
        break;
      case 'bounce':
        this.tone(140, 0.07, 'sine', 0.2 * intensity);
        break;
      case 'click':
        this.tone(1400, 0.04, 'square', 0.05);
        break;
      case 'coin':
        this.tone(1320, 0.08, 'square', 0.08);
        this.tone(1760, 0.18, 'square', 0.08, 0.07);
        break;
      case 'whoosh':
        this.noise(0.5, 600, 0.8, 0.25);
        break;
      case 'reveal_common':
        this.tone(523, 0.2, 'triangle', 0.18);
        break;
      case 'reveal_uncommon':
        [523, 659].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.18, i * 0.08));
        break;
      case 'reveal_rare':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.2, i * 0.08));
        break;
      case 'reveal_epic':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.12, i * 0.09));
        this.noise(0.8, 4000, 0.5, 0.1, 0.3);
        break;
      case 'reveal_legendary':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.12, i * 0.1));
        this.noise(1.4, 3000, 0.4, 0.15, 0.5);
        this.tone(130, 1.2, 'sine', 0.3, 0.55);
        break;
      case 'levelup':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.1));
        break;
      case 'cheer':
        this.noise(1.6, 1200, 0.3, 0.25);
        this.noise(1.2, 2600, 0.6, 0.12, 0.2);
        break;
      case 'groan':
        this.tone(220, 0.6, 'sawtooth', 0.06, 0, 140);
        break;
      case 'error':
        this.tone(200, 0.15, 'square', 0.1);
        break;
    }
  }

  private startMusic() {
    if (!this.ctx || !this.musicGain) return;
    this.stopMusic();
    const chords = [
      [261.6, 329.6, 392.0, 493.9],
      [220.0, 261.6, 329.6, 392.0],
      [174.6, 220.0, 261.6, 329.6],
      [196.0, 246.9, 293.7, 349.2],
    ];
    let i = 0;
    const play = () => {
      if (!this.ctx || !this.musicGain || !this.musicOn) return;
      const t = this.ctx.currentTime;
      const chord = chords[i % chords.length];
      chord.forEach((f, k) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sine';
        o.frequency.value = f / (k === 0 ? 2 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 4.2);
        o.connect(g).connect(this.musicGain!);
        o.start(t);
        o.stop(t + 4.3);
      });
      // gentle arpeggio
      for (let n = 0; n < 4; n++) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = chord[(n * 3 + i) % 4] * 2;
        const tt = t + 0.5 + n * 0.9;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.05, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.8);
        o.connect(g).connect(this.musicGain);
        o.start(tt);
        o.stop(tt + 0.9);
      }
      i++;
    };
    play();
    this.musicTimer = window.setInterval(play, 4000);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  hapticsOn = true;
  private hapticLabel: HTMLLabelElement | null = null;

  /**
   * Short haptic tap. Android uses the Vibration API; iPhone Safari has none, but toggling a native
   * `<input type="checkbox" switch>` (iOS 18+) produces the system haptic tick, so we use that.
   */
  haptic(ms = 15) {
    if (!this.hapticsOn) return;
    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
        return;
      }
      if (!this.hapticLabel) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        label.appendChild(input);
        label.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none';
        label.setAttribute('aria-hidden', 'true');
        document.body.appendChild(label);
        this.hapticLabel = label;
      }
      this.hapticLabel.click();
      if (ms >= 40) setTimeout(() => this.hapticLabel?.click(), 90);
    } catch {
      /* not supported */
    }
  }
}

export const sound = new SoundEngine();
