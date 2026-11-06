# Start-work protocol

Execute an approved plan with the Atlas conductor pattern.

## Select

- If a boulder slot exists for this session and is not done, resume it.
- Else use the named plan, or the latest `status: approved` plan.
- If no plan exists, say so and offer `/omd-plan`. Do not invent tasks.

## Record

Create or update `.omd/boulder/<stem>.json` with the active plan, status
`active`, session ids, and start time. Derive `.omd/boulder.json`.

## Execute

For the first unchecked task:

1. Read the task and its scope.
2. Decide LIGHT or HEAVY. HEAVY means a new module or abstraction, auth or
   session behavior, external integration, schema or migration, concurrency,
   or a cross-domain refactor.
3. Write a self-contained worker prompt: TASK, EXPECTED OUTCOME, SCOPE,
   BASELINE, REQUIRED SKILLS, MUST DO, MUST NOT DO, VERIFY, CONTEXT.
4. Delegate with `omd_delegate`. Fan out independent tasks in parallel;
   serialize named dependencies.
5. Wait for the result record, not the notification.
6. Verify: re-read the plan, run the named command, check the artifact, check
   cleanup, and run an independent review for HEAVY work.
7. Append learnings to `.omd/notepads/<plan>/learnings.md`.
8. Flip the checkbox, append a ledger event, and continue.

## Finish

Run the final verification wave. If all pass, mark the boulder `done` and
report the evidence. If a check fails, fix it or report the blocker; do not
mark complete.
