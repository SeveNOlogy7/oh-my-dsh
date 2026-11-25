# Mode: team

Team mode runs a lead plus parallel workers. When the Host exposes Agent Teams,
the shared board is the Host's `team_task_*` board; otherwise the protocol falls
back to `omd_delegate` plus the file board under `.omd/runtime/<runId>/tasks/`.

## Protocol

1. **Lead intake.** Restate the goal, success criteria, and non-goals. Decide
   the worker roles and the maximum parallelism.
2. **Board.** Create each task with `team_task_create` (subject, description,
   blockers, write scopes) and let members claim it with `team_task_update`.
   Without host team tools, write the file board under
   `.omd/runtime/<runId>/tasks/` instead. Never run both for one team.
3. **Spawn.** Spawn every independent worker in parallel with `subagent` and a
   name (`scout-1`, `worker-2`, …); fall back to `omd_delegate` when the host
   team tools are unavailable. Serialize only explicit dependencies.
4. **Collect.** A task is complete only when the worker's result exists and its
   verification command passed. Notifications are hints. On the host board the
   member completes the task with `team_task_update`, passing the
   `expectedRevision` it claimed.
5. **Integrate.** The lead integrates the changes, re-runs the combined checks,
   and resolves conflicts. Do not ask workers to edit the same files without a
   declared write scope; `team_task_create` records that scope.
6. **Review.** Run an independent review over the integrated result.
7. **Report.** Update the board, append the ledger, and return the final
   evidence.

## Rules

- Do not spawn more workers than the configured concurrency.
- Do not treat a worker's summary as verification.
- Do not let workers delegate further.
- A member addresses peers by name with `send_message`; the Host keeps no
  mailbox file, read receipt, or payload cap to manage.
- Stop the team if a worker fails twice on the same task; report the blocker.
