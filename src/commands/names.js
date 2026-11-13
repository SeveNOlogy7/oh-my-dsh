/**
 * The slash commands the OMD runtime registers for a primary role or the
 * global runtime row.
 *
 * This list is the *documented* surface, not a second registry: the runtime
 * derives its commands from `src/commands/index.js`, and
 * `tests/gate-parity.test.mjs` mounts the real row to assert that these names
 * still equal what `createCommands()` registers. A renamed or dropped command
 * therefore fails twice — once against `docs/parity-omo-4.19.4.md` (forward
 * direction of `scripts/check-parity.mjs`) and once against the runtime.
 *
 * Two deliberate omissions are part of the contract:
 *
 * - `omd-doctor` is a skill driving the `omd_doctor` tool, not a command.
 * - A subagent row registers only the five report commands (`omd-init`,
 *   `omd-status`, `omd-config`, `omd-handoff`, `omd-stop-continuation`); the
 *   parity doc documents the full surface, which is what this list names.
 */
export const COMMAND_NAMES = [
  'omd-init',
  'omd-status',
  'omd-config',
  'omd-ulw',
  'omd-plan',
  'omd-hyperplan',
  'omd-team',
  'omd-start-work',
  'omd-stop-continuation',
  'omd-handoff',
  'omd-init-deep',
  'omd-refactor',
  'omd-remove-ai-slops',
]
