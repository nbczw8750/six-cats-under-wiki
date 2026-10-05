/**
 * Trailing-slash contract — the site builds with trailingSlash:'always'
 * (see lib/url.ts): every internal link must end "/" or each visit 308s once
 * (hreflang pairs that disagree with the served URL waste crawl budget and
 * muddy canonical signals).
 *
 * FORK NOTE: this file used to sweep the marketing landing layer, which sat
 * OUTSIDE the wiki i18n system and therefore hand-wrote its hreflang
 * alternates and header togglePaths as string literals — 12+ route files plus
 * `config/landing.ts landingPath()`, exactly where the slash kept getting
 * forgotten. That layer is gone in this fork (no src/pages/landing*,
 * no src/config/landing.ts, /landing/ 404s in production), so the literals
 * the old tests read no longer exist.
 *
 * The invariant does not: every URL this site serves is still assembled by
 * `src/lib/url.ts` (localizePath is the single slash-normalizing point that
 * absoluteUrl and languageAlternates both delegate to) and by
 * `lib/handbook.ts handbookPath()`, which still ships — llms.txt.ts uses it.
 * The suite therefore pins the slash at its remaining sources instead of at
 * the deleted route files, and still sweeps every route file that exists for
 * hand-written literals so a hand-rolled href regresses red.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { handbookPath } from '~/lib/handbook';
import { localizePath, listPath, detailPath, tagsPath, tagPath, recentPath, homeUrl, languageAlternates } from '~/lib/url';
import { locales } from '~/i18n/routing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every route file this fork actually serves. */
function routeFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.astro')) files.push(full);
    }
  };
  walk(join(root, 'src/pages'));
  return files;
}

describe('trailing-slash contract', () => {
  test('the route sweep actually finds this site\'s routes, and the landing tree stays gone', () => {
    const files = routeFiles();
    // Guards the sweeps below against a silently-empty scan (the original
    // suite's own guard, pointed at the routes that exist now).
    expect(files.length, 'route sweep found too few files to be meaningful').toBeGreaterThanOrEqual(10);
    // Cross-check: the layer this file once covered must stay removed — routes
    // back without src/config/landing.ts (or the reverse) is a half-revert.
    expect(
      files.filter((f) => /(^|[\\/])landing([\\/]|\.astro$)/.test(f)),
      'a /landing route exists while src/config/landing.ts is removed',
    ).toEqual([]);
    expect(existsSync(join(root, 'src/config/landing.ts')), 'src/config/landing.ts must stay removed').toBe(
      false,
    );
  });

  test('localizePath() emits a trailing slash for every locale, never a double slash', () => {
    const paths = ['/', '/guides', '/guides/', '/guides/emberforged-armor-set', '/tags', '/recent', '/faq'];
    for (const locale of locales) {
      for (const path of paths) {
        const out = localizePath(path, locale);
        expect(out, `${locale} ${path} -> ${out}`).toMatch(/\/$/);
        // localizePath never adds a scheme, so any "//" here is a doubled slash.
        expect(out, `${locale} ${path} -> ${out} has a doubled slash`).not.toMatch(/\/\//);
      }
    }
  });

  test('every path helper ends with "/" (list/detail/tags/tag/recent/home)', () => {
    for (const locale of locales) {
      const built = [
        ['homeUrl', homeUrl(locale)],
        ['listPath', listPath('guides', locale)],
        ['detailPath', detailPath('guides', 'some-slug', locale)],
        ['tagsPath', tagsPath(locale)],
        ['tagPath', tagPath('beginner-guide', locale)],
        ['recentPath', recentPath(locale)],
      ] as const;
      for (const [name, out] of built) {
        expect(out, `${name}(${locale}) = ${out}`).toMatch(/\/$/);
      }
    }
  });

  test('languageAlternates() hrefs are absolute, slashed, and double-slash free', () => {
    // This is the live hreflang source (routes stopped hand-writing
    // `href: `${siteUrl}...` literals) — a slash lost here 308s every
    // crawler visit on every alternate.
    const alternates = languageAlternates((loc) => listPath('guides', loc), locales);
    expect(alternates.length, 'one alternate per locale').toBe(locales.length);
    for (const { hreflang, href } of alternates) {
      expect(href, `${hreflang} href not absolute`).toMatch(/^https?:\/\//);
      expect(href, `${hreflang} href lacks trailing slash: ${href}`).toMatch(/\/$/);
      expect(
        href.replace(/^https?:\/\//, ''),
        `${hreflang} href has a doubled slash: ${href}`,
      ).not.toContain('//');
    }
    // Default locale keeps its no-prefix form; the rest are prefixed.
    const en = alternates.find((a) => a.hreflang === 'en');
    expect(en?.href.endsWith('/guides/')).toBe(true);
    const ja = alternates.find((a) => a.hreflang === 'ja');
    expect(ja?.href.endsWith('/ja/guides/')).toBe(true);
  });

  test('every hand-written siteUrl/togglePath literal in a route file ends with "/"', () => {
    // Routes are supposed to go through lib/url.ts; if someone hand-writes
    // one again, this is where the forgotten slash historically lived.
    const offenders: string[] = [];
    for (const file of routeFiles()) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/href:\s*`\$\{siteUrl\}([^`]*)`/g)) {
        if (!m[1].endsWith('/')) offenders.push(`${file}: ${m[1]}`);
      }
      for (const m of src.matchAll(/togglePath(?:="([^"]+)"|\{([^}]+)\})/g)) {
        const value = (m[1] ?? m[2]).trim();
        // Skip non-literal forms (togglePath={handbookPath(...)} — its output
        // is pinned by the handbookPath() test below).
        if (!value.startsWith('/') || value.endsWith('/')) continue;
        offenders.push(`${file}: ${value}`);
      }
    }
    expect(offenders, `slashless hand-written hrefs:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('handbookPath() (docs hreflang/toggle + llms.txt source) ends with "/"', () => {
    expect(handbookPath('en', '', true)).toBe('/landing/docs/');
    expect(handbookPath('en', 'weekly-ops')).toBe('/landing/docs/weekly-ops/');
    expect(handbookPath('zh', 'weekly-ops')).toBe('/zh/landing/docs/weekly-ops/');
  });
});
