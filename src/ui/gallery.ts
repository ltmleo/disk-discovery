import type { Collection } from '../collection';
import type { Album, RarityId } from '../types';
import { ALBUMS, ALBUM_BY_ID } from '../data/albums';
import { RARITIES, rarityForRank } from '../rarity';
import { renderCard, cardBack, stars } from './card';
import { h, ransom } from './dom';
import { openInspect } from './inspect';
import { href } from '../router';
import { track, yesNo } from '../analytics';
import { prefetchContent } from '../data/content';
import { loadPreviews } from '../data/media';
import { prefetchPreview } from '../audio/preview';
import { norm } from '../net/match';

type Filter = RarityId | 'all';

/**
 * @param initialSpy spy mode shows every album, including ones not pulled yet.
 * It is read-only: it never touches the collection, and the state lives in the URL
 * (`/galeria?espiar`) so back/forward and the detail page keep it.
 */
export function renderGallery(collection: Collection, initialSpy = false): HTMLElement {
  let filter: Filter = 'all';
  let spy = initialSpy;
  let query = '';
  const grid = h('ul', { class: 'gallery', role: 'list' });
  const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtrar por raridade' });
  const sorted = [...ALBUMS].sort((a, b) => a.rank - b.rank);

  // Previews load in the background so a card opened from here can play right in the click.
  void loadPreviews().catch(() => undefined);

  /**
   * Items are built once per mode (spy changes how locked albums look) and filtering only
   * toggles `hidden`: rebuilding 500 animated cards per keystroke would be wasteful.
   */
  interface Item {
    album: Album;
    li: HTMLLIElement;
    owned: boolean;
    rarity: RarityId;
    haystack: string;
  }
  let items: Item[] = [];

  function buildItem(album: Album): Item {
    const entry = collection.get(album.id);
    const rarity = rarityForRank(album.rank);
    let li: HTMLLIElement;
    if (!entry && spy) {
      li = h(
        'li',
        { class: 'gallery__item is-spied' },
        h(
          'a',
          {
            class: 'gallery__link',
            href: href.album(album.id, true),
            'data-album': album.id,
            'data-spied': '1',
            'aria-label': `${album.title} (espiando, ainda não descoberto)`,
          },
          renderCard(album, { size: 'sm', motion: { range: 10 }, lazy: true }),
        ),
        h('span', { class: 'gallery__spy-tape', 'aria-hidden': 'true' }, 'ESPIANDO'),
      );
    } else if (!entry) {
      li = h(
        'li',
        { class: 'gallery__item is-locked' },
        h(
          'div',
          { class: `card card--sm card--locked card--${rarity.id}`, 'aria-label': `Disco #${album.rank} ainda não descoberto` },
          h('div', { class: 'card__tilt' }, h('div', { class: 'card__inner' }, cardBack())),
        ),
        h('p', { class: 'gallery__caption' }, `#${album.rank} · ??? · ${stars(rarity.stars)}`),
      );
    } else {
      li = h(
        'li',
        { class: 'gallery__item' },
        h(
          'a',
          { class: 'gallery__link', href: href.album(album.id), 'data-album': album.id, 'data-source': 'gallery' },
          renderCard(album, { size: 'sm', motion: { range: 14 }, lazy: true }),
        ),
        entry.count > 1 ? h('span', { class: 'gallery__count' }, `×${entry.count}`) : null,
      );
    }
    return { album, li, owned: !!entry, rarity: rarity.id, haystack: searchText(album) };
  }

  function rebuild() {
    items = sorted.map(buildItem);
    grid.replaceChildren(...items.map((i) => i.li));
    applyFilters();
  }

  function applyFilters() {
    const terms = queryTerms(query);
    let shown = 0;
    let lockedMatches = 0;
    for (const it of items) {
      const byRarity = filter === 'all' || it.rarity === filter;
      const byQuery = terms.length === 0 || matches(it, terms);
      // Without spy mode a search must not reveal locked albums by name: count them instead.
      const spoiler = terms.length > 0 && !it.owned && !spy;
      if (byRarity && byQuery && spoiler) lockedMatches++;
      const visible = byRarity && byQuery && !spoiler;
      it.li.hidden = !visible;
      if (visible) shown++;
    }
    for (const btn of chips.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
    }
    spyBtn.setAttribute('aria-pressed', String(spy));
    spyBtn.textContent = spy ? '🙈 Parar de espiar' : '👀 Espiar';
    view.classList.toggle('is-spying', spy);
    spyNote.hidden = !spy;
    clearBtn.hidden = query === '';

    resultLine.replaceChildren();
    if (terms.length) {
      resultLine.append(shown === 1 ? '1 disco encontrado' : `${shown} discos encontrados`);
      if (lockedMatches) {
        resultLine.append(
          ` · ${lockedMatches} ainda não descoberto${lockedMatches > 1 ? 's' : ''} `,
          h('button', { class: 'linklike', type: 'button', onclick: () => setSpy(true) }, 'espiar'),
        );
      }
    }
    empty.hidden = shown > 0;
    empty.textContent = terms.length ? 'Nenhum disco seu combina com essa busca.' : 'Nenhum disco nesta raridade ainda.';
  }

  function setSpy(next: boolean) {
    spy = next;
    // replaceState keeps the URL shareable without re-rendering the whole view.
    history.replaceState(null, '', href.gallery(spy));
    track('toggle_spy', { enabled: yesNo(spy) });
    rebuild();
  }

  const spyBtn = h('button', { class: 'chip chip--spy', type: 'button', onclick: () => setSpy(!spy) });
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
          applyFilters();
        },
      },
      label,
    );
  chips.append(chip('all', 'Todos'), ...RARITIES.map((r) => chip(r.id, `${stars(r.stars)} ${r.label}`)), spyBtn);

  /* ---------- Search ---------- */
  const input = h('input', {
    class: 'search__input',
    type: 'search',
    placeholder: 'Buscar disco, artista, ano ou #posição',
    'aria-label': 'Buscar na galeria',
    autocomplete: 'off',
    spellcheck: false,
  });
  const clearBtn = h('button', { class: 'search__clear', type: 'button', 'aria-label': 'Limpar busca', hidden: true }, '×');
  const resultLine = h('p', { class: 'search__result', 'aria-live': 'polite' });
  const empty = h('p', { class: 'clip clip--note gallery__empty', hidden: true });
  const search = h(
    'div',
    { class: 'search', role: 'search' },
    h('span', { class: 'search__icon', 'aria-hidden': 'true' }, '🔍'),
    input,
    clearBtn,
    h('kbd', { class: 'search__kbd', 'aria-hidden': 'true' }, '/'),
  );

  let debounce = 0;
  let reportTimer = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      query = input.value;
      applyFilters();
      // One analytics event per settled query, without the typed text (no free text in GA).
      clearTimeout(reportTimer);
      if (query.trim()) {
        reportTimer = window.setTimeout(() => {
          track('gallery_search', { has_results: yesNo(items.some((i) => !i.li.hidden)) });
        }, 1200);
      }
    }, 90);
  });
  const clear = () => {
    input.value = '';
    query = '';
    applyFilters();
    input.focus();
  };
  clearBtn.addEventListener('click', clear);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      clear();
    }
  });
  // "/" focuses the search from anywhere in the gallery (unless already typing somewhere).
  const onSlash = (e: KeyboardEvent) => {
    if (!view.isConnected) return document.removeEventListener('keydown', onSlash);
    const t = e.target as HTMLElement;
    if (e.key !== '/' || t.matches('input, textarea, [contenteditable]') || document.querySelector('.inspect')) return;
    e.preventDefault();
    input.focus();
  };
  document.addEventListener('keydown', onSlash);

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
    search,
    resultLine,
    chips,
    spyNote,
    empty,
    grid,
  );

  // Hover/focus on a card hints at what is next: warm its story chunk and its preview audio.
  const warm = (e: Event) => {
    const id = (e.target as Element).closest<HTMLElement>('a.gallery__link')?.dataset.album;
    const album = id ? ALBUM_BY_ID.get(id) : undefined;
    if (!album) return;
    prefetchContent(album.id);
    if (album.previewTrack) prefetchPreview(album, album.previewTrack);
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

  rebuild();
  return view;
}

/* ---------- Search helpers (pure) ---------- */

export function searchText(album: Album): string {
  return norm(`${album.title} ${album.artist} ${album.year} ${album.label}`);
}

/** A term is free text, or "#n" which means "exactly rank n" (nothing else). */
export type Term = string | { rank: number };

export function queryTerms(q: string): Term[] {
  const out: Term[] = [];
  for (const token of q.trim().split(/\s+/)) {
    const rank = /^#(\d{1,3})$/.exec(token);
    if (rank) out.push({ rank: Number(rank[1]) });
    else out.push(...norm(token).split(' ').filter(Boolean));
  }
  return out;
}

/** Every term must match. A bare number may also be the exact rank ("42"). */
function matches(it: { album: Album; haystack: string }, terms: Term[]): boolean {
  return terms.every((t) =>
    typeof t === 'object'
      ? it.album.rank === t.rank
      : (/^\d{1,3}$/.test(t) && Number(t) === it.album.rank) || it.haystack.includes(t),
  );
}

export function searchAlbums(albums: readonly Album[], q: string): Album[] {
  const terms = queryTerms(q);
  return albums.filter((album) => terms.length === 0 || matches({ album, haystack: searchText(album) }, terms));
}
