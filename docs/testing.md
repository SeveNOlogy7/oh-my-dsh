# Testing

## Automated

```
npm test          # node --test "tests/**/*.test.mjs"
npm run check     # syntax, manifest, presets, contract, parity, version
npm run check:presets
npm run check:parity
npm run check:version
npm run check:license   # optional; skips without OMD_UPSTREAM_DIR
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
- contract: the JSON Schema covers every runtime default with a matching type
  and default, the eight built-in categories are named in the contract prompt,
  the docs, and `omd_delegate`, the documented agent and category override
  fields match the schema and the runtime, the Client half is declared,
  exported, reachable, and JSX-free, the doctor is a skill driving
  `omd_doctor` rather than a command, and the roster/version/skills agree with
  the manifest.

The runtime tests use a fake DSH context; they do not start a server or an
LLM request. No test renders the Client half: it is plain JavaScript loaded by
the browser module table, so only its manifest, syntax, registration targets,
and command names are checked here. Visual rendering stays a manual gate.

## Structural checks

`check.mjs` asserts:

- `package.json` version, private flag, `dsh.bundle.patch` has 11 entries;
- every patch exists and declares `preset-omd-*`;
- every preset includes exactly one `oh-my-dsh` runtime row;
- 11 agent prompts, 15 skills, schema, locale, icon, LICENSE, NOTICE, lock;
- every `.js`/`.mjs` parses;
- presets are in sync with the generator;
- `tests/contract.test.mjs` passes, so a new default, a renamed category, or a
  changed documented field fails the check before release.

`check-parity.mjs` asserts that every agent, preset, tool, command, and skill
appears in `docs/parity-omo-4.19.4.md`.

## Live acceptance

1. Install the bundle; `application` must be `applied` with no warnings.
2. `Config.listConfigs` filtered by `@deepseek-ai/dsh-agent-preset` shows the
   eleven `preset-omd-*` entries.
3. In a new session with an OMD preset, the `omd-doctor` skill reports no FAIL.
4. Smoke: `/omd-init`, `/omd-ulw`, `/omd-status`, `/omd-handoff`.
5. Standard preset session has no OMD tools/commands and no `.omd` writes.

## Evidence standard

A completion claim needs the command and its output, not just "tests pass".
For UI or file results, include the artifact path. For skipped checks, state
the reason.
