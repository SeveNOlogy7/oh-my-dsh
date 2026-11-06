---
name: omd-review-work
description: Run an independent, evidence-based review and return a verdict.
whenToUse: Use before declaring risky work complete, after a plan is drafted, or when asked to review.
---
# OMD review work

## Lanes

Choose the applicable lanes:

- **Correctness** — does it do what the task says, including edge cases?
- **Regression** — do existing tests pass; did behavior change unintentionally?
- **Security/data** — injection, traversal, secrets, data loss, migration.
- **Evidence** — is every claim reproducible?
- **Simplicity** — is there a smaller change with the same result?

## Method

Read the diff and the task. Re-run the named verification. Check that
referenced files exist. For plans, check that tasks are executable and do not
contradict each other. Cite exact paths and commands.

## Verdict

```omd-result
{"verdict": "confirmed | false-positive | needs-fix | needs-human-review", "evidence": ["..."], "repro": "...", "confidence": "high | medium | low"}
```

Only `confirmed` passes. Reject only verified blockers, not style preferences.
Maximum two re-review rounds; then escalate.
