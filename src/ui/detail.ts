import type { Collection } from '../collection';
import { ALBUM_BY_ID } from '../data/albums';
import { rarityForRank } from '../rarity';
import { spotifyUrl } from '../cover';
import { renderCard, stars } from './card';
import { h, ransom } from './dom';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export function renderDetail(id: string, collection: Collection): HTMLElement {
  const album = ALBUM_BY_ID.get(id);
  const entry = album && collection.get(album.id);

  // Locked or unknown: don't spoil the card. It has to be pulled first.
  if (!album || !entry) {
    return h(
      'section',
      { class: 'view view--locked' },
      h('h1', { class: 'headline' }, ransom('???')),
      h('p', { class: 'clip clip--note' }, 'Você ainda não descobriu esse disco. Abra pacotes para encontrá-lo.'),
      h('a', { class: 'btn btn--primary', href: '#/' }, 'Abrir pacote'),
    );
  }

  const rarity = rarityForRank(album.rank);
  return h(
    'section',
    { class: `view view--detail detail--${rarity.id}` },
    h('a', { class: 'back-link', href: '#/galeria' }, '← Galeria'),
    h(
      'div',
      { class: 'detail' },
      h(
        'aside',
        { class: 'detail__card' },
        renderCard(album, { size: 'lg', tilt: true }),
        h(
          'a',
          { class: 'btn btn--spotify', href: spotifyUrl(album), target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'btn__icon', 'aria-hidden': 'true' }, '●'),
          'Ouvir no Spotify',
        ),
        h(
          'dl',
          { class: 'detail__meta clip' },
          h('dt', {}, 'Raridade'),
          h('dd', {}, `${stars(rarity.stars)} ${rarity.label}`),
          h('dt', {}, 'Posição'),
          h('dd', {}, `#${album.rank} de 500`),
          h('dt', {}, 'Gravadora'),
          h('dd', {}, album.label),
          h('dt', {}, 'Descoberto em'),
          h('dd', {}, dateFmt.format(new Date(entry.firstAt))),
          h('dt', {}, 'Cópias'),
          h('dd', {}, String(entry.count)),
        ),
      ),
      h(
        'article',
        { class: 'detail__story' },
        h('p', { class: 'kicker' }, `${album.artist} · ${album.year} · ${album.genre}`),
        h('h1', { class: 'detail__title' }, album.title),
        h('p', { class: 'detail__dek' }, album.tagline),
        h('h2', { class: 'section-label' }, 'A história'),
        h('div', { class: 'prose' }, album.history.map((p) => h('p', {}, p))),
        h('h2', { class: 'section-label' }, 'Curiosidades'),
        h('ul', { class: 'notes', role: 'list' }, album.trivia.map((t) => h('li', { class: 'note' }, t))),
        h('h2', { class: 'section-label' }, 'Faixas'),
        h(
          'ol',
          { class: 'tracks' },
          album.tracks.map((t) =>
            h(
              'li',
              { class: 'track' },
              h('span', { class: 'track__title' }, t.title),
              t.note ? h('p', { class: 'track__note' }, t.note) : null,
            ),
          ),
        ),
        h('p', { class: 'source' }, 'Ranking: Rolling Stone, “The 500 Greatest Albums of All Time” (2020). Capas: Cover Art Archive.'),
      ),
    ),
  );
}
