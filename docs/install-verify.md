# Install and verify

## Install

From the DSH profile:

```
plugin_manager install_bundle  target: E:\Oh-My-DSH
```

Expected: `application: applied`, `warnings: []`, and the profile
`package.json` gains `"@jhcai11/oh-my-dsh": "link:E:/Oh-My-DSH"` plus the bundle in
`dsh.profile.bundles`.

If the app was already running when the bundle was first installed, **restart
it once**. DSH caches plugin module generations; a restart guarantees the
current runtime code is loaded. There is no OMD preset to select: the restart is
what makes the bundle's two Loader rows active.

CLI alternative:

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

## Verify rows

`plugin_manager list_bundles` shows `@jhcai11/oh-my-dsh` with the two rows this
bundle declares: the profile-level runtime row declared by the generated
`presets/omd-runtime.patch.yml`,

```yaml
- insert:
    - id: omd-runtime
      name: "@jhcai11/oh-my-dsh"
```

and the browser asset row `omd-ui` from `presets/omd-ui.patch.yml`. Those two
rows are what make OMD available in every preset. OMD registers no preset:
`Config.listConfigs` filtered by `@deepseek-ai/dsh-agent-preset` shows **no**
`omd-*` entry, and `dsh.bundle.patch` lists no per-role preset patch. A leftover
`omd-*` preset in that list is exactly what the doctor's `presets` check fails
on.

The desktop profile is managed by Electron, so `dsh --profile desktop
--dump-config` is rejected. Use the in-app inspector and a new session instead.

## Verify a session

1. Create a **new session**; presets are a composition snapshot, so an
   existing session keeps its old preset.
2. Run `/omd-init`.
3. Run the `omd-doctor` skill (it calls the `omd_doctor` tool).

Pass criteria:

- all required DSH services present;
- no `omd-*` preset registered (`PASS presets`);
- `active-role` reads `capability-only (no role persona)` for this root session;
- `.omd` layout present after `/omd-init`;
- config parses with no diagnostics;
- spawn provider available;
- `sg` may warn if ast-grep is not installed;
- diagnostics may warn until configured;
- `client-half` passes once the Host composed the browser bundle;
- no FAIL.

## Smoke

```
/omd-ulw add a README badge to this project
/omd-status
/omd-handoff
```

Expected: a mode is recorded, the turn starts, `omd_status` shows the mode and
boulder, and the handoff file is written. Delegation smoke:

> Ask the agent: "Use omd_delegate to ask Oracle to review the current README,
> then show me the result."

Expected: a `bg_*` task id, `omd_background_output` returns the child output,
and `.omd/background/<task_id>.json` exists.

## Capability check

The runtime row is mounted once at profile level, so OMD is present in every
preset. Start a **standard** preset session and expect the reverse of the
retired zero-intrusion check: the `omd_*` tools, the `/omd-*` commands, the
`omd-*` skills, and the keyword→mode hook are available, and `.omd/` can be
written. Because that session carries no `omd:<role>` descriptor label, it
resolves to **capability-only**: orchestration is available, no OMD persona
prompt is injected, and no OMD role restriction is applied.

The exact tool list a capability-only session sees is to be verified by the
probe, and it depends on the services the Host mounts: `omd_lsp` needs
`ctx.lsp`, `omd_diagnostics` needs `ctx.subprocess`, and the delegation tools
need a delegating role plus the `subagents` service. See
[docs/tools.md](<tools.md#conditional-registration>) for the full conditions; a
Host without the optional services legitimately shows fewer than the 19
documented tools. The mount probe recorded in [verification.md](<verification.md>) was run
against the retired `omd-<role>` presets and is kept there as a historical
record.

## Uninstall

```
plugin_manager remove_bundle  target: @jhcai11/oh-my-dsh
```

This removes the two OMD Loader rows (`omd-runtime`, `omd-ui`) and the
linked package. It does not delete project `.omd/` directories.
