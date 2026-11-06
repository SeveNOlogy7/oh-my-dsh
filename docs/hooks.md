# Hooks

OMD does not reproduce OmO's OpenCode event model. It uses DSH's agent-scoped
events and prompts; the full 54-hook mapping is in
`docs/parity-omo-4.19.4.md`.

## Implemented

| Hook | DSH mechanism | Effect |
|---|---|---|
| Persona | `agent.ctx.systemPrompt.section` | Shadows `deployment:persona-prefix` with the role prompt. |
| Mode protocol | `agent.ctx.systemPrompt.section` | Injects ultrawork/team/hyperplan/plan/search/analyze text while active. |
| Keyword detector | `session/event` (`user/message`) | Detects `ulw/ultrawork`, `team`, `hyperplan`, `hyperplan+ulw` outside code fences; writes `mode.json`. |
| Rules injection | per-agent section | `.omd/rules` always-on and glob-matched rules; byte capped. |
| Continuation | `agent/turn-stopping` + `agent.steer` | Reminds the agent to finish open work; capped by `ultrawork.maxContinuationRounds`; skipped when a DSH goal is active. |
| Comment checker | `tools/post-execute` | Warns (default) or blocks on high-confidence AI-slop comments; `@allow` / file disable. |
| Plan validator | `tools/post-execute` | Warns when a written `.omd/plans/*.md` violates the grammar. |
| Prometheus guard | `agent.ctx.tools.guard` | Denies write/edit outside `.omd/`. |
| Notepad guard | `agent.ctx.tools.guard` | Denies write/edit under `.omd/notepads`; use `omd_notepad`. |
| Task/todo policy | `agent.ctx.tools.restrict` | Hides task tools when disabled; denies `todo_write` when enabled. |
| Model routing | `agent/request` | Applies configured provider/model/effort/temperature/maxTokens. |

## Host-native substitutes

DSH already owns compaction, output pruning, read-before-write, image resize,
session recovery, goal continuation, subagent completion delivery, and command
dispatch. OMD does not duplicate them.

## Disabled

`hooks.commentChecker = "off"` disables the comment checker. Setting
`keywordHook: false` disables keyword activation. `disabledHooks` is reserved
for future hook-level gating.
