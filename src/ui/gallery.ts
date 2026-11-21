import type { Collection } from '../collection';
import type { RarityId } from '../types';
import { ALBUMS } from '../data/albums';
import { RARITIES, rarityForRank } from '../rarity';
import { renderCard, cardBack, stars } from './card';
import { h, ransom } from './dom';

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
              { class: 'gallery__link', href: `#/disco/${album.id}?${SPY_PARAM}`, 'aria-label': `${album.title} (espiando, ainda não descoberto)` },
              renderCard(album, { size: 'sm', lazy: true }),
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
              h('div', { class: 'card__inner' }, cardBack()),
            ),
            h('p', { class: 'gallery__caption' }, `#${album.rank} · ??? · ${stars(rarity.stars)}`),
          );
        }
        return h(
          'li',
          { class: 'gallery__item' },
          h('a', { class: 'gallery__link', href: `#/disco/${album.id}` }, renderCard(album, { size: 'sm', tilt: true, lazy: true })),
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
  draw();
  return view;
}
