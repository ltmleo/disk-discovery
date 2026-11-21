let seq = 0;

/** JSONP for APIs without CORS (iTunes Search). Only ever used against trusted hosts. */
export function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__ddJsonp${++seq}`;
    const script = document.createElement('script');
    const g = globalThis as unknown as Record<string, unknown>;
    const done = () => {
      clearTimeout(timer);
      delete g[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timeout'));
    }, timeoutMs);
    g[cb] = (data: T) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error('network'));
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.head.append(script);
  });
}

export type Priority = 'high' | 'low';

/**
 * Tiny priority scheduler with a concurrency cap and a minimum gap between
 * starts (polite rate limiting). High-priority jobs always run before queued
 * low-priority ones, so the card being opened never waits behind the gallery.
 */
export class Scheduler {
  private readonly high: (() => void)[] = [];
  private readonly low: (() => void)[] = [];
  private running = 0;
  private lastStart = 0;
  private timer = 0;

  constructor(
    private readonly concurrency: number,
    private readonly gapMs: number,
  ) {}

  run<T>(job: () => Promise<T>, priority: Priority = 'low'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        this.lastStart = Date.now();
        job()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.pump();
          });
      };
      (priority === 'high' ? this.high : this.low).push(start);
      this.pump();
    });
  }

  private pump(): void {
    if (this.running >= this.concurrency) return;
    const wait = this.lastStart + this.gapMs - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pump(), wait) as unknown as number;
      return;
    }
    const next = this.high.shift() ?? this.low.shift();
    if (next) {
      next();
      this.pump();
    }
  }
}
