import type { RarityId } from '../types';
import { isMuted, onMuteChange } from './settings';

/**
 * All sound effects are synthesised with Web Audio: no asset files, no licensing,
 * ~0 bytes over the wire. The context is created lazily and must be resumed from a
 * user gesture (browser autoplay policy), which `unlock()` does.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Stereo impulse response: decaying noise, i.e. a small, bright room. Generated, not downloaded. */
function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function ac(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  // Everything goes through one compressor, so stacked layers (legendary) don't clip on phones.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(comp);
  // Reverb send: sounds opt in with `wet`, so taps stay dry and fanfares get space.
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 2.2, 3);
  reverb = ctx.createGain();
  reverb.gain.value = 0.35;
  reverb.connect(conv).connect(master);
  return ctx;
}

export function unlock(): void {
  const c = ac();
  if (c?.state === 'suspended') void c.resume();
  void prepareRecord();
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
  filter?: number;
  /** Low-pass cutoff at the end of the note: a sweep from `filter` (brass-like swell). */
  filterTo?: number;
  detune?: number;
  /** Reverb send, 0..1. */
  wet?: number;
}

/** Routes a voice to the dry bus and, optionally, to the reverb send. */
function out(c: AudioContext, node: AudioNode, wet = 0): void {
  node.connect(master!);
  if (wet > 0 && reverb) {
    const send = c.createGain();
    send.gain.value = wet;
    node.connect(send).connect(reverb);
  }
}

function tone(c: AudioContext, o: ToneOpts): void {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.detune.value = o.detune ?? 0;
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const vol = o.vol ?? 0.3;
  const attack = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.filter, t);
    if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t + o.dur * 0.6);
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  out(c, g, o.wet);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpts {
  at?: number;
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  /** Attack time; noise starts at full volume by default (cracks, rips). */
  attack?: number;
  wet?: number;
}

function hiss(c: AudioContext, o: NoiseOpts): void {
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = c.createGain();
  if (o.attack) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t + o.attack);
  } else g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g);
  out(c, g, o.wet);
  src.start(t, Math.random());
  src.stop(t + o.dur + 0.05);
}

function play(fn: (c: AudioContext) => void): void {
  if (isMuted()) return;
  const c = ac();
  if (!c || !master) return;
  fn(c);
}

const CHARGE: Record<RarityId, { from: number; to: number; vol: number }> = {
  common: { from: 220, to: 260, vol: 0.04 },
  uncommon: { from: 220, to: 330, vol: 0.06 },
  rare: { from: 200, to: 440, vol: 0.08 },
  epic: { from: 180, to: 660, vol: 0.1 },
  legendary: { from: 110, to: 880, vol: 0.14 },
};

/** Rising tension while the face-down card glows; length matches the suspense delay. */
export const charge = (rarity: RarityId, ms: number) =>
  play((c) => {
    const p = CHARGE[rarity];
    const dur = Math.max(0.2, ms / 1000);
    tone(c, { freq: p.from, to: p.to, type: 'sawtooth', dur, vol: p.vol, attack: dur * 0.8, filter: 1400 });
    if (rarity === 'epic' || rarity === 'legendary') {
      hiss(c, { dur, vol: 0.12, freq: 300, to: 6000, q: 2, attack: dur * 0.7 });
      // Heartbeat, speeding up towards the end: "lub-dub" pairs of low thumps.
      let at = 0.05;
      for (let gap = 0.5; at < dur - 0.1; gap = Math.max(0.22, gap * 0.82)) {
        tone(c, { freq: 70, to: 40, at, dur: 0.12, vol: 0.4 });
        tone(c, { freq: 60, to: 38, at: at + 0.13, dur: 0.1, vol: 0.28 });
        at += gap + 0.13;
      }
    }
  });

export const flip = () =>
  play((c) => {
    hiss(c, { dur: 0.12, vol: 0.3, freq: 2500, q: 0.7 });
    tone(c, { freq: 520, to: 260, type: 'triangle', dur: 0.12, vol: 0.12 });
  });

const NOTE = (semitones: number) => 440 * 2 ** (semitones / 12);
// C major-ish voicings, brighter and longer as rarity increases.
const FANFARE: Record<RarityId, number[]> = {
  common: [3, 10],
  uncommon: [3, 7, 10],
  rare: [3, 7, 10, 15],
  epic: [3, 7, 10, 15, 19],
  legendary: [-9, -5, -2, 3, 7, 10, 15, 19, 22],
};

/** Reveal sting: arpeggio + (rare+) sparkle + (legendary) brass chord and cymbal. */
export const reveal = (rarity: RarityId) =>
  play((c) => {
    const notes = FANFARE[rarity];
    const step = rarity === 'legendary' ? 0.07 : 0.09;
    notes.forEach((n, i) =>
      tone(c, { freq: NOTE(n), type: 'triangle', at: i * step, dur: 0.5 + i * 0.03, vol: 0.18, wet: 0.35 }),
    );
    if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
      for (let i = 0; i < (rarity === 'rare' ? 5 : 10); i++) {
        tone(c, { freq: NOTE(27 + Math.floor(Math.random() * 12)), type: 'sine', at: 0.2 + i * 0.06, dur: 0.35, vol: 0.06, wet: 0.7 });
      }
    }
    if (rarity === 'epic' || rarity === 'legendary') {
      // Pad: two detuned saws per note with an opening low-pass, i.e. a brass-like swell.
      [3, 7, 10].forEach((n) =>
        [-8, 8].forEach((detune) =>
          tone(c, {
            freq: NOTE(n - 12),
            type: 'sawtooth',
            at: notes.length * step,
            dur: 1.6,
            vol: 0.06,
            attack: 0.12,
            filter: 500,
            filterTo: 3200,
            detune,
            wet: 0.4,
          }),
        ),
      );
    }
    if (rarity === 'legendary') {
      [-21, -14, -9, -5].forEach((n) =>
        tone(c, { freq: NOTE(n), type: 'sawtooth', dur: 2.4, vol: 0.07, attack: 0.05, filter: 600, filterTo: 2400, wet: 0.5 }),
      );
      // Cymbal swell and a long tail.
      hiss(c, { dur: 2.2, vol: 0.18, freq: 8000, type: 'highpass', q: 0.5, wet: 0.6 });
    }
  });

/** Low-end hit as the card turns (rare and up): sub drop plus a crack, scaled by rarity. */
export const impact = (rarity: RarityId) =>
  play((c) => {
    const k = { common: 0, uncommon: 0, rare: 0.6, epic: 0.85, legendary: 1 }[rarity];
    if (!k) return;
    tone(c, { freq: 90, to: 32, dur: 0.5 + k * 0.5, vol: 0.5 * k });
    hiss(c, { dur: 0.25 + k * 0.3, vol: 0.3 * k, freq: 1800, to: 300, q: 0.6, wet: 0.5 });
  });

/** Stamp landing ("NOVO!"). */
export const stamp = () =>
  play((c) => {
    tone(c, { freq: 140, to: 60, type: 'sine', dur: 0.18, vol: 0.4 });
    hiss(c, { dur: 0.06, vol: 0.2, freq: 1200, q: 0.8 });
  });

/* ---------------- Mystery loop (face-down card waiting for the tap) ---------------- */

interface MysteryVoice {
  /** Drone level: kept low so a long wait doesn't get tiring. */
  drone: number;
  /** Motif note every `step` seconds; rarer cards tick faster. */
  step: number;
  shimmer: boolean;
  /** Heartbeat period in seconds (epic/legendary only). */
  beat?: number;
}

const MYSTERY: Record<RarityId, MysteryVoice> = {
  common: { drone: 0.035, step: 0.75, shimmer: false },
  uncommon: { drone: 0.04, step: 0.7, shimmer: false },
  rare: { drone: 0.05, step: 0.6, shimmer: true },
  epic: { drone: 0.06, step: 0.55, shimmer: true, beat: 1.05 },
  legendary: { drone: 0.07, step: 0.5, shimmer: true, beat: 0.85 },
};

// A minor motif with a raised fourth: unresolved on purpose, it keeps asking a question.
const MOTIF = [0, 3, 7, 6, 3, 10, 7, 6];

/**
 * Sustained suspense from the end of the charge until the reveal. Returns `stop()`.
 * `alive()` is polled, so the loop also ends by itself when the card leaves the page
 * (navigation) instead of droning on. Muting and hiding the tab silence it live.
 */
export function mystery(rarity: RarityId, alive: () => boolean): () => void {
  const c = ac();
  if (!c || !master) return () => undefined;
  const v = MYSTERY[rarity];
  const t0 = c.currentTime;

  // Bus for the continuous layers, so mute/hide/stop can fade them as one.
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, t0);
  out(c, bus, 0.3);
  const audible = () => !isMuted() && !document.hidden;
  const fadeTo = (level: number, secs: number) => {
    const now = c.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), now + secs);
  };
  if (audible()) fadeTo(1, 0.8);

  const nodes: AudioScheduledSourceNode[] = [];
  // Drone: root and fifth, slightly detuned, through a low-pass that breathes (slow LFO).
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 6;
  const droneGain = c.createGain();
  droneGain.gain.value = v.drone;
  filter.connect(droneGain).connect(bus);
  for (const [freq, detune] of [[55, -6], [55, 6], [82.4, 0], [110, 4]] as const) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(filter);
    nodes.push(o);
  }
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 260;
  lfo.connect(lfoDepth).connect(filter.frequency);
  nodes.push(lfo);

  if (v.shimmer) {
    // High, airy noise with a slow tremolo: "something glittering in the dark".
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6500;
    bp.Q.value = 3;
    const g = c.createGain();
    g.gain.value = 0.02;
    const trem = c.createOscillator();
    trem.frequency.value = 0.35;
    const tremDepth = c.createGain();
    tremDepth.gain.value = 0.018;
    trem.connect(tremDepth).connect(g.gain);
    src.connect(bp).connect(g).connect(bus);
    nodes.push(src, trem);
  }
  for (const n of nodes) n.start(t0);

  // Motif and heartbeat: short notes scheduled on a timer (they use the normal voices,
  // which already respect mute).
  let i = 0;
  const motif = setInterval(() => {
    if (!alive()) return stop();
    if (!audible()) return;
    const n = MOTIF[i++ % MOTIF.length]!;
    play((cc) => tone(cc, { freq: NOTE(n + 3), type: 'sine', dur: 0.9, vol: 0.045, attack: 0.02, wet: 0.8 }));
  }, v.step * 1000);
  const beat = v.beat
    ? setInterval(() => {
        if (!audible() || !alive()) return;
        play((cc) => {
          tone(cc, { freq: 70, to: 40, dur: 0.12, vol: 0.3 });
          tone(cc, { freq: 60, to: 38, at: 0.14, dur: 0.1, vol: 0.2 });
        });
      }, v.beat * 1000)
    : 0;

  const unMute = onMuteChange(() => fadeTo(audible() ? 1 : 0, 0.2));
  const onVisibility = () => fadeTo(audible() ? 1 : 0, 0.2);
  document.addEventListener('visibilitychange', onVisibility);

  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(motif);
    if (beat) clearInterval(beat);
    unMute();
    document.removeEventListener('visibilitychange', onVisibility);
    fadeTo(0, 0.15);
    const end = c!.currentTime + 0.25;
    for (const n of nodes) n.stop(end);
  }
  return stop;
}

/* ---------------- Turntable: the pack opens like a DJ working a record ---------------- */

/*
 * The "record" is a synthesised vocal "ahh" (sawtooth through three vowel formants), the classic
 * scratch sample, rendered once offline. A reversed copy plays the backward strokes: Web Audio
 * can't play a buffer at a negative rate.
 */
let record: { fwd: AudioBuffer; rev: AudioBuffer; crackle: AudioBuffer } | null = null;
let rendering: Promise<void> | null = null;

/**
 * Renders the record offline. Needs no user gesture (no live AudioContext), so the pack view
 * calls it on mount and the very first drag already scratches.
 */
export function prepareRecord(): Promise<void> {
  rendering ??= (async () => {
    const Offline =
      globalThis.OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Offline) return;
    const secs = 1.6;
    const rate = 44100;
    const off = new Offline(1, Math.floor(rate * secs), rate);
    const mix = off.createGain();
    mix.connect(off.destination);
    const env = off.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(1, 0.02);
    env.gain.setValueAtTime(1, secs - 0.15);
    env.gain.linearRampToValueAtTime(0, secs);
    env.connect(mix);
    const voice = off.createGain();
    for (const [freq, q, gain] of [[730, 6, 1], [1090, 7, 0.6], [2440, 9, 0.25]] as const) {
      const f = off.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = off.createGain();
      g.gain.value = gain * 2.2;
      voice.connect(f).connect(g).connect(env);
    }
    // Slight pitch drift, like a real voice, so the scratch has movement even at constant speed.
    for (const detune of [-5, 5]) {
      const o = off.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, 0);
      o.frequency.linearRampToValueAtTime(128, secs);
      o.detune.value = detune;
      o.connect(voice);
      o.start(0);
    }
    const fwd = await off.startRendering();
    const rev = new AudioBuffer({ numberOfChannels: 1, length: fwd.length, sampleRate: rate });
    const src = fwd.getChannelData(0);
    const dst = rev.getChannelData(0);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]!;
    // Vinyl crackle: sparse clicks with a short decay.
    const crackle = new AudioBuffer({ numberOfChannels: 1, length: rate * 2, sampleRate: rate });
    const d = crackle.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      if (Math.random() < 0.0009) {
        const amp = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7);
        for (let k = 0; k < 24 && i + k < d.length; k++) d[i + k] = d[i + k]! + amp * Math.exp(-k / 4);
      }
    }
    record = { fwd, rev, crackle };
  })().catch(() => undefined);
  return rendering;
}

function crackleFor(c: AudioContext, at: number, dur: number, vol: number): void {
  if (!record) return;
  const src = c.createBufferSource();
  src.buffer = record.crackle;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g);
  out(c, g);
  src.start(c.currentTime + at, Math.random() * 1.5);
  src.stop(c.currentTime + at + dur);
}

/**
 * One hand stroke on the record: the platter speeds up and slows down again (a "baby
 * scratch"). `cuts` adds crossfader chops (chirp/transformer feel).
 */
function stroke(c: AudioContext, o: { at: number; dir: 1 | -1; dur: number; peak: number; vol?: number; cuts?: number }): void {
  if (!record) return;
  const t = c.currentTime + o.at;
  const src = c.createBufferSource();
  src.buffer = o.dir > 0 ? record.fwd : record.rev;
  src.playbackRate.setValueAtTime(0.05, t);
  src.playbackRate.linearRampToValueAtTime(o.peak, t + o.dur * 0.45);
  src.playbackRate.linearRampToValueAtTime(0.05, t + o.dur);
  // Brighter when the record moves faster, as with a real stylus.
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(900 + o.peak * 2200, t + o.dur * 0.45);
  lp.frequency.linearRampToValueAtTime(700, t + o.dur);
  const g = c.createGain();
  const vol = o.vol ?? 0.55;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  if (o.cuts) {
    const slice = o.dur / (o.cuts * 2);
    for (let i = 1; i < o.cuts * 2; i++) g.gain.setValueAtTime(i % 2 ? 0.0001 : vol, t + i * slice);
  }
  g.gain.setValueAtTime(vol, t + o.dur - 0.015);
  g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  src.connect(lp).connect(g);
  out(c, g, 0.15);
  src.start(t, 0.15 + Math.random() * 0.6);
  src.stop(t + o.dur + 0.02);
}

/* Live scratch while the strip is dragged: the finger is the hand on the record. */
let live: {
  fwd: AudioBufferSourceNode;
  rev: AudioBufferSourceNode;
  gF: GainNode;
  gR: GainNode;
  lp: BiquadFilterNode;
  out: GainNode;
} | null = null;

export function scratchStart(): void {
  scratchEnd();
  const c = ac();
  if (!c || !master || !record || isMuted()) return;
  const t = c.currentTime;
  const outGain = c.createGain();
  outGain.gain.value = 0.6;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(outGain);
  out(c, outGain, 0.12);
  const voice = (buf: AudioBuffer) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.001;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(g).connect(lp);
    src.start(t, Math.random() * 1.2);
    return [src, g] as const;
  };
  const [fwd, gF] = voice(record.fwd);
  const [rev, gR] = voice(record.rev);
  live = { fwd, rev, gF, gR, lp, out: outGain };
}

/** `velocity`: finger speed along the strip in px/ms, signed (right = forward). */
export function scratchMove(velocity: number): void {
  const c = ctx;
  if (!c || !live) return;
  const t = c.currentTime;
  const speed = Math.min(3, Math.abs(velocity) * 1.6);
  const level = Math.min(1, speed * 0.9);
  for (const [g, on] of [
    [live.gF, velocity > 0],
    [live.gR, velocity < 0],
  ] as const) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(on ? level : 0, t, 0.008);
    // A record the hand stops holding still makes no sound: fade unless the next move comes.
    g.gain.setTargetAtTime(0, t + 0.06, 0.03);
  }
  for (const src of [live.fwd, live.rev]) {
    src.playbackRate.cancelScheduledValues(t);
    src.playbackRate.setTargetAtTime(Math.max(0.001, speed), t, 0.01);
  }
  live.lp.frequency.setTargetAtTime(700 + speed * 2000, t, 0.01);
}

export function scratchEnd(): void {
  const c = ctx;
  if (!c || !live) return;
  const t = c.currentTime;
  live.out.gain.setTargetAtTime(0, t, 0.02);
  live.fwd.stop(t + 0.15);
  live.rev.stop(t + 0.15);
  live = null;
}

/** The strip comes off: a quick scratch combo (forward, back, chirp) landing on a kick. */
export const tear = () =>
  play((c) => {
    stroke(c, { at: 0, dir: 1, dur: 0.11, peak: 2.4 });
    stroke(c, { at: 0.11, dir: -1, dur: 0.09, peak: 2.6 });
    stroke(c, { at: 0.2, dir: 1, dur: 0.16, peak: 2.2, cuts: 3 });
    crackleFor(c, 0, 0.45, 0.25);
    // Kick on the "one" after the combo.
    tone(c, { freq: 130, to: 42, at: 0.37, dur: 0.28, vol: 0.55 });
    hiss(c, { at: 0.37, dur: 0.04, vol: 0.12, freq: 3000, q: 0.7 });
  });

/** Card rising out of the pack: the DJ's rewind (record spun backwards, speeding up). */
export const rustle = () =>
  play((c) => {
    if (!record) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = record.rev;
    src.playbackRate.setValueAtTime(0.4, t);
    src.playbackRate.exponentialRampToValueAtTime(4, t + 0.55);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(5000, t + 0.55);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.08);
    g.gain.setValueAtTime(0.45, t + 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp).connect(g);
    out(c, g, 0.25);
    src.start(t, 0.2);
    src.stop(t + 0.65);
    crackleFor(c, 0, 0.6, 0.3);
  });

/** Card settling: needle drop (thump + crackle) and the turntable spinning up to speed. */
export const whoosh = () =>
  play((c) => {
    tone(c, { freq: 95, to: 55, dur: 0.12, vol: 0.35 });
    hiss(c, { dur: 0.05, vol: 0.2, freq: 1800, q: 0.8 });
    crackleFor(c, 0, 0.7, 0.35);
    if (!record) return;
    const t = c.currentTime + 0.05;
    const src = c.createBufferSource();
    src.buffer = record.fwd;
    src.playbackRate.setValueAtTime(0.05, t);
    src.playbackRate.linearRampToValueAtTime(1, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(g);
    out(c, g, 0.2);
    src.start(t, 0.1);
    src.stop(t + 0.6);
  });
