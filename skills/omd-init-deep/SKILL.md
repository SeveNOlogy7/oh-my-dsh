---
name: omd-init-deep
description: Build a hierarchical AGENTS.md context tree for future agents.
whenToUse: Use when the user runs /omd-init-deep or asks for repository context files.
---
# OMD init-deep

## Choose the tree

Create a root file, then one file per package or subsystem where the context
actually differs. Do not create a file per directory.

## Content

Each file should contain:

- purpose and boundaries;
- entry points and important files;
- conventions (naming, errors, tests, logging);
- commands to run checks;
- traps and non-obvious invariants;
- what not to do.

Do not restate the README. Do not include volatile line numbers or generated
content.

## Verify

Every referenced path exists. A new agent reading the chain can start work.
No file duplicates another.

## Record

Append a ledger event and report the created paths.
