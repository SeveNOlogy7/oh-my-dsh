# Hooks

OMD does not reproduce OmO's OpenCode event model. It uses DSH's agent-scoped
events and prompts; the full 54-hook mapping is in
`docs/parity-omo-4.19.4.md`.

## Implemented

| Hook | DSH mechanism | Effect |
|---|---|---|
| Persona | `agent.ctx.systemPrompt.section` | Shadows `deployment:persona-prefix` with the role prompt. |
| Mode protocol | `agent.ctx.systemPrompt.section` | Injects ultrawork/team/hyperplan/plan/search/analyze text while active. |
| Keyword detector | `session/event` (`user/message`) | Detects a leading `ulw`/`ultrawork`/`team`/`hyperplan`/`hyperplan-ulw` directive (bare word, `word:`, `/word`, or `[word]`), never a mere mention; writes `mode.json`. The old `hyperplan` + `ulw` pair now needs the explicit `hyperplan-ulw` directive. |
| Rules injection | per-agent section | `.omd/rules` always-on and glob-matched rules; byte capped. |
| Continuation | `agent/turn-stopping` + `agent.steer` | Reminds the agent to finish open work; in ultrawork a completed plan with recorded evidence lets the turn close instead; capped by `ultrawork.maxContinuationRounds`; skipped when a DSH goal is active. |
| Plan gate | `agent.ctx.tools.guard` | Ultrawork: refuses a deliverable write/edit until `.omd/plans` holds a non-draft plan with task rows written or updated after this run started (or the boulder's active plan); `ultrawork.requirePlanGate`. |
| Baseline gate | `agent.ctx.tools.guard` + `tools/post-execute` | Ultrawork: refuses the first deliverable write/edit until one verification command has run; `ultrawork.requireBaseline`. |
| Dual evidence | `tools/post-execute` + `agent/turn-stopping` | Ultrawork: after deliverable writes or a completed plan, keeps the turn open until a successful verification command is recorded; `ultrawork.dualEvidence`. |
| Comment checker | `tools/post-execute` | Warns (default) or blocks on high-confidence AI-slop comments; `@allow` / file disable. |
| Plan validator | `tools/post-execute` | Warns when a written `.omd/plans/*.md` violates the grammar. |
| Prometheus guard | `agent.ctx.tools.guard` | Denies write/edit outside `.omd/`. |
| Notepad guard | `agent.ctx.tools.guard` | Denies write/edit under `.omd/notepads`; use `omd_notepad`. |
| Task/todo policy | `agent.ctx.tools.restrict` | Hides task tools when disabled; denies `todo_write` when enabled. |
| Model routing | `agent/model.select` + `agent/request` | Selects the configured route for the next step; `agent/request` applies only the step's temperature/maxTokens (DSH fixes provider/model before the step). |
| Model fallback | `agent/request-error` + `agent/status` + `agent/followup` | After a failed model request and a declined retry, records the next chain route and starts a continuation turn on it; resets to the primary after a completed fallback turn. |

## Host-native substitutes

DSH already owns compaction, output pruning, read-before-write, image resize,
session recovery, goal continuation, subagent completion delivery, and command
dispatch. OMD does not duplicate them.

## Disabled

`hooks.commentChecker = "off"` disables the comment checker. Setting
`keywordHook: false` disables keyword activation. `ultrawork.requirePlanGate`,
`ultrawork.requireBaseline`, and `ultrawork.dualEvidence` disable their gates
individually. `disabledHooks` is reserved for future hook-level gating.

`hooks.rulesInjection` is reserved too: the schema accepts the key and the loader
normalizes it, but no hook reads it yet, so it changes nothing. Rule injection
follows `rules.paths` and `rules.maxBytes`.
