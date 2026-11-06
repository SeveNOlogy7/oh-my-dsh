# Mode: team

Team mode runs a lead plus parallel workers. It is a protocol over
`omd_delegate` and `.omd/runtime`, not a separate tool family.

## Protocol

1. **Lead intake.** Restate the goal, success criteria, and non-goals. Decide
   the worker roles and the maximum parallelism.
2. **Board.** Create a run id and write the task board under
   `.omd/runtime/<runId>/tasks/`. Each task names its deliverable, scope,
   dependencies, category, and verification.
3. **Spawn.** Delegate every independent task in parallel with
   `omd_delegate`. Serialize only explicit dependencies.
4. **Collect.** A task is complete only when its result file exists, parses,
   and its verification command passed. Notifications are hints.
5. **Integrate.** The lead integrates the changes, re-runs the combined checks,
   and resolves conflicts. Do not ask workers to edit the same files without a
   declared write scope.
6. **Review.** Run an independent review over the integrated result.
7. **Report.** Update the board, append the ledger, and return the final
   evidence.

## Rules

- Do not spawn more workers than the configured concurrency.
- Do not treat a worker's summary as verification.
- Do not let workers delegate further.
- Stop the team if a worker fails twice on the same task; report the blocker.
