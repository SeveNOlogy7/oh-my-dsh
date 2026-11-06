# Releasing Oh-My-DSH

This document is the complete release path for the project: the GitHub
repository, the npm package, and the submission to the DSH plugin market.

Current state at the time of writing:

- The public GitHub repository is
  <https://github.com/SeveNOlogy7/oh-my-dsh> (default branch `main`).
- `package.json` still carries `"private": true` on purpose. GitHub-only
  distribution works in that state; npm publishing does not.
- The bare npm name `oh-my-dsh` is already taken by an unrelated package, so
  this project must publish under a **scope**, for example
  `@your-scope/oh-my-dsh`. The final scope is a human decision; nothing in the
  repository guesses it. Everywhere below, `<scope>` is a placeholder.
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

3. Inspect the real tarball contents before publishing. The `files` allow-list
   in `package.json` decides what ships:

   ```
   npm pack --dry-run
   ```

   Confirm that `runtime.js`, `ui/`, `src/`, `prompts/`, `skills/`,
   `presets/`, `schema/`, `upstream/`, `docs/`, `locale/*.json`, `icon.svg`,
   both READMEs, `CHANGELOG.md`, `LICENSE`, and `NOTICE` are present, and that
   `.omd/`, `node_modules/`, tests, and scripts are absent.

4. Re-run the gates against the renamed manifest:

   ```
   npm test
   npm run check
   ```

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

## 3. Submit to the plugin market

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
- [ ] `npm pack --dry-run` shows the intended files only.
- [ ] `npm test` and `npm run check` pass.
- [ ] Working tree clean, on `main`.
- [ ] `npm publish --access public` succeeded and `npm view` confirms it.
- [ ] `v<version>` tag pushed.
- [ ] Market PR adds exactly `data/plugins/SeveNOlogy7__oh-my-dsh.yml`.
- [ ] No README in the market repository was hand-edited.
