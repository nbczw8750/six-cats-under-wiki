import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT_TYPES, NAVIGATION_CONFIG } from '~/config/navigation';

/**
 * Codes surface ↔ homepage consistency (第 23 轮 24h 审计发现①②的门禁半边).
 *
 * A code's status used to live in exactly one place — the codes page
 * frontmatter — while two surfaces re-stated it by hand (the home
 * `explore` badge-list highlights, and the body's test-pass date sentence)
 * and could silently lag behind. Those checks are pinned in the upstream
 * template, where the `codes` content type ships.
 *
 * THIS FORK ships no `codes` content type at all: NAVIGATION_CONFIG /
 * CONTENT_TYPES carry guides + hints + faq only, no locale has
 * `src/content/wiki/<locale>/codes/`, and no article declares
 * `category: codes`. The original per-locale assertions therefore cannot run
 * (readCodesPage ENOENT) — they are replaced here by the same invariant's
 * other half, which stays strict in both directions:
 *
 *   1. the removed content type must STAY removed (no directory, no article
 *      declaring it, no config key advertising it);
 *   2. the surviving hand-written surface (home `explore` badge-list) must
 *      not link at the removed route — a `/codes` href here is a soft 404
 *      shipped to every locale.
 *
 * All checks are clock-free and filesystem-only (no astro:content — see
 * lib/url notes), exactly like the suite they replace.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'src/content/wiki');
const REMOVED_TYPE = 'codes';

function localeDirs(): string[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(mdx|md)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function frontmatterOf(raw: string): string {
  return raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

interface ExploreModule {
  displayType?: string;
  href?: string;
  highlights?: Array<{ label?: string }>;
}

function badgeListHrefs(localeFile: string): string[] {
  const json = JSON.parse(readFileSync(join(ROOT, 'src/locales', localeFile), 'utf8')) as {
    home?: { explore?: { modules?: ExploreModule[] } };
  };
  const hrefs: string[] = [];
  for (const m of json.home?.explore?.modules ?? []) {
    if (m?.displayType !== 'badge-list') continue;
    if (m.href) hrefs.push(m.href);
  }
  return hrefs;
}

describe('codes page ↔ home highlights consistency (codes type removed in this fork)', () => {
  it('no locale still ships a codes category directory', () => {
    const locales = localeDirs();
    expect(locales.length, 'src/content/wiki must still ship locales').toBeGreaterThan(1);
    for (const locale of locales) {
      expect(
        existsSync(join(CONTENT_DIR, locale, REMOVED_TYPE)),
        `src/content/wiki/${locale}/${REMOVED_TYPE}/ must stay removed — content-aware clearing and the category enum disagree otherwise`,
      ).toBe(false);
    }
  });

  it('no article declares the removed category', () => {
    const offenders: string[] = [];
    for (const locale of localeDirs()) {
      for (const file of walk(join(CONTENT_DIR, locale))) {
        const fm = frontmatterOf(readFileSync(file, 'utf8'));
        if (new RegExp(`^category:\\s*['"]?${REMOVED_TYPE}['"]?\\s*$`, 'm').test(fm)) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(
      offenders,
      `these articles declare category: ${REMOVED_TYPE}, which is no longer a content type — the build accepts it but the list route soft-404s`,
    ).toEqual([]);
  });

  it(`the nav/config layer agrees: CONTENT_TYPES carries no "${REMOVED_TYPE}" key`, () => {
    // Constraint #4 of the repo: navigation.ts keys, en.json nav keys and the
    // content directories must match in all three places. This pins the third
    // half for the removed type (the directories and the nav keys are the two
    // tests above and below the config check).
    expect(CONTENT_TYPES, `CONTENT_TYPES still advertises ${REMOVED_TYPE}`).not.toContain(REMOVED_TYPE);
    expect(
      NAVIGATION_CONFIG.map((n) => n.key),
      `NAVIGATION_CONFIG still advertises ${REMOVED_TYPE}`,
    ).not.toContain(REMOVED_TYPE);
  });

  it('the surviving hand-written surface (home badge-list) links to no codes route', () => {
    const localeFiles = readdirSync(join(ROOT, 'src/locales')).filter((f) => f.endsWith('.json'));
    expect(localeFiles.length, 'src/locales must still ship locale JSON').toBeGreaterThan(1);
    const offenders: string[] = [];
    for (const file of localeFiles) {
      for (const href of badgeListHrefs(file)) {
        if (new RegExp(`(^|/)${REMOVED_TYPE}(/|$)`).test(href)) offenders.push(`${file} → ${href}`);
      }
    }
    expect(
      offenders,
      'home explore still points at the removed /codes route — a hand-written href that silently 404s for every locale',
    ).toEqual([]);
  });
});
