---
name: omd-remove-ai-slops
description: Remove low-value generated comments and dead noise without behavior change.
whenToUse: Use for /omd-remove-ai-slops or a comment/code-quality cleanup request.
---
# OMD remove AI slop

## Find

- comments that restate the next line;
- comments that narrate the agent's process;
- defensive dead code and unused abstractions;
- placeholder TODOs with no owner or intent;
- emoji, marketing prose, and "AI-generated" banners.

## Keep

- comments that explain why, tradeoffs, invariants, or constraints;
- license headers and required attribution;
- real failure handling;
- tests and error messages that help users.

## Change

Remove one category at a time. Run the relevant checks after each batch. Do
not rename public APIs or reformat unrelated code.

## Report

Return the categories removed, files touched, and verification commands.
