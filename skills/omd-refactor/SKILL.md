---
name: omd-refactor
description: Refactor with behavior preservation, baseline tests, and a minimal diff.
whenToUse: Use for /omd-refactor, structural cleanup, or extracting modules without behavior change.
---
# OMD refactor

## Baseline

Find the tests that cover the target. Run them and record the result. If
coverage is missing, add a characterization test before changing code.

## Map

Use LSP definition/reference queries and `sg` patterns to find call sites.
List public surfaces, external consumers, and generated code. Choose the
smallest safe sequence.

## Change

One behavior-preserving step at a time. Keep the public API stable unless the
task changes it. Do not combine a refactor with a feature. Re-run checks after
each step.

## Verify

Baseline tests still pass. Call sites compile. The diff has no unrelated edits.
The new structure solves a concrete problem.

## Report

Return a DoneClaim with commands, changed files, evidence, and deliberately
deferred follow-up.
