import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { canOffload, OFFLOAD_TIMEOUT_MS, WatchdogTimeout, watchdogTimeoutFix, withWatchdog } from '../src/mcp/offload.js';
import { submitLockPath } from '../src/core/gitops.js';
import { loadSiteConfig } from '../src/core/site.js';

describe('offload watchdog', () => {
  it('passes the task result through when it wins the race', async () => {
    const onTimeout = vi.fn();
    await expect(withWatchdog(Promise.resolve('done'), 5_000, onTimeout)).resolves.toBe('done');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('propagates task rejection untouched (not a WatchdogTimeout)', async () => {
    await expect(withWatchdog(Promise.reject(new Error('boom')), 5_000, () => {})).rejects.toThrow('boom');
  });

  it('fires onTimeout and rejects with WatchdogTimeout when the task never settles', async () => {
    const onTimeout = vi.fn();
    await expect(withWatchdog(new Promise(() => {}), 5, onTimeout)).rejects.toBeInstanceOf(WatchdogTimeout);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('watchdog budget is the documented 10-minute constant', () => {
    // Deliberately tighter than the inner 15min-per-step spawn budget: a hung
    // worker must fail loudly instead of holding the stdio loop's promise.
    expect(OFFLOAD_TIMEOUT_MS).toBe(10 * 60_000);
  });

  it('canOffload is false under vitest (source form, no dist worker) — the known constraint keeping offload itself integration-untested', () => {
    expect(canOffload()).toBe(false);
  });
});

describe('watchdog timeout self-rescue guidance', () => {
  // worker.terminate() hard-kills the worker mid-submit, so submit's finally
  // lock release never runs — and worker threads share the server pid, which
  // is exactly what the lock's stale-owner probe checks, so the leftover lock
  // is stuck for the full 30-minute stale window and every retry reports
  // "Another submit is already running" with the server's own pid. The
  // timeout error must hand the user the exact lock file path.
  it('submit guidance names the exact leftover lock path for the site', () => {
    // Hermetic site root: this fork deleted wrangler.toml (settings live in
    // the Cloudflare dashboard) and .env is gitignored, so loadSiteConfig()
    // throws on a fresh checkout — which is exactly what turned the CI
    // ops-toolkit job red. Instead of inheriting the repo's own config state,
    // point the helper at a temp site. The .env sits one level ABOVE cwd on
    // purpose: the message must then name the config-RESOLVED root's lock,
    // not the cwd-derived fallback, so the assertion still discriminates.
    const siteRoot = mkdtempSync(join(tmpdir(), 'anvil-ops-site-'));
    const cwd = join(siteRoot, 'subdir');
    mkdirSync(cwd);
    writeFileSync(join(siteRoot, '.env'), 'SITE_URL=https://example.test\n', 'utf8');
    const fix = watchdogTimeoutFix('submit', cwd);
    expect(fix).toMatch(/lock/i);
    const expected = submitLockPath(loadSiteConfig(cwd).root);
    expect(expected, 'the .env must resolve a root above cwd or this asserts nothing').not.toBe(
      submitLockPath(cwd),
    );
    // The path in the message must be THE lock path acquireSubmitLock
    // created for this site — a stale hint would point at a non-lock file.
    expect(fix).toContain(expected);
  });

  it('falls back to the cwd-derived lock when the site has no config at all', () => {
    // The other half, and this fork's actual state on CI: neither wrangler.toml
    // nor .env exists, so leftoverSubmitLockPath() takes its catch branch. The
    // hint must then name the lock derived from cwd — anything else points at a
    // file that was never created.
    const cwd = mkdtempSync(join(tmpdir(), 'anvil-ops-noconf-'));
    const fix = watchdogTimeoutFix('submit', cwd);
    expect(fix).toMatch(/lock/i);
    expect(fix).toContain(submitLockPath(cwd));
  });

  it('audit guidance stays lock-free (audit never takes the submit lock)', () => {
    expect(watchdogTimeoutFix('audit', process.cwd())).not.toMatch(/lock/i);
  });
});
