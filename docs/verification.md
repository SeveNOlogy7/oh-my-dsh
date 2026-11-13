# Verification record

Date: 2026-11-04. Reference: OmO v4.19.4.

> **This document is a record of the revisions that produced it, not a statement
> of the current tree.** The per-role presets were removed on 2026-11-10; see
> [Per-role presets removed](#per-role-presets-removed-2026-11-10) at the end for
> the current gates, the current numbers, and the list of transcripts below that
> the removal supersedes. The blocks in this file are left as they were measured.

## Automated

```
npm test
# 40 tests, 40 pass, 0 fail

npm run check
# check ok: 11 presets, 14 skills, 11 patches, syntax + contract + parity + version
```

> The block above is the 2026-11-04 measurement and is left exactly as recorded:
> every count in it is historical. The skill roster it reports as 14 is 15 today.

`npm run check` covers manifest and preset patches, 11 agent prompts, 14
skills (15 today), schema/locale/icon/resources, syntax of every `.js`/`.mjs`,
preset generator determinism, the contract suite, version lock, and parity coverage.

## Contract suite

`tests/contract.test.mjs` locks the interfaces that drift silently:

- the JSON Schema documents every runtime default key with an accepting type,
  declares no unknown top-level key, and repeats the runtime default values;
- the agent override schema covers every default agent setting, and
  `docs/configuration.md` lists exactly the agent fields the runtime accepts;
- the documented category fields match the schema, and the eight built-in
  categories are named in `prompts/agents/_contract.md`, in
  `docs/configuration.md`, and in the `omd_delegate` category description;
- the roster, version constants, and 14 shipped skills (15 today) agree with
  the manifest.

The gate was falsified before being trusted: adding a `driftProbe` default
agent field made `npm run check` fail with
`contract check failed: schema, docs, or roster drifted from the runtime`, and
the failure disappeared when the probe was removed.

Two real inconsistencies were fixed by this suite rather than merely reported:
`DEFAULT_AGENT_SETTINGS` carried a no-op `enabled` field that the schema did
not declare and nothing read (removed), and it omitted `modelRef` and
`allowedSubagents`, which the runtime and the docs both support (now defaulted
to `null`).

## Installation

`plugin_manager install_bundle` with target `E:\Oh-My-DSH`:

```
application: applied
warnings: []
packageResult.exitCode: 0
bundle: oh-my-dsh 0.1.0
```

`Config.listConfigs` filtered by `@deepseek-ai/dsh-agent-preset` returned 15
entries: the four shipped presets plus these eleven OMD presets:

```
include:preset-omd-sisyphus
include:preset-omd-hephaestus
include:preset-omd-prometheus
include:preset-omd-atlas
include:preset-omd-oracle
include:preset-omd-librarian
include:preset-omd-explore
include:preset-omd-multimodal-looker
include:preset-omd-metis
include:preset-omd-momus
include:preset-omd-sisyphus-junior
```

The list was re-read from the running desktop host during the final
verification pass: `total: 15`, every OMD entry reporting `status: schema`,
alongside the four shipped presets (`standard`, `ptc`, `minimal`, `cordis`).
The bundle therefore registers its eleven rows in the live host without
disturbing the shipped ones.

## Live preset mount probe

A verification-only host probe created blank agents through the same path the
Web session controller uses:

```js
ctx.agents.create({ sessionId, setup: (agentCtx) => ctx.agentPresets.mount(agentCtx, preset) })
```

It then read `ctx.tools.schemas(agent)` for each preset and disposed the agent.
No model request was made. All eleven presets mounted (`mounted.id` matched),
and the visible tool sets were:

| Preset | write/edit | omd_delegate | Notes |
|---|---|---|---|
| omd-sisyphus | yes | yes | full orchestrator |
| omd-hephaestus | yes | yes | full worker |
| omd-prometheus | yes | yes | write scope enforced by guard |
| omd-atlas | no | yes | conductor cannot write |
| omd-oracle | no | no | read-only |
| omd-librarian | no | no | read-only |
| omd-explore | no | no | read-only |
| omd-multimodal-looker | no | no | only read, glob, grep, read_image |
| omd-metis | no | no | read-only |
| omd-momus | no | no | read-only |
| omd-sisyphus-junior | yes | no | executes, cannot re-delegate |

`omd_task_*` was absent from every visible set because `taskSystem.enabled` is
false by default; the restriction is applied by the per-agent hook. `omd_lsp`
was absent because that test composition did not mount the `lsp` service.
`omd_look_at`, `omd_diagnostics`, session tools, notepad, mode, and status were
present where the role permits them.

A first probe run exposed a real activation bug: direct reads of optional
services (`ctx.lsp`, `ctx.subprocess`, `ctx.sessions`, …) threw
`cannot get property "lsp" without inject`. All optional reads were changed to
`ctx.get(name)`; the mount probe then passed for all eleven presets.

## Model smoke limitation

A headless-profile smoke request failed before any tool call:

```
ACCOUNT_QUOTA: Insufficient Balance (request_id: …)
```

The provider authenticated and listed models, but the test account has no
balance. This is an environment limit, not a plugin failure.

A second attempt used an in-app probe on the working `opencode-go` route, but
DSH reported `application: restart-required` for a newly installed host probe
(a plugin outside the managed plugin list), so it never activated. The probe
was removed again; the desktop profile still lists only `@deepseek-ai/dsh-base`,
`@deepseek-ai/dsh-web-app`, and `oh-my-dsh`. The live model smoke remains the
manual gate below.

## First live session

The user ran the manual gate in the desktop app on a new session
(`session-e3dc1765-b0c6-4b0f-ac0c-1957621adb32`, preset `omd-sisyphus`). The
session log settles what the GUI did not show: every command ran.

```
5  command/run  omd-init
6  command/done omd-init     kind: success
   .omd initialized at E:\Oh-My-DSH\.omd
8  command/done omd-doctor   kind: success
   PASS services: all required services present
   PASS presets: 11 OMD presets registered
   WARN active-preset: current preset is standard; select an OMD preset
   PASS omd-layout, config, spawn-provider, gitignore, bom
13 command/run  omd-ulw " 给readme加一行作为测试"
14 agent/inbox/spliced  [ultrawork] 给readme加一行作为测试
```

So `/omd-init` created the layout and `/omd-doctor` reported
`PASS presets: 11 OMD presets registered`: the bundle is live in the desktop app
and all eleven presets are registered.

The user still saw nothing in the conversation and the input box simply
cleared. The cause is a display contract, not a failure. Per the harness
documentation, a slash command "execute[s] in the UI command plane, and
[its] `CommandResult` text is not submitted as a user message", and the
`conversation.chat.commandview` cell for OMD's command names was unoccupied, so
the row fell back to the shipped generic card.
`/omd-ulw` was the one command whose effect the user could see, because it
always calls `agent.followup()`.

## Command output rendering

The live Client slot confirms the mechanism:

```
conversation.chat.commandview — keyed by the command name
occupants: none
ownerProps: { node: CommandNode, compaction?: CompactionSummaryNode }
```

The shipped `GenericCommandCard` shows `node.outcome.text` only after a click,
and only as a click-to-expand body (`const body = text.includes('\n') ? text :
null`). A report such as `/omd-doctor` therefore reduced to one collapsed line.

Two attempts were rejected before the current design:

1. **Submit the text through `agent.followup()`.** The user confirmed it was
   readable, then reported that the agent treated the output as the user's
   message and answered it. `followup()` always wakes the agent, so this cannot
   satisfy "see the result" without also buying a model turn.
2. **`agent.inject()`** does not wake the agent, but it also does not publish
   anything the user can see until other input arrives.

The bundle now ships a Client half, `client.js`, declared in `package.json` as
`dsh.client: { platform: 'web', immediately: true }` and exported as
`./client`. It registers one `conversation.chat.commandview` cell for each of
the 13 OMD commands. Each cell renders the command name, a state dot, and the
full `outcome.text` in a scrollable block, so:

- the output is readable the moment the command settles;
- no message enters the conversation, so the agent is never woken and never
  replies;
- the class only touches OMD command names, so other commands keep the
  shipped card.

Automated coverage for it is in `tests/contract.test.mjs`
(`the Client half is declared, exported, and reachable`): the manifest exports
`./client` and declares the web platform, `files` ships `client.js`, the loader
id is the package name, no JSX leaked into the plain-JS module, and every
command name the module registers exists in `src/commands/index.js`.
`npm run check` syntax-checks `client.js` with every other `.js` file.

Visual rendering is not verified here: the module only reaches the browser
after the page reloads the new module generation, and this session has no
browser control. The gate below covers it.

**The Client half did not load on the first attempt.** After the user restarted
the app, the live slot still reported `occupants: []` and the key domain still
reported "none are taken yet", so the Host never composed the entry. The
inspection data available to this session is exactly:

- `clientModules` is the deciding service. Its `clientPath(id)` returns the
  absolute path of an entry's client bundle, and `graph()` returns the rows
  served as `window.__DSH_BOOT__`. The Node half scans only Loader entries whose
  `options.name` is a bare package specifier, resolves that specifier through
  the Loader's own ESM resolution, and then walks to the nearest ancestor
  `package.json` whose `name` equals the specifier
  (`locatePkgJson`/`nearestPackage` in
  `@deepseek-ai/dsh-client-modules/lib/index.js`).
- `parseDshClient` accepts `dsh.client: { platform, inject?, external?,
  immediately? }` and `clientExportOf` accepts both the string form and the
  one-level conditional form of `exports["./client"]`, so this bundle's
  declaration and export shape are valid inputs.
- The scan is incremental per package with no full-rescan path; a name enters
  the dirty set from a cordis `internal/plugin` emission or from the activation
  pass, and a deleted package is only dropped by `reconcilePackage`.

The browser asset therefore moved into its own package, `ui/`, mounted by
`presets/omd-ui.patch.yml` as a row at the profile's top level:

```yaml
- insert:
    - id: omd-ui
      name: "../ui/index.js"
```

`ui/package.json` is a second package (`omd-ui`) that exports `./client` and
declares `dsh.client: { platform: 'web', immediately: true }`; `ui/index.js` is
a host half that registers nothing. Two things follow:

- The row is a Loader entry the scan resolves by specifier, unlike the runtime
  row that the preset plugin instantiates.
- The asset has its own package name, which the scan requires: two active
  sources resolving to one package name are rejected with "package resolves
  from multiple active Loader sources".

Two separate faults sat between the first attempt and a working renderer.

1. **The mount list was stale.** `package.json` listed a twelfth patch, but the
   loader tree still held only the eleven preset rows, so the row did not exist
   yet. Applying the bundle through the plugin manager re-read the list.
2. **The row named a directory.** `name: "../ui"` resolved to
   `file:///…/oh-my-dsh/ui`, and the loader reported
   `ERR_UNSUPPORTED_DIR_IMPORT: Directory import … is not supported resolving ES
   modules`. The row stayed `inactive` and the browser bundle was never
   composed. Naming the entry file (`../ui/index.js`) activated it; `../ui` is
   resolved against the patch file's directory because the include plugin sets
   `this.ctx.baseUrl = new URL('.', pathToFileURL(this.filename))`.

After the fix the row is active and the live Client slot reports all fourteen
cells:

```
conversation.chat.commandview
occupants: omd-init, omd-status, omd-doctor, omd-config, omd-ulw, omd-plan,
           omd-hyperplan, omd-team, omd-start-work, omd-stop-continuation,
           omd-handoff, omd-init-deep, omd-refactor, omd-remove-ai-slops
```

`omd-doctor` reports `client-half`, which reads
`clientModules.clientPath('omd-ui')` and fails loudly when the Host did not
register the bundle, and `omd_ui_status` prints the same path plus the boot
graph and the matching Loader rows. A `FAIL client-half` means the Host never
composed the row; `PASS client-half` with an unchanged UI means the row reaches
the browser and the renderer itself is at fault.

## Preset picker: no hidden presets

The user asked that only the four primary agents be directly usable, with the
other seven reachable only by delegation. That is not expressible in DSH
0.2.1-rc.5. The deciding evidence:

- `PresetDefinition` is `{ id, name?, description?, order?, plugins }` — there
  is no `hidden`, `selectable`, or `mode` field, and the preset Config schema
  (`Config.listConfigs` on `include:preset-omd-sisyphus`) declares exactly those
  five properties.
- The registry's `remoteExportList()` maps `list()` straight through, marking
  only `isDefault`; the picker filters on `preset.broken === void 0` and nothing
  else, so every healthy preset is offered.
- The one client-side filter, `requiresCodingTools`, returns true only for the
  shipped `ptc` and `minimal` ids, so it cannot be borrowed.

Unregistering the seven would not work either: the subagent service mounts a
child with `presets.mount(childCtx, composition.agentPreset)`, so the preset must
be registered. `SubagentStartRequest` carries only `cwd`, `agentPreset`, `label`,
`prompt`, `parent`, `signal`, `agentOptions`, `outputSchema`, and `maxDepth` —
`persona` and `toolFilter` belong to the internal composition, not the request —
so a child cannot be given its role without a preset.

The chosen resolution keeps all eleven presets and shows the hierarchy through
the two fields the picker does read:

- `order` puts the primaries first (`10-13`) and the subagents after (`20-26`),
  and the registry sorts by `order` then id.
- each subagent description ends with the shared `DELEGATION_ONLY` marker,
  naming `omd_delegate` and saying the role is not meant to drive a session.

## The picker hid every primary preset

After the desktop application updated itself, the picker showed all four
delegating presets with a red failure badge and the new-session selector offered
no OMD preset at all, while `/omd-*` still worked in sessions created earlier.
`/omd-doctor` named the cause exactly:

```
FAIL presets: broken: omd-sisyphus, omd-hephaestus, omd-prometheus, omd-atlas
FAIL preset-detail: omd-sisyphus: tool-subagent-list-agents
     (@deepseek-ai/dsh-tool-subagent-control/list-agents): never started
```

The audit that produced it is `auditRows` in
`@deepseek-ai/dsh-agent-preset-registry`:

```js
if (fiber === void 0) failed.push(`${id} (${name}): never started`)
else { await fiber.await() ... }
const missing = Object.keys(fiber.inject).filter((n) => fiber.ctx.get(n) === void 0)
if (missing.length) pending.push(`${id} (${name}): waiting for ${missing.join(', ')}`)
```

and `diagnostic()` returns `[...audit.failed, ...audit.pending].join('\n')`, which
`list()` publishes as `broken`. The picker then filters on
`preset.broken === void 0`, so one unstartable child row removes the whole preset
from the selector.

The row came from this bundle's own generator, which inserted
`@deepseek-ai/dsh-tool-subagent-control/list-agents` for every delegating role.
The installed application does not ship that row: the specifier appears nowhere
in `app.asar`, and the shipped composition loads
`@deepseek-ai/dsh-tool-subagent-control` once, with a comment that the follow-up
tool loads separately. Only the four primaries carry a subagent-control row, only
the four primaries were red, and that is the whole explanation.

The generator now inserts the control row alone. Two gates hold it:
`scripts/check.mjs` fails on the specifier with
`mounts dsh-tool-subagent-control/list-agents, which is not a loadable row`, and
`tests/contract.test.mjs` asserts the same across every preset patch. Both were
falsified before being trusted: re-inserting the row made `npm run check` exit 1,
and restoring the file made it pass again.

Two lessons worth keeping:

- `Config.listConfigs` reports `status: schema` for a preset row even when its
  activation audit fails, so it cannot be used to judge preset health. The
  registry's `broken` text is the only signal, and `/omd-doctor` now prints it
  via `preset-detail`.
- A preset that fails to load is invisible in the picker, not marked in the
  session. "The command works in an old conversation but the preset is gone from
  a new one" is that failure mode, not a caching problem.

`tests/contract.test.mjs` holds both properties, so a later edit cannot quietly
drop the marker or invert the ordering.

## Doctor warnings closed (4 warn → 1 warn)

The first live `omd-doctor` run reported 8 pass / 4 warn. Three of the four
warnings are closed; the fourth is a user-side session setting.

1. `WARN config-readable: config.jsonc parse` was a plugin defect.
   `runDoctor` validated `.omd/config.jsonc` with `readJsonSafe`, which uses
   strict `JSON.parse`, while the same file is loaded through `parseJsonc` and
   is documented to allow comments and trailing commas. The file it rejected
   was the plugin's own shipped config. `src/core/atomic.js` now exports
   `readJsoncSafe` (same `missing | io | parse` contract, plus a `detail` with
   the JSONC parse message) and `doctor.js` uses it for the router check, so a
   genuinely malformed file is still reported.
   Probe: `readJsonSafe('.omd/config.jsonc')` → `{ok:false,reason:'parse'}` on a
   config that `loadConfig` parsed into 1 source with 0 diagnostics.
2. `WARN diagnostics: no diagnostics commands configured` was a config gap, not
   a bug: `.omd/config.jsonc` shipped `"commands": []`. It now runs
   `node --test tests` and `node scripts/check.mjs`, the two commands that
   actually gate this package, both re-verified from the workspace root.
3. `WARN ast-grep: sg executable not found` was an environment gap. ast-grep was
   the one tool the bundle expects but never had. `npm install -g @ast-grep/cli`
   puts `sg` on `%APPDATA%\npm`, which is already on `PATH`; `sg --version`
   reports `ast-grep 0.51.1` (with a deprecation note that `sg` is now
   `ast-grep`). The [omd-ast-grep](<skills/omd-ast-grep/SKILL.md>) skill is now
   usable.
4. `WARN active-preset: current preset is standard` is unchanged and is a
   session choice: it reads `sessions.get(agent.id).header.agentPreset` and
   clears as soon as the session runs an OMD preset (Sisyphus · OMD).

Verification of the fix, run through the real `runDoctor` against this
workspace (`tests/helpers/fake-context.mjs`, real `.omd`):

```
PASS services, presets, omd-layout, config, spawn-provider, ast-grep,
     diagnostics (2 configured command(s)), gitignore, bom, upstream-lock,
     config-readable
WARN active-preset: current preset is standard
summary: 11 pass, 1 warn, 0 fail
```

Runtime state is cached per agent (`Runtime.stateFor`), so the running session
keeps the pre-fix `doctor.js` and the pre-edit config until it restarts; a new
session picks both up. The regression test
`tests/core.test.mjs: readJsoncSafe accepts comments and trailing commas,
rejects real JSON errors` holds the reader contract.

## Remaining manual gate

The `client-half` result is the first thing to read, because it separates the two
possible failures.

1. Restart the app once more. `omd-doctor` runs inside the loaded plugin module
   generation, and the new `client-half` check only exists in this one; a new
   session alone does not reload it.
2. Open a new session — there is no OMD preset to select — and run the
   `omd-doctor` skill (it calls the `omd_doctor` tool). Report the `client-half`,
   `active-role`, and `active-preset` lines.
   - `PASS client-half` → the Host composes the bundle and the row reaches the
     browser, so the renderer is what needs work.
   - `FAIL client-half` → the Host never composed the row; the fix belongs in
     the bundle declaration or the install, not in `client.js`.
   - `PASS active-role: capability-only (no role persona)` is the expected reading
     for a root session: a role arrives on a delegated child's `omd:<role>`
     descriptor label, which a root session never carries.
3. Run `/omd-init`. Its output must appear inline and the agent must not answer:
   no reply row should appear.
4. Run a short smoke such as `/omd-ulw add one line to README`.
5. Confirm a standard session has no `omd_*` tools or `/omd-*` commands.
   *Superseded for v0.1.3:* the runtime row moved to profile level, so a
   standard session now has both and resolves to capability-only. See
   "Global runtime row and capability-only identity (2026-11-09)" below.

The desktop profile cannot be dumped with the CLI (`managed exclusively by the
Electron application`), so step 5 is intentionally a user-visible check.
Everything up to and including the live mount of all eleven presets is already
covered above — that probe ran against the retired `omd-<role>` presets, which
nothing in the current architecture mounts; steps 2 and 3 are the only parts
automated checks cannot reach.

## Doctor: command → skill (2026-11-06)

The transcripts above were recorded on 2026-11-04, when the doctor was the
`/omd-doctor` command, and they are left exactly as recorded. The doctor is now
the `omd-doctor` skill driving the `omd_doctor` tool, and `/omd-doctor` no
longer exists. Wherever an earlier section says to run `/omd-doctor`, run the
skill instead, and expect the report as a tool result rather than a command row.

## Global runtime row and capability-only identity (2026-11-09)

This section records the v0.1.3 change and the state of its verification. It
supersedes the zero-intrusion expectation wherever an earlier section states it;
those sections are left exactly as recorded.

The plugin row moved out of the presets. `@jhcai11/oh-my-dsh` used to be
declared as an `omd` row inside each of the eleven preset patches. It is now
declared once at profile top level, by the generated
`presets/omd-runtime.patch.yml`:

```yaml
- insert:
    - id: omd-runtime
      name: "@jhcai11/oh-my-dsh"
```

Two consequences follow.

*Superseded (2026-11-10): OMD registers no per-role preset any more. Consequence
2 below, the paragraph about the seven subagent presets further down, and the
`WARN active-preset: current preset is standard` note under "Doctor warnings
closed" describe the v0.1.3 arrangement; see "Per-role presets removed
(2026-11-10)" at the end of this file for what replaced it. Consequence 1, and
everything about the capability-only identity, still holds.*

1. OMD's capability surface — the `omd_*` tools, the `/omd-*` commands, the
   `omd-*` skills, the keyword→mode hook, ultrawork continuation, and `.omd/`
   durable state — is available in every preset, including the shipped
   `standard`, `ptc`, `minimal`, and `cordis`. The old zero-intrusion guarantee
   (a standard session with no OMD surface and no `.omd/` directory) is retired.
2. The OMD role is resolved lazily, at request time, from the session's active
   preset. An `omd-<role>` preset selects that role's persona prompt, tool
   policy, write scopes, and skill set. Any other preset resolves to
   capability-only: orchestration is available, no OMD persona is injected, and
   no role restriction is applied.

The seven subagent presets keep their registered rows and stay visible in the
picker for the reasons recorded under "Preset picker: no hidden presets" above:
`omd_delegate` mounts a child by preset id (`agentPreset: omd-<target>`), DSH's
preset declaration schema exposes only id/name/description/order/plugins, and
`AgentPresetRegistry.list()` returns every registered preset. Their descriptions
keep the shared "Delegation target" marker.

### Verification status of this change

Measured on the working tree on 2026-11-09.

The probe was changed to drive the real picker path,
`ctx.agentPresets.select(agent, preset)`: that call both recomposes the Agent and
appends `agent-preset/selected` to the session, which is what a top-level runtime
row resolves its role from. Mounting a preset directly in
`ctx.agents.create({ setup })` is not the production path — `createAgent` accepts
`{sessionId, seed, meta, inheritedEventCount, agentOptions, setup, signal,
parentAgent}` and has no `agentPreset` option — so such a session carries no
preset, correctly reads as capability-only, and cannot measure a role at all.

The probe recorded the visible tool set for all twelve presets, before and after
the selection:

| Preset | `omd_*` tools | write/edit | `omd_delegate` |
|---|---|---|---|
| `standard` (shipped, not OMD) | 14 | yes | yes |
| `omd-sisyphus`, `omd-hephaestus`, `omd-prometheus` | 14 | yes | yes |
| `omd-atlas` | 14 | no | yes |
| `omd-oracle`, `omd-librarian`, `omd-explore`, `omd-metis`, `omd-momus` | 9 | no | no |
| `omd-multimodal-looker` | 1 | no | no |
| `omd-sisyphus-junior` | 9 | yes | no |

A shipped, non-OMD preset therefore sees the whole orchestration surface, and the
eleven OMD presets keep the tool sets the earlier table records. The 14 excludes
`omd_task_*`, which the policy hook denies while `taskSystem.enabled` is false,
and `omd_lsp`, which needs an LSP service this probe composition does not mount.
`omd_look_at` is among the 14 for the four delegating roles and absent for the
rest, the same policy that hides `omd_delegate` from them.

Also measured in the same pass: `npm test` passes 84 tests, and `npm run check`,
`npm run check:presets`, `npm run check:parity`, and `npm run check:version` all
exit 0.

Not measured: no model request was made, so the injected system-prompt sections
were never observed live. The persona is a section whose `text` is a function, and
DSH evaluates a function section per assembly, so the lazy read is held by the
unit tests rather than by this probe.

Host caveat: the probe ran against the CLI `dsh` 0.2.1-rc.5. The desktop
application bundles a newer host, so the same behavior there is not yet measured;
re-run the probe after the desktop profile installs this revision.

## Per-role presets removed (2026-11-10)

OMD registers no preset per role any more. `dsh.bundle.patch` lists only the two
Loader rows, `omd-runtime` and `omd-ui`; the eleven
`presets/omd-<role>.patch.yml` files are gone; and `scripts/check.mjs` fails the
build if either the mount list or the runtime row (with an `agent` key) brings
one back. The role is resolved in one place, in this order:

1. an `agent` pinned on the mounting row;
2. the session's own `omd:<role>` `subagent/descriptor` label — written by
   `omd_delegate` and `omd_look_at`, read back by `src/state/active-role.js` off
   the child's own session log, last descriptor wins;
3. a pre-existing `omd-<role>` preset, kept only so a session created before this
   change keeps resolving the role it was created with.

A session that resolves none of them is the capability-only identity. Because a
delegated child no longer gets its role from a preset, `delegation.childPreset`
is a plain per-workspace choice: `null`, the default, leaves `agentPreset` off
the activation request, so DSH composes the child from the parent session's
composition, and a non-empty trimmed string pins a preset id.

This supersedes every preset-based statement recorded above, in particular the
`PASS presets: 11 OMD presets registered` and `WARN active-preset` rows of the
2026-11-04 transcript, the 15-entry `Config.listConfigs` list, the eleven-preset
mount probe table, consequence 2 and the "seven subagent presets keep their
registered rows" paragraph of the 2026-11-09 section, the `WARN active-preset:
current preset is standard` note under "Doctor warnings closed" (nothing clears
it by "running an OMD preset" now), and the step in "Remaining manual gate" that
selected **Sisyphus · OMD**. The transcripts themselves are left exactly as
recorded, as the 2026-11-06 section promised; they measured the revision that
produced them, and the doctor rows they print are no longer what this revision
prints.

### Doctor rows of this revision

Measured on the working tree on 2026-11-10 through `src/tools/omd_doctor` against
`tests/helpers/fake-context.mjs` and a real `.omd` workspace, one row set per
session shape (`client-half`, `omd-layout`, `diagnostics`, and `gitignore` warn
in that scratch workspace exactly as they do for a fresh one):

```
=== global row, role from the descriptor label (preset standard) ===
PASS presets: no omd-* preset is registered; the OMD role rides the delegation label
PASS active-preset: standard (capability-only preset; OMD roles ride the delegation label)
PASS active-role: oracle
summary: 10 pass, 4 warn, 0 fail

=== global row, root session, no label ===
PASS presets: no omd-* preset is registered; the OMD role rides the delegation label
PASS active-preset: standard (capability-only preset; OMD roles ride the delegation label)
PASS active-role: capability-only (no role persona)
summary: 10 pass, 4 warn, 0 fail

=== global row, legacy omd-sisyphus preset ===
PASS presets: no omd-* preset is registered; the OMD role rides the delegation label
PASS active-preset: omd-sisyphus (per-role preset from an older install; the delegation label outranks it)
PASS active-role: sisyphus
summary: 10 pass, 4 warn, 0 fail
```

`presets` is the one check whose expectation inverted: it now asserts the
absence, and its three failure modes were measured too.

```
=== two leftover per-role presets registered, one of them broken ===
FAIL presets: 2 omd-* preset(s) are registered: omd-sisyphus, omd-atlas; OMD registers none and a role rides the delegation label
     fix: Remove the per-role preset declarations (an older Oh-My-DSH install generated one per role), reinstall the bundle and restart the app.
FAIL preset-detail: omd-sisyphus: tool-subagent-list-agents: never started

=== agentPresets.list() throws ===
WARN presets: could not list presets: registry exploded

=== agentPresets service absent ===
WARN presets: agent preset registry unavailable; cannot check for leftover per-role presets
```

### Automated

```
node --check src/state/doctor.js                 -> exit 0
node --check src/i18n/messages.js                -> exit 0
node --check src/state/status.js                 -> exit 0

node --test tests/i18n.test.mjs
✔ the English catalog mirrors the call sites and the SKILL.md frontmatter (1.4561ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0

node --test tests/core.test.mjs
ℹ tests 22
ℹ pass 22
ℹ fail 0

node scripts/check-parity.mjs
parity ok: 11 agents, 19 tools, 13 commands, 15 skills

npm test
ℹ tests 94
ℹ pass 94
ℹ fail 0
```

### Not measured

- No model request was made in *that* pass, so no persona text was observed live.
  (The delegated-child gate below was closed later, on 2026-11-10.)
- The role a session presents in the Web UI is not asserted anywhere: the
  Settings page reports `language` and routing tiers only.

## Declared DSH compatibility (2026-11-10)

`package.json` declares `engines.dsh: "^0.2.1-rc.5"`. DSH reads `engines.dsh`
alone — it decides the whole requirement and the `@deepseek-ai/dsh*` peer ranges
are then ignored — and evaluates it with `semver.satisfies(..., { includePrerelease: true })`.
Unmet requirements block both installation and activation.

**Why the caret form and not `<0.3.0`.** With `includePrerelease` a plain
`<0.3.0` upper bound still admits `0.3.0-alpha.1`. The caret form expands to
`<0.3.0-0`, which excludes the entire next minor while keeping the prereleases
inside this one. Verified range-by-range against the same semver DSH uses:

| Runtime | `^0.2.1-rc.5` |
| --- | --- |
| `0.2.1-rc.2` | excluded (untested) |
| `0.2.1-rc.5` | included — **boot-verified, see below** |
| `0.2.2-alpha.3` | included |
| `0.2.2-rc.1` | included — **end-to-end verified, see below** |
| `0.3.0-alpha.1` | excluded (unverified minor) |

### Evidence for the two builds

**`0.2.2-rc.1`** (the running install) — end-to-end, MEASURED. `omd_delegate`
spawned an `oracle` child; the child ran `omd_doctor` and reported
`active-role: oracle`, and its own session log carries
`{"type":"subagent/descriptor","data":{"version":3,"mode":"continuable","provider":"spawn","label":"omd:oracle"}}`
alongside `"agentPreset": "standard"`. That is the role channel working on a real
delegation: the role came from the label, not from a preset, and the child's
preset was inherited rather than pinned.

**`0.2.1-rc.5`** (the published floor) — boot-verified, MEASURED. In an isolated
`DSH_HOME` (never the user's profile), a profile was created from the shipped
`web` template, Oh-My-DSH was added as a bundle, and the host was booted with
the composed tree reporting no loader error. The served shell's boot roster
contains `omd-ui/client.js`, so OMD's rows composed, mounted and served their
browser bundle under this version.

**Why the role channel is expected to work identically at the floor**, READ:
`dsh-subagent` appends the descriptor inside the same `setup` callback in both
builds — `child.session.append("subagent/descriptor", create.descriptor)`, at
`0.2.1-rc.5` line 1800 and `0.2.2-rc.1` line 1806. DSH's own subagent machinery
therefore depends on a `setup`-time append in both. The append is not guarded on
the session having entered the `sessions` service: `publicationEntry()` returns
`undefined` for a detached session without throwing, and the only guard refuses
a *reentrant* append while another append is publishing. The one ordering
difference between the builds — `0.2.2-rc.1` enters and announces the session
before `setup`, `0.2.1-rc.5` after — therefore does not reach this append.

### Not measured, and what would settle it

- **No end-to-end delegation was run on `0.2.1-rc.5` itself.** The floor's
  evidence is a real boot plus a source-level equivalence argument, not an
  observed child session. To close it: boot an isolated `0.2.1-rc.5` profile with
  a working model route, delegate once, and check the child's log for the
  `subagent/descriptor` label and `active-role` from inside the child.
- The two builds are not byte-identical, so an equivalence argument is only as
  strong as the statements it compares.
- The range is pinned by `tests/contract.test.mjs`; widening it without
  re-running the above is exactly the drift that test exists to prevent.




## Partial user messages poisoned sessions (2026-11-11)

A session died with `本轮运行失败 Unsupported message role: undefined` on every
turn, including a bare "continue". The failure is not transient and not the
provider's: the session log contains a message the model API can never accept.

### Cause — MEASURED from the poisoned log

The session's own log (`session-32c14763`, decompressed `session.v4.jsonl.zstd`)
has, at seq 2283, a durable record:

```json
{"type":"user/message","seq":2283,"data":{"content":[{"type":"text","text":"[ultrawork] …"}],"source":{"kind":"user"}}}
```

No `role`, no `id`. It is the message `/omd-ulw` spliced into the inbox
(seq 2239 `agent/inbox/spliced` carries the same partial object). DSH's
`agent.followup()`/`agent.steer()` are typed `UserMessage` — `{id, role: 'user',
content, source}` (`dsh-llm/lib/types/message.d.ts`) — and normalize nothing:
the loop splices the object it is given and later commits it verbatim as
`user/message` (`dsh-agent-loop/lib/index.js` `followup()` → `send()` →
`session.append("user/message", message)`). The history projection then hands the
provider a message whose `role` is `undefined`, and
`assertSupportedHistory` rejects it:

```
dsh-opencode-go/lib/index.js:1403  throw new LlmError(`Unsupported message role: ${message.role}`, "UNSUPPORTED_CONTENT")
```

Because the record is durable, every later turn of that session fails the same
way; twelve turns after seq 2283 failed identically. The partial shape is exactly
what DSH's own `dsh-agent` README example shows, which is why it looked right.
Every shipped DSH caller instead builds the message with `createUserMessage`
(`dsh-command-goal/lib/index.js:100`, `dsh-goal-round-driver/lib/index.js:144`,
`dsh-subagent/lib/index.js:1590`, `dsh-schedule/lib/index.js:1586`).

### Fix

`src/core/message.js` builds `{id: randomUUID(), role: 'user', content, source}`
for every message OMD constructs — `agent.followup()` in
`src/commands/index.js`, `agent.steer()` and the tool-feedback contexts in
`src/hooks/index.js`. `tests/message-contract.test.mjs` asserts the full contract
on all of them; deleting the fix makes it fail with
`role must be 'user'; DSH persists this object verbatim…` (negative control run).

A scan of all 221 session logs under `$DSH_HOME/sessions` found 7 poisoned logs
(6 workspaces sessions plus one probe session, 14 role-less messages in total,
the oldest from a `[ultrawork]` run on 2026-11-09). Each affected `user/message`
and its paired `agent/inbox/spliced` entry was given `role: "user"` and one
shared UUID identity, every other record left byte-identical, and the rewritten
log re-decoded to the same record count before the original was replaced. A
timestamped `.bak-*` copy of each log stays beside it; the rescanned tree reports
`no role-less user messages found`.

### Settings page no longer executes a command (same report)

`Settings → Oh-My-DSH` called `ctx.remote.commands.execute(agentId,
'/omd-config')` on every mount, which the same log proves: seq 2230/2231,
2234/2235 and 2236/2237 are three `command/run` + `command/done` pairs, one per
page open, in a session the user never typed a command into. The page now posts
its line to `POST /api/omd/config`, registered by the runtime row through
`ctx.connection.fetch.register` — DSH's authenticated `/api` channel applies the
Host/Origin fence and the browser cookie, answers 403 to non-owner peers, and
needs no `webServer`, so it also survives the shell-owned carrier. The Host
resolves the workspace from the session id (live header, then the persisted log,
then the profile's default working directory), so a browser request cannot name a
path.

### Gates run

```
npm test        # 112 tests, 112 pass, 0 fail  (baseline before this change: 97)
npm run check   # check ok: 11 role prompts + 15 skills, 2 patches (runtime + UI asset), syntax + contract + parity + version
```

### Not measured — the remaining gate

- **The Host half needs a process restart** (the OMD row is loaded in-process;
  the browser half alone reloads on refresh). The live proof is: restart, open
  `Settings → Oh-My-DSH` twice, confirm the session log gains no
  `command/run`/`command/done` records, then send a message in that session and
  confirm the turn reaches the model instead of failing with
  `Unsupported message role: undefined`.
- The route handler is tested against a fake `connection.fetch.register`; the
  real dispatch is DSH's, reached only after that restart.

### Audit of the same class of defect (2026-11-11, after the fix above)

A read-only contract audit of every DSH call OMD makes (30 checks passed) found
four further silent defects and one test-fixture trap. All are fixed in this
change, and each fix is proven by a negative control — the fix was reverted, the
named test failed, the fix was restored:

| Id | Defect | Control that fails without the fix |
| --- | --- | --- |
| S1 | `session/event` listener read `event.data.message.content`, but a `user/message` event's data IS the message (`SessionEventMap['user/message'] = UserMessage`, `dsh-session/lib/types/types.d.ts:295`). The keyword hook never fired. | `keyword detection sets a mode and turn-stopping steers` |
| S2 | `/omd-handoff` used the assistant-shaped `data.message` for `user/message` too, dropping every human instruction from the handoff document. | `the handoff document keeps the user turns of the transcript` |
| S3 | `omd_session_read` made the same mistake, so the transcript handed back to the model had no user turns. | `session read tolerates the header-shaped snapshot and keeps user turns` |
| S4 | `resolveActivePreset`/`resolveDescriptorRole` extracted `sessionQuery.readSession` and called it detached; it reads `this._corpus` (`dsh-session-query/lib/index.js:1081-1088`), so the call threw and the swallow reported "no answer" — both disk fallbacks were dead. | `a role only the persisted log carries is still resolved` |
| F1 | Two test fixtures emitted `{type:'user/message', data:{message:{…}}}` — the wrong shape, and without `id`/`role`, so they passed only by reproducing the bug. | fixed in the same change; the fixtures now carry a real `UserMessage` |

The same audit confirmed the client `sessions` service is used correctly
(`sessions.list` is a snapshot store; `getSnapshot().byId` rows carry
`running`, `retainedBy`, and `cwd`), so the page's workspace pick was not a bug.

Version note on the symptom: the `Unsupported message role:` throw lives in
`dsh-opencode-go`, which is installed in the running 0.2.2-rc.1 profile but is
not part of the published 0.2.1-rc.5 tree. The durable-failure chain is identical
in both: append does not validate message identity (`dsh-session/lib/index.js`),
the loader rejects a stored `user/message` without `id`/`role`
(`dsh-session/lib/index.js:1199-1203`), and any read through `sessionQuery`
re-validates it. So the defect is version-independent; only the wording of the
first visible error differs.

Gates after the audit fixes:

```
npm test        # 115 tests, 115 pass, 0 fail
npm run check   # check ok: 11 role prompts + 15 skills, 2 patches (runtime + UI asset), syntax + contract + parity + version
npm run check:presets / check:parity   # both exit 0
```

## Settings page overhaul (2026-11-11)

`Settings → OMD` was a form for six keys. It now covers the configuration this
runtime actually reads, and it behaves like a settings page: it knows where a
value comes from, what it is about to write, and what it refuses to write.

### Coverage

Every key below gets a control, grouped by purpose:

| Group | Keys |
| --- | --- |
| General | `keywordHook`, `taskSystem.enabled` |
| Keyword activation | `keywords.ultrawork`, `keywords.team`, `keywords.hyperplan` |
| Delegation | `delegation.maxConcurrent`, `.maxDepth`, `.waitTimeoutMs`, `.defaultBackground`, `.childPreset` |
| Hooks and continuation | `hooks.commentChecker` (`off`/`warn`/`block`), `hooks.todoContinuation`, `ultrawork.maxContinuationRounds`, `hooks.modelRouting`, `hooks.prometheusGuard`, `hooks.notepadGuard`, `hooks.planValidator` |
| Rules | `rules.paths`, `rules.maxBytes` |
| Diagnostics | `diagnostics.commands` |
| Advanced | this file's own `agents` / `categories` / `models` document |

The read-only Plugin section is unchanged: the row's `language`, every category's
effective routing tier with its source, and the copyable `cordis.patch.yml`
override.

Keys the schema accepts but the runtime does not read yet are **not** turned
into controls that would change nothing. When the file sets one, the page names
it: `review`, `telemetry`, `skills`, `disabledHooks`, `delegation.pollMs`,
`hooks.rulesInjection`, `ultrawork.requirePlanGate`, `ultrawork.dualEvidence`,
`ultrawork.maxWaves`.

### Provenance, validation, and the minimal write

- Each field is tagged `in file` (this workspace file sets it), `inherited`
  (another configuration layer sets it), or nothing (built-in default, shown as
  `Default: …`). The bounds are the envelope's `fileConfig`, `layers`, and
  `defaults`.
- Values are validated in the browser with the Host's rules (integer minimums,
  enum membership, JSON shape). A bad value is an inline message with
  `aria-invalid` and a disabled Save; the Host stays the authority and its
  validator message is shown if it still rejects.
- A save writes only the keys the user changed, compared with the values the
  page loaded. Resetting a field, clearing a number, or emptying a list whose
  file value exists stages a **removal** instead, so the inherited value applies
  again. The page sends `{"patch":…,"unset":…}` only when a removal is staged;
  otherwise the payload is the unchanged legacy patch object.
- The advanced document starts from the file's own overrides, not the merged
  value, so editing one category never copies every inherited
  `agents`/`categories`/`models` entry into the workspace file.

### Wire additions

The envelope keeps protocol `1` and gains two fields: `layers` (every parsed
layer with the top-level keys it sets, farthest first) and `defaults` (a clone of
the shipped defaults per answer). The write line gains a second form:
`set {"patch": {...}, "unset": [["delegation","maxConcurrent"], …]}`. Both keys
are optional, a removal the file does not perform is a no-op, the patch wins over
a removal on the same or an overlapping path, and a rejected write leaves the
file byte-identical. `write.unset` reports the paths actually removed.
`/omd-config` accepts the same line, so a human typing the command can do
everything the page can; `src/commands/index.js` forwards `parsed.unset`.

Removal is spliced, not rewritten: comments, trailing commas, key order, and every
untouched line survive, an emptied object is pruned (never the document root),
and the spliced text is re-parsed and deep-compared to the validated document
before it is written. Anything undecidable — a duplicate key, a span that does
not round-trip — degrades to the existing whole-document rewrite. Line endings
are the one exception: the shared atomic writer (`src/core/atomic.js`) normalizes
every file it writes to LF, before and after this change, so a CRLF
`.omd/config.jsonc` is converted on the first save. The splicer preserves CRLF in
its own output, but that unit behaviour is not reachable end-to-end.

### Compatibility

The browser asset reloads on a page refresh; the OMD Loader row lives until the
app restarts. The page therefore may run against the previous Host for a while
and degrades instead of failing: without `defaults` it offers no reset
affordance, without `layers` it falls back to the source list, and a save without
removals uses the legacy `set {<patch>}` form that Host understands.

### Gates

```
npm test        # 153 tests, 153 pass, 0 fail   (baseline before this change: 115)
npm run check   # check ok: 11 role prompts + 15 skills, 2 patches (runtime + UI asset), syntax + contract + parity + version
npm run check:presets   # exit 0
npm run check:parity    # parity ok: 11 agents, 19 tools, 13 commands, 15 skills
npm run check:version   # version ok: omd 0.1.3, omo 4.19.4 @ b072d279
node --check ui/client.js   # exit 0
```

The 38 new tests are split by contract: `tests/config-page.test.mjs` and
`tests/config-transport.test.mjs` hold the Host half (envelope fields, both write
forms, removal splicing and pruning, validation refusal, transport forwarding);
`tests/config-page-ui.test.mjs` renders the browser half in a React stub (control
coverage, provenance tags, minimal patch, staged removal, inline validation, the
unsaved-changes guard, the old-Host degrade path — including a removal that old
Host cannot express and must not receive, an emptied inherited value explained
inline, diagnostics entries preserved verbatim, failure states, en/zh key parity,
and the source-shape rules); `tests/config-page-roundtrip.test.mjs` drives the
rendered page through the route's own parser into a real temp workspace and back,
so the two halves are measured against each other rather than against their own
mocks.

### Review findings closed before completion

An independent review found two client-half defects; both were fixed before this
record was written, and each fix is held by a test plus a negative control.

| Id | Defect | Fix |
| --- | --- | --- |
| B1 | With a Host from before this page version (no `defaults`), clearing a value the file set, or emptying an advanced section, still produced `unset` and was refused by that Host as an unknown top-level key. | `requestFor` takes the capability; a removal it cannot express is collected as *blocked*, named in a persistent notice, and never sent; Save stays disabled until the app restarts or the removal is undone. |
| B2 | Editing the diagnostics list rebuilt every entry as `{command, args}`, deleting a schema-valid `glob` key from entries the user did not touch (and turning string entries into objects). | The control now reuses the original entry for every unchanged line; only a line the user rewrote becomes `{command, args}`. |

Two smaller corrections from the same review: the pruning comment in
`config-store.js` claimed an empty object would eclipse a parent layer (it does
not; pruning is tidiness), and an unreachable `validate` branch was removed. An
emptied control whose value only an inherited layer provides now says so inline
(the inherited value stays and nothing is written) instead of leaving an empty
control beside a clean "No unsaved changes".

### Negative controls

Four controls were run against copies of the working files, then restored
(verified by SHA-256 before/after):

| Control | Result |
| --- | --- |
| `requestFor` drops a staged removal instead of sending `unset` | **2 tests fail**: the client removal test and the round-trip test |
| The store validates `mergeDeep(document, body)` and ignores the removals | **6 tests fail**, including the round-trip, the pruning test, the patch-wins test, the rejection test and the fallback-rewrite test |
| A removal is sent even when the Host cannot express one (B1 reverted) | **1 test fails**: the old-Host blocked-removal test |
| Diagnostics entries are rebuilt instead of reused (B2 reverted) | **1 test fails**: the glob-preservation test |

Splicer behaviour was also spot-checked directly on middle/last/sole/inline/
CRLF/trailing-comma/duplicate-key/all-root-removals: comments survive, an emptied
parent is pruned, a duplicate key answers `null` (rewrite fallback).

### Not measured

- **Pixels.** The Windows session is locked in this environment, so no
  navigation to `Settings → OMD` is possible and no screenshot of the page
  exists. The verifier could capture the app window with `PrintWindow`
  (`PW_RENDERFULLCONTENT`) but not drive it: UIA exposes only the native frame,
  posted mouse messages are ignored by Chromium, and `SetForegroundWindow`
  returns false. Verification of the page's appearance is therefore open; the
  client half's behaviour is covered by the render tests above.
- **A live request through the new route.** The Host half is frozen at app start
  (16:18), and restarting the app ends the session that would observe it. After a
  restart: open `Settings → OMD` twice and confirm the session log gains no
  `command/run`/`command/done` records, then edit one field, save, and confirm the
  file keeps its comments.
- **A live old-Host/new-client mix.** The degrade path is covered by rendering the
  page against an envelope without `defaults`/`layers`, not by a two-generation
  process.

### Model-chain fallback and graphical chain board (2026-11-11)

### What shipped

- `agents.<id>.chain` and `categories.<name>.chain`: ordered primary/fallback
  routes (catalog alias, `provider/model` string, or inline object).
- `chainFor()` resolution shared by delegation, the settings page, and the
  runtime; the legacy single-route rules are unchanged when no chain is present.
- Runtime routing now uses `agent.model.select()` — the deprecated
  `agent/request` hook rejects provider/model changes on DSH 0.2.2-rc.1. On a
  failed model request (after any retry policy declines), OMD advances to the
  next valid step, records it, and starts a continuation turn via
  `agent.followup()` once the failed turn is idle. A completed fallback turn
  selects the primary again for the next turn.
- The category a delegation used rides the descriptor label as
  `omd:<role>@<encoded category>`, so a child falls back through the category
  chain rather than the junior role's chain.
- Settings → OMD now renders the chain board (Agents / Categories / Models
  lanes, numbered primary/fallback chips, inline step editor, alias editor) and
  keeps the advanced JSON document as the write format.

### Automated evidence (measured)

```
node --test tests/model-chain.test.mjs      # 9 pass
node --test tests/runtime.test.mjs          # 10 new model-routing/fallback tests pass (32 total)
node --test tests/config-page-ui.test.mjs   # 36 pass (15 new chain-board tests)
node --test tests/contract.test.mjs         # 11 pass
npm test                                    # 190 tests, 190 pass, 0 fail
npm run check                               # check ok: 11 roles + 15 skills, 2 patches, syntax + contract + parity + version
```

The runtime tests drive the real event signatures through the fake DSH context:
primary selection (`agent.model.select`), category-chain selection from the
encoded label, a failed request advancing to the fallback and calling
`agent.followup` with a complete `UserMessage` (`role`, `id`, `content`,
`source.kind: 'omd'`, `source.form: 'model-fallback'`), retry-policy ownership
(`{kind:'retry'}` is respected), aborted requests never falling back,
`hooks.modelRouting: false` disabling both paths, and the primary reset after a
completed fallback turn.

### Negative controls

Each control was applied to a copy of the live file, the suite was run, and the
file was restored; the restore was verified by SHA-256 before/after.

| Control | Result |
| --- | --- |
| `state.pendingFallback` is never set on a failed request | **2 runtime tests fail**: the advance-and-continue test and the primary-reset test |
| `chainOf()` returns no steps (board cannot see chains) | **15 chain-board tests fail**: every chain test, including lanes/chips, add-fallback save, reorder/remove, unknown-alias warning, invalid-step index stability, model deletion guard, and the old-Host board path |

### Independent review findings closed before completion

The reviewer returned **FIX-FIRST** with one blocker and two important findings.
All were fixed and re-tested before this record was written.

| Id | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| R1 | `omd_look_at` passed no `agentOptions`, so DSH filled the looker child's AgentOptions from the parent route and the runtime pinned that as primary; a configured `agents.multimodal-looker` route/chain was silently ignored. | `lookat.js` now resolves `routeFor(config, { agentId: 'multimodal-looker' })` and passes provider/model/effort/maxTokens as `agentOptions`, exactly like `omd_delegate`. | `tests/runtime.test.mjs` asserts the activation's `agentOptions` is the configured looker route. |
| R2 | An outer `llm-retry` in `always` mode calls the request-error waterfall before deciding, so OMD staged a fallback that fired after the retry succeeded; a user abort could also wake the fallback. | `agent/request-error` bails when `retryPolicy.mode === 'always'`; the pending fallback stores its signal and the idle handler refuses to wake an aborted attempt. | New tests model the real OUTER ordering with an always-mode wrapper, and a failed turn aborted before idle. |
| R3 | `routeFor` no longer preserved the legacy partial object (provider-only, temperature-only) or inherited effort/temperature/maxTokens on a complete delegation override when no chain existed. | `routeFor` now returns `legacyRouteFor` verbatim when neither entity has a chain; chain semantics apply only when a chain is actually configured. | `tests/model-chain.test.mjs` pins the three legacy shapes and the complete-override merge. |
| R4 | The board's "Override in this file" on an inherited multi-step chain keeps only the primary, without a warning. | Added a persistent board note explaining that inherited fallback steps are not carried over and must be re-added. | UI render tests cover the board and dictionary parity. |

The reviewer also confirmed the DSH 0.2.2-rc.1 event facts independently
(`agent/status` payload and idle ordering, `agent/request-error` payload,
`agent.model.select` next-step semantics, `followup` as a next-turn send, the
session header's `origin`/`parentSession`, and `agent/inbox.nextStep`), and
verified the `agent/request` hook preserves provider/model/effort on every path.

A focused re-review of the four fixes returned **SHIP** (190 tests pass,
`npm run check` ok) with no remaining blockers.

### Live state

`omd_ui_status` on the running Host resolves
`clientPath("omd-ui") = E:\Oh-My-DSH\ui\client.js` and lists `omd-ui` in the
80-entry boot graph. The browser half is a served asset, so a page refresh picks
up the current file; the Host half (runtime row) was composed at app start and
**still runs the previous module**.

### Not measured

- **A live fallback request.** The running Host composed the OMD runtime row
  before this change, so its `agent/request-error`/`agent/model.select` code is
  the old build; a live delegation cannot observe the new protocol until the app
  is restarted. The waterfall tests above are the evidence for the event-level
  behavior. After a restart, force a failure (first chain step a missing
  provider, second a working one), delegate to that role, and confirm the child
  log has a failed `turn/end` followed by a new turn whose user message is the
  `model-fallback` continuation.
- **Pixels.** No browser control is available in this session. The board's
  structure, controls, warnings, save payloads, and accessibility attributes are
  covered by the React-stub render tests; visual inspection in light/dark themes
  remains manual.
- **In-place cross-model retry.** DSH captures a step's selection before prompt
  assembly and reuses it for every retry, so a fallback is a new turn. The
  feature intentionally does not intercept `llm/stream` to forge a same-step
  model switch, which would misattribute the response to the logged route.

## Ultrawork gates and directive-only keyword activation (2026-11-13)

### What shipped

- `ultrawork.requirePlanGate`, `ultrawork.requireBaseline` (new key), and
  `ultrawork.dualEvidence` are now read by the runtime: the tool guard refuses a
  deliverable write/edit until a non-draft plan with task rows exists and, for
  the first one, until a verification command has run; turn-stopping keeps a
  turn open after deliverable writes until a successful verification is
  recorded, and lets a completed plan with evidence close.
- Keyword activation is directive-only (`ulw`, `ultrawork:`, `/ulw`,
  `[ultrawork]`, …); a message that merely mentions the mode no longer switches
  it.
- `omd_ui_status` normalizes `loader.entries()` before filtering. The scan now
  reports the loader rows instead of `loader scan failed`.

### Verification

```
node --test tests/ultrawork-gates.test.mjs   # 17 pass
node --test "tests/**/*.test.mjs"            # 231 pass / 0 fail (re-measured 2026-11-13 after the finding-fix wave; 208 at the verification run, 207 before that)
node scripts/check.mjs                       # check ok: 11 role prompts + 15 skills, 2 patches (runtime + UI asset), syntax + contract + parity + version
```

An independent read-only review returned FIX-FIRST for two issues — a
timed-out/signal-killed run counted as evidence, and a completed plan with zero
writes closing without evidence — and **SHIP** after both were fixed and
re-verified.

### Live smoke on the restarted Host (2026-11-13)

After the Host restart the new module was live:

- `omd_ui_status` reported `loader rows for the bundle (2)` with
  `@jhcai11/oh-my-dsh … fiber=live` instead of `loader scan failed` (fix ④).
- With `omd_mode set ultrawork`, a `write` to a workspace file was refused with
  `OMD ultrawork baseline gate: run node scripts/check.mjs; node --test tests/`
  (fix ②), and the edit was allowed after `npm test` ran.
- The smoke exposed two refinements, now in source: a plan left over from an
  earlier session must not unlock a new run (the plan must be written/updated
  after `mode.since`, or be the boulder's active plan), and the verification
  matcher must accept the bundled `& '…\node.exe' --test` form. Both need one
  more Host restart to be live.

### Not measured

- **A live guard refusal through a restarted Host.** The running Host composed
  the OMD runtime row before this change, so the gates are exercised by the
  fake-agent tests above. After a restart, start an ultrawork session and try to
  write a workspace file before writing a plan to see the refusal; the
  `omd_ui_status` loader rows should also appear again.

## Incidental, outside this change

`omd_ui_status` (the diagnostic meant to explain "the client half did not load")
used to fail its last scan step on the running host with
`loader scan failed: mine.map(...).join is not a function`
(`src/tools/misc.js`): the row scan assumed a shape the installed host no longer
returns. Fixed on 2026-11-13 by normalizing the generator/iterable before using
array methods.
