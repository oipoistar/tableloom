# Releasing Tableloom

The GitHub workflow checks the source, builds Windows x64, verifies native PDF output, and launches the portable executable before publishing a release. No signing certificate or personal token is required for the workflow. Published downloads are unsigned.

## Publish a version

1. Run `npm version patch --no-git-tag-version` (or choose `minor` or `major`). The renderer and desktop app both read `package.json`.
2. Add release notes at `docs/releases/<version>.md`.
3. Commit the changes and push `main`.
4. Create and push the matching tag, such as `git tag v0.1.2` and `git push origin v0.1.2`.

The tag must match the package version. The workflow publishes an installer, a portable executable, and `SHA256SUMS.txt`. Existing releases are never overwritten. A failed upload can leave a draft; inspect it before retrying.

Pushes to `main` and manual workflow runs produce downloadable Actions artifacts without publishing a release. Pull requests run source checks only.

## Update notifications

The desktop app checks `oipoistar/tableloom` at startup and every six hours. **Updates** opens preferences, a manual check, and the release page. Automatic checks can be disabled.

Only published stable versions with a matching platform and architecture download trigger a notification. Version comparison uses semantic versioning. The app opens GitHub in the default browser; it does not install or execute a downloaded update.

For the private repository, either:

- Install GitHub CLI and run `gh auth login` with an account that can read the repository.
- Save a fine-grained token with **Contents: read** for this repository in update preferences. Tokens are encrypted using the operating system credential storage and never enter project files.

No credentials are bundled in the application. Public releases can be checked without signing in. Network failures leave local editing available and can be inspected in update preferences.

The endpoint is fixed in `desktop/updates.cjs`. If the repository moves, update that file and ship a release before moving it.

References: [GitHub release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release), [Electron credential storage](https://www.electronjs.org/docs/latest/api/safe-storage), [GitHub CLI API access](https://cli.github.com/manual/gh_api).
