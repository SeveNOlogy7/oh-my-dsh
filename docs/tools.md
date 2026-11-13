# Tools

Every OMD tool is registered once, by the profile-level `omd-runtime` row, so
the tool surface exists in every preset, including the shipped `standard`,
`ptc`, `minimal`, and `cordis`. What differs is the resolved role: for a session
that resolves a role, that role's tool policy applies, so read-only roles do not
receive `omd_delegate` and write scopes are enforced by a guard; a session that
resolves no role is capability-only, with orchestration available, no OMD
persona injected, and no role restriction applied. OMD publishes no preset per
role: a role is read from the delegated child's `omd:<role>` descriptor label, so
a root session is always capability-only.

## Conditional registration

OMD registers 19 tools, but three groups appear only when the composition
provides what they drive, so a Host can legitimately show fewer:

- `omd_lsp` requires `ctx.lsp`; a Host without a language-server service has no
  `omd_lsp` tool at all.
- `omd_diagnostics` requires `ctx.subprocess`.
- `omd_delegate`, `omd_background_output`, `omd_background_cancel`,
  `omd_background_list`, and `omd_look_at` are registered only for a session
  whose role may delegate (`canDelegate`), and their calls also need the
  `subagents` service at call time.

The remaining tools — `omd_status`, `omd_doctor`, `omd_ui_status`,
`omd_session_list`, `omd_session_read`, `omd_session_search`, `omd_notepad`,
`omd_mode`, and the four `omd_task_*` tools — need no optional service. The task
tools are always registered, but while `taskSystem.enabled` is false a tool
restriction denies `omd_task_*` (`src/hooks/index.js`), so the model never sees
them, and a direct call to `omd_task_create` refuses with `task system is
disabled`.

## omd_delegate

Delegate one self-contained task.

Parameters: `prompt` (required), `description`, `subagent_type`, `category`,
`load_skills[]`, `run_in_background`, `task_id`, `session_id`,
`output_schema`, `provider`, `model`, `reasoning_effort`, `timeout_ms`.

- `subagent_type` and `category` are mutually exclusive.
- The child's role is `subagent_type`, or `sisyphus-junior` for a category run;
  it travels on the child's `subagent/descriptor` label as `omd:<role>`. The
  child's preset comes from `delegation.childPreset` (default `null`: inherit the
  parent's preset).
- `run_in_background` returns immediately with a `bg_*` task id.
- `task_id` or `session_id` continues an existing child. A continuation returns
  acceptance, and its next result arrives as the child's completion notice in
  the parent's inbox. OMD has no channel that observes a continued child's end,
  so the record is stored as `unknown` with `continuation_accepted: true` rather
  than `running`: the status board does not count it as active, and
  `omd_background_output` says so explicitly. `subagent_type`/`category` is still
  required on the continuation call — the role decides the child's policy and
  route.
- Completion returns the child output plus a parsed `omd-result` block.
- A foreground timeout cancels the child and returns an error.
- `maxDepth` and the parent-role allowlist are enforced.

## omd_background_output

`task_id`, `block?`, `timeout_ms?`. Reads the in-memory record or the disk
record. `block` waits up to the configured bound. A running task returns its
status instead of hanging forever. A record that was continued reports
`status: unknown` plus the continuation note: its first run's output stays
readable, and the continued run's result arrives as a completion notice rather
than through this record.

## omd_background_cancel

`task_id`, `reason?`. Cancels a queued or running delegation, disposes the
activation, and persists the cancelled state.

## omd_background_list

Lists this parent session's background tasks, including settled records loaded
from disk.

## omd_session_list

`project_path?`, `from_date?`, `to_date?`, `limit?`. Newest first; defaults to
the current workspace.

## omd_session_read

`session_id`, `limit?`. Reads the DSH session log and renders user/assistant
text, tool calls, and tool results.

## omd_session_search

`query`, `session_id?`, `limit?`. Uses full-text search when the profile enables
it; otherwise returns the exact `session-query-sqlite` configuration fix.

## omd_task_create / get / list / update

Opt-in durable task system (`taskSystem.enabled`). Supports dependencies,
cycle rejection, owner, status, and summaries. Hidden when disabled; when
enabled, `todo_write` is denied.

## omd_notepad

`plan`, `section` (`learnings|decisions|issues|verification|problems`), `text`,
`task?`. Append-only notepad under `.omd/notepads`. Direct write/edit to that
directory is denied.

## omd_lsp

`operation` (`goToDefinition|findReferences|goToImplementation|hover`),
`file_path`, `line` (1-based), `character` (1-based). Uses `ctx.lsp`.

## omd_diagnostics

`files?`. Runs the configured `diagnostics.commands` with argv (no shell) and
returns exit codes and bounded output. Empty configuration returns a hint.

## omd_look_at

`paths[]`, `prompt`. Reads images through `ctx.fs`, stores them via
`ctx.attachments`, and delegates to the `multimodal-looker` role.

## omd_mode

`action` (`set|clear|status`), `mode?`. Modes: `ultrawork`, `team`,
`hyperplan`, `hyperplan-ulw`, `plan`, `search`, `analyze`.

## omd_status

Returns the text status board: mode, boulder, plans, tasks, background, recent
ledger, next action. Also available as `/omd-status`.

## omd_doctor

No parameters. Runs the report-only self-check — required services, that no
`omd-*` preset is left registered (`presets`, with a `preset-detail` row carrying
each leftover's own failure reason), the role the session resolved (`active-role`)
and the preset it runs on (`active-preset`), the spawn provider, `.omd/` state
and config readability, the browser bundle (`client-half`), upstream lock — and
returns one
`PASS|WARN|FAIL <id>: <detail>` line per check, a `fix:` line for anything that
has a repair, and a `summary:` line. Read-only: it never edits. The `omd-doctor`
skill is the entry point, and it replaced the former `/omd-doctor` command so
that every role, including the read-only ones, can run it.

## omd_ui_status

Reports whether the Host composed the Oh-My-DSH browser bundle:
`clientModules.clientPath('omd-ui')` (the asset package), the Web boot graph
entries and batches, and the Loader rows whose name mentions `omd-ui` or
`oh-my-dsh` with their `disabled` and fiber state. Use it when a command's output does not appear in the conversation:
`clientPath` returning `NOT REGISTERED` means the Host never composed the
bundle, while a registered path means the bundle reached the browser and the
renderer is what needs attention. Read-only; it changes nothing.
