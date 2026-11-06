import path from 'node:path'
import { listPlans, parsePlan } from './plan.js'
import { readBoulderSlot, listBoulderSlots } from './boulder.js'
import { TaskStore } from './tasks.js'
import { readMode } from './modes.js'
import { readLedger } from './ledger.js'
import { readTextSafe } from '../core/atomic.js'
import { safeStem } from '../core/paths.js'

export async function buildStatus({
  workspace,
  agentId,
  config,
  backgroundRegistry,
  capabilityReport,
} = {}) {
  const stem = safeStem(agentId ?? 'session')
  const mode = await readMode(workspace, stem)
  const boulder = await readBoulderSlot(workspace, stem)
  const slots = await listBoulderSlots(workspace)
  const plans = await listPlans(workspace)
  const tasks = await new TaskStore(workspace).summary()
  const ledger = await readLedger(workspace, { limit: 8 })
  const background = backgroundRegistry ? backgroundRegistry.list(agentId) : []
  let activePlan = null
  if (boulder.ok && boulder.value.active_plan) {
    const read = await readTextSafe(boulder.value.active_plan)
    if (read.ok) activePlan = parsePlan(read.value, boulder.value.active_plan)
  }
  return {
    agent_id: agentId,
    stem,
    mode: mode?.mode ?? null,
    continuation_rounds: mode?.continuation_rounds ?? 0,
    boulder: boulder.ok ? boulder.value : null,
    boulder_open: slots.filter((slot) => slot.status === 'active' || slot.status === 'paused').length,
    plans: plans.map((plan) => ({
      title: plan.title,
      status: plan.status,
      total: plan.total,
      checked: plan.checked,
      file: path.basename(plan.source),
    })),
    active_plan: activePlan
      ? { title: activePlan.title, total: activePlan.total, checked: activePlan.checked, open: activePlan.open.length }
      : null,
    tasks,
    background,
    ledger,
    capabilities: capabilityReport ?? null,
    generated_at: new Date().toISOString(),
  }
}

export function renderStatus(status) {
  const lines = []
  lines.push('Oh-My-DSH status')
  lines.push(`agent: ${status.agent_id ?? 'unknown'}  stem: ${status.stem}`)
  lines.push(`mode: ${status.mode ?? 'none'}${status.continuation_rounds ? ` (round ${status.continuation_rounds})` : ''}`)
  if (status.boulder) {
    lines.push(
      `boulder: ${status.boulder.status}  plan: ${status.boulder.plan_name ?? status.boulder.active_plan ?? 'none'}`,
    )
  } else {
    lines.push('boulder: none')
  }
  if (status.active_plan) {
    lines.push(`active plan: ${status.active_plan.title} (${status.active_plan.checked}/${status.active_plan.total})`)
  }
  lines.push(`plans: ${status.plans.length}  open boulders: ${status.boulder_open}`)
  lines.push(
    `tasks: ${status.tasks.total} total, ${status.tasks.in_progress} in progress, ${status.tasks.completed} done, ${status.tasks.blocked} blocked`,
  )
  const running = (status.background ?? []).filter((task) => task.status === 'running' || task.status === 'queued')
  const finished = (status.background ?? []).filter((task) => !['running', 'queued'].includes(task.status))
  lines.push(`background: ${running.length} active, ${finished.length} settled`)
  for (const task of running.slice(0, 5)) {
    lines.push(`  - ${task.task_id} ${task.target} [${task.status}] ${task.description ?? ''}`.trimEnd())
  }
  if (status.capabilities) {
    const degraded = (status.capabilities.degraded ?? []).filter(Boolean)
    lines.push(`capabilities: ${degraded.length ? `degraded (${degraded.map((item) => item.name).join(', ')})` : 'ok'}`)
  }
  if (status.ledger?.length) {
    lines.push('recent events:')
    for (const event of status.ledger.slice(-5)) {
      lines.push(`  - ${event.ts} ${event.event}${event.task ? ` ${event.task}` : ''}`)
    }
  }
  lines.push('next: /omd-ulw <goal> | /omd-plan <goal> | /omd-start-work | /omd-handoff')
  return lines.join('\n')
}
