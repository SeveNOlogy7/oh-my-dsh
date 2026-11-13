# Changelog

## 0.1.4 — 2026-11-13

> 0.1.3 was committed on 2026-11-09 but never tagged or published (no `v0.1.3`
> tag, no GitHub release, no npm version). 0.1.4 is the first release that ships
> the 0.1.3 changes together with the work below.

### Added

- **Ultrawork gates are enforced, not just described.** `ultrawork.requirePlanGate`
  and `ultrawork.dualEvidence` were schema keys the runtime never read, and the
  prompt's "baseline before editing" step had no mechanism at all. The per-agent
  tool guard now refuses a deliverable `write`/`edit` (inside the workspace,
  outside `.omd/`) until `.omd/plans` holds a non-draft plan with task rows
  written or updated after this ultrawork run started (the boulder's active plan
  is always accepted), and a new `ultrawork.requireBaseline` (default `true`)
  refuses the first one until a verification command has run. Verification
  commands are recognized through shell quoting and absolute `node.exe` paths, so
  a bundled-node `& '…\node.exe' --test` run counts. `tools/post-execute` records
  baseline runs,
  successful verification runs, and deliverable writes; at turn-stopping,
  `dualEvidence` keeps a turn open when deliverables were written (or a plan was
  completed) but nothing was verified, and lets a completed plan with evidence
  close instead of nudging it open again. A timed-out or signal-killed run is a
  successful tool call with `[exit code: null]`, so it is treated as a failed
  verification rather than evidence. The settings page exposes all three as
  controls instead of listing them as reserved.
- **Graphical model-chain fallback editor in `Settings → OMD`.** The
  Agents / categories / models section is now a chain board: every role and
  category shows its ordered primary → fallback steps, catalog aliases resolve
  inline, inherited/default values are marked, and the exact JSON document stays
  available in an advanced disclosure. Every graph action edits the same
  document, so the existing minimal-diff save path, validator, and reset rules
  are unchanged.
- **Ordered model chains with automatic fallback.** `agents.<id>.chain` and
  `categories.<name>.chain` accept an ordered array of catalog aliases,
  `provider/model` strings, or inline route objects. When a model request fails
  and no retry policy claims it, OMD records the next route with
  `agent.model.select()` and starts a continuation turn on it after the failed
  turn closes. The category a delegation routed through now travels on the
  child's descriptor label as `omd:<role>@<category>` so the child falls back
  through the category chain. After a completed fallback turn the next turn
  tries the primary again.

### Fixed

- **Keyword activation only fires on a directive.** The detector matched
  `ultrawork`/`ulw`/`team`/`hyperplan` anywhere in a human message, so a question
  *about* ultrawork switched the session into it (and into continuation rounds).
  A mode keyword now counts only in directive position: the bare first word, a
  `word:` prefix, `/word`, or a `[word]` tag. `hyperplan-ulw` remains available
  as an explicit directive; the old `hyperplan` + `ulw` pair no longer combines.
- **`omd_ui_status` no longer reports `loader scan failed`.** `loader.entries()`
  is a generator, so the scan called `.filter` on a non-array and lost the loader
  rows. The scan now normalizes arrays, Maps, iterables, and `toArray()` results
  before filtering.
- **Model routing actually applies on DSH 0.2.2-rc.1.** The old hook changed
  provider/model/effort through the deprecated `agent/request` waterfall, which
  now rejects such a step before it commits input (the loop keeps the selection
  it captured before preparation). Routing now records the route through
  `agent.model.select()`; `agent/request` only applies the step's temperature
  and output cap.
- **Sessions no longer die with `Unsupported message role: undefined`
  (`UNSUPPORTED_CONTENT`).** `agent.followup()` and `agent.steer()` are typed as
  a complete `UserMessage` — `{id, role: 'user', content, source}` — and DSH
  persists what it is given verbatim: it fills in neither `role` nor `id`. OMD
  passed `{content, source}` (the shape DSH's own README example shows), so the
  durable log received a message with `role: undefined` and **every** later
  request of that session failed in the provider adapter. `/omd-ulw`,
  `/omd-plan`, `/omd-hyperplan`, `/omd-team`, `/omd-start-work`,
  `/omd-init-deep`, `/omd-refactor`, `/omd-remove-ai-slops`, the continuation
  steer, and the comment-checker feedback contexts all built messages by hand
  and were all affected. They now share `src/core/message.js`, and
  `tests/message-contract.test.mjs` asserts the full contract on every message
  OMD constructs. Sessions already poisoned by the old build need their log
  repaired; the record to fix is the `user/message` with no `role`.
- **The keyword hook now fires.** A `user/message` session event carries the
  message ITSELF as its data (`SessionEventMap['user/message'] = UserMessage`);
  the `{..., message}` wrapper belongs to assistant/system/tool records only.
  The listener read `event.data.message.content`, so the text was always empty,
  `detectMode()` never ran, and prose-triggered mode switching, the mode-text
  refresh, and the `keyword-mode` ledger row were dead. OMD-injected text
  (continuation steers, tool feedback) now carries `source.kind: 'omd'` and the
  hook reads only `source.kind: 'user'`, so a plan title containing "team" can no
  longer select a mode.
- **`/omd-handoff` and `omd_session_read` keep the user turns.** Both read the
  assistant-shaped `data.message` wrapper for `user/message` too, so every human
  instruction was silently dropped — from the handoff document a new session is
  told to trust, and from the transcript the model reads back.
- **The on-disk session fallbacks work again.** `resolveActivePreset` and
  `resolveDescriptorRole` extracted `sessionQuery.readSession` into a local and
  called it detached; it is a class method reading `this._corpus`, so the call
  threw a `TypeError` that the surrounding catch reported as "no answer". A
  session whose role only the persisted log carries now resolves it.
- **The settings page no longer executes `/omd-config` in the open session.**
  Every mount of `Settings → Oh-My-DSH` used to call
  `ctx.remote.commands.execute(...)`, which appended a `command/run` +
  `command/done` pair to the session log just because a settings page opened.
  The page now posts the same `/omd-config [set <json>]` line to its own
  endpoint, `POST api/omd/config`, registered by the runtime row through
  `ctx.connection.fetch.register` — DSH's authenticated `/api` channel applies
  the Host/Origin fence and the browser cookie, so no token lives in OMD code,
  and no command record is ever written. The endpoint names a session only to
  ask which workspace to show; the Host resolves that directory itself (live
  header, then the persisted log, then the profile default), so the browser
  never names a path and the page works with no session open.

### Fixed by the full-surface verification (2026-11-13)

A verification pass over every shipped capability (10 gates, 18 visible tools,
13 commands, 15 skills, 7 modes, the config system, the client half, i18n,
docs parity, packaging) produced 12 findings and a report at
`docs/feature-verification-2026-11-13.md`. All 12 are fixed; the two whose
surface is reachable from tools were re-checked on a restarted Host.

- **Blocked keys are stripped at every depth.** `mergeDeep` guarded only the
  level it iterated and copied a whole subtree when the target path did not
  pre-exist, so a nested `__proto__`/`prototype`/`constructor` reached the
  resolved config and made the settings write degrade to a comment-losing
  rewrite. `sanitizeValue` now strips recursively in `mergeDeep` and
  `normalizeConfig`, and a patch whose only content was blocked keys is a usage
  refusal instead of a silent rewrite. `Object.prototype` was never polluted.
- **An effort-only delegation override no longer demotes the primary.** With a
  configured model chain, `omd_delegate({reasoning_effort})` merged the override
  through the legacy resolver, which cannot see a chain, so step 0 became
  invalid and the first fallback ran without the requested effort. A partial
  override now overlays the step that would actually run.
- **`/omd-stop-continuation` no longer manufactures a paused boulder.** With no
  boulder slot it pauses nothing, says `no boulder to pause`, and writes no
  slot (previously it created one and the board reported an open paused boulder).
- **A continued delegation reports `unknown`, not `running`.** OMD cannot observe
  a continued child's end, so the record used to stay `running` forever and the
  board counted a finished child as active; the record now says `unknown` with a
  continuation note, and the child's result still arrives as a completion notice.
- **The board no longer counts soft-deleted tasks.** `TaskStore.summary()`
  excludes `status: "deleted"`; `omd_task_list` still shows the rows.
- **`npm run check:license` reports "unmeasured" as `exit 2`** instead of a green
  skip when `OMD_UPSTREAM_DIR` is unset (0 = measured and within threshold,
  1 = over threshold). The real overlap audit remains unmeasured by design.
- **The parity gate checks both directions.** `scripts/check-parity.mjs` used to
  prove only that known names appear in the doc; it now also fails on a
  documented token that resolves to no entity, checks the Agents table exactly,
  and reads its canonical lists from `src/tools/names.js` /
  `src/commands/names.js` (pinned to the runtime by a test).
- **`docs/tools.md` documents conditional registration** (`omd_lsp` needs
  `ctx.lsp`, `omd_diagnostics` needs `ctx.subprocess`, the delegation tools need
  a delegating role plus `subagents`, and the task tools are denied by a
  restriction while `taskSystem.enabled` is false).
- **Dead client i18n keys removed** (`errJson`, `projectTitle`, `readonlyFile`,
  `tiers`), from both dictionaries; `probe-c-i18n` now reports no unreachable
  key, and a regression test keeps them out.
- **Historical doc counts annotated** in `docs/verification.md` (`14 skills` is
  the 2026-11-04 revision; 15 today), and the stale evidence artifacts were
  refreshed (`repro-defects.mjs` is now a regression check that exits 0).

### Added

- `engines.dsh: "^0.2.1-rc.5"`, an explicit DSH compatibility claim. DSH reads
  `engines.dsh` alone and evaluates it with prereleases included, so the caret
  form is deliberate: a plain `<0.3.0` upper bound would still admit
  `0.3.0-alpha.1`, while `<0.3.0-0` excludes the whole unverified next minor.
  The floor is the build the bundle was boot-verified against, and the upper
  build is the one the role channel was verified end-to-end on. Widening the
  range means re-running the verification recorded in `docs/verification.md`.
- `/omd-config` gained a second write form: `set {"patch": {…}, "unset":
  [["delegation","maxConcurrent"], …]}` applies one partial patch and deletes key
  paths from the same `.omd/config.jsonc` in one request. Both keys are optional
  and at least one must be non-empty; a path the file does not set is a no-op,
  the patch wins on overlap, validation runs on the merged document, and a
  rejected write still leaves the file byte-identical. The answer's `write`
  object reports the paths actually removed in `unset`.

### Changed

- **Breaking:** OMD registers no per-role agent preset any more. The eleven
  `presets/omd-*.patch.yml` files are gone and `dsh.bundle.patch` lists only
  `omd-runtime` and `omd-ui`. DSH's preset picker lists every registered preset,
  `PresetDefinition` has no hidden/selectable field, and a preset cannot be
  switched once a session's first turn starts — so those eleven entries could
  only mislead. A role now travels on the delegated child's own
  `subagent/descriptor` label (`omd:<role>`), which
  `src/state/active-role.js` reads back off the child's session log. The
  per-role preset stays only as a compatibility fallback, so a session allocated
  by an older install still resolves its role.
- Delegation no longer pins the child's preset. A delegated child inherits the
  parent's preset through DSH's own `composeFrom` path; `delegation.childPreset`
  (default `null`) is the one override, and only a non-empty trimmed string
  names a preset.
- A category delegation now labels its child with the executor role
  (`omd:sisyphus-junior`) rather than the category name. The old hard-coded
  `omd-sisyphus-junior` preset used to carry that role, so removing the presets
  would otherwise have left every category-delegated child capability-only.
- The doctor gained an `active-role` row reporting the runtime's single role
  resolution, and its `presets` row now PASSES only when no `omd-*` preset is
  left registered, FAILING with each leftover's own reason. The `active-preset`
  row stays, but no longer tells anyone to select an OMD preset.
- The settings page covers the runtime's effective configuration surface instead
  of the first version's handful of keys: six control groups (general, keyword
  activation, delegation, hooks and continuation, rules, diagnostics) plus the
  agents/categories/models JSON document. Each field is tagged `in file` or
  `inherited`, or shows the built-in value as `Default: …`; a save writes only
  the keys the user changed; and a reset stages a removal (the new `unset` form)
  so the inherited value applies again. The JSON document edits this file's own
  overrides, never the merged value, so one edit cannot copy inherited entries
  into the file. Provenance and resets are computed from the envelope's new
  `layers` (every parsed layer with the top-level keys it sets, farthest first)
  and `defaults` (a clone of the built-in defaults); a Host from before this page
  version sends neither, and the page then keeps the legacy `set {<patch>}` write
  form and offers no reset; a removal requested against that older Host is
  reported as blocked and named, never sent as a line that Host would refuse.
  Keys the schema accepts but the runtime does not read are reported as reserved
  instead of getting a control that would change nothing. The diagnostics control
  keeps keys it cannot show (such as `glob`) on every entry the user did not
  rewrite, and clearing a value only an inherited layer provides writes nothing
  and says so instead of looking like a silent no-op.
- The settings page validates a value in the browser with the same rules the
  Host enforces — integer minimums, `commentChecker` membership, the JSON
  document's shape — so a bad value is an inline error and a disabled save rather
  than a round trip. The Host stays the authority, and its validator message is
  shown if it rejects the write anyway.

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
