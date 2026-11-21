import './styles/base.css';
import './styles/card.css';
import './styles/pack.css';
import './styles/pages.css';
import { Collection } from './collection';
import { ALBUMS } from './data/albums';
import { h, ransom } from './ui/dom';
import { renderPackView } from './ui/pack';
import { renderGallery } from './ui/gallery';
import { renderDetail } from './ui/detail';

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
  ),
);
const main = h('main', { id: 'main', tabindex: '-1' });
app.replaceChildren(header, main);

/** Hash routing: works on GitHub Pages without a 404.html redirect hack. */
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const [, section, param] = path.split('/');
  let view: HTMLElement;
  let active = 'pack';
  if (section === 'galeria') {
    view = renderGallery(collection);
    active = 'gallery';
  } else if (section === 'disco' && param) {
    view = renderDetail(decodeURIComponent(param), collection);
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
