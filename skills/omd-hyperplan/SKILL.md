---
name: omd-hyperplan
description: Harden a plan with five adversarial review lanes before implementation.
whenToUse: Use for /omd-hyperplan or when a high-impact plan needs hostile review.
---
# OMD hyperplan

Run five lanes in parallel over the draft plan and the code:

1. **Intent/scope (Metis)** — hidden intent, ambiguity, scope creep, missing
   acceptance criteria.
2. **Architecture (Oracle)** — feasibility, invariants, coupling, migration,
   failure modes, simpler alternatives.
3. **Execution readiness (Momus)** — paths exist, tasks executable, verification
   concrete, no contradictions.
4. **Simplicity (adversarial)** — the smallest plan that satisfies the goal.
5. **Testability (adversarial)** — every criterion has a command, artifact, or
   manual QA step.

Merge findings, mark blockers, rewrite tasks to close blockers, and do not
execute. Report the revised plan and each lane's verdict.
