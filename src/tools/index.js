import { createDelegateTools } from './delegate.js'
import { createSessionTools } from './sessions.js'
import { createTaskTools } from './tasks.js'
import { createMiscTools } from './misc.js'
import { createLookAtTools } from './lookat.js'

export function createTools(runtime) {
  const tools = []
  if (runtime.canDelegate) tools.push(...createDelegateTools(runtime))
  tools.push(...createSessionTools(runtime))
  tools.push(...createTaskTools(runtime))
  tools.push(...createMiscTools(runtime))
  if (runtime.canDelegate) tools.push(...createLookAtTools(runtime))
  return tools
}
