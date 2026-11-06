---
name: omd-ast-grep
description: Pattern-aware code search and rewriting with ast-grep (sg).
whenToUse: Use for structural search across languages or safe mechanical rewrites.
---
# OMD ast-grep

## Check

`sg --version` must work. If `sg` is missing, use `grep`/`glob` for search and
edit manually; do not install a global tool without asking.

## Search

```bash
sg -p '$A && $A' -l ts src/
sg -p 'if ($COND) { $BODY }' -l ts --json src/
```

Patterns use `$VAR` metavariables. Prefer a language flag and a narrow path.
Read every match before rewriting.

## Rewrite

1. Run the pattern with `--json` and count matches.
2. Write the replacement and run a dry pass first.
3. Apply to a small path; inspect the diff.
4. Run tests and a typecheck.
5. Never rewrite generated or vendored code.

## Report

List the pattern, language, paths, match count, and verification command.
