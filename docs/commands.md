# Commands

OMD registers its commands once, at profile level, so every preset sees them,
including the shipped `standard`, `ptc`, `minimal`, and `cordis`. The command
set is the same everywhere; only the resolved role's policy differs. The
harness's own `/goal` stays available.

| Command | Input | Behavior |
|---|---|---|
| `/omd-init` | — | Creates `.omd/` directories, a commented `config.jsonc`, `.gitignore`, README, and rules README. Never overwrites existing files. |
| `/omd-status` | — | Text status board. |
| `/omd-config` | `set <json>` or `set {"patch":…,"unset":…}` | Resolved config, contributing sources, and parse diagnostics as a JSON envelope. `set` merges a validated patch into the session workspace's `.omd/config.jsonc`, deletes the key paths it is given, and answers with the new state. |
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

Commands that start work use `agent.followup()` with a complete user-role
message — `{id, role: 'user', content, source}`. DSH persists that object
verbatim as a `user/message` record and does not fill in a missing `role` or
`id`; a partial message therefore poisons the session, because the provider
rejects every later request with `Unsupported message role: undefined`. OMD
builds these messages in `src/core/message.js`.

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

`/omd-config` is the one command that writes. Both write forms validate against
`schema/omd-config.schema.json` before touching the file; a rejected value
settles as an error result carrying the validator's own message, and the file is
left byte-identical.

- `set <json object>` merges the object into the session workspace's
  `.omd/config.jsonc`.
- `set {"patch": {...}, "unset": [["delegation","maxConcurrent"]]}` is the same
  write plus key paths to delete from that file. Both keys are optional and at
  least one must be non-empty; an `unset` path the file does not set is a no-op
  (it may be inherited), the patch wins wherever the two touch the same or an
  overlapping path, and a removal that empties an object prunes it. The answer's
  `write` object reports `mode`, the patched key paths in `keys`, and the paths
  actually removed in `unset`.

The settings page (`Settings → OMD`) drives both forms over its own endpoint,
`api/omd/config`: it posts the `/omd-config …` line the parser reads, so the page
and a human typed command share one parser and one envelope contract without
executing anything in a session. See `docs/configuration.md`.

A row that pins a **subagent** role (`oracle`, `librarian`, `explore`,
`multimodal-looker`, `metis`, `momus`, `sisyphus-junior`) registers only
`omd-init`, `omd-status`, `omd-config`, `omd-handoff`, and
`omd-stop-continuation`; a row that pins a primary role registers all of them.
The bundle's own `omd-runtime` row pins no role — it is mounted once for the
whole profile — so it registers the whole command set and lets each session's
resolved role decide what is usable.
