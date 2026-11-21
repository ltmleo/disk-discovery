import type { Album } from '../types';
import { rarityForRank } from '../rarity';
import { renderCard, motionOf } from './card';
import { h, prefersReducedMotion } from './dom';
import { enableGyro, recalibrateGyro } from './motion';
import { track } from '../analytics';

/**
 * "Pick up the card": the gallery card flies to the centre spinning (FLIP animation:
 * measure both rects, animate the transform between them), then stays large and
 * interactive with idle sway and gyroscope. Closing flies it back to its slot.
 */
export function openInspect(album: Album, from: HTMLElement, opts: { href: string; spied: boolean }): void {
  const rarity = rarityForRank(album.rank);
  track('inspect_card', { content_id: album.id, rarity: rarity.id });
  const card = renderCard(album, { size: 'lg', motion: { idle: true, gyro: true, range: 22 } });
  const close = h('button', { class: 'btn inspect__close', type: 'button' }, 'Fechar');
  const overlay = h(
    'div',
    {
      class: `inspect inspect--${rarity.id}${opts.spied ? ' is-spied' : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': `${album.title}, ${album.artist}`,
    },
    h('div', { class: 'inspect__backdrop' }),
    h('div', { class: 'inspect__stage' }, card),
    h(
      'div',
      { class: 'inspect__actions' },
      opts.spied ? h('p', { class: 'inspect__note' }, '👀 Espiando: este disco ainda não é seu.') : null,
      h('a', { class: 'btn btn--primary', href: opts.href, 'data-source': 'inspect' }, 'Ler a história'),
      close,
    ),
  );

  const returnFocus = document.activeElement as HTMLElement | null;
  document.body.append(overlay);
  document.documentElement.classList.add('is-inspecting');
  from.style.visibility = 'hidden';
  enableGyro(); // the click that opened this is a user gesture (iOS permission)
  recalibrateGyro();
  close.focus({ preventScroll: true });

  const reduced = prefersReducedMotion();
  const flight = (reverse: boolean) => {
    const a = from.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const s = a.width / b.width;
    const frames: Keyframe[] = [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotateY(0deg)` },
      { transform: 'translate(0, 0) scale(1.06) rotateY(300deg)', offset: 0.75 },
      { transform: 'translate(0, 0) scale(1) rotateY(360deg)' },
    ];
    return card.animate(reverse ? [...frames].reverse() : frames, {
      duration: reduced ? 0 : reverse ? 450 : 850,
      easing: reverse ? 'cubic-bezier(.5,0,.75,0)' : 'cubic-bezier(.2,.8,.2,1)',
    });
  };
  flight(false);

  let closing = false;
  const dismiss = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('is-closing');
    motionOf(card)?.destroy();
    flight(true).finished.finally(() => {
      overlay.remove();
      from.style.visibility = '';
      document.documentElement.classList.remove('is-inspecting');
      returnFocus?.focus({ preventScroll: true });
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', dismiss);
  overlay.querySelector('.inspect__backdrop')!.addEventListener('click', dismiss);
  // Following the link navigates away; clean up without the return flight.
  overlay.querySelector('a')!.addEventListener('click', () => {
    motionOf(card)?.destroy();
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('is-inspecting');
    overlay.remove();
  });
}
