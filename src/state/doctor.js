import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exists, readJsonSafe, readJsoncSafe, readTextSafe } from '../core/atomic.js'
import { OMD_DIR, OMO_COMMIT, OMO_VERSION, UI_PACKAGE } from '../core/constants.js'
import { loadConfig } from '../core/config.js'
import { omdPath } from '../core/paths.js'
import { presetIdFor, agentIdFromPreset } from '../agents/registry.js'
import { resolveActivePreset } from './active-preset.js'

/**
 * The prefix of every per-role preset id OMD used to register, taken from the
 * registry so the literal is never duplicated here. `presetIdFor('')` is `omd-`.
 */
const ROLE_PRESET_PREFIX = presetIdFor('')

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
      // The check asserts the absence, not the presence: OMD registers no preset
      // per role any more, and a registered one cannot be hidden from DSH's
      // picker or switched once a session's first turn has started. Anything
      // under the role prefix is therefore a leftover from an older install,
      // which is exactly what the user has to act on.
      const leftovers = presets.filter((preset) => preset.id?.startsWith(ROLE_PRESET_PREFIX))
      const broken = leftovers.filter(
        (preset) =>
          preset.broken !== undefined || preset.status === 'failed' || preset.error || preset.activationError,
      )
      checks.push(
        leftovers.length
          ? check(
              'presets',
              'FAIL',
              `${leftovers.length} omd-* preset(s) are registered: ${leftovers.map((preset) => preset.id).join(', ')}; OMD registers none and a role rides the delegation label`,
              'Remove the per-role preset declarations (an older Oh-My-DSH install generated one per role), reinstall the bundle and restart the app.',
            )
          : check(
              'presets',
              'PASS',
              'no omd-* preset is registered; the OMD role rides the delegation label',
            ),
      )
      // The picker hides a preset whose activation failed, so a leftover's own
      // reason must stay readable from the session that can still run
      // omd_doctor. A healthy non-OMD preset is not OMD's to report.
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
    checks.push(
      check('presets', 'WARN', 'agent preset registry unavailable; cannot check for leftover per-role presets'),
    )
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

  // Two different facts, reported as two rows. `active-preset` reports which
  // preset the session runs: a preset is not the role channel any more, so the
  // most it can say is whether it is a plain capability-only one or a per-role
  // preset left over from an older install. The preset a session cannot be read
  // for at all is still worth a warning, because it hides the composition.
  const activePreset = await resolveActivePreset(ctx, agent)
  const legacyRoleFromPreset = agentIdFromPreset(activePreset)
  checks.push(
    activePreset == null
      ? check(
          'active-preset',
          'WARN',
          'current preset is unknown; the OMD role does not depend on it',
          'Restart the app so the session record is readable, or re-select the preset. The role comes from the delegation channel, not from the preset.',
        )
      : legacyRoleFromPreset
        ? check(
            'active-preset',
            'PASS',
            `${activePreset} (per-role preset from an older install; the delegation label outranks it)`,
          )
        : check('active-preset', 'PASS', `${activePreset} (capability-only preset; OMD roles ride the delegation label)`),
  )

  // `agentId` is the role the runtime resolved for this session: a row that
  // pins an agent, the child's own `omd:<role>` descriptor label, or a
  // pre-existing `omd-<role>` preset as the compatibility fallback. The doctor
  // reports that one resolution instead of deriving a second one, which could
  // disagree with what the session actually runs as. `null` is the
  // capability-only identity — a supported state, not a degraded one.
  checks.push(
    agentId
      ? check('active-role', 'PASS', agentId)
      : check('active-role', 'PASS', 'capability-only (no role persona)'),
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

