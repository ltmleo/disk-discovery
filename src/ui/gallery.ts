import type { Collection } from '../collection';
import type { RarityId } from '../types';
import { ALBUMS, ALBUM_BY_ID } from '../data/albums';
import { RARITIES, rarityForRank } from '../rarity';
import { renderCard, cardBack, stars } from './card';
import { h, ransom } from './dom';
import { openInspect } from './inspect';
import { prefetchContent } from '../data/content';

type Filter = RarityId | 'all';

export const SPY_PARAM = 'espiar';

/**
 * @param initialSpy spy mode shows every album, including ones not pulled yet.
 * It is read-only: it never touches the collection, and the state lives in the URL
 * (`#/galeria?espiar`) so back/forward and the detail page keep it.
 */
export function renderGallery(collection: Collection, initialSpy = false): HTMLElement {
  let filter: Filter = 'all';
  let spy = initialSpy;
  const grid = h('ul', { class: 'gallery', role: 'list' });
  const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtrar por raridade' });

  const sorted = [...ALBUMS].sort((a, b) => a.rank - b.rank);

  function draw() {
    const items = sorted.filter((a) => filter === 'all' || rarityForRank(a.rank).id === filter);
    grid.replaceChildren(
      ...items.map((album) => {
        const entry = collection.get(album.id);
        const rarity = rarityForRank(album.rank);
        if (!entry && spy) {
          return h(
            'li',
            { class: 'gallery__item is-spied' },
            h(
              'a',
              {
                class: 'gallery__link',
                href: `#/disco/${album.id}?${SPY_PARAM}`,
                'data-album': album.id,
                'data-spied': '1',
                'aria-label': `${album.title} (espiando, ainda não descoberto)`,
              },
              renderCard(album, { size: 'sm', motion: { range: 10 }, lazy: true }),
            ),
            h('span', { class: 'gallery__spy-tape', 'aria-hidden': 'true' }, 'ESPIANDO'),
          );
        }
        if (!entry) {
          return h(
            'li',
            { class: 'gallery__item is-locked' },
            h(
              'div',
              { class: `card card--sm card--locked card--${rarity.id}`, 'aria-label': `Disco #${album.rank} ainda não descoberto` },
              h('div', { class: 'card__tilt' }, h('div', { class: 'card__inner' }, cardBack())),
            ),
            h('p', { class: 'gallery__caption' }, `#${album.rank} · ??? · ${stars(rarity.stars)}`),
          );
        }
        return h(
          'li',
          { class: 'gallery__item' },
          h('a', { class: 'gallery__link', href: `#/disco/${album.id}`, 'data-album': album.id }, renderCard(album, { size: 'sm', motion: { range: 14 }, lazy: true })),
          entry.count > 1 ? h('span', { class: 'gallery__count' }, `×${entry.count}`) : null,
        );
      }),
    );
    for (const btn of chips.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
    }
    spyBtn.setAttribute('aria-pressed', String(spy));
    spyBtn.textContent = spy ? '🙈 Parar de espiar' : '👀 Espiar';
    view.classList.toggle('is-spying', spy);
    spyNote.hidden = !spy;
  }

  const spyBtn = h('button', {
    class: 'chip chip--spy',
    type: 'button',
    onclick: () => {
      spy = !spy;
      // replaceState: keeps the URL shareable without firing hashchange (no full re-render).
      history.replaceState(null, '', spy ? `#/galeria?${SPY_PARAM}` : '#/galeria');
      draw();
    },
  });
  const spyNote = h(
    'p',
    { class: 'clip clip--note gallery__spy-note', hidden: true },
    'Modo espiar: você está vendo todos os discos. Os desbotados ainda não são seus, e espiar não muda sua coleção.',
  );

  const chip = (id: Filter, label: string) =>
    h(
      'button',
      {
        class: `chip chip--${id}`,
        type: 'button',
        'data-filter': id,
        onclick: () => {
          filter = id;
          draw();
        },
      },
      label,
    );
  chips.append(chip('all', 'Todos'), ...RARITIES.map((r) => chip(r.id, `${stars(r.stars)} ${r.label}`)), spyBtn);

  const found = ALBUMS.filter((a) => collection.has(a.id)).length;
  const view = h(
    'section',
    { class: 'view view--gallery' },
    h('h1', { class: 'headline' }, ransom('MINHA GALERIA')),
    h(
      'div',
      { class: 'gallery__stats' },
      h('span', { class: 'clip clip--stat' }, h('b', {}, `${found}/${ALBUMS.length}`), ' descobertos'),
      h('span', { class: 'clip clip--stat clip--alt' }, h('b', {}, String(collection.pulls)), ' pacotes abertos'),
    ),
    chips,
    spyNote,
    grid,
  );
  // Hover/focus on a card is a strong hint the detail page is next: warm its text chunk.
  const warm = (e: Event) => {
    const id = (e.target as Element).closest<HTMLElement>('a.gallery__link')?.dataset.album;
    if (id) prefetchContent(id);
  };
  grid.addEventListener('pointerover', warm);
  grid.addEventListener('focusin', warm);

  // Plain clicks pick the card up (inspect overlay); modified clicks keep normal link behaviour.
  grid.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a.gallery__link');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const album = ALBUM_BY_ID.get(link.dataset.album ?? '');
    const card = link.querySelector<HTMLElement>('.card');
    if (!album || !card) return;
    e.preventDefault();
    openInspect(album, card, { href: link.getAttribute('href')!, spied: link.dataset.spied === '1' });
  });

  draw();
  return view;
}
