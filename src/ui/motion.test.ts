import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardMotion } from './motion';

describe('CardMotion', () => {
  let queued: FrameRequestCallback[] = [];
  beforeEach(() => {
    queued = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queued.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const runFrames = (n: number) => {
    let max = 0;
    for (let i = 0; i < n; i++) {
      const batch = queued;
      queued = [];
      max = Math.max(max, batch.length);
      for (const cb of batch) cb(performance.now() + i * 16);
    }
    return max;
  };

  it('keeps exactly one animation loop while idling (no runaway rAF)', () => {
    const el = document.createElement('div');
    new CardMotion(el, { idle: true });
    expect(runFrames(50)).toBe(1);
    expect(el.style.getPropertyValue('--ry')).not.toBe('');
  });

  it('stops scheduling frames once a pointer-only card settles', () => {
    const el = document.createElement('div');
    new CardMotion(el);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    el.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(600);
    expect(queued.length).toBe(0);
  });
});
