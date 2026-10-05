/**
 * Community digest pipeline contract — REMOVED in this fork.
 *
 * Upstream, src/components/landing/community-digest.json is appended daily by
 * the automation pipeline (spec:
 * docs/superpowers/specs/2026-09-08-community-digest-pipeline.md) and read by
 * CommunityHighlights.astro, whose deep reads (`r.stats.messages`,
 * `r.quotes.length`, …) only fail at render time if a bad append ships. The
 * original suite pinned that file's schema / ordering / privacy invariants.
 *
 * This fork deleted the whole feature as a unit: no src/components/landing/,
 * no community-digest.json, no page to render it, and no workflow or script
 * left that writes or reads it. Reading the JSON at import time therefore
 * fails the whole file before a single assertion runs.
 *
 * What stays pinned is the same feature's contract from the other side — both
 * halves must be gone together, plus the privacy red line (spec §5 step 5 /
 * §6.2) extended over the data surfaces this fork DOES still publish. A
 * half-restored pipeline (producer without consumer, or consumer without data)
 * goes red here instead of shipping a crash or a dead scheduled workflow.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DIGEST_FILE = join(root, 'src/components/landing/community-digest.json');
const LANDING_DIR = join(root, 'src/components/landing');

// Privacy red line (spec §5 step 5 / §6.2): member identity beyond group
// nicknames must never reach a public file. The digest itself is gone, so the
// same patterns now guard every data surface the site actually publishes.
const PRIVACY_PATTERNS: [string, RegExp][] = [
  ['wxid', /wxid_\w+/i],
  ['official-account id', /gh_[A-Za-z0-9_]{4,}/],
  ['11-digit phone number', /(?<!\d)1[3-9]\d{9}(?!\d)/],
];

/** Repo-relative files of the kinds that could wire the pipeline up. */
function pipelineCandidates(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ya?ml|mjs|cjs|ts|tsx|astro|json)$/.test(e.name)) out.push(full);
    }
  };
  walk(join(root, '.github/workflows'));
  walk(join(root, 'scripts'));
  walk(join(root, 'src'));
  return out;
}

/** Every file this fork still publishes as public data. */
function publicDataFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(json|md|mdx|txt|html|xml|webmanifest)$/.test(e.name)) out.push(full);
    }
  };
  walk(join(root, 'public'));
  walk(join(root, 'src/locales'));
  walk(join(root, 'src/content'));
  return out;
}

describe('community digest pipeline (removed in this fork)', () => {
  test('the data file and its component directory are both gone', () => {
    expect(existsSync(DIGEST_FILE), 'community-digest.json must stay removed').toBe(false);
    expect(existsSync(LANDING_DIR), 'src/components/landing must stay removed').toBe(false);
  });

  test('no producer or consumer is left behind (workflows, scripts, site sources)', () => {
    // A scheduled job still writing this file would open a PR nobody reads;
    // a component still importing it would crash the build. Both are silent
    // from the file's own absence, so they get their own scan.
    const offenders: string[] = [];
    for (const file of pipelineCandidates()) {
      const raw = readFileSync(file, 'utf8');
      if (/community-digest|CommunityHighlights/.test(raw)) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(offenders, 'these still reference the removed digest pipeline').toEqual([]);
  });

  test('privacy scan: no wxid / official-account id / phone number in any published data file', () => {
    // Inherited from the original suite (spec §5 step 5): the pattern list is
    // unchanged, only the surface widened from one JSON to everything public.
    const files = publicDataFiles();
    expect(files.length, 'the site must still publish data files').toBeGreaterThan(0);
    const hits: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      for (const [name, pattern] of PRIVACY_PATTERNS) {
        if (pattern.test(raw)) hits.push(`${name}: ${file.slice(root.length + 1)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
