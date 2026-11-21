import type { Album } from '../types';
import { rarityForRank } from '../rarity';
import { coverUrl, resolveMbid } from '../cover';
import { h, prefersReducedMotion } from './dom';

export interface CardOptions {
  /** Interactive 3D tilt + holo tracking. */
  tilt?: boolean;
  /** Render face-down (front still built so a flip can reveal it). */
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function stars(n: number): string {
  return '★'.repeat(n);
}

function coverArt(album: Album): HTMLElement {
  const initials = album.title
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
  // Placeholder doubles as the permanent fallback if no art is found.
  const fallback = h('div', { class: 'art__fallback', 'aria-hidden': 'true' }, h('span', {}, initials));
  const art = h('div', { class: 'card__art' }, fallback);

  void resolveMbid(album).then((mbid) => {
    if (!mbid) return;
    const img = h('img', {
      alt: `Capa de ${album.title}, de ${album.artist}`,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    });
    img.addEventListener('load', () => art.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = coverUrl(mbid, 500);
    art.append(img);
  });
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
    coverArt(album),
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
