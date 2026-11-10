# Changelog

## 0.1.3 — 2026-11-09

### Changed

- **Breaking:** OMD is no longer confined to its own presets. The runtime row
  (`@jhcai11/oh-my-dsh`) is declared once at the profile's top level as
  `omd-runtime`, generated into `presets/omd-runtime.patch.yml`, so its tools,
  commands, skills, hooks, and durable `.omd/` state exist in every preset —
  including the shipped `standard`, `ptc`, `minimal`, and `cordis`. The former
  "zero intrusion" guarantee is retired.
- The OMD role is resolved per session from the active preset id instead of
  being pinned by the row's `agent` key: `omd-<role>` is that role, and any
  other preset gets the capability-only identity — the full orchestration
  surface, no OMD persona, no role restriction. The persona prompt section is
  read lazily and the tool restriction is re-applied on
  `agent-preset/selected`, so a preset picked before the first turn is the role
  the first turn runs under.
- `language` is a profile-wide row key now that there is one runtime row. The
  settings page's copyable override is the runtime row itself rather than a
  restatement of a preset's nested config.
- The eleven presets no longer contain a runtime row. They keep their ids, which
  is now the only thing that names their role.
- The doctor's `active-preset` check passes for a non-OMD preset and reports the
  resolved role or the capability-only identity; only a preset that cannot be
  read at all warns.

### Verified

- `tests/fixtures/omd-probe`, driven through `ctx.agentPresets.select` — the
  same call the picker makes — records fourteen `omd_*` tools on a `standard`
  session, and reproduces the historical per-role tool sets for all eleven OMD
  presets: atlas reads but does not write, oracle/librarian/explore/metis/momus
  neither write nor delegate, multimodal-looker sees only its allowlist, and
  sisyphus-junior writes but cannot re-delegate.
- `omd_look_at` resolves its `attachments`, `subagents`, and `fs` services per
  call through the Agent context instead of probing them when the row is
  applied. A top-level row is applied before agent-scoped services exist, so the
  probe silently dropped the tool; the four delegating roles have it again.

## 0.1.2 — 2026-11-09

### Fixed

- The settings page opened onto a red
  `失败: cannot get property "remote.commands" without inject` banner instead of
  a form. The asset's Client half declared only `slots` in `inject`, and the
  Client context refuses a property access it was not injected with:
  `remote.commands` needs its own declaration beside `remote`. The list now names
  every service that half reaches — `slots`, `locale`, `sessions`, `remote`,
  `remote.commands` — and `tests/contract.test.mjs` asserts it, because this
  failure only appears when the page is opened in a browser.

## 0.1.1 — 2026-11-09

### Added

- The first version published from CI. `.github/workflows/publish.yml` builds
  the `v0.1.1` tag on GitHub's runners, publishes it through npm Trusted
  Publishing (OIDC, with no npm token stored in the repository) and attaches a
  provenance attestation. Version 0.1.0 was published by hand, because a trusted
  publisher cannot be bound before the package exists on the registry.

## Unreleased

### Added

- A `language` plugin row key (`en` | `zh`, default `en`) that localizes the
  descriptions the model reads — tool, command, and bundled-skill descriptions —
  without touching prompt bodies, `SKILL.md` bodies, or any identifier. Set it
  per preset row in the profile's `cordis.patch.yml`.
- A settings page, `Settings → Oh-My-DSH`, that reads and writes the session
  workspace's `.omd/config.jsonc` (`keywordHook`, `delegation`, `taskSystem`,
  `diagnostics.commands`). Writes validate against
  `schema/omd-config.schema.json`, preserve comments and trailing commas, and
  never emit a BOM; a rejected value returns the validator's own message and
  leaves the file byte-identical. It reaches the preset through the existing
  preset-scoped `/omd-config` command, so no global command or row was added.
- `/omd-config` gained a `set <json>` write form beside its report form.

### Changed

- The package is published as `@jhcai11/oh-my-dsh`. The bare name `oh-my-dsh`
  belongs to an unrelated package, so the eleven preset patches are regenerated
  from the scoped name and their runtime row specifier follows it.
- The doctor is a skill, not a command. `/omd-doctor` is gone; all eleven roles
  carry the `omd-doctor` skill, which drives the new `omd_doctor` tool. A
  diagnosis now arrives as a tool result the model reads and reports, so a FAIL,
  its fix, and the re-check happen in one turn, and the command surface keeps
  only entries that own a Client cell.

### Fixed

- `active-preset` no longer warns inside an OMD session. The check read
  `SessionHeader.agentPreset`, which is immutable creation metadata: a session
  is created as `standard` and the picker choice arrives afterwards as an
  `agent-preset/selected` event, so the doctor printed `current preset is
  standard` while running inside `omd-sisyphus`. The active preset is now
  resolved from the live session's events, then the persisted log, and only then
  the header.
- The settings page's "no OMD command" notice printed the same sentence twice:
  it rendered `noCommand` as both the title and the body. That state has its own
  title and body now, and the body names the profile-level runtime row and where
  to check it.

## 0.1.0 — 2026-11-04

First release, aligned with oh-my-openagent v4.19.4
(`b072d279110bdda2c6ac2525d0d24dc54d16148a`).

### Added

- Eleven DSH agent presets: Sisyphus, Hephaestus, Prometheus, Atlas, Oracle,
  Librarian, Explore, Multimodal Looker, Metis, Momus, Sisyphus-Junior.
- `omd_delegate` with named-agent and category routing, foreground/background,
  per-provider/model concurrency, depth and allowlist checks, result files,
  cancellation, and `task_id` continuation.
- Background output/list/cancel tools and a durable task system.
- Session list/read/search tools with a disabled-search diagnostic.
- `.omd/` state: config, rules, plans, drafts, boulder slots, notepads, tasks,
  background records, results, ledger, handoff, evidence, logs.
- Planning, ultrawork, start-work/Atlas, review, hyperplan, team, handoff,
  init-deep, refactor, and AI-slop protocols.
- Thirteen commands and fifteen clean-room skills.
- Keyword mode detection, continuation, comment checker, rules injection,
  plan validation, model routing, and Prometheus/notepad write guards.
- Zero-intrusion bundle: only preset declarations are installed.
- Unit/integration tests, preset generator, parity matrix, provenance lock,
  MIT license, and NOTICE.
- A contract suite that fails the release check when the config schema, the
  documented override fields, the built-in category list, or the roster drift
  from the runtime.

### Added

- A browser asset package, `ui/`, mounted as its own top-level row by
  `presets/omd-ui.patch.yml`. Its `ui/client.js` registers one
  `conversation.chat.commandview` cell per OMD command, so a command result is
  readable the moment it settles; the shipped command card collapses a
  multi-line result to a one-line summary until the user clicks it, which made
  every report command look like it had done nothing.
- `omd-doctor` reports `client-half`, which reads
  `clientModules.clientPath` for the asset package and fails when the Host did
  not compose the UI bundle. Without it, "the renderer is broken" and "the
  bundle was never served" look identical from the session.
- `omd_ui_status`, a read-only tool that prints the client path, the Web boot
  graph entries and batches, and the Loader rows mentioning the bundle, so a
  browser-bundle failure can be diagnosed from inside a session.
- Each subagent preset description ends with a shared `DELEGATION_ONLY` marker
  naming `omd_delegate`. DSH's picker lists every registered preset and
  `PresetDefinition` has no hidden or selectable field, so roster order plus that
  marker is the only way to show that Oracle, Librarian, Explore, Multimodal
  Looker, Metis, Momus, and Sisyphus-Junior are delegation targets rather than
  roles that drive a session.

### Fixed

- Preset rows no longer mount
  `@deepseek-ai/dsh-tool-subagent-control/list-agents`. The installed DSH ships
  no such Loader row (`grep` finds the specifier nowhere in the application
  archive, and the shipped composition loads `dsh-tool-subagent-control` once),
  so the row never started. The preset registry audits every child row and marks
  the preset broken on a `never started` row, and the picker hides broken
  presets — so all four delegating presets silently vanished from the
  new-session selector while `/omd-*` still worked in sessions created earlier.
  `npm run check` and `tests/contract.test.mjs` now reject that specifier.
- The browser asset row named a directory, so the loader failed it with
  `ERR_UNSUPPORTED_DIR_IMPORT` and left it inactive; the bundle was never
  composed and every command row kept the collapsed card.
  `presets/omd-ui.patch.yml` now names `../ui/index.js`.
- `DEFAULT_AGENT_SETTINGS` no longer carries an `enabled` field that nothing
  read and the schema did not declare, and it now declares `modelRef` and
  `allowedSubagents`, which the runtime and `docs/configuration.md` support.
- A report command no longer submits its own text as a user message. The first
  live session showed the commands executing with no readable output, and the
  first fix submitted the text through `agent.followup()`, which also woke the
  agent and made it answer its own command output. The Client renderer replaces
  that: visible output, no model turn.

### Deferred

A dashboard page and the wider Client UI surface, Team Mode `team_*` tools,
hashline edit, interactive tmux, skill-embedded MCP, CodeGraph, Claude Code
hooks, dynamic model fallback chains, and nine domain skills. See
`docs/parity-omo-4.19.4.md`.
