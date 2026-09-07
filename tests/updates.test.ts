import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createUpdateService, releaseInfo } = require('../desktop/updates.cjs');
const roots: string[] = [];
const services: { stop: () => void }[] = [];
const release = (version = '0.2.0') => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  html_url: 'https://untrusted.example/download',
  assets: [{ name: `Tableloom-${version}-win-x64-Setup.exe`, state: 'uploaded', size: 12345 }],
});
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from([...value].reverse().join('')),
  decryptString: (value: Buffer) => [...value.toString()].reverse().join(''),
};
async function service(options: Record<string, unknown> = {}) {
  const userData = await mkdtemp(path.join(tmpdir(), 'tableloom-updates-'));
  roots.push(userData);
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(release())));
  const runCli = vi.fn(async () => {
    throw new Error('Not installed');
  });
  const updates = createUpdateService({
    version: '0.1.1',
    userData,
    safeStorage,
    platform: 'win32',
    arch: 'x64',
    fetchImpl,
    runCli,
    ...options,
  });
  services.push(updates);
  await updates.load();
  return { updates, fetchImpl, runCli, userData };
}
afterEach(async () => {
  services.splice(0).forEach((s) => s.stop());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe('Release selection', () => {
  it('compares numeric versions and constructs a trusted release URL', () => {
    const result = releaseInfo(release('0.10.0'), '0.9.0', 'win32', 'x64');
    expect(result.available).toBe(true);
    expect(result.releaseUrl).toBe('https://github.com/oipoistar/tableloom/releases/tag/v0.10.0');
    expect(releaseInfo(release('0.9.0'), '0.10.0', 'win32', 'x64').available).toBe(false);
    expect(releaseInfo(release(), '0.2.0', 'win32', 'x64').available).toBe(false);
  });
  it('ignores unfinished or incompatible downloads', () => {
    expect(releaseInfo({ ...release(), assets: [] }, '0.1.1', 'win32', 'x64').available).toBe(false);
    expect(releaseInfo(release(), '0.1.1', 'darwin', 'arm64').available).toBe(false);
    expect(
      releaseInfo(
        { ...release(), assets: [{ ...release().assets[0], state: 'new' }] },
        '0.1.1',
        'win32',
        'x64',
      ).available,
    ).toBe(false);
  });
  it.each([
    { ...release(), draft: true },
    { ...release(), prerelease: true },
    release('0.3.0-beta.1'),
    release('not-a-version'),
  ])('rejects draft, prerelease, or invalid release metadata', (value) => {
    expect(() => releaseInfo(value, '0.1.1', 'win32', 'x64')).toThrow();
  });
});
describe('Desktop update checks', () => {
  it('uses the existing GitHub CLI session without extracting its credentials', async () => {
    const runCli = vi.fn(async () => ({ stdout: JSON.stringify(release()) }));
    const { updates, fetchImpl } = await service({ runCli });
    const result = await updates.check();
    expect(result.available).toBe(true);
    expect(result.authSource).toBe('GitHub CLI');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runCli.mock.calls[0]).toEqual([
      'gh',
      expect.arrayContaining([
        'api',
        '--hostname',
        'github.com',
        'repos/oipoistar/tableloom/releases/latest',
      ]),
      expect.objectContaining({ windowsHide: true, timeout: 12000 }),
    ]);
  });
  it('falls back to a bounded public API request when gh is unavailable', async () => {
    const { updates, fetchImpl } = await service();
    expect((await updates.check()).available).toBe(true);
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://api.github.com/repos/oipoistar/tableloom/releases/latest',
      expect.objectContaining({ redirect: 'error' }),
    ]);
  });
  it('persists encrypted credentials and sends them only to the GitHub endpoint', async () => {
    const { updates, userData, fetchImpl, runCli } = await service();
    await updates.configure({ token: 'test-only-credential', useGitHubCli: false });
    const saved = await readFile(path.join(userData, 'updates.json'), 'utf8');
    expect(saved).not.toContain('test-only-credential');
    expect(JSON.stringify(updates.status())).not.toContain('credential');
    await updates.check();
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://api.github.com/repos/oipoistar/tableloom/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-only-credential' }),
      }),
    ]);
    expect(runCli).not.toHaveBeenCalled();
    await updates.configure({ token: '' });
    expect(updates.status().hasToken).toBe(false);
  });
  it('refuses plaintext credential storage', async () => {
    const { updates } = await service({
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
    });
    await expect(updates.configure({ token: 'test-only-credential' })).rejects.toThrow(
      'Secure credential storage',
    );
    expect(updates.status().hasToken).toBe(false);
  });
  it('keeps private access errors actionable without leaking API responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('private response must not appear', { status: 404 }));
    const { updates } = await service({ fetchImpl });
    const result = await updates.check();
    expect(result.message).toContain('Contents: read');
    expect(result.message).not.toContain('private response');
    expect(result.available).toBe(false);
    expect(result.checking).toBe(false);
  });
  it('coalesces concurrent checks and does not start disabled automatic checks', async () => {
    const { updates, fetchImpl } = await service();
    await updates.configure({ automatic: false });
    updates.start();
    expect(fetchImpl).not.toHaveBeenCalled();
    const one = updates.check(),
      two = updates.check();
    expect(one).toBe(two);
    await one;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('contains network failures without exposing exception details', async () => {
    const { updates } = await service({
      fetchImpl: async () => {
        throw new Error('secret transport detail');
      },
    });
    const result = await updates.check();
    expect(result.message).toBe('Could not check for updates. Check your connection and try again.');
    expect(result.checking).toBe(false);
  });
});
