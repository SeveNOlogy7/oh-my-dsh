# Verification fixtures

These files are not part of the shipped runtime.

- `headless-omd.patch.yml` — overlay for a temporary headless profile. Inserts
  the preset registry, selects `omd-sisyphus`, and restores credentials.
- `omd-probe/` — a host probe that creates a blank Agent per preset, calls
  `ctx.agentPresets.select` (the same call the picker makes, which recomposes
  the Agent and appends `agent-preset/selected` to the session), and records
  `ctx.tools.schemas(agent)`. It makes no model request. `standard` is first in
  the list on purpose: under the top-level runtime row a shipped, non-OMD preset
  must see the whole `omd_*` surface with no role policy applied.
- `omd-probe.patch.yml` — inserts the probe row into a temporary web profile.

To reproduce the probe:

```powershell
dsh --profile omdweb --from-default-profile web --help
dsh plugin --profile omdweb add E:\Oh-My-DSH
dsh plugin --profile omdweb add E:\Oh-My-DSH\tests\fixtures\omd-probe
dsh --profile omdweb --patch E:\Oh-My-DSH\tests\fixtures\omd-probe.patch.yml --port 0 --no-open
# read E:\Oh-My-DSH\.omd\probe.json, then stop the process
```

Delete the temporary profile afterwards. The probe writes only
`.omd/probe.json` in this checkout.

**Stop the server explicitly.** The `dsh` launcher spawns a child `node`
process, so killing the wrapper alone leaves the child running with its port
still bound. Verify with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*<profile>*' }`
and `Stop-Process` each hit.

**Wait for all twelve entries.** The probe rewrites `.omd/probe.json` after each
preset, so a partial file is valid JSON and looks correct. Count
`results` before trusting it.
