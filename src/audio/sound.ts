/**
 * 8-bit sound: every effect and the music are synthesised live with the Web Audio API using
 * NES-style voices (two pulse waves, a triangle bass and a noise channel). No audio files.
 */
type Sfx =
  | 'hit' | 'putt' | 'perfect' | 'cup' | 'splash' | 'sand' | 'tree' | 'bounce' | 'click' | 'coin' | 'whoosh'
  | 'reveal_common' | 'reveal_uncommon' | 'reveal_rare' | 'reveal_epic' | 'reveal_legendary' | 'levelup' | 'cheer' | 'groan' | 'error' | 'ability';

const NOTE = (n: string): number => {
  // e.g. 'C4', 'F#5'
  const m = /^([A-G])(#?)(\d)$/.exec(n);
  if (!m) return 0;
  const idx = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, idx / 12);
};

// 4-bar loop (16 steps per bar). Melody uses '-' for rests.
const LEAD = [
  'E5', '-', 'G5', '-', 'A5', '-', 'G5', 'E5', 'D5', '-', 'E5', '-', 'C5', '-', '-', '-',
  'D5', '-', 'E5', '-', 'G5', '-', 'E5', 'D5', 'C5', '-', 'A4', '-', 'G4', '-', '-', '-',
  'E5', '-', 'G5', '-', 'A5', '-', 'C6', '-', 'B5', 'A5', 'G5', '-', 'E5', '-', 'G5', '-',
  'A5', '-', 'G5', 'E5', 'D5', '-', 'E5', '-', 'C5', '-', '-', '-', '-', '-', '-', '-',
];
const BASS = ['C3', 'C3', 'G2', 'G2', 'A2', 'A2', 'F2', 'G2', 'C3', 'C3', 'G2', 'G2', 'F2', 'F2', 'G2', 'G2'];
const ARP = [['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4']];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  sfxOn = true;
  musicOn = true;
  volume = 0.7;
  private musicTimer: number | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private nextStepTime = 0;
  private step = 0;

  unlock() {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx!.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx!.destination);
      this.musicGain = this.ctx!.createGain();
      this.musicGain.gain.value = 0.11;
      this.musicGain.connect(this.master);
      // 8-bit style noise: sample-and-hold random values (coarser than white noise)
      const len = this.ctx!.sampleRate;
      this.noiseBuf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) {
        if (i % 4 === 0) v = Math.random() > 0.5 ? 1 : -1;
        d[i] = v;
      }
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

  /** a pulse/triangle "chip" voice with a hard-edged envelope */
  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, delay = 0, slide?: number, dest?: AudioNode) {
    if (!this.ctx || !this.master || !freq) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, delay = 0, rate = 1, dest?: AudioNode) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(g).connect(dest ?? this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private arp(notes: string[], gap: number, dur: number, type: OscillatorType = 'square', vol = 0.15) {
    notes.forEach((n, i) => this.tone(NOTE(n), dur, type, vol, i * gap));
  }

  play(name: Sfx, intensity = 1) {
    if (!this.sfxOn || !this.ctx) return;
    switch (name) {
      case 'hit':
        this.noise(0.08, 0.35 * intensity, 0, 1.5);
        this.tone(880, 0.12, 'square', 0.16 * intensity, 0, 220);
        break;
      case 'putt':
        this.tone(NOTE('A5'), 0.05, 'square', 0.14);
        break;
      case 'perfect':
        this.arp(['C5', 'E5', 'G5', 'C6'], 0.05, 0.08, 'square', 0.13);
        break;
      case 'ability':
        this.arp(['G5', 'B5', 'D6', 'G6', 'D6', 'G6'], 0.04, 0.06, 'square', 0.1);
        break;
      case 'cup':
        this.tone(NOTE('B5'), 0.08, 'square', 0.16);
        this.tone(NOTE('E6'), 0.35, 'square', 0.16, 0.08);
        break;
      case 'splash':
        this.noise(0.5, 0.3, 0, 0.6);
        this.tone(400, 0.3, 'triangle', 0.2, 0, 80);
        break;
      case 'sand':
        this.noise(0.18, 0.25, 0, 0.8);
        break;
      case 'tree':
        this.noise(0.12, 0.25, 0, 0.5);
        this.tone(160, 0.08, 'square', 0.12);
        break;
      case 'bounce':
        this.tone(220, 0.05, 'triangle', 0.22 * intensity, 0, 160);
        break;
      case 'click':
        this.tone(1320, 0.025, 'square', 0.06);
        break;
      case 'coin':
        this.tone(NOTE('B5'), 0.07, 'square', 0.12);
        this.tone(NOTE('E6'), 0.22, 'square', 0.12, 0.07);
        break;
      case 'whoosh':
        this.noise(0.35, 0.18, 0, 0.4);
        this.tone(200, 0.35, 'triangle', 0.15, 0, 900);
        break;
      case 'reveal_common':
        this.arp(['C5', 'G5'], 0.08, 0.12);
        break;
      case 'reveal_uncommon':
        this.arp(['C5', 'E5', 'G5'], 0.08, 0.12);
        break;
      case 'reveal_rare':
        this.arp(['C5', 'E5', 'G5', 'C6'], 0.08, 0.14);
        break;
      case 'reveal_epic':
        this.arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 0.07, 0.14);
        this.tone(NOTE('C3'), 0.6, 'triangle', 0.25, 0.1);
        break;
      case 'reveal_legendary':
        this.arp(['G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.07, 0.16);
        this.arp(['C6', 'G6', 'C7'], 0.12, 0.3, 'square', 0.1);
        this.tone(NOTE('C3'), 1.2, 'triangle', 0.3, 0.1);
        this.noise(0.8, 0.08, 0.5, 2);
        break;
      case 'levelup':
        this.arp(['C5', 'C5', 'C5', 'C5'], 0.1, 0.08);
        this.arp(['G#4', 'A#4', 'C5'], 0.15, 0.14, 'square', 0.15);
        this.tone(NOTE('C5'), 0.5, 'square', 0.15, 0.85);
        break;
      case 'cheer':
        this.arp(['C5', 'E5', 'G5', 'E5', 'G5', 'C6'], 0.09, 0.1, 'square', 0.12);
        this.noise(0.9, 0.08, 0, 1.2);
        break;
      case 'groan':
        this.tone(NOTE('E4'), 0.25, 'square', 0.12, 0, NOTE('D#4'));
        this.tone(NOTE('D4'), 0.25, 'square', 0.12, 0.25, NOTE('C#4'));
        this.tone(NOTE('C#4'), 0.5, 'square', 0.12, 0.5, NOTE('A#3'));
        break;
      case 'error':
        this.tone(150, 0.15, 'square', 0.12);
        break;
    }
  }

  /** look-ahead sequencer for the chiptune loop */
  private startMusic() {
    if (!this.ctx || !this.musicGain) return;
    this.stopMusic();
    const stepDur = 60 / 132 / 4; // 132 bpm, 16th notes
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    const schedule = () => {
      if (!this.ctx || !this.musicGain || !this.musicOn) return;
      while (this.nextStepTime < this.ctx.currentTime + 0.25) {
        const i = this.step % LEAD.length;
        const t = this.nextStepTime - this.ctx.currentTime;
        const bar = Math.floor(i / 16);
        const lead = LEAD[i];
        if (lead !== '-') this.tone(NOTE(lead), stepDur * 1.8, 'square', 0.18, t, undefined, this.musicGain);
        if (i % 4 === 0) this.tone(NOTE(BASS[(i / 4) % BASS.length]), stepDur * 3.5, 'triangle', 0.5, t, undefined, this.musicGain);
        const chord = ARP[bar % ARP.length];
        this.tone(NOTE(chord[i % 3]) * 2, stepDur * 0.8, 'square', 0.05, t, undefined, this.musicGain);
        if (i % 4 === 2) this.noise(0.03, 0.12, t, 3, this.musicGain);
        if (i % 8 === 4) this.noise(0.09, 0.2, t, 0.7, this.musicGain);
        this.nextStepTime += stepDur;
        this.step++;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 60);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  hapticsOn = true;
  private hapticLabel: HTMLLabelElement | null = null;

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
