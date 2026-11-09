# Oh-My-DSH

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B32C3.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)
[![npm](https://img.shields.io/badge/npm-not%20published%20yet-lightgrey.svg)](#install-from-npm)
[![GitHub](https://img.shields.io/badge/GitHub-SeveNOlogy7%2Foh--my--dsh-181717.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)

English | [简体中文](README.zh-CN.md)

Agent orchestration for **DeepSeek Harness**, aligned with
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) **v4.19.4**
(commit `b072d27`).

Oh-My-DSH installs eleven selectable Agent presets and a durable `.omd/`
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

From this checkout, install the bundle into the current DSH profile:

```
plugin_manager install_bundle  target: E:\Oh-My-DSH
```

Or from a terminal:

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

The install adds eleven `agent-preset` declarations plus one top-level runtime
row, `omd-runtime`, generated into `presets/omd-runtime.patch.yml`. That single
row is what carries the tools, commands, skills, and hooks, so OMD orchestration
is available in **every** preset — including the shipped `standard`. The OMD
role is read from the active preset id: select an OMD preset for a persona, or
keep any other preset and get the capability-only identity. If the app was
already running, restart it once so the current runtime module generation is
loaded.

### Language

The language switch for OMD preset labels and messages is an OMD configuration
concern, not an install-time flag. The complete description lives in
[`docs/configuration.md`](docs/configuration.md).

## Use

1. Run `/omd-init` to create `.omd/`. This works in any preset.
2. Optionally select an OMD preset — for example **Sisyphus · OMD** — to also
   get that role's persona and tool policy. Presets are chosen before the first
   turn. Without one you keep your preset and run capability-only.
3. Run the `omd-doctor` skill to verify the composition.
4. Use `/omd-ulw <goal>`, `/omd-plan <goal>`, `/omd-start-work`, or just ask.

| Preset | Role |
|---|---|
| Sisyphus · OMD | orchestrator |
| Hephaestus · OMD | autonomous deep worker |
| Prometheus · OMD | interview planner |
| Atlas · OMD | plan conductor (read-only) |
| Oracle · OMD | read-only architecture consultant |
| Librarian · OMD | read-only docs/OSS researcher |
| Explore · OMD | read-only codebase scanner |
| Multimodal Looker · OMD | read-only visual analyst |
| Metis · OMD | plan gap analyst |
| Momus · OMD | adversarial reviewer |
| Sisyphus-Junior · OMD | delegated task executor |

## Commands

`/omd-init`, `/omd-status`, `/omd-config`,
`/omd-ulw`, `/omd-plan`, `/omd-hyperplan`, `/omd-team`,
`/omd-start-work`, `/omd-stop-continuation`, `/omd-handoff`,
`/omd-init-deep`, `/omd-refactor`, `/omd-remove-ai-slops`.

`/goal` is provided by DeepSeek Harness itself.

The doctor is a skill rather than a command: every OMD role carries
`omd-doctor`, and it drives the `omd_doctor` tool so the diagnosis and the
repair happen in one turn. See `docs/commands.md` and `docs/tools.md`.

`Settings → Oh-My-DSH` is the bundle's settings page: it reads and writes the
session workspace's `.omd/config.jsonc` and reports the effective language and
routing tiers with their source. See `docs/configuration.md`.

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
- The role (persona, tool policy, write scopes, skill set) comes from the active
  preset id; a preset that is not an OMD one runs capability-only, with no
  persona injected and no role restriction.
- Keyword activation (`ulw`, `team`, `hyperplan`) is on everywhere and can be
  disabled in `.omd/config.jsonc`.

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
review verdicts, sessions, tasks, rules, model routing, and the ultrawork,
plan, start-work, hyperplan, team, review, handoff, init-deep, refactor, and
AI-slop protocols.

Host-bound OmO 4.19.4 features are mapped or deferred with reasons in
[`docs/parity-omo-4.19.4.md`](docs/parity-omo-4.19.4.md): dashboard/Client UI,
Team Mode's `team_*` tool family, hashline edit, interactive tmux,
skill-embedded MCP, CodeGraph, Claude Code hooks, and dynamic model fallback
chains.

## License

MIT for this repository. The upstream project is SUL-1.0; see `NOTICE` and
`upstream/`.

<!-- test line: added 2026-11-04 to verify the edit pipeline -->
