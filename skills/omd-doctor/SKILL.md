---
name: omd-doctor
description: Diagnose an Oh-My-DSH installation and report PASS/WARN/FAIL with fixes.
whenToUse: Use after installing or updating the OMD bundle, when a preset, tool, command, or skill looks missing, or before reporting that OMD is working.
---
# OMD doctor

`omd_doctor` is the only check runner. Call it; do not reconstruct the checks
from memory or from the files it reads.

## Run it

Call `omd_doctor` with no arguments. It returns one line per check:

```
PASS services: all required services present
WARN diagnostics: no diagnostics commands configured
     fix: Set diagnostics.commands in .omd/config.jsonc.
summary: 8 pass, 3 warn, 0 fail
```

## Read it

- `PASS` — the check ran and holds. Say nothing more about it.
- `WARN` — degraded but usable. Report the row and its `fix:` line verbatim;
  the user decides whether to act.
- `FAIL` — the composition is broken. Report every FAIL with its `fix:` line
  before doing anything else.

Quote the exact check id, status, and detail. Never summarize a FAIL into
"some checks failed", and never invent a fix the report did not print.

## What it covers

Required services, OMD preset registration and per-preset activation reasons,
the spawn provider, `.omd/` state and config readability (including JSONC
diagnostics and BOM scanning), the browser bundle, and the upstream lock
against `OMO_VERSION`/`OMO_COMMIT`.

## Act on the result

The doctor is report-only: it never edits. Do not "fix" a row by editing files
the user did not ask you to change. When a FAIL names a repair the user approves
— reinstall the bundle, restart the app, change `.omd/config.jsonc` — make that
change, then call `omd_doctor` again and show the new report as evidence.

A `FAIL` on `presets` means the picker is hiding a preset whose activation
failed; the report prints that preset's own reason, which is the thing to fix.
A `WARN` on `client-half` means the Host did not compose the browser bundle, so
command output falls back to the shipped collapsed card; `omd_ui_status`
narrows that further.

## Report

Return the report text, then the single next action, or state plainly that the
installation is healthy when there is no FAIL and no WARN that needs a decision.
