import './styles/base.css';
import './styles/card.css';
import './styles/pack.css';
import './styles/pages.css';
import { Collection } from './collection';
import { ALBUMS } from './data/albums';
import { h, ransom } from './ui/dom';
import { renderPackView } from './ui/pack';
import { renderGallery, SPY_PARAM } from './ui/gallery';
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
  h('a', { class: 'masthead__logo', href: '#/' }, ransom('DISK DISCOVERY')),
  h(
    'nav',
    { class: 'nav', 'aria-label': 'Principal' },
    h('a', { class: 'nav__link', href: '#/', 'data-route': 'pack' }, 'Abrir pacote'),
    h('a', { class: 'nav__link', href: '#/galeria', 'data-route': 'gallery' }, 'Galeria ', counter),
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
  h('a', { href: 'https://ltmleo.github.io/#sites' }, 'Mais de @ltmleo'),
  h('span', { 'aria-hidden': 'true' }, ' · '),
  h('a', { href: 'https://github.com/ltmleo/disk-discovery', target: '_blank', rel: 'noopener' }, 'Código no GitHub'),
);
app.replaceChildren(header, main, footer, nowPlayingBar());

/** Hash routing: works on GitHub Pages without a 404.html redirect hack. */
function route() {
  const [path = '/', query = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  const [, section, param] = path.split('/');
  const spy = new URLSearchParams(query).has(SPY_PARAM);
  let view: HTMLElement;
  let active = 'pack';
  if (section === 'galeria') {
    view = renderGallery(collection, spy);
    active = 'gallery';
  } else if (section === 'disco' && param) {
    view = renderDetail(decodeURIComponent(param), collection, spy);
    active = 'gallery';
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

window.addEventListener('hashchange', route);
updateCounter();
route();
