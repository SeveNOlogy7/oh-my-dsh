# OmO 4.19.4 parity matrix

Reference: `code-yeongyu/oh-my-openagent` tag `v4.19.4`, commit
`b072d279110bdda2c6ac2525d0d24dc54d16148a`. The `dev` branch is 5.x.

Statuses:

- **ported** — behavior implemented in OMD.
- **adapted** — behavior preserved through a different DSH mechanism.
- **partial** — subset implemented (options, flags, or operations missing).
- **host-native** — DSH already provides it; OMD does not duplicate it.
- **deferred** — not in v0.1.0, with a concrete reason.
- **n/a** — the concept does not apply to DSH.

## Agents

| OmO 4.19.4 | OMD role | Status |
|---|---|---|
| sisyphus (primary, orchestrator) | `sisyphus` | ported |
| hephaestus (primary, deep worker) | `hephaestus` | ported |
| prometheus (primary, planner) | `prometheus` | ported |
| atlas (primary, conductor) | `atlas` | ported |
| oracle (subagent, read-only) | `oracle` | ported |
| librarian (subagent, read-only) | `librarian` | ported |
| explore (subagent, read-only) | `explore` | ported |
| multimodal-looker (subagent, read-only) | `multimodal-looker` | ported |
| metis (subagent, gap analyst) | `metis` | ported |
| momus (subagent, reviewer) | `momus` | ported |
| sisyphus-junior (subagent, executor) | `sisyphus-junior` | ported |

The OMD column names a **role**, not a DSH preset. OMD registers no `omd-<role>`
preset: `dsh.bundle.patch` lists only the runtime row (`omd-runtime`) and the
browser asset row (`omd-ui`). A role reaches a session as the `omd:<role>` label
on a delegated child's `subagent/descriptor`, written by `omd_delegate` and
`omd_look_at` and read back off the child's own session log. Read `omd:sisyphus`
as a role label, never as a preset id; `agentIdFromPreset` survives only as the
compatibility fallback that keeps a pre-existing `omd-<role>` session resolving
the role it was created with. A category delegation appends the category to the
same label (`omd:<role>@<encoded category>`) so the child can resolve the
category's model chain.

Model chains: **ported as ordered fallback chains** in the workspace's
`.omd/config.jsonc` (`agents.*.chain`, `categories.*.chain`, `models.catalog`).
The routes name DSH providers and models rather than OmO's provider ids; a
failed model request selects the next route and continues on a new turn, because
DSH fixes a step's model before dispatch. See `docs/configuration.md`.

## Workflows

| OmO 4.19.4 | OMD | Status |
|---|---|---|
| `ultrawork` / `ulw` keyword | keyword detector + mode section + 8-step protocol | ported |
| `team` keyword | `/omd-team` over the DSH Agent Teams task board | adapted (DSH Agent Teams) |
| `hyperplan` keyword | `/omd-hyperplan` five-lane protocol | ported |
| `hyperplan` + `ulw` combo | `hyperplan-ulw` mode | ported |
| Prometheus interview → draft → approval → plan | `/omd-plan`, `.omd/drafts`, `.omd/plans` | ported |
| Metis gap analysis | `metis` role delegation | ported |
| Momus + Oracle dual review | independent review lanes | ported |
| Atlas `/start-work` + boulder + ledger | `/omd-start-work`, `.omd/boulder`, `.omd/ledger.jsonl` | ported |
| `/goal` idle continuation | DSH native goal + `/goal` | host-native |
| background delegation, concurrency 5, parent wake | `omd_delegate` + Scheduler + parent delivery | ported |
| category routing (8 built-ins) | category routing + config overrides | ported |
| `/stop-continuation` | `/omd-stop-continuation` | ported |
| `/handoff` | `/omd-handoff` | ported |
| `/remove-ai-slops` | `/omd-remove-ai-slops` | ported |
| `/refactor` | `/omd-refactor` | ported (flags not implemented) |
| `ralph loop` | removed in 4.19.4; OMD does not implement it | n/a |
| `mass ulw` | 5.x tagline; not part of 4.19.4 | n/a |

## Tools

OMD tool names: `omd_delegate`, `omd_background_output`,
`omd_background_cancel`, `omd_background_list`, `omd_session_list`,
`omd_session_read`, `omd_session_search`, `omd_task_create`, `omd_task_get`,
`omd_task_list`, `omd_task_update`, `omd_notepad`, `omd_lsp`,
`omd_diagnostics`, `omd_look_at`, `omd_mode`, `omd_status`, `omd_ui_status`,
`omd_doctor`.
`omd_ui_status` reports the Host's browser-bundle composition and has no OmO
counterpart, because OmO has no separate client plugin surface.
`omd_doctor` is the report-only self-check driven by the `omd-doctor` skill; it
has no OmO tool counterpart because OmO ships its doctor as a command.

| OmO 4.19.4 | OMD | Status |
|---|---|---|
| `task` (category/subagent, sync/async, task_id) | `omd_delegate` | ported |
| `call_omo_agent` | merged into `omd_delegate` `subagent_type` | adapted |
| `background_output` / `background_cancel` | `omd_background_output` / `omd_background_cancel` + list | ported |
| `session_list` / `session_read` / `session_search` | `omd_session_*` via `ctx.sessionQuery` | ported |
| `grep` / `glob` | DSH native `grep` / `glob` | host-native |
| `skill` | DSH native `skill` + `.omd/skills` provider | adapted |
| `skill_mcp` | deferred: DSH has no skill-embedded MCP lifecycle | deferred |
| `look_at` | `omd_look_at` with attachments + the `multimodal-looker` role | ported |
| `task_create/get/list/update` | `omd_task_*` behind `taskSystem.enabled` | ported |
| `interactive_bash` (tmux) | deferred: DSH has jobs/pwsh, not tmux panes | deferred |
| hashline `edit` | deferred: DSH edit is read-before-write, not hash-anchored | deferred |
| `team_*` (12 tools) | DSH Agent Teams: `team_task_*`, `subagent`, `send_message`; per-member worktree needs the optional forge bundle; named team entity, mailbox files, and tmux deferred | adapted (host team board; entity/lifecycle deferred) |
| `monitor` | deferred: DSH jobs/background output | deferred |
| LSP MCP (diagnostics, definitions, refs, rename, symbols) | `omd_lsp` (4 ops) + `omd_diagnostics` (configured commands) | adapted (4-operation closed union; host-bound) |
| AST-grep tool | `omd-ast-grep` skill driving `sg` | adapted |
| built-in MCPs: websearch/context7/grep_app | DSH `web_search`/`web_fetch`; context7/grep_app | partial/deferred |

The LSP row is host-bound by contract, not by choice. `LspOperation` is the
closed union `goToDefinition`, `findReferences`, `goToImplementation`, `hover` —
there is no `rename`, `prepareRename`, `symbols`, or diagnostics operation — and
`ctx.lsp` exposes only `registerProvider` and `query` (`[host]`). OMD's enum is
that same four (`[repo]` `src/tools/misc.js:144`), so `omd_diagnostics` runs
configured commands instead of an LSP diagnostics operation.

## Hooks (54 base)

The subsection headers below are **OMD's** grouping: 24/17/4/7/2 = 54. Upstream
publishes 24/16/5/7/2 = 54 (`docs/reference/features.md:838-846` at v4.19.4,
commit b072d27) — the same total with one hook in a different tier. The one-tier
difference is upstream's documented `thinking-block-validator` (Transform,
`features.md:888`), which is **absent from the v4.19.4 tree**: none of the tag's
7349 paths contains that name. The matrix therefore does not map it; the
discrepancy is upstream documentation drift, not an OMD coverage gap.

### Session (24)

| Hook | OMD | Status |
|---|---|---|
| preemptiveCompaction | DSH compaction | host-native |
| sessionNotification | DSH UI notices | host-native |
| thinkMode | DSH reasoning effort config | host-native |
| anthropicContextWindowLimitRecovery | DSH retry/compaction | host-native |
| autoUpdateChecker | bundle manager / doctor | deferred |
| codegraphBootstrap | no CodeGraph | deferred |
| astGrepSgProvision | doctor checks `sg`; skill instructs | adapted |
| agentUsageReminder | orchestrator prompt | adapted |
| nonInteractiveEnv | n/a | deferred |
| interactiveBashSession | n/a without tmux | deferred |
| goal | DSH native goal | host-native |
| editErrorRecovery | DSH fs observation/retry | host-native |
| delegateTaskRetry | delegate start failure + record | adapted |
| startWork | `/omd-start-work` | ported |
| prometheusMdOnly | write-scope guard | ported |
| sisyphusJuniorNotepad | notepad protocol | adapted |
| questionLabelTruncator | DSH UI | host-native |
| taskResumeInfo | `/omd-status` + `task_id` resume | adapted |
| modelFallback | ordered `chain` + `agent.model.select` + continuation turn | ported |
| noSisyphusGpt | model-specific | n/a |
| noHephaestusNonGpt | model-specific | n/a |
| hephaestusAgentsMdInjector | DSH agent-instructions | host-native |
| runtimeFallback | DSH llm-retry | host-native |
| legacyPluginToast | n/a | n/a |

### Tool guard (17)

| Hook | OMD | Status |
|---|---|---|
| commentChecker | warn/block post-execute | ported |
| toolOutputTruncator | DSH spill/pruner | host-native |
| directoryAgentsInjector | DSH agent-instructions | host-native |
| directoryReadmeInjector | `.omd/rules` | adapted |
| emptyTaskResponseDetector | delegate empty-output diagnostic | ported |
| rulesInjector | `.omd/rules` always/globs | ported |
| tasksTodowriteDisabler | todo deny when task system on | ported |
| writeExistingFileGuard | DSH fs observation policy | host-native |
| bashFileReadGuard | DSH fs policy | host-native |
| readImageResizer | DSH attachments | host-native |
| todoDescriptionOverride | n/a | n/a |
| webfetchRedirectGuard | DSH web fetch | host-native |
| hashlineReadEnhancer | hashline deferred | deferred |
| jsonErrorRecovery | DSH tool errors | host-native |
| fsyncSkipWarning | n/a | n/a |
| notepadWriteGuard | guard + `omd_notepad` | ported |
| planFormatValidator | post-write plan warnings | ported |

### Transform (4)

| Hook | OMD | Status |
|---|---|---|
| claudeCodeHooks | DSH claudeCodeMods not loaded | deferred |
| keywordDetector | `session/event` + mode section | ported |
| contextInjectorMessagesTransform | DSH agent-instructions + rules | host-native |
| toolPairValidator | DSH session/tool runtime | host-native |

### Continuation (7)

| Hook | OMD | Status |
|---|---|---|
| stopContinuationGuard | `/omd-stop-continuation` | ported |
| compactionContextInjector | DSH compaction | host-native |
| compactionTodoPreserver | `.omd` state files | host-native |
| todoContinuationEnforcer | `agent/turn-stopping` + steer + cap | ported |
| unstableAgentBabysitter | deferred | deferred |
| backgroundNotificationHook | parent delivery + result files | host-native |
| atlasHook | start-work protocol + boulder | ported |

### Skill (2)

| Hook | OMD | Status |
|---|---|---|
| categorySkillReminder | category/skill prompt guidance | adapted |
| autoSlashCommand | DSH command surface | host-native |

### Team-only hooks

`teamToolGating`, team transform/mailbox injectors, and direct team session
handlers are **adapted**: the Host's Agent Teams registration gates the
`team_task_*` tools, and `/omd-team` drives that board. The mailbox-file
injectors stay deferred because the Host keeps team state in the Lead Session
log rather than per-member inbox files.

## Commands

| OmO 4.19.4 | OMD | Status |
|---|---|---|
| `/goal` | DSH native `/goal` | host-native |
| `/refactor` | `/omd-refactor` | ported (flags not implemented) |
| `/start-work` | `/omd-start-work` | ported (flags not implemented) |
| `/stop-continuation` | `/omd-stop-continuation` | ported |
| `/handoff` | `/omd-handoff` | ported |
| `/remove-ai-slops` | `/omd-remove-ai-slops` | ported |
| `/hyperplan` | `/omd-hyperplan` | ported |
| `/init-deep` (skill/command) | `/omd-init-deep` + skill | ported (flags not implemented) |
| — | `/omd-init`, `/omd-status`, `/omd-config`, `/omd-ulw`, `/omd-plan`, `/omd-team` | OMD additions |
| — | `omd-doctor` skill → `omd_doctor` tool | OMD addition; the doctor is a skill, not a command |

One sentence per flagged row, against `docs/reference/features.md` at v4.19.4
(commit b072d27):

- `/init-deep [--create-new] [--max-depth=N]` (`:344`): `/omd-init-deep` takes no
  input, so neither flag is implemented.
- `/refactor <target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]`
  (`:415`): `/omd-refactor` takes `<target>` only, so both options are missing.
- `/start-work [plan-name] [--worktree <path>] [--make-pr] [--ship]` (`:433`):
  `/omd-start-work` takes `[plan]` only, so all three flags are missing;
  `--worktree` reduces to a prompt instruction, while `--make-pr` and `--ship`
  are host-bound (they need forge and CI integration DSH does not expose).

## Team runs

A team run has exactly one canonical task board: DSH Agent Teams'
`team_task_*` board in the Lead Session log. The `.omd/runtime/<runId>/tasks/`
file board is the fallback for a Host that exposes no Agent Teams, and
`.omd/tasks` (`omd_task_*`) is the personal task system — never mirror team
tasks into either one.

## Skills

OMD ships 15 clean-room skills:

`omd-doctor`, `omd-ulw-plan`, `omd-ulw-execute`, `omd-ulw-research`,
`omd-review-work`, `omd-init-deep`, `omd-refactor`, `omd-git-master`,
`omd-frontend`, `omd-ast-grep`, `omd-remove-ai-slops`, `omd-hyperplan`,
`omd-team-mode`, `omd-debugging`, `omd-visual-qa`.

Upstream ships **17** shared skills (`packages/shared-skills/skills/`) plus TS
built-in skills (`packages/omo-opencode/src/features/builtin-skills/skills/`:
`playwright`, `playwright-cli`, `playwright-mcp`, `agent-browser`, `dev-browser`,
`security-research`, `security-review`, `team-mode`, …). OMD's 15 above are 11
of the shared set — `ast-grep`, `debugging`, `frontend`, `git-master`,
`init-deep`, `refactor`, `remove-ai-slops`, `review-work`, `ulw-plan`,
`ulw-research`, `visual-qa` — plus 4 OMD additions: `omd-doctor`,
`omd-hyperplan`, `omd-team-mode`, `omd-ulw-execute`. Five shared skills have no
OMD counterpart: `programming`, `lsp-setup`, `coding-agent-sessions`,
`data-scientist`, `ultimate-browsing`. `start-work` is not missing: OMD
implements it as the `/omd-start-work` command rather than a skill.

Deferred domain skills from OmO's catalog: `playwright`, `playwright-cli`,
`dev-browser`, `security-research`, `data-scientist`, `programming`,
`lsp-setup`, `ultimate-browsing`, `coding-agent-sessions`. That list is correct.
Reason: they depend on host browser/MCP/data tooling that is not part of the DSH
base composition; adding them would claim behavior OMD cannot verify. The
browser and security built-ins (`playwright`, `playwright-cli`, `playwright-mcp`,
`agent-browser`, `dev-browser`, `security-research`, `security-review`) are
host-bound for the same reason and stay deferred.

## Configuration and state

| OmO | OMD |
|---|---|
| unified `omo.jsonc` + walked project layers | `.omd/config.jsonc` + `~/.omd/config.jsonc` + ancestor layers |
| JSONC | JSONC |
| deep merge; arrays replace; `disabled_*` union | same; prototype-pollution guard |
| `.omo/plans`, `drafts`, `boulder.json`, `start-work/ledger.jsonl`, `notepads`, `tasks` | `.omd/plans`, `drafts`, `boulder/` + derived `boulder.json`, `ledger.jsonl`, `notepads`, `tasks` |
| `~/.omo` | `~/.omd` |

## Explicitly not claimed

- OmO's exact prompt text, literal model/provider ids, OpenCode/Codex/Senpi
  adapters.
- Team Mode's named-team lifecycle (`team_create`/`team_delete`/`team_status`/
  `team_list`), mailbox files with ack/TTL, and tmux panes.
- Hash-anchored edit, interactive tmux, CodeGraph, Claude Code hooks,
  skill-embedded MCP.
- `mass ulw` (5.x) and the removed ralph loop.

## Not aligned with omo 4.19.4

Statuses reuse the legend above; evidence labels are `[repo]` `path:line` in this
repository, `[upstream]` `path @ v4.19.4 (commit b072d27)`, and `[host]` for a
recorded Host contract (cordis_inspect).

| ID | Gap | Status | Evidence | Disposition |
|---|---|---|---|---|
| G1 | Per-model fallback objects (`thinking.budgetTokens`, `variant`, `top_p`, `textVerbosity`, `max_prompt_tokens`) | partial | `[repo]` `src/core/config.js:281` `routeFields` keeps provider/model/reasoningEffort/temperature/maxTokens only | close in 0.2 |
| G2 | File-based prompts (`prompt` / `prompt_append` via `file://`, `~`) | deferred | `[repo]` `src/runtime/runtime.js:72` reads only an inline `promptAppend` string; the schema has no `prompt` property | keep deferred |
| G3 | Per-agent tool allow/deny config | partial | `[repo]` `src/agents/policies.js:8` hard-codes the per-role policy and `schema/omd-config.schema.json:52` has no tool map; `[host]` `ctx.tools.restrict` can only subtract | close in 0.2 |
| G4 | `is_unstable_agent`, `disable`, `max_prompt_tokens` | deferred | `[repo]` `src/core/defaults.js:54` `NEUTRAL_AGENT_SETTINGS` carries none of the three | keep deferred |
| G5 | `/init-deep` flags | partial | `[repo]` `src/commands/index.js:355` registers no input; `[upstream]` `docs/reference/features.md:344 @ v4.19.4 (commit b072d27)` | close in 0.2 |
| G6 | `/refactor` flags | partial | `[repo]` `src/commands/index.js:366` takes `<target>` only; `[upstream]` `docs/reference/features.md:415 @ v4.19.4 (commit b072d27)` | close in 0.2 |
| G7 | `/start-work` flags | partial | `[repo]` `src/commands/index.js:193` takes `[plan]` only; `[upstream]` `docs/reference/features.md:433 @ v4.19.4 (commit b072d27)` | keep deferred |
| G8 | Custom command loading (`.opencode/command`, `.claude/commands`) | deferred | `[repo]` `src/commands/names.js:19` is a fixed list; `[host]` `ctx.commands` is the Host registry, so dispatch may be host-owned | keep deferred |
| G9 | `search` / `analyze` keyword activation | partial | `[repo]` `src/hooks/keyword.js:15` `DIRECTIVE` lists hyperplan-ulw/ultrawork/ulw/team/hyperplan only; `[upstream]` `docs/reference/features.md:875 @ v4.19.4 (commit b072d27)` | close in 0.2 |
| G10 | `session_info` | deferred | `[host]` `ctx.sessionQuery` has no statistics method and `tokenMeter` needs a live Session; `[repo]` `src/tools/sessions.js:105` is metadata-only | keep deferred |
| G11 | LSP `rename` / `prepareRename` / `symbols` / `lsp_diagnostics` | host-native | `[repo]` `src/tools/misc.js:144`; `[host]` `LspOperation` closed union, `ctx.lsp` = `registerProvider` + `query` | host-bound, never duplicate |
| G12 | `omd_lsp` parity label | partial (now documented) | `[repo]` `src/tools/misc.js:144`, and the LSP row of the Tools table above plus this table state the 4-operation union | close in 0.2 |
| G13 | Team Mode named-team lifecycle, mailbox files, tmux, per-team caps | partial | `[host]` Agent Teams base rows (`agent-team`, `tool-agent-team`) + `agentTeams` service, `TeamId` = root Session; `[upstream]` `docs/guide/team-mode.md @ v4.19.4 (commit b072d27)` | close in 0.2 where host-bound; keep the protocol on the host board |

### Documented deferred

- Named team entity (`team_create`/`team_delete`/`team_status`/`team_list`),
  mailbox files with ack/TTL/payload caps, and tmux panes — the Host's Agent
  Teams board covers the shared task list and messaging, but a team is the
  implicit root-Session tree (`TeamId`), not a named registry; `/omd-team`
  drives the host board and falls back to the file board when the Host exposes
  no Agent Teams.
- Hash-anchored (hashline) `edit` — DSH `edit` is read-before-write with no hash
  anchors, and a guard cannot add an anchor the tool never emits.
- `interactive_bash` (tmux) — DSH has background jobs, `pwsh`, and session
  terminals, not tmux panes.
- `monitor_*` 4 tools — background output plus result files cover the need.
- Skill-embedded MCP/OAuth + `skill_mcp` — DSH skills cannot start an MCP client
  lifecycle; an MCP server belongs in profile config.
- `.mcp.json` loader / context7 / grep_app — DSH ships `web_search`/`web_fetch`;
  the rest are MCP servers the Host profile adds, not OMD.

### Safe to ignore (host-bound)

- `/goal` — Host native goal and idle continuation.
- `grep` / `glob` — DSH native tools.
- Think-mode effort escalation — Host reasoning-effort config, not an OMD hook.
- Session recovery — Host session store concern.
- Model capabilities — Host model registry.
- Telemetry — Host side.
- TUI / OpenClaw surface — no DSH counterpart.
- Browser skills — need a host browser MCP.
- Claude Code compat loaders — `claudeCodeMods` is a Host service; OMD loads no
  mods.
- OpenCode / Codex / Senpi / Pi editions — publication targets, not features.
- LSP daemon — `ctx.lsp` is a provider registry; OMD registers none.
- git-bash MCP — shell concern the Host owns.
- `omd_background_list` — OMD addition; upstream ships output/cancel only.
- `ulw-loop` — removed upstream; OMD keeps no counterpart.
- Legacy rename/migration — n/a, OMD has no legacy install base.
