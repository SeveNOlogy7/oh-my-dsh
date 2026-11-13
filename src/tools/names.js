/**
 * The tool names the OMD runtime registers, in the order the docs list them.
 *
 * This list is the *documented* surface, not a second registry: the runtime
 * derives its tools from the tool factories in this directory, and
 * `tests/gate-parity.test.mjs` mounts the real row to assert that these names
 * still equal what `createTools()` registers. A renamed or dropped tool
 * therefore fails twice — once against `docs/parity-omo-4.19.4.md` (forward
 * direction of `scripts/check-parity.mjs`) and once against the runtime.
 *
 * `omd_lsp` and `omd_diagnostics` are conditional on `ctx.lsp` and
 * `ctx.subprocess`; they are listed because the shipped Host provides both, and
 * a Host without those services legitimately lacks them.
 */
export const TOOL_NAMES = [
  'omd_delegate',
  'omd_background_output',
  'omd_background_cancel',
  'omd_background_list',
  'omd_session_list',
  'omd_session_read',
  'omd_session_search',
  'omd_task_create',
  'omd_task_get',
  'omd_task_list',
  'omd_task_update',
  'omd_notepad',
  'omd_lsp',
  'omd_diagnostics',
  'omd_look_at',
  'omd_mode',
  'omd_status',
  'omd_ui_status',
  'omd_doctor',
]
