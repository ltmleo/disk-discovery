/**
 * Path-based routing (History API) under Vite's BASE_URL, e.g. /disk-discovery/galeria.
 *
 * Why not hash routes: GA4 drops the URL fragment from page_path, so every "#/..." view
 * reported as the home page. With real paths, GA's enhanced measurement turns each
 * pushState into a page_view with the right path and title, no manual page_view needed.
 *
 * GitHub Pages has no rewrites: the build copies index.html to 404.html so deep links boot
 * the app. Old "#/..." links are rewritten by an inline script in index.html before GA loads.
 */
export const BASE = import.meta.env.BASE_URL; // '/disk-discovery/'
export const SPY_PARAM = 'espiar';

export type Route =
  | { name: 'pack' }
  | { name: 'gallery'; spy: boolean }
  | { name: 'album'; id: string; spy: boolean }
  | { name: 'roadmap' };

export const href = {
  pack: () => BASE,
  roadmap: () => `${BASE}em-breve/`,
  gallery: (spy = false) => `${BASE}galeria/${spy ? `?${SPY_PARAM}` : ''}`,
  // Trailing slash: these paths are real static pages (scripts/static-pages.ts); without it
  // GitHub Pages answers a 301 first.
  album: (id: string, spy = false) => `${BASE}disco/${encodeURIComponent(id)}/${spy ? `?${SPY_PARAM}` : ''}`,
};

export function parse(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  const [section, param] = rest.split('/').filter(Boolean);
  const spy = new URLSearchParams(search).has(SPY_PARAM);
  if (section === 'galeria') return { name: 'gallery', spy };
  if (section === 'em-breve') return { name: 'roadmap' };
  if (section === 'disco' && param) return { name: 'album', id: decodeURIComponent(param), spy };
  return { name: 'pack' };
}

/** "#/disco/x?espiar" → "/disk-discovery/disco/x?espiar" (mirrors the inline script in index.html). */
export function fromLegacyHash(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  return BASE + hash.slice(2);
}

/** Where the user came from when a navigation happened; read once by the next view (analytics). */
let pendingSource: string | null = null;
export const takeSource = (): string | null => {
  const s = pendingSource;
  pendingSource = null;
  return s;
};

type Render = (route: Route) => void;
let render: Render = () => undefined;
let titleFor: (route: Route) => string = () => document.title;

export function navigate(url: string, opts: { replace?: boolean; source?: string } = {}): void {
  const u = new URL(url, location.href);
  const route = parse(u.pathname, u.search);
  pendingSource = opts.source ?? null;
  // Title first: GA reads document.title when it records the history-change page_view.
  document.title = titleFor(route);
  if (opts.replace) history.replaceState(null, '', u.pathname + u.search);
  else history.pushState(null, '', u.pathname + u.search);
  render(route);
}

export function startRouter(opts: { render: Render; title: (route: Route) => string }): void {
  render = opts.render;
  titleFor = opts.title;

  addEventListener('popstate', () => {
    pendingSource = 'back';
    const route = parse(location.pathname, location.search);
    document.title = titleFor(route);
    render(route);
  });

  // Same-origin links inside the app become client-side navigations (plain left clicks only).
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search) return;
    navigate(url.href, { source: a.dataset.source });
  });

  pendingSource = 'direct';
  const route = parse(location.pathname, location.search);
  document.title = titleFor(route);
  render(route);
}
