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
it once** before selecting an OMD preset. DSH caches plugin module generations;
a restart guarantees the current runtime code is loaded. After a restart, a new
session's preset roster includes the eleven OMD entries.

CLI alternative:

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

## Verify rows

`plugin_manager list_bundles` shows `@jhcai11/oh-my-dsh` with eleven rows
`preset-omd-*`. `Config.listConfigs` filtered by
`@deepseek-ai/dsh-agent-preset` shows the same eleven preset entries.

The desktop profile is managed by Electron, so `dsh --profile desktop
--dump-config` is rejected. Use the in-app inspector and a new session instead.

## Verify a session

1. Create a **new session**; presets are a composition snapshot, so an
   existing session keeps its old preset.
2. Select **Sisyphus · OMD**.
3. Run `/omd-init`.
4. Run the `omd-doctor` skill (it calls the `omd_doctor` tool).

Pass criteria:

- all required DSH services present;
- 11 OMD presets registered;
- active preset starts with `omd-`;
- `.omd` layout present after `/omd-init`;
- config parses with no diagnostics;
- spawn provider available;
- `sg` may warn if ast-grep is not installed;
- diagnostics may warn until configured;
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

## Zero-intrusion check

Start a **standard** preset session. It must have no `omd_*` tools, no
`/omd-*` commands, and no `.omd/` directory created by OMD.

## Uninstall

```
plugin_manager remove_bundle  target: @jhcai11/oh-my-dsh
```

This removes the preset declarations and the linked package. It does not delete
project `.omd/` directories.
