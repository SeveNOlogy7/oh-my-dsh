---
name: omd-team-mode
description: Run a lead plus parallel workers over the DSH Agent Teams board.
whenToUse: Use for /omd-team or a task that benefits from several independent workers.
---
# OMD team mode

## Board

Prefer the Host's Agent Teams board: `team_task_create` for each task (subject,
description, blockers, write scopes) and `team_task_update` to claim or complete
it. When the Host exposes no `team_task_*` tools, write the file board under
`.omd/runtime/<runId>/tasks/` instead. One team uses one board.

## Spawn

Spawn every independent worker in parallel with `subagent` and a name; fall back
to `omd_delegate` when the host team tools are unavailable. Serialize only named
dependencies. Never spawn more than the configured concurrency.

## Results

A task is complete only when the worker's result exists and its verification
passed. Notifications are hints. The lead integrates changes and re-runs the
combined checks.

## Stop

If a worker fails twice on the same task, stop the team and report the blocker.
Do not let workers edit the same files without a declared write scope; record
the scope on the task.
