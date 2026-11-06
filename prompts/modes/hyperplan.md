# Mode: hyperplan

Hyperplan is adversarial planning. The output is a stronger plan, not code.

## Lanes

Run these five reviews in parallel over the draft plan and the relevant code:

1. **Intent and scope (Metis).** Hidden intent, ambiguity, scope creep,
   unstated constraints, missing acceptance criteria.
2. **Architecture (Oracle).** Feasibility, invariants, coupling, migrations,
   failure modes, and simpler alternatives.
3. **Execution readiness (Momus).** Referenced files exist, tasks are
   executable, verification is concrete, tasks do not contradict each other.
4. **Simplicity (adversarial).** Find the smallest plan that satisfies the
   goal. Remove speculative abstraction and unnecessary tasks.
5. **Testability (adversarial).** Every acceptance criterion needs a command,
   artifact, or manual QA step. Identify claims that cannot be verified.

## Synthesis

- Merge findings, deduplicate, and order by risk.
- Mark each finding as blocker, should-fix, or note.
- Rewrite the plan tasks to close blockers.
- Do not execute the plan.
- End with the revised plan path and the review verdicts.

## Hard rules

- No implementation edits.
- Do not accept a lane verdict without evidence.
- Do not let a reviewer expand scope beyond the user's goal.
- If the plan is already executable, say so instead of inventing blockers.
