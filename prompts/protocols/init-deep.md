# Init-deep protocol

Build a hierarchy of `AGENTS.md` files so future agents load only the context
they need.

## Plan the tree

- Identify the repository root, major packages, and the directories where
  behavior concentrates.
- Do not create a file for every directory. Create one where a future agent
  would need different context.
- A good hierarchy is root → package → subsystem.

## Write each file

Include only durable, local facts:

- purpose and boundaries of this directory;
- entry points and important files;
- conventions (naming, errors, tests, logging);
- commands to run checks;
- traps and non-obvious invariants;
- what not to do.

Do not restate the whole README. Do not include volatile line numbers or
generated content.

## Verify

- Every referenced path exists.
- A new agent reading only the relevant chain can start work.
- No file duplicates another file's content.

## Record

Append a ledger event and report the created paths.
