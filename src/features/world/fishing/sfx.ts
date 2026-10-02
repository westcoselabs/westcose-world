/** Pier Pressure's sound effects, synthesised with WebAudio: no files to download. Sound is
 * opt-in through the world sound preference; the context starts only on a user gesture,
 * suspends while paused or hidden, and closes when the game unmounts. */
export type Sfx = 'cast' | 'plop' | 'tick' | 'chomp' | 'reel' | 'creak' | 'snap' | 'spit' | 'splash' | 'squawk' | 'cash' | 'fanfare' | 'bow' | 'gag';

export class FishingSfx {
  enabled = false;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Follow the world sound preference: off suspends straight away. */
  setEnabled(on: boolean) { this.enabled = on; if (!on) this.suspend(); }

  /** Create or resume the audio context. Call from a click or key press. */
  start() {
    if (!this.enabled || typeof window === 'undefined') return;
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = .32;
        this.master.connect(this.context.destination);
        const length = Math.floor(this.context.sampleRate * .6);
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch { this.context = null; }
  }
  suspend() { if (this.context?.state === 'running') void this.context.suspend(); }
  close() {
    const context = this.context;
    this.context = null; this.master = null; this.noise = null;
    if (context) void context.close().catch(() => {});
  }

  play(name: Sfx, strength = 1) {
    const c = this.context, out = this.master;
    if (!this.enabled || !c || !out || c.state !== 'running') return;
    const t = c.currentTime;
    switch (name) {
      case 'tick': this.tone('sine', 1250, 900, t, .05, .18 * strength); break;
      case 'plop': this.tone('sine', 520, 180, t, .16, .3); this.hiss(1400, t, .12, .12); break;
      case 'chomp': this.tone('sine', 380, 90, t, .22, .5); this.hiss(900, t, .25, .35); break;
      case 'cast': this.hiss(2600, t, .32, .16, 600); break;
      case 'reel': this.tone('square', 2100, 2100, t, .012, .03 * strength); break;
      case 'creak': this.tone('sawtooth', 95, 70, t, .22, .12 * strength); break;
      case 'snap': this.tone('triangle', 720, 70, t, .35, .45); this.hiss(4000, t, .05, .3); break;
      case 'spit': this.tone('square', 260, 90, t, .2, .14); this.hiss(700, t, .15, .2); break;
      case 'splash': this.hiss(800, t, .35 * Math.max(.5, strength), .32 * strength); break;
      case 'squawk': for (let i = 0; i < 3; i++) this.tone('sawtooth', 900 + i * 150, 650, t + i * .11, .1, .1); break;
      case 'cash': this.tone('sine', 1320, 1320, t, .2, .2); this.tone('sine', 1760, 1760, t + .07, .35, .2); break;
      case 'bow': this.tone('sine', 660, 990, t, .18, .2); break;
      case 'gag': this.tone('triangle', 400, 180, t, .25, .2); this.tone('triangle', 300, 120, t + .2, .3, .2); break;
      case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + i * .11, i === 3 ? .5 : .14, .22)); break;
    }
  }

  private tone(type: OscillatorType, from: number, to: number, at: number, length: number, volume: number) {
    const c = this.context!, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), at + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    osc.connect(gain).connect(this.master!);
    osc.start(at); osc.stop(at + length + .02);
  }
  private hiss(frequency: number, at: number, length: number, volume: number, sweep?: number) {
    const c = this.context!, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass'; filter.Q.value = .9;
    filter.frequency.setValueAtTime(frequency, at);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(at); source.stop(at + length + .02);
  }
}
