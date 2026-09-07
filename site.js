const steps = [...document.querySelectorAll('[data-step]')];
const progress = document.querySelector('#workflow-progress');
const motionButton = document.querySelector('#motion-toggle');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let selected = 0;
let tick = 0;
let paused = motionPreference.matches;

function selectStep(index) {
  selected = index;
  tick = 0;
  steps.forEach((button, i) => {
    const active = i === index;
    button.setAttribute('aria-pressed', String(active));
    Object.assign(button.style, {
      background: active ? '#fffef9' : '#f7f7f5',
      borderColor: active ? '#527c60' : '#e0e1dc',
      transform: active ? `translateY(-6px) rotate(${i % 2 ? 1 : -1}deg)` : 'none',
      boxShadow: active ? '0 14px 30px -14px #272b2440' : 'none',
    });
    button.querySelector('.step-dot').style.background = active ? '#527c60' : '#d8dbd0';
  });
  progress.style.width = `${(index / steps.length) * 100}%`;
}
function setPaused(value) {
  paused = value;
  document.documentElement.classList.toggle('motion-paused', value);
  motionButton.textContent = value ? 'Play animation' : 'Pause animation';
  motionButton.setAttribute('aria-pressed', String(value));
}
steps.forEach((button, index) => button.addEventListener('click', () => {
  selectStep(index);
  setPaused(true);
}));
motionButton.addEventListener('click', () => setPaused(!paused));
motionPreference.addEventListener('change', (event) => setPaused(event.matches));
setPaused(paused);
setInterval(() => {
  if (paused || document.hidden) return;
  if (++tick >= 40) selectStep((selected + 1) % steps.length);
  progress.style.width = `${((selected * 40 + tick) / (steps.length * 40)) * 100}%`;
}, 100);

// Keep the included release links usable even if the API is unavailable or rate limited.
async function refreshDownloads() {
  try {
    const response = await fetch('https://api.github.com/repos/oipoistar/tableloom/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return;
    const release = await response.json();
    if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return;
    const version = release.tag_name.slice(1);
    const base = `https://github.com/oipoistar/tableloom/releases/download/${release.tag_name}/`;
    const find = (name) => release.assets.find((asset) => asset.name === name && asset.state === 'uploaded' && asset.size > 0 && asset.browser_download_url === base + name);
    const setup = find(`Tableloom-${version}-win-x64-Setup.exe`);
    const portable = find(`Tableloom-${version}-win-x64-Portable.exe`);
    const checksums = find('SHA256SUMS.txt');
    if (!setup || !portable || !checksums) return;
    document.querySelector('[data-download="setup"]').href = setup.browser_download_url;
    document.querySelector('[data-download="portable"]').href = portable.browser_download_url;
    document.querySelector('#checksums-link').href = checksums.browser_download_url;
    document.querySelector('#release-version').textContent = `${release.tag_name} · Apache-2.0`;
    document.querySelector('#download-file').textContent = `${portable.name} · ${(portable.size / 1024 / 1024).toFixed(1)} MB`;
    document.querySelector('#download-checksum').textContent = /^sha256:[a-f0-9]{64}$/.test(portable.digest ?? '')
      ? portable.digest.slice(7) : 'See SHA256SUMS.txt for this release’s checksums.';
  } catch { /* The version included with this page remains available. */ }
}
void refreshDownloads();
