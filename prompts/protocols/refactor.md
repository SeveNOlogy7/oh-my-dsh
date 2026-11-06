# Refactor protocol

Refactor with behavior preservation first.

## 1. Baseline

- Find the tests that cover the target behavior. Run them and record the
  result.
- If coverage is missing, add a characterization test before changing code.

## 2. Map

- Use LSP definition/reference tools and `sg` patterns to find call sites.
- List public surfaces, external consumers, and generated code.
- Identify the smallest safe sequence of changes.

## 3. Change

- One behavior-preserving step at a time.
- Keep the public API stable unless the task explicitly changes it.
- Do not combine a refactor with a feature change.
- Re-run the relevant checks after each step.

## 4. Verify

- Baseline tests still pass.
- Call sites compile.
- The diff contains no unrelated edits.
- The new structure is justified by a concrete problem, not aesthetics.

## 5. Report

Return a DoneClaim with commands, changed files, evidence, and any follow-up
that was deliberately left out.
