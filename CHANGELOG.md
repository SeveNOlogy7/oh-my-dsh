# Changelog

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

## Unreleased

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
