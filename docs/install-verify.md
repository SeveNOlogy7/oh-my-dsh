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
`preset-omd-*` plus the profile-level runtime row, which the generated
`presets/omd-runtime.patch.yml` declares:

```yaml
- insert:
    - id: omd-runtime
      name: "@jhcai11/oh-my-dsh"
```

That single row is what makes OMD available in every preset; it is no longer
declared inside each OMD preset. `Config.listConfigs` filtered by
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

## Capability check

The runtime row is mounted once at profile level, so OMD is present in every
preset. Start a **standard** preset session and expect the reverse of the
retired zero-intrusion check: the `omd_*` tools, the `/omd-*` commands, the
`omd-*` skills, and the keyword→mode hook are available, and `.omd/` can be
written. Because `standard` is not an `omd-<role>` preset, that session resolves
to **capability-only**: orchestration is available, no OMD persona prompt is
injected, and no OMD role restriction is applied.

The exact tool list a capability-only session sees, and the wording any doctor
or status row uses for that state, are to be verified by the probe. The mount
probe recorded in [verification.md](<verification.md>) covers the eleven OMD
presets, not a shipped preset.

## Uninstall

```
plugin_manager remove_bundle  target: @jhcai11/oh-my-dsh
```

This removes the preset declarations, the profile-level runtime row, and the
linked package. It does not delete project `.omd/` directories.
