/**
 * Oh-My-DSH Client half — the browser asset package.
 *
 * A slash-command result is delivered in the UI command plane: the host logs
 * `command/run` and `command/done`, and `CommandNodeView` renders the row
 * through the `conversation.chat.commandview` slot, keyed by command name. The
 * shipped fallback (`GenericCommandCard`) collapses a multi-line result to a
 * one-line summary and mounts the body only after a click, so an OMD report
 * command looked like it did nothing at all.
 *
 * This half registers one cell per OMD command that renders the returned text
 * directly, so the output is readable the moment the command settles. It
 * touches no model state: the command text still never enters the conversation
 * as a message and never wakes the agent.
 *
 * The loader has no JSX step, so the component is written with
 * `React.createElement`, exactly like a compiled Client bundle would emit.
 * Labels are local constants rather than a locale namespace: this package owns
 * no registered dictionary, and an unresolvable seat would crash the whole row.
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
    }

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

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.chat.commandview', () =>
          COMMANDS.map((key) =>
            ctx.slots.register({ name: 'conversation.chat.commandview', key }, OmdCommandOutput),
          ),
        )
      },
    }
  },
})
