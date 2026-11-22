import type { RarityId } from '../types';
import { isMuted } from './settings';

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

/** One crinkle while the strip is being dragged; `progress` (0..1) raises the pitch. */
export const tearGrain = (progress: number) =>
  play((c) => {
    for (let i = 0; i < 2; i++) {
      hiss(c, {
        at: i * 0.018 + Math.random() * 0.01,
        dur: 0.035 + Math.random() * 0.03,
        vol: 0.14 + progress * 0.12,
        freq: 2200 + progress * 3500 + Math.random() * 900,
        q: 1.4,
        type: 'bandpass',
      });
    }
  });

/** The strip coming off: a ripping crack, foil crinkles and a soft thump of the pack opening. */
export const tear = () =>
  play((c) => {
    hiss(c, { dur: 0.28, vol: 0.45, freq: 6500, to: 1400, q: 0.9 });
    for (let i = 0; i < 9; i++) {
      hiss(c, { at: 0.03 + i * 0.035 + Math.random() * 0.02, dur: 0.06, vol: 0.22, freq: 2500 + Math.random() * 4000, q: 1.2 });
    }
    tone(c, { freq: 110, to: 50, dur: 0.22, vol: 0.35 });
  });

/** Card sliding out against the inside of the wrapper. */
export const rustle = () =>
  play((c) => {
    hiss(c, { dur: 0.7, vol: 0.22, freq: 700, to: 1800, q: 0.9, attack: 0.25 });
    hiss(c, { at: 0.1, dur: 0.5, vol: 0.08, freq: 4000, q: 0.7, type: 'highpass', attack: 0.2 });
  });

/** Card settling into place after the pack falls away. */
export const whoosh = () =>
  play((c) => {
    hiss(c, { dur: 0.45, vol: 0.28, freq: 400, to: 2500, q: 1.2, wet: 0.2 });
    tone(c, { freq: 90, to: 60, at: 0.3, dur: 0.15, vol: 0.2 });
  });

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
