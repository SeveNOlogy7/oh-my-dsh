import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exists, readJsonSafe, readJsoncSafe, readTextSafe } from '../core/atomic.js'
import { OMD_DIR, OMO_COMMIT, OMO_VERSION, AGENT_IDS, UI_PACKAGE } from '../core/constants.js'
import { loadConfig } from '../core/config.js'
import { omdPath } from '../core/paths.js'
import { AGENTS, presetIdFor } from '../agents/registry.js'
import { resolveActivePreset } from './active-preset.js'

function check(id, status, detail, fix) {
  return { id, status, detail, ...(fix ? { fix } : {}) }
}

async function dirExists(dir) {
  try {
    const stat = await fs.stat(dir)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function scanBom(dir) {
  const hits = []
  async function walk(current) {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.json') || entry.name.endsWith('.jsonc')) {
        const read = await readTextSafe(full)
        if (read.ok && read.value.charCodeAt(0) === 0xfeff) hits.push(full)
      }
    }
  }
  await walk(dir)
  return hits
}

export async function runDoctor({ ctx, agent, workspace, config, agentId, sources = [] }) {
  const checks = []
  const services = ['tools', 'commands', 'skills', 'subagents', 'sessionQuery', 'sessions', 'workingDirectory']
  const missing = services.filter((name) => !ctx.get?.(name) && !ctx[name])
  checks.push(
    missing.length
      ? check('services', 'FAIL', `missing services: ${missing.join(', ')}`, 'Use the standard web profile composition.')
      : check('services', 'PASS', `all required services present`),
  )

  if (ctx.get('agentPresets')?.list) {
    try {
      const presets = await ctx.get('agentPresets').list()
      const ids = new Set(presets.map((preset) => preset.id))
      const missingPresets = AGENT_IDS.map(presetIdFor).filter((id) => !ids.has(id))
      const broken = presets.filter(
        (preset) =>
          preset.id?.startsWith('omd-') &&
          (preset.broken !== undefined || preset.status === 'failed' || preset.error || preset.activationError),
      )
      checks.push(
        missingPresets.length || broken.length
          ? check(
              'presets',
              'FAIL',
              `${missingPresets.length ? `missing: ${missingPresets.join(', ')}; ` : ''}${broken.length ? `broken: ${broken.map((preset) => preset.id).join(', ')}` : ''}`,
              'Read the per-preset reason from the diagnostics below, then reinstall the Oh-My-DSH bundle and restart.',
            )
          : check('presets', 'PASS', `${AGENT_IDS.length} OMD presets registered`),
      )
      // The picker hides a preset whose activation failed, so its reason must be
      // readable from the session that can still run omd_doctor.
      for (const preset of broken) {
        const reason = preset.broken ?? preset.error ?? preset.activationError ?? preset.status
        checks.push(
          check('preset-detail', 'FAIL', `${preset.id}: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`),
        )
      }
    } catch (error) {
      checks.push(check('presets', 'WARN', `could not list presets: ${error?.message ?? error}`))
    }
  } else {
    checks.push(check('presets', 'WARN', 'agent preset registry unavailable'))
  }

  const clientModules = ctx.get('clientModules')
  if (clientModules?.clientPath) {
    const bundle = clientModules.clientPath(UI_PACKAGE)
    checks.push(
      bundle
        ? check('client-half', 'PASS', `registered at ${bundle}`)
        : check(
            'client-half',
            'FAIL',
            `the Host did not register the ${UI_PACKAGE} browser bundle; command output falls back to the collapsed card`,
            'Confirm the bundle patch mounts ../ui and ui/package.json declares dsh.client, then restart the app.',
          ),
    )
  } else {
    checks.push(check('client-half', 'WARN', 'clientModules service unavailable; cannot confirm the UI renderer'))
  }

  const activePreset = await resolveActivePreset(ctx, agent)
  checks.push(
    activePreset?.startsWith('omd-')
      ? check('active-preset', 'PASS', activePreset)
      : check('active-preset', 'WARN', `current preset is ${activePreset ?? 'unknown'}; select an OMD preset for full orchestration`),
  )

  const omd = omdPath(workspace)
  const dirs = ['plans', 'drafts', 'rules', 'notepads', 'tasks', 'background', 'runtime', 'logs']
  const missingDirs = []
  for (const dir of dirs) if (!(await dirExists(path.join(omd, dir)))) missingDirs.push(dir)
  checks.push(
    missingDirs.length
      ? check('omd-layout', 'WARN', `missing directories: ${missingDirs.join(', ')}`, 'Run /omd-init.')
      : check('omd-layout', 'PASS', `${OMD_DIR} layout present`),
  )

  const loaded = await loadConfig({ workspace })
  checks.push(
    loaded.diagnostics.length
      ? check('config', 'WARN', `${loaded.diagnostics.length} diagnostic(s)`, 'Fix the reported .omd/config.jsonc layers.')
      : check('config', 'PASS', `${sources.length || loaded.sources.length} source(s), no diagnostics`),
  )

  const providers = ctx.get('subagents')?.list?.() ?? []
  checks.push(
    providers.includes('spawn')
      ? check('spawn-provider', 'PASS', `providers: ${providers.join(', ')}`)
      : check('spawn-provider', 'FAIL', 'spawn provider is not registered', 'Mount @deepseek-ai/dsh-subagent-spawn-in-process.'),
  )

  if (ctx.get('subprocess')?.resolveExecutable) {
    try {
      await ctx.get('subprocess').resolveExecutable('sg')
      checks.push(check('ast-grep', 'PASS', 'sg executable found'))
    } catch {
      checks.push(check('ast-grep', 'WARN', 'sg executable not found', 'Install ast-grep and ensure `sg` is on PATH; or use grep/glob.'))
    }
  } else {
    checks.push(check('ast-grep', 'WARN', 'subprocess service unavailable; cannot probe sg'))
  }

  const diagnostics = config?.diagnostics?.commands ?? []
  checks.push(
    diagnostics.length
      ? check('diagnostics', 'PASS', `${diagnostics.length} configured command(s)`)
      : check('diagnostics', 'WARN', 'no diagnostics commands configured', 'Set diagnostics.commands in .omd/config.jsonc.'),
  )

  const ignore = path.join(omd, '.gitignore')
  checks.push(
    (await exists(ignore))
      ? check('gitignore', 'PASS', '.omd/.gitignore present')
      : check('gitignore', 'WARN', '.omd/.gitignore missing', 'Run /omd-init.'),
  )

  const bom = await scanBom(omd).catch(() => [])
  checks.push(
    bom.length
      ? check('bom', 'WARN', `BOM in ${bom.length} file(s): ${bom.slice(0, 3).join(', ')}`, 'Rewrite these files as UTF-8 without BOM.')
      : check('bom', 'PASS', 'no BOM in .omd JSON'),
  )

  const lockFile = fileURLToPath(new URL('../../upstream/omo-sources.lock.json', import.meta.url))
  const lock = await readJsonSafe(lockFile)
  if (lock.ok) {
    const commit = lock.value?.reference?.commit
    const version = lock.value?.reference?.tag
    checks.push(
      commit === OMO_COMMIT && version === `v${OMO_VERSION}`
        ? check('upstream-lock', 'PASS', `${version} @ ${commit.slice(0, 8)}`)
        : check('upstream-lock', 'WARN', `lock is ${version} @ ${commit}`, 'Update upstream/omo-sources.lock.json or the constants.'),
    )
  } else {
    checks.push(check('upstream-lock', 'WARN', 'upstream lock not readable'))
  }

  const router = await readJsoncSafe(omdPath(workspace, 'config.jsonc'))
  checks.push(
    router.ok || router.reason === 'missing'
      ? check('config-readable', 'PASS', router.ok ? 'config.jsonc readable' : 'config.jsonc absent (defaults apply)')
      : check(
          'config-readable',
          'WARN',
          `config.jsonc ${router.reason}${router.detail ? `: ${router.detail}` : ''}`,
        ),
  )

  const counts = {
    pass: checks.filter((item) => item.status === 'PASS').length,
    warn: checks.filter((item) => item.status === 'WARN').length,
    fail: checks.filter((item) => item.status === 'FAIL').length,
  }
  return { checks, counts, agent: agentId, workspace, version: OMO_VERSION, commit: OMO_COMMIT }
}

export function renderDoctor(report) {
  const lines = [`Oh-My-DSH doctor (OmO ${report.version} alignment)`]
  for (const check of report.checks) {
    lines.push(`${check.status.padEnd(4)} ${check.id}: ${check.detail}`)
    if (check.fix) lines.push(`     fix: ${check.fix}`)
  }
  lines.push(
    `summary: ${report.counts.pass} pass, ${report.counts.warn} warn, ${report.counts.fail} fail`,
  )
  return lines.join('\n')
}

