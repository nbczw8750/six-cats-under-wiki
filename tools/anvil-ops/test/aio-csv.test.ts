import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAioCsv, formatAioCsv, aioArchivePath } from '../src/core/aio-csv.js';
import { OpsError } from '../src/core/errors.js';

const NORMAL_CSV = [
  'Page,Impressions,Clicks,CTR,Position',
  'https://wiki.example.com/bosses/emberfang,1200,15,1.25%,3.2',
  'https://wiki.example.com/codes/main,4500,40,0.89%,1.8',
].join('\n');

describe('parseAioCsv', () => {
  it('parses a normal GSC-style export and sorts by impressions desc', () => {
    const rows = parseAioCsv(NORMAL_CSV);
    expect(rows).toEqual([
      { page: 'https://wiki.example.com/codes/main', impressions: 4500, clicks: 40 },
      { page: 'https://wiki.example.com/bosses/emberfang', impressions: 1200, clicks: 15 },
    ]);
  });

  it('tolerates BOM, CRLF and blank lines', () => {
    const csv = '\uFEFFPage,Impressions\r\n\r\nhttps://x.com/a,10\r\n\r\n';
    expect(parseAioCsv(csv)).toEqual([{ page: 'https://x.com/a', impressions: 10, clicks: 0 }]);
  });

  it('handles quoted cells containing commas', () => {
    const csv = '"Page","Impressions","Clicks"\n"https://x.com/a,b",7,1\n';
    expect(parseAioCsv(csv)).toEqual([{ page: 'https://x.com/a,b', impressions: 7, clicks: 1 }]);
  });

  it('works without a Clicks column (clicks default to 0)', () => {
    const rows = parseAioCsv('Page,Impressions\nhttps://x.com/a,5\n');
    expect(rows[0]).toMatchObject({ impressions: 5, clicks: 0 });
  });

  it('missing Page or Impressions column throws OpsError naming the export source', () => {
    expect(() => parseAioCsv('Queries,Clicks\nq,1\n')).toThrow(OpsError);
    try {
      parseAioCsv('Queries,Clicks\nq,1\n');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as OpsError).message).toMatch(/Page/);
      expect((e as OpsError).fix).toMatch(/Search Generative AI performance report/);
    }
    expect(() => parseAioCsv('Page,CTR\nhttps://x.com/a,1%\n')).toThrow(/Impressions/);
  });

  it('empty input throws OpsError with export guidance', () => {
    expect(() => parseAioCsv('')).toThrow(/empty/i);
  });

  it('header-only CSV = empty rows, no error', () => {
    expect(parseAioCsv('Page,Impressions,Clicks\n')).toEqual([]);
  });
});

describe('formatAioCsv', () => {
  it('renders a metrics-style table with totals and experimental label', () => {
    const out = formatAioCsv(
      [
        { page: 'https://x.com/a', impressions: 10, clicks: 1 },
        { page: 'https://x.com/b', impressions: 5, clicks: 0 },
      ],
      'report.csv',
    );
    expect(out).toContain('AI Overviews — imported from report.csv (experimental, GSC UI export)');
    expect(out).toContain('impressions');
    expect(out).toContain('https://x.com/a');
    expect(out).toContain('total impressions=15 clicks=1');
  });
});

describe('aioArchivePath', () => {
  it('archives under ops/ai-visibility with a date-stamped filename', () => {
    // join() rather than a hardcoded POSIX literal: aioArchivePath builds the
    // path with node:path, so on Windows the separators are backslashes. The
    // contract under test is "site root + ops/ai-visibility + date-stamped
    // file", which join() expresses platform-correctly on both.
    expect(aioArchivePath('/repo', new Date('2026-08-22T12:00:00Z'))).toBe(
      join('/repo', 'ops', 'ai-visibility', '2026-08-22-aio.csv'),
    );
  });
});
