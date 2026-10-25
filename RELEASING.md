# Releasing

`ngx-signal-forms-renderer` follows [semver](https://semver.org). Releases are **automated**:
the library's `version` in `projects/ngx-signal-forms-renderer/package.json` is the single source
of truth — when it changes on `main`, CI publishes to npm and creates a GitHub Release.

## One-time setup

Publishing uses npm **Trusted Publishing (OIDC)** — no tokens are stored in CI.

1. On npmjs.com, open the package → **Settings → Trusted Publisher** → add a GitHub Actions publisher:
   - **Organization or user:** `fabioemoutinho`
   - **Repository:** `ngx-signal-forms-renderer`
   - **Workflow filename:** `publish.yml`
   - **Allowed action:** `npm publish`
2. Nothing else — the workflow already has `id-token: write` and upgrades npm to ≥ 11.5.1, so no
   `NODE_AUTH_TOKEN`/secret is needed.

> `0.0.1-beta.0` was published by this workflow using an `NPM_TOKEN` secret. The workflow was then
> switched to Trusted Publishing and the secret removed, so `0.0.1-beta.1` is the first release
> through OIDC. If it fails with an auth error, check the Trusted Publisher settings above — nothing
> is published on failure, and re-running is safe.

## Changelog

Every user-facing change goes into
[`projects/ngx-signal-forms-renderer/CHANGELOG.md`](./projects/ngx-signal-forms-renderer/CHANGELOG.md)
([Keep a Changelog](https://keepachangelog.com) format) under `## [Unreleased]`, in the same change
that introduces it. Group entries under **Breaking**, **Added**, **Changed**, **Fixed**, **Removed**
or **Known issues**, and include a migration snippet for anything breaking. The changelog ships in
the npm package, and each GitHub Release's notes are taken from it.

## Cutting a release

1. In the changelog, rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>`, add a fresh empty
   `## [Unreleased]` above it, and update the compare links at the bottom.
2. Bump the version (this is what triggers a release). Use `--no-git-tag-version`, because CI
   creates the tag:
   ```bash
   cd projects/ngx-signal-forms-renderer
   npm version patch --no-git-tag-version   # or: minor | major
   ```
3. Commit both and merge to `main`.
4. CI (`.github/workflows/publish.yml`) then:
   - **skips** if that version is already on npm (so re-runs are safe),
   - builds the library (`ng build ngx-signal-forms-renderer`),
   - publishes with a dist-tag derived from the version (see below),
   - creates the `v<version>` git tag and a **GitHub Release** whose notes are that version's
     changelog section (or GitHub's auto-generated notes if the section is missing).

You can also run it manually: Actions → "Publish to npm" → **Run workflow**.

## Prereleases (beta)

The npm **dist-tag** is derived from the version string:

- A **prerelease** version (e.g. `0.0.1-beta.0`) publishes under the **`beta`** tag (the suffix
  before the first `.` becomes the tag, so `-next.0` → `next`, `-rc.1` → `rc`) and the GitHub
  Release is marked _pre-release_. `npm install ngx-signal-forms-renderer` does **not** pull it;
  only `npm install ngx-signal-forms-renderer@beta` does. `latest` stays untouched.
- A **plain** version (e.g. `0.0.1`) publishes to **`latest`**.

```bash
cd projects/ngx-signal-forms-renderer
npm version prerelease --preid beta --no-git-tag-version   # 0.0.1-beta.0 -> 0.0.1-beta.1 -> ...
# when ready to promote to a stable release on `latest`:
npm version 0.0.1 --no-git-tag-version                     # (or: patch/minor/major)
```

## Notes

- **Package name / orgs.** The package is published **unscoped** (`ngx-signal-forms-renderer`).
  Unscoped packages are standalone on the public registry; npm **orgs only apply to scoped names**
  (`@org/...`). So this never publishes under an org. Verify any time with a dry run from the built
  output:
  ```bash
  ng build ngx-signal-forms-renderer
  cd dist/ngx-signal-forms-renderer && npm publish --dry-run
  ```
  It prints `name: ngx-signal-forms-renderer` (no scope) and the target registry.
- **Auth & provenance.** Releases use [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
  (OIDC) — no `NPM_TOKEN` secret. The workflow's `id-token: write` lets npm mint a short-lived token
  and attach **provenance** automatically (no `--provenance` flag, public repo required).
- **Pre-1.0.** While on `0.x`, treat any release as potentially breaking (semver allows it).
- The demo site deploy (GitHub Pages, `.github/workflows/deploy.yml`) is separate from publishing.
