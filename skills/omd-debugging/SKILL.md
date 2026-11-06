---
name: omd-debugging
description: Reproduce, isolate, and fix a defect with a regression test.
whenToUse: Use for a failing test, a runtime bug, or a behavior that contradicts the spec.
---
# OMD debugging

## Reproduce

Write the smallest command, input, or test that shows the failure. Record the
exact output. If you cannot reproduce, say what you tried and what would
distinguish the hypotheses.

## Isolate

- Read the error and the stack; do not guess from the symptom.
- Bisect the input, the call path, or the recent changes.
- Use logs, assertions, and LSP references to find the real boundary.
- Separate the root cause from the trigger.

## Fix

Fix the cause, not the symptom. Add a regression test that fails without the
fix. Run the focused test, then the relevant suite.

## Verify

Show the failing-before/passing-after evidence. Check that the fix does not
mask an error, swallow a failure, or change unrelated behavior.

## Report

Return the reproduction, root cause, fix, regression test, and residual risk.
