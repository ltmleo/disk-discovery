import type { Album } from '../types';
import { rarityForRank } from '../rarity';
import { artCandidates, isDecoded, resolveArt } from '../cover';
import type { Priority } from '../net/jsonp';
import { h, prefersReducedMotion } from './dom';

export interface CardOptions {
  /** Interactive 3D tilt + holo tracking. */
  tilt?: boolean;
  /** Render face-down (front still built so a flip can reveal it). */
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Network priority for the artwork. Defaults to high, or low for lazy cards. */
  priority?: Priority;
  /** Only fetch artwork once the card scrolls into view (gallery). */
  lazy?: boolean;
}

export function stars(n: number): string {
  return '★'.repeat(n);
}

const ART_PX = { sm: 300, md: 400, lg: 600 } as const;

/**
 * Artwork with three loading modes:
 *  - already decoded (preloaded while the pack was being opened): painted immediately, no fade;
 *  - high priority (card being revealed / detail page): starts now;
 *  - lazy (gallery): resolves only when scrolled into view, at low priority.
 */
function coverArt(album: Album, size: 'sm' | 'md' | 'lg', priority: Priority, lazy: boolean): HTMLElement {
  const initials = album.title
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
  // Placeholder doubles as the permanent fallback if no art is found.
  const fallback = h('div', { class: 'art__fallback', 'aria-hidden': 'true' }, h('span', {}, initials));
  const art = h('div', { class: 'card__art' }, fallback);
  const px = ART_PX[size];

  const mount = (urls: string[]) => {
    const [url, ...rest] = urls;
    if (!url) return;
    const img = h('img', {
      alt: `Capa de ${album.title}, de ${album.artist}`,
      decoding: 'async',
      referrerpolicy: 'no-referrer',
      fetchpriority: priority,
      loading: lazy ? 'lazy' : 'eager',
    });
    if (isDecoded(url)) art.classList.add('is-loaded', 'is-instant');
    img.addEventListener('load', () => art.classList.add('is-loaded'), { once: true });
    // Broken source (e.g. expired CDN URL): fall through to the next candidate.
    img.addEventListener('error', () => {
      img.remove();
      mount(rest);
    }, { once: true });
    img.src = url;
    art.append(img);
  };

  const known = artCandidates(album, px);
  if (known.length) mount(known);
  else if (!lazy || typeof IntersectionObserver === 'undefined') void resolveArt(album, px, priority).then(mount);
  else {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void resolveArt(album, px, 'low').then(mount);
      },
      { rootMargin: '200px' },
    );
    io.observe(art);
  }
  return art;
}

export function cardBack(): HTMLElement {
  return h(
    'div',
    { class: 'card__back', 'aria-hidden': 'true' },
    h('div', { class: 'back__disc' }, h('div', { class: 'back__label' }, 'DD')),
    h('div', { class: 'back__brand' }, 'DISK DISCOVERY'),
  );
}

export function renderCard(album: Album, opts: CardOptions = {}): HTMLElement {
  const rarity = rarityForRank(album.rank);
  const front = h(
    'div',
    { class: 'card__front' },
    h(
      'header',
      { class: 'card__head' },
      h('span', { class: 'card__rank' }, `#${album.rank}`),
      h('span', { class: 'card__stars', 'aria-label': `${rarity.stars} estrelas` }, stars(rarity.stars)),
    ),
    coverArt(album, opts.size ?? 'md', opts.priority ?? (opts.lazy ? 'low' : 'high'), !!opts.lazy),
    h(
      'div',
      { class: 'card__body' },
      h('h3', { class: 'card__title' }, album.title),
      h('p', { class: 'card__artist' }, `${album.artist} · ${album.year}`),
      h('p', { class: 'card__tagline' }, album.tagline),
    ),
    h(
      'footer',
      { class: 'card__foot' },
      h('span', { class: 'card__rarity' }, rarity.label),
      h('span', { class: 'card__genre' }, album.genre),
    ),
    h('div', { class: 'card__holo', 'aria-hidden': 'true' }),
    h('div', { class: 'card__glare', 'aria-hidden': 'true' }),
  );

  const card = h(
    'article',
    {
      class: `card card--${rarity.id} card--${opts.size ?? 'md'}${opts.faceDown ? ' is-facedown' : ''}`,
      'data-rarity': rarity.id,
      'aria-label': `${album.title}, ${album.artist}. Carta ${rarity.label}, posição ${album.rank}.`,
    },
    h('div', { class: 'card__inner' }, front, cardBack()),
  );

  if (opts.tilt && !prefersReducedMotion()) attachTilt(card);
  return card;
}

/**
 * Pointer-driven tilt. Writes CSS custom properties only; all visuals live in CSS,
 * so each rarity can interpret --mx/--my (pointer %) and --rx/--ry (rotation) differently.
 */
export function attachTilt(card: HTMLElement): void {
  let frame = 0;
  const set = (x: number, y: number, active: boolean) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - y) * 18}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
      card.style.setProperty('--hyp', String(Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 1.6)));
      card.classList.toggle('is-active', active);
    });
  };
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, true);
  });
  card.addEventListener('pointerleave', () => set(0.5, 0.5, false));
}
