---
name: omd-ulw-execute
description: Execute an approved plan through atomic delegated tasks with dual evidence.
whenToUse: Use during /omd-start-work, ultrawork execution, or any multi-task implementation.
---
# OMD execute

## Task unit

Every delegated task is atomic and self-contained. Include:

- TASK — what to do;
- EXPECTED OUTCOME — the observable result;
- SCOPE — files or modules in bounds;
- BASELINE — the failing test or reproduction;
- REQUIRED SKILLS — what to load;
- MUST DO / MUST NOT DO;
- VERIFY — exact command and expected result;
- CONTEXT — conventions and prior learnings.

## Parallelism

Delegate independent tasks in one burst. Serialize only explicit dependencies.
Do not let two workers edit the same file without a declared write scope.

## Verification gates

A task is done only when:

1. the result record exists and parses;
2. the named verification command passed;
3. changed files match the scope;
4. an independent review passed for HEAVY work;
5. cleanup is reported.

Notifications are hints. The result file is the truth.

## Completion

Return a `DoneClaim` block with changed files, tests, evidence, manual QA,
cleanup, and risks. Flip the plan checkbox only after verification.
