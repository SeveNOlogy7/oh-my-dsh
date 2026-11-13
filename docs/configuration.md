# Configuration

## Files and precedence

Built-in defaults ← `~/.omd/config.jsonc` ← each ancestor
`.omd/config.jsonc` from farthest to nearest workspace. Objects deep-merge;
scalars and arrays replace; `disabledHooks` is a union. Invalid layers produce
a diagnostic and are skipped. `__proto__`, `prototype`, and `constructor` keys
are stripped.

JSONC comments and trailing commas are supported. `$schema` may point at
`schema/omd-config.schema.json`.

## Example

```jsonc
{
  // Use a specific DSH route for one role, with two fallbacks.
  "agents": {
    "oracle": {
      "chain": [
        "strong",
        { "provider": "deepseek-account", "model": "deepseek-flash", "reasoningEffort": "high", "temperature": 0.1 }
      ]
    }
  },
  "categories": {
    "deep": {
      "description": "Autonomous multi-step work",
      "chain": ["strong", "deepseek-account/deepseek-flash"],
      "promptAppend": "Prefer the existing architecture; keep the diff small."
    }
  },
  "models": {
    "catalog": {
      "strong": { "provider": "deepseek-account", "model": "deepseek-flash", "reasoningEffort": "max" }
    }
  },
  "delegation": { "maxConcurrent": 5, "maxDepth": 1 },
  "taskSystem": { "enabled": false },
  "hooks": { "commentChecker": "warn" },
  "diagnostics": {
    "commands": [{ "command": "npx", "args": ["tsc", "--noEmit"] }]
  }
}
```

## Agent overrides

`agents.<id>` accepts: `provider`, `model`, `modelRef`, `chain`,
`reasoningEffort`, `temperature`, `maxTokens`, `promptAppend`, `readOnly`,
`canDelegate`, `allowedSubagents`.

`chain` is the ordered model chain: index 0 is the primary route and every later
entry is a fallback. Entries are a catalog alias, a `provider/model` string, or
an object with the route fields. See [Model chains and fallback](#model-chains-and-fallback).

`readOnly` can add a restriction but cannot remove the role's structural
read-only policy. `canDelegate` can disable delegation but cannot enable it for
a role that structurally lacks the tool. Per-role bundled skill sets are fixed
in v0.1.0.

## Categories

Eight built-ins: `visual-engineering`, `ultrabrain`, `deep`, `artistry`,
`quick`, `unspecified-low`, `unspecified-high`, `writing`. Add custom
categories with the same fields. Category dispatch always targets
`omd-sisyphus-junior`.

A category accepts: `description`, `modelRef`, `chain`, `provider`, `model`,
`reasoningEffort`, `maxTokens`, `promptAppend`, `disabled`.

## Model catalog

`models.catalog.<alias>` accepts `provider`, `model`, `reasoningEffort`,
`temperature`, `maxTokens`. An alias or a `provider/model` string can be used
by agents and categories. No model id is hardcoded; unset routes inherit the
session's model.

## Model chains and fallback

`agents.<id>.chain` and `categories.<name>.chain` accept an ordered array:

```jsonc
{
  "models": {
    "catalog": {
      "strong": { "provider": "deepseek-account", "model": "deepseek-v4", "reasoningEffort": "max" },
      "backup": { "provider": "deepseek-account", "model": "deepseek-flash" }
    }
  },
  "agents": {
    "oracle": {
      "chain": [
        "strong",
        { "modelRef": "backup", "reasoningEffort": "high" },
        "backup-provider/backup-model"
      ]
    }
  }
}
```

A step is either a reference string — a catalog alias or `provider/model` — or
an object with `provider`, `model`, `modelRef`, `reasoningEffort`, `temperature`,
or `maxTokens`. A catalog alias supplies the base route and the object fields
override it. Nothing is inherited from the previous step: a fallback that names
only a model is invalid, and the runtime skips it.

Semantics:

- **Primary.** The first valid step. `routeFor()` returns it, so delegation
  creation options and the settings page's routing table name the same route.
- **Source.** An agent chain outranks a category chain. A category delegation
  has no named subagent, so the child resolves the category chain; a named
  subagent resolves its own chain. With neither, the legacy single route
  (`modelRef`, then `provider`/`model`) remains a one-step chain.
- **Explicit delegation route.** `omd_delegate`'s `provider`/`model` arguments
  replace step 0 and leave the configured fallbacks after it.
- **Fallback.** DSH fixes a step's model before the request and reuses it for
  every retry of that step, so OMD switches the model only on a new turn. When
  a model request fails and a later valid step exists, OMD records the next
  route with `agent.model.select()`, waits for the failed turn to close, then
  queues a continuation turn on the fallback route. The failure remains in the
  session log; the continuation message is marked `source.kind: "omd"` with
  `form: "model-fallback"`. After a completed fallback turn, the next turn tries
  the primary again.
- **Retries first.** A configured retry policy (for example `llm-retry`) owns
  the failed attempt. `llm-retry` is an outer listener: in `normal` mode OMD is
  consulted only after it gives up, while `always` mode retries without asking
  and therefore suppresses OMD's fallback for that failure. Aborted requests
  never fall back.
- **Hook switch.** `hooks.modelRouting: false` disables both selection and
  fallback. The settings page edits all three sections in one graphical chain
  board and still writes only the file's own overrides.

## Delegation

- `maxConcurrent` — per provider/model key, default 5.
- `maxDepth` — absolute delegation depth cap, default 1.
- `defaultBackground` — default for `omd_delegate`.
- `waitTimeoutMs` — foreground wait bound, default 600000.
- `pollMs` — reserved for periodic status; result promises are used instead.
- `childPreset` — the preset a delegated child composes from, for both
  `omd_delegate` and `omd_look_at`. `null`, the default, omits `agentPreset` from
  the activation request so DSH composes the child from the parent session's
  composition; only a non-empty, trimmed string pins a preset id, and every other
  value collapses to `null`. It is not the role channel: a child's role travels
  on its own `subagent/descriptor` label, written as `omd:<role>`; a category
  delegation appends the category as `omd:<role>@<encodeURIComponent(category)>`.

## Hooks

`hooks.todoContinuation`, `commentChecker` (`off|warn|block`),
`prometheusGuard`, `notepadGuard`, `planValidator`, `modelRouting`; plus
`rulesInjection` and `disabledHooks`, both reserved and inert (see
`docs/hooks.md`).

## Diagnostics

`diagnostics.commands` is an array of `{command, args?, glob?}` or plain
strings. OMD runs them with `ctx.subprocess` (argv, no shell) and reports exit
codes and output. Empty means `omd_diagnostics` returns a configuration hint.

## Rules

`rules.paths` (default `.omd/rules`) and `rules.maxBytes` (default 65536).
Markdown frontmatter supports `alwaysApply: true` and `globs: [...]`.
Always-on rules are injected; glob rules are added when a matching file is read.

## Skills

`skills.paths` is reserved for project skill discovery. Built-in OMD skills are
registered once, by the single profile-level `omd-runtime` row, so every preset
sees the same registration; which of them a session may use belongs to the role
resolved per request, not to registration. Project
`<cwd>/.omd/skills/*/SKILL.md` is discovered by the `omd-workspace` provider.

## Language

The plugin row Config key `language` selects the language of the description
strings the model reads: tool descriptions, slash-command descriptions, and the
bundled skills' `description` and `whenToUse`. It accepts `en` (default) or
`zh`; any other value, and a missing key, resolves to `en`. This key is not an
`.omd/config.jsonc` setting — it is set on the profile's single runtime row in
`presets/omd-runtime.patch.yml`:

```yaml
- insert:
    - id: omd-runtime
      name: "@jhcai11/oh-my-dsh"
      config:
        language: "zh"
```

The row is declared once for the whole profile, so one `language` applies to
every preset, including the shipped `standard`, `ptc`, `minimal`, and `cordis`.
There is no per-preset plugin row left to set it on. The `agent` key that used
to sit beside it is no longer how a session finds its role either: a role
arrives on the delegated child's `omd:<role>` descriptor label (plus the
`@<category>` suffix for a category delegation), and a preset is
only the compatibility fallback for sessions created when OMD registered one
preset per role. The bundle's own row deliberately omits `agent`, because a
pinned role would then apply to every session in the profile. A deployment that
wants one fixed role mounts the runtime with `config: { agent: "<role>" }`
instead — that row serves exactly that role and cannot sit beside the global
one, because two active Loader sources resolving to a single package name are
rejected. Changing `language`
restarts the plugin: the Loader must reload the row before the new descriptions
are registered. Only descriptions change — prompt bodies, `SKILL.md` bodies, and
tool, command, skill, and parameter names never change.

## Settings page

`Settings → OMD` edits the session workspace's `.omd/config.jsonc` without
leaving the app. It covers the keys this runtime reads, in six control groups
plus one graphical chain board backed by a JSON document:

| Group | Keys |
|---|---|
| General | `keywordHook`, `taskSystem.enabled` |
| Keyword activation | `keywords.ultrawork`, `keywords.team`, `keywords.hyperplan` |
| Delegation | `delegation.maxConcurrent`, `delegation.maxDepth`, `delegation.waitTimeoutMs`, `delegation.defaultBackground`, `delegation.childPreset` |
| Hooks and continuation | `hooks.commentChecker` (`off`/`warn`/`block`), `hooks.todoContinuation`, `ultrawork.maxContinuationRounds`, `ultrawork.requirePlanGate`, `ultrawork.requireBaseline`, `ultrawork.dualEvidence`, `hooks.modelRouting`, `hooks.prometheusGuard`, `hooks.notepadGuard`, `hooks.planValidator` |
| Rules | `rules.paths`, `rules.maxBytes` |
| Diagnostics | `diagnostics.commands` |
| Agents / categories / models | this file's own overrides, as a graphical chain board plus an advanced JSON document |

Every field says where its value comes from: `in file` when this workspace file
sets it, `inherited` when another configuration layer does, and otherwise the
built-in default applies, which a non-boolean control prints as `Default: …`.
The configuration layers disclosure lists every layer that parses, farthest
first, with the top-level keys each one sets. Keys the schema accepts but this
runtime does not read get no control; the page names the ones this file sets:
`review`, `telemetry`, `skills`, `disabledHooks`, `delegation.pollMs`,
`hooks.rulesInjection`, `ultrawork.maxWaves`.

### Ultrawork gates

The three `ultrawork` gates are enforced by the per-agent tool guard and the
turn-stopping hook, not only by the mode prompt:

| Key | Default | Effect |
|---|---|---|
| `ultrawork.requirePlanGate` | `true` | A deliverable `write`/`edit` (inside the workspace, outside `.omd/`) is refused until `.omd/plans` holds a plan with a non-draft status and at least one task row, written or updated after this ultrawork run started (or the boulder's active plan). |
| `ultrawork.requireBaseline` | `true` | The first deliverable `write`/`edit` is refused until one verification command (`npm test`, `npm run check`, `node --test`, `pytest`, …) has run. A failing baseline still counts: the point is to know the starting state. |
| `ultrawork.dualEvidence` | `true` | When the turn is about to close after deliverable writes, or after a plan was marked complete with no deliverables, and no successful verification command was recorded, the turn is kept open with a dual-evidence steer. A completed plan with evidence lets the turn close. |

A refusal is an ordinary tool error the model reads, and each message names the
escape hatch (`ultrawork.<key>: false`). The gate tally is per ultrawork run:
entering the mode again resets it. Files under `.omd/` (plans, notepads,
scratch) are never gated. The gates are per agent: a delegated child session
runs under its own mode (normally none), so the delegating agent stays
responsible for the plan and the evidence. `dualEvidence` runs through the
turn-stopping continuation, so `hooks.todoContinuation: false` disables it too.

A save writes only the keys that changed. **Reset** stages a removal instead of a
value, so a key this file set falls back to the inherited value; clearing a
number field, or emptying `rules.paths`, stages the same removal when this file
sets that key, while clearing `childPreset` writes `null` (inherit the parent
session) and an emptied `diagnostics.commands` is an explicit `[]` — "no checks"
is a decision, not a missing value. Clearing a number this file does not set
writes nothing, and the field says so: the inherited value stays. A removal
addresses this file only: an inherited value is not this page's to delete, and an
object the removal empties is pruned. Patch and removals travel in one request:
the structured `set` form documented in `docs/commands.md`.

The **Agents / categories / models** board edits this file's own
`agents`/`categories`/`models` entries, not the merged result, so a save never
copies an inherited category into the workspace file; only the sections that
changed are written. It renders every role and category as an ordered chain of
primary and fallback model steps, resolves catalog aliases against the effective
configuration, marks inherited/default values, and still exposes the exact JSON
document in an advanced disclosure. Every graph action is applied to that JSON
document, so the board and a hand-edited document share one validator, one dirty
state, and one save path. **Override in this file** on an inherited entity seeds
the editor from its effective primary route because a chain needs an index-0
step; nothing is written until that step is saved. **Add fallback step**
materializes the same primary for the same reason. A chain always wins over
leftover legacy `provider`/`model` fields, and the board warns when both are
present.

Values are validated in the browser with the rules the Host enforces — integer
minimums, `commentChecker` membership, and the document's JSON shape; the chain
board validates each step before staging it. A hand-written chain step is judged
by the Host's schema validator, and a rejected write leaves the file
byte-identical. The Host stays the
authority: if it rejects a write anyway, the page shows its validator message and
the file is untouched. The diagnostics control takes one `command arg…`
line per entry. A line you rewrite is stored as `{command, args}`; an entry you
leave untouched keeps the keys the control cannot show, such as `glob`, and a
string-form entry stays a string. Controls are labelled, errors and status are
announced, and the two-column layout collapses to one on a narrow window.

The page is the bundle's own browser half and reaches the plugin row over its own
endpoint, `POST api/omd/config`, registered by the runtime row on DSH's
already-authenticated `/api` channel (`ctx.connection.fetch.register`). DSH
applies the Host/Origin fence and the browser cookie before the handler runs and
answers `403` to any non-owner peer, so the page carries no token of its own, and
a composition without a browser channel (a shell, a headless run) simply
registers no endpoint. **Nothing is executed in a session**: opening or saving on
the page appends no `command/run`/`command/done` record, which is what the older
build did when the page borrowed `ctx.remote.commands.execute`.

The request names a session only to say *which* workspace's configuration to
show; the Host resolves that session's directory itself (live header first, then
the persisted log, then the profile's default working directory). The browser
therefore never names a path, and the page still works with no session open.

The read-only **Plugin** block reports the row's effective `language`, the
category routing tiers with the source of each value, and the exact
`cordis.patch.yml` override to copy. `language` is fixed when the profile
composes, so the page never offers to save it; a route is changed through this
file's own `categories`/`models` entries on the chain board.

The envelope the Host answers with carries `layers` (every parsed layer with the
top-level keys it sets, farthest first) and `defaults` (a clone of the built-in
defaults) on top of the resolved configuration; the provenance tags and the reset
action are computed from them. A Host from before this page version sends
neither, and the page then keeps the legacy `set {<patch>}` write form and offers
no reset instead of failing. A removal requested against that older Host — a
reset, a cleared number, an emptied list — is reported as blocked and names the
keys, because the older Host cannot delete a key and would refuse the line; the
page does not send it.

