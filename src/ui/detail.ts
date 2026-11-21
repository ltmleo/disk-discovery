import type { Collection } from '../collection';
import { ALBUM_BY_ID } from '../data/albums';
import { rarityForRank } from '../rarity';
import { spotifyUrl } from '../cover';
import { renderCard, stars } from './card';
import { h, ransom } from './dom';
import { nowPlaying, onPlayer, playPreview, stopPreview } from '../audio/preview';
import { unlock } from '../audio/sfx';
import type { Album, AlbumContent } from '../types';
import { loadContent } from '../data/content';
import { href, takeSource } from '../router';
import { track } from '../analytics';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export function renderDetail(id: string, collection: Collection, spy = false): HTMLElement {
  const album = ALBUM_BY_ID.get(id);
  const entry = album && collection.get(album.id);

  // Locked or unknown: don't spoil the card unless the user chose to spy.
  if (!album || (!entry && !spy)) {
    return h(
      'section',
      { class: 'view view--locked' },
      h('h1', { class: 'headline' }, ransom('???')),
      h('p', { class: 'clip clip--note' }, 'Você ainda não descobriu esse disco. Abra pacotes para encontrá-lo.'),
      h('a', { class: 'btn btn--primary', href: href.pack() }, 'Abrir pacote'),
    );
  }

  const rarity = rarityForRank(album.rank);
  track('select_content', { content_type: 'album', content_id: album.id, rarity: rarity.id, source: takeSource() ?? 'direct' });
  return h(
    'section',
    { class: `view view--detail detail--${rarity.id}${entry ? '' : ' is-spied'}` },
    h('a', { class: 'back-link', href: href.gallery(spy) }, '← Galeria'),
    entry
      ? null
      : h('p', { class: 'clip clip--note detail__spy' }, '👀 Espiando: você ainda não tirou este disco. Abra pacotes para tê-lo na coleção.'),
    h(
      'div',
      { class: 'detail' },
      h(
        'aside',
        { class: 'detail__card' },
        renderCard(album, { size: 'lg', motion: { idle: true, gyro: true, range: 18 } }),
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
          entry ? h('dt', {}, 'Descoberto em') : null,
          entry ? h('dd', {}, dateFmt.format(new Date(entry.firstAt))) : null,
          h('dt', {}, 'Cópias'),
          h('dd', {}, entry ? String(entry.count) : '0 (espiando)'),
        ),
      ),
      h(
        'article',
        { class: 'detail__story' },
        h('p', { class: 'kicker' }, [album.artist, album.year, album.genre].filter(Boolean).join(' · ')),
        h('h1', { class: 'detail__title' }, album.title),
        album.tagline ? h('p', { class: 'detail__dek' }, album.tagline) : null,
        storyBody(album),
        h('p', { class: 'source' }, 'Ranking: Rolling Stone, “The 500 Greatest Albums of All Time” (2020). Capas: iTunes / Cover Art Archive.'),
      ),
    ),
  );
}

/**
 * Story sections render as a skeleton first; the album's content chunk is fetched
 * (usually already prefetched on reveal / hover) and swapped in when it arrives.
 */
function storyBody(album: Album): HTMLElement {
  const body = h('div', { class: 'story', 'aria-busy': 'true' }, skeleton());
  const load = () => {
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(skeleton());
    loadContent(album.id).then(
      (content) => {
        body.removeAttribute('aria-busy');
        const story = content.history?.length
          ? [
              h('h2', { class: 'section-label' }, 'A história'),
              h('div', { class: 'prose' }, content.history.map((p) => h('p', {}, p))),
            ]
          : [
              h(
                'p',
                { class: 'clip clip--note story__soon' },
                '✂ Resenha em breve: a história deste disco ainda está sendo recortada. Enquanto isso, ouça as faixas.',
              ),
            ];
        const sections: (HTMLElement | null)[] = [
          ...story,
          content.trivia?.length ? h('h2', { class: 'section-label' }, 'Curiosidades') : null,
          content.trivia?.length
            ? h('ul', { class: 'notes', role: 'list' }, content.trivia.map((t) => h('li', { class: 'note' }, t)))
            : null,
          h('h2', { class: 'section-label' }, 'Faixas'),
          content.tracks.length
            ? trackList(album, content)
            : h('p', { class: 'track__note' }, 'Lista de faixas indisponível.'),
        ];
        body.replaceChildren(...sections.filter((n): n is HTMLElement => n !== null));
      },
      () => {
        body.removeAttribute('aria-busy');
        body.replaceChildren(
          h(
            'p',
            { class: 'clip clip--note' },
            'Não foi possível carregar a história deste disco. ',
            h('button', { class: 'btn', type: 'button', onclick: load }, 'Tentar de novo'),
          ),
        );
      },
    );
  };
  load();
  return body;
}

function skeleton(): HTMLElement {
  return h(
    'div',
    { class: 'story__skeleton', 'aria-label': 'Carregando a história do disco' },
    h('span', { class: 'section-label' }, 'A história'),
    ...[92, 100, 84, 96, 60].map((w) => h('span', { class: 'skeleton-line', style: `width:${w}%` })),
  );
}

function trackList(album: Album, content: AlbumContent): HTMLElement {
  const rows = content.tracks.map((t) => {
    const btn = h(
      'button',
      {
        class: 'track__play',
        type: 'button',
        'aria-label': `Ouvir trecho de ${t.title}`,
        onclick: () => {
          unlock();
          const np = nowPlaying();
          const same = np?.album.id === album.id && np.track === t.title;
          if (same && (np.state === 'playing' || np.state === 'loading')) stopPreview();
          else playPreview(album, t.title, { source: 'tracklist' });
        },
      },
      '▶',
    );
    const row = h(
      'li',
      { class: `track${t.title === album.previewTrack ? ' track--featured' : ''}`, 'data-track': t.title },
      btn,
      h('span', { class: 'track__title' }, t.title),
      t.note ? h('p', { class: 'track__note' }, t.note) : null,
    );
    return { row, btn, title: t.title };
  });
  const list = h('ol', { class: 'tracks' }, rows.map((r) => r.row));

  // Reflect the shared player state; unsubscribes itself once the view is gone.
  const off = onPlayer((np) => {
    if (!list.isConnected && list.dataset.mounted) return off();
    list.dataset.mounted = '1';
    for (const r of rows) {
      const active = np?.album.id === album.id && np.track === r.title;
      const state = active ? np!.state : 'stopped';
      r.row.dataset.state = state;
      r.btn.textContent = state === 'playing' ? '■' : state === 'loading' ? '…' : '▶';
      r.btn.setAttribute('aria-label', `${state === 'playing' ? 'Parar' : 'Ouvir'} trecho de ${r.title}`);
    }
  });
  return list;
}
