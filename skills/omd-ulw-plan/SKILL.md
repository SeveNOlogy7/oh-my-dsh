---
name: omd-ulw-plan
description: Turn a goal into an approved, executable plan with explicit scope and verification.
whenToUse: Use when the user asks to plan, when a task is multi-step or risky, or before /omd-start-work.
---
# OMD plan

## Frame

Write the objective in one sentence. List observable success criteria,
non-goals, constraints, and the top risks. A plan without non-goals invites
scope creep.

## Research before asking

Use `explore` for the codebase and `librarian` for external facts. Ask the user
only about owner decisions:

- irreversible or destructive changes;
- public API or UX surfaces;
- packaging and distribution;
- external dependencies and version pins;
- data or schema shape;
- tradeoffs with no defensible default.

For every other question, choose a default, state it, and keep moving.

## Draft and approval

Write `.omd/drafts/<slug>.md`. Mark `status: awaiting-approval`. Present a
short brief: objective, approach, tasks, risks, and the open decisions. Wait
for explicit approval. Approval authorizes the plan, not implementation.

## Write the plan

`.omd/plans/<slug>.md` must use this grammar:

```markdown
---
plan: <slug>
status: approved
created: <iso>
---
# Plan: <title>

## Objective
...

## TODOs
- [ ] 1. <task>
  Recommended task executor category: deep
- [ ] 2. <task>
  Recommended task executor category: quick

## Final Verification Wave
- [ ] F1. <final check>
  Recommended task executor category: ultrabrain
```

Each task is atomic, names its scope, and names the command or artifact that
proves it. Do not use nested checkboxes for tasks.

## Review

For high-accuracy plans run `metis` for gaps, then `momus` and `oracle` for
independent review. Fix every cited blocker and resubmit. Hand off with
`/omd-start-work`.
