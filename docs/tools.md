# Tools

All OMD tools exist only inside OMD presets. Read-only roles do not receive
`omd_delegate`; write scopes are enforced by a guard.

## omd_delegate

Delegate one self-contained task.

Parameters: `prompt` (required), `description`, `subagent_type`, `category`,
`load_skills[]`, `run_in_background`, `task_id`, `session_id`,
`output_schema`, `provider`, `model`, `reasoning_effort`, `timeout_ms`.

- `subagent_type` and `category` are mutually exclusive.
- `run_in_background` returns immediately with a `bg_*` task id.
- `task_id` or `session_id` continues an existing child. A continuation returns
  acceptance; its next result arrives as a completion notice, so
  `omd_background_output` reports the continued run as `running` instead of
  joining a new activation.
- Completion returns the child output plus a parsed `omd-result` block.
- A foreground timeout cancels the child and returns an error.
- `maxDepth` and the parent-role allowlist are enforced.

## omd_background_output

`task_id`, `block?`, `timeout_ms?`. Reads the in-memory record or the disk
record. `block` waits up to the configured bound. A running task returns its
status instead of hanging forever.

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
`ctx.attachments`, and delegates to the multimodal-looker preset.

## omd_mode

`action` (`set|clear|status`), `mode?`. Modes: `ultrawork`, `team`,
`hyperplan`, `hyperplan-ulw`, `plan`, `search`, `analyze`.

## omd_status

Returns the text status board: mode, boulder, plans, tasks, background, recent
ledger, next action. Also available as `/omd-status`.

## omd_doctor

No parameters. Runs the report-only self-check — required services, preset
registration with each broken preset's own reason, spawn provider, `.omd/` state
and config readability, browser bundle, upstream lock — and returns one
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
