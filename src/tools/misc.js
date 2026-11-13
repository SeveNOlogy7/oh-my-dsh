import path from 'node:path'
import { UI_PACKAGE } from '../core/constants.js'
import { buildStatus, renderStatus } from '../state/status.js'
import { runDoctor, renderDoctor } from '../state/doctor.js'
import { appendNotepad } from '../state/notepads.js'
import { text } from '../i18n/index.js'
import { requireAgent, textTool, truncate } from './shared.js'

export function createMiscTools(runtime) {
  const ctx = runtime.ctx
  const tools = []
  const t = (key, fallback) => text(runtime.language, key, fallback)

  tools.push(
    textTool(
      'omd_notepad',
      t(
        'tool.omd_notepad.description',
        'Append to an append-only plan notepad (.omd/notepads/<plan>/<section>.md).',
      ),
      {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'Plan slug.' },
          section: {
            type: 'string',
            enum: ['learnings', 'decisions', 'issues', 'verification', 'problems'],
          },
          text: { type: 'string' },
          task: { type: 'string', description: 'Optional task id.' },
        },
        required: ['plan', 'text'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const file = await appendNotepad({
          workspace: state.cwd,
          plan: args.plan,
          section: args.section ?? 'learnings',
          text: args.text,
          agent: state.role,
          task: args.task,
        })
        return `appended to ${path.basename(file)}`
      },
    ),
  )

  tools.push(
    textTool(
      'omd_mode',
      t('tool.omd_mode.description', 'Read or change the current orchestration mode for this agent.'),
      {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['set', 'clear', 'status'] },
          mode: { type: 'string', enum: ['ultrawork', 'team', 'hyperplan', 'hyperplan-ulw', 'plan', 'search', 'analyze'] },
        },
        required: ['action'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        if (args.action === 'status') {
          return state.mode ? `${state.mode.mode} (since ${state.mode.since})` : 'no active mode'
        }
        if (args.action === 'clear') {
          await runtime.clearMode(parent)
          await runtime.ledger(state.cwd, { event: 'mode-cleared', agent: state.role })
          return 'mode cleared'
        }
        if (!args.mode) throw new Error('mode is required for action=set')
        const saved = await runtime.setMode(parent, args.mode)
        await runtime.ledger(state.cwd, { event: 'mode-set', agent: state.role, mode: args.mode })
        return `mode set to ${saved.mode}`
      },
    ),
  )

  tools.push(
    textTool(
      'omd_status',
      t(
        'tool.omd_status.description',
        'Read a compact orchestration status: mode, boulder, plans, tasks, background work, recent ledger.',
      ),
      { type: 'object', properties: {}, additionalProperties: false },
      async (_args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const status = await buildStatus({
          workspace: state.cwd,
          agentId: parent.id,
          config: state.config,
          backgroundRegistry: runtime.registry,
        })
        return renderStatus(status)
      },
      { isConcurrencySafe: () => true },
    ),
  )

  tools.push(
    textTool(
      'omd_doctor',
      t(
        'tool.omd_doctor.description',
        'Run report-only Oh-My-DSH diagnostics: required services, that no per-role preset is left registered, the session role, spawn provider, config and state readability, browser bundle, upstream lock. Returns one PASS/WARN/FAIL line per check with a fix, and never edits anything. The omd-doctor skill tells you how to read and report it.',
      ),
      { type: 'object', properties: {}, additionalProperties: false },
      async (_args, exec) => {
        const parent = requireAgent(exec)
        const state = await runtime.stateFor(parent)
        const diagnosis = await runDoctor({
          ctx,
          agent: parent,
          workspace: state.cwd,
          config: state.config,
          agentId: state.role,
          sources: [],
        })
        return renderDoctor(diagnosis)
      },
      { isConcurrencySafe: () => true },
    ),
  )

  if (ctx.get('lsp')?.query) {
    tools.push(
      textTool(
        'omd_lsp',
        t(
          'tool.omd_lsp.description',
          'Query the language server for a definition, references, implementation, or hover.',
        ),
        {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['goToDefinition', 'findReferences', 'goToImplementation', 'hover'],
            },
            file_path: { type: 'string' },
            line: { type: 'integer', description: '1-based line.' },
            character: { type: 'integer', description: '1-based column.' },
          },
          required: ['operation', 'file_path', 'line', 'character'],
          additionalProperties: false,
        },
        async (args, exec) => {
          const parent = requireAgent(exec)
          const state = await runtime.stateFor(parent)
          const result = await ctx.get('lsp').query(
            {
              operation: args.operation,
              filePath: path.resolve(state.cwd, args.file_path),
              position: { line: Math.max(0, args.line - 1), character: Math.max(0, args.character - 1) },
              workspaceRoot: state.cwd,
            },
            exec.signal,
          )
          if (result.kind === 'hover') {
            return result.hover?.contents ?? 'no hover information'
          }
          if (!result.locations.length) return 'no locations found'
          return result.locations
            .map((location) => {
              const uri = location.uri.replace(/^file:\/\//, '')
              return `${uri}:${location.range.start.line + 1}:${location.range.start.character + 1}`
            })
            .join('\n')
        },
        { isConcurrencySafe: () => true },
      ),
    )
  }

  if (ctx.get('subprocess')?.spawn) {
    tools.push(
      textTool(
        'omd_diagnostics',
        t(
          'tool.omd_diagnostics.description',
          'Run the diagnostics commands configured in .omd/config.jsonc (diagnostics.commands).',
        ),
        {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' }, description: 'Optional changed files for context.' },
          },
          additionalProperties: false,
        },
        async (args, exec) => {
          const parent = requireAgent(exec)
          const state = await runtime.stateFor(parent)
          const commands = state.config.diagnostics?.commands ?? []
          if (!commands.length) {
            return [
              'No diagnostics commands are configured.',
              'Add them to .omd/config.jsonc, for example:',
              '  "diagnostics": { "commands": [{ "command": "npx", "args": ["tsc", "--noEmit"] }] }',
              args.files?.length ? `Changed files: ${args.files.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          }
          const results = []
          for (const entry of commands) {
            const command = typeof entry === 'string' ? entry : entry?.command
            const argv = typeof entry === 'string' ? [] : (entry?.args ?? [])
            if (!command) continue
            try {
              const executable = await ctx.get('subprocess').resolveExecutable(command, undefined, exec.signal)
              const handle = ctx.get('subprocess').spawn({
                argv: [executable, ...argv],
                cwd: state.cwd,
                stdio: {
                  stdin: 'ignore',
                  stdout: { maxBytes: 200_000 },
                  stderr: { maxBytes: 200_000 },
                },
                graceMs: 5000,
                signal: exec.signal,
              })
              const outcome = await handle.done
              const stdout = handle.collected.stdout?.readFrom(0)
              const stderr = handle.collected.stderr?.readFrom(0)
              results.push(
                [
                  `$ ${[command, ...argv].join(' ')}`,
                  `exit: ${outcome.exitCode ?? outcome.signal ?? 'unknown'}`,
                  stdout?.text ? truncate(stdout.text, 20_000) : '',
                  stderr?.text ? truncate(stderr.text, 20_000) : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              )
            } catch (error) {
              results.push(`$ ${command}\nfailed to run: ${error?.message ?? error}`)
            }
          }
          return results.join('\n\n') || 'no diagnostics commands ran'
        },
        { isConcurrencySafe: () => false },
      ),
    )
  }

  tools.push(
    textTool(
      'omd_ui_status',
      t(
        'tool.omd_ui_status.description',
        'Report whether the Host composed the Oh-My-DSH browser bundle and which entries the Web boot graph contains. Use this when command output does not appear in the conversation.',
      ),
      { type: 'object', properties: {}, additionalProperties: false },
      async () => {
        const modules = ctx.get('clientModules')
        if (!modules) {
          return 'clientModules service unavailable: this composition has no Web client module table, so no browser bundle can be served.'
        }
        const lines = []
        try {
          const path = typeof modules.clientPath === 'function' ? modules.clientPath(UI_PACKAGE) : undefined
          lines.push(`clientPath(${JSON.stringify(UI_PACKAGE)}): ${path ?? 'NOT REGISTERED'}`)
        } catch (error) {
          lines.push(`clientPath failed: ${error?.message ?? error}`)
        }
        try {
          const graph = modules.graph?.()
          const entries = graph?.entries ?? []
          lines.push(`boot entries (${entries.length}): ${entries.map((entry) => entry.id).join(', ') || 'none'}`)
          for (const batch of graph?.batches ?? []) {
            lines.push(`batch ${batch.phase}: ${batch.entries.join(', ')}`)
          }
        } catch (error) {
          lines.push(`graph failed: ${error?.message ?? error}`)
        }
        try {
          // `loader.entries()` is a generator in cordis-plugin-loader, and a
          // wrapped loader may hand back a Map or another iterable. Normalize
          // before using array methods: calling `.filter` on the generator made
          // this scan report `loader scan failed: mine.map(...).join is not a
          // function` and hid the loader rows entirely.
          const raw = ctx.get('loader')?.entries?.() ?? []
          const entries = Array.isArray(raw)
            ? raw
            : raw instanceof Map
              ? [...raw.values()]
              : typeof raw?.[Symbol.iterator] === 'function'
                ? [...raw]
                : typeof raw?.toArray === 'function'
                  ? raw.toArray()
                  : []
          const mine = entries.filter((entry) => {
            const name = entry?.options?.name
            return typeof name === 'string' && (name.includes(UI_PACKAGE) || name.includes('oh-my-dsh'))
          })
          lines.push(
            `loader rows for the bundle (${mine.length}): ${mine
              .map((entry) => `${entry.options.name} disabled=${Boolean(entry.disabled)} fiber=${entry.fiber === undefined ? 'none' : 'live'}`)
              .join('; ') || 'none'}`,
          )
        } catch (error) {
          lines.push(`loader scan failed: ${error?.message ?? error}`)
        }
        try {
          const presets = (await ctx.get('agentPresets')?.list?.()) ?? []
          for (const preset of presets) {
            const reason = preset.broken ?? preset.error ?? preset.activationError
            if (reason === undefined) continue
            lines.push(
              `preset ${preset.id} BROKEN: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`,
            )
          }
        } catch (error) {
          lines.push(`preset audit failed: ${error?.message ?? error}`)
        }
        return lines.join('\n')
      },
    ),
  )

  return tools
}

