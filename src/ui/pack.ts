import type { Album } from '../types';
import type { Collection } from '../collection';
import { ALBUMS } from '../data/albums';
import { drawAlbum } from '../draw';
import { rarityForRank } from '../rarity';
import { renderCard, attachMotion } from './card';
import { enableGyro, recalibrateGyro } from './motion';
import { h, prefersReducedMotion, ransom, wait } from './dom';
import * as sfx from '../audio/sfx';
import { playPreview, prefetchPreview, stopPreview } from '../audio/preview';
import { preloadArt } from '../cover';

type Phase = 'sealed' | 'tearing' | 'facedown' | 'revealed';

/** Timings per rarity: rarer cards build more anticipation before the flip is allowed. */
const SUSPENSE_MS: Record<string, number> = {
  common: 250,
  uncommon: 400,
  rare: 700,
  epic: 1100,
  legendary: 1600,
};

/**
 * A multi-turn flip ends at -360deg, visually identical to 0. Snap back to 0 with
 * transitions off, so later tilts start from a clean state.
 */
function settleFlip(card: HTMLElement) {
  card.classList.add('no-flip-transition');
  card.classList.remove('is-flipping');
  void card.offsetWidth; // commit the style change before re-enabling transitions
  requestAnimationFrame(() => card.classList.remove('no-flip-transition'));
}

/** Lets the reveal sting play out before the music fades in. */
const FANFARE_MS: Record<string, number> = {
  common: 300,
  uncommon: 400,
  rare: 600,
  epic: 900,
  legendary: 1600,
};

const SCRAP_COLORS = ['#e63b2e', '#f5c400', '#1f4fd1', '#111', '#f4ecd8', '#ff7aa8', '#2aa876'];

export function renderPackView(collection: Collection, onChange: () => void): HTMLElement {
  const stage = h('div', { class: 'stage', 'data-phase': 'sealed' });
  const status = h('p', { class: 'stage__status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'stage__actions' });
  const view = h(
    'section',
    { class: 'view view--pack' },
    h(
      'div',
      { class: 'pack-intro' },
      h('h1', { class: 'headline' }, ransom('ABRA UM DISCO')),
      h(
        'p',
        { class: 'clip clip--note' },
        'Cada pacote traz 1 disco da lista dos 500 maiores álbuns da Rolling Stone (2020). Quanto mais alto no ranking, mais raro.',
      ),
    ),
    stage,
    status,
    actions,
  );

  let phase: Phase = 'sealed';
  // The next pull is drawn as soon as the pack is shown, so its artwork and preview
  // download while the user is still looking at / tearing the pack.
  let next: { album: Album; art: Promise<string | null> } | null = null;

  const prepareNext = () => {
    const album = drawAlbum(ALBUMS);
    next = { album, art: preloadArt(album, 600, 'high') };
    prefetchPreview(album, album.previewTrack);
  };

  const setPhase = (p: Phase) => {
    phase = p;
    stage.dataset.phase = p;
  };

  function mountPack() {
    setPhase('sealed');
    prepareNext();
    stage.removeAttribute('data-rarity');
    stage.replaceChildren(buildPack(tear));
    status.textContent = 'Arraste pela linha pontilhada para rasgar o pacote.';
    actions.replaceChildren(
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => void tear() }, 'Rasgar pacote'),
    );
  }

  async function tear() {
    if (phase !== 'sealed') return;
    setPhase('tearing');
    actions.replaceChildren();
    sfx.unlock();
    sfx.tear();
    stopPreview(300);

    const { album, art } = next!;
    const { isNew, entry } = collection.add(album.id);
    onChange();

    const rarity = rarityForRank(album.rank);
    const pack = stage.querySelector<HTMLElement>('.pack')!;
    pack.classList.add('is-torn');
    stage.dataset.rarity = rarity.id;
    status.textContent = 'Algo está saindo do pacote…';

    const reduced = prefersReducedMotion();
    // Let the tear animation play; if the art is still downloading, give it a little
    // extra time so the card comes out with its cover already painted.
    await Promise.all([wait(reduced ? 0 : 650), Promise.race([art, wait(1800)])]);

    const card = renderCard(album, { faceDown: true, size: 'lg' });
    card.classList.add('is-emerging');
    const slot = h(
      'button',
      { class: 'reveal-slot', type: 'button', 'aria-label': 'Revelar disco', disabled: true },
      card,
    );
    stage.append(slot);
    sfx.whoosh();
    await wait(reduced ? 0 : 500);
    pack.remove();
    setPhase('facedown');

    // Anticipation: the card back glows/shakes according to rarity before it can be flipped.
    card.classList.add('is-charging');
    const suspense = reduced ? 0 : SUSPENSE_MS[rarity.id] ?? 300;
    sfx.charge(rarity.id, suspense || 200);
    await wait(suspense);
    card.classList.remove('is-charging');
    slot.disabled = false;
    status.textContent = 'Toque na carta para revelar.';
    slot.focus({ preventScroll: true });

    slot.addEventListener(
      'click',
      () => {
        if (phase !== 'facedown') return;
        void reveal(slot, card, album, isNew, entry.count);
      },
      { once: true },
    );
  }

  async function reveal(slot: HTMLButtonElement, card: HTMLElement, album: Album, isNew: boolean, count: number) {
    setPhase('revealed');
    const rarity = rarityForRank(album.rank);
    // Everything up to the first await runs inside the click gesture (autoplay rules).
    sfx.flip();
    sfx.reveal(rarity.id);
    enableGyro(); // iOS asks for motion permission, which needs this click gesture
    recalibrateGyro();
    playPreview(album, album.previewTrack, { delayMs: FANFARE_MS[rarity.id], maxMs: 20_000 });
    card.classList.remove('is-facedown', 'is-emerging');
    card.classList.add('is-flipping');
    if (!prefersReducedMotion()) burst(stage, rarity.id);

    // Legendary cards spin one and a half turns before settling (see .card--legendary.is-flipping).
    await wait(prefersReducedMotion() ? 0 : rarity.id === 'legendary' ? 1250 : 750);
    settleFlip(card);
    card.classList.remove('is-flipping');
    // Shine sweep across the freshly revealed card, then idle sway / gyroscope.
    attachMotion(card, { idle: true, gyro: true, range: 18 }).sweep();

    // Replace the button wrapper with a plain container so the revealed card isn't an inert button.
    const holder = h('div', { class: 'reveal-slot is-done' }, card);
    slot.replaceWith(holder);
    if (isNew) sfx.stamp();
    holder.append(
      isNew
        ? h('span', { class: 'stamp stamp--new' }, 'NOVO!')
        : h('span', { class: 'stamp stamp--dupe' }, `×${count}`),
    );

    status.textContent = `${rarity.label}! ${album.title}, de ${album.artist} (#${album.rank}).`;
    actions.replaceChildren(
      h('a', { class: 'btn btn--primary', href: `#/disco/${album.id}` }, 'Ler a história'),
      h('button', { class: 'btn', type: 'button', onclick: mountPack }, 'Abrir outro pacote'),
    );
  }

  mountPack();
  return view;
}

function buildPack(onTear: () => void): HTMLElement {
  const strip = h(
    'div',
    { class: 'pack__strip', 'aria-hidden': 'true' },
    h('span', { class: 'pack__scissors' }, '✂'),
  );
  const pack = h(
    'div',
    { class: 'pack' },
    strip,
    h(
      'div',
      { class: 'pack__body' },
      h('span', { class: 'pack__tape pack__tape--a', 'aria-hidden': 'true' }),
      h('span', { class: 'pack__tape pack__tape--b', 'aria-hidden': 'true' }),
      h('div', { class: 'pack__logo' }, ransom('DISK'), ransom('DISCOVERY')),
      h('div', { class: 'pack__sub' }, 'Booster · 1 disco'),
      h('div', { class: 'pack__vinyl', 'aria-hidden': 'true' }),
      h('div', { class: 'pack__odds' }, 'de ★ a ★★★★★'),
    ),
  );

  // Drag-to-tear along the top strip. Click on the button is the accessible fallback.
  let startX: number | null = null;
  strip.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    strip.setPointerCapture(e.pointerId);
  });
  strip.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const progress = Math.max(0, Math.min(1, Math.abs(e.clientX - startX) / strip.clientWidth));
    pack.style.setProperty('--tear', String(progress));
    if (progress > 0.55) {
      startX = null;
      onTear();
    }
  });
  const cancel = () => {
    startX = null;
    pack.style.setProperty('--tear', '0');
  };
  strip.addEventListener('pointerup', cancel);
  strip.addEventListener('pointercancel', cancel);
  return pack;
}

/** Rarity-scaled celebration: light rays from rare up, paper scraps from epic, flash for legendary. */
function burst(stage: HTMLElement, rarity: string) {
  const fx = h('div', { class: `fx fx--${rarity}`, 'aria-hidden': 'true' });
  if (rarity !== 'common') fx.append(h('div', { class: 'fx__ring' }));
  if (['rare', 'epic', 'legendary'].includes(rarity)) fx.append(h('div', { class: 'fx__rays' }));
  if (rarity === 'legendary') fx.append(h('div', { class: 'fx__flash' }));

  const scraps = { common: 0, uncommon: 8, rare: 16, epic: 32, legendary: 60 }[rarity] ?? 0;
  for (let i = 0; i < scraps; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * 260;
    fx.append(
      h('span', {
        class: 'fx__scrap',
        style: [
          `--dx:${Math.cos(angle) * dist}px`,
          `--dy:${Math.sin(angle) * dist - 80}px`,
          `--rot:${Math.random() * 720 - 360}deg`,
          `--c:${SCRAP_COLORS[i % SCRAP_COLORS.length]}`,
          `--w:${6 + Math.random() * 14}px`,
          `--h:${4 + Math.random() * 10}px`,
          `--d:${Math.random() * 0.25}s`,
        ].join(';'),
      }),
    );
  }
  stage.append(fx);
  setTimeout(() => fx.remove(), 2600);
}
