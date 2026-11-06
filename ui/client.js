/**
 * Oh-My-DSH Client half — the browser asset package.
 *
 * Two registrations live here:
 *
 * 1. `conversation.chat.commandview` — a slash-command result is delivered in
 *    the UI command plane: the host logs `command/run` and `command/done`, and
 *    `CommandNodeView` renders the row through that slot, keyed by command
 *    name. The shipped fallback (`GenericCommandCard`) collapses a multi-line
 *    result to a one-line summary and mounts the body only after a click, so an
 *    OMD report command looked like it did nothing at all. This half registers
 *    one cell per OMD command that renders the returned text directly.
 *
 * 2. `settings.section` (id `omd-config`) — the OMD configuration page. The
 *    page cannot touch the filesystem, so it drives the session-scoped
 *    `/omd-config` command through the Client Remote service:
 *    `ctx.remote.commands.execute(agentId, line, [], signal)`. That is the
 *    mechanism the shipped settings page uses for its own Host half
 *    (`ctx.remote.settings.openSettingsDocument()`), and `commands/execute` is a
 *    `direct`-invocable Remote method whose `agent` parameter is the caller's
 *    agent id, so a root-scoped page can call it explicitly. The command is
 *    mounted by the OMD preset, which is why the page is scoped to the session
 *    currently open in the main view and says so when there is none.
 *
 * The loader has no JSX step and the browser module table exposes no Harness
 * Client package to a plain-JS plugin, so the components are written with
 * `React.createElement`, styles are inline theme tokens, and every visible
 * string comes from this package's own `en`/`zh` dictionary registered through
 * the Client locale service.
 */
window.__ModuleLoader__.load({
  id: 'omd-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** OMD commands whose output is a report the user must be able to read. */
    const COMMANDS = [
      'omd-init',
      'omd-status',
      'omd-config',
      'omd-ulw',
      'omd-plan',
      'omd-hyperplan',
      'omd-team',
      'omd-start-work',
      'omd-stop-continuation',
      'omd-handoff',
      'omd-init-deep',
      'omd-refactor',
      'omd-remove-ai-slops',
    ]

    const LABELS = {
      running: 'running…',
      done: 'output',
      failed: 'failed',
    }

    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        gap: '4px',
      },
      head: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0,
        fontSize: '13px',
        lineHeight: '24px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      name: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        fontWeight: 400,
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
      },
      dot: {
        flex: 'none',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-success-primary)',
      },
      state: {
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      body: {
        maxHeight: '320px',
        margin: '4px 0 4px 4px',
        padding: '12px 16px',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        lineHeight: '1.6',
      },
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        width: '100%',
        minWidth: 0,
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '14px',
        lineHeight: '22px',
      },
      pageTitle: {
        fontSize: '16px',
        lineHeight: '24px',
        fontWeight: 600,
      },
      sectionTitle: {
        fontSize: '13px',
        lineHeight: '20px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      },
      section: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingTop: '10px',
        borderTop: '0.5px solid var(--dsw-alias-border-l2)',
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      },
      fieldLabel: {
        fontSize: '13px',
        lineHeight: '20px',
      },
      hint: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      meta: {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
        wordBreak: 'break-word',
      },
      mono: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
      },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '6px 8px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
      },
      textarea: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '72px',
        padding: '6px 8px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        lineHeight: '18px',
        resize: 'vertical',
      },
      checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      },
      button: {
        padding: '6px 12px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        cursor: 'pointer',
      },
      buttonPrimary: {
        padding: '6px 12px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-interactive-bg-hover)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        fontWeight: 600,
        cursor: 'pointer',
      },
      notice: {
        padding: '8px 10px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: '13px',
        lineHeight: '20px',
        wordBreak: 'break-word',
      },
      noticeError: {
        padding: '8px 10px',
        border: '0.5px solid var(--dsw-alias-state-error-primary)',
        borderRadius: '6px',
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: '13px',
        lineHeight: '20px',
        wordBreak: 'break-word',
      },
      code: {
        maxHeight: '260px',
        margin: 0,
        padding: '10px 12px',
        overflow: 'auto',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        lineHeight: '18px',
        whiteSpace: 'pre',
      },
      table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '12px',
        lineHeight: '18px',
      },
      cell: {
        padding: '4px 8px 4px 0',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        textAlign: 'left',
        verticalAlign: 'top',
      },
      cellMuted: {
        padding: '4px 8px 4px 0',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        textAlign: 'left',
        verticalAlign: 'top',
      },
    }

    /** Translate one key with `{name}` interpolation. */
    function format(template, vars) {
      if (typeof template !== 'string') return ''
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])))
    }

    // ---------------------------------------------------------------------
    // Command rows (conversation.chat.commandview)
    // ---------------------------------------------------------------------

    function stateOf(outcome) {
      if (outcome === null || outcome === undefined) return 'running'
      return outcome.kind === 'error' ? 'error' : 'ok'
    }

    /**
     * Render one OMD command with its output visible.
     * @param props - `node` is the command record the Chat layer already built.
     */
    function OmdCommandOutput(props) {
      const command = props && props.node ? props.node : {}
      const state = stateOf(command.outcome)
      const text = command.outcome && command.outcome.text
      const failed = state === 'error'

      const box = failed ? Object.assign({}, styles.body, { color: 'var(--dsw-alias-state-error-primary)' }) : styles.body
      const dot = failed ? Object.assign({}, styles.dot, { background: 'var(--dsw-alias-state-error-primary)' }) : styles.dot
      const label = state === 'running' ? LABELS.running : failed ? LABELS.failed : LABELS.done

      return h(
        'div',
        { style: styles.root },
        h(
          'div',
          { style: styles.head },
          h('span', { style: dot, 'aria-hidden': 'true' }),
          h('span', { style: styles.name }, `/${command.name || 'omd'}`),
          h('span', { style: styles.state }, label),
        ),
        text ? h('pre', { style: box, tabIndex: 0 }, text) : null,
      )
    }

    // ---------------------------------------------------------------------
    // Settings page (settings.section)
    // ---------------------------------------------------------------------

    /** Command this page drives; see `src/commands/index.js`. */
    const CONFIG_COMMAND = 'omd-config'
    /** Envelope version the Host answers with; see `src/config-page/index.js`. */
    const CONFIG_PROTOCOL = 1
    /** Locale namespace registered through `ctx.locale`. */
    const NS = 'omd-config-page'

    const DICTIONARY = {
      en: {
        nav: 'OMD',
        title: 'OMD configuration',
        projectTitle: 'Project (editable)',
        pluginTitle: 'Plugin (read-only)',
        workspace: 'Workspace',
        file: 'Configuration file',
        reload: 'Reload',
        reloading: 'Loading…',
        save: 'Save changes',
        saving: 'Saving…',
        keywordHook: 'Keyword hook',
        maxConcurrent: 'Max concurrent delegations',
        maxDepth: 'Max delegation depth',
        defaultBackground: 'Delegate in the background by default',
        waitTimeoutMs: 'Wait timeout (ms)',
        taskSystem: 'Task system',
        diagnosticsCommands: 'Diagnostics commands',
        diagnosticsHint: 'One per line: command arg1 arg2. Editing the list rewrites entries as {command, args}; use the JSON field for extra keys such as glob.',
        advanced: 'Agents / categories / models (JSON)',
        advancedHint: 'Merged into the file and validated against schema/omd-config.schema.json.',
        invalidJson: 'This is not valid JSON.',
        noChanges: 'No changes to save.',
        loaded: 'Loaded from {file}',
        saved: 'Saved {keys} to {file}',
        sources: 'Layers',
        diagnostics: 'Diagnostics',
        bom: 'This file starts with a UTF-8 BOM, which the doctor flags as `bom`. Saving writes it without one.',
        parseBroken: 'This file does not parse, so the page cannot edit it. Fix the JSONC syntax first.',
        schemaProblems: 'Other values in this file do not satisfy the schema:',
        language: 'Language (plugin row Config)',
        tiers: 'Model routing tiers',
        tierCategory: 'Category',
        tierRoute: 'Effective route',
        tierSource: 'Source',
        sourceBuiltin: 'built-in default',
        sourceProject: 'workspace file',
        inheritRoute: 'session model',
        snippet: 'cordis.patch.yml override',
        snippetHint: 'These values compose the profile at start-up: this page cannot save them. Paste this override into the profile patch and restart.',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Copy failed — select the text manually.',
        pluginNote: 'Read-only. `language` is a plugin-row Config value; model routing is read per workspace from .omd/config.jsonc, which the Project section edits.',
        noSessionTitle: 'No OMD session is open',
        noSessionBody: 'This page configures the workspace of the OMD session that is open in the main view. Open or resume an OMD session, then reopen Settings.',
        noCommand: 'The current session is not an OMD preset session, so it has no /omd-config command.',
        bridgeMissing: 'This build exposes no Client Remote service, so the page cannot reach the Host.',
        protocolError: 'The Host answered with an unexpected payload.',
        failed: 'Failed: {message}',
        retry: 'Retry',
      },
      zh: {
        nav: 'OMD',
        title: 'OMD 配置',
        projectTitle: '项目（可编辑）',
        pluginTitle: '插件（只读）',
        workspace: '工作区',
        file: '配置文件',
        reload: '重新加载',
        reloading: '正在加载…',
        save: '保存更改',
        saving: '正在保存…',
        keywordHook: '关键词钩子',
        maxConcurrent: '最大并发委派',
        maxDepth: '最大委派深度',
        defaultBackground: '默认后台委派',
        waitTimeoutMs: '等待超时（毫秒）',
        taskSystem: '任务系统',
        diagnosticsCommands: '诊断命令',
        diagnosticsHint: '每行一条：命令 参数1 参数2。编辑此列表会把条目改写为 {command, args}；需要 glob 等额外键请用 JSON 字段。',
        advanced: 'Agents / categories / models（JSON）',
        advancedHint: '合并写入文件，并按 schema/omd-config.schema.json 校验。',
        invalidJson: '不是合法的 JSON。',
        noChanges: '没有需要保存的更改。',
        loaded: '已从 {file} 加载',
        saved: '已把 {keys} 保存到 {file}',
        sources: '配置层',
        diagnostics: '诊断',
        bom: '该文件带 UTF-8 BOM，doctor 会标记为 `bom`。保存时会写成无 BOM。',
        parseBroken: '该文件无法解析，页面不能编辑它。请先修正 JSONC 语法。',
        schemaProblems: '文件里还有其他值不符合 schema：',
        language: '语言（插件行 Config）',
        tiers: '模型路由分档',
        tierCategory: '分档',
        tierRoute: '生效路由',
        tierSource: '来源',
        sourceBuiltin: '内置默认',
        sourceProject: '工作区文件',
        inheritRoute: '会话模型',
        snippet: 'cordis.patch.yml 覆盖片段',
        snippetHint: '这些值在启动时参与 profile 组装，本页面无法保存它们。请把下面的覆盖片段粘贴进 profile patch 后重启。',
        copy: '复制',
        copied: '已复制',
        copyFailed: '复制失败，请手动选择文本。',
        pluginNote: '只读。`language` 是插件行 Config 取值；模型路由按工作区从 .omd/config.jsonc 读取，由上方“项目”区编辑。',
        noSessionTitle: '没有打开 OMD 会话',
        noSessionBody: '本页面配置主视图中当前 OMD 会话的工作区。请先打开或恢复一个 OMD 会话，然后重新打开设置。',
        noCommand: '当前会话不是 OMD preset 会话，因此没有 /omd-config 命令。',
        bridgeMissing: '此版本没有提供 Client Remote 服务，页面无法访问宿主。',
        protocolError: '宿主返回了无法识别的数据。',
        failed: '失败：{message}',
        retry: '重试',
      },
    }

    /** Resolve the slot-provided `t`, then the locale-bound namespace, then this package's en copy. */
    function makeTranslate(props) {
      const candidates = []
      if (props && typeof props.t === 'function') candidates.push(props.t)
      if (props && typeof props.fallbackT === 'function') candidates.push(props.fallbackT)
      return function translate(key, vars) {
        for (const candidate of candidates) {
          try {
            const value = candidate(key, vars)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch {
            // try the next source
          }
        }
        return format(DICTIONARY.en[key] === undefined ? key : DICTIONARY.en[key], vars)
      }
    }

    /**
     * The slot-provided `t` needs a namespace-bound function at registration
     * time (the shell reads the section label before rendering the section).
     * The binding is resolved per call so a locale service that arrives after
     * this plugin still localizes the label.
     */
    function boundTranslate(ctx) {
      return function translate(key, vars) {
        const locale = ctx.get('locale')
        if (locale && typeof locale.bind === 'function') {
          try {
            const value = locale.bind(NS)(key, vars)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch {
            // fall through to the package dictionary
          }
        }
        return format(DICTIONARY.en[key] === undefined ? key : DICTIONARY.en[key], vars)
      }
    }

    /** The session whose agent is the one a settings page may configure. */
    function currentSessionId(ctx) {
      const sessions = ctx.get('sessions')
      const store = sessions && sessions.list
      const state = store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : null
      const rows = state && state.byId ? Object.values(state.byId) : []
      const main = rows.find((row) => row && row.retainedBy && (row.retainedBy.mainView || 0) > 0)
      if (main && main.id) return main.id
      const running = rows.find((row) => row && row.running)
      if (running && running.id) return running.id
      return rows.length > 0 && rows[0] && rows[0].id ? rows[0].id : null
    }

    /**
     * Run one `/omd-config` line on the Host.
     *
     * `commands/execute` is scoped to an agent: a caller inside an agent-scoped
     * Client context gets the agent bound from that context (two business
     * arguments), while a root-scoped page passes the id explicitly (three).
     * The page is root-scoped, so it tries the explicit form first and retries
     * once with the bound form if the Remote layer reports the other arity.
     */
    async function runCommand(ctx, line) {
      const remote = ctx.get('remote')
      const commands = remote && remote.commands
      if (!commands || typeof commands.execute !== 'function') {
        return { error: { kind: 'bridge', message: null } }
      }
      const agentId = currentSessionId(ctx)
      if (agentId === null) return { error: { kind: 'no-session', message: null } }
      let execution
      try {
        execution = await commands.execute(agentId, line, [])
      } catch (error) {
        const message = String(error && error.message ? error.message : error)
        if (!/expected 2\b/.test(message)) throw error
        execution = await commands.execute(line, [])
      }
      if (execution === null || execution === undefined) return { error: { kind: 'no-command', message: null } }
      const result = execution.result
      if (!result) return { error: { kind: 'no-command', message: null } }
      if (result.kind === 'error') return { error: { kind: 'command', message: result.text } }
      try {
        return { envelope: JSON.parse(result.text) }
      } catch (error) {
        return { error: { kind: 'protocol', message: String(error && error.message ? error.message : error) } }
      }
    }

    function diagnosticsToText(entries) {
      if (!Array.isArray(entries)) return ''
      return entries
        .map((entry) => {
          if (typeof entry === 'string') return entry
          if (entry === null || typeof entry !== 'object') return ''
          const args = Array.isArray(entry.args) ? entry.args.filter((part) => typeof part === 'string') : []
          const command = typeof entry.command === 'string' ? entry.command : ''
          return [command, ...args].filter((part) => part !== '').join(' ')
        })
        .filter((line) => line !== '')
        .join('\n')
    }

    function textToDiagnostics(text) {
      return String(text === undefined || text === null ? '' : text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => {
          const parts = line.split(/\s+/)
          return { command: parts[0], args: parts.slice(1) }
        })
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value))
    }

    function formFrom(envelope) {
      const config = envelope && envelope.config ? envelope.config : {}
      const delegation = config.delegation ? config.delegation : {}
      const taskSystem = config.taskSystem ? config.taskSystem : {}
      const advanced = {
        agents: config.agents ? config.agents : {},
        categories: config.categories ? config.categories : {},
        models: config.models ? config.models : {},
      }
      const form = {
        keywordHook: Boolean(config.keywordHook),
        maxConcurrent: String(delegation.maxConcurrent === undefined ? '' : delegation.maxConcurrent),
        maxDepth: String(delegation.maxDepth === undefined ? '' : delegation.maxDepth),
        defaultBackground: Boolean(delegation.defaultBackground),
        waitTimeoutMs: String(delegation.waitTimeoutMs === undefined ? '' : delegation.waitTimeoutMs),
        taskSystemEnabled: Boolean(taskSystem.enabled),
        diagnosticsText: diagnosticsToText(config.diagnostics ? config.diagnostics.commands : []),
        advancedText: JSON.stringify(advanced, null, 2),
      }
      return form
    }

    /** A number when the text is numeric, the raw text otherwise (so the schema rejects it loudly). */
    function numeric(text) {
      const trimmed = String(text === undefined ? '' : text).trim()
      if (trimmed === '') return null
      const value = Number(trimmed)
      return Number.isFinite(value) ? value : trimmed
    }

    /**
     * Build the minimal patch: only values the user actually changed, so a save
     * never materializes untouched inherited defaults into the file.
     */
    function buildPatch(form, base) {
      const patch = {}
      if (form.keywordHook !== base.keywordHook) patch.keywordHook = form.keywordHook
      const delegation = {}
      if (form.maxConcurrent !== base.maxConcurrent) delegation.maxConcurrent = numeric(form.maxConcurrent)
      if (form.maxDepth !== base.maxDepth) delegation.maxDepth = numeric(form.maxDepth)
      if (form.defaultBackground !== base.defaultBackground) delegation.defaultBackground = form.defaultBackground
      if (form.waitTimeoutMs !== base.waitTimeoutMs) delegation.waitTimeoutMs = numeric(form.waitTimeoutMs)
      if (Object.keys(delegation).length > 0) patch.delegation = delegation
      if (form.taskSystemEnabled !== base.taskSystemEnabled) patch.taskSystem = { enabled: form.taskSystemEnabled }
      if (form.diagnosticsText !== base.diagnosticsText) patch.diagnostics = { commands: textToDiagnostics(form.diagnosticsText) }
      if (form.advancedText !== base.advancedText) {
        let parsed
        try {
          parsed = JSON.parse(form.advancedText)
        } catch {
          return { error: 'invalidJson' }
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'invalidJson' }
        let before
        try {
          before = JSON.parse(base.advancedText)
        } catch {
          before = {}
        }
        for (const key of ['agents', 'categories', 'models']) {
          const nextValue = parsed[key] === undefined ? {} : parsed[key]
          const beforeValue = before[key] === undefined ? {} : before[key]
          if (JSON.stringify(nextValue) !== JSON.stringify(beforeValue)) patch[key] = nextValue
        }
      }
      return { patch }
    }

    function field(label, control, hint) {
      return h(
        'label',
        { style: styles.field },
        h('span', { style: styles.fieldLabel }, label),
        control,
        hint ? h('span', { style: styles.hint }, hint) : null,
      )
    }

    function numberInput(value, onChange) {
      return h('input', {
        type: 'text',
        inputMode: 'numeric',
        style: styles.input,
        value,
        onChange: (event) => onChange(event.target.value),
      })
    }

    function checkbox(checked, onChange) {
      return h(
        'span',
        { style: styles.checkRow },
        h('input', { type: 'checkbox', checked, onChange: (event) => onChange(event.target.checked) }),
      )
    }

    function button(label, onClick, primary, disabled) {
      return h(
        'button',
        {
          type: 'button',
          style: primary ? styles.buttonPrimary : styles.button,
          onClick,
          disabled: Boolean(disabled),
        },
        label,
      )
    }

    function notice(kind, text) {
      if (!text) return null
      return h('div', { style: kind === 'error' ? styles.noticeError : styles.notice, role: kind === 'error' ? 'alert' : 'status' }, text)
    }

    function tierTable(t, tiers) {
      const rows = [['name', t('tierCategory')], ['route', t('tierRoute')], ['source', t('tierSource')]]
      const header = h(
        'tr',
        null,
        rows.map(([, label]) => h('th', { key: label, style: styles.cellMuted }, label)),
      )
      const body = (tiers || []).map((tier) => {
        const route = [tier.provider, tier.model].filter((part) => part).join('/') || tier.modelRef || t('inheritRoute')
        return h(
          'tr',
          { key: tier.name },
          h('td', { style: styles.cell }, tier.name),
          h('td', { style: styles.cell }, route),
          h('td', { style: styles.cellMuted }, tier.source === 'project' ? t('sourceProject') : t('sourceBuiltin')),
        )
      })
      return h('table', { style: styles.table }, h('thead', null, header), h('tbody', null, body))
    }

    /**
     * The OMD configuration section.
     *
     * Hooks are fixed (one `useState`, one `useRef`, one `useEffect`) so a slot
     * re-render can never change their order; every Host call happens in an
     * event handler or the one effect.
     */
    function OmdConfigSection(props) {
      const t = makeTranslate(props)
      const controller = props && props.controller ? props.controller : null
      const [view, setView] = React.useState({
        phase: 'idle',
        busy: false,
        message: null,
        envelope: null,
        form: null,
        base: null,
        notice: null,
      })
      const started = React.useRef(false)

      const update = (patch) => setView((previous) => Object.assign({}, previous, patch))

      const run = async (line) => (controller ? controller.run(line) : { error: { kind: 'bridge', message: null } })

      const describeError = (error) => {
        if (!error) return t('protocolError')
        if (error.kind === 'no-session') return null
        if (error.kind === 'bridge') return t('bridgeMissing')
        if (error.kind === 'no-command') return t('noCommand')
        if (error.kind === 'command') return t('failed', { message: error.message })
        return t('protocolError')
      }

      const load = async () => {
        update({ phase: 'loading', busy: true, message: null })
        let outcome
        try {
          outcome = await run(`/${CONFIG_COMMAND}`)
        } catch (error) {
          update({ phase: 'error', busy: false, message: { kind: 'error', text: t('failed', { message: String(error && error.message ? error.message : error) }) } })
          return
        }
        if (outcome.error) {
          const text = describeError(outcome.error)
          update({
            phase: outcome.error.kind === 'no-session' || outcome.error.kind === 'no-command' ? outcome.error.kind : 'error',
            busy: false,
            message: text === null ? null : { kind: 'error', text },
          })
          return
        }
        const envelope = outcome.envelope
        if (!envelope || envelope.protocol !== CONFIG_PROTOCOL) {
          update({ phase: 'error', busy: false, message: { kind: 'error', text: t('protocolError') } })
          return
        }
        const form = formFrom(envelope)
        update({
          phase: 'ready',
          busy: false,
          envelope,
          form,
          base: clone(form),
          message: { kind: 'info', text: t('loaded', { file: envelope.file }) },
        })
      }

      const save = async () => {
        const form = view.form
        const base = view.base
        if (!form || !base) return
        const built = buildPatch(form, base)
        if (built.error) {
          update({ message: { kind: 'error', text: t('invalidJson') } })
          return
        }
        if (Object.keys(built.patch).length === 0) {
          update({ message: { kind: 'info', text: t('noChanges') } })
          return
        }
        update({ busy: true })
        let outcome
        try {
          outcome = await run(`/${CONFIG_COMMAND} set ${JSON.stringify(built.patch)}`)
        } catch (error) {
          update({ busy: false, message: { kind: 'error', text: t('failed', { message: String(error && error.message ? error.message : error) }) } })
          return
        }
        if (outcome.error) {
          const text = describeError(outcome.error)
          update({ busy: false, message: { kind: 'error', text: text === null ? t('noCommand') : text } })
          return
        }
        const envelope = outcome.envelope
        if (!envelope || envelope.protocol !== CONFIG_PROTOCOL) {
          update({ busy: false, message: { kind: 'error', text: t('protocolError') } })
          return
        }
        const next = formFrom(envelope)
        update({
          phase: 'ready',
          busy: false,
          envelope,
          form: next,
          base: clone(next),
          message: { kind: 'info', text: t('saved', { keys: (built.patch && Object.keys(built.patch).join(', ')) || '', file: envelope.file }) },
        })
      }

      const copySnippet = async (text) => {
        try {
          if (globalThis.navigator && globalThis.navigator.clipboard && globalThis.navigator.clipboard.writeText) {
            await globalThis.navigator.clipboard.writeText(text)
            update({ notice: t('copied') })
            return
          }
        } catch {
          // fall through to the manual-selection message
        }
        update({ notice: t('copyFailed') })
      }

      React.useEffect(() => {
        if (started.current || !controller) return
        started.current = true
        void load()
      })

      const shell = (children) => h('div', { style: styles.page }, children)

      if (view.phase === 'no-session' || view.phase === 'no-command') {
        return shell([
          h('div', { key: 'title', style: styles.pageTitle }, t('title')),
          h('div', { key: 'notice', style: styles.notice },
            h('div', null, view.phase === 'no-session' ? t('noSessionTitle') : t('noCommand')),
            h('div', { style: styles.meta }, view.phase === 'no-session' ? t('noSessionBody') : t('noCommand')),
          ),
          h('div', { key: 'actions', style: styles.toolbar }, button(t('retry'), () => void load(), false, view.busy)),
        ])
      }

      const envelope = view.envelope
      const form = view.form
      const plugin = envelope && envelope.plugin ? envelope.plugin : null

      const projectFields = form
        ? [
            field(t('keywordHook'), checkbox(form.keywordHook, (value) => update({ form: Object.assign({}, form, { keywordHook: value }) }))),
            field(t('maxConcurrent'), numberInput(form.maxConcurrent, (value) => update({ form: Object.assign({}, form, { maxConcurrent: value }) }))),
            field(t('maxDepth'), numberInput(form.maxDepth, (value) => update({ form: Object.assign({}, form, { maxDepth: value }) }))),
            field(t('defaultBackground'), checkbox(form.defaultBackground, (value) => update({ form: Object.assign({}, form, { defaultBackground: value }) }))),
            field(t('waitTimeoutMs'), numberInput(form.waitTimeoutMs, (value) => update({ form: Object.assign({}, form, { waitTimeoutMs: value }) }))),
            field(t('taskSystem'), checkbox(form.taskSystemEnabled, (value) => update({ form: Object.assign({}, form, { taskSystemEnabled: value }) }))),
            field(
              t('diagnosticsCommands'),
              h('textarea', {
                style: styles.textarea,
                value: form.diagnosticsText,
                spellCheck: false,
                onChange: (event) => update({ form: Object.assign({}, form, { diagnosticsText: event.target.value }) }),
              }),
              t('diagnosticsHint'),
            ),
            field(
              t('advanced'),
              h('textarea', {
                style: styles.textarea,
                value: form.advancedText,
                spellCheck: false,
                onChange: (event) => update({ form: Object.assign({}, form, { advancedText: event.target.value }) }),
              }),
              t('advancedHint'),
            ),
          ]
        : []

      const diagnostics = envelope && Array.isArray(envelope.diagnostics) ? envelope.diagnostics : []
      const sources = envelope && Array.isArray(envelope.sources) ? envelope.sources : []
      const schemaProblems = envelope && Array.isArray(envelope.schemaProblems) ? envelope.schemaProblems : []

      return shell([
        h('div', { key: 'title', style: styles.pageTitle }, t('title')),
        h('div', { key: 'location', style: styles.meta },
          `${t('workspace')}: ${envelope && envelope.workspace ? envelope.workspace : '—'}`,
          h('br'),
          `${t('file')}: ${envelope && envelope.file ? envelope.file : '—'}`,
        ),
        h('div', { key: 'toolbar', style: styles.toolbar },
          button(view.busy ? t('reloading') : t('reload'), () => void load(), false, view.busy),
          button(view.busy ? t('saving') : t('save'), () => void save(), true, view.busy || view.phase !== 'ready'),
        ),
        notice(view.message && view.message.kind, view.message && view.message.text),
        view.notice ? h('div', { key: 'notice', style: styles.meta }, view.notice) : null,
        h('div', { key: 'project', style: styles.section },
          h('div', null, t('projectTitle')),
          ...projectFields,
        ),
        sources.length > 0 ? h('div', { key: 'sources', style: styles.meta }, `${t('sources')}: ${sources.join(' · ')}`) : null,
        diagnostics.length > 0
          ? h('div', { key: 'diagnostics', style: styles.meta },
              `${t('diagnostics')}:`,
              ...diagnostics.map((entry, index) =>
                h('div', { key: `d${index}`, style: styles.mono }, `${entry.path || ''} — ${entry.reason || ''}${entry.detail ? `: ${entry.detail}` : ''}`),
              ),
            )
          : null,
        envelope && envelope.bom ? h('div', { key: 'bom', style: styles.notice }, t('bom')) : null,
        envelope && envelope.parse && envelope.parse.ok === false
          ? h('div', { key: 'parse', style: styles.noticeError }, t('parseBroken'))
          : null,
        schemaProblems.length > 0
          ? h('div', { key: 'schema', style: styles.notice },
              t('schemaProblems'),
              ...schemaProblems.map((problem, index) => h('div', { key: `p${index}`, style: styles.mono }, problem.message)),
            )
          : null,
        h('div', { key: 'pluginSection', style: styles.section },
          h('div', null, t('pluginTitle')),
          h('div', { style: styles.meta }, t('pluginNote')),
          plugin ? h('div', { style: styles.meta }, `${t('language')}: ${plugin.language ? plugin.language.value : '—'}`) : null,
          plugin && plugin.tiers && plugin.tiers.length > 0 ? tierTable(t, plugin.tiers) : null,
          plugin && plugin.snippet
            ? h('div', null,
                h('div', { style: styles.fieldLabel }, t('snippet')),
                h('div', { style: styles.hint }, t('snippetHint')),
                h('pre', { style: styles.code, tabIndex: 0 }, plugin.snippet),
                h('div', { style: styles.toolbar }, button(t('copy'), () => void copySnippet(plugin.snippet))),
              )
            : null,
        ),
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // One injection per slot key: the callback's registrations are disposed
        // with the declaration, and a per-key loop would install the same owner
        // callback repeatedly.
        ctx.slots.inject('conversation.chat.commandview', () =>
          COMMANDS.map((key) =>
            ctx.slots.register({ name: 'conversation.chat.commandview', key }, OmdCommandOutput),
          ),
        )

        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          const register = () => locale.register(NS, { en: DICTIONARY.en, zh: DICTIONARY.zh })
          if (typeof ctx.effect === 'function') ctx.effect(register, 'omd-config-page: dictionaries')
          else register()
        }
        const t = boundTranslate(ctx)
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'omd-config',
              order: 50,
              label: () => t('nav'),
              locale: NS,
              inject: () => ({ controller: { run: (line) => runCommand(ctx, line) }, fallbackT: (key, vars) => t(key, vars) }),
            },
            OmdConfigSection,
          ),
        )
      },
    }
  },
})
