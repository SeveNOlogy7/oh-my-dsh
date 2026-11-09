# Releasing Oh-My-DSH

This document is the complete release path for the project: the GitHub
repository, the npm package, and the submission to the DSH plugin market.

Current state at the time of writing:

- The public GitHub repository is
  <https://github.com/SeveNOlogy7/oh-my-dsh> (default branch `main`).
- `package.json` still carries `"private": true` on purpose. GitHub-only
  distribution works in that state; npm publishing does not.
- The bare npm name `oh-my-dsh` is already taken by an unrelated, unmaintained
  `0.1.7` package, so this project must publish under a **scope**, for example
  `@your-scope/oh-my-dsh`. The final scope is a human decision; nothing in the
  repository guesses it. Everywhere below, `<scope>` is a placeholder.
- The preset patches under `presets/` embed this package's module specifier,
  generated from `package.json`'s `name` by `scripts/generate-presets.mjs`.
  They must be regenerated in the same commit as the rename; see step 3.
- `publishConfig.access` is already `"public"`, which is required for a scoped
  package to be publicly installable.

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
   npm pkg set name=@<scope>/oh-my-dsh
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
   rewrites the twelve patch files under `presets/`; commit them together with
   the manifest.

   The `private: true` assertion in `scripts/check.mjs` contradicts step 2, so
   the same release commit updates that assertion. Until it is updated,
   `npm run check` fails with `package must be private` — that failure is
   expected after step 2 and must be fixed in the assertion, never by restoring
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
npm view @<scope>/oh-my-dsh version
npm view @<scope>/oh-my-dsh dist.tarball
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
npm trust github <scope>/oh-my-dsh \
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
description.en: Agent orchestration for DeepSeek Harness with eleven selectable presets.
description.zh: 面向 DeepSeek Harness 的智能体编排插件，提供 11 个可选 preset。
icon: https://raw.githubusercontent.com/SeveNOlogy7/oh-my-dsh/main/icon.svg
```

Field rules:

- `url` — required, and it must be **exactly** the repository URL
  (`https://github.com/SeveNOlogy7/oh-my-dsh`). A trailing slash or a different
  casing is a mismatch.
- `name` — required, the `owner/repo` form: `SeveNOlogy7/oh-my-dsh`.
- `category` — required, `workflow` for this plugin.
- `description.en` — required, **one line**, and it must end with a period.
- `description.zh` — optional, same one-line rule.
- `icon` — optional; the raw URL above points at the repository's `icon.svg`.
- Any scope rename in step 1 does **not** change the values here: `url` and
  `name` always describe the GitHub repository, not the npm package.

### Ordering requirement

The market index only lists plugins that are **published on npm with a known
version**. Open the pull request **after** step 2 has succeeded and
`npm view @<scope>/oh-my-dsh version` returns the version you just published.
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
- [ ] `package.json` has `name: @<scope>/oh-my-dsh` and no `private` field.
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
