# OmO 4.19.4 parity matrix

Reference: `code-yeongyu/oh-my-openagent` tag `v4.19.4`, commit
`b072d279110bdda2c6ac2525d0d24dc54d16148a`. The `dev` branch is 5.x.

Statuses:

- **ported** — behavior implemented in OMD.
- **adapted** — behavior preserved through a different DSH mechanism.
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
| `team` keyword | `/omd-team` wave protocol | adapted |
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
| `/refactor` | `/omd-refactor` | ported |
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
| `team_*` (12 tools) | deferred: `/omd-team` wave protocol instead | adapted/deferred |
| `monitor` | deferred: DSH jobs/background output | deferred |
| LSP MCP (diagnostics, definitions, refs, rename, symbols) | `omd_lsp` (4 ops) + `omd_diagnostics` (configured commands) | adapted |
| AST-grep tool | `omd-ast-grep` skill driving `sg` | adapted |
| built-in MCPs: websearch/context7/grep_app | DSH `web_search`/`web_fetch`; context7/grep_app | partial/deferred |

## Hooks (54 base)

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
handlers are **deferred** with Team Mode's tool family. v0.1.0 uses the
`/omd-team` wave protocol and result files.

## Commands

| OmO 4.19.4 | OMD | Status |
|---|---|---|
| `/goal` | DSH native `/goal` | host-native |
| `/refactor` | `/omd-refactor` | ported |
| `/start-work` | `/omd-start-work` | ported |
| `/stop-continuation` | `/omd-stop-continuation` | ported |
| `/handoff` | `/omd-handoff` | ported |
| `/remove-ai-slops` | `/omd-remove-ai-slops` | ported |
| `/hyperplan` | `/omd-hyperplan` | ported |
| `/init-deep` (skill/command) | `/omd-init-deep` + skill | ported |
| — | `/omd-init`, `/omd-status`, `/omd-config`, `/omd-ulw`, `/omd-plan`, `/omd-team` | OMD additions |
| — | `omd-doctor` skill → `omd_doctor` tool | OMD addition; the doctor is a skill, not a command |

## Skills

OMD ships 15 clean-room skills:

`omd-doctor`, `omd-ulw-plan`, `omd-ulw-execute`, `omd-ulw-research`,
`omd-review-work`, `omd-init-deep`, `omd-refactor`, `omd-git-master`,
`omd-frontend`, `omd-ast-grep`, `omd-remove-ai-slops`, `omd-hyperplan`,
`omd-team-mode`, `omd-debugging`, `omd-visual-qa`.

Deferred domain skills from OmO's catalog: `playwright`, `playwright-cli`,
`dev-browser`, `security-research`, `data-scientist`, `programming`,
`lsp-setup`, `ultimate-browsing`, `coding-agent-sessions`. Reason: they depend
on host browser/MCP/data tooling that is not part of the DSH base composition;
adding them would claim behavior OMD cannot verify.

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
- Team Mode's 12 `team_*` tools and tmux visualization.
- Hash-anchored edit, interactive tmux, CodeGraph, Claude Code hooks,
  skill-embedded MCP.
- `mass ulw` (5.x) and the removed ralph loop.
