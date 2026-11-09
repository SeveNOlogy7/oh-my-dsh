# Releasing Oh-My-DSH

This document is the complete release path for the project: the GitHub
repository, the npm package, and the submission to the DSH plugin market.

Current state at the time of writing:

- The public GitHub repository is
  <https://github.com/SeveNOlogy7/oh-my-dsh> (default branch `main`).
- The package is published as `@jhcai11/oh-my-dsh`. The bare name `oh-my-dsh` is
  taken by an unrelated, unmaintained `0.1.7` package, which is why a scope is
  required; `publishConfig.access` is `"public"`, which a scoped package needs to
  be publicly installable.
- The preset patches under `presets/` embed this package's module specifier,
  generated from `package.json`'s `name` by `scripts/generate-presets.mjs`, so a
  rename always means regenerating them in the same commit. Step 1 keeps that
  procedure for the next rename; it is already applied for the current name.
- Later versions are published by `.github/workflows/publish.yml`; only the first
  version needed a manual publish.

## 1. Prepare the scoped package name

Scoped packages are private by default unless `--access public` is passed.
`publishConfig.access: "public"` in `package.json` covers that, but the name
itself must change first.

1. Log in to the registry that owns (or will own) the scope:

   ```
   npm login
   npm whoami
   ```

   `npm whoami` must print your npm username. If it fails, the login did not
   take effect and `npm publish` will fail with `401`.

2. Rename the package. Only `name` and `private` change; do not touch
   `version`, `dsh`, `exports`, or `files` at this step:

   ```
   npm pkg set name=@jhcai11/oh-my-dsh
   npm pkg delete private
   ```

   Removing `private: true` is mandatory: npm refuses to publish a package
   marked private. That flag exists only so the GitHub-only phase cannot be
   published by accident.

3. Regenerate the preset patches. This is a functional step, not a cosmetic
   one:

   ```
   npm run generate:presets
   ```

   The eleven agent-preset rows under `presets/` reach this package through a
   module specifier, and the generator derives that specifier from
   `package.json`'s `name`. The specifier is resolved from the profile's
   `node_modules`, so leaving a stale value after a scoped rename would leave
   all eleven presets mounting a module that cannot resolve. The bare name is
   not a safe fallback either: the unrelated, unmaintained `oh-my-dsh` package
   that occupies that name on npm could be resolved instead. The rename
   rewrites every patch file under `presets/`; commit them together with
   the manifest.

   The `private` assertions in `scripts/check.mjs` and
   `scripts/check-version.mjs` contradict step 2, so the same release commit
   updates both. Until they are updated, `npm run check` fails with
   `package.json is private; npm publish would be refused` — that failure is
   expected after step 2 and must be fixed in the assertions, never by restoring
   `private`.

4. Inspect the real tarball contents before publishing. The `files` allow-list
   in `package.json` decides what ships:

   ```
   npm pack --dry-run
   ```

   Confirm that `runtime.js`, `ui/`, `src/`, `prompts/`, `skills/`,
   `presets/`, `schema/`, `upstream/`, `docs/`, `locale/*.json`, `icon.svg`,
   both READMEs, `CHANGELOG.md`, `LICENSE`, and `NOTICE` are present, and that
   `.omd/`, `node_modules/`, tests, and scripts are absent.

5. Re-run the gates against the renamed manifest:

   ```
   npm test
   npm run check
   npm run check:presets
   ```

   `npm run check` must print `check ok: ...`, and `npm run check:presets` must
   exit `0` with no output. `check:presets` is silent when the committed patches
   match the generator; it fails with `out of date: <path>` for every patch that
   does not. `npm test` must be green too.

## 2. Publish to npm

Publish from a clean checkout of `main` with a clean working tree:

```
git status
npm publish --access public
```

`--access public` is what makes the scoped package installable by everyone;
without it a scoped publish defaults to restricted.

Verify the published artifact:

```
npm view @jhcai11/oh-my-dsh version
npm view @jhcai11/oh-my-dsh dist.tarball
```

Then record the release in git so the tag and the registry agree:

```
git tag v0.1.0
git push origin v0.1.0
```

Notes:

- Publishing is irreversible for a given version: `npm publish` refuses a
  version that already exists. Bump `version` in `package.json` for every new
  release and update `CHANGELOG.md`.
- Never publish from a dirty working tree; the tarball would contain code that
  does not exist in any commit.
- Two-factor authentication may prompt on publish. Have the authenticator ready.

## 3. Publish later versions from CI

Once the package exists on npm, every later version is published by
`.github/workflows/publish.yml`. No npm token is stored in the repository.

One-time binding, after step 2 has put the first version on the registry:

```
npm trust github @jhcai11/oh-my-dsh \
  --file publish.yml \
  --repo SeveNOlogy7/oh-my-dsh \
  --allow-publish
```

`npm trust` requires npm >= 11.15.0 and two-factor authentication enabled on the
account, and the package must already exist on the registry — which is why step
2 comes first. Omitting `--repo` takes `repository.url` from `package.json`,
which already points here. The website equivalent is the package's
**Settings → Trusted publishing** section, where the same values are entered as
publisher GitHub Actions, organization/user `SeveNOlogy7`, repository
`oh-my-dsh`, workflow filename `publish.yml`.

Two operational details from the npm documentation:

- A new trusted-publisher configuration must complete its **first successful
  publish within two days**, or it expires and cannot be edited. Bind it when a
  release is ready, not in advance.
- Once it works, **Settings → Publishing access → "Require two-factor
  authentication and disallow tokens"** removes the token path entirely; trusted
  publishers keep working because they use OIDC.

The workflow's publish job then holds `id-token: write`, so its runner requests
an OIDC token and npm exchanges it for a short-lived publish credential.

Releasing a version:

```
# bump and document
npm version patch --no-git-tag-version      # or edit package.json by hand
$EDITOR CHANGELOG.md
git add -A && git commit -m "release: 0.1.1"
git push origin main

# tag it — this is what triggers the publish
git tag v0.1.1
git push origin v0.1.1
```

The workflow refuses to publish unless the tag equals `package.json`'s version
and `private` is gone, and it runs `node scripts/check.mjs`,
`node scripts/generate-presets.mjs --check`, `npm test` and
`npm pack --dry-run` first. It publishes with `--provenance`, so the npm page
shows an attestation linking the tarball to this repository and commit, then it
opens a GitHub release for the tag.

`workflow_dispatch` runs the same gates plus `npm publish --dry-run` without
publishing; use it to rehearse a release.

### If you prefer a token

A granular access token works too and needs no npm-side binding: add it as the
repository secret `NPM_TOKEN`, restore `registry-url: 'https://registry.npmjs.org'`
on `actions/setup-node` in the publish job, and set
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step. Trusted
publishing is preferred: a token is a long-lived credential that has to be
rotated and revoked, while the OIDC exchange is per run.

## 4. Submit to the plugin market

The DSH plugin market is the `awesome-dsh-plugin/awesome-dsh-plugin`
repository. Submission is a pull request that adds **exactly one** new file
under `data/plugins/`.

### File name

```
data/plugins/<owner>__<repo>.yml
```

For this project:

```
data/plugins/SeveNOlogy7__oh-my-dsh.yml
```

Two underscores separate owner and repository. Do not add a second file, do not
modify an existing entry, and do not edit any README in that repository: the
READMEs there are **generated** from `data/`, and hand edits are overwritten.

### File content

```yaml
url: https://github.com/SeveNOlogy7/oh-my-dsh
name: SeveNOlogy7/oh-my-dsh
category: workflow
description:
  en: Agent orchestration for DeepSeek Harness with eleven selectable presets, planning, delegation, review gates and durable project state.
  zh: 面向 DeepSeek Harness 的智能体编排插件：11 个可选 preset、规划、委派、评审门与 .omd 持久状态。
```

Field rules:

- `url` — required, and it must be **exactly** the repository URL
  (`https://github.com/SeveNOlogy7/oh-my-dsh`). A trailing slash or a different
  casing is a mismatch.
- `name` — required, the `owner/repo` form: `SeveNOlogy7/oh-my-dsh`.
- `category` — required, `workflow` for this plugin.
- `description` — a mapping with `en` and `zh`; `en` is required, `zh` may be
  left out for a maintainer to add. Each is **one line** ending with a period,
  and a value containing a colon followed by a space must be quoted because YAML
  would otherwise read it as a nested key. The nested form above is what the
  catalog's own `contributing.md` documents; a flat `description.en:` key is not
  the same field.
- `icon` — optional, and it must be a GitHub-hosted **raster** image. This
  repository ships `icon.svg`, which is the right format for the DSH plugin row
  but **not** for the market tile, so the entry omits `icon` and the market falls
  back to the owner's avatar.
- Any scope rename in step 1 does **not** change the values here: `url` and
  `name` always describe the GitHub repository, not the npm package.

### Ordering requirement

The market index only lists plugins that are **published on npm with a known
version**. Open the pull request **after** step 2 has succeeded and
`npm view @jhcai11/oh-my-dsh version` returns the version you just published.
A PR for a plugin that is not on npm is rejected or left unlisted.

### Opening the pull request

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin` and clone your fork.
2. Create a branch, for example `add-oh-my-dsh`.
3. Add the single file `data/plugins/SeveNOlogy7__oh-my-dsh.yml` with the
   content above.
4. Validate the YAML locally (for example
   `node -e "import('yaml').then(...)"` or any YAML linter) and confirm the
   description is one line ending in a period.
5. Commit with an English message, push, and open the PR against `main`.
6. In the PR description, link the npm package and this repository, and state
   the published version.

## Release checklist

- [ ] `npm whoami` returns the expected account.
- [ ] `package.json` has `name: @jhcai11/oh-my-dsh` and no `private` field.
- [ ] `version`, `dsh`, `exports`, and `files` are unchanged by the rename.
- [ ] `npm run generate:presets` was run and the twelve `presets/` patches are
      committed with the rename.
- [ ] The `private: true` assertion in `scripts/check.mjs` was updated in the
      same commit.
- [ ] `npm pack --dry-run` shows the intended files only.
- [ ] `npm test` and `npm run check` pass, and `npm run check:presets` exits
      `0` with no `out of date` line.
- [ ] Working tree clean, on `main`.
- [ ] `npm publish --access public` succeeded and `npm view` confirms it — the
      first version only; later versions are published by CI.
- [ ] Trusted Publisher bound with `npm trust github` (or the package's
      Settings → Trusted publishing) and its first publish done within two days.
- [ ] `v<version>` tag pushed and the publish workflow finished green.
- [ ] The npm page shows the provenance attestation for the published version.
- [ ] Market PR adds exactly `data/plugins/SeveNOlogy7__oh-my-dsh.yml`.
- [ ] No README in the market repository was hand-edited.
