import type { RarityId } from '../types';
import { isMuted } from './settings';

/**
 * All sound effects are synthesised with Web Audio: no asset files, no licensing,
 * ~0 bytes over the wire. The context is created lazily and must be resumed from a
 * user gesture (browser autoplay policy), which `unlock()` does.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
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
}

function tone(c: AudioContext, o: ToneOpts): void {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
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
    f.frequency.value = o.filter;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(master!);
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
  g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + o.dur + 0.05);
}

function play(fn: (c: AudioContext) => void): void {
  if (isMuted()) return;
  const c = ac();
  if (!c || !master) return;
  fn(c);
}

/** Foil wrapper being ripped: a few crackly noise grains sweeping up. */
export const tear = () =>
  play((c) => {
    for (let i = 0; i < 7; i++) {
      hiss(c, { at: i * 0.045, dur: 0.08, vol: 0.35, freq: 1800 + i * 500, q: 0.8, type: 'highpass' });
    }
    hiss(c, { at: 0.05, dur: 0.35, vol: 0.25, freq: 900, to: 5000, q: 0.6 });
  });

/** Card sliding out of the pack. */
export const whoosh = () =>
  play((c) => hiss(c, { dur: 0.5, vol: 0.3, freq: 400, to: 2500, q: 1.2 }));

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
      hiss(c, { dur, vol: 0.12, freq: 300, to: 6000, q: 2 });
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
      tone(c, { freq: NOTE(n), type: 'triangle', at: i * step, dur: 0.5 + i * 0.03, vol: 0.18 }),
    );
    if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
      for (let i = 0; i < (rarity === 'rare' ? 5 : 10); i++) {
        tone(c, { freq: NOTE(27 + Math.floor(Math.random() * 12)), type: 'sine', at: 0.2 + i * 0.06, dur: 0.25, vol: 0.06 });
      }
    }
    if (rarity === 'epic' || rarity === 'legendary') {
      [3, 7, 10].forEach((n) =>
        tone(c, { freq: NOTE(n - 12), type: 'sawtooth', at: notes.length * step, dur: 1.4, vol: 0.09, attack: 0.08, filter: 1800 }),
      );
    }
    if (rarity === 'legendary') {
      [-21, -14, -9, -5].forEach((n) =>
        tone(c, { freq: NOTE(n), type: 'sawtooth', dur: 2.2, vol: 0.08, attack: 0.05, filter: 1200 }),
      );
      hiss(c, { dur: 1.8, vol: 0.18, freq: 8000, type: 'highpass', q: 0.5 });
    }
  });

/** Stamp landing ("NOVO!"). */
export const stamp = () =>
  play((c) => {
    tone(c, { freq: 140, to: 60, type: 'sine', dur: 0.18, vol: 0.4 });
    hiss(c, { dur: 0.06, vol: 0.2, freq: 1200, q: 0.8 });
  });
