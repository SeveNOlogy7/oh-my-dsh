# Oh-My-DSH

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B32C3.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)
[![npm](https://img.shields.io/badge/npm-not%20published%20yet-lightgrey.svg)](#install-from-npm)
[![GitHub](https://img.shields.io/badge/GitHub-SeveNOlogy7%2Foh--my--dsh-181717.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)

English | [简体中文](README.zh-CN.md)

Agent orchestration for **DeepSeek Harness**, aligned with
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) **v4.19.4**
(commit `b072d27`).

Oh-My-DSH adds eleven OMD orchestration roles and a durable `.omd/`
orchestration state: planning, interviews, delegated workers, background
tasks, review gates, evidence, and handoff. It is a **clean-room capability
port**: no upstream code or prompt text is copied. See `NOTICE` and
`upstream/omo-sources.lock.json`.

## Install from npm

```
npm install @jhcai11/oh-my-dsh
```

or add the bundle straight into a DSH profile:

```
dsh plugin --profile <profile> add @jhcai11/oh-my-dsh
```

The bare name `oh-my-dsh` belongs to an unrelated package, which is why this one
is scoped. [`docs/releasing.md`](docs/releasing.md) records the release path: the
scoped rename, `npm publish --access public`, publishing later versions from CI
with provenance, and the market submission.

## Install

The bundle declares `engines.dsh: "^0.2.1-rc.5"`, so DSH refuses to install or
activate it on a build outside that range. The floor is the version the bundle
was boot-verified on; the running `0.2.2-rc.1` is the version the delegation
role channel was verified end-to-end on. See
[Declared DSH compatibility](docs/verification.md#declared-dsh-compatibility-2026-11-10)
for the evidence behind each bound.

From this checkout, install the bundle into the current DSH profile:

```
plugin_manager install_bundle  target: E:\Oh-My-DSH
```

Or from a terminal:

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

The install adds one profile-level runtime row, `omd-runtime`, generated into
`presets/omd-runtime.patch.yml`, plus the browser asset row `omd-ui`. That
single runtime row is what carries the tools, commands, skills, and hooks, so
OMD orchestration is available in **every** preset — including the shipped
`standard`. OMD registers **no** agent preset of its own: a role travels on the
delegated child's `subagent/descriptor` label, written as `omd:<role>` (a
category delegation appends `@<category>`), and the
runtime reads it back off the child's own session log. A session that carries no
role runs **capability-only**: orchestration is available, with no persona
prompt and no role restriction. If the app was already running, restart it once
so the current runtime module generation is loaded.

### Language

The language switch for OMD tool, command, and skill descriptions is an OMD
configuration concern, not an install-time flag. The complete description lives
in [`docs/configuration.md`](docs/configuration.md).

## Use

1. Run `/omd-init` to create `.omd/`. This works in any preset.
2. Run the `omd-doctor` skill to verify the composition.
3. Use `/omd-ulw <goal>`, `/omd-plan <goal>`, `/omd-start-work`, or just ask.

Roles are what a **delegated child** runs as: `omd_delegate` writes the target
role onto the child's subagent descriptor label (`omd:<role>`), and `omd_look_at`
does the same with the multimodal-looker role. A root session has no such
label, so it stays capability-only. The label is the only channel that names a
role — OMD ships no preset to select.

Presets are chosen before the first turn. `delegation.childPreset` in
`.omd/config.jsonc` decides the preset a delegated child composes from: `null`
(the default) inherits the parent session's preset, and a non-empty id pins that
one.

| Role | Purpose |
|---|---|
| `sisyphus` | orchestrator |
| `hephaestus` | autonomous deep worker |
| `prometheus` | interview planner |
| `atlas` | plan conductor (read-only) |
| `oracle` | read-only architecture consultant |
| `librarian` | read-only docs/OSS researcher |
| `explore` | read-only codebase scanner |
| `multimodal-looker` | read-only visual analyst |
| `metis` | plan gap analyst |
| `momus` | adversarial reviewer |
| `sisyphus-junior` | delegated task executor |

## Commands

`/omd-init`, `/omd-status`, `/omd-config`,
`/omd-ulw`, `/omd-plan`, `/omd-hyperplan`, `/omd-team`,
`/omd-start-work`, `/omd-stop-continuation`, `/omd-handoff`,
`/omd-init-deep`, `/omd-refactor`, `/omd-remove-ai-slops`.

`/goal` is provided by DeepSeek Harness itself.

The doctor is a skill rather than a command: every OMD role carries
`omd-doctor`, and it drives the `omd_doctor` tool so the diagnosis and the
repair happen in one turn. See `docs/commands.md` and `docs/tools.md`.

`Settings → OMD` is the bundle's settings page: it reads and writes the current
workspace's `.omd/config.jsonc` — keyword activation, delegation, the task
system, hooks and continuation, rules, diagnostics, and the
agents/categories/models overrides — and shows where each value comes from, so a
value this file sets can be removed and the inherited one apply again. The
agents/categories/models overrides are a graphical chain board: ordered primary
and fallback steps, catalog aliases, inherited values, and the advanced JSON
document remain one click away. A read-only block reports the effective language
and routing tiers with their source. It talks to the plugin row over its own
authenticated endpoint, so opening the page never executes a command in a
session. See `docs/configuration.md`.

## Tools

`omd_delegate`, `omd_background_output`, `omd_background_cancel`,
`omd_background_list`, `omd_session_list`, `omd_session_read`,
`omd_session_search`, `omd_task_*` (opt-in), `omd_notepad`, `omd_lsp`,
`omd_diagnostics`, `omd_look_at`, `omd_mode`, `omd_status`, `omd_doctor`.

## Where OMD lives

- The runtime is mounted once, at the profile's top level, so OMD
  tools/commands/hooks/skills and the `.omd/` layout are reachable from every
  preset. The former "zero intrusion" guarantee is retired.
- Installing the bundle changes no default preset. `.omd/` is written only when
  a session actually uses an OMD command, tool, or the keyword hook.
- The role (persona, tool policy, write scopes, skill set) is resolved in one
  place, in this order: an `agent` pinned on the mounting row, then the child's
  own `omd:<role>` descriptor label, then a pre-existing `omd-<role>` preset as
  the compatibility fallback for sessions created before OMD stopped publishing
  one preset per role. A session that resolves none of them runs
  capability-only, with no persona injected and no role restriction.
- OMD registers no preset, so the New Session picker offers no OMD entry, and no
  leftover `omd-*` preset should be registered either: the doctor's `presets`
  check fails when one comes back.
- Keyword activation (`ulw`, `team`, `hyperplan`) is on everywhere and can be
  disabled in `.omd/config.jsonc`. A keyword only counts as a directive — the
  bare first word, `word:`, `/word`, or `[word]` — so a message that merely
  mentions the mode does not switch it.
- The `ultrawork` gates are enforced, not just described: a deliverable write is
  refused until a non-draft plan with task rows exists, the first one also needs
  one baseline verification run, and a turn that wrote deliverables stays open
  until a successful verification is recorded. Each gate has its own
  `ultrawork.*` switch in `.omd/config.jsonc`.

## Verify

```
npm test
npm run check
```

Then in a new OMD session run the `omd-doctor` skill: it calls the
`omd_doctor` tool and reports PASS/WARN/FAIL with a fix for each failure. See
`docs/install-verify.md` and the recorded `docs/verification.md` for the
mount-probe evidence and the remaining manual gate.

## Scope for v0.1.0

The orchestration loop is complete: eleven roles, category and named-agent
delegation, background queue and results, plans, boulder slots, notepads,
review verdicts, sessions, tasks, rules, model routing with ordered fallback
chains, and the ultrawork, plan, start-work, hyperplan, team, review, handoff,
init-deep, refactor, and AI-slop protocols.

Host-bound OmO 4.19.4 features are mapped or deferred with reasons in
[`docs/parity-omo-4.19.4.md`](docs/parity-omo-4.19.4.md): dashboard/Client UI,
Team Mode's `team_*` tool family, hashline edit, interactive tmux,
skill-embedded MCP, CodeGraph, and Claude Code hooks.

## License

MIT for this repository. The upstream project is SUL-1.0; see `NOTICE` and
`upstream/`.

<!-- test line: added 2026-11-04 to verify the edit pipeline -->
