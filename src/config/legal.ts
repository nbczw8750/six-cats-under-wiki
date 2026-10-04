/**
 * Legal pages — the single source of truth for their slugs, titles and the
 * "last updated" stamp.
 *
 * Consumed by BOTH sides that must agree:
 *   - the routes (`src/pages/about.astro` … and `src/pages/[locale]/[legal].astro`)
 *     and the LegalPage layout — page title, hreflang cluster, "Last updated";
 *   - `astro.config.ts` — sitemap `<lastmod>` and sitemap hreflang `links`.
 *
 * Before this file existed the date was hardcoded in 6 route files and the
 * slug/title list twice more, so astro.config could not emit `<lastmod>` for
 * legal pages at all (their sitemap entries shipped as bare `<loc>` while
 * article entries carried lastmod + the 5-language hreflang cluster).
 */
export const LEGAL_PAGES = [
  'about',
  'privacy-policy',
  'terms-of-service',
  'copyright',
  'contact',
] as const;

export type LegalPageKey = (typeof LEGAL_PAGES)[number];

/** English H1 for each page — legal body text is English-only per PRD, so
 *  titles are not translated; only the surrounding chrome is. */
export const LEGAL_TITLES: Record<LegalPageKey, string> = {
  about: 'About',
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
  copyright: 'Copyright',
  contact: 'Contact',
};

/** Shown as "Last updated: …" on the page and used as sitemap `<lastmod>`. */
export const LEGAL_LAST_UPDATED = '2026-08-11';

/** Type guard for route params / incoming strings. */
export function isLegalPage(value: string): value is LegalPageKey {
  return (LEGAL_PAGES as readonly string[]).includes(value);
}
