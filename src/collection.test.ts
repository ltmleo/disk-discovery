import { describe, expect, it } from 'vitest';
import { Collection } from './collection';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('Collection', () => {
  it('counts duplicates and flags first discovery', () => {
    const c = new Collection(memStorage());
    expect(c.add('a').isNew).toBe(true);
    const second = c.add('a');
    expect(second.isNew).toBe(false);
    expect(second.entry.count).toBe(2);
    expect(c.pulls).toBe(2);
    expect(c.uniqueCount).toBe(1);
  });

  it('persists across instances', () => {
    const s = memStorage();
    new Collection(s).add('a');
    expect(new Collection(s).get('a')?.count).toBe(1);
  });

  it('survives corrupt or missing storage', () => {
    const s = memStorage();
    s.setItem('disk-discovery:collection', '{not json');
    expect(new Collection(s).uniqueCount).toBe(0);
    const noStore = new Collection(null);
    noStore.add('x');
    expect(noStore.has('x')).toBe(true);
  });
});
