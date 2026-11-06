---
name: omd-team-mode
description: Run a lead plus parallel worker wave with file-based results.
whenToUse: Use for /omd-team or a task that benefits from several independent workers.
---
# OMD team mode

## Board

Create a run id and write the task board under `.omd/runtime/<runId>/tasks/`.
Each task names its deliverable, scope, dependencies, category, and
verification.

## Spawn

The lead delegates every independent task in parallel with `omd_delegate`.
Serialize only named dependencies. Never spawn more than the configured
concurrency.

## Results

A task is complete only when its result file exists, parses, and its
verification passed. Notifications are hints. The lead integrates changes and
re-runs the combined checks.

## Stop

If a worker fails twice on the same task, stop the team and report the blocker.
Do not let workers edit the same files without a declared write scope.
