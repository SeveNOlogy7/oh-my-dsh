---
name: omd-git-master
description: Make safe, atomic commits and history operations without destructive surprises.
whenToUse: Use when committing, rebasing, resolving conflicts, or preparing a PR.
---
# OMD git-master

## Before writing history

- Inspect `git status`, the diff, and the branch base.
- Never run `git reset --hard`, `git clean -fd`, force-push, or rewrite shared
  history without explicit user approval.
- Do not commit unrelated changes. Stage by path, not `git add -A`, unless the
  user asks for everything.

## Commits

One logical change per commit. Subject in imperative mood, under ~72 chars.
Body explains why and any migration/rollback note. Do not add AI attribution
unless the project requires it.

## Rebase and conflicts

Fetch first. Rebase only local branches. Resolve conflicts by reading both
sides; never accept one side wholesale. Re-run tests after the rebase.

## Verify

`git status` is clean or only intended files remain. The branch builds and the
relevant tests pass. Report the commit ids and the verification commands.
