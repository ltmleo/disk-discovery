import { describe, expect, it } from 'vitest';
import { BASE, fromLegacyHash, href, parse } from './router';

describe('router', () => {
  it('builds and parses every route', () => {
    expect(parse(href.pack())).toEqual({ name: 'pack' });
    expect(parse(href.gallery())).toEqual({ name: 'gallery', spy: false });
    const u = new URL(href.album('nirvana-nevermind', true), 'https://x.test');
    expect(parse(u.pathname, u.search)).toEqual({ name: 'album', id: 'nirvana-nevermind', spy: true });
    expect(parse(`${BASE}qualquer/coisa`)).toEqual({ name: 'pack' });
  });

  it('rewrites legacy hash links', () => {
    expect(fromLegacyHash('#/disco/x?espiar')).toBe(`${BASE}disco/x?espiar`);
    expect(fromLegacyHash('#section')).toBeNull();
  });
});
