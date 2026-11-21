import { describe, expect, it } from 'vitest';
import { Scheduler } from './jsonp';

describe('Scheduler', () => {
  it('runs high-priority jobs before queued low-priority ones', async () => {
    const s = new Scheduler(1, 0);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = (name: string, until?: Promise<void>) => async () => {
      order.push(name);
      await until;
    };
    const all = [
      s.run(job('first', gate), 'low'),
      s.run(job('low-1'), 'low'),
      s.run(job('low-2'), 'low'),
      s.run(job('opened-card'), 'high'),
    ];
    release();
    await Promise.all(all);
    expect(order).toEqual(['first', 'opened-card', 'low-1', 'low-2']);
  });
});
