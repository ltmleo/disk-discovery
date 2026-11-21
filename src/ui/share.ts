import { track } from '../analytics';
import { h } from './dom';

/** Public site URL: shared links must be absolute and point at the static pages with previews. */
export const SITE_URL = 'https://ltmleo.github.io/disk-discovery/';

export interface ShareData {
  title: string;
  text: string;
  /** Absolute URL. */
  url: string;
  contentType: 'album' | 'site';
  itemId: string;
}

/**
 * "Compartilhar": the native share sheet where available (phones → WhatsApp, Telegram…),
 * otherwise copies the link. The link's page carries the Open Graph card (scripts/og-images.ts).
 */
export function shareButton(data: ShareData, label = 'Compartilhar'): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'btn btn--share',
      type: 'button',
      onclick: () => void share(data),
    },
    h('span', { class: 'btn__icon', 'aria-hidden': 'true' }, '↗'),
    label,
  );
}

async function share(data: ShareData): Promise<void> {
  const payload = { title: data.title, text: data.text, url: data.url };
  if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
    try {
      await navigator.share(payload);
      track('share', { method: 'web_share', content_type: data.contentType, item_id: data.itemId });
    } catch {
      /* user dismissed the sheet: nothing to do */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    toast('Link copiado! Cole no WhatsApp 💬');
    track('share', { method: 'copy', content_type: data.contentType, item_id: data.itemId });
  } catch {
    toast('Não foi possível copiar o link.');
  }
}

let toastTimer = 0;
function toast(message: string) {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('is-visible'), 2600);
}
