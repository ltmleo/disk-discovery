const KEY = 'disk-discovery:muted';
type Listener = (muted: boolean) => void;
const listeners = new Set<Listener>();

let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = (): boolean => muted;

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(value);
}

export function onMuteChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
