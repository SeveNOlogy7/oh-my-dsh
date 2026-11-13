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
 *    page cannot touch the filesystem, so it calls the Host's own endpoint:
 *    `POST api/omd/config` with `{line, sessionId}`. That route is registered by
 *    the OMD runtime row through `ctx.connection.fetch.register(...)`, so DSH's
 *    already-authenticated `/api` channel applies the Host/Origin fence and the
 *    browser cookie before the handler runs — the page needs no token of its own.
 *    The request names a session only to say WHICH workspace's configuration to
 *    show; the Host resolves the directory, so the browser never names a path.
 *
 *    It deliberately does NOT go through `ctx.remote.commands.execute(...)` any
 *    more: executing `/omd-config` appended `command/run` + `command/done` to the
 *    live session log every time the page mounted, which a settings page must
 *    never do. The route answers with the same JSON envelope the command returns,
 *    and the page still sends a command-shaped line so both callers share one
 *    parser (`parseConfigInput`) and one envelope contract.
 *
 * The page edits every configuration key this runtime actually reads, not just
 * the handful the first version exposed: keyword activation and its three
 * keyword toggles, delegation, task system, continuation, the agent hooks,
 * rules, diagnostics, and the agents/categories/models override document. Three
 * properties make it a settings page rather than a form:
 *
 * - A save writes only what the user changed. Untouched inherited values are
 *   never materialized into the file, and a per-field reset stages a removal
 *   (the `unset` form of the `set` line) so a value can fall back to the layer
 *   it was overridden from.
 * - A field whose value came from this workspace's file, an inherited layer, or
 *   the built-in default says so, ranked from the envelope's `fileConfig`,
 *   `layers`, and `defaults`.
 * - Values are validated in the browser with the same rules the Host enforces,
 *   so a bad number is an inline error and a disabled save instead of a
 *   round-trip that leaves the file untouched.
 *
 * Compatibility with a Host half from before this page version: the browser
 * asset reloads on a page refresh while the OMD Loader row lives until the app
 * restarts, so the page may run against an older Host for a while. It therefore
 * degrades instead of failing: without `defaults` there is no reset affordance
 * (the old Host cannot remove a key), without `layers` it falls back to the old
 * source list, and a save without removals still uses the legacy
 * `set {"key": value}` form the old Host understands. A removal requested in that
 * state is reported as blocked — the keys named, the restart named as the remedy
 * — instead of being sent as a line the old Host would refuse as an unknown key.
 *
 * The loader has no JSX step and the browser module table exposes no Harness
 * Client package to a plain-JS plugin, so the components are written with
 * `React.createElement`, the settings page ships its own stylesheet (a slot
 * cannot express `:hover`, `:focus-visible`, or a media query from inline
 * style objects), every color is a live `--dsw-alias-*` theme token, and every
 * visible string comes from this package's own `en`/`zh` dictionary registered
 * through the Client locale service.
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

    /**
     * Inline styles for the chat command cells only.
     *
     * The settings page below uses a stylesheet instead: a slot component can
     * render a `style` element, and that is the only way to express hover,
     * focus-visible, disabled, placeholder and narrow-width states. Chat cells
     * are small and static enough that inline styles stay the cheaper option.
     */
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
    }

    /** Translate one key with `{name}` interpolation. */
    function format(template, vars) {
      if (typeof template !== 'string') return ''
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])))
    }

    // Command rows (conversation.chat.commandview)

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

    // Settings page (settings.section)

    /** Command this page formats its requests as; see `src/commands/index.js`. */
    const CONFIG_COMMAND = 'omd-config'
    /**
     * The page's own endpoint, registered by the OMD runtime row. Relative, so it
     * resolves against the document base like the shipped client halves do.
     */
    const CONFIG_ROUTE = 'api/omd/config'
    /** Envelope version the Host answers with; see `src/config-page/index.js`. */
    const CONFIG_PROTOCOL = 1
    /** Locale namespace registered through `ctx.locale`. */
    const NS = 'omd-config-page'
    /** Form key of the agents/categories/models JSON document. */
    const ADVANCED_KEY = 'advanced'

    /**
     * The settings stylesheet.
     *
     * Only `--dsw-alias-*` tokens the live Theme provider publishes are used, so
     * light and dark themes both come from the host and a renamed token degrades
     * appearance instead of breaking the page. The brand token is used as an
     * outline rather than a fill on primary buttons: the token set carries no
     * "label on brand" color, so a filled button would have to guess a contrast
     * color that is only correct in one theme.
     */
    const PAGE_CSS = `
      .omd-cfg { display: flex; flex-direction: column; gap: 16px; width: 100%; min-width: 0;
        color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
      .omd-cfg-title { font-size: 16px; line-height: 24px; font-weight: 600; }
      .omd-cfg-meta { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); word-break: break-word; }
      .omd-cfg-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 18px; }
      .omd-cfg-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
        flex-wrap: wrap; padding: 8px 0; background: var(--dsw-alias-bg-base);
        border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
      .omd-cfg-bar-plain { position: static; border-bottom: 0; padding: 4px 0 0; background: transparent; }
      .omd-cfg-btn { padding: 5px 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: inherit;
        font-size: 13px; line-height: 20px; cursor: pointer; }
      .omd-cfg-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
      .omd-cfg-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .omd-cfg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .omd-cfg-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .omd-cfg-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
      .omd-cfg-dirty { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-warn-primary); }
      .omd-cfg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px 28px; align-items: start; }
      .omd-cfg-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .omd-cfg-h { display: flex; align-items: baseline; gap: 8px; padding-bottom: 6px; font-size: 13px;
        font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase;
        letter-spacing: 0.04em; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
      .omd-cfg-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .omd-cfg-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
      .omd-cfg-label { font-size: 13px; line-height: 20px; }
      .omd-cfg-hint { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); word-break: break-word; }
      .omd-cfg-hint-warn { color: var(--dsw-alias-state-warn-primary); }
      .omd-cfg-tag { font-size: 11px; line-height: 16px; padding: 0 6px; border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 999px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .omd-cfg-tag-file { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
      .omd-cfg-tag-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
      .omd-cfg-input, .omd-cfg-select, .omd-cfg-textarea { box-sizing: border-box; width: 100%; padding: 6px 8px;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; line-height: 20px; }
      .omd-cfg-input:focus-visible, .omd-cfg-select:focus-visible, .omd-cfg-textarea:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 0; }
      .omd-cfg-input:disabled, .omd-cfg-select:disabled, .omd-cfg-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
      .omd-cfg-input[aria-invalid='true'], .omd-cfg-select[aria-invalid='true'], .omd-cfg-textarea[aria-invalid='true'] {
        border-color: var(--dsw-alias-state-error-primary); }
      .omd-cfg-textarea { min-height: 68px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px; line-height: 18px; }
      .omd-cfg-textarea-lg { min-height: 180px; }
      .omd-cfg-err { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
      .omd-cfg-reset { padding: 0; border: 0; background: none; color: var(--dsw-alias-brand-primary);
        font-family: inherit; font-size: 12px; line-height: 18px; cursor: pointer; text-decoration: underline; }
      .omd-cfg-reset:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .omd-cfg-notice { padding: 8px 10px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 6px;
        background: var(--dsw-alias-bg-layer-2); font-size: 13px; line-height: 20px; word-break: break-word; }
      .omd-cfg-notice-error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .omd-cfg-notice-warn { border-color: var(--dsw-alias-state-warn-primary); }
      .omd-cfg-notice-ok { border-color: var(--dsw-alias-state-success-primary); }
      .omd-cfg-details { border-top: 0.5px solid var(--dsw-alias-border-l1); padding-top: 10px; }
      .omd-cfg-summary { cursor: pointer; font-size: 13px; line-height: 20px; font-weight: 600;
        color: var(--dsw-alias-label-secondary); }
      .omd-cfg-summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .omd-cfg-details-body { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; }
      .omd-cfg-layer { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .omd-cfg-code { max-height: 240px; margin: 0; padding: 10px 12px; overflow: auto;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px; line-height: 18px; white-space: pre; }
      .omd-cfg-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; }
      .omd-cfg-table th, .omd-cfg-table td { padding: 4px 8px 4px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1);
        text-align: left; vertical-align: top; }
      .omd-cfg-table th { color: var(--dsw-alias-label-secondary); font-weight: 500; }
      .omd-cfg-section-wide { grid-column: 1 / -1; }
      .omd-chain-board { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .omd-chain-board-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .omd-chain-board-title { font-size: 14px; line-height: 22px; font-weight: 600; }
      .omd-chain-lane { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .omd-chain-lane-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding-bottom: 4px;
        border-bottom: 0.5px dashed var(--dsw-alias-border-l1); }
      .omd-chain-lane-title { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
      .omd-chain-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px;
        align-items: start; }
      .omd-chain-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
      .omd-chain-card-disabled { border-style: dashed; opacity: 0.7; }
      .omd-chain-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .omd-chain-card-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
      .omd-chain-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px;
        font-weight: 600; overflow-wrap: anywhere; }
      .omd-chain-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .omd-chain-btn { padding: 2px 8px; font-size: 12px; line-height: 18px; }
      .omd-chain-row { display: flex; align-items: stretch; gap: 6px; min-width: 0; overflow-x: auto;
        padding-bottom: 2px; }
      .omd-chain-chip { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; min-width: 120px;
        max-width: 220px; padding: 6px 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2); }
      .omd-chain-chip-warn { border-style: dashed; border-color: var(--dsw-alias-state-warn-primary); }
      .omd-chain-chip-inherited { border-style: dashed; }
      .omd-chain-chip-terminal { justify-content: center; border-style: dashed; color: var(--dsw-alias-label-secondary); }
      .omd-chain-chip-head { display: flex; align-items: baseline; gap: 6px; }
      .omd-chain-index { display: inline-flex; align-items: center; justify-content: center; min-width: 16px;
        height: 16px; padding: 0 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-1);
        border: 0.5px solid var(--dsw-alias-border-l1); font-size: 10px; line-height: 14px;
        color: var(--dsw-alias-label-secondary); }
      .omd-chain-role { font-size: 10px; line-height: 14px; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); }
      .omd-chain-chip-fallback .omd-chain-role { padding: 0 5px; border: 0.5px dashed var(--dsw-alias-border-l2);
        border-radius: 999px; color: var(--dsw-alias-label-primary); }
      .omd-chain-label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
        line-height: 18px; font-weight: 600; overflow-wrap: anywhere; }
      .omd-chain-sub { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
        overflow-wrap: anywhere; }
      .omd-chain-chip-tags { display: flex; gap: 4px; flex-wrap: wrap; }
      .omd-chain-warn { font-size: 11px; line-height: 16px; color: var(--dsw-alias-state-warn-primary); }
      .omd-chain-chip-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
      .omd-chain-arrow { flex: 0 0 auto; align-self: center; position: relative; width: 16px; height: 1px;
        background: var(--dsw-alias-border-l2); }
      .omd-chain-arrow::after { content: ''; position: absolute; right: 0; top: -3px; width: 6px; height: 6px;
        border-top: 1px solid var(--dsw-alias-border-l2); border-right: 1px solid var(--dsw-alias-border-l2);
        transform: rotate(45deg); }
      .omd-chain-model-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .omd-chain-editor { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 8px;
        border: 0.5px solid var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
      .omd-chain-editor-title { font-size: 12px; line-height: 18px; font-weight: 600;
        color: var(--dsw-alias-label-secondary); }
      .omd-chain-editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 8px 12px; }
      .omd-chain-editor-field { gap: 2px; }
      .omd-chain-editor-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .omd-chain-json { margin-top: 4px; }
      @media (max-width: 720px) {
        .omd-cfg-grid { grid-template-columns: 1fr; }
        .omd-chain-cards { grid-template-columns: 1fr; }
        .omd-chain-chip { min-width: 96px; max-width: 180px; }
        .omd-chain-editor-grid { grid-template-columns: 1fr; }
        .omd-chain-row { overflow-x: auto; }
      }
    `

    const DICTIONARY = {
      en: {
        nav: 'OMD',
        title: 'OMD configuration',
        workspace: 'Workspace',
        file: 'Configuration file',
        layers: 'Configuration layers',
        layerWorkspace: 'workspace',
        layerKeys: 'keys',
        reload: 'Reload',
        reloading: 'Loading…',
        save: 'Save changes',
        saving: 'Saving…',
        discard: 'Discard changes',
        retry: 'Retry',
        loading: 'Loading…',
        dirtyCount: '{count} unsaved',
        blockedCount: '{count} blocked (restart required)',
        clean: 'No unsaved changes',
        discardDone: 'Unsaved changes discarded.',
        confirmTitle: 'Discard unsaved changes?',
        confirmBody: 'Reloading re-reads the file and throws away the {count} change(s) staged here.',
        confirmYes: 'Discard and reload',
        confirmNo: 'Keep editing',
        statusLoaded: 'Loaded from {file}',
        statusSaved: 'Saved {keys} to {file}',
        noChanges: 'No changes to save.',
        saveBlocked: 'Fix the highlighted fields before saving.',
        creating: 'This file does not exist yet; saving creates it.',
        groupGeneral: 'General',
        groupKeywords: 'Keyword activation',
        groupDelegation: 'Delegation',
        groupHooks: 'Hooks and continuation',
        groupRules: 'Rules',
        groupDiagnostics: 'Diagnostics',
        groupAdvanced: 'Agents / categories / models',
        keywordHook: 'Keyword hook',
        keywordHookHint: 'A human turn that starts with a mode directive (ulw, ultrawork:, /ulw, [ultrawork]) switches the session mode; a mere mention does not.',
        taskSystem: 'Task system',
        taskSystemHint: 'Enable the omd_task_* tools. While enabled, todo_write is not offered.',
        keywordUltrawork: 'ultrawork / ulw',
        keywordUltraworkHint: 'Recognize a leading ultrawork directive in a human turn.',
        keywordTeam: 'team',
        keywordTeamHint: 'Recognize a leading team directive in a human turn.',
        keywordHyperplan: 'hyperplan / hpp',
        keywordHyperplanHint: 'Recognize a leading hyperplan directive in a human turn.',
        maxConcurrent: 'Max concurrent delegations',
        maxConcurrentHint: 'Per provider/model route. Default 5.',
        maxDepth: 'Max delegation depth',
        maxDepthHint: 'Absolute cap, 0 forbids a child from delegating. Default 1.',
        waitTimeoutMs: 'Foreground wait timeout (ms)',
        waitTimeoutMsHint: 'How long omd_delegate may block before it answers with the task id. Default 600000.',
        defaultBackground: 'Delegate in the background by default',
        defaultBackgroundHint: 'The omd_delegate default when the model does not pass background explicitly.',
        childPreset: 'Child preset',
        childPresetHint: 'Empty means "compose the child from the parent session". A preset id pins it.',
        childPresetPlaceholder: 'inherit the parent preset',
        maxContinuationRounds: 'Max continuation rounds',
        maxContinuationRoundsHint: 'Upper bound on turn-stopping continuations per session. Default 20.',
        requirePlanGate: 'Require a plan before editing',
        requirePlanGateHint: 'Ultrawork: refuse deliverable writes until a non-draft plan with task rows exists in .omd/plans. Files under .omd/ stay writable.',
        requireBaseline: 'Require a baseline verification run',
        requireBaselineHint: 'Ultrawork: refuse the first deliverable edit until one test/check/build command has run.',
        dualEvidence: 'Require dual evidence before closing',
        dualEvidenceHint: 'Ultrawork: keep the turn open while deliverables were written but no successful verification run is recorded.',
        commentChecker: 'Comment checker',
        commentCheckerHint: 'off, warn, or block AI-slop comments in written files.',
        commentOff: 'off',
        commentWarn: 'warn',
        commentBlock: 'block',
        todoContinuation: 'Turn-stopping continuation',
        todoContinuationHint: 'Keep an ultrawork/team/hyperplan turn going while a plan or task is open.',
        modelRouting: 'Model routing',
        modelRoutingHint: 'Apply agents/categories/models routes to the model request.',
        prometheusGuard: 'Write-scope guard',
        prometheusGuardHint: 'Refuse a write outside the role\'s allowed scopes.',
        notepadGuard: 'Notepad guard',
        notepadGuardHint: 'Refuse write/edit inside .omd/notepads; use omd_notepad instead.',
        planValidator: 'Plan validator',
        planValidatorHint: 'Warn when a written plan misses the required structure.',
        rulesPaths: 'Rule directories',
        rulesPathsHint: 'One path per line, relative to the workspace. Default .omd/rules.',
        rulesMaxBytes: 'Rules byte budget',
        rulesMaxBytesHint: 'Stop injecting rules once this many bytes are used. Default 65536.',
        diagnosticsCommands: 'Diagnostics commands',
        diagnosticsHint: 'One per line: command arg1 arg2. A line you rewrite is stored as {command, args}; an untouched entry keeps the keys the control cannot show, such as glob.',
        advanced: 'Agents / categories / models (JSON)',
        advancedHint: 'This file\'s own agents / categories / models overrides, merged over the inherited layers and validated against schema/omd-config.schema.json. Only these three keys are accepted here.',
        advancedKeys: 'Only agents, categories and models belong here; found: {keys}.',
        provenanceFile: 'in file',
        provenanceLayer: 'inherited',
        provenanceDefault: 'default',
        defaultValue: 'Default: {value}',
        reset: 'Reset',
        resetTitle: 'Remove {label} from this file so the inherited value applies',
        undoReset: 'Undo removal',
        pendingRemoval: 'removed on save',
        emptyInherited: 'Empty keeps the inherited value ({value}).',
        emptyInheritedStatus: 'An emptied field keeps its inherited value; nothing is written for it.',
        removalNeedsRestart: 'Removing a key needs the restarted OMD Host (this page is talking to an older one): {keys}. Restart DeepSeek Harness, then reload this page.',
        errInteger: '{label} must be an integer.',
        errMin: '{label} must be at least {min}.',
        errEnum: '{label} has an unsupported value.',
        errJsonShape: 'Expected a JSON object.',
        invalidJson: 'This is not valid JSON.',
        bom: 'This file starts with a UTF-8 BOM, which the doctor flags as `bom`. Saving writes it without one.',
        parseBroken: 'This file does not parse, so the page cannot edit it. Fix the JSONC syntax first.',
        schemaProblems: 'Other values in this file do not satisfy the schema:',
        diagnostics: 'Diagnostics',
        reservedTitle: 'Reserved keys in this file',
        reservedBody: 'These keys are accepted by the schema but not read by this runtime yet, so the page does not edit them: {keys}',
        pluginTitle: 'Plugin (read-only)',
        pluginNote: 'Read-only. `language` is a plugin-row Config value; model routing is read per workspace from .omd/config.jsonc, which the Project section edits.',
        language: 'Language (plugin row Config)',
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
        noSessionTitle: 'No workspace to configure',
        noSessionBody: 'The page reads and writes .omd/config.jsonc for the workspace of the session in the main view, or for the profile default when no session is open. Neither could be resolved here.',
        noCommandTitle: 'This session has no OMD commands',
        noCommandBody: 'The OMD runtime row is mounted for the whole profile, so its /omd-config command normally exists in every session. If it is missing here, check that the bundle is enabled and loaded under Settings → Plugins.',
        noCommand: 'The /omd-config command is session-scoped and this session did not register it, so this page has nothing to drive.',
        bridgeMissing: 'The page could not reach the OMD endpoint (api/omd/config). Check that the OMD bundle is enabled under Settings → Plugins, then reload this page.',
        unauthenticated: 'This page is not authorized to reach the OMD endpoint ({message}). Reload the page; if it keeps failing, restart DeepSeek Harness.',
        protocolError: 'The Host answered with an unexpected payload.',
        failed: 'Failed: {message}',
        boardTitle: 'Model chains',
        boardAria: 'Model chain board',
        boardHint: 'The first step of a chain is the primary route; later steps are fallbacks tried when a model request fails. A fallback starts a continuation turn after the failed turn closes, because DSH fixes a step\u2019s model before dispatch. Every edit goes into this file\u2019s JSON document and is written by Save changes only.',
        boardOverrideNote: 'Override in this file copies the effective primary only; inherited fallback steps are not carried over. Add them again on the new chain if you need them.',
        boardCounts: '{chains} chain override(s) in this file \u00b7 {aliases} catalog alias(es)',
        laneAgents: 'Agents',
        laneCategories: 'Categories',
        laneModels: 'Models',
        laneAgentsHint: 'Named roles a delegation can target.',
        laneCategoriesHint: 'Delegation categories; a disabled category is refused.',
        laneModelsHint: 'Provider/model aliases a chain can reference.',
        chainOf: 'Chain for {name}',
        stepPrimary: 'primary',
        stepFallback: 'fallback {n}',
        chainTerminal: 'no route',
        chainNoRoute: '(no route)',
        chainWarnUnknownAlias: 'Alias "{ref}" is not in the catalog.',
        chainWarnMissingRoute: 'Step has neither a provider nor a model.',
        chainWarnMissingProvider: 'Step has no provider.',
        chainWarnMissingModel: 'Step has no model.',
        chainWarnDuplicate: 'Duplicate of another step in this chain.',
        chainWarnEmptyStep: 'Empty step.',
        chainLegacyTag: 'single route',
        chainCustomTag: 'custom',
        chainDisabledTag: 'disabled',
        chainDisabledNote: 'This category is disabled, so delegation refuses it until `disabled` is removed.',
        chainLegacyIgnored: 'This entity has a chain and legacy provider/model fields; the chain wins, so the legacy fields are ignored until you remove them.',
        chainEmptyNote: 'Nothing configures a route here, so sessions use the session model.',
        chainNoCatalog: 'The catalog has no aliases yet. Add one in the Models lane, or use an exact route.',
        chainReadOnly: 'The chain board is read-only until this file parses.',
        chainJsonBroken: 'The JSON document does not hold valid agents / categories / models, so the chain board is disabled. Fix the JSON below to edit chains.',
        chainJsonSummary: 'Advanced JSON',
        chainOverride: 'Override in this file',
        chainOverrideTitle: 'Write a chain for {name} into this file',
        chainAdd: 'Add chain',
        chainAddTitle: 'Add a chain for {name} to this file',
        chainAddFallback: 'Add fallback step',
        chainAddFallbackTitle: 'Append a fallback step to {name}',
        chainEditRoute: 'Edit route',
        chainEditRouteTitle: 'Edit the single route of {name} as a chain',
        chainEdit: 'Edit',
        chainEditTitle: 'Edit step {position} of {name}',
        chainRemove: 'Remove step',
        chainRemoveTitle: 'Remove step {position} of {name}',
        chainMoveUp: 'Move step up',
        chainMoveUpTitle: 'Move step {position} of {name} up',
        chainMoveDown: 'Move step down',
        chainMoveDownTitle: 'Move step {position} of {name} down',
        chainSave: 'Save step',
        chainCancel: 'Cancel',
        editorOptional: 'Optional; leave a field empty to inherit it.',
        editorStepTitle: 'Step {position} of {name}',
        editorNewStepTitle: 'New step for {name}',
        editorMode: 'Step type',
        editorModeAlias: 'Catalog alias',
        editorModeRoute: 'Exact route',
        editorAlias: 'Catalog alias',
        editorAliasPlaceholder: 'choose an alias',
        editorAliasUnknown: 'This alias is not in the catalog; it is written as-is and shows a warning until the alias exists.',
        editorAliasResolved: 'Resolves to {route}.',
        editorProvider: 'Provider',
        editorModel: 'Model',
        editorModelPlaceholder: 'model or provider/model',
        editorEffort: 'Reasoning effort',
        editorEffortPlaceholder: 'inherit',
        editorTemperature: 'Temperature',
        editorMaxTokens: 'Max tokens',
        chainErrAliasRequired: 'Choose or enter a catalog alias.',
        chainErrProviderRequired: 'Provider is required for an exact route.',
        chainErrModelRequired: 'Model is required for an exact route.',
        chainErrTemperature: 'Temperature must be a number between 0 and 2.',
        chainErrMaxTokens: 'Max tokens must be a positive integer.',
        chainErrCategoryRequired: 'Category name is required.',
        chainErrCategoryExists: 'Category {name} already exists.',
        chainEffortTag: 'effort {value}',
        chainTemperatureTag: 'temperature {value}',
        chainMaxTokensTag: 'max tokens {value}',
        chainUsedBy: 'used by {count}',
        chainModelInUse: 'Referenced by {count} chain step(s); remove those steps before deleting the alias.',
        modelAdd: 'Add catalog alias',
        modelAddTitle: 'Add a provider/model alias to the catalog',
        modelEdit: 'Edit',
        modelEditTitle: 'Edit catalog alias {alias}',
        modelNewTitle: 'New catalog alias',
        modelSave: 'Save alias',
        modelDelete: 'Delete',
        modelDeleteTitle: 'Delete catalog alias {alias}',
        modelDeleteBlocked: 'Referenced by {count} chain step(s), so it cannot be deleted yet.',
        modelDeleteInherited: 'This alias comes from an inherited layer; only an alias in this file can be deleted.',
        modelInheritedNote: 'Defined by an inherited configuration layer; editing it writes an override into this file.',
        modelAlias: 'Alias',
        modelAliasPlaceholder: 'alias name',
        modelErrAliasRequired: 'Alias name is required.',
        modelErrAliasExists: 'An alias named {alias} already exists.',
        modelErrProvider: 'Provider is required.',
        modelErrModel: 'Model is required.',
        chainModelsEmpty: 'No catalog aliases are defined.',
        categoryAdd: 'Add category override',
        categoryAddTitle: 'Add a category to this file',
        categoryName: 'Category name',
        categoryNamePlaceholder: 'my-category',
        categorySave: 'Add category',
      },
      zh: {
        nav: 'OMD',
        title: 'OMD 配置',
        workspace: '工作区',
        file: '配置文件',
        layers: '配置层',
        layerWorkspace: '工作区',
        layerKeys: '键',
        reload: '重新加载',
        reloading: '正在加载…',
        save: '保存更改',
        saving: '正在保存…',
        discard: '放弃更改',
        retry: '重试',
        loading: '正在加载…',
        dirtyCount: '{count} 项未保存',
        blockedCount: '{count} 项被阻止（需要重启）',
        clean: '没有未保存的更改',
        discardDone: '已放弃未保存的更改。',
        confirmTitle: '放弃未保存的更改？',
        confirmBody: '重新加载会重新读取文件，并丢弃此处暂存的 {count} 项更改。',
        confirmYes: '放弃并重新加载',
        confirmNo: '继续编辑',
        statusLoaded: '已从 {file} 加载',
        statusSaved: '已把 {keys} 保存到 {file}',
        noChanges: '没有需要保存的更改。',
        saveBlocked: '请先修正高亮字段再保存。',
        creating: '该文件尚不存在；保存时会创建它。',
        groupGeneral: '常规',
        groupKeywords: '关键词激活',
        groupDelegation: '委派',
        groupHooks: '钩子与持续执行',
        groupRules: '规则',
        groupDiagnostics: '诊断',
        groupAdvanced: 'Agents / categories / models',
        keywordHook: '关键词钩子',
        keywordHookHint: '人类消息以模式指令开头时切换会话模式（ulw、ultrawork:、/ulw、[ultrawork]）；仅提及不再切换。',
        taskSystem: '任务系统',
        taskSystemHint: '启用 omd_task_* 工具；启用期间不再提供 todo_write。',
        keywordUltrawork: 'ultrawork / ulw',
        keywordUltraworkHint: '识别人消息开头的 ultrawork 指令。',
        keywordTeam: 'team',
        keywordTeamHint: '识别人消息开头的 team 指令。',
        keywordHyperplan: 'hyperplan / hpp',
        keywordHyperplanHint: '识别人消息开头的 hyperplan 指令。',
        maxConcurrent: '最大并发委派',
        maxConcurrentHint: '按 provider/model 路由计数，默认 5。',
        maxDepth: '最大委派深度',
        maxDepthHint: '绝对上限；0 表示子会话不可再委派。默认 1。',
        waitTimeoutMs: '前台等待超时（毫秒）',
        waitTimeoutMsHint: 'omd_delegate 在返回任务 id 前最多阻塞多久。默认 600000。',
        defaultBackground: '默认后台委派',
        defaultBackgroundHint: '模型未显式传 background 时 omd_delegate 的默认值。',
        childPreset: '子会话 preset',
        childPresetHint: '留空表示"由父会话组合子会话"；填 preset id 则固定使用它。',
        childPresetPlaceholder: '继承父会话 preset',
        maxContinuationRounds: '最大延续轮数',
        maxContinuationRoundsHint: '每个会话在轮次结束时允许的延续次数上限。默认 20。',
        requirePlanGate: '编辑前必须有计划',
        requirePlanGateHint: 'ultrawork 下，.omd/plans 里没有非 draft 且含任务行的计划时拒绝写入交付文件；.omd/ 下的文件不受限。',
        requireBaseline: '先跑基线验证',
        requireBaselineHint: 'ultrawork 下，首次修改交付文件前必须先跑过一次 test/check/build 命令。',
        dualEvidence: '收尾前必须有双重证据',
        dualEvidenceHint: 'ultrawork 下，已写入交付文件但还没有成功的验证命令时，轮次不会结束。',
        commentChecker: '注释检查',
        commentCheckerHint: 'off / warn / block，用于检查写入文件里的 AI 废话注释。',
        commentOff: 'off',
        commentWarn: 'warn',
        commentBlock: 'block',
        todoContinuation: '轮末延续',
        todoContinuationHint: '计划或任务未完成时，让 ultrawork/team/hyperplan 的轮次继续。',
        modelRouting: '模型路由',
        modelRoutingHint: '把 agents/categories/models 的路由应用到模型请求。',
        prometheusGuard: '写入范围守卫',
        prometheusGuardHint: '拒绝角色允许范围之外的写入。',
        notepadGuard: '记事本守卫',
        notepadGuardHint: '拒绝直接 write/edit .omd/notepads，请改用 omd_notepad。',
        planValidator: '计划校验',
        planValidatorHint: '写入的计划缺少必要结构时给出警告。',
        rulesPaths: '规则目录',
        rulesPathsHint: '每行一个路径，相对工作区。默认 .omd/rules。',
        rulesMaxBytes: '规则字节上限',
        rulesMaxBytesHint: '注入规则超过该字节数即停止。默认 65536。',
        diagnosticsCommands: '诊断命令',
        diagnosticsHint: '每行一条：命令 参数1 参数2。被你改写的那一行会存成 {command, args}；未改动的条目会保留控件看不到的键（如 glob）。',
        advanced: 'Agents / categories / models（JSON）',
        advancedHint: '本文件自己的 agents / categories / models 覆盖项，叠加在继承层之上，并按 schema/omd-config.schema.json 校验。此处只接受这三个键。',
        advancedKeys: '此处只接受 agents、categories、models；发现：{keys}。',
        provenanceFile: '文件中',
        provenanceLayer: '继承',
        provenanceDefault: '默认',
        defaultValue: '默认：{value}',
        reset: '重置',
        resetTitle: '从本文件移除 {label}，让继承值生效',
        undoReset: '取消移除',
        pendingRemoval: '保存时移除',
        emptyInherited: '留空则沿用继承值（{value}）。',
        emptyInheritedStatus: '被清空的字段继续沿用继承值，不会写入文件。',
        removalNeedsRestart: '移除键需要重启后的 OMD 宿主（本页面当前连接的是旧版宿主）：{keys}。请重启 DeepSeek Harness 后重新加载本页面。',
        errInteger: '{label} 必须是整数。',
        errMin: '{label} 不能小于 {min}。',
        errEnum: '{label} 的取值不受支持。',
        errJsonShape: '需要是一个 JSON 对象。',
        invalidJson: '不是合法的 JSON。',
        bom: '该文件带 UTF-8 BOM，doctor 会标记为 `bom`。保存时会写成无 BOM。',
        parseBroken: '该文件无法解析，页面不能编辑它。请先修正 JSONC 语法。',
        schemaProblems: '文件里还有其他值不符合 schema：',
        diagnostics: '诊断',
        reservedTitle: '文件中的保留键',
        reservedBody: '这些键 schema 接受但当前运行时尚未读取，因此本页面不编辑它们：{keys}',
        pluginTitle: '插件（只读）',
        pluginNote: '只读。`language` 是插件行 Config 取值；模型路由按工作区从 .omd/config.jsonc 读取，由上方"项目"区编辑。',
        language: '语言（插件行 Config）',
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
        noSessionTitle: '没有可配置的工作区',
        noSessionBody: '本页面读写主视图中当前会话工作区的 .omd/config.jsonc；没有打开会话时使用 profile 的默认工作目录。此处两者都未能解析出来。',
        noCommandTitle: '当前会话没有 OMD 命令',
        noCommandBody: 'OMD runtime 行是整个 profile 级挂载的，正常情况下每个会话都有 /omd-config 命令。若此处缺失，请在「设置 → 内置插件」里确认该 bundle 已启用并加载成功。',
        noCommand: '/omd-config 命令是按会话注册的，当前会话没有注册它，因此本页面没有可驱动的目标。',
        bridgeMissing: '页面无法访问 OMD 端点（api/omd/config）。请在「设置 → 内置插件」里确认 OMD bundle 已启用，然后刷新本页面。',
        unauthenticated: '本页面没有访问 OMD 端点的授权（{message}）。请刷新页面；若仍然失败，请重启 DeepSeek Harness。',
        protocolError: '宿主返回了无法识别的数据。',
        failed: '失败：{message}',
        boardTitle: '模型链',
        boardAria: '模型链面板',
        boardHint: '链的第一步是主路由，后续步骤是模型请求失败时依次尝试的兜底。由于 DSH 在分发前就固定了一步的模型，兜底会在失败的那一轮结束后以续跑一轮的方式执行。所有编辑都会写回本文件的 JSON 文档，只有点"保存更改"才会写入。',
        boardOverrideNote: '在本文件中覆盖只会复制当前生效的主路由，不会把继承来的兜底步骤一起复制；如果需要，请在新链上重新添加。',
        boardCounts: '本文件中有 {chains} 个链覆盖 · {aliases} 个目录别名',
        laneAgents: 'Agents',
        laneCategories: '分类',
        laneModels: '模型',
        laneAgentsHint: '委派可以指向的具名角色。',
        laneCategoriesHint: '委派分类；被禁用的分类会被拒绝。',
        laneModelsHint: '链可以引用的 provider/model 别名。',
        chainOf: '{name} 的链',
        stepPrimary: '主路由',
        stepFallback: '兜底 {n}',
        chainTerminal: '无路由',
        chainNoRoute: '（无路由）',
        chainWarnUnknownAlias: '目录里没有别名 "{ref}"。',
        chainWarnMissingRoute: '该步骤既没有 provider 也没有 model。',
        chainWarnMissingProvider: '该步骤缺少 provider。',
        chainWarnMissingModel: '该步骤缺少 model。',
        chainWarnDuplicate: '与链中另一个步骤重复。',
        chainWarnEmptyStep: '空步骤。',
        chainLegacyTag: '单路由',
        chainCustomTag: '自定义',
        chainDisabledTag: '已禁用',
        chainDisabledNote: '该分类已禁用，移除 `disabled` 之前委派会拒绝它。',
        chainLegacyIgnored: '该条目同时有链和旧的 provider/model 字段；链优先，旧字段在移除前会被忽略。',
        chainEmptyNote: '此处未配置路由，会话将使用会话模型。',
        chainNoCatalog: '目录中还没有别名。请先在"模型"区添加一个，或使用精确路由。',
        chainReadOnly: '文件解析成功之前，链路面板只读。',
        chainJsonBroken: 'JSON 文档中的 agents / categories / models 结构不合法，因此链路面板已停用。修正下方 JSON 后即可编辑链。',
        chainJsonSummary: '高级 JSON',
        chainOverride: '在本文件中覆盖',
        chainOverrideTitle: '把 {name} 的链写入本文件',
        chainAdd: '添加链',
        chainAddTitle: '为本文件添加 {name} 的链',
        chainAddFallback: '添加兜底步骤',
        chainAddFallbackTitle: '为 {name} 追加一个兜底步骤',
        chainEditRoute: '编辑路由',
        chainEditRouteTitle: '把 {name} 的单路由编辑成链',
        chainEdit: '编辑',
        chainEditTitle: '编辑 {name} 的第 {position} 步',
        chainRemove: '移除步骤',
        chainRemoveTitle: '移除 {name} 的第 {position} 步',
        chainMoveUp: '上移步骤',
        chainMoveUpTitle: '{name} 的第 {position} 步上移',
        chainMoveDown: '下移步骤',
        chainMoveDownTitle: '{name} 的第 {position} 步下移',
        chainSave: '保存步骤',
        chainCancel: '取消',
        editorOptional: '均为可选；留空表示沿用。',
        editorStepTitle: '{name} 的第 {position} 步',
        editorNewStepTitle: '{name} 的新步骤',
        editorMode: '步骤类型',
        editorModeAlias: '目录别名',
        editorModeRoute: '精确路由',
        editorAlias: '目录别名',
        editorAliasPlaceholder: '选择别名',
        editorAliasUnknown: '该别名不在目录中；会按原样写入，并在别名存在之前显示警告。',
        editorAliasResolved: '解析为 {route}。',
        editorProvider: 'Provider',
        editorModel: 'Model',
        editorModelPlaceholder: 'model 或 provider/model',
        editorEffort: '推理强度',
        editorEffortPlaceholder: '沿用',
        editorTemperature: '温度',
        editorMaxTokens: '最大 token',
        chainErrAliasRequired: '请选择或填写目录别名。',
        chainErrProviderRequired: '精确路由必须填写 provider。',
        chainErrModelRequired: '精确路由必须填写 model。',
        chainErrTemperature: '温度必须是 0 到 2 之间的数字。',
        chainErrMaxTokens: '最大 token 必须是正整数。',
        chainErrCategoryRequired: '必须填写分类名称。',
        chainErrCategoryExists: '分类 {name} 已存在。',
        chainEffortTag: '强度 {value}',
        chainTemperatureTag: '温度 {value}',
        chainMaxTokensTag: '最大 token {value}',
        chainUsedBy: '被 {count} 处使用',
        chainModelInUse: '有 {count} 个链步骤引用它；请先移除这些步骤再删除别名。',
        modelAdd: '添加目录别名',
        modelAddTitle: '向目录添加一个 provider/model 别名',
        modelEdit: '编辑',
        modelEditTitle: '编辑目录别名 {alias}',
        modelNewTitle: '新的目录别名',
        modelSave: '保存别名',
        modelDelete: '删除',
        modelDeleteTitle: '删除目录别名 {alias}',
        modelDeleteBlocked: '有 {count} 个链步骤引用它，暂时不能删除。',
        modelDeleteInherited: '该别名来自继承层；只有本文件中的别名可以删除。',
        modelInheritedNote: '该别名由继承的配置层定义；编辑会向本文件写入覆盖项。',
        modelAlias: '别名',
        modelAliasPlaceholder: '别名',
        modelErrAliasRequired: '必须填写别名。',
        modelErrAliasExists: '别名 {alias} 已存在。',
        modelErrProvider: '必须填写 provider。',
        modelErrModel: '必须填写 model。',
        chainModelsEmpty: '尚未定义任何目录别名。',
        categoryAdd: '添加分类覆盖',
        categoryAddTitle: '向本文件添加一个分类',
        categoryName: '分类名称',
        categoryNamePlaceholder: 'my-category',
        categorySave: '添加分类',
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
     * Ask the Host for one `/omd-config` line over the page's own endpoint.
     *
     * The body carries the line plus the session whose workspace to edit; the
     * Host resolves that session's directory itself, so a caller cannot aim the
     * endpoint at an arbitrary path. A response is either the command's JSON
     * envelope or `{error}` — the same shape the command plane used to answer.
     */
    async function runConfigLine(ctx, line) {
      const payload = { line, sessionId: currentSessionId(ctx) }
      let response
      try {
        response = await fetch(CONFIG_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        })
      } catch (error) {
        return { error: { kind: 'bridge', message: String(error && error.message ? error.message : error) } }
      }
      if (response.status === 401 || response.status === 403) {
        return { error: { kind: 'unauthenticated', message: `HTTP ${response.status}` } }
      }
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (body && body.error) return { error: body.error }
      if (!response.ok) return { error: { kind: 'bridge', message: `HTTP ${response.status}` } }
      if (!body) return { error: { kind: 'protocol', message: null } }
      return { envelope: body }
    }

    // Settings page: value model

    function isPlainObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    }

    /** Dotted form of one field path, used as the form key. */
    function pathKey(path) {
      return path.join('.')
    }

    function getIn(object, path) {
      let current = object
      for (const segment of path) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined
        current = current[segment]
      }
      return current
    }

    function setIn(object, path, value) {
      let current = object
      for (const segment of path.slice(0, -1)) {
        const child = current[segment]
        if (child === null || typeof child !== 'object' || Array.isArray(child)) current[segment] = {}
        current = current[segment]
      }
      current[path[path.length - 1]] = value
    }

    /** Compare two JSON values with `undefined` and `null` treated as the same absence. */
    function sameValue(left, right) {
      const a = left === undefined ? null : left
      const b = right === undefined ? null : right
      return JSON.stringify(a) === JSON.stringify(b)
    }

    /**
     * One diagnostics entry as the single editable line the page shows.
     *
     * Only the fields the control can edit are rendered; an entry may legally
     * carry more (the schema allows `glob`), and `diagnosticsFromText` is what
     * keeps those keys alive.
     */
    function diagnosticLine(entry) {
      if (typeof entry === 'string') return entry.trim()
      if (entry === null || typeof entry !== 'object') return ''
      const args = Array.isArray(entry.args) ? entry.args.filter((part) => typeof part === 'string') : []
      const command = typeof entry.command === 'string' ? entry.command : ''
      return [command, ...args].filter((part) => part !== '').join(' ')
    }

    function diagnosticsToText(entries) {
      if (!Array.isArray(entries)) return ''
      return entries.map(diagnosticLine).filter((line) => line !== '').join('\n')
    }

    /**
     * Parse the editable lines back into entries, reusing the entry every
     * unchanged line came from.
     *
     * That reuse is the point: the control cannot show `glob`, so rebuilding
     * every entry as `{command, args}` would delete a schema-valid key from a line
     * the user never touched. Only a line the user actually rewrote becomes a new
     * `{command, args}` entry; an unchanged line keeps its original value, even a
     * plain string form.
     */
    function diagnosticsFromText(text, previous) {
      const buckets = new Map()
      for (const entry of Array.isArray(previous) ? previous : []) {
        const line = diagnosticLine(entry)
        if (line === '') continue
        const list = buckets.get(line) ?? []
        list.push(entry)
        buckets.set(line, list)
      }
      const lines = String(text === undefined || text === null ? '' : text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
      const out = []
      for (const line of lines) {
        const bucket = buckets.get(line)
        if (bucket !== undefined && bucket.length > 0) {
          out.push(bucket.shift())
          continue
        }
        const parts = line.split(/\s+/)
        out.push({ command: parts[0], args: parts.slice(1) })
      }
      return out
    }

    /**
     * Every editable key, and where it lives.
     *
     * The list is deliberately the runtime's *effective* surface: keys the schema
     * accepts but nothing reads (review, telemetry, skills.paths, delegation.pollMs,
     * ultrawork.maxWaves, hooks.rulesInjection, disabledHooks) are reported as
     * reserved instead of being turned into controls that would not change anything.
     */
    const FIELDS = [
      { path: ['keywordHook'], group: 'general', type: 'boolean', labelKey: 'keywordHook', hintKey: 'keywordHookHint' },
      { path: ['taskSystem', 'enabled'], group: 'general', type: 'boolean', labelKey: 'taskSystem', hintKey: 'taskSystemHint' },

      { path: ['keywords', 'ultrawork'], group: 'keywords', type: 'boolean', labelKey: 'keywordUltrawork', hintKey: 'keywordUltraworkHint' },
      { path: ['keywords', 'team'], group: 'keywords', type: 'boolean', labelKey: 'keywordTeam', hintKey: 'keywordTeamHint' },
      { path: ['keywords', 'hyperplan'], group: 'keywords', type: 'boolean', labelKey: 'keywordHyperplan', hintKey: 'keywordHyperplanHint' },

      { path: ['delegation', 'maxConcurrent'], group: 'delegation', type: 'integer', min: 1, labelKey: 'maxConcurrent', hintKey: 'maxConcurrentHint' },
      { path: ['delegation', 'maxDepth'], group: 'delegation', type: 'integer', min: 0, labelKey: 'maxDepth', hintKey: 'maxDepthHint' },
      { path: ['delegation', 'waitTimeoutMs'], group: 'delegation', type: 'integer', min: 1, labelKey: 'waitTimeoutMs', hintKey: 'waitTimeoutMsHint' },
      { path: ['delegation', 'defaultBackground'], group: 'delegation', type: 'boolean', labelKey: 'defaultBackground', hintKey: 'defaultBackgroundHint' },
      { path: ['delegation', 'childPreset'], group: 'delegation', type: 'text', nullable: true, placeholderKey: 'childPresetPlaceholder', labelKey: 'childPreset', hintKey: 'childPresetHint' },

      { path: ['hooks', 'commentChecker'], group: 'hooks', type: 'enum', options: ['off', 'warn', 'block'], optionKey: (value) => `comment${value.charAt(0).toUpperCase()}${value.slice(1)}`, labelKey: 'commentChecker', hintKey: 'commentCheckerHint' },
      { path: ['hooks', 'todoContinuation'], group: 'hooks', type: 'boolean', labelKey: 'todoContinuation', hintKey: 'todoContinuationHint' },
      { path: ['ultrawork', 'maxContinuationRounds'], group: 'hooks', type: 'integer', min: 1, labelKey: 'maxContinuationRounds', hintKey: 'maxContinuationRoundsHint' },
      { path: ['ultrawork', 'requirePlanGate'], group: 'hooks', type: 'boolean', labelKey: 'requirePlanGate', hintKey: 'requirePlanGateHint' },
      { path: ['ultrawork', 'requireBaseline'], group: 'hooks', type: 'boolean', labelKey: 'requireBaseline', hintKey: 'requireBaselineHint' },
      { path: ['ultrawork', 'dualEvidence'], group: 'hooks', type: 'boolean', labelKey: 'dualEvidence', hintKey: 'dualEvidenceHint' },
      { path: ['hooks', 'modelRouting'], group: 'hooks', type: 'boolean', labelKey: 'modelRouting', hintKey: 'modelRoutingHint' },
      { path: ['hooks', 'prometheusGuard'], group: 'hooks', type: 'boolean', labelKey: 'prometheusGuard', hintKey: 'prometheusGuardHint' },
      { path: ['hooks', 'notepadGuard'], group: 'hooks', type: 'boolean', labelKey: 'notepadGuard', hintKey: 'notepadGuardHint' },
      { path: ['hooks', 'planValidator'], group: 'hooks', type: 'boolean', labelKey: 'planValidator', hintKey: 'planValidatorHint' },

      { path: ['rules', 'paths'], group: 'rules', type: 'list', labelKey: 'rulesPaths', hintKey: 'rulesPathsHint' },
      { path: ['rules', 'maxBytes'], group: 'rules', type: 'integer', min: 1, labelKey: 'rulesMaxBytes', hintKey: 'rulesMaxBytesHint' },

      { path: ['diagnostics', 'commands'], group: 'diagnostics', type: 'commands', labelKey: 'diagnosticsCommands', hintKey: 'diagnosticsHint' },
    ]

    const GROUPS = [
      { id: 'general', labelKey: 'groupGeneral' },
      { id: 'keywords', labelKey: 'groupKeywords' },
      { id: 'delegation', labelKey: 'groupDelegation' },
      { id: 'hooks', labelKey: 'groupHooks' },
      { id: 'rules', labelKey: 'groupRules' },
      { id: 'diagnostics', labelKey: 'groupDiagnostics' },
      { id: 'advanced', labelKey: 'groupAdvanced' },
    ]

    /** Keys the schema accepts but this runtime does not read yet. */
    const RESERVED_PATHS = [
      ['review'],
      ['telemetry'],
      ['skills'],
      ['disabledHooks'],
      ['delegation', 'pollMs'],
      ['hooks', 'rulesInjection'],
      ['ultrawork', 'maxWaves'],
    ]

    /** One field's control text for the value the effective config carries. */
    function fieldText(field, value) {
      if (field.type === 'boolean') return value === true
      if (field.type === 'integer') return value === undefined || value === null || value === '' ? '' : String(value)
      if (field.type === 'enum') {
        return typeof value === 'string' && field.options.includes(value) ? value : field.options[0]
      }
      if (field.type === 'list') {
        return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : String(item))).join('\n') : ''
      }
      if (field.type === 'commands') return diagnosticsToText(Array.isArray(value) ? value : [])
      return value === undefined || value === null ? '' : String(value)
    }

    /**
     * Validate one control and produce the value the file stores.
     *
     * The rules mirror the Host validator (`src/config-page/schema.js` plus the
     * normalization in `src/core/config.js`) for the keys that have a control, so
     * a typo becomes an inline message instead of a save that the Host refuses.
     */
    function checkField(field, raw, label) {
      if (field.type === 'boolean') return { ok: true, value: raw === true }
      if (field.type === 'integer') {
        const text = String(raw === undefined || raw === null ? '' : raw).trim()
        // An empty number is not an error: it means "leave this key alone", and
        // for a key the file sets it reads as a reset to the inherited value.
        // Only text that the user typed is judged, which keeps a control the
        // Host did not send a value for from blocking the save.
        if (text === '') return { ok: true, value: undefined }
        const value = Number(text)
        if (!Number.isInteger(value)) return { ok: false, error: { key: 'errInteger', vars: { label } } }
        const min = field.min === undefined ? 0 : field.min
        if (value < min) return { ok: false, error: { key: 'errMin', vars: { label, min } } }
        return { ok: true, value }
      }
      if (field.type === 'enum') {
        const value = String(raw === undefined || raw === null ? '' : raw)
        if (!field.options.includes(value)) return { ok: false, error: { key: 'errEnum', vars: { label } } }
        return { ok: true, value }
      }
      if (field.type === 'list') {
        const lines = String(raw === undefined || raw === null ? '' : raw)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line !== '')
        return { ok: true, value: lines }
      }
      if (field.type === 'commands') return { ok: true, value: undefined }
      const text = String(raw === undefined || raw === null ? '' : raw).trim()
      if (text === '' && field.nullable) return { ok: true, value: null }
      return { ok: true, value: text }
    }

    /** The initial form for one envelope, plus the advanced JSON document. */
    function formFrom(envelope) {
      const config = envelope && isPlainObject(envelope.config) ? envelope.config : {}
      const defaults = envelope && isPlainObject(envelope.defaults) ? envelope.defaults : null
      // The JSON document is the workspace file's own overrides, not the merged
      // effective value: saving an edit to one category must not copy every
      // inherited agents/categories/models entry into this file.
      const fileConfig = envelope && isPlainObject(envelope.fileConfig) ? envelope.fileConfig : {}
      const form = {}
      for (const field of FIELDS) {
        // The effective config normally carries every key; the defaults fallback
        // keeps an older or partial envelope showing real values instead of
        // blanks for keys it did not send.
        let value = getIn(config, field.path)
        if (value === undefined && defaults) value = getIn(defaults, field.path)
        form[pathKey(field.path)] = fieldText(field, value)
      }
      form[ADVANCED_KEY] = JSON.stringify(
        {
          agents: isPlainObject(fileConfig.agents) ? fileConfig.agents : {},
          categories: isPlainObject(fileConfig.categories) ? fileConfig.categories : {},
          models: isPlainObject(fileConfig.models) ? fileConfig.models : {},
        },
        null,
        2,
      )
      return form
    }

    /** Validate the whole form; returns typed values, error text, and the JSON document. */
    function validateForm(form, t, envelope) {
      const values = {}
      const errors = {}
      // The diagnostics control edits command lines, but an entry may also carry
      // keys it cannot show (`glob`), so the previous entries are what the edited
      // lines are reconciled against.
      const previousCommands = envelope ? getIn(envelope, ['config', 'diagnostics', 'commands']) : undefined
      for (const field of FIELDS) {
        const key = pathKey(field.path)
        if (field.type === 'commands') {
          values[key] = diagnosticsFromText(form[key], previousCommands)
          continue
        }
        const label = t(field.labelKey)
        const checked = checkField(field, form[key], label)
        if (!checked.ok) errors[key] = t(checked.error.key, checked.error.vars)
        else if (checked.value !== undefined) values[key] = checked.value
      }
      let advancedValue = null
      let advancedError = null
      let parsed
      try {
        parsed = JSON.parse(String(form[ADVANCED_KEY] === undefined ? '' : form[ADVANCED_KEY]))
      } catch {
        parsed = undefined
        advancedError = t('invalidJson')
      }
      if (advancedError === null) {
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          advancedError = t('errJsonShape')
        } else {
          const extra = Object.keys(parsed).filter((name) => !['agents', 'categories', 'models'].includes(name))
          const shapeBad = ['agents', 'categories', 'models'].some(
            (name) => parsed[name] !== undefined && (parsed[name] === null || typeof parsed[name] !== 'object' || Array.isArray(parsed[name])),
          )
          if (extra.length > 0) advancedError = t('advancedKeys', { keys: extra.join(', ') })
          else if (shapeBad) advancedError = t('errJsonShape')
          else advancedValue = parsed
        }
      }
      return { values, errors, advancedValue, advancedError }
    }

    function leafCount(node) {
      let count = 0
      for (const value of Object.values(node)) {
        if (isPlainObject(value) && Object.keys(value).length > 0) count += leafCount(value)
        else count += 1
      }
      return count
    }

    function dottedPaths(patch, prefix = [], out = []) {
      for (const [key, value] of Object.entries(patch)) {
        if (isPlainObject(value) && Object.keys(value).length > 0) dottedPaths(value, [...prefix, key], out)
        else out.push([...prefix, key].join('.'))
      }
      return out
    }

    /**
     * Build the minimal write request.
     *
     * A field is compared with the value it was loaded with, not with the
     * effective configuration: the form is the only thing the user can change, so
     * an untouched control can never leak into the file just because the Host
     * normalized it (or because an older envelope omitted it). Only a field the
     * user actually changed goes into `patch`, and a field the user reset goes
     * into `unset` instead — that is what lets the inherited value win again.
     *
     * Removals need the Host half that understands the structured write form. With
     * an older Host (`supportsUnset` false) a requested removal is not silently
     * dropped and not sent as a plain patch either — it is collected in `blocked`
     * so the page can say that the app must restart before a key can be removed.
     */
    function requestFor(envelope, form, validation, unstaged, initial, supportsUnset) {
      const patch = {}
      const unset = []
      const blocked = []
      const removals = supportsUnset ? unset : blocked
      const fileConfig = envelope && isPlainObject(envelope.fileConfig) ? envelope.fileConfig : null
      for (const field of FIELDS) {
        const key = pathKey(field.path)
        const raw = form ? form[key] : undefined
        const base = initial ? initial[key] : undefined
        if (unstaged.includes(key)) {
          if (getIn(fileConfig, field.path) !== undefined) removals.push(field.path)
          continue
        }
        if (String(raw === undefined ? '' : raw) === String(base === undefined ? '' : base)) continue
        const value = validation.values[key]
        if (value === undefined) {
          // A cleared control falls back to whatever the file inherits.
          if (getIn(fileConfig, field.path) !== undefined) removals.push(field.path)
          continue
        }
        // An emptied path list reads as "inherit the directories" for the same
        // reason an emptied number does; an empty diagnostics list stays an
        // explicit "none", because that is a decision, not a missing value.
        if (field.type === 'list' && Array.isArray(value) && value.length === 0 && getIn(fileConfig, field.path) !== undefined) {
          removals.push(field.path)
          continue
        }
        setIn(patch, field.path, value)
      }
      const advancedText = form ? String(form[ADVANCED_KEY] === undefined ? '' : form[ADVANCED_KEY]) : ''
      const initialAdvanced = initial ? String(initial[ADVANCED_KEY] === undefined ? '' : initial[ADVANCED_KEY]) : ''
      if (advancedText !== initialAdvanced && validation.advancedValue) {
        let before = {}
        try {
          before = JSON.parse(initialAdvanced)
        } catch {
          before = {}
        }
        for (const name of ['agents', 'categories', 'models']) {
          const next = isPlainObject(validation.advancedValue[name]) ? validation.advancedValue[name] : {}
          const previous = isPlainObject(before[name]) ? before[name] : {}
          if (sameValue(next, previous)) continue
          const fileValue = fileConfig === null ? undefined : fileConfig[name]
          if (Object.keys(next).length === 0 && fileValue !== undefined) removals.push([name])
          else setIn(patch, [name], next)
        }
      }
      return { patch, unset, blocked, count: leafCount(patch) + unset.length + blocked.length }
    }

    /**
     * Fields the user emptied whose value this file does not set.
     *
     * Such a control cannot be written: the file owns no value for that path, so
     * an empty text would mean "inherit", which is already the case. Saying so is
     * the difference between a no-op and a page that looks broken.
     */
    function emptiedInherited(envelope, form) {
      if (!envelope || !form) return []
      const out = []
      for (const field of FIELDS) {
        if (field.type !== 'integer' && !(field.type === 'text' && field.nullable === false)) continue
        const key = pathKey(field.path)
        const raw = form[key]
        if (String(raw === undefined || raw === null ? '' : raw).trim() !== '') continue
        if (getIn(envelope.fileConfig, field.path) !== undefined) continue
        const effective = getIn(envelope.config, field.path)
        if (effective === undefined || effective === null) continue
        const value = fieldText(field, effective)
        if (value === '') continue
        out.push({ key, value })
      }
      return out
    }

    /** Where one field's effective value currently comes from. */
    function provenanceOf(envelope, path) {
      if (!envelope) return 'default'
      if (getIn(envelope.fileConfig, path) !== undefined) return 'file'
      const layers = Array.isArray(envelope.layers) ? envelope.layers : []
      const top = path[0]
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index]
        if (!layer || typeof layer.file !== 'string' || layer.file === envelope.file) continue
        if (Array.isArray(layer.keys) && layer.keys.includes(top)) return 'layer'
      }
      return 'default'
    }

    function reservedIn(envelope) {
      const fileConfig = envelope && envelope.fileConfig
      if (!isPlainObject(fileConfig)) return []
      return RESERVED_PATHS.filter((path) => getIn(fileConfig, path) !== undefined).map((path) => path.join('.'))
    }

    function configButton(label, onClick, variant, disabled) {
      const className = variant === 'primary' ? 'omd-cfg-btn omd-cfg-btn-primary' : 'omd-cfg-btn'
      return h('button', { type: 'button', className, onClick, disabled: Boolean(disabled) }, label)
    }

    function configNotice(kind, text, key) {
      if (!text) return null
      const suffix = kind === 'error' ? ' omd-cfg-notice-error' : kind === 'ok' ? ' omd-cfg-notice-ok' : kind === 'warn' ? ' omd-cfg-notice-warn' : ''
      return h('div', { key, className: `omd-cfg-notice${suffix}`, role: kind === 'error' ? 'alert' : 'status' }, text)
    }

    /**
     * Render one field.
     *
     * Provenance is shown as a tag because it answers the question a settings page
     * must answer before an edit: is this value mine, or does it come from
     * somewhere else? A field whose value is set in this file also carries the
     * reset action that stages its removal.
     */
    function configField(field, context) {
      const { t, value, error, source, staged, readOnly, busy, supportsUnset, defaults, onChange, onReset, emptyHint } = context
      const key = pathKey(field.path)
      const id = `omd-cfg-${key}`
      const label = t(field.labelKey)
      const hint = field.hintKey ? t(field.hintKey) : ''
      const hintId = `${id}-hint`
      const errorId = `${id}-error`
      const describedBy = [hint ? hintId : null, error ? errorId : null].filter((part) => part !== null).join(' ') || undefined
      const disabled = Boolean(readOnly || busy)
      const invalid = Boolean(error)
      const defaultText = field.type === 'boolean' ? '' : fieldText(field, getIn(defaults, field.path))
      const tags = []
      if (staged) tags.push(h('span', { key: 'staged', className: 'omd-cfg-tag omd-cfg-tag-warn' }, t('pendingRemoval')))
      else if (source === 'file') tags.push(h('span', { key: 'file', className: 'omd-cfg-tag omd-cfg-tag-file' }, t('provenanceFile')))
      else if (source === 'layer') tags.push(h('span', { key: 'layer', className: 'omd-cfg-tag' }, t('provenanceLayer')))
      const canReset = Boolean(supportsUnset && !readOnly && (source === 'file' || staged))
      const resetButton = canReset
        ? h(
            'button',
            {
              key: 'reset',
              type: 'button',
              className: 'omd-cfg-reset',
              onClick: () => onReset(field),
              title: t('resetTitle', { label }),
              disabled: busy,
            },
            staged ? t('undoReset') : t('reset'),
          )
        : null
      const errorNode = invalid ? h('div', { id: errorId, className: 'omd-cfg-err', role: 'alert' }, error) : null
      const hintNode = hint ? h('div', { id: hintId, className: 'omd-cfg-hint' }, hint) : null

      if (field.type === 'boolean') {
        return h(
          'div',
          { key, className: 'omd-cfg-field' },
          h(
            'div',
            { className: 'omd-cfg-row' },
            h('input', {
              id,
              type: 'checkbox',
              checked: value === true,
              disabled,
              onChange: (event) => onChange(key, event.target.checked),
              'aria-describedby': describedBy,
            }),
            h('label', { htmlFor: id, className: 'omd-cfg-label' }, label),
            ...tags,
            resetButton,
          ),
          hintNode,
          errorNode,
        )
      }

      let control
      if (field.type === 'enum') {
        control = h(
          'select',
          {
            id,
            className: 'omd-cfg-select',
            value,
            disabled,
            onChange: (event) => onChange(key, event.target.value),
            'aria-invalid': invalid ? 'true' : undefined,
            'aria-describedby': describedBy,
          },
          field.options.map((option) =>
            h('option', { key: option, value: option }, typeof field.optionKey === 'function' ? t(field.optionKey(option)) : option),
          ),
        )
      } else if (field.type === 'list' || field.type === 'commands') {
        control = h('textarea', {
          id,
          className: 'omd-cfg-textarea',
          value,
          rows: 3,
          spellCheck: false,
          disabled,
          onChange: (event) => onChange(key, event.target.value),
          'aria-invalid': invalid ? 'true' : undefined,
          'aria-describedby': describedBy,
        })
      } else {
        control = h('input', {
          id,
          type: 'text',
          className: 'omd-cfg-input',
          value,
          inputMode: field.type === 'integer' ? 'numeric' : undefined,
          placeholder: field.placeholderKey ? t(field.placeholderKey) : undefined,
          disabled,
          onChange: (event) => onChange(key, event.target.value),
          'aria-invalid': invalid ? 'true' : undefined,
          'aria-describedby': describedBy,
        })
      }

      return h(
        'div',
        { key, className: 'omd-cfg-field' },
        h(
          'div',
          { className: 'omd-cfg-row' },
          h('label', { htmlFor: id, className: 'omd-cfg-label' }, label),
          ...tags,
          resetButton,
        ),
        control,
        hintNode,
        defaultText !== '' ? h('div', { className: 'omd-cfg-hint' }, t('defaultValue', { value: defaultText })) : null,
        emptyHint ? h('div', { className: 'omd-cfg-hint omd-cfg-hint-warn' }, emptyHint) : null,
        errorNode,
      )
    }

    function tierTable(t, tiers) {
      const columns = [t('tierCategory'), t('tierRoute'), t('tierSource')]
      const header = h(
        'tr',
        null,
        columns.map((label) => h('th', { key: label, scope: 'col' }, label)),
      )
      const body = (tiers || []).map((tier) => {
        const route = [tier.provider, tier.model].filter((part) => part).join('/') || tier.modelRef || t('inheritRoute')
        return h(
          'tr',
          { key: tier.name },
          h('td', null, h('span', { className: 'omd-cfg-mono' }, tier.name)),
          h('td', null, route),
          h('td', null, tier.source === 'project' ? t('sourceProject') : t('sourceBuiltin')),
        )
      })
      return h('table', { className: 'omd-cfg-table' }, h('thead', null, header), h('tbody', null, body))
    }

    // Model-chain board (advanced group)

    /**
     * The board reads and writes the same JSON document the textarea holds.
     *
     * Every helper below is pure and takes the parsed document plus the effective
     * configuration, so a card is a function of state and not a second copy of it.
     * The actions live in the section component: they mutate a clone of the
     * document and stage it through the one `setFieldValue(ADVANCED_KEY, …)` path,
     * which keeps the dirty count, the inline JSON validation, the save diff, and
     * the hand-editable textarea describing exactly the same value.
     */

    /** Role ids this runtime publishes; the Agents lane lists every one of them. */
    const BOARD_AGENTS = [
      'sisyphus',
      'hephaestus',
      'prometheus',
      'atlas',
      'oracle',
      'librarian',
      'explore',
      'multimodal-looker',
      'metis',
      'momus',
      'sisyphus-junior',
    ]

    /** The eight built-in categories; custom ones are added from the document. */
    const BOARD_CATEGORIES = [
      'visual-engineering',
      'ultrabrain',
      'deep',
      'artistry',
      'quick',
      'unspecified-low',
      'unspecified-high',
      'writing',
    ]

    /** Route fields the legacy single-route form may carry on an agent/category. */
    const LEGACY_ROUTE_KEYS = ['provider', 'model', 'modelRef', 'reasoningEffort', 'temperature', 'maxTokens']

    /** The only keys the JSON document may carry; the board refuses anything else. */
    const DOCUMENT_KEYS = ['agents', 'categories', 'models']

    /** Trimmed string form of a value; empty for anything that is not a string. */
    function textOf(value) {
      return typeof value === 'string' ? value.trim() : ''
    }

    /** True when the value is a non-empty string once trimmed. */
    function filled(value) {
      return textOf(value) !== ''
    }

    /**
     * Deep copy through JSON.
     *
     * `structuredClone` is not available in every browser this page supports, and
     * every graph edit clones first so a failed save keeps the previous document.
     */
    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value))
    }

    /**
     * The document the board edits, or null when the textarea is not one.
     *
     * This is the same shape rule `validateForm` applies (an object with at most
     * agents, categories and models, each an object), so the board can never
     * write a document the JSON validation would refuse.
     */
    function chainDocument(form) {
      if (!form) return null
      const raw = form[ADVANCED_KEY]
      let parsed
      try {
        parsed = JSON.parse(String(raw === undefined || raw === null ? '' : raw))
      } catch {
        return null
      }
      if (!isPlainObject(parsed)) return null
      if (Object.keys(parsed).some((name) => !DOCUMENT_KEYS.includes(name))) return null
      const document = {}
      for (const name of DOCUMENT_KEYS) {
        const section = parsed[name]
        if (section === undefined) document[name] = {}
        else if (isPlainObject(section)) document[name] = section
        else return null
      }
      return document
    }

    /** The aliases the board resolves against: inherited entries first, this file's edits last. */
    function catalogOf(document, config) {
      const catalog = {}
      const effective =
        isPlainObject(config) && isPlainObject(config.models) && isPlainObject(config.models.catalog) ? config.models.catalog : {}
      for (const [alias, entry] of Object.entries(effective)) if (isPlainObject(entry)) catalog[alias] = entry
      const own =
        isPlainObject(document) && isPlainObject(document.models) && isPlainObject(document.models.catalog)
          ? document.models.catalog
          : {}
      for (const [alias, entry] of Object.entries(own)) if (isPlainObject(entry)) catalog[alias] = entry
      return catalog
    }

    /** This file's own catalog entries, as opposed to the inherited ones. */
    function fileCatalogOf(document) {
      if (!isPlainObject(document) || !isPlainObject(document.models) || !isPlainObject(document.models.catalog)) return {}
      return document.models.catalog
    }

    /** The agents or categories table of one config/document object. */
    function entityTable(source, kind) {
      if (!isPlainObject(source)) return null
      const table = kind === 'agent' ? source.agents : source.categories
      return isPlainObject(table) ? table : null
    }

    /** One agent/category entry, or null when the source does not carry it. */
    function entityOf(source, kind, name) {
      const table = entityTable(source, kind)
      if (table === null || !isPlainObject(table[name])) return null
      return table[name]
    }

    /**
     * The chain an entity carries, verbatim.
     *
     * Invalid hand-written entries are kept, not filtered: the board renders
     * them as warning chips, and every index the editor uses must address the
     * same array entry the user sees. Filtering here silently shifted indices
     * and made "edit step 2" rewrite a different step (or drop the invalid one
     * on reorder).
     */
    function chainOf(entity) {
      if (!isPlainObject(entity) || !Array.isArray(entity.chain)) return []
      return entity.chain
    }

    /** The legacy single-route fields as one derived step, or null when the entity carries none. */
    function legacyStepOf(entity) {
      if (!isPlainObject(entity)) return null
      const step = {}
      for (const key of LEGACY_ROUTE_KEYS) {
        const value = entity[key]
        if (value === undefined || value === null) continue
        if (typeof value === 'string' && value.trim() === '') continue
        step[key] = value
      }
      return Object.keys(step).length > 0 ? step : null
    }

    /** True when the entity carries a chain or the legacy route fields. */
    function hasRouteOverride(entity) {
      return chainOf(entity).length > 0 || legacyStepOf(entity) !== null
    }

    /** The ordered steps an entity resolves through; a chain wins over the legacy fields. */
    function stepsOf(entity) {
      const chain = chainOf(entity)
      if (chain.length > 0) return chain
      const legacy = legacyStepOf(entity)
      return legacy === null ? [] : [legacy]
    }

    /**
     * Resolve one catalog alias or `provider/model` reference.
     *
     * A catalog key wins over the slash form: an alias may itself contain a slash,
     * and the catalog is the name the user typed.
     */
    function routeFromReference(catalog, reference) {
      const text = textOf(reference)
      if (text === '') return null
      const entry = catalog[text]
      if (isPlainObject(entry)) {
        return {
          alias: text,
          provider: textOf(entry.provider) || null,
          model: textOf(entry.model) || null,
          reasoningEffort: entry.reasoningEffort,
          temperature: entry.temperature,
          maxTokens: entry.maxTokens,
        }
      }
      const slash = text.indexOf('/')
      if (slash > 0 && slash < text.length - 1) {
        return { alias: null, provider: text.slice(0, slash), model: text.slice(slash + 1) }
      }
      return null
    }

    /**
     * Resolve one chain step for display.
     *
     * `status` is `alias` (a catalog reference), `route` (an explicit
     * provider/model), or `invalid` with `warnKey`/`warnVars` naming what is
     * wrong. The resolver never throws: a hand-edited document may carry anything.
     */
    function resolveStep(catalog, step) {
      if (typeof step === 'string') {
        const text = step.trim()
        if (text === '') return { status: 'invalid', label: '', ref: null, provider: null, model: null, warnKey: 'chainWarnEmptyStep' }
        const hit = routeFromReference(catalog, text)
        if (hit === null) {
          return {
            status: 'invalid',
            label: text,
            ref: text,
            provider: null,
            model: null,
            warnKey: 'chainWarnUnknownAlias',
            warnVars: { ref: text },
          }
        }
        return Object.assign({}, hit, {
          status: hit.alias === null ? 'route' : 'alias',
          label: hit.alias === null ? `${hit.provider}/${hit.model}` : hit.alias,
          ref: hit.alias,
          warnKey: null,
        })
      }
      if (!isPlainObject(step)) {
        return { status: 'invalid', label: '', ref: null, provider: null, model: null, warnKey: 'chainWarnEmptyStep' }
      }
      const reference = textOf(step.modelRef)
      const base = reference === '' ? null : routeFromReference(catalog, reference)
      const explicitProvider = textOf(step.provider)
      const explicitModel = textOf(step.model)
      let provider = explicitProvider === '' ? (base === null ? '' : base.provider || '') : explicitProvider
      let model = explicitModel === '' ? (base === null ? '' : base.model || '') : explicitModel
      if (provider === '' && model.indexOf('/') > 0 && model.indexOf('/') < model.length - 1) {
        const slash = model.indexOf('/')
        provider = model.slice(0, slash)
        model = model.slice(slash + 1)
      }
      const resolved = {
        status: 'route',
        ref: reference === '' ? null : reference,
        provider: provider === '' ? null : provider,
        model: model === '' ? null : model,
        reasoningEffort:
          step.reasoningEffort !== undefined && step.reasoningEffort !== null
            ? step.reasoningEffort
            : base === null
              ? undefined
              : base.reasoningEffort,
        temperature:
          step.temperature !== undefined && step.temperature !== null
            ? step.temperature
            : base === null
              ? undefined
              : base.temperature,
        maxTokens:
          step.maxTokens !== undefined && step.maxTokens !== null
            ? step.maxTokens
            : base === null
              ? undefined
              : base.maxTokens,
        warnKey: null,
      }
      const explicitComplete = explicitProvider !== '' && explicitModel !== ''
      if (reference !== '' && base === null && !explicitComplete) {
        resolved.status = 'invalid'
        resolved.warnKey = 'chainWarnUnknownAlias'
        resolved.warnVars = { ref: reference }
      } else if (resolved.provider === null && resolved.model === null) {
        resolved.status = 'invalid'
        resolved.warnKey = 'chainWarnMissingRoute'
      } else if (resolved.provider === null) {
        resolved.status = 'invalid'
        resolved.warnKey = 'chainWarnMissingProvider'
      } else if (resolved.model === null) {
        resolved.status = 'invalid'
        resolved.warnKey = 'chainWarnMissingModel'
      } else if (reference !== '' && explicitProvider === '' && explicitModel === '') {
        resolved.status = 'alias'
      }
      if (resolved.status === 'alias' && reference !== '') resolved.label = reference
      else if (resolved.provider !== null && resolved.model !== null) resolved.label = `${resolved.provider}/${resolved.model}`
      else resolved.label = reference || resolved.provider || resolved.model || ''
      return resolved
    }

    /** `resolveStep` against the effective configuration plus this file's catalog edits. */
    function resolveChainStep(document, config, step) {
      return resolveStep(catalogOf(document, config), step)
    }

    /** Identity of a resolved step, used to flag duplicates inside one chain. */
    function stepIdentity(resolved) {
      if (!resolved) return null
      if (filled(resolved.ref)) return `ref:${resolved.ref}`
      if (resolved.provider !== null || resolved.model !== null) {
        return `route:${resolved.provider === null ? '' : resolved.provider}/${resolved.model === null ? '' : resolved.model}`
      }
      return null
    }

    /** The catalog alias a raw chain step references, if it references one. */
    function stepAlias(step) {
      if (typeof step === 'string') return filled(step) ? step.trim() : null
      if (isPlainObject(step) && filled(step.modelRef)) return step.modelRef.trim()
      return null
    }

    /**
     * Which route an entity shows: the file chain, the file's legacy single
     * route, the inherited route, or nothing.
     */
    function entityRouteState(document, config, kind, name) {
      const fileEntity = entityOf(document, kind, name)
      const effectiveEntity = entityOf(config, kind, name)
      const fileChain = chainOf(fileEntity)
      const fileLegacy = legacyStepOf(fileEntity)
      if (fileChain.length > 0) return { owner: 'file-chain', steps: fileChain, fileEntity, effectiveEntity }
      if (fileLegacy !== null) return { owner: 'file-legacy', steps: [fileLegacy], fileEntity, effectiveEntity }
      const inherited = stepsOf(effectiveEntity)
      return { owner: inherited.length > 0 ? 'inherited' : 'none', steps: inherited, fileEntity, effectiveEntity }
    }

    /**
     * Where an entity's route comes from: this file, another layer, or the
     * built-in default. Compared on the route only, so an inherited
     * `description` does not claim the card as an override.
     */
    function entitySourceOf(document, envelope, kind, name) {
      const config = envelope && isPlainObject(envelope.config) ? envelope.config : {}
      const defaults = envelope && isPlainObject(envelope.defaults) ? envelope.defaults : {}
      if (hasRouteOverride(entityOf(document, kind, name))) return 'file'
      const effective = stepsOf(entityOf(config, kind, name))
      const fallback = stepsOf(entityOf(defaults, kind, name))
      return effective.length > 0 && !sameValue(effective, fallback) ? 'layer' : 'default'
    }

    /** Every name a lane lists: the built-ins first, then custom keys from the file and the layers. */
    function chainEntityNames(document, config, kind) {
      const names = (kind === 'agent' ? BOARD_AGENTS : BOARD_CATEGORIES).slice()
      for (const source of [config, document]) {
        const table = entityTable(source, kind)
        if (table === null) continue
        for (const name of Object.keys(table)) if (!names.includes(name)) names.push(name)
      }
      return names
    }

    /** How many chain steps reference one catalog alias, across every displayed chain. */
    function aliasUsageOf(document, envelope, alias) {
      const config = envelope && isPlainObject(envelope.config) ? envelope.config : {}
      let count = 0
      for (const kind of ['agent', 'category']) {
        for (const name of chainEntityNames(document, config, kind)) {
          const state = entityRouteState(document, config, kind, name)
          for (const step of state.steps) if (stepAlias(step) === alias) count += 1
        }
      }
      return count
    }

    /** Parse one optional numeric editor field. */
    function numberField(text) {
      const value = textOf(text)
      if (value === '') return { ok: true, value: undefined }
      const number = Number(value)
      if (!Number.isFinite(number)) return { ok: false }
      return { ok: true, value: number }
    }

    /** The chain step the step editor describes, or the error that blocks the write. */
    function stepFromEditor(editor) {
      const temperature = numberField(editor.temperature)
      if (temperature.ok === false || (temperature.value !== undefined && (temperature.value < 0 || temperature.value > 2))) {
        return { ok: false, error: { key: 'chainErrTemperature' } }
      }
      const maxTokens = numberField(editor.maxTokens)
      if (maxTokens.ok === false || (maxTokens.value !== undefined && (!Number.isInteger(maxTokens.value) || maxTokens.value <= 0))) {
        return { ok: false, error: { key: 'chainErrMaxTokens' } }
      }
      const optional = {}
      if (filled(editor.effort)) optional.reasoningEffort = textOf(editor.effort)
      if (temperature.value !== undefined) optional.temperature = temperature.value
      if (maxTokens.value !== undefined) optional.maxTokens = maxTokens.value
      if (editor.mode === 'route') {
        let provider = textOf(editor.provider)
        let model = textOf(editor.model)
        if (provider === '' && model.indexOf('/') > 0 && model.indexOf('/') < model.length - 1) {
          const slash = model.indexOf('/')
          provider = model.slice(0, slash)
          model = model.slice(slash + 1)
        }
        if (provider === '') return { ok: false, error: { key: 'chainErrProviderRequired' } }
        if (model === '') return { ok: false, error: { key: 'chainErrModelRequired' } }
        return { ok: true, step: Object.assign({ provider, model }, optional) }
      }
      const alias = textOf(editor.alias)
      if (alias === '') return { ok: false, error: { key: 'chainErrAliasRequired' } }
      if (Object.keys(optional).length === 0) return { ok: true, step: alias }
      return { ok: true, step: Object.assign({ modelRef: alias }, optional) }
    }

    /** The catalog entry the alias editor describes, or the error that blocks the write. */
    function catalogEntryFromEditor(editor) {
      const temperature = numberField(editor.temperature)
      if (temperature.ok === false || (temperature.value !== undefined && (temperature.value < 0 || temperature.value > 2))) {
        return { ok: false, error: { key: 'chainErrTemperature' } }
      }
      const maxTokens = numberField(editor.maxTokens)
      if (maxTokens.ok === false || (maxTokens.value !== undefined && (!Number.isInteger(maxTokens.value) || maxTokens.value <= 0))) {
        return { ok: false, error: { key: 'chainErrMaxTokens' } }
      }
      const provider = textOf(editor.provider)
      if (provider === '') return { ok: false, error: { key: 'modelErrProvider' } }
      const model = textOf(editor.model)
      if (model === '') return { ok: false, error: { key: 'modelErrModel' } }
      const entry = { provider, model }
      if (filled(editor.effort)) entry.reasoningEffort = textOf(editor.effort)
      if (temperature.value !== undefined) entry.temperature = temperature.value
      if (maxTokens.value !== undefined) entry.maxTokens = maxTokens.value
      return { ok: true, entry }
    }

    /**
     * The step editor state seeded from one existing step (or from nothing).
     *
     * Only fields the step itself carries are seeded. A catalog alias supplies
     * provider/model/effort at resolution time, and copying those values into the
     * new step would silently turn an inherited alias into an explicit override.
     *
     * `index` names the chain position being replaced; `append` appends instead,
     * which is how a fallback gets added when no default catalog alias is left.
     */
    function editorFromStep(seed, catalog, extra) {
      const resolved = seed === null || seed === undefined ? null : resolveStep(catalog, seed)
      const raw = isPlainObject(seed) ? seed : {}
      let mode = 'alias'
      if (resolved !== null) {
        if (resolved.status === 'route') mode = 'route'
        else if (resolved.status === 'invalid' && (resolved.provider !== null || resolved.model !== null)) mode = 'route'
      }
      const alias =
        mode === 'alias'
          ? resolved !== null && filled(resolved.ref)
            ? resolved.ref
            : typeof seed === 'string'
              ? seed
              : ''
          : ''
      return {
        kind: 'step',
        ownerKind: extra.ownerKind,
        name: extra.name,
        index: extra.index === undefined ? null : extra.index,
        append: Boolean(extra.append),
        mode,
        alias,
        provider: resolved !== null && filled(resolved.provider) ? resolved.provider : '',
        model: resolved !== null && filled(resolved.model) ? resolved.model : '',
        effort: raw.reasoningEffort !== undefined && raw.reasoningEffort !== null ? String(raw.reasoningEffort) : '',
        temperature: typeof raw.temperature === 'number' ? String(raw.temperature) : '',
        maxTokens: raw.maxTokens !== undefined && raw.maxTokens !== null ? String(raw.maxTokens) : '',
        error: null,
      }
    }

    /** The catalog editor state for one alias (alias null adds a new one). */
    function editorFromModel(alias, entry) {
      const resolved = isPlainObject(entry) ? entry : {}
      return {
        kind: 'model',
        original: alias,
        name: alias === null ? '' : alias,
        provider: textOf(resolved.provider),
        model: textOf(resolved.model),
        effort:
          resolved.reasoningEffort !== undefined && resolved.reasoningEffort !== null ? String(resolved.reasoningEffort) : '',
        temperature: typeof resolved.temperature === 'number' ? String(resolved.temperature) : '',
        maxTokens: resolved.maxTokens !== undefined && resolved.maxTokens !== null ? String(resolved.maxTokens) : '',
        error: null,
      }
    }

    /** The new-category editor state. */
    function editorForNewCategory() {
      return { kind: 'category', name: '', error: null }
    }

    /**
     * The step `Add fallback step` appends: the first catalog alias the chain does
     * not already reference. Null means the editor has to ask for one instead of
     * writing a duplicate or an empty step.
     */
    function defaultFallbackStep(document, config, steps) {
      const catalog = catalogOf(document, config)
      const used = new Set(steps.map(stepAlias).filter((alias) => alias !== null))
      const alias = Object.keys(catalog).find((name) => !used.has(name))
      return alias === undefined ? null : alias
    }

    /**
     * The chain `Add fallback step` writes for one entity, or null when there is
     * no primary route to fall back from or no unused catalog alias to append.
     */
    function fallbackChainFor(document, config, kind, name) {
      const state = entityRouteState(document, config, kind, name)
      if (state.steps.length === 0) return null
      const fallback = defaultFallbackStep(document, config, state.steps)
      if (fallback === null) return null
      return { chain: state.steps.concat([fallback]) }
    }

    /** Provenance tag, using the same wording as every other field on the page. */
    function sourceTag(t, source) {
      const className = source === 'file' ? 'omd-cfg-tag omd-cfg-tag-file' : 'omd-cfg-tag'
      const label = source === 'file' ? t('provenanceFile') : source === 'layer' ? t('provenanceLayer') : t('provenanceDefault')
      return h('span', { className }, label)
    }

    /** One board button; text buttons carry their wording, icon-only ones a title and aria-label. */
    function chainButton(options) {
      return h(
        'button',
        {
          key: options.key,
          type: 'button',
          className: options.className ? options.className : 'omd-cfg-btn omd-chain-btn',
          onClick: options.onClick,
          disabled: Boolean(options.disabled),
          title: options.title,
          'aria-label': options.ariaLabel,
        },
        options.label,
      )
    }

    /** One numbered chain chip: position, role, resolved label, warnings and step actions. */
    function chainChip(t, chip) {
      const className = [
        'omd-chain-chip',
        chip.fallback ? 'omd-chain-chip-fallback' : '',
        chip.warnings.length > 0 ? 'omd-chain-chip-warn' : chip.inherited ? 'omd-chain-chip-inherited' : '',
      ]
        .filter((part) => part !== '')
        .join(' ')
      const children = [
        h(
          'span',
          { key: 'head', className: 'omd-chain-chip-head' },
          h('span', { key: 'index', className: 'omd-chain-index', 'aria-hidden': 'true' }, String(chip.position)),
          h('span', { key: 'role', className: 'omd-chain-role' }, chip.role),
        ),
        h('span', { key: 'label', className: 'omd-chain-label' }, chip.label),
      ]
      if (chip.sub !== '') children.push(h('span', { key: 'sub', className: 'omd-chain-sub' }, chip.sub))
      if (chip.tags.length > 0) {
        children.push(
          h(
            'span',
            { key: 'tags', className: 'omd-chain-chip-tags' },
            chip.tags.map((tag) => h('span', { key: tag, className: 'omd-cfg-tag' }, tag)),
          ),
        )
      }
      for (const [index, warning] of chip.warnings.entries()) {
        children.push(h('span', { key: `warn${index}`, className: 'omd-chain-warn' }, warning))
      }
      if (chip.actions.length > 0) {
        children.push(
          h(
            'span',
            { key: 'actions', className: 'omd-chain-chip-actions' },
            chip.actions.map((action) => chainButton(action)),
          ),
        )
      }
      return h(
        'div',
        {
          key: `chip${chip.position}`,
          className,
          'data-omd-chip': String(chip.position),
          'data-omd-warn': chip.warnings.length > 0 ? 'true' : undefined,
        },
        children,
      )
    }

    /** The horizontal chain: arrow-separated chips, or one terminal chip when nothing resolves. */
    function chainRow(t, chips, ariaLabel) {
      const children = []
      if (chips.length === 0) {
        children.push(
          h(
            'div',
            { key: 'terminal', className: 'omd-chain-chip omd-chain-chip-terminal' },
            h('span', { key: 'role', className: 'omd-chain-role' }, t('chainTerminal')),
            h('span', { key: 'label', className: 'omd-chain-label' }, t('inheritRoute')),
          ),
        )
      } else {
        for (const [index, chip] of chips.entries()) {
          if (index > 0) children.push(h('span', { key: `arrow${index}`, className: 'omd-chain-arrow', 'aria-hidden': 'true' }))
          children.push(chainChip(t, chip))
        }
      }
      return h('div', { key: 'chain', className: 'omd-chain-row', role: 'group', 'aria-label': ariaLabel }, children)
    }

    /** One labelled editor input, with the shared error wiring. */
    function chainEditorField(t, options) {
      const hintId = options.hint ? `${options.id}-hint` : null
      const errorId = options.error ? 'omd-chain-editor-error' : null
      const describedBy = [hintId, errorId].filter((part) => part !== null).join(' ') || undefined
      return h(
        'div',
        { key: options.id, className: 'omd-cfg-field omd-chain-editor-field' },
        h('label', { htmlFor: options.id, className: 'omd-cfg-label' }, options.label),
        h('input', {
          id: options.id,
          type: 'text',
          className: 'omd-cfg-input',
          value: options.value,
          placeholder: options.placeholder,
          inputMode: options.inputMode,
          disabled: Boolean(options.disabled),
          onChange: (event) => options.onChange(event.target.value),
          'aria-invalid': options.error ? 'true' : undefined,
          'aria-describedby': describedBy,
        }),
        options.hint ? h('div', { id: hintId, className: 'omd-cfg-hint' }, options.hint) : null,
      )
    }

    /** The shared editor footer: optional-field hint, error, save/cancel. */
    function chainEditorFrame(t, options) {
      const children = [
        h('div', { key: 'title', className: 'omd-chain-editor-title' }, options.title),
        h('div', { key: 'grid', className: 'omd-chain-editor-grid' }, options.fields),
        h('div', { key: 'hint', className: 'omd-cfg-hint' }, t('editorOptional')),
      ]
      if (options.error) children.push(h('div', { key: 'error', id: 'omd-chain-editor-error', className: 'omd-cfg-err', role: 'alert' }, options.error))
      children.push(
        h(
          'div',
          { key: 'actions', className: 'omd-chain-editor-actions' },
          chainButton({
            key: 'save',
            label: options.saveLabel,
            className: 'omd-cfg-btn omd-cfg-btn-primary omd-chain-btn',
            onClick: options.onSave,
            disabled: Boolean(options.disabled),
          }),
          chainButton({
            key: 'cancel',
            label: t('chainCancel'),
            onClick: options.onCancel,
            disabled: Boolean(options.disabled),
          }),
        ),
      )
      return h('div', { key: 'editor', className: 'omd-chain-editor', role: 'group', 'aria-label': options.title }, children)
    }

    /** The inline step editor: catalog alias or exact route, plus the three optional controls. */
    function chainStepEditor(t, editor, handlers) {
      const errorText = editor.error ? t(editor.error.key, editor.error.vars) : null
      const title =
        editor.index === null || editor.index === undefined
          ? t('editorNewStepTitle', { name: editor.name })
          : t('editorStepTitle', { name: editor.name, position: editor.index + 1 })
      const aliasNames = Object.keys(handlers.catalog)
      const aliasKnown = editor.alias === '' || aliasNames.includes(editor.alias)
      const fields = [
        h(
          'div',
          { key: 'mode', className: 'omd-cfg-field omd-chain-editor-field' },
          h('label', { htmlFor: 'omd-chain-editor-mode', className: 'omd-cfg-label' }, t('editorMode')),
          h(
            'select',
            {
              id: 'omd-chain-editor-mode',
              className: 'omd-cfg-select',
              value: editor.mode,
              disabled: handlers.busy,
              onChange: (event) => handlers.onField('mode', event.target.value),
            },
            h('option', { key: 'alias', value: 'alias' }, t('editorModeAlias')),
            h('option', { key: 'route', value: 'route' }, t('editorModeRoute')),
          ),
        ),
      ]
      if (editor.mode === 'route') {
        fields.push(
          chainEditorField(t, {
            id: 'omd-chain-editor-provider',
            label: t('editorProvider'),
            value: editor.provider,
            disabled: handlers.busy,
            error: Boolean(errorText),
            onChange: (value) => handlers.onField('provider', value),
          }),
          chainEditorField(t, {
            id: 'omd-chain-editor-model',
            label: t('editorModel'),
            value: editor.model,
            placeholder: t('editorModelPlaceholder'),
            disabled: handlers.busy,
            error: Boolean(errorText),
            onChange: (value) => handlers.onField('model', value),
          }),
        )
      } else {
        const options = [h('option', { key: 'empty', value: '' }, t('editorAliasPlaceholder'))]
        for (const alias of aliasNames) options.push(h('option', { key: alias, value: alias }, alias))
        if (!aliasKnown) options.push(h('option', { key: 'unknown', value: editor.alias }, editor.alias))
        const entry = aliasKnown && isPlainObject(handlers.catalog[editor.alias]) ? handlers.catalog[editor.alias] : null
        const hint = entry
          ? t('editorAliasResolved', { route: [textOf(entry.provider), textOf(entry.model)].filter((part) => part !== '').join(' / ') })
          : !aliasKnown
            ? t('editorAliasUnknown')
            : aliasNames.length === 0
              ? t('chainNoCatalog')
              : ''
        fields.push(
          h(
            'div',
            { key: 'alias', className: 'omd-cfg-field omd-chain-editor-field' },
            h('label', { htmlFor: 'omd-chain-editor-alias', className: 'omd-cfg-label' }, t('editorAlias')),
            h(
              'select',
              {
                id: 'omd-chain-editor-alias',
                className: 'omd-cfg-select',
                value: editor.alias,
                disabled: handlers.busy,
                onChange: (event) => handlers.onField('alias', event.target.value),
                'aria-invalid': errorText ? 'true' : undefined,
                'aria-describedby': hint === '' ? undefined : 'omd-chain-editor-alias-hint',
              },
              options,
            ),
            hint === '' ? null : h('div', { id: 'omd-chain-editor-alias-hint', className: 'omd-cfg-hint' }, hint),
          ),
        )
      }
      fields.push(
        chainEditorField(t, {
          id: 'omd-chain-editor-effort',
          label: t('editorEffort'),
          value: editor.effort,
          placeholder: t('editorEffortPlaceholder'),
          disabled: handlers.busy,
          onChange: (value) => handlers.onField('effort', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-temperature',
          label: t('editorTemperature'),
          value: editor.temperature,
          inputMode: 'decimal',
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('temperature', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-max-tokens',
          label: t('editorMaxTokens'),
          value: editor.maxTokens,
          inputMode: 'numeric',
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('maxTokens', value),
        }),
      )
      return chainEditorFrame(t, {
        title,
        fields,
        error: errorText,
        saveLabel: t('chainSave'),
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        disabled: handlers.busy,
      })
    }

    /** The alias editor used by the Models lane. */
    function chainModelEditor(t, editor, handlers) {
      const errorText = editor.error ? t(editor.error.key, editor.error.vars) : null
      const title = editor.original === null ? t('modelNewTitle') : t('modelEditTitle', { alias: editor.original })
      const fields = [
        chainEditorField(t, {
          id: 'omd-chain-editor-name',
          label: t('modelAlias'),
          value: editor.name,
          placeholder: t('modelAliasPlaceholder'),
          disabled: handlers.busy || editor.original !== null,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('name', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-provider',
          label: t('editorProvider'),
          value: editor.provider,
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('provider', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-model',
          label: t('editorModel'),
          value: editor.model,
          placeholder: t('editorModelPlaceholder'),
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('model', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-effort',
          label: t('editorEffort'),
          value: editor.effort,
          placeholder: t('editorEffortPlaceholder'),
          disabled: handlers.busy,
          onChange: (value) => handlers.onField('effort', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-temperature',
          label: t('editorTemperature'),
          value: editor.temperature,
          inputMode: 'decimal',
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('temperature', value),
        }),
        chainEditorField(t, {
          id: 'omd-chain-editor-max-tokens',
          label: t('editorMaxTokens'),
          value: editor.maxTokens,
          inputMode: 'numeric',
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('maxTokens', value),
        }),
      ]
      return chainEditorFrame(t, {
        title,
        fields,
        error: errorText,
        saveLabel: t('modelSave'),
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        disabled: handlers.busy,
      })
    }

    /** The new-category editor used by the Categories lane. */
    function chainCategoryEditor(t, editor, handlers) {
      const errorText = editor.error ? t(editor.error.key, editor.error.vars) : null
      const fields = [
        chainEditorField(t, {
          id: 'omd-chain-editor-name',
          label: t('categoryName'),
          value: editor.name,
          placeholder: t('categoryNamePlaceholder'),
          disabled: handlers.busy,
          error: Boolean(errorText),
          onChange: (value) => handlers.onField('name', value),
        }),
      ]
      return chainEditorFrame(t, {
        title: t('categoryAddTitle'),
        fields,
        error: errorText,
        saveLabel: t('categorySave'),
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        disabled: handlers.busy,
      })
    }

    /** One agent/category card: provenance, chain row, warnings, and the inline editor. */
    function chainCardNode(t, card, handlers) {
      const className = ['omd-chain-card', card.disabled ? 'omd-chain-card-disabled' : ''].filter((part) => part !== '').join(' ')
      const tags = [sourceTag(t, card.source)]
      if (card.custom) tags.push(h('span', { key: 'custom', className: 'omd-cfg-tag' }, t('chainCustomTag')))
      if (card.legacy) tags.push(h('span', { key: 'legacy', className: 'omd-cfg-tag' }, t('chainLegacyTag')))
      if (card.disabled) {
        tags.push(h('span', { key: 'disabled', className: 'omd-cfg-tag omd-cfg-tag-warn' }, t('chainDisabledTag')))
      }
      const notes = []
      if (card.disabled) notes.push(h('div', { key: 'disabled', className: 'omd-cfg-hint omd-cfg-hint-warn' }, t('chainDisabledNote')))
      if (card.legacyIgnored) {
        notes.push(h('div', { key: 'legacyIgnored', className: 'omd-cfg-hint omd-cfg-hint-warn' }, t('chainLegacyIgnored')))
      }
      if (card.owner === 'none') notes.push(h('div', { key: 'empty', className: 'omd-cfg-hint' }, t('chainEmptyNote')))
      return h(
        'div',
        {
          key: `card:${card.kind}:${card.name}`,
          className,
          'data-omd-entity': `${card.kind}:${card.name}`,
          'data-omd-kind': card.kind,
          'data-omd-source': card.source,
        },
        [
          h(
            'div',
            { key: 'head', className: 'omd-chain-card-head' },
            h('div', { key: 'name', className: 'omd-chain-card-name' }, h('span', { key: 'text', className: 'omd-chain-name' }, card.name), ...tags),
            card.actions.length === 0
              ? null
              : h('div', { key: 'actions', className: 'omd-chain-actions' }, card.actions.map((action) => chainButton(action))),
          ),
          chainRow(t, card.chips, t('chainOf', { name: card.name })),
          ...notes,
          card.editor ? chainStepEditor(t, card.editor, handlers) : null,
        ],
      )
    }

    /** One catalog alias card: alias to route, its tags, its usage count, and the alias editor. */
    function chainModelCardNode(t, card, handlers) {
      const entry = isPlainObject(card.entry) ? card.entry : {}
      const tags = []
      if (filled(entry.reasoningEffort)) tags.push(t('chainEffortTag', { value: textOf(entry.reasoningEffort) }))
      if (typeof entry.temperature === 'number') tags.push(t('chainTemperatureTag', { value: entry.temperature }))
      if (entry.maxTokens !== undefined && entry.maxTokens !== null) tags.push(t('chainMaxTokensTag', { value: entry.maxTokens }))
      const deleteTitle =
        card.usedBy > 0
          ? t('modelDeleteBlocked', { count: card.usedBy })
          : card.source === 'layer'
            ? t('modelDeleteInherited')
            : t('modelDeleteTitle', { alias: card.alias })
      const actions = [
        {
          key: 'edit',
          label: t('modelEdit'),
          title: t('modelEditTitle', { alias: card.alias }),
          onClick: () => handlers.onEditModel(card.alias),
          disabled: handlers.busy,
        },
        {
          key: 'delete',
          label: t('modelDelete'),
          title: deleteTitle,
          ariaLabel: t('modelDelete'),
          onClick: () => handlers.onDeleteModel(card.alias),
          disabled: handlers.busy || card.usedBy > 0 || card.source === 'layer',
        },
      ]
      const notes = []
      if (card.usedBy > 0) notes.push(h('div', { key: 'inUse', className: 'omd-cfg-hint omd-cfg-hint-warn' }, t('chainModelInUse', { count: card.usedBy })))
      if (card.source === 'layer') notes.push(h('div', { key: 'inherited', className: 'omd-cfg-hint' }, t('modelInheritedNote')))
      return h(
        'div',
        {
          key: `model:${card.alias}`,
          className: 'omd-chain-card omd-chain-model-card',
          'data-omd-alias': card.alias,
          'data-omd-kind': 'model',
          'data-omd-source': card.source,
        },
        [
          h(
            'div',
            { key: 'head', className: 'omd-chain-card-head' },
            h('div', { key: 'name', className: 'omd-chain-card-name' }, h('span', { key: 'text', className: 'omd-chain-name' }, card.alias), sourceTag(t, card.source)),
            h('div', { key: 'actions', className: 'omd-chain-actions' }, actions.map((action) => chainButton(action))),
          ),
          h(
            'div',
            { key: 'route', className: 'omd-chain-model-row' },
            h('span', { key: 'arrow', className: 'omd-chain-arrow', 'aria-hidden': 'true' }),
            h(
              'span',
              { key: 'route-text', className: 'omd-chain-sub' },
              [textOf(entry.provider), textOf(entry.model)].filter((part) => part !== '').join(' / ') || t('chainNoRoute'),
            ),
            ...tags.map((tag) => h('span', { key: tag, className: 'omd-cfg-tag' }, tag)),
            h('span', { key: 'used', className: 'omd-cfg-tag' }, t('chainUsedBy', { count: card.usedBy })),
          ),
          ...notes,
          card.editor ? chainModelEditor(t, card.editor, handlers) : null,
        ],
      )
    }

    /** One lane of the board: title, hint, lane action, and its cards. */
    function chainLaneNode(t, lane) {
      return h('section', { key: lane.id, className: 'omd-chain-lane', 'aria-label': lane.title }, [
        h(
          'div',
          { key: 'head', className: 'omd-chain-lane-head' },
          h('h4', { key: 'title', className: 'omd-chain-lane-title' }, lane.title),
          lane.hint === '' ? null : h('span', { key: 'hint', className: 'omd-cfg-hint' }, lane.hint),
          lane.action ? chainButton(lane.action) : null,
        ),
        lane.cards.length === 0
          ? h('div', { key: 'empty', className: 'omd-cfg-hint' }, lane.emptyText)
          : h('div', { key: 'cards', className: 'omd-chain-cards' }, lane.cards),
      ])
    }

    // Settings page: the section

    /**
     * The OMD configuration section.
     *
     * Hooks are fixed (one `useState`, one `useRef`, one `useEffect`) so a slot
     * re-render can never change their order; every Host call happens in an
     * event handler or the one effect. Everything else is derived during render,
     * which is why the dirty count, the inline errors, and the provenance tags
     * can never disagree with the form: they are one computation, not four
     * pieces of state kept in sync by hand.
     */
    function OmdConfigSection(props) {
      const t = makeTranslate(props)
      const controller = props && props.controller ? props.controller : null
      const [view, setView] = React.useState({
        phase: 'idle',
        busy: false,
        envelope: null,
        form: null,
        initial: null,
        unstaged: [],
        message: null,
        confirmReload: false,
        serverErrors: {},
        // The one open inline editor (a chain step, a catalog alias, or a new
        // category). It lives in the existing view state on purpose: the hook
        // order is fixed, and stale editor state is dropped with every reload.
        editor: null,
      })
      const started = React.useRef(false)

      const update = (patch) => setView((previous) => Object.assign({}, previous, patch))
      const run = async (line) => (controller ? controller.run(line) : { error: { kind: 'bridge', message: null } })

      const describeError = (error) => {
        if (!error) return t('protocolError')
        if (error.kind === 'no-session') return null
        if (error.kind === 'bridge') return t('bridgeMissing')
        if (error.kind === 'unauthenticated') return t('unauthenticated', { message: error.message })
        if (error.kind === 'no-command') return t('noCommand')
        if (error.kind === 'command') return t('failed', { message: error.message })
        return t('protocolError')
      }

      /** State patch that replaces the whole editable view with one envelope. */
      const applyEnvelope = (envelope) => {
        const form = formFrom(envelope)
        return { envelope, form, initial: form, unstaged: [], serverErrors: {}, editor: null }
      }

      const load = async () => {
        update({ phase: 'loading', busy: true, message: null, confirmReload: false })
        let outcome
        try {
          outcome = await run(`/${CONFIG_COMMAND}`)
        } catch (error) {
          update({
            phase: 'error',
            busy: false,
            message: { kind: 'error', text: t('failed', { message: String(error && error.message ? error.message : error) }) },
          })
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
        update(
          Object.assign(
            {
              phase: 'ready',
              busy: false,
              message: { kind: 'info', text: t('statusLoaded', { file: envelope.file }) },
            },
            applyEnvelope(envelope),
          ),
        )
      }

      // Derived state for this render. `requestFor` is the same function the save
      // handler uses, so "dirty" and "what will be written" cannot drift.
      const envelope = view.envelope
      const form = view.form
      // A Host from before this page version answers no `defaults`: it can read
      // and write values, but it cannot delete a key, so a removal is reported as
      // blocked rather than sent as a line that Host would reject as an unknown
      // key. The discriminator is the same one that hides the reset action.
      const supportsUnset = Boolean(envelope && envelope.defaults)
      const validation = form
        ? validateForm(form, t, envelope)
        : { values: {}, errors: {}, advancedValue: null, advancedError: null }
      const built =
        form && envelope && view.initial
          ? requestFor(envelope, form, validation, view.unstaged, view.initial, supportsUnset)
          : { patch: {}, unset: [], blocked: [], count: 0 }
      const clientErrors = Object.keys(validation.errors).length
      const advancedError = validation.advancedError
      const blockedRemovals = built.blocked
      const emptyFields = emptiedInherited(envelope, form)
      const emptyHints = new Map(emptyFields.map((item) => [item.key, t('emptyInherited', { value: item.value })]))
      const dirty = built.count > 0
      const readOnly = Boolean(envelope && envelope.parse && envelope.parse.ok === false)
      const saving = view.busy

      const serverErrorsFor = (message) => {
        const out = {}
        for (const field of FIELDS) {
          const key = pathKey(field.path)
          if (message === key || message.startsWith(`${key} `) || message.startsWith(`${key}.`)) {
            out[key] = message
            return out
          }
        }
        if (/^(agents|categories|models)(\.| )/.test(message)) out[ADVANCED_KEY] = message
        return out
      }

      const save = async () => {
        if (!form || !envelope || saving) return
        if (clientErrors > 0 || advancedError) {
          update({ message: { kind: 'error', text: t('saveBlocked') }, confirmReload: false })
          return
        }
        if (blockedRemovals.length > 0) {
          update({ message: { kind: 'error', text: t('removalNeedsRestart', { keys: blockedRemovals.map((path) => path.join('.')).join(', ') }) }, confirmReload: false })
          return
        }
        if (!dirty) {
          update({ message: { kind: 'info', text: t('noChanges') }, confirmReload: false })
          return
        }
        const line =
          built.unset.length > 0
            ? `/${CONFIG_COMMAND} set ${JSON.stringify({ patch: built.patch, unset: built.unset })}`
            : `/${CONFIG_COMMAND} set ${JSON.stringify(built.patch)}`
        update({ busy: true, message: null, confirmReload: false })
        let outcome
        try {
          outcome = await run(line)
        } catch (error) {
          update({
            busy: false,
            message: { kind: 'error', text: t('failed', { message: String(error && error.message ? error.message : error) }) },
          })
          return
        }
        if (outcome.error) {
          const text = describeError(outcome.error)
          const serverErrors = serverErrorsFor(String(outcome.error.message || ''))
          update({
            busy: false,
            message: { kind: 'error', text: text === null ? t('noCommand') : text },
            serverErrors,
          })
          return
        }
        const next = outcome.envelope
        if (!next || next.protocol !== CONFIG_PROTOCOL) {
          update({ busy: false, message: { kind: 'error', text: t('protocolError') } })
          return
        }
        const keys = [...dottedPaths(built.patch), ...built.unset.map((path) => path.join('.'))].join(', ')
        update(
          Object.assign(
            {
              phase: 'ready',
              busy: false,
              message: { kind: 'info', text: t('statusSaved', { keys, file: next.file }) },
            },
            applyEnvelope(next),
          ),
        )
      }

      const discard = () => {
        if (!envelope) return
        update(Object.assign({ message: { kind: 'info', text: t('discardDone') }, confirmReload: false }, applyEnvelope(envelope)))
      }

      const reload = () => {
        if (saving) return
        if (dirty && !view.confirmReload) {
          update({ confirmReload: true })
          return
        }
        void load()
      }

      const setFieldValue = (key, value) => {
        setView((previous) => {
          if (!previous.form) return previous
          const nextForm = Object.assign({}, previous.form, { [key]: value })
          return Object.assign({}, previous, {
            form: nextForm,
            unstaged: previous.unstaged.filter((item) => item !== key),
            serverErrors: Object.keys(previous.serverErrors).some((name) => name === key) ? {} : previous.serverErrors,
            message: null,
            confirmReload: false,
          })
        })
      }

      const resetField = (field) => {
        const key = pathKey(field.path)
        setView((previous) => {
          if (!previous.form || !previous.envelope) return previous
          const staged = previous.unstaged.includes(key)
          const nextForm = Object.assign({}, previous.form)
          // Undoing a removal restores the value the file currently provides;
          // staging one leaves the visible number alone until the save lands.
          if (staged) nextForm[key] = fieldText(field, getIn(previous.envelope.config, field.path))
          return Object.assign({}, previous, {
            form: nextForm,
            unstaged: staged ? previous.unstaged.filter((item) => item !== key) : previous.unstaged.concat(key),
            serverErrors: {},
            message: null,
            confirmReload: false,
          })
        })
      }

      const copySnippet = async (text) => {
        try {
          if (globalThis.navigator && globalThis.navigator.clipboard && globalThis.navigator.clipboard.writeText) {
            await globalThis.navigator.clipboard.writeText(text)
            update({ message: { kind: 'info', text: t('copied') } })
            return
          }
        } catch {
          // fall through to the manual-selection message
        }
        update({ message: { kind: 'error', text: t('copyFailed') } })
      }

      // Model-chain board actions.
      //
      // Every edit below stages the JSON document through `setFieldValue`, which
      // is the one path that updates the dirty count, clears a server error, and
      // runs the JSON validation. Nothing writes half-valid JSON: an editor value
      // that fails `stepFromEditor` sets an inline error and leaves the document
      // exactly as it was.

      const closeEditor = () => setView((previous) => (previous.editor === null ? previous : Object.assign({}, previous, { editor: null })))

      const updateEditor = (patch) =>
        setView((previous) =>
          previous.editor === null
            ? previous
            : Object.assign({}, previous, { editor: Object.assign({}, previous.editor, patch) }),
        )

      const openEditor = (editor) => setView((previous) => Object.assign({}, previous, { editor }))

      const boardConfig = () => (envelope && isPlainObject(envelope.config) ? envelope.config : {})

      /**
       * Apply one edit to a clone of the parsed document and stage the text.
       *
       * Cloning first is what keeps a rejected save from leaving the state
       * pointing at a mutated document; `mutate` may return false to skip.
       */
      const writeDocument = (mutate) => {
        if (!view.form) return
        const document = chainDocument(view.form)
        if (document === null) return
        const next = cloneJson(document)
        if (mutate(next) === false) return
        setFieldValue(ADVANCED_KEY, JSON.stringify(next, null, 2))
      }

      /** Open the step editor: an existing step by index, or a new one seeded from the effective route. */
      const openStepEditor = (ownerKind, name, index) => {
        const document = chainDocument(form)
        if (document === null) return
        const config = boardConfig()
        const state = entityRouteState(document, config, ownerKind, name)
        const seed =
          index === null || index === undefined ? (state.steps.length > 0 ? state.steps[0] : null) : state.steps[index]
        openEditor(editorFromStep(seed === undefined ? null : seed, catalogOf(document, config), { ownerKind, name, index }))
      }

      /** `Add fallback step`: write the primary sequence plus one unused catalog alias. */
      const addFallbackStep = (ownerKind, name) => {
        const document = chainDocument(form)
        if (document === null) return
        const config = boardConfig()
        const planned = fallbackChainFor(document, config, ownerKind, name)
        if (planned === null) {
          openEditor(editorFromStep(null, catalogOf(document, config), { ownerKind, name, index: null, append: true }))
          return
        }
        writeDocument((next) => {
          const table = ownerKind === 'agent' ? next.agents : next.categories
          if (!isPlainObject(table[name])) table[name] = {}
          table[name].chain = planned.chain
        })
      }

      const removeChainStep = (ownerKind, name, index) => {
        writeDocument((next) => {
          const table = ownerKind === 'agent' ? next.agents : next.categories
          const entity = table[name]
          if (!isPlainObject(entity)) return false
          const chain = chainOf(entity).slice()
          if (index < 0 || index >= chain.length) return false
          chain.splice(index, 1)
          if (chain.length === 0) delete entity.chain
          else entity.chain = chain
        })
      }

      const moveChainStep = (ownerKind, name, index, delta) => {
        writeDocument((next) => {
          const table = ownerKind === 'agent' ? next.agents : next.categories
          const entity = table[name]
          if (!isPlainObject(entity)) return false
          const chain = chainOf(entity).slice()
          const target = index + delta
          if (index < 0 || index >= chain.length || target < 0 || target >= chain.length) return false
          const moved = chain.splice(index, 1)[0]
          chain.splice(target, 0, moved)
          entity.chain = chain
        })
      }

      const saveChainEditor = () => {
        const editor = view.editor
        if (!editor || editor.kind !== 'step') return
        if (chainDocument(form) === null) return
        const built = stepFromEditor(editor)
        if (built.ok === false) {
          updateEditor({ error: built.error })
          return
        }
        const index = editor.index
        writeDocument((next) => {
          const table = editor.ownerKind === 'agent' ? next.agents : next.categories
          if (!isPlainObject(table[editor.name])) table[editor.name] = {}
          const entity = table[editor.name]
          const chain = chainOf(entity).slice()
          if (index !== null && index !== undefined && index < chain.length) chain[index] = built.step
          else if (editor.append || chain.length === 0) chain.push(built.step)
          else chain[0] = built.step
          entity.chain = chain
        })
        closeEditor()
      }

      const saveModelEditor = () => {
        const editor = view.editor
        if (!editor || editor.kind !== 'model') return
        const document = chainDocument(form)
        if (document === null) return
        const alias = textOf(editor.name)
        if (alias === '') {
          updateEditor({ error: { key: 'modelErrAliasRequired' } })
          return
        }
        if (editor.original === null && catalogOf(document, boardConfig())[alias] !== undefined) {
          updateEditor({ error: { key: 'modelErrAliasExists', vars: { alias } } })
          return
        }
        const built = catalogEntryFromEditor(editor)
        if (built.ok === false) {
          updateEditor({ error: built.error })
          return
        }
        writeDocument((next) => {
          if (!isPlainObject(next.models)) next.models = {}
          if (!isPlainObject(next.models.catalog)) next.models.catalog = {}
          next.models.catalog[alias] = built.entry
        })
        closeEditor()
      }

      const saveNewCategory = () => {
        const editor = view.editor
        if (!editor || editor.kind !== 'category') return
        const document = chainDocument(form)
        if (document === null) return
        const name = textOf(editor.name)
        if (name === '') {
          updateEditor({ error: { key: 'chainErrCategoryRequired' } })
          return
        }
        if (chainEntityNames(document, boardConfig(), 'category').includes(name)) {
          updateEditor({ error: { key: 'chainErrCategoryExists', vars: { name } } })
          return
        }
        writeDocument((next) => {
          if (!isPlainObject(next.categories)) next.categories = {}
          if (!isPlainObject(next.categories[name])) next.categories[name] = {}
        })
        closeEditor()
      }

      const deleteModelAlias = (alias) => {
        writeDocument((next) => {
          if (!isPlainObject(next.models) || !isPlainObject(next.models.catalog) || next.models.catalog[alias] === undefined) return false
          delete next.models.catalog[alias]
        })
      }

      const openModelEditor = (alias) => {
        const document = chainDocument(form)
        if (document === null) return
        const chosen = alias === null || alias === undefined ? null : alias
        const catalog = catalogOf(document, boardConfig())
        openEditor(editorFromModel(chosen, chosen === null ? null : catalog[chosen]))
      }

      const dispatchEditorSave = () => {
        const editor = view.editor
        if (!editor) return
        if (editor.kind === 'step') saveChainEditor()
        else if (editor.kind === 'model') saveModelEditor()
        else saveNewCategory()
      }

      React.useEffect(() => {
        if (started.current || !controller) return
        started.current = true
        void load()
      })

      const shell = (children) =>
        h('div', { className: 'omd-cfg', 'aria-busy': saving ? 'true' : undefined }, [h('style', { key: 'css' }, PAGE_CSS), ...children])

      if (view.phase === 'no-session' || view.phase === 'no-command') {
        return shell([
          h('div', { key: 'title', className: 'omd-cfg-title' }, t('title')),
          configNotice('warn', view.phase === 'no-session' ? t('noSessionTitle') : t('noCommandTitle'), 'phase'),
          h('div', { key: 'body', className: 'omd-cfg-hint' }, view.phase === 'no-session' ? t('noSessionBody') : t('noCommandBody')),
          h('div', { key: 'actions', className: 'omd-cfg-bar omd-cfg-bar-plain' }, configButton(t('retry'), () => void load(), 'plain', saving)),
        ])
      }

      if (view.phase === 'idle' || view.phase === 'loading') {
        return shell([
          h('div', { key: 'title', className: 'omd-cfg-title' }, t('title')),
          h('div', { key: 'loading', className: 'omd-cfg-meta' }, t('loading')),
        ])
      }

      if (view.phase === 'error') {
        return shell([
          h('div', { key: 'title', className: 'omd-cfg-title' }, t('title')),
          view.message ? configNotice(view.message.kind, view.message.text, 'message') : null,
          h(
            'div',
            { key: 'actions', className: 'omd-cfg-bar omd-cfg-bar-plain' },
            configButton(t('retry'), () => void load(), 'plain', saving),
          ),
        ])
      }

      if (view.phase === 'ready') {
        const plugins = envelope && envelope.plugin ? envelope.plugin : null
        const layers = envelope && Array.isArray(envelope.layers) ? envelope.layers : []
        const sources = envelope && Array.isArray(envelope.sources) ? envelope.sources : []
        const diagnostics = envelope && Array.isArray(envelope.diagnostics) ? envelope.diagnostics : []
        const schemaProblems = envelope && Array.isArray(envelope.schemaProblems) ? envelope.schemaProblems : []
        const reserved = reservedIn(envelope)
        // The JSON textarea stays mounted inside its disclosure: it is the write
        // format, so collapsing the disclosure must never drop the control from
        // the tree (and the hand-edited text must survive a toggle).
        const advancedNode = h(
          'div',
          { key: ADVANCED_KEY, className: 'omd-cfg-field' },
          h(
            'div',
            { className: 'omd-cfg-row' },
            h('label', { htmlFor: 'omd-cfg-advanced', className: 'omd-cfg-label' }, t('advanced')),
          ),
          h('textarea', {
            id: 'omd-cfg-advanced',
            className: 'omd-cfg-textarea omd-cfg-textarea-lg',
            value: form ? form[ADVANCED_KEY] : '',
            spellCheck: false,
            disabled: Boolean(readOnly || saving),
            onChange: (event) => {
              setFieldValue(ADVANCED_KEY, event.target.value)
              // A hand edit invalidates the indices an open step editor points at.
              closeEditor()
            },
            'aria-invalid': advancedError ? 'true' : undefined,
            'aria-describedby': advancedError ? 'omd-cfg-advanced-hint omd-cfg-advanced-error' : 'omd-cfg-advanced-hint',
          }),
          h('div', { id: 'omd-cfg-advanced-hint', className: 'omd-cfg-hint' }, t('advancedHint')),
          advancedError ? h('div', { id: 'omd-cfg-advanced-error', className: 'omd-cfg-err', role: 'alert' }, advancedError) : null,
        )

        // The chain board. It renders only when the JSON document is editable, so
        // the graph can never stage something the JSON validation would refuse.
        const boardDocument = chainDocument(form)
        const boardConfigValue = envelope && isPlainObject(envelope.config) ? envelope.config : {}
        const boardBusy = Boolean(saving || readOnly)
        const boardHandlers = {
          busy: boardBusy,
          catalog: boardDocument === null ? {} : catalogOf(boardDocument, boardConfigValue),
          onField: (field, value) => updateEditor({ [field]: value, error: null }),
          onSave: dispatchEditorSave,
          onCancel: closeEditor,
          onEditModel: openModelEditor,
          onDeleteModel: deleteModelAlias,
          onAddCategory: () => openEditor(editorForNewCategory()),
          onAddModel: () => openModelEditor(null),
        }
        const stepEditorFor = (kind, name) => {
          const editor = view.editor
          return editor && editor.kind === 'step' && editor.ownerKind === kind && editor.name === name ? editor : null
        }

        const buildChips = (kind, name, state) => {
          const resolved = state.steps.map((step) => resolveChainStep(boardDocument, boardConfigValue, step))
          const counts = {}
          for (const item of resolved) {
            const identity = stepIdentity(item)
            if (identity !== null) counts[identity] = (counts[identity] || 0) + 1
          }
          const fileCatalog = boardDocument === null ? {} : fileCatalogOf(boardDocument)
          const editable = state.owner === 'file-chain'
          return resolved.map((item, index) => {
            const identity = stepIdentity(item)
            const position = index + 1
            const warnings = []
            if (item.warnKey) warnings.push(t(item.warnKey, item.warnVars))
            if (identity !== null && counts[identity] > 1) warnings.push(t('chainWarnDuplicate'))
            const actions = editable
              ? [
                  {
                    key: 'edit',
                    label: t('chainEdit'),
                    title: t('chainEditTitle', { name, position }),
                    onClick: () => openStepEditor(kind, name, index),
                    disabled: boardBusy,
                  },
                  {
                    key: 'up',
                    label: '\u2191',
                    ariaLabel: t('chainMoveUp'),
                    title: t('chainMoveUpTitle', { name, position }),
                    onClick: () => moveChainStep(kind, name, index, -1),
                    disabled: boardBusy || index === 0,
                  },
                  {
                    key: 'down',
                    label: '\u2193',
                    ariaLabel: t('chainMoveDown'),
                    title: t('chainMoveDownTitle', { name, position }),
                    onClick: () => moveChainStep(kind, name, index, 1),
                    disabled: boardBusy || index === resolved.length - 1,
                  },
                  {
                    key: 'remove',
                    label: '\u2715',
                    ariaLabel: t('chainRemove'),
                    title: t('chainRemoveTitle', { name, position }),
                    onClick: () => removeChainStep(kind, name, index),
                    disabled: boardBusy,
                  },
                ]
              : []
            return {
              position,
              fallback: index > 0,
              role: index === 0 ? t('stepPrimary') : t('stepFallback', { n: index }),
              label: item.label === '' ? t('chainNoRoute') : item.label,
              sub:
                item.status === 'alias'
                  ? [item.provider, item.model].filter((part) => part !== null && part !== '').join(' / ')
                  : '',
              tags:
                item.status === 'alias' && item.ref !== null && fileCatalog[item.ref] === undefined
                  ? [t('provenanceLayer')]
                  : [],
              warnings,
              inherited: state.owner === 'inherited',
              actions,
            }
          })
        }

        const buildEntityCard = (kind, name) => {
          const state = entityRouteState(boardDocument, boardConfigValue, kind, name)
          const actions = []
          if (state.owner === 'none') {
            actions.push({
              key: 'add',
              label: t('chainAdd'),
              title: t('chainAddTitle', { name }),
              onClick: () => openStepEditor(kind, name, null),
              disabled: boardBusy,
            })
          }
          if (state.owner === 'inherited') {
            actions.push({
              key: 'override',
              label: t('chainOverride'),
              title: t('chainOverrideTitle', { name }),
              onClick: () => openStepEditor(kind, name, null),
              disabled: boardBusy,
            })
          }
          if (state.owner === 'file-legacy') {
            actions.push({
              key: 'edit-route',
              label: t('chainEditRoute'),
              title: t('chainEditRouteTitle', { name }),
              onClick: () => openStepEditor(kind, name, null),
              disabled: boardBusy,
            })
          }
          if (state.owner !== 'none') {
            actions.push({
              key: 'fallback',
              label: t('chainAddFallback'),
              title: t('chainAddFallbackTitle', { name }),
              onClick: () => addFallbackStep(kind, name),
              disabled: boardBusy,
            })
          }
          const fileEntity = state.fileEntity
          const effectiveEntity = state.effectiveEntity
          const disabled =
            kind === 'category' &&
            ((isPlainObject(fileEntity) && fileEntity.disabled === true) ||
              (isPlainObject(effectiveEntity) && effectiveEntity.disabled === true))
          return {
            kind,
            name,
            source: entitySourceOf(boardDocument, envelope, kind, name),
            owner: state.owner,
            chips: buildChips(kind, name, state),
            actions,
            editor: stepEditorFor(kind, name),
            custom: !(kind === 'agent' ? BOARD_AGENTS : BOARD_CATEGORIES).includes(name),
            disabled,
            legacy: state.owner === 'file-legacy',
            legacyIgnored: state.owner === 'file-chain' && legacyStepOf(fileEntity) !== null,
          }
        }

        const modelCardsOf = () => {
          const fileCatalog = fileCatalogOf(boardDocument)
          return Object.keys(boardHandlers.catalog).map((alias) => ({
            alias,
            entry: boardHandlers.catalog[alias],
            source: fileCatalog[alias] === undefined ? 'layer' : 'file',
            usedBy: aliasUsageOf(boardDocument, envelope, alias),
            editor:
              view.editor && view.editor.kind === 'model' && view.editor.original === alias ? view.editor : null,
          }))
        }

        let chainCount = 0
        if (boardDocument !== null) {
          for (const kind of ['agent', 'category']) {
            for (const name of chainEntityNames(boardDocument, boardConfigValue, kind)) {
              if (hasRouteOverride(entityOf(boardDocument, kind, name))) chainCount += 1
            }
          }
        }

        let boardNode
        if (readOnly) {
          boardNode = configNotice('warn', t('chainReadOnly'), 'board-readonly')
        } else if (boardDocument === null) {
          boardNode = h(
            'div',
            { key: 'board-broken', className: 'omd-cfg-notice omd-cfg-notice-error', role: 'alert' },
            t('chainJsonBroken'),
          )
        } else {
          const agentCards = chainEntityNames(boardDocument, boardConfigValue, 'agent').map((name) =>
            chainCardNode(t, buildEntityCard('agent', name), boardHandlers),
          )
          const categoryCards = chainEntityNames(boardDocument, boardConfigValue, 'category').map((name) =>
            chainCardNode(t, buildEntityCard('category', name), boardHandlers),
          )
          if (view.editor && view.editor.kind === 'category') {
            categoryCards.push(chainCategoryEditor(t, view.editor, boardHandlers))
          }
          const modelCards = modelCardsOf().map((card) => chainModelCardNode(t, card, boardHandlers))
          if (view.editor && view.editor.kind === 'model' && view.editor.original === null) {
            modelCards.push(chainModelEditor(t, view.editor, boardHandlers))
          }
          boardNode = h('div', { key: 'board', className: 'omd-chain-board', role: 'region', 'aria-label': t('boardAria') }, [
            h('div', { key: 'head', className: 'omd-chain-board-head' }, [
              h('div', { key: 'title', className: 'omd-chain-board-title' }, t('boardTitle')),
              h(
                'span',
                { key: 'counts', className: 'omd-cfg-hint' },
                t('boardCounts', { chains: chainCount, aliases: Object.keys(fileCatalogOf(boardDocument)).length }),
              ),
            ]),
            h('div', { key: 'hint', className: 'omd-cfg-hint' }, t('boardHint')),
            h('div', { key: 'override-note', className: 'omd-cfg-hint' }, t('boardOverrideNote')),
            chainLaneNode(t, {
              id: 'lane-agents',
              title: t('laneAgents'),
              hint: t('laneAgentsHint'),
              action: null,
              cards: agentCards,
              emptyText: '',
            }),
            chainLaneNode(t, {
              id: 'lane-categories',
              title: t('laneCategories'),
              hint: t('laneCategoriesHint'),
              action: {
                key: 'add-category',
                label: t('categoryAdd'),
                title: t('categoryAddTitle'),
                onClick: boardHandlers.onAddCategory,
                disabled: boardBusy,
              },
              cards: categoryCards,
              emptyText: '',
            }),
            chainLaneNode(t, {
              id: 'lane-models',
              title: t('laneModels'),
              hint: t('laneModelsHint'),
              action: {
                key: 'add-model',
                label: t('modelAdd'),
                title: t('modelAddTitle'),
                onClick: boardHandlers.onAddModel,
                disabled: boardBusy,
              },
              cards: modelCards,
              emptyText: t('chainModelsEmpty'),
            }),
          ])
        }

        const advancedJson = h(
          'details',
          { key: 'advanced-json', className: 'omd-cfg-details omd-chain-json' },
          h('summary', { className: 'omd-cfg-summary' }, t('chainJsonSummary')),
          h('div', { className: 'omd-cfg-details-body' }, [advancedNode]),
        )

        const sections = GROUPS.map((group) => {
          if (group.id === 'advanced') {
            return h('div', { key: group.id, className: 'omd-cfg-section omd-cfg-section-wide' }, [
              h('div', { key: 'heading', className: 'omd-cfg-h', role: 'heading', 'aria-level': 3 }, t(group.labelKey)),
              boardNode,
              advancedJson,
            ])
          }
          const children = [
            h('div', { key: 'heading', className: 'omd-cfg-h', role: 'heading', 'aria-level': 3 }, t(group.labelKey)),
          ]
          for (const field of FIELDS.filter((item) => item.group === group.id)) {
            const key = pathKey(field.path)
            children.push(
              configField(field, {
                t,
                value: form ? form[key] : '',
                error: validation.errors[key] || view.serverErrors[key],
                source: provenanceOf(envelope, field.path),
                staged: view.unstaged.includes(key),
                readOnly,
                busy: saving,
                supportsUnset,
                defaults: envelope ? envelope.defaults : null,
                emptyHint: emptyHints.get(key),
                onChange: setFieldValue,
                onReset: resetField,
              }),
            )
          }
          return h('div', { key: group.id, className: 'omd-cfg-section' }, children)
        })

        const layerList = layers.length > 0 ? layers : sources.map((file) => ({ file, keys: [] }))

        return shell([
          h('div', { key: 'title', className: 'omd-cfg-title' }, t('title')),
          h('div', { key: 'meta', className: 'omd-cfg-meta' },
            h('div', null, `${t('workspace')}: ${envelope && envelope.workspace ? envelope.workspace : '—'}`),
            h('div', null, `${t('file')}: ${envelope && envelope.file ? envelope.file : '—'}`),
          ),
          h(
            'div',
            { key: 'bar', className: 'omd-cfg-bar' },
            configButton(saving ? t('reloading') : t('reload'), reload, 'plain', saving),
            configButton(saving ? t('saving') : t('save'), () => void save(), 'primary', saving || readOnly || !dirty || clientErrors > 0 || Boolean(advancedError) || blockedRemovals.length > 0),
            configButton(t('discard'), discard, 'plain', saving || !dirty),
            dirty
              ? h(
                  'span',
                  { key: 'dirty', className: 'omd-cfg-dirty' },
                  blockedRemovals.length > 0
                    ? t('blockedCount', { count: built.count })
                    : t('dirtyCount', { count: built.count }),
                )
              : emptyFields.length > 0
                ? h('span', { key: 'clean', className: 'omd-cfg-hint omd-cfg-hint-warn' }, t('emptyInheritedStatus'))
                : h('span', { key: 'clean', className: 'omd-cfg-hint' }, t('clean')),
          ),
          blockedRemovals.length > 0
            ? h(
                'div',
                { key: 'blocked', className: 'omd-cfg-notice omd-cfg-notice-error', role: 'alert' },
                t('removalNeedsRestart', { keys: blockedRemovals.map((path) => path.join('.')).join(', ') }),
              )
            : null,
          view.confirmReload
            ? h(
                'div',
                { key: 'confirm', className: 'omd-cfg-notice omd-cfg-notice-warn' },
                h('div', null, t('confirmTitle')),
                h('div', { className: 'omd-cfg-hint' }, t('confirmBody', { count: built.count })),
                h(
                  'div',
                  { className: 'omd-cfg-bar omd-cfg-bar-plain' },
                  configButton(t('confirmYes'), () => void load(), 'primary', false),
                  configButton(t('confirmNo'), () => update({ confirmReload: false }), 'plain', false),
                ),
              )
            : null,
          view.message ? configNotice(view.message.kind, view.message.text, 'message') : null,
          envelope && envelope.exists === false ? configNotice('info', t('creating'), 'creating') : null,
          readOnly ? configNotice('error', t('parseBroken'), 'parse') : null,
          envelope && envelope.bom ? configNotice('info', t('bom'), 'bom') : null,
          schemaProblems.length > 0
            ? h(
                'div',
                { key: 'schema', className: 'omd-cfg-notice omd-cfg-notice-warn' },
                h('div', null, t('schemaProblems')),
                schemaProblems.map((problem, index) =>
                  h('div', { key: `p${index}`, className: 'omd-cfg-mono' }, `${(problem.path || []).join('.')}: ${problem.message}`),
                ),
              )
            : null,
          h('div', { key: 'grid', className: 'omd-cfg-grid' }, sections),
          h(
            'details',
            { key: 'layers', className: 'omd-cfg-details' },
            h('summary', { className: 'omd-cfg-summary' }, `${t('layers')} (${layerList.length})`),
            h(
              'div',
              { className: 'omd-cfg-details-body' },
              layerList.map((layer, index) =>
                h(
                  'div',
                  { key: `l${index}`, className: 'omd-cfg-layer' },
                  h('span', { className: 'omd-cfg-mono' }, layer.file),
                  envelope && layer.file === envelope.file
                    ? h('span', { className: 'omd-cfg-tag omd-cfg-tag-file' }, t('layerWorkspace'))
                    : null,
                  layer.keys && layer.keys.length > 0
                    ? h('span', { className: 'omd-cfg-hint' }, `${t('layerKeys')}: ${layer.keys.join(', ')}`)
                    : null,
                ),
              ),
            ),
          ),
          diagnostics.length > 0
            ? h(
                'div',
                { key: 'diagnostics', className: 'omd-cfg-notice' },
                h('div', null, t('diagnostics')),
                diagnostics.map((entry, index) =>
                  h(
                    'div',
                    { key: `d${index}`, className: 'omd-cfg-mono' },
                    `${entry.path || ''} — ${entry.reason || ''}${entry.detail ? `: ${entry.detail}` : ''}`,
                  ),
                ),
              )
            : null,
          reserved.length > 0
            ? h(
                'div',
                { key: 'reserved', className: 'omd-cfg-notice omd-cfg-notice-warn' },
                h('div', null, t('reservedTitle')),
                h('div', { className: 'omd-cfg-hint' }, t('reservedBody', { keys: reserved.join(', ') })),
              )
            : null,
          h(
            'details',
            { key: 'plugin', className: 'omd-cfg-details' },
            h('summary', { className: 'omd-cfg-summary' }, t('pluginTitle')),
            h(
              'div',
              { className: 'omd-cfg-details-body' },
              h('div', { className: 'omd-cfg-hint' }, t('pluginNote')),
              plugins ? h('div', { className: 'omd-cfg-meta' }, `${t('language')}: ${plugins.language ? plugins.language.value : '—'}`) : null,
              plugins && plugins.tiers && plugins.tiers.length > 0 ? tierTable(t, plugins.tiers) : null,
              plugins && plugins.snippet
                ? h(
                    'div',
                    { className: 'omd-cfg-field' },
                    h('div', { className: 'omd-cfg-label' }, t('snippet')),
                    h('div', { className: 'omd-cfg-hint' }, t('snippetHint')),
                    h('pre', { className: 'omd-cfg-code', tabIndex: 0 }, plugins.snippet),
                    h('div', { className: 'omd-cfg-bar omd-cfg-bar-plain' }, configButton(t('copy'), () => void copySnippet(plugins.snippet), 'plain', false)),
                  )
                : null,
            ),
          ),
        ])
      }

      return shell([h('div', { key: 'title', className: 'omd-cfg-title' }, t('title'))])
    }

    return {
      // The Client context refuses a property access it was not injected with,
      // so every service this half reaches has to be declared here. `sessions`
      // is read only to name the workspace the page shows; the request itself is
      // a plain same-origin `fetch`, which is a browser global and needs no
      // Client service (and no `remote.commands` declaration any more).
      inject: ['slots', 'locale', 'sessions'],
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
              inject: () => ({ controller: { run: (line) => runConfigLine(ctx, line) }, fallbackT: (key, vars) => t(key, vars) }),
            },
            OmdConfigSection,
          ),
        )
      },
    }
  },
})
