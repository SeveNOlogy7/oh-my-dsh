# Verification record

Date: 2026-11-04. Reference: OmO v4.19.4.

## Automated

```
npm test
# 40 tests, 40 pass, 0 fail

npm run check
# check ok: 11 presets, 14 skills, 11 patches, syntax + contract + parity + version
```

`npm run check` covers manifest and preset patches, 11 agent prompts, 14
skills, schema/locale/icon/resources, syntax of every `.js`/`.mjs`, preset
generator determinism, the contract suite, version lock, and parity coverage.

## Contract suite

`tests/contract.test.mjs` locks the interfaces that drift silently:

- the JSON Schema documents every runtime default key with an accepting type,
  declares no unknown top-level key, and repeats the runtime default values;
- the agent override schema covers every default agent setting, and
  `docs/configuration.md` lists exactly the agent fields the runtime accepts;
- the documented category fields match the schema, and the eight built-in
  categories are named in `prompts/agents/_contract.md`, in
  `docs/configuration.md`, and in the `omd_delegate` category description;
- the roster, version constants, and 14 shipped skills agree with the manifest.

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
the 14 OMD commands. Each cell renders the command name, a state dot, and the
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
2. Open a new session, select **Sisyphus · OMD**, and run the `omd-doctor` skill
   (it calls the `omd_doctor` tool). Report the `client-half` and `active-preset`
   lines.
   - `PASS client-half` → the Host composes the bundle and the row reaches the
     browser, so the renderer is what needs work.
   - `FAIL client-half` → the Host never composed the row; the fix belongs in
     the bundle declaration or the install, not in `client.js`.
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
covered above; steps 2 and 3 are the only parts automated checks cannot reach.

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

