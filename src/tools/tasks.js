import { TaskStore } from '../state/tasks.js'
import { text } from '../i18n/index.js'
import { requireAgent, textTool } from './shared.js'

function renderTask(task) {
  return [
    `${task.id}  [${task.status}]  ${task.subject}`,
    task.description ? `  ${task.description}` : null,
    task.blockedBy?.length ? `  blockedBy: ${task.blockedBy.join(', ')}` : null,
    task.blocks?.length ? `  blocks: ${task.blocks.join(', ')}` : null,
    task.owner ? `  owner: ${task.owner}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function createTaskTools(runtime) {
  const tools = []
  const t = (key, fallback) => text(runtime.language, key, fallback)
  async function storeFor(exec) {
    const parent = requireAgent(exec)
    const state = await runtime.stateFor(parent)
    return { store: new TaskStore(state.cwd), state }
  }

  tools.push(
    textTool(
      'omd_task_create',
      t('tool.omd_task_create.description', 'Create a durable task with dependencies in .omd/tasks.'),
      {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Imperative task title.' },
          description: { type: 'string' },
          blocked_by: { type: 'array', items: { type: 'string' }, description: 'Task ids that must complete first.' },
          owner: { type: 'string' },
        },
        required: ['subject'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const { store, state } = await storeFor(exec)
        if (!state.config.taskSystem.enabled) throw new Error('task system is disabled; set .omd/config.jsonc taskSystem.enabled=true')
        const task = await store.create({
          subject: args.subject,
          description: args.description ?? '',
          blockedBy: args.blocked_by ?? [],
          owner: args.owner,
          sessionId: exec.agent.id,
        })
        return renderTask(task)
      },
    ),
  )

  tools.push(
    textTool(
      'omd_task_get',
      t('tool.omd_task_get.description', 'Read one durable task.'),
      {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const { store } = await storeFor(exec)
        const task = await store.get(args.id)
        if (!task) throw new Error(`unknown task: ${args.id}`)
        return renderTask(task)
      },
    ),
  )

  tools.push(
    textTool(
      'omd_task_list',
      t('tool.omd_task_list.description', 'List durable tasks, optionally filtered by status.'),
      {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] },
        },
        additionalProperties: false,
      },
      async (args, exec) => {
        const { store } = await storeFor(exec)
        const tasks = await store.list({ status: args.status })
        if (!tasks.length) return 'no tasks'
        return tasks.map(renderTask).join('\n\n')
      },
    ),
  )

  tools.push(
    textTool(
      'omd_task_update',
      t(
        'tool.omd_task_update.description',
        'Update a durable task: status, owner, subject, description, or blockers.',
      ),
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] },
          owner: { type: 'string' },
          subject: { type: 'string' },
          description: { type: 'string' },
          blocked_by: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
        additionalProperties: false,
      },
      async (args, exec) => {
        const { store } = await storeFor(exec)
        const task = await store.update({
          id: args.id,
          status: args.status,
          owner: args.owner,
          subject: args.subject,
          description: args.description,
          blockedBy: args.blocked_by,
        })
        return renderTask(task)
      },
    ),
  )

  return tools
}
