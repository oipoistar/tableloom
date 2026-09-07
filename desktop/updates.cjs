const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const semver = require('semver');

const REPOSITORY = 'oipoistar/tableloom';
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const ENDPOINT = `repos/${REPOSITORY}/releases/latest`;
const INTERVAL = 6 * 60 * 60 * 1000;
const MAX_RESPONSE = 1024 * 1024;
const run = promisify(execFile);

function releaseInfo(release, currentVersion, platform, arch) {
  const version = semver.valid(release?.tag_name);
  if (!version || release.draft || release.prerelease || semver.prerelease(version))
    throw new Error('GitHub did not return a stable version.');
  const os = { win32: 'win', darwin: 'mac', linux: 'linux' }[platform];
  const escaped = version.replace(/\./g, '\\.');
  const pattern = new RegExp(
    `^Tableloom-${escaped}-${os}-${arch}(?:-Setup|-Portable)?\\.(exe|dmg|zip|AppImage|deb)$`,
  );
  const compatible = (release.assets ?? []).some(
    (asset) => asset.state === 'uploaded' && asset.size > 0 && pattern.test(asset.name),
  );
  return {
    latestVersion: version,
    available: semver.gt(version, currentVersion) && compatible,
    compatible,
    releaseUrl: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`,
  };
}

function createUpdateService({
  version,
  userData,
  safeStorage,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  runCli = run,
  onChange = () => {},
}) {
  const file = path.join(userData, 'updates.json');
  let config = { automatic: true, useGitHubCli: true, token: '' };
  let state = {
    currentVersion: version,
    repository: REPOSITORY,
    releaseUrl: RELEASES_URL,
    available: false,
    checking: false,
    checkedAt: null,
    latestVersion: null,
    message: '',
    authSource: 'none',
  };
  let pending;
  let timer;
  let started = false;
  const encryptedStorageAvailable = () =>
    safeStorage.isEncryptionAvailable() &&
    (platform !== 'linux' || safeStorage.getSelectedStorageBackend?.() !== 'basic_text');
  const status = () => ({
    ...state,
    automatic: config.automatic,
    useGitHubCli: config.useGitHubCli,
    hasToken: !!config.token,
    canStoreToken: encryptedStorageAvailable(),
  });
  const emit = () => {
    const value = status();
    onChange(value);
    return value;
  };

  async function load() {
    try {
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      config.automatic = saved.automatic !== false;
      config.useGitHubCli = saved.useGitHubCli !== false;
      config.token = typeof saved.token === 'string' ? saved.token : '';
    } catch (error) {
      if (error.code !== 'ENOENT')
        state.message = 'Update preferences could not be read. Save them again to reset.';
    }
    return status();
  }
  function schedule() {
    clearInterval(timer);
    if (started && config.automatic) {
      timer = setInterval(() => void check(), INTERVAL);
      timer.unref?.();
    }
  }
  async function configure(changes) {
    if (!changes || typeof changes !== 'object') throw new Error('Invalid update preferences.');
    const next = { ...config };
    for (const key of ['automatic', 'useGitHubCli']) {
      if (key in changes) {
        if (typeof changes[key] !== 'boolean') throw new Error('Invalid update preference.');
        next[key] = changes[key];
      }
    }
    if ('token' in changes) {
      if (typeof changes.token !== 'string' || changes.token.length > 500 || /\s/.test(changes.token))
        throw new Error('Enter a valid GitHub access token.');
      if (changes.token && !encryptedStorageAvailable())
        throw new Error('Secure credential storage is unavailable on this device. Use GitHub CLI instead.');
      next.token = changes.token ? safeStorage.encryptString(changes.token).toString('base64') : '';
    }
    await fs.mkdir(userData, { recursive: true });
    const temp = file + '.tmp';
    await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await fs.rename(temp, file);
    config = next;
    schedule();
    return emit();
  }
  async function request() {
    let token;
    if (config.token) {
      try {
        if (!encryptedStorageAvailable()) throw new Error();
        token = safeStorage.decryptString(Buffer.from(config.token, 'base64'));
      } catch {
        throw new Error('The saved token could not be unlocked. Replace it or remove it to use GitHub CLI.');
      }
    } else if (config.useGitHubCli) {
      try {
        const { stdout } = await runCli(
          'gh',
          [
            'api',
            '--hostname',
            'github.com',
            ENDPOINT,
            '-H',
            'Accept: application/vnd.github+json',
            '-H',
            'X-GitHub-Api-Version: 2022-11-28',
          ],
          {
            timeout: 12000,
            maxBuffer: MAX_RESPONSE,
            windowsHide: true,
            env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
          },
        );
        state.authSource = 'GitHub CLI';
        return JSON.parse(stdout);
      } catch {
        /* Public repositories remain usable when gh is absent or signed out. */
      }
    }
    const response = await fetchImpl(`https://api.github.com/${ENDPOINT}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `Tableloom/${version}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    state.authSource = token ? 'Saved token' : 'Public access';
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401)
        throw new Error('GitHub rejected the access token. Replace it in update preferences.');
      if (response.status === 404)
        throw new Error(
          'No release is accessible. For this private repository, sign in with GitHub CLI or save a token with Contents: read access.',
        );
      if (response.status === 403 || response.status === 429)
        throw new Error(
          'GitHub limited this request or denied access. Check permissions and try again later.',
        );
      throw new Error('GitHub is unavailable. Try again later.');
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_RESPONSE) throw new Error('The GitHub response was too large.');
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  function check() {
    if (pending) return pending;
    state.checking = true;
    state.message = '';
    emit();
    pending = (async () => {
      try {
        const release = await request();
        const info = releaseInfo(release, version, platform, arch);
        state = {
          ...state,
          ...info,
          checkedAt: new Date().toISOString(),
          message: info.available
            ? `Tableloom ${info.latestVersion} is available.`
            : !info.compatible && semver.gt(info.latestVersion, version)
              ? 'A newer release exists, but has no download for this platform yet.'
              : 'You’re up to date.',
        };
      } catch (error) {
        // Never forward CLI output, HTTP response bodies, or credentials into the renderer.
        const safe = /^(GitHub |No release |The saved token |The GitHub response |Enter a valid)/;
        state.message = safe.test(error.message)
          ? error.message
          : 'Could not check for updates. Check your connection and try again.';
      } finally {
        state.checking = false;
        pending = undefined;
      }
      return emit();
    })();
    return pending;
  }
  function start() {
    started = true;
    schedule();
    if (config.automatic) void check();
  }
  function stop() {
    started = false;
    clearInterval(timer);
  }
  return { load, status, configure, check, start, stop };
}

module.exports = { createUpdateService, releaseInfo, REPOSITORY, RELEASES_URL };
