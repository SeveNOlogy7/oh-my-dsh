export const OMD_VERSION = '0.1.1'
export const OMO_VERSION = '4.19.4'
export const OMO_COMMIT = 'b072d279110bdda2c6ac2525d0d24dc54d16148a'
export const OMD_DIR = '.omd'
export const OMD_CONFIG_FILE = 'config.jsonc'
export const OMD_SCHEMA_ID = 'https://oh-my-dsh.dev/schema/omd-config.schema.json'

/**
 * Package name of the browser asset mounted by `presets/omd-ui.patch.yml`.
 * The Host's client-modules scan resolves that row by this specifier, so
 * `omd_doctor` and `omd_ui_status` probe the bundle through it.
 */
export const UI_PACKAGE = 'omd-ui'

/** Agent ids in canonical display order. */
export const AGENT_IDS = [
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

export const PRIMARY_AGENTS = ['sisyphus', 'hephaestus', 'prometheus', 'atlas']

export const MODE_NAMES = ['ultrawork', 'team', 'hyperplan', 'hyperplan-ulw', 'plan', 'search', 'analyze']

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'deleted']

export const BOULDER_STATUSES = ['active', 'paused', 'done']

export const BACKGROUND_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'unknown',
]

export const PROMPT_SECTION_PREFIX = 'deployment:persona-prefix'
export const PROMPT_SECTION_SUFFIX = 'deployment:persona-suffix'

export const OMD_MAX_RESULT_BYTES = 256 * 1024
