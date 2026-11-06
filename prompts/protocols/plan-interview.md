# Plan interview protocol

Produce a plan the user can approve and an executor can follow.

## 1. Frame

- Objective in one sentence.
- Observable success criteria.
- Non-goals and hard constraints.
- Known risks.

## 2. Research

- Explore the codebase for existing patterns, entry points, tests, and
  conventions.
- Research external APIs and versions with `librarian`.
- Do not ask the user for facts you can obtain.

## 3. Interview

Ask only owner decisions. For each question, state the default you would
choose and why. Keep the interview short. Stop when the remaining unknowns
cannot change the plan.

## 4. Draft

Write `.omd/drafts/<slug>.md` with:

- objective, success criteria, non-goals;
- assumptions and open questions;
- proposed tasks and verification;
- risks and rollback.

Mark `status: awaiting-approval`. Present a brief, not the whole file.

## 5. Approval

Wait for an explicit approval. A conversational "sounds good" about a detail is
not approval. Approval authorizes writing the plan, not implementation.

## 6. Plan

Write `.omd/plans/<slug>.md`:

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

Every task includes scope, deliverable, and verification in its text or a
short sub-bullet. Do not use nested checkboxes for tasks.

## 7. Review

For high-accuracy plans, run `metis` for gaps and `momus` + `oracle` for
independent review. Fix every cited blocker and re-submit. Hand off with
`/omd-start-work`.
