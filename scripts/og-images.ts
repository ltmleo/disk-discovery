/**
 * Generates the Open Graph share images (1200×630 JPEG) shown by WhatsApp, Telegram, X…:
 *   dist/og/site.jpg       the site card
 *   dist/og/<album-id>.jpg one card per album (cover, rarity frame, title, rank)
 * Runs after `vite build` (see the deploy workflow); output is not committed.
 *
 *   npm run og            # all albums
 *   npm run og -- --only nirvana-nevermind,beatles-revolver
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { ALBUMS } from '../src/data/albums';
import { rarityForRank } from '../src/rarity';
import { artworkAt } from '../src/net/match';
import { loadMedia } from './lib/media-store';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here('../dist/og/');
const TEMPLATE = `file://${here('./og/template.html')}`;
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((process.argv[process.argv.indexOf(onlyArg) + 1] ?? '').split(',')) : null;
const CONCURRENCY = 4;

const media = loadMedia();
const coverFor = (id: string, mbid?: string | null): string | null => {
  const m = media[id];
  if (m?.art) return artworkAt(m.art, 600);
  const id2 = mbid ?? m?.mbid;
  return id2 ? `https://coverartarchive.org/release-group/${id2}/front-500` : null;
};

async function openPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(TEMPLATE);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/** Waits for the cover to decode so it is never captured half-loaded (or missing). */
async function preload(page: Page, url: string | null): Promise<void> {
  if (!url) return;
  await page
    .evaluate(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = u;
          setTimeout(resolve, 8000);
        }),
      url,
    )
    .catch(() => undefined);
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

const first = await openPage();
await first.evaluate(() => (window as unknown as { renderSite: () => void }).renderSite());
await first.screenshot({ path: `${OUT}site.jpg`, type: 'jpeg', quality: 85 });
console.log('og: site.jpg');

const queue = ALBUMS.filter((a) => !ONLY || ONLY.has(a.id));
let done = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async (_, w) => {
    const page = w === 0 ? first : await openPage();
    for (let a = queue.shift(); a; a = queue.shift()) {
      const rarity = rarityForRank(a.rank);
      const cover = coverFor(a.id, a.mbid);
      await preload(page, cover);
      await page.evaluate(
        (data) => (window as unknown as { renderAlbum: (d: unknown) => void }).renderAlbum(data),
        { ...a, cover, rarity: rarity.id, rarityLabel: rarity.label, stars: rarity.stars },
      );
      await page.screenshot({ path: `${OUT}${a.id}.jpg`, type: 'jpeg', quality: 82 });
      if (++done % 50 === 0) console.log(`og: ${done} albums`);
    }
  }),
);
console.log(`og: ${done} album cards → ${OUT}`);
await browser.close();
