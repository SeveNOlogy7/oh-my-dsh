# Oh-My-DSH feature verification — 2026-11-13

Full-surface verification of `@jhcai11/oh-my-dsh` 0.1.3 (aligned with
oh-my-openagent 4.19.4 @ `b072d279`) in the running DeepSeek Harness desktop app
and its Web GUI. The findings below were fixed in the same tree and ship in
**0.1.4**; the verification itself was measured at 0.1.3.

**What was measured.** Two different things, and the distinction matters:

| Surface | What the evidence describes |
|---|---|
| **Source working tree** (`E:\Oh-My-DSH`, dirty vs HEAD `b9609cf`: 46 modified / 11 deleted / 12 untracked at the gates snapshot; 50 / 11 / 19 after the verification and fix waves) | every gate, every command, the config system, the client half, i18n, skills, docs parity |
| **Running Host generation** (restarted after the fix wave) | the 18 visible `omd_*` tools, delegation, background tasks, `omd_status`, `omd_doctor`, `omd_ui_status`, notepad, modes, session tools, diagnostics — plus the post-restart live re-check in §11 (D4 and D12 confirmed on the running generation) |

The Host composed its module generation before this session, so during the
verification and the fix wave every source fix was verified by tests and gates
only. **The app was then restarted** (2026-11-13T11:00:12Z, new GUI URL
`http://127.0.0.1:55340`), and §11 re-checks the new generation live: `omd_doctor`
14/14, the bundle live, and **D4 and D12 re-verified against the running Host**
(the two findings whose surface is reachable from tools). D1/D3 live in the
command plane and remain test-only — the settings endpoint still answers 401
because `DSH_WEB_URL` carries no token.

**Verdict: PASS with 12 findings — all 12 now fixed.** The verification found
them; a follow-up wave fixed every one with a regression test or a gate change,
and the gates stayed green (231 tests, 18/18 harness cases, 41/41 structural
assertions). What remains unmeasured is named in §8 — it is environment, not
product: pixels, the live HTTP route, the real upstream overlap audit (now
reported as `exit 2` instead of a green skip), and the running Host generation.

## 1. Automated gates

Run from the workspace root. The gate files under
[`.omd/evidence/gates/`](.omd/evidence/gates/summary.md) record the **first**
verification run, before any fix (`gate2` holds the pre-fix 207-test log, `gate9`
the pre-fix 40/41 assertion result). The numbers in this table were re-measured
after the fix wave and are captured in
[`.omd/evidence/verify/final-gates.txt`](.omd/evidence/verify/final-gates.txt).

| Gate | Command | Exit | Result |
|---|---|---|---|
| Static + contract + parity + version | `node scripts/check.mjs` | 0 | `check ok: 11 role prompts + 15 skills, 2 patches (runtime + UI asset), syntax + contract + parity + version` |
| Test suite (published script) | `npm test` | 0 | **231 tests / 231 pass / 0 fail** |
| Test suite (directory form) | `node --test tests/` | 0 | 231 / 231 / 0 — agrees with `npm test` |
| Preset generator determinism | `npm run check:presets` | 0 | silent on success by design |
| OMO parity | `npm run check:parity` | 0 | `parity ok: 11 agents, 19 tools, 13 commands, 15 skills` — now checks both directions (D8) |
| Upstream version lock | `npm run check:version` | 0 | `version ok: omd 0.1.3, omo 4.19.4 @ b072d279` |
| License/overlap audit | `npm run check:license` | **2** | `license audit: UNMEASURED - set OMD_UPSTREAM_DIR …` — unmeasured is no longer a green pass (D7); the measured path still returns 0 (clean) / 1 (over threshold) |
| Syntax (3 entry files) | `node --check runtime.js ui/index.js ui/client.js` | 0/0/0 | no output |
| Install contract (live) | `plugin_manager list_bundles` | n/a | `installed:true`, `source:"link:E:\\Oh-My-DSH"`, rows exactly `omd-runtime` + `omd-ui`, no `omd-*` preset |
| Structural assertions (41) | `node .omd/evidence/gates/assert-structures.mjs` | 0 | **41 / 41 pass** (was 40/41 before the D6 fix) |

## 2. Tools — 19 registered, 18 visible here

Live results are from this session's own tool calls; each line's full trace is in
[`.omd/evidence/verify/live-tools.md`](.omd/evidence/verify/live-tools.md).

| Tool | Probe | Verdict |
|---|---|---|
| `omd_doctor` | no args | **PASS** — 14 pass / 0 warn / 0 fail (services, presets, client-half, active-preset/role, layout, config, spawn-provider, ast-grep, diagnostics, gitignore, bom, upstream-lock, config-readable) |
| `omd_ui_status` | no args | **PASS** — `clientPath("omd-ui") = E:\Oh-My-DSH\ui\client.js`, `omd-ui` in the 80-entry boot graph, 2 loader rows `fiber=live` |
| `omd_status` | read board | **PASS** — mode, boulder, plans, task counts, `background: 1 active, 4 settled`, ledger tail, next actions |
| `omd_mode` | `status` / `set` ×4 / `clear` / invalid | **PASS** — `ultrawork`, `analyze`, `team`, `search` set and read back with `since`; `clear`; `unknown mode: not-a-mode` refused; 7-mode enum and `prompts/modes/<mode>.md` complete |
| `omd_notepad` | append to `verification` | **PASS** — `appended to verification.md`, timestamped section on disk; direct `write` into `.omd/notepads` denied by the guard |
| `omd_task_create` | create A; B blocked by A | **PASS** — `T-99da6db4`, `T-55c833cc … blockedBy: T-99da6db4` |
| `omd_task_update` | cycle attempt, complete | **PASS** — `dependency cycle: T-99da6db4 <- T-55c833cc`; status transitions persisted |
| `omd_task_get` / `omd_task_list` | known + unknown | **PASS** — record rendering; `unknown task: …` |
| `omd_session_list` | limit 3 | **PASS** — newest-first with state and cwd |
| `omd_session_read` | child session, unknown id | **PASS** — renders `omd-delegation` wrapper + turns, clips long transcripts; `session "…" not found` |
| `omd_session_search` | query `ultrawork` | **PASS (degraded)** — this profile disables the full-text index (`openAt: never`), so the tool returns the exact `session-query-sqlite` fix; FTS itself unexercised |
| `omd_diagnostics` | run configured commands | **PASS** — `node scripts/check.mjs` exit 0 and `node --test tests/` exit 0, bounded output |
| `omd_background_list` | empty, then 6 tasks | **PASS** — empty state, then per-record state incl. settled and cancelled |
| `omd_delegate` | foreground, default-background, category, continuation, refusals, depth | **PASS** — see §5 |
| `omd_background_output` | `block:true`, cancelled record | **PASS** — settles on completion; cancelled record read back with its reason |
| `omd_background_cancel` | cancel a running task | **PASS** — `status: cancelled`, child stopped, reason persisted, ledger event |
| `omd_look_at` | generated 480×240 PNG | **PASS** — the multimodal child read the exact title, subtitle and three shapes; `omd-result` block parsed |
| `omd_lsp` | not in this session's schema | **N/A** — registration is conditional on `ctx.lsp`; the condition is proven both ways in the command lane (`case-lsp.txt`, 9/9). A Host without `lsp` legitimately lacks it, and `docs/tools.md` now states that condition (D9 fixed) |

## 3. Commands — 13 / 13 pass

Driven through the production mount (`src/runtime/index.js#apply` → `Runtime` →
`createCommands`) on a fake DSH context, one fresh workspace per case:
**18 / 18 cases, 587 / 587 assertions** after the fix wave (the first run was
16/18 · 578/581). Evidence:
[`.omd/evidence/commands/summary.md`](.omd/evidence/commands/summary.md),
[`.omd/evidence/verify/post-fix-harness.txt`](.omd/evidence/verify/post-fix-harness.txt),
and the now-passing regression script
[`repro-defects.mjs`](.omd/evidence/commands/repro-defects.mjs) (19/19, exit 0).

| Command | What was actually observed | Verdict |
|---|---|---|
| `/omd-init` | 11 dirs, commented `config.jsonc`, `.gitignore`, both READMEs; all four files sha256-identical after mutation + re-run | PASS 42 |
| `/omd-status` | all six sections with values created by other commands; plan progress `1/2`; no followup | PASS 19 |
| `/omd-config` read | protocol 1, 3 real layers farthest-first, `defaults` deep-equal, provenance | PASS 34 |
| `/omd-config set {json}` | `write.mode:"patch"`, only that path, comments and trailing commas survive | PASS 28 |
| `/omd-config set {patch,unset}` | key removed, emptied object pruned, JSONC text preserved, patch wins on overlap | PASS 32 |
| `/omd-config` invalid | 6 shapes refused with the validator's own message and a **byte-identical** file | PASS 35 |
| `/omd-ulw` `/omd-plan` `/omd-hyperplan` `/omd-team` | mode file + ledger + one complete `{id, role:'user', content, source}` with exact `[mode] goal` | PASS 70 |
| `/omd-start-work` | approved plan beats a newer draft, boulder slot fields, protocol text verbatim, next task | PASS 39 |
| `/omd-stop-continuation` | mode cleared, boulder paused, `goals.pause({id, revision})`; with no boulder it pauses nothing and says so (D3 fixed) | PASS 23 |
| `/omd-handoff` | timestamped `.md` with state, git fence, transcript (user **and** assistant), next action; degraded sources still write | PASS 24 |
| `/omd-init-deep` `/omd-refactor` `/omd-remove-ai-slops` | protocol compared verbatim to the loaded protocol file, >200-char guard, no mode/boulder writes | PASS 34 |
| registration | exactly 13 names, no `omd-doctor` command, subagent row gets the 5 report commands | PASS 45 |
| report commands never wake the agent | 10-step sequence, `followups.length === 0` throughout | PASS 24 |

## 4. Configuration system

| Capability | Verdict |
|---|---|
| Layered precedence + provenance (repo ancestor → parent → workspace, farthest first) | PASS (independent 3-layer matrix) |
| JSONC comments/trailing commas; a real syntax error is a diagnostic, not a throw | PASS |
| Schema validation: unknown key, wrong type, range, enum, required-key removal | PASS — validator's own message, file byte-identical |
| Minimal writes: patch splices only changed spans; `unset` prunes emptied objects | PASS |
| Model chains: catalog alias, `provider/model`, inline object, agent > category, legacy fallback, complete override replaces step 0 | PASS (41/41 assertions after the D2 fix; 39/41 before it) |
| Prototype-pollution protection | PASS — top-level blocked keys are refused, nested ones are stripped recursively by `sanitizeValue`, a blocked-only patch is a usage refusal instead of a comment-losing rewrite, and `Object.prototype` is never polluted (D1 fixed) |

## 5. Delegation

| Path | Observed | Verdict |
|---|---|---|
| Foreground (`run_in_background:false`) | inline result, `status: completed`, `FOREGROUND-OK`, child session id | PASS |
| Default background (`delegation.defaultBackground:true`) | `bg_*` id, `omd_background_output` returns child output + parsed ` ```omd-result ` block | PASS |
| Category routing (`category:"quick"`) | target `quick/quick`, child runs as `sisyphus-junior`, ledger records the category | PASS |
| Continuation (`task_id`) | acceptance + child replied `CONTINUED-OK`; requires a role argument; the record is now stored `unknown` instead of `running` (D4 fixed), so the board does not count a finished child as active | PASS |
| Refusals | both role+category, unknown role, unknown task, depth cap (`delegation depth 1 reached the cap 1`) | PASS |
| Cancel | running child stopped, `status: cancelled`, reason persisted | PASS |
| Persistence | `.omd/background/<id>.json` per task; `.omd/ledger.jsonl` events in order | PASS |

## 6. Client half, settings page, i18n, skills, docs parity

Evidence: [`.omd/evidence/ui/summary.md`](.omd/evidence/ui/summary.md).

| Area | Verdict |
|---|---|
| Client bundle manifest (`omd-ui`, `dsh.client {platform:'web', immediately:true}`, `exports["./client"]`) | PASS |
| `ui/index.js` host half registers nothing (imported + `apply()` on a recording ctx: 0 registrations, no throw) | PASS |
| `ui/client.js` plain JS: no JSX, no Node API, only `require('react')`, `node --check` 0 | PASS |
| 13 `conversation.chat.commandview` cells — measured by **executing** the module's `apply()`; key set equals `createCommands()` exactly (missing `[]`, extra `[]`) | PASS |
| `settings.section` id `omd-config` (order 50) + locale namespace 234 en / 234 zh keys (238 before the 4 dead keys were removed — D10) | PASS |
| Settings endpoint `POST /api/omd/config`: one route, buffered body, conditional registration, read/legacy-set/structured-set, 4 refusals with sha256, browser path fence, 400/409 shapes | PASS (in-process, 44 assertions) |
| Real route envelope → real settings component render (React stub): 7 groups, 25 fields, provenance tags | PASS (structural, not pixels) |
| Live GUI HTTP | **NOT MEASURED** — `/` → `401 dsh web authentication required`, every `/api/*` → `401 unauthorized`; an unknown `/api` path answers the same 401, so HTTP cannot even prove the route exists (environment limit, not a product defect) |
| i18n: locale en/zh parity, 62 messages keys ×2 languages, every command/tool/skill description translated, no orphan keys, no unreachable client key | PASS (D10 fixed: probe-c `unreachable=[]`) |
| Skills: 15/15 `SKILL.md` with name+description+whenToUse, name == directory, registry == parity doc == `check.mjs` | PASS |
| Docs parity: 11 agents / 19 tools / 13 commands / 15 skills, both directions, no documented-but-absent entity | PASS — the gate itself now enforces both directions (D8 fixed) |
| Pixel rendering | **NOT MEASURED** — no browser control/token in this session |

## 7. Findings

Status: **FIXED** = changed in the source tree and re-verified with a test or a
gate change (every behavior change has a negative control that fails on the old
code); **OPEN** = reproduced with root cause and deliberately not fixed. No row
is OPEN after the follow-up wave.

| ID | Severity | Status | Finding |
|---|---|---|---|
| **D2** | medium (functional) | **FIXED** | An effort-only `omd_delegate({reasoning_effort})` on a chain-configured role started the child on the **fallback** model and dropped the effort. Root cause `src/core/config.js:428-455`: a partial override merged through the legacy resolver, which cannot see a chain, so step 0 became invalid and `primary` promoted the fallback. Fix: with a chain, a partial override now overlays the step that would actually run (the first valid one), so the primary route is kept and the effort applied — including the case where the configured step 0 is itself invalid. Regression test `a partial delegation override overlays the configured primary instead of promoting a fallback` (three shapes: effort-only, provider-only, invalid step 0). Negative control: the test fails on the old code (1 fail) and passes on the fix (10/10 in `tests/model-chain.test.mjs`); the command harness's `routing` case went from 39/41 to 41/41. |
| **D5** | low (docs) | **FIXED** | `docs/verification.md` current-tense counts were stale: "the 14 OMD commands" → 13; the recorded gate block claimed `16 pass` / `206 pass` and omitted `(runtime + UI asset)`. Corrected to 17 / 231 with the delta explained. |
| **D6** | low (data) | **FIXED** | `upstream/omo-sources.lock.json` named two `omd_target` paths that do not exist (`src/agents/prompts`, `src/hooks/mode.js`); `check-version.mjs` never validates them. Removed; the structural gate went 40/41 → **41/41**. |
| **D1** | low-sec / medium-contract | **FIXED** | Blocked-key stripping was shallow: `mergeDeep` guarded only its own level, so a nested `__proto__` under a path the defaults did not own reached the resolved config and made the write degrade to a comment-losing rewrite. Fix: `sanitizeValue` strips blocked keys recursively in `mergeDeep` and `normalizeConfig` (`src/core/config.js`), and `src/config-page/config-store.js` refuses a patch whose only content was blocked keys instead of rewriting for no change. Tests: `tests/config-safety.test.mjs` (8 cases, including the loader hole, array elements, faithful patch/create splice, and the blocked-only refusal). Harness `config-proto` went 18/19 → **19/19**. `Object.prototype` was never polluted, before or after. |
| **D3** | low (state) | **FIXED** | `/omd-stop-continuation` with no boulder manufactured a paused slot and the board reported an open paused boulder that was never started. Fix: `clearBoulder` returns without writing when the slot is missing, and the receipt says `no boulder to pause`. Tests: `tests/state-fixes.test.mjs` (2 D3 cases); harness stop-continuation 17 → 23 assertions, PASS. |
| **D4** | low (state accuracy) | **FIXED + LIVE-VERIFIED** | A continued background task never settled its record: it was stored `running` and nothing observes a continued child's end, so the board reported a finished child as active until a restart. Fix: the continuation stores `status: "unknown"` with `continuation_accepted: true` and a note explaining that the result arrives as a completion notice (`src/tools/delegate.js`); the board counts only running/queued as active. Tests: `tests/background-continuation.test.mjs` (2 cases; negative control fails on the old `running` status); `docs/tools.md` updated. **After the restart** a live continuation returned the new acceptance text, the record read `status: unknown`, and the board read `background: 0 active, 6 settled` — see §11. |
| **D7** | process | **FIXED** | `npm run check:license` exited 0 while measuring nothing. Now an unset `OMD_UPSTREAM_DIR` prints `license audit: UNMEASURED …` and exits **2**, distinct from 0 (measured, within threshold) and 1 (measured, over threshold); `docs/testing.md` documents all three. The measured path was proven intact with a fabricated upstream (exit 0 clean, exit 1 forced 1,344 shared 8-grams). The real overlap audit remains unmeasured — now honestly reported rather than green. |
| **D8** | process | **FIXED** | `scripts/check-parity.mjs` only proved that known names appear in the doc. It now checks both directions: every `omd_*`/`omd-*` token in `docs/parity-omo-4.19.4.md` must resolve to a known entity, a documented wildcard family, or an explicit non-entity allowlist (`omd-runtime`, `omd-ui`, `omd-result`, `omd-config-page`, `omd-delegation`), and the Agents table must name exactly the registered roles. Canonical lists live in `src/tools/names.js` / `src/commands/names.js`, and `tests/gate-parity.test.mjs` (8 cases) pins them to what the runtime actually registers. |
| **D9** | docs | **FIXED** | The conditional registrations were undocumented. `docs/tools.md` gained a **Conditional registration** section (`omd_lsp` needs `ctx.lsp`, `omd_diagnostics` needs `ctx.subprocess`, the delegation tools need a delegating role plus the `subagents` service; the task tools are registered but denied by a tool restriction while `taskSystem.enabled` is false, so the model never sees them), and `docs/install-verify.md` points to it instead of promising the full list. |
| **D10** | cosmetic | **FIXED** | `ui/client.js` shipped 4 unreachable dictionary keys. Removed from both dictionaries (`238 → 234` each, parity kept); `probe-c-i18n` now reports `unreachable=[]`, 28 pass / 0 warn, and `tests/config-page-ui.test.mjs` carries a regression test that the four dead keys stay absent while `errJsonShape`/`tierCategory`/`tierRoute`/`tierSource` stay. |
| **D11** | docs (historical) | **FIXED** | The three "14 skills" mentions in `docs/verification.md` are now explicitly historical (`(15 today)` plus a blockquote after the untouched 2026-11-04 transcript). `.omd/evidence/commands/summary.md` carries a post-fix update block, and `repro-defects.mjs` is now a regression check that asserts the fixed D1/D2 behavior (19/19, exit 0) instead of labelling them defects. |
| **D12** | low (state reporting) | **FIXED + LIVE-VERIFIED** | A soft-deleted task was still counted by the board. `TaskStore.summary()` now excludes `status: "deleted"` rows (`src/state/tasks.js`); `list()` still exposes them to `omd_task_list`. Tests: `tests/state-fixes.test.mjs` (2 D12 cases, negative control: `{total:2, blocked:1}` on the old code vs `{total:1, blocked:0}` now). **After the restart**, a live create→delete probe left the board at `tasks: 0 total …` while `omd_task_list` still showed the `[deleted]` row — see §11. The pre-fix live probe is kept at [`.omd/evidence/verify/post-cleanup-tasks.txt`](.omd/evidence/verify/post-cleanup-tasks.txt) as the reproduction, not as proof of the fix. |

## 8. What is not measured, and why

1. **Pixel-level UI rendering** — the GUI answers 401 without the token `dsh web`
   prints, and this session has no browser control. The strongest substitute is
   `probe-b2-render.txt`: the real route envelope rendered by the real settings
   component through a React stub (structure, props, text, provenance, error
   path — not layout, colour, CSS variables, focus states, or themes).
2. **The live settings endpoint over HTTP** — same 401 fence; the route is proven
   in-process, including conditional registration and the browser path fence.
3. **A live model-fallback turn** — the running Host composed its runtime row
   before the chain-fallback code existed in this tree; the event-level protocol
   is covered by the fake-agent tests (`tests/runtime.test.mjs`, 32 pass).
4. **A live request through the D2 fix** — source-only until the app restarts.
5. **Real full-text session search** — this deployment disables the index; the
   documented degraded answer is what was observed.
6. **A real language server** — `omd_lsp` is absent on this Host; the
   conditional registration is proven with a fake service in both directions.
7. **The running Host was restarted after the fix wave**, and §11 re-checks it
   live: `omd_doctor` 14/14, bundle live, D4 and D12 confirmed on the running
   generation. Still not measurable from here: pixel rendering, the live
   settings HTTP route (401, no token), and the real upstream overlap audit
   (`check:license` now reports that as `exit 2` instead of a green skip).
   D1/D3 live in the command plane and stay test-only.

## 9. Reproduce

```powershell
# gates
node scripts/check.mjs
npm test
npm run check:presets ; npm run check:parity ; npm run check:version
npm run check:license        # exit 2 = UNMEASURED without OMD_UPSTREAM_DIR
node .omd/evidence/gates/assert-structures.mjs

# command plane + config system (18 cases, 587 assertions)
node .omd/evidence/commands/harness.mjs
node .omd/evidence/commands/repro-defects.mjs

# client half / endpoint / i18n / skills / parity
node .omd/evidence/ui/probe-a-client.mjs
node .omd/evidence/ui/probe-b-settings.mjs
node .omd/evidence/ui/probe-c-i18n.mjs
node .omd/evidence/ui/probe-d-skills.mjs
node .omd/evidence/ui/probe-e-parity.mjs

# live tool surface: this session's transcript, summarised in
# .omd/evidence/verify/live-tools.md
```

## 10. Verdict

- **Gates:** 9 pass + 1 unmeasured; `check:license` exits 2 to say "unmeasured",
  which is the honest signal (D7), and the measured path still returns 0/1.
- **Tools:** 18 / 18 visible tools pass; `omd_lsp` N/A with the condition proven
  and now documented (D9).
- **Commands:** 13 / 13 pass; harness **18 / 18 cases, 587 / 587 assertions**.
- **Skills:** 15 / 15 pass.
- **Modes:** 7 / 7 defined and reachable; 4 exercised live (`ultrawork`,
  `analyze`, `team`, `search`) plus `clear` and an invalid-mode refusal.
- **Client half + settings page:** 13 cells, 234 / 234 locale keys, endpoint
  contract pass in-process; live HTTP and pixels unmeasured.
- **Findings:** **12 / 12 fixed** — D1, D3, D4, D7, D8, D9, D10, D11, D12 in the
  follow-up wave, D2/D5/D6 in the verification run itself. Each behavior change
  has a regression test that was shown to fail on the old code, and every gate
  is green: `npm test` **231 / 231**, structural assertions **41 / 41**,
  `check:parity` / `check:version` / `check:presets` exit 0.
- **Residual, named not hidden:** pixels, the live HTTP route, the real upstream
  overlap audit, and the corrupt-boulder-slot branch of `clearBoulder`
  (intentionally unchanged, no test) remain unmeasured or untested.

## 11. Post-restart live re-check

The app was restarted at 2026-11-13T11:00:12Z (new GUI URL
`http://127.0.0.1:55340`), so the running Host now executes the fixed
generation. Evidence:
[`.omd/evidence/verify/post-restart-live.txt`](.omd/evidence/verify/post-restart-live.txt).

| Check | Observed on the running Host | Verdict |
|---|---|---|
| Generation sanity | `omd_doctor` → `summary: 14 pass, 0 warn, 0 fail`; `omd_ui_status` → `clientPath("omd-ui") = E:\Oh-My-DSH\ui\client.js`, `omd-ui` in the 80-entry boot graph, 2 loader rows `fiber=live` | PASS |
| **D4 live** | background delegation completed (`RESTART-PROBE-1`), then a continuation returned the new acceptance text (``…reports `unknown` (OMD cannot observe a continued run)``); the record read `status: unknown` + the continuation note; `omd_status` read `background: 0 active, 6 settled`; the child's `RESTART-PROBE-2` arrived as a completion notice | PASS |
| **D12 live** | `omd_task_create` → `T-6e42fb8f [pending]`; `omd_task_update status=deleted` → `[deleted]`; `omd_status` → `tasks: 0 total, 0 in progress, 0 done, 0 blocked` while `omd_task_list` still showed the `[deleted]` row | PASS |
| Stale pre-fix artifact | the old `bg_40ae25b122` (the D4 artifact, `running`/`finished_at: null`) was reconciled when the app disposed the old generation: `status: cancelled`, `error: "parent agent disposed"`, `finished_at` at the restart instant — the board starts the new generation at `0 active` | PASS |
| Not reachable live | D1 and D3 live in the command plane (`/omd-config` write, `/omd-stop-continuation`) and are not tool surfaces; the settings endpoint still answers 401 because `DSH_WEB_URL` carries no token. Their evidence stays the tests and the command harness | NOT MEASURED (named) |
