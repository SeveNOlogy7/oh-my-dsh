# Upstream provenance

This directory records provenance only. It never stores upstream code, prompt
text, or assets.

`omo-sources.lock.json` pins the capability reference at
`code-yeongyu/oh-my-openagent` tag `v4.19.4`, commit
`b072d279110bdda2c6ac2525d0d24dc54d16148a`, and records the license facts and
the clean-room audit method.

Rules:

1. Do not vendor the upstream repository.
2. Do not copy upstream prompt or skill text. Behavior is reimplemented from
   public documentation and observed contracts.
3. Do not move the pin without re-running `npm run check:version` and
   `npm run check:license`, and updating `docs/parity-omo-4.19.4.md`.
4. A license status other than `verified` blocks release.
