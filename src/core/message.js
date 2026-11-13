import { randomUUID } from 'node:crypto'

/**
 * Build one COMPLETE user-role message for `agent.followup()` / `agent.steer()`.
 *
 * DSH types both entry points as `UserMessage` — `{id, role: 'user', content,
 * source}` (dsh-llm `lib/types/message.d.ts`) — and fills in nothing on the way
 * in: the object is spliced into the agent inbox and committed verbatim as a
 * `user/message` record, and the history projection hands it to the provider as
 * it stands. A partial object — the shape the DSH `dsh-agent` README example
 * happens to show — therefore lands in the DURABLE log as `role: undefined`:
 * every later model request of that session is then rejected with
 * `Unsupported message role: undefined` (code `UNSUPPORTED_CONTENT`, thrown by
 * `assertSupportedHistory` in the pi-ai/opencode-go adapter). Because the record
 * is persisted, that session stays broken across restarts and one such message
 * poisons every following turn.
 *
 * `id` is not decoration either: the inbox projection keys pending messages by
 * `MessageId`, so a message without one cannot be claimed or replaced safely,
 * and DSH's own session loader rejects a stored `user/message` that lacks one.
 *
 * The identity format matches DSH's own `createUserMessage`, which mints
 * `brandString(randomUUID())`; this module must not import `@deepseek-ai/*`
 * because OMD is loaded from the workspace as a linked bundle, not from the DSH
 * installation, so that package name does not resolve here.
 *
 * @param text - the model-facing text.
 * @param source - who produced the turn. `{kind: 'user'}` (the default) means
 *   "this stands for a human turn", which the keyword hook is allowed to read;
 *   `{kind: 'omd'}` marks text OMD injected on its own (a continuation steer or
 *   tool feedback), which must not re-trigger mode detection from its own
 *   wording — a plan title containing "team" would otherwise switch modes.
 *   Producer kinds are an open, merge-extensible set in DSH, and only
 *   `runtime-context` is special-cased by the loop.
 */
export function userMessage(text, source = { kind: 'user' }) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(text ?? '') }],
    source,
  }
}
