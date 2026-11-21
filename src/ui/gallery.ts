import type { Collection } from '../collection';
import type { RarityId } from '../types';
import { ALBUMS } from '../data/albums';
import { RARITIES, rarityForRank } from '../rarity';
import { renderCard, cardBack, stars } from './card';
import { h, ransom } from './dom';

type Filter = RarityId | 'all';

export function renderGallery(collection: Collection): HTMLElement {
  let filter: Filter = 'all';
  const grid = h('ul', { class: 'gallery', role: 'list' });
  const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtrar por raridade' });

  const sorted = [...ALBUMS].sort((a, b) => a.rank - b.rank);

  function draw() {
    const items = sorted.filter((a) => filter === 'all' || rarityForRank(a.rank).id === filter);
    grid.replaceChildren(
      ...items.map((album) => {
        const entry = collection.get(album.id);
        const rarity = rarityForRank(album.rank);
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
    for (const btn of chips.querySelectorAll<HTMLButtonElement>('button')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
    }
  }

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
  chips.append(chip('all', 'Todos'), ...RARITIES.map((r) => chip(r.id, `${stars(r.stars)} ${r.label}`)));

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
    grid,
  );
  draw();
  return view;
}
