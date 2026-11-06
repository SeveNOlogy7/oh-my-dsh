# The .omd directory

`.omd/` is the durable orchestration state. It is created by `/omd-init` or
lazily by the first state write. The session log remains the conversation
source of truth.

```
.omd/
  config.jsonc
  .gitignore
  rules/*.md
  skills/<name>/SKILL.md
  plans/<slug>.md
  drafts/<slug>.md
  boulder.json                 # derived view, source:"derived"
  boulder/<stem>.json          # per-session slot
  notepads/<plan>/{learnings,decisions,issues,verification,problems}.md
  tasks/T-<8hex>.json
  background/<taskId>.json
  runtime/<stem>/mode.json
  runtime/<stem>/results/<taskId>.json
  ledger.jsonl
  handoff/<timestamp>.md
  evidence/
  logs/
```

## Plan document

```markdown
---
plan: <slug>
status: draft | awaiting-approval | approved | active | done
created: <iso>
---
# Plan: <title>

## TODOs
- [ ] 1. <task>
  Recommended task executor category: deep
- [ ] F1. <final verification>
  Recommended task executor category: ultrabrain
```

Task rows are column-zero checkboxes with a numeric id (or `F<n>`). The parser
also accepts `## Final Verification Wave` as the final section.

## Boulder slot

```json
{
  "schema": 1,
  "stem": "session-1",
  "session_ids": ["session-1"],
  "active_plan": "E:/project/.omd/plans/feature.md",
  "plan_name": "feature",
  "status": "active",
  "worktree_path": null,
  "started_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "finished_at": null
}
```

`boulder.json` is a read-only aggregate view with `source:"derived"`.

## Task record

```json
{
  "id": "T-1a2b3c4d",
  "subject": "Run integration tests",
  "description": "",
  "status": "pending",
  "activeForm": null,
  "blocks": [],
  "blockedBy": ["T-..."],
  "owner": null,
  "metadata": null,
  "sessionId": "session-1",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

## Background record

```json
{
  "task_id": "bg_1a2b3c4d5e",
  "target": "oracle",
  "category": null,
  "status": "queued | running | completed | failed | cancelled | unknown",
  "parent_session_id": "session-1",
  "child_session_id": "child-1",
  "output": "",
  "structured": null,
  "stop_reason": "completed",
  "error": null,
  "truncated": false,
  "background": true,
  "created_at": "...",
  "started_at": "...",
  "finished_at": "..."
}
```

The result copy lives at `runtime/<parentStem>/results/<taskId>.json` and is
the completion truth.

## Ledger

`ledger.jsonl` is append-only. Each line has `ts`, `event`, and event fields
(`mode`, `task`, `plan`, `child`, `error`, …).

## Ignored state

`.omd/.gitignore` excludes `logs/`, `runtime/`, `background/`, and `boulder/`.
Plans, drafts, rules, notepads, tasks, and config can be committed.

## Atomic writes

Every JSON write uses a same-directory temp file and rename, LF endings, no
BOM, and an inside-`.omd` assertion. A corrupt file produces a `missing | io |
parse` reason instead of crashing orchestration.
