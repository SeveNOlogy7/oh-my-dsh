# Review protocol

An independent review protects the user from unsupported completion claims.

## Lanes

Run the relevant lanes in parallel:

- **Correctness:** does the change do what the task says, including edge cases?
- **Regression:** do existing tests still pass? Is any behavior changed
  unintentionally?
- **Security and data:** injection, path traversal, secret exposure, data
  loss, migration safety.
- **Evidence:** can every claim be reproduced from the repository or a
  recorded command?
- **Simplicity:** is there a smaller change with the same result?

## Verdict

Return `omd-result` with:

- `confirmed` — evidence supports the claim; no blocker;
- `needs-fix` — a cited blocker exists;
- `false-positive` — the alleged issue is not real;
- `needs-human-review` — an owner decision is required.

Attach evidence and a repro. Do not reject for style or preference.

## Loop

Maximum two re-review rounds. If the same blocker survives two rounds, escalate
to the user with the exact failure and options.
