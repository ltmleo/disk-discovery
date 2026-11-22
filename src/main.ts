import './styles/base.css';
import './styles/card.css';
import './styles/pack.css';
import './styles/pages.css';
import { Collection } from './collection';
import { ALBUMS, ALBUM_BY_ID } from './data/albums';
import { href, startRouter, type Route } from './router';
import { setPlayerProfile, track, yesNo } from './analytics';
import { h, ransom } from './ui/dom';
import { renderPackView } from './ui/pack';
import { renderGallery } from './ui/gallery';
import { renderRoadmap } from './ui/roadmap';
import { renderDetail } from './ui/detail';
import { isMuted, onMuteChange, setMuted } from './audio/settings';
import { onPlayer, stopPreview } from './audio/preview';
import { unlock } from './audio/sfx';

const collection = new Collection();
const app = document.getElementById('app')!;

const counter = h('span', { class: 'nav__count' });
const updateCounter = () => {
  const found = ALBUMS.filter((a) => collection.has(a.id)).length;
  counter.textContent = `${found}/${ALBUMS.length}`;
};

const header = h(
  'header',
  { class: 'masthead' },
  h(
    'div',
    { class: 'masthead__brand' },
    h('a', { class: 'masthead__logo', href: href.pack() }, ransom('DISK DISCOVERY')),
    // The app is a preview: the sticker says so on every page and leads to the roadmap.
    h('a', { class: 'masthead__badge', href: href.roadmap(), 'data-source': 'badge', title: 'O que é a prévia e o que vem por aí' }, 'Prévia'),
  ),
  h(
    'nav',
    { class: 'nav', 'aria-label': 'Principal' },
    h('a', { class: 'nav__link', href: href.pack(), 'data-route': 'pack' }, 'Abrir pacote'),
    h('a', { class: 'nav__link', href: href.gallery(), 'data-route': 'gallery' }, 'Galeria ', counter),
    muteButton(),
  ),
);

function muteButton(): HTMLElement {
  const btn = h('button', {
    class: 'nav__mute',
    type: 'button',
    onclick: () => {
      unlock();
      setMuted(!isMuted());
      track('toggle_sound', { enabled: yesNo(!isMuted()) });
    },
  });
  const sync = (m: boolean) => {
    btn.textContent = m ? '🔇' : '🔊';
    btn.setAttribute('aria-label', m ? 'Ativar som' : 'Silenciar');
    btn.setAttribute('aria-pressed', String(m));
  };
  sync(isMuted());
  onMuteChange(sync);
  return btn;
}

/** Global "now playing" strip: one subscription for the whole app, survives route changes. */
function nowPlayingBar(): HTMLElement {
  const label = h('span', { class: 'np__label' });
  const bar = h(
    'div',
    { class: 'np', role: 'status', 'aria-live': 'polite', hidden: true },
    h('span', { class: 'np__disc', 'aria-hidden': 'true' }),
    label,
    h('button', { class: 'np__stop', type: 'button', onclick: () => stopPreview(), 'aria-label': 'Parar música' }, '■'),
  );
  let hideTimer = 0;
  onPlayer((np) => {
    clearTimeout(hideTimer);
    if (!np || np.state === 'stopped') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.dataset.state = np.state;
    label.textContent =
      np.state === 'unavailable'
        ? `Prévia indisponível: ${np.track}`
        : `${np.state === 'loading' ? 'Carregando' : 'Tocando'}: ${np.track} · ${np.album.artist}`;
    if (np.state === 'unavailable') hideTimer = window.setTimeout(() => (bar.hidden = true), 3000);
  });
  return bar;
}
const main = h('main', { id: 'main', tabindex: '-1' });
const footer = h(
  'footer',
  { class: 'site-footer' },
  // Same-tab link: it is another site of the same ecosystem (skill ltm-novo-site).
  h('a', { href: href.roadmap() }, 'Prévia · Em breve'),
  h('span', { 'aria-hidden': 'true' }, ' · '),
  h('a', { href: 'https://ltmleo.github.io/#sites' }, 'Mais de @ltmleo'),
  h('span', { 'aria-hidden': 'true' }, ' · '),
  h('a', { href: 'https://github.com/ltmleo/disk-discovery', target: '_blank', rel: 'noopener' }, 'Código no GitHub'),
);
app.replaceChildren(header, main, footer, nowPlayingBar());

const SITE = 'Disk Discovery';

function titleFor(route: Route): string {
  if (route.name === 'gallery') return `Galeria · ${SITE}`;
  if (route.name === 'roadmap') return `Em breve · ${SITE}`;
  if (route.name === 'album') {
    const album = ALBUM_BY_ID.get(route.id);
    // Not-yet-pulled albums keep a neutral title (no spoilers in tabs/history) unless spying.
    if (album && (route.spy || collection.has(album.id))) return `${album.title} · ${album.artist} · ${SITE}`;
    return `Disco bloqueado · ${SITE}`;
  }
  return `${SITE} · Abra um pacote`;
}

function render(route: Route) {
  let view: HTMLElement;
  let active = 'pack';
  if (route.name === 'gallery') {
    view = renderGallery(collection, route.spy);
    active = 'gallery';
  } else if (route.name === 'album') {
    view = renderDetail(route.id, collection, route.spy);
    active = 'gallery';
  } else if (route.name === 'roadmap') {
    view = renderRoadmap();
    active = 'roadmap';
  } else {
    view = renderPackView(collection, updateCounter);
  }
  for (const a of header.querySelectorAll<HTMLElement>('[data-route]')) {
    if (a.dataset.route === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  main.replaceChildren(view);
  window.scrollTo({ top: 0 });
}

updateCounter();
setPlayerProfile(collection.uniqueCount);
startRouter({ render, title: titleFor });
