# Commands

Commands are scoped to OMD presets. The harness's own `/goal` stays available.

| Command | Input | Behavior |
|---|---|---|
| `/omd-init` | — | Creates `.omd/` directories, a commented `config.jsonc`, `.gitignore`, README, and rules README. Never overwrites existing files. |
| `/omd-status` | — | Text status board. |
| `/omd-config` | — | Resolved config, source files, diagnostics. |
| `/omd-ulw` | `<goal>` | Sets ultrawork mode and starts a turn with the goal. |
| `/omd-plan` | `<goal>` | Sets planning mode; interview and draft. |
| `/omd-hyperplan` | `<goal>` | Sets hyperplan mode; five adversarial lanes. |
| `/omd-team` | `<goal>` | Sets team mode; lead + parallel wave protocol. |
| `/omd-start-work` | `[plan]` | Selects a plan (arg, boulder, latest approved, latest), writes the boulder slot, and sends the Atlas protocol. |
| `/omd-stop-continuation` | — | Clears the mode, pauses the boulder, pauses an active DSH goal. |
| `/omd-handoff` | — | Writes `.omd/handoff/<timestamp>.md` with state, git status, recent transcript, and next action. |
| `/omd-init-deep` | — | Sends the hierarchical `AGENTS.md` protocol. |
| `/omd-refactor` | `<target>` | Sends the behavior-preserving refactor protocol. |
| `/omd-remove-ai-slops` | — | Sends the comment/noise cleanup protocol. |

Commands that start work use `agent.followup()` with a user-role message.
Their UI result is a receipt; the model receives the protocol through the
message and the active mode's system-prompt section.

The report commands (`/omd-init`, `/omd-status`, `/omd-config`,
`/omd-handoff`, `/omd-stop-continuation`) do **not** submit a message. A
command result stays in the UI command plane, and the bundle's Client half
(`client.js`) registers one `conversation.chat.commandview` cell per OMD command
that renders the returned text in full. The output is readable the moment the
command settles and the agent is never woken, so a report never produces a
reply.

That Client registration is the reason `client.js` exists: the shipped command
card collapses a multi-line result to a one-line summary until the user clicks
it, which made a report command look like it had done nothing.

The doctor is deliberately **not** a command. `/omd-doctor` was removed in
favor of the `omd-doctor` skill: every OMD role carries it, and it drives the
`omd_doctor` tool. The model runs the check, reads the PASS/WARN/FAIL rows, and
reports them in the conversation, so a diagnosis and its repair happen in one
turn instead of the user having to re-prompt after reading a command row.

Read-only subagent presets expose only `omd-init`, `omd-status`, `omd-config`,
`omd-handoff`, and `omd-stop-continuation`.
