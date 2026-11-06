/**
 * Model-facing description strings, keyed by plugin-row language.
 *
 * Only the *description layer* lives here:
 *
 * - `tool.<toolName>.description`      — the `textTool` description argument
 * - `command.<commandName>.description`— the slash-command description
 * - `skill.<skillName>.description`    — the bundled skill summary description
 * - `skill.<skillName>.whenToUse`      — the bundled skill summary whenToUse
 *
 * Deliberately absent: prompt bodies (`prompts/`), `skills/<name>/SKILL.md`
 * bodies, and preset picker names/descriptions (`presets/`), which stay English
 * by decision. Identifiers — tool, command, skill, and parameter names — are
 * never keyed here, so Chinese can never leak into a name the model calls.
 *
 * `en` mirrors the English literal each call site passes as its `text()`
 * fallback; `tests/i18n.test.mjs` asserts that mirror against the source files
 * and the SKILL.md frontmatter so the two cannot drift silently.
 */
export const LANGUAGES = ['en', 'zh']

export const DEFAULT_LANGUAGE = 'en'

export const MESSAGES = {
  en: {
    'tool.omd_delegate.description':
      'Delegate a task to a named OMD agent or to a category executor. Use background mode for independent work that can run while you continue; read the result with omd_background_output. A completion notice is only a hint.',
    'tool.omd_background_output.description':
      'Read a background delegation result. Set block=true to wait for settlement up to timeout_ms. Completion is the persisted result, not a notification.',
    'tool.omd_background_cancel.description': 'Cancel a queued or running background delegation.',
    'tool.omd_background_list.description':
      'List this agent session’s background delegations, including settled tasks loaded from disk.',
    'tool.omd_session_list.description': 'List DSH sessions, newest first. Defaults to the current workspace.',
    'tool.omd_session_read.description':
      'Read a DSH session transcript, compacted to text, tool calls, and tool results.',
    'tool.omd_session_search.description':
      'Search DSH session transcripts. If the profile disables full-text search, this returns the exact configuration fix.',
    'tool.omd_task_create.description': 'Create a durable task with dependencies in .omd/tasks.',
    'tool.omd_task_get.description': 'Read one durable task.',
    'tool.omd_task_list.description': 'List durable tasks, optionally filtered by status.',
    'tool.omd_task_update.description':
      'Update a durable task: status, owner, subject, description, or blockers.',
    'tool.omd_notepad.description':
      'Append to an append-only plan notepad (.omd/notepads/<plan>/<section>.md).',
    'tool.omd_mode.description': 'Read or change the current orchestration mode for this agent.',
    'tool.omd_status.description':
      'Read a compact orchestration status: mode, boulder, plans, tasks, background work, recent ledger.',
    'tool.omd_doctor.description':
      'Run report-only Oh-My-DSH diagnostics: required services, preset registration, spawn provider, config and state readability, browser bundle, upstream lock. Returns one PASS/WARN/FAIL line per check with a fix, and never edits anything. The omd-doctor skill tells you how to read and report it.',
    'tool.omd_lsp.description':
      'Query the language server for a definition, references, implementation, or hover.',
    'tool.omd_diagnostics.description':
      'Run the diagnostics commands configured in .omd/config.jsonc (diagnostics.commands).',
    'tool.omd_ui_status.description':
      'Report whether the Host composed the Oh-My-DSH browser bundle and which entries the Web boot graph contains. Use this when command output does not appear in the conversation.',
    'tool.omd_look_at.description':
      'Inspect one or more images with the multimodal-looker agent and return its analysis.',

    'command.omd-init.description': 'Create the .omd layout and a commented configuration template.',
    'command.omd-ulw.description': 'Enter ultrawork mode and pursue the goal until verified.',
    'command.omd-plan.description': 'Enter interview planning mode and produce an approved plan.',
    'command.omd-hyperplan.description': 'Run five adversarial planning lanes and produce a stronger plan.',
    'command.omd-team.description': 'Run a lead + parallel worker wave protocol.',
    'command.omd-start-work.description':
      'Start or resume execution of an approved plan with the Atlas protocol.',
    'command.omd-stop-continuation.description':
      'Stop OMD continuations, pause the boulder, and pause an active goal.',
    'command.omd-handoff.description': 'Write a continuation handoff document for a new session.',
    'command.omd-init-deep.description': 'Generate a hierarchical AGENTS.md context tree.',
    'command.omd-refactor.description': 'Refactor a target with behavior-preserving verification.',
    'command.omd-remove-ai-slops.description': 'Remove low-value generated comments and dead noise.',
    'command.omd-status.description': 'Show the OMD status board.',
    'command.omd-config.description': 'Show the resolved OMD configuration and its sources.',

    'skill.omd-ast-grep.description': 'Pattern-aware code search and rewriting with ast-grep (sg).',
    'skill.omd-ast-grep.whenToUse': 'Use for structural search across languages or safe mechanical rewrites.',
    'skill.omd-git-master.description':
      'Make safe, atomic commits and history operations without destructive surprises.',
    'skill.omd-git-master.whenToUse': 'Use when committing, rebasing, resolving conflicts, or preparing a PR.',
    'skill.omd-remove-ai-slops.description':
      'Remove low-value generated comments and dead noise without behavior change.',
    'skill.omd-remove-ai-slops.whenToUse':
      'Use for /omd-remove-ai-slops or a comment/code-quality cleanup request.',
    'skill.omd-visual-qa.description': 'Inspect screenshots and visual artifacts for concrete defects.',
    'skill.omd-visual-qa.whenToUse':
      'Use when reviewing UI screenshots, design comparisons, or visual acceptance.',
    'skill.omd-doctor.description': 'Diagnose an Oh-My-DSH installation and report PASS/WARN/FAIL with fixes.',
    'skill.omd-doctor.whenToUse':
      'Use after installing or updating the OMD bundle, when a preset, tool, command, or skill looks missing, or before reporting that OMD is working.',
    'skill.omd-frontend.description':
      'Build or review UI with design intent, accessibility, and responsive behavior.',
    'skill.omd-frontend.whenToUse': 'Use for visual-engineering tasks, component work, styling, or UI review.',
    'skill.omd-refactor.description': 'Refactor with behavior preservation, baseline tests, and a minimal diff.',
    'skill.omd-refactor.whenToUse':
      'Use for /omd-refactor, structural cleanup, or extracting modules without behavior change.',
    'skill.omd-ulw-research.description':
      'Research a codebase or external system with citations and explicit uncertainty.',
    'skill.omd-ulw-research.whenToUse':
      'Use when facts are missing, when a design depends on upstream behavior, or before planning.',
    'skill.omd-team-mode.description': 'Run a lead plus parallel worker wave with file-based results.',
    'skill.omd-team-mode.whenToUse':
      'Use for /omd-team or a task that benefits from several independent workers.',
    'skill.omd-debugging.description': 'Reproduce, isolate, and fix a defect with a regression test.',
    'skill.omd-debugging.whenToUse':
      'Use for a failing test, a runtime bug, or a behavior that contradicts the spec.',
    'skill.omd-ulw-plan.description':
      'Turn a goal into an approved, executable plan with explicit scope and verification.',
    'skill.omd-ulw-plan.whenToUse':
      'Use when the user asks to plan, when a task is multi-step or risky, or before /omd-start-work.',
    'skill.omd-init-deep.description': 'Build a hierarchical AGENTS.md context tree for future agents.',
    'skill.omd-init-deep.whenToUse':
      'Use when the user runs /omd-init-deep or asks for repository context files.',
    'skill.omd-hyperplan.description':
      'Harden a plan with five adversarial review lanes before implementation.',
    'skill.omd-hyperplan.whenToUse': 'Use for /omd-hyperplan or when a high-impact plan needs hostile review.',
    'skill.omd-review-work.description': 'Run an independent, evidence-based review and return a verdict.',
    'skill.omd-review-work.whenToUse':
      'Use before declaring risky work complete, after a plan is drafted, or when asked to review.',
    'skill.omd-ulw-execute.description':
      'Execute an approved plan through atomic delegated tasks with dual evidence.',
    'skill.omd-ulw-execute.whenToUse':
      'Use during /omd-start-work, ultrawork execution, or any multi-task implementation.',
  },

  zh: {
    'tool.omd_delegate.description':
      '把任务委派给指定的 OMD agent，或交给某个 category 执行器。独立的工作可用后台模式与你并行推进，之后用 omd_background_output 读取结果。完成通知只是提示，不算结果。',
    'tool.omd_background_output.description':
      '读取后台委派的结果。设置 block=true 可最多等待 timeout_ms 直到任务结束。以持久化的结果为准，而不是通知。',
    'tool.omd_background_cancel.description': '取消排队中或运行中的后台委派。',
    'tool.omd_background_list.description': '列出本 agent 会话的后台委派，包括从磁盘加载的已结束任务。',
    'tool.omd_session_list.description': '列出 DSH 会话，最新的在前，默认限定当前工作区。',
    'tool.omd_session_read.description': '读取 DSH 会话记录，并精简为文本、工具调用与工具结果。',
    'tool.omd_session_search.description':
      '搜索 DSH 会话记录。若当前 profile 关闭了全文检索，会直接给出所需的配置修复方式。',
    'tool.omd_task_create.description': '在 .omd/tasks 中创建带依赖关系的持久任务。',
    'tool.omd_task_get.description': '读取单个持久任务。',
    'tool.omd_task_list.description': '列出持久任务，可按状态筛选。',
    'tool.omd_task_update.description': '更新持久任务：状态、负责人、标题、描述或阻塞项。',
    'tool.omd_notepad.description': '向只追加的计划记事本追加内容（.omd/notepads/<plan>/<section>.md）。',
    'tool.omd_mode.description': '读取或切换当前 agent 的编排模式。',
    'tool.omd_status.description': '读取精简的编排状态：模式、boulder、计划、任务、后台工作与最近账本事件。',
    'tool.omd_doctor.description':
      '运行只做报告的 Oh-My-DSH 自检：必需服务、预设注册、spawn provider、配置与状态可读性、浏览器 bundle、上游锁文件。每项检查输出一行 PASS/WARN/FAIL 及修复建议，绝不修改任何内容。如何解读与汇报见 omd-doctor 技能。',
    'tool.omd_lsp.description': '向语言服务器查询定义、引用、实现或悬停信息。',
    'tool.omd_diagnostics.description': '运行 .omd/config.jsonc 中 diagnostics.commands 配置的诊断命令。',
    'tool.omd_ui_status.description':
      '报告 Host 是否已组装 Oh-My-DSH 浏览器 bundle，以及 Web 启动图包含哪些入口。命令输出没有出现在会话中时使用。',
    'tool.omd_look_at.description': '交给 multimodal-looker agent 检查一张或多张图片，并返回其分析结果。',

    'command.omd-init.description': '创建 .omd 目录结构，并生成带注释的配置模板。',
    'command.omd-ulw.description': '进入 ultrawork 模式，持续执行目标直到完成验证。',
    'command.omd-plan.description': '进入访谈式规划模式，产出经确认的计划。',
    'command.omd-hyperplan.description': '运行五路对抗式规划，产出更稳健的计划。',
    'command.omd-team.description': '启动「主控 + 并行 worker 波次」协议。',
    'command.omd-start-work.description': '按 Atlas 协议开始或继续执行已确认的计划。',
    'command.omd-stop-continuation.description': '停止 OMD 续跑，暂停 boulder，并暂停进行中的 goal。',
    'command.omd-handoff.description': '为新会话撰写续接用的交接文档。',
    'command.omd-init-deep.description': '生成分层级的 AGENTS.md 上下文树。',
    'command.omd-refactor.description': '重构指定目标，并以保持行为不变的方式验证。',
    'command.omd-remove-ai-slops.description': '清理低价值的生成式注释与无效噪音。',
    'command.omd-status.description': '显示 OMD 状态面板。',
    'command.omd-config.description': '显示解析后的 OMD 配置及其来源。',

    'skill.omd-ast-grep.description': '使用 ast-grep（sg）进行模式感知的代码搜索与改写。',
    'skill.omd-ast-grep.whenToUse': '用于跨语言的结构化搜索，或安全的机械式改写。',
    'skill.omd-git-master.description': '安全、原子地提交并操作历史，避免破坏性意外。',
    'skill.omd-git-master.whenToUse': '在提交、rebase、解决冲突或准备 PR 时使用。',
    'skill.omd-remove-ai-slops.description': '在不改变行为的前提下，清理低价值的生成式注释与无效噪音。',
    'skill.omd-remove-ai-slops.whenToUse': '用于 /omd-remove-ai-slops，或注释与代码质量的清理请求。',
    'skill.omd-visual-qa.description': '检查截图与视觉产物，找出具体缺陷。',
    'skill.omd-visual-qa.whenToUse': '在评审 UI 截图、设计稿对比或视觉验收时使用。',
    'skill.omd-doctor.description': '诊断 Oh-My-DSH 安装情况，并输出带修复建议的 PASS/WARN/FAIL 报告。',
    'skill.omd-doctor.whenToUse':
      '在安装或更新 OMD bundle 之后、发现预设/工具/命令/技能疑似缺失时，或准备汇报 OMD 运行正常之前使用。',
    'skill.omd-frontend.description': '以设计意图、无障碍与响应式行为为准，构建或评审界面。',
    'skill.omd-frontend.whenToUse': '用于 visual-engineering 任务、组件开发、样式调整或界面评审。',
    'skill.omd-refactor.description': '在保持行为不变、先有基线测试、差异最小的前提下重构。',
    'skill.omd-refactor.whenToUse': '用于 /omd-refactor、结构性清理，或在不改变行为的前提下抽取模块。',
    'skill.omd-ulw-research.description': '调研代码库或外部系统，给出引用来源并明确标注不确定之处。',
    'skill.omd-ulw-research.whenToUse': '在事实缺失、方案依赖上游行为，或开始规划之前使用。',
    'skill.omd-team-mode.description': '以主控加并行 worker 波次的方式推进，结果落盘留存。',
    'skill.omd-team-mode.whenToUse': '用于 /omd-team，或适合多个独立 worker 并行的任务。',
    'skill.omd-debugging.description': '复现、定位并修复缺陷，并补上回归测试。',
    'skill.omd-debugging.whenToUse': '用于失败的测试、运行时缺陷，或与规格不符的行为。',
    'skill.omd-ulw-plan.description': '把目标转成经确认、可执行的计划，明确范围与验证方式。',
    'skill.omd-ulw-plan.whenToUse': '在用户要求规划、任务多步或有风险，或执行 /omd-start-work 之前使用。',
    'skill.omd-init-deep.description': '为后续 agent 构建分层级的 AGENTS.md 上下文树。',
    'skill.omd-init-deep.whenToUse': '在用户执行 /omd-init-deep 或要求生成仓库上下文文件时使用。',
    'skill.omd-hyperplan.description': '在实施前用五路对抗式评审加固计划。',
    'skill.omd-hyperplan.whenToUse': '用于 /omd-hyperplan，或高影响计划需要对抗式评审时。',
    'skill.omd-review-work.description': '执行独立且基于证据的评审，并给出结论。',
    'skill.omd-review-work.whenToUse': '在宣布高风险工作完成之前、计划起草完成后，或被要求评审时使用。',
    'skill.omd-ulw-execute.description': '通过原子的委派任务执行已确认的计划，并保留双重证据。',
    'skill.omd-ulw-execute.whenToUse': '在 /omd-start-work 期间、ultrawork 执行中，或任何多任务实现中使用。',
  },
}
