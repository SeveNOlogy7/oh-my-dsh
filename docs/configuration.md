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
registered per preset; project `<cwd>/.omd/skills/*/SKILL.md` is discovered by
the `omd-workspace` provider.
