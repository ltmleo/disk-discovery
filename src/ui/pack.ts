import type { Album } from '../types';
import type { Collection } from '../collection';
import { ALBUMS } from '../data/albums';
import { drawAlbum } from '../draw';
import { rarityForRank } from '../rarity';
import { renderCard, attachMotion, stars } from './card';
import { enableGyro, recalibrateGyro } from './motion';
import { h, prefersReducedMotion, ransom, wait } from './dom';
import * as sfx from '../audio/sfx';
import { playPreview, prefetchPreview, stopPreview } from '../audio/preview';
import { preloadArt } from '../cover';
import { prefetchContent } from '../data/content';
import { href } from '../router';
import { shareButton, SITE_URL } from './share';
import { haptic } from './haptics';
import { achievementsFor, setPlayerProfile, track, yesNo } from '../analytics';

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

/** Vibration on reveal, by rarity (ms on/off). */
const HAPTIC: Record<string, number[]> = {
  common: [15],
  uncommon: [20],
  rare: [30, 40, 30],
  epic: [40, 40, 60],
  legendary: [60, 50, 60, 50, 120],
};

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
    if (album.previewTrack) prefetchPreview(album, album.previewTrack);
  };

  const setPhase = (p: Phase) => {
    phase = p;
    stage.dataset.phase = p;
  };

  function mountPack() {
    setPhase('sealed');
    prepareNext();
    stage.removeAttribute('data-rarity');
    stage.replaceChildren(
      buildPack({
        onGrip: () => {
          sfx.unlock();
          // The light leaking through the tear takes the rarity colour, like a booster's glow.
          stage.dataset.rarity = rarityForRank(next!.album.rank).id;
        },
        onProgress: (p) => {
          sfx.tearGrain(p);
          haptic(6);
        },
        onTear: () => void tear(),
      }),
    );
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
    haptic([25, 30, 15]);
    stopPreview(300);

    const { album, art } = next!;
    // Likely next step is "Ler a história": fetch its text while the card is revealed.
    prefetchContent(album.id);
    const rarity = rarityForRank(album.rank);
    const uniqueBefore = collection.uniqueCount;
    const sameRarityBefore = ALBUMS.filter((a) => collection.has(a.id) && rarityForRank(a.rank).id === rarity.id).length;
    const { isNew, entry } = collection.add(album.id);
    onChange();

    track('open_pack', { rarity: rarity.id, new_card: yesNo(isNew) });
    for (const id of achievementsFor({ isNew, rarity: rarity.id, uniqueBefore, uniqueAfter: collection.uniqueCount, sameRarityBefore })) {
      track('unlock_achievement', { achievement_id: id });
    }
    if (isNew) setPlayerProfile(collection.uniqueCount);
    const pack = stage.querySelector<HTMLElement>('.pack')!;
    pack.classList.add('is-torn');
    stage.dataset.rarity = rarity.id;
    status.textContent = 'Algo está saindo do pacote…';

    const reduced = prefersReducedMotion();
    // Let the strip fly off; if the art is still downloading, give it a little extra time
    // so the card comes out with its cover already painted.
    await Promise.all([wait(reduced ? 0 : 380), Promise.race([art, wait(1800)])]);

    // The card rises out of the opening (it sits behind the pack front), peeks out,
    // then the pack falls away and the card settles in the middle of the stage.
    const card = renderCard(album, { faceDown: true, size: 'lg' });
    const slot = h(
      'button',
      { class: 'reveal-slot', type: 'button', 'aria-label': 'Revelar disco', disabled: true },
      card,
    );
    stage.append(slot);
    if (!reduced) {
      slot.classList.add('is-rising');
      sfx.rustle();
      await wait(700);
      pack.classList.add('is-dropping');
      slot.classList.replace('is-rising', 'is-settling');
      sfx.whoosh();
      await wait(550);
      slot.classList.remove('is-settling');
    }
    pack.remove();
    setPhase('facedown');

    // Anticipation: the card back glows/shakes according to rarity before it can be flipped.
    card.classList.add('is-charging');
    const suspense = reduced ? 0 : SUSPENSE_MS[rarity.id] ?? 300;
    sfx.charge(rarity.id, suspense || 200);
    const sparks = reduced ? null : converge(stage, rarity.id, suspense);
    if (rarity.id === 'epic' || rarity.id === 'legendary') haptic([20, 120, 20, 90, 20, 60, 20]);
    await wait(suspense);
    sparks?.remove();
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
    track('reveal_card', { rarity: rarity.id, new_card: yesNo(isNew) });
    // Everything up to the first await runs inside the click gesture (autoplay rules).
    sfx.flip();
    sfx.impact(rarity.id);
    sfx.reveal(rarity.id);
    haptic(HAPTIC[rarity.id] ?? [15]);
    enableGyro(); // iOS asks for motion permission, which needs this click gesture
    recalibrateGyro();
    if (album.previewTrack) playPreview(album, album.previewTrack, { delayMs: FANFARE_MS[rarity.id], maxMs: 20_000, source: 'reveal' });
    card.classList.remove('is-facedown', 'is-emerging');
    card.classList.add('is-flipping');
    if (!prefersReducedMotion()) {
      burst(stage, rarity.id);
      if (rarity.id === 'epic' || rarity.id === 'legendary') quake(view, rarity.id);
    }

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
      h('a', { class: 'btn btn--primary', href: href.album(album.id), 'data-source': 'reveal' }, 'Ler a história'),
      shareButton({
        title: `${album.title} · ${album.artist}`,
        text: `Tirei ${stars(rarity.stars)} ${rarity.label} no Disk Discovery: ${album.title}, de ${album.artist} (#${album.rank} dos 500)!`,
        // ?espiar: whoever opens the link can see the album without having pulled it.
        url: `${SITE_URL}disco/${album.id}/?espiar`,
        contentType: 'album',
        itemId: album.id,
      }),
      h('button', { class: 'btn', type: 'button', onclick: mountPack }, 'Abrir outro pacote'),
    );
  }

  mountPack();
  return view;
}

interface PackHandlers {
  /** First touch on the strip (unlock audio, pick the light colour). */
  onGrip: () => void;
  /** Called every few percent of drag progress (0..1), for crinkle sounds. */
  onProgress: (progress: number) => void;
  onTear: () => void;
}

const TEAR_AT = 0.55;

function buildPack({ onGrip, onProgress, onTear }: PackHandlers): HTMLElement {
  const strip = h(
    'div',
    { class: 'pack__strip', 'aria-hidden': 'true' },
    h('span', { class: 'pack__scissors' }, '✂'),
  );
  const pack = h(
    'div',
    { class: 'pack' },
    // Light leaking through the gap as the strip peels off.
    h('div', { class: 'pack__light', 'aria-hidden': 'true' }),
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
  let lastStep = 0;
  strip.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    lastStep = 0;
    strip.setPointerCapture(e.pointerId);
    pack.classList.add('is-gripped');
    onGrip();
  });
  strip.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const progress = Math.max(0, Math.min(1, Math.abs(e.clientX - startX) / strip.clientWidth / TEAR_AT));
    pack.style.setProperty('--tear', progress.toFixed(3));
    // A crinkle every ~7% of the way, not on every pointer event.
    const step = Math.floor(progress * 14);
    if (step > lastStep) {
      lastStep = step;
      onProgress(progress);
    }
    if (progress >= 1) {
      startX = null;
      onTear();
    }
  });
  const cancel = () => {
    if (startX === null) return;
    startX = null;
    pack.classList.remove('is-gripped');
    pack.style.setProperty('--tear', '0');
  };
  strip.addEventListener('pointerup', cancel);
  strip.addEventListener('pointercancel', cancel);
  return pack;
}

/** Sparks drawn in towards the face-down card while it charges (rare and up). */
function converge(stage: HTMLElement, rarity: string, ms: number): HTMLElement | null {
  const count = { rare: 10, epic: 18, legendary: 28 }[rarity];
  if (!count || ms <= 0) return null;
  const fx = h('div', { class: `fx fx--${rarity} fx--charge`, 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    // Within reach of a phone screen: the card itself is ~330px wide.
    const dist = 150 + Math.random() * 110;
    fx.append(
      h('span', {
        class: 'fx__spark',
        style: [
          `--sx:${Math.cos(angle) * dist}px`,
          `--sy:${Math.sin(angle) * dist}px`,
          `--d:${((Math.random() * Math.min(ms, 900)) / 1000) * 0.4}s`,
          `--t:${0.35 + Math.random() * 0.3}s`,
        ].join(';'),
      }),
    );
  }
  stage.append(fx);
  return fx;
}

/** Screen shake on the biggest pulls. */
function quake(view: HTMLElement, rarity: string) {
  const cls = rarity === 'legendary' ? 'is-quake-lg' : 'is-quake';
  view.classList.remove('is-quake', 'is-quake-lg');
  void view.offsetWidth;
  view.classList.add(cls);
  setTimeout(() => view.classList.remove(cls), 700);
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
