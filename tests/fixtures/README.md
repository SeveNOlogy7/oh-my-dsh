# Verification fixtures

These files are not part of the shipped runtime.

- `headless-omd.patch.yml` — overlay for a temporary headless profile. Inserts
  the preset registry, selects `omd-sisyphus`, and restores credentials.
- `omd-probe/` — a host probe that mounts each OMD preset on a blank agent and
  records `ctx.tools.schemas(agent)`. It makes no model request.
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
