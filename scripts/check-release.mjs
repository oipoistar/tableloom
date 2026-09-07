import { readFile } from 'node:fs/promises';
import semver from 'semver';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!semver.valid(version) || semver.prerelease(version))
  throw new Error('Release a stable semantic version.');
if (process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error('Git tag must match the package.json version.');
console.log(`Release version verified: ${version}`);
