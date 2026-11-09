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
  // Use a specific DSH route for one role.
  "agents": {
    "oracle": {
      "provider": "deepseek-account",
      "model": "deepseek-flash",
      "reasoningEffort": "high",
      "temperature": 0.1
    }
  },
  "categories": {
    "deep": {
      "description": "Autonomous multi-step work",
      "modelRef": "strong",
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

`agents.<id>` accepts: `provider`, `model`, `modelRef`,
`reasoningEffort`, `temperature`, `maxTokens`, `promptAppend`, `readOnly`,
`canDelegate`, `allowedSubagents`.

`readOnly` can add a restriction but cannot remove the role's structural
read-only policy. `canDelegate` can disable delegation but cannot enable it for
a role that structurally lacks the tool. Per-role bundled skill sets are fixed
in v0.1.0.

## Categories

Eight built-ins: `visual-engineering`, `ultrabrain`, `deep`, `artistry`,
`quick`, `unspecified-low`, `unspecified-high`, `writing`. Add custom
categories with the same fields. Category dispatch always targets
`omd-sisyphus-junior`.

A category accepts: `description`, `modelRef`, `provider`, `model`,
`reasoningEffort`, `maxTokens`, `promptAppend`, `disabled`.

## Model catalog

`models.catalog.<alias>` accepts `provider`, `model`, `reasoningEffort`,
`temperature`, `maxTokens`. An alias or a `provider/model` string can be used
by agents and categories. No model id is hardcoded; unset routes inherit the
session's model.

## Delegation

- `maxConcurrent` — per provider/model key, default 5.
- `maxDepth` — absolute delegation depth cap, default 1.
- `defaultBackground` — default for `omd_delegate`.
- `waitTimeoutMs` — foreground wait bound, default 600000.
- `pollMs` — reserved for periodic status; result promises are used instead.

## Hooks

`hooks.todoContinuation`, `commentChecker` (`off|warn|block`),
`rulesInjection`, `prometheusGuard`, `notepadGuard`, `planValidator`,
`modelRouting`; plus `disabledHooks`.

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
to sit beside it is no longer how a session finds its role either: the role is
resolved from the active preset id at request time. Changing `language`
restarts the plugin: the Loader must reload the row before the new descriptions
are registered. Only descriptions change — prompt bodies, `SKILL.md` bodies, and
preset picker names stay English, and tool, command, skill, and parameter names
never change.

## Settings page

`Settings → Oh-My-DSH` edits the session workspace's `.omd/config.jsonc` without
leaving the app. The **Project** section covers `keywordHook`, `delegation`,
`taskSystem.enabled`, and `diagnostics.commands`; the **Plugin** section reports
the row's effective `language` and the category routing tiers together with the
source each value came from, so nothing pretends to save a composition-time
value.

The page is the bundle's own browser half and reaches the preset through the
`/omd-config` command, so it needs a live OMD session — with none open it says
so instead of failing silently. Each read or save appends a `command/run` +
`command/done` pair to that session's log: a log-only record that never wakes
the agent. Writes validate against `schema/omd-config.schema.json` first; a
rejected value returns the validator's own message and leaves the file
byte-identical.

