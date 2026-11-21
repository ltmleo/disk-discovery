type Attrs = Record<string, string | number | boolean | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

/** Minimal hyperscript helper. Strings are always text nodes, so nothing is parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

export const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Splits a word into "ransom note" letters with varied type and rotation. Deterministic per string. */
export function ransom(text: string, className = 'ransom'): HTMLElement {
  const wrap = h('span', { class: className, 'aria-label': text, role: 'img' });
  let seed = [...text].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  // Letters are grouped per word so line breaks only happen between words.
  for (const word of text.split(' ')) {
    const w = h('span', { class: 'ransom__w', 'aria-hidden': 'true' });
    for (const ch of word) {
      const v = Math.floor(next() * 6);
      const rot = (next() * 14 - 7).toFixed(1);
      w.append(h('span', { class: `ransom__l ransom__l--${v}`, style: `--r:${rot}deg` }, ch));
    }
    wrap.append(w);
  }
  return wrap;
}
