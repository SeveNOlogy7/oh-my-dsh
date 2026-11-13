# Testing

## Automated

```
npm test          # node --test "tests/**/*.test.mjs"
npm run check     # syntax, manifest, presets, contract, parity, version
npm run check:presets
npm run check:parity
npm run check:version
npm run check:license   # optional; exit 2 = unmeasured without OMD_UPSTREAM_DIR
```

`npm test` covers:

- JSONC, frontmatter, glob, paths, atomic writes, BOM, corruption, mutex;
- layered config, defaults keyset, prototype pollution, model routes;
- plan grammar, boulder slots and derived view;
- durable tasks, dependencies, cycles, summaries;
- modes, notepads, ledger, background registry (settle/wait/cancel/persist);
- status composition;
- runtime registration for read-only and delegating roles, background and
  foreground delegation, allowlist rejection, commands, the `omd_doctor` tool,
  keyword mode, continuation steer, comment checker, Prometheus/notepad
  guards, skills and the `.omd/skills` provider;
- the role channel: `roleLabelFor`/`roleFromLabel`, `resolveDescriptorRole` read
  off a session log, delegation writing the role onto the descriptor label, and
  `delegation.childPreset` collapsing a stray value into inheritance;
- messages: every message OMD hands to `agent.followup()`/`agent.steer()` and
  every tool-feedback context carries `id`, `role: 'user'`, `content`, and
  `source` — the contract DSH persists verbatim, where a missing `role` poisons
  the session with `Unsupported message role: undefined`;
- the config page's own endpoint: route shape (`POST /api/omd/config` on the
  authenticated `/api` channel), workspace resolution from a session or the
  profile default and the refusal to accept a browser-supplied path, read/write
  envelopes, validator rejections, and registration only when a browser channel
  exists;
- contract: the JSON Schema covers every runtime default with a matching type
  and default, the eight built-in categories are named in the contract prompt,
  the docs, and `omd_delegate`, the documented agent and category override
  fields match the schema and the runtime, the Client half is declared,
  exported, reachable, and JSX-free, the doctor is a skill driving
  `omd_doctor` rather than a command, and the roster/version/skills agree with
  the manifest;
- the parity gate itself: both directions driven through
  `checkParity({ root, docText })` — a documented token that names no entity, a
  doc missing a registered tool, an undocumented wildcard family, the Agents
  table roster, and a stale per-role preset patch — plus `TOOL_NAMES` and
  `COMMAND_NAMES` equal to what the mounted runtime row registers.

The runtime tests use a fake DSH context; they do not start a server or an
LLM request. No test renders the Client half: it is plain JavaScript loaded by
the browser module table, so only its manifest, syntax, registration targets,
and command names are checked here. Visual rendering stays a manual gate.

## Structural checks

`check.mjs` asserts:

- `package.json` version, private flag, `dsh.bundle.patch` lists every patch the
  bundle installs — exactly two rows, `presets/omd-runtime.patch.yml` and
  `presets/omd-ui.patch.yml`;
- every patch exists; no per-role preset patch is listed, because OMD registers
  no preset per role;
- the runtime patch mounts the runtime package once and pins no `agent`: it is
  declared once at profile level, and the role is resolved per session instead;
- the UI asset patch names `../ui/index.js`, not a directory;
- 11 role prompts, 15 skills, schema, locale, icon, LICENSE, NOTICE, lock;
- every `.js`/`.mjs` parses;
- presets are in sync with the generator;
- `tests/contract.test.mjs` passes, so a new default, a renamed category, or a
  changed documented field fails the check before release.

`check-parity.mjs` asserts both directions against
`docs/parity-omo-4.19.4.md`, and exports the same check as
`checkParity({ root, docText })` so `tests/gate-parity.test.mjs` can drive it:

- forward: every agent role, tool, command, and skill the runtime registers —
  `AGENT_IDS`, `TOOL_NAMES` (`src/tools/names.js`), `COMMAND_NAMES`
  (`src/commands/names.js`), `SKILL_NAMES` — appears in the doc, the doc's
  Agents table names exactly `AGENT_IDS`, and no
  `presets/omd-<role>.patch.yml` has come back;
- reverse: every `omd_*` / `omd-*` token in the doc resolves to one of those
  known entities, to a documented wildcard family (`omd_task_*`,
  `omd_session_*`), or to an explicit non-entity allowlist (`omd-runtime` and
  `omd-ui`, the two Loader rows). Any other token fails with
  `parity unknown entity: <token> (doc line N)`, so the doc can no longer
  promise an entity nobody implements.

The name modules exist so the runtime and the gate share one list: the gate
imports them for the forward direction, and `tests/gate-parity.test.mjs` mounts
the real row to prove they still equal what `createTools()` and
`createCommands()` register. A renamed tool or command therefore fails in
`npm test`, not only in review.

### License audit exit codes

`npm run check:license` measures 8-gram overlap between `prompts/`, `skills/`
and `docs/` and a checkout of oh-my-openagent v4.19.4 named by
`OMD_UPSTREAM_DIR`. It is deliberately not part of `npm run check`, because
that checkout is not vendored. Its three exit codes are distinct on purpose:

- `0` — measured, and the shared 8-gram count is within the review threshold
  (≤ 200);
- `1` — measured, and the shared 8-gram count is over the threshold; inspect
  the sample 8-grams before release;
- `2` — **unmeasured**: `OMD_UPSTREAM_DIR` is unset, so the audit printed
  `license audit: UNMEASURED - set OMD_UPSTREAM_DIR to a checkout of
  oh-my-openagent v4.19.4` and measured nothing.

Exit 2 is not a pass. A skip that exits 0 would let "not measured" be quoted as
"clean-room claim held", so an unmeasured run must be recorded as unmeasured in
the release evidence.

## Live acceptance

1. Install the bundle; `application` must be `applied` with no warnings.
2. `Config.listConfigs` filtered by `@deepseek-ai/dsh-agent-preset` shows no
   `omd-*` entry: OMD registers no preset any more. The profile carries the two
   OMD Loader rows instead, `omd-runtime` and `omd-ui`.
3. In a new session, the `omd-doctor` skill reports no FAIL, and its
   `active-role` row reads `capability-only (no role persona)` for a root
   session.
4. Smoke: `/omd-init`, `/omd-ulw`, `/omd-status`, `/omd-handoff`. Open
   `Settings → OMD` twice: the page loads, and the session log gains **no**
   `command/run`/`command/done` records (the page's endpoint is not the command
   plane). Then ask the agent one question in that session: the turn must reach
   the model instead of failing with `Unsupported message role: undefined`.
5. Delegate once (`omd_delegate`): the child resolves the role named by its
   `omd:<role>` descriptor label, and a shipped, non-OMD preset session still has
   the OMD tools and commands while resolving to capability-only.

## Evidence standard

A completion claim needs the command and its output, not just "tests pass".
For UI or file results, include the artifact path. For skipped checks, state
the reason.
