import { prefersReducedMotion } from './dom';

/**
 * Spring-driven card motion (tilt, pointer glare position, lift), in the spirit of
 * digital TCG cards. JS only writes CSS custom properties; every visual (rotation,
 * holo, glare, parallax, shadow) is derived in CSS, so each rarity can style it.
 *
 * Inputs, by priority: pointer > scripted sweep > device tilt (gyroscope) > idle sway.
 * The rAF loop only runs while something is moving, so a gallery of idle cards costs nothing.
 */

interface Spring {
  x: number;
  v: number;
  target: number;
}

const spring = (x = 0): Spring => ({ x, v: 0, target: x });

// Stiffness / damping tuned for a light overshoot, like a card in the hand.
const STIFF = 0.075;
const DAMP = 0.78;

function step(s: Spring, k: number): boolean {
  s.v = (s.v + (s.target - s.x) * STIFF * k) * DAMP ** k;
  s.x += s.v * k;
  return Math.abs(s.v) > 0.01 || Math.abs(s.target - s.x) > 0.01;
}

export interface MotionOptions {
  /** Gentle automatic sway when nobody is interacting (revealed / detail / inspect cards). */
  idle?: boolean;
  /** Follow the device tilt on phones. */
  gyro?: boolean;
  /** Max rotation in degrees. */
  range?: number;
}

const active = new Set<CardMotion>();

export class CardMotion {
  private readonly rx = spring();
  private readonly ry = spring();
  private readonly mx = spring(50);
  private readonly my = spring(50);
  private readonly lift = spring();
  private frame = 0;
  /** True while tick() runs: the tick schedules its own next frame, so kick() must not. */
  private ticking = false;
  private last = 0;
  private pointerAt = 0;
  private sweepUntil = 0;
  private visible = true;
  private readonly io?: IntersectionObserver;
  private readonly range: number;

  constructor(
    private readonly el: HTMLElement,
    private readonly opts: MotionOptions = {},
  ) {
    this.range = opts.range ?? 16;
    if (prefersReducedMotion()) return;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('pointerdown', this.onMove);
    if (typeof IntersectionObserver !== 'undefined' && (opts.idle || opts.gyro)) {
      this.io = new IntersectionObserver(([e]) => {
        this.visible = !!e?.isIntersecting;
        if (this.visible) this.kick();
      });
      this.io.observe(el);
    }
    active.add(this);
    if (opts.idle) this.kick();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.io?.disconnect();
    active.delete(this);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.el.removeEventListener('pointerdown', this.onMove);
  }

  /** Scripted shine pass from left to right (used right after a reveal). */
  sweep(ms = 1400): void {
    if (prefersReducedMotion()) return;
    this.sweepUntil = performance.now() + ms;
    this.kick();
  }

  /** Called by the shared gyroscope listener with normalised tilt (-1..1). */
  tilt(x: number, y: number): void {
    if (!this.opts.gyro || !this.visible || this.pointerActive() || this.sweeping()) return;
    this.aim(x, y, 0.3);
  }

  private readonly onMove = (e: PointerEvent) => {
    const r = this.el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    this.pointerAt = performance.now();
    this.aim(x * 2 - 1, y * 2 - 1, 1);
    this.el.classList.add('is-active');
  };

  private readonly onLeave = () => {
    this.pointerAt = 0;
    this.aim(0, 0, 0);
    this.el.classList.remove('is-active');
  };

  private pointerActive(): boolean {
    return this.pointerAt > 0 && performance.now() - this.pointerAt < 2500;
  }

  private sweeping(): boolean {
    return performance.now() < this.sweepUntil;
  }

  /** x, y in -1..1 (pointer position relative to the card centre). */
  private aim(x: number, y: number, lift: number): void {
    this.ry.target = x * this.range;
    this.rx.target = -y * this.range * 0.8;
    this.mx.target = 50 + x * 50;
    this.my.target = 50 + y * 50;
    this.lift.target = lift;
    this.kick();
  }

  private kick(): void {
    if (!this.frame && !this.ticking) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    this.ticking = true;
    const k = Math.min(3, (now - this.last) / 16.67); // frame-rate independent
    this.last = now;

    if (this.sweeping()) {
      const p = 1 - (this.sweepUntil - now) / 1400;
      const x = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI * 2 - Math.PI / 2) * 0.9;
      this.aim(x, -0.25, 0.6);
    } else if (this.opts.idle && !this.pointerActive() && this.visible && !document.hidden && !gyroLive) {
      const t = now / 1000;
      this.aim(Math.sin(t * 0.7) * 0.55, Math.cos(t * 0.9) * 0.35, 0.25);
    }

    let moving = false;
    for (const s of [this.rx, this.ry, this.mx, this.my, this.lift]) moving = step(s, k) || moving;
    this.write();

    const keepIdle = this.opts.idle && this.visible && !document.hidden && !gyroLive;
    this.ticking = false;
    if (moving || keepIdle || this.sweeping()) this.frame = requestAnimationFrame(this.tick);
  };

  private write(): void {
    const st = this.el.style;
    const dx = (this.mx.x - 50) / 50;
    const dy = (this.my.x - 50) / 50;
    st.setProperty('--rx', `${this.rx.x.toFixed(2)}deg`);
    st.setProperty('--ry', `${this.ry.x.toFixed(2)}deg`);
    st.setProperty('--mx', `${this.mx.x.toFixed(2)}%`);
    st.setProperty('--my', `${this.my.x.toFixed(2)}%`);
    st.setProperty('--dx', dx.toFixed(3));
    st.setProperty('--dy', dy.toFixed(3));
    st.setProperty('--hyp', Math.min(1, Math.hypot(dx, dy)).toFixed(3));
    st.setProperty('--lift', this.lift.x.toFixed(3));
  }
}

/* ---------------- Gyroscope (one listener for all cards) ---------------- */

let gyroLive = false;
let gyroBound = false;
let base: { beta: number; gamma: number } | null = null;

function onOrientation(e: DeviceOrientationEvent): void {
  if (e.beta === null || e.gamma === null) return;
  gyroLive = true;
  // Calibrate to however the user is holding the phone when the first reading arrives.
  base ??= { beta: e.beta, gamma: e.gamma };
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const x = clamp((e.gamma - base.gamma) / 25);
  const y = clamp((e.beta - base.beta) / 25);
  for (const m of active) m.tilt(x, y);
}

/**
 * Enables device-tilt control. Must be called from a user gesture: iOS requires an
 * explicit permission prompt (DeviceOrientationEvent.requestPermission).
 */
export function enableGyro(): void {
  if (gyroBound || prefersReducedMotion() || typeof DeviceOrientationEvent === 'undefined') return;
  if (!matchMedia('(pointer: coarse)').matches) return; // desktops: pointer is better
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  const bind = () => {
    gyroBound = true;
    window.addEventListener('deviceorientation', onOrientation);
  };
  if (typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then((r) => r === 'granted' && bind(), () => undefined);
  } else bind();
}

/** Re-centre the gyroscope (e.g. after opening a new card). */
export function recalibrateGyro(): void {
  base = null;
}
