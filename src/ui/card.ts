import type { Album } from '../types';
import { rarityForRank } from '../rarity';
import { artCandidates, isDecoded, resolveArt } from '../cover';
import type { Priority } from '../net/jsonp';
import { h } from './dom';
import { CardMotion, type MotionOptions } from './motion';

export interface CardOptions {
  /** Interactive spring tilt + holo tracking. `true` = pointer only. */
  motion?: boolean | MotionOptions;
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
    // Two transform layers: __tilt (spring-driven, no transition) and __inner (flip, transitioned).
    h('div', { class: 'card__tilt' }, h('div', { class: 'card__inner' }, front, cardBack())),
  );

  if (opts.motion) attachMotion(card, opts.motion === true ? {} : opts.motion);
  return card;
}

const motions = new WeakMap<HTMLElement, CardMotion>();

export function attachMotion(card: HTMLElement, opts: MotionOptions = {}): CardMotion {
  motions.get(card)?.destroy();
  const m = new CardMotion(card, opts);
  motions.set(card, m);
  return m;
}

export const motionOf = (card: HTMLElement): CardMotion | undefined => motions.get(card);
