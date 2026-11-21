export interface Entry {
  count: number;
  /** ISO timestamp of the first pull. */
  firstAt: string;
}

export interface CollectionState {
  version: 1;
  pulls: number;
  entries: Record<string, Entry>;
}

const KEY = 'disk-discovery:collection';

function empty(): CollectionState {
  return { version: 1, pulls: 0, entries: {} };
}

/**
 * localStorage-backed collection. Every access is guarded: storage can be
 * unavailable (private mode, blocked cookies) and the app must still work in-memory.
 */
export class Collection {
  private state: CollectionState;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.state = this.load();
  }

  get pulls(): number {
    return this.state.pulls;
  }

  get(id: string): Entry | undefined {
    return this.state.entries[id];
  }

  has(id: string): boolean {
    return id in this.state.entries;
  }

  get uniqueCount(): number {
    return Object.keys(this.state.entries).length;
  }

  /** Records a pull and reports whether it was a new discovery. */
  add(id: string, now = new Date()): { isNew: boolean; entry: Entry } {
    const prev = this.state.entries[id];
    const entry: Entry = prev
      ? { ...prev, count: prev.count + 1 }
      : { count: 1, firstAt: now.toISOString() };
    this.state.entries[id] = entry;
    this.state.pulls += 1;
    this.save();
    return { isNew: !prev, entry };
  }

  reset(): void {
    this.state = empty();
    this.save();
  }

  private load(): CollectionState {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as Partial<CollectionState>;
      if (parsed.version !== 1 || typeof parsed.entries !== 'object' || !parsed.entries) return empty();
      return { version: 1, pulls: Number(parsed.pulls) || 0, entries: parsed.entries };
    } catch {
      return empty();
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* quota / disabled storage: keep in-memory state */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
