# Remove AI slop protocol

Remove low-value generated noise without changing behavior.

## Find

- comments that restate the next line;
- comments that narrate the agent's process ("now we need to...");
- defensive dead code and unused abstractions;
- over-explained types and redundant null checks;
- placeholder TODOs with no owner or intent;
- emoji, marketing prose, and "AI-generated" banners in code.

## Keep

- comments that explain why, tradeoffs, invariants, or non-obvious constraints;
- license headers and required attribution;
- defensive code that handles a real failure mode;
- tests and error messages that help users.

## Change

- Remove one category at a time.
- Run the relevant checks after each batch.
- Do not rename public APIs or reformat unrelated code.

## Report

Return a DoneClaim with the categories removed, the files touched, and the
verification commands.
