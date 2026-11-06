# Oh-My-DSH 设计（v0.1.0）

## 1. 定位

Oh-My-DSH 是 Oh-My-OpenAgent（OmO）**v4.19.4** 编排能力的 DeepSeek Harness
（DSH）移植。它对齐的是编排行为，不是 OpenCode 的宿主 API：

- OmO 的 11 个角色 → DSH 的 11 个 Agent preset；
- OmO 的 `task`/`category`/后台代理 → `omd_delegate` + `ctx.subagents`；
- OmO 的 `.omo/` 状态 → `.omd/`；
- OmO 的 54 个 Hook → 8 类 OMD Hook + DSH 宿主原生替代 + 有理由的延期项；
- OmO 的模型链 → `.omd/config.jsonc` 中的 DSH provider/model 路由（不硬编码）。

上游为 SUL-1.0，本仓库 MIT。所有提示词、技能、协议文本为 clean-room 重写；
来源、许可、忽略的宿主绑定路径与重叠度方法见 `upstream/omo-sources.lock.json`。

## 2. 架构

```
DSH Host
  ├── 标准 preset（无 OMD 内容）
  ├── preset-omd-sisyphus
  │     ├── DSH 基础行（fs/search/web/todo/goal/skill/compaction…）
  │     ├── DSH 子代理控制行（仅可委派角色）
  │     └── oh-my-dsh（config.agent=sisyphus）
  ├── … 其余 10 个 preset
  └── 无全局 OMD 工具/命令/Hook

oh-my-dsh runtime（每个 preset 一份）
  ├── tools：delegate/background/session/task/notepad/lsp/diagnostics/look_at/mode/status
  ├── commands：14 个 /omd-*
  ├── skills：14 个 bundled skill + .omd/skills provider
  ├── hooks：persona/rules/mode/model routing/keyword/continuation/comment/plan/guards
  └── state：.omd/（文件为事实源，内存仅派生缓存）
```

一个 preset 对应一种 Agent。preset scope 在多个同类型会话间共享，因此所有
per-session 状态以 Agent/Session id 为键；`agent/created` 时在 `agent.ctx` 上
注册 persona、模式段、规则段、监听器与限制，`agent/disposed` 时清理。

## 3. 关键决策

| ID | 决策 | 理由 |
|---|---|---|
| D1 | clean-room，不复制上游文本 | SUL-1.0 与 MIT 的边界 |
| D2 | bundle 只插入 11 个 preset，不插入 host 行 | 零侵入；标准会话不变 |
| D3 | 每个 preset 一行 runtime 插件 | 提示词/工具/命令/Hook/技能共享作用域 |
| D4 | 不修改默认 preset | 用户显式选择才进入 OMD |
| D5 | 自建 `omd_delegate`，不包装 DSH `subagent` 工具 | 需要 category、后台队列、结果文件、task_id 续接 |
| D6 | 模型路由不硬编码 | OmO 的外部模型链在 DSH 不可用 |
| D7 | `.omd` 文件为事实源；通知只是提示 | 重启/崩溃后可恢复 |
| D8 | v0.1.0 不做 dashboard/Client UI | 4.19.4 无 GUI dashboard；先保证编排闭环 |
| D9 | 关键字 Hook 在 OMD preset 内默认开 | 对齐 OmO 的 `ulw` 主路径 |
| D10 | 不实现 4.19.4 之外的能力 | `mass ulw` 是 5.x；不冒充对齐 |
| D11 | 零第三方运行时依赖 | 安装/审计/维护成本 |
| D12 | 报告式 doctor，不做自动修复 | 用户可见、可回滚 |

## 4. 数据流

### 委派

```
omd_delegate(prompt, category|subagent_type, load_skills, run_in_background)
  → 校验 canDelegate / allowlist / category / depth
  → routeFor(agent|category) → agentOptions
  → 解析技能正文，拼 <omd-delegation>
  → Scheduler.acquire(provider/model)
  → ctx.subagents.startActivation({ agentPreset, delivery })
  → 前台：await result → 解析 omd-result → 返回
  → 后台：task_id；settle 后写 background/<id>.json
          与 runtime/<stem>/results/<id>.json
```

### 模式

```
user/message → keyword detector（去代码围栏）→ mode.json
             → per-agent systemPrompt section 注入协议
             → turn-stopping 检查 boulder/tasks → steer 续跑（有上限）
```

### 计划执行

```
/omd-plan → 访谈/草稿 → 批准 → .omd/plans/<slug>.md
/omd-start-work → boulder/<stem>.json → Atlas 协议
  → 逐 checkbox：omd_delegate → 结果文件 → 验证 → notepad → ledger → 翻勾
  → Final Verification Wave → boulder done
```

## 5. 不变量

- **I1** `.omd` 是 OMD 唯一持久编排状态；会话日志是对话事实源。
- **I2** 所有状态写入经过 `writeJsonAtomic`（tmp+rename、LF、无 BOM、root 断言）。
- **I3** 每会话 boulder slot；`boulder.json` 只是 `source:"derived"` 视图。
- **I4** 完成以结果文件/验证命令为准，通知只是提示。
- **I5** 只读角色结构性缺少 write/edit 与委派工具；shell 写由提示词约束并明示。
- **I6** 委派受深度、allowlist、并发上限约束；子代理不得再委派（工具缺失）。
- **I7** 零侵入：安装只新增 preset 声明；不使用 OMD 不写 `.omd`。
- **I8** prompt/技能/协议文本为 clean-room；来源锁定只记录概念与许可。
- **I9** preset 组合由一份 spec 生成；`check:presets` 保证确定性。
- **I10** 版本号只有一处：`package.json` 与 `src/core/constants.js` 由
  `check:version` 校验；OmO 对齐版本只来自 lock。

## 6. 缺陷登记（已预防）

| ID | 失败模式 | 处理 |
|---|---|---|
| B1 | 安装后旧会话看不到 preset | README/doctor 明示新会话选择 |
| B2 | Windows 路径/BOM 导致状态损坏 | safeStem、inside-root、BOM 读取、doctor 扫描 |
| B3 | 单一全局 boulder 指针互相覆盖 | 每会话 slot + 派生视图 |
| B4 | 把完成通知当结果 | 结果文件为事实源 |
| B5 | 委派深度/并发失控、孤儿任务 | 深度检查、Scheduler、取消/dispose |
| B6 | 关键字误触发 | 去围栏、词边界、可关闭、模式可清 |
| B7 | 配置/状态 JSON 损坏导致崩溃 | `readJsonSafe` 显式 reason；doctor 报告 |
| B8 | 只读角色通过 shell 写 | 工具层 deny + 提示词明示限制 |
| B9 | 配置模型 id 不存在 | 默认继承；doctor 警告；不硬编码 |
| B10 | 配置原型污染 | 剥离 `__proto__`/`prototype`/`constructor` |
| B11 | 重复命令/工具注册 | preset 作用域隔离；apply 失败 loud |
| B12 | 任务依赖环 | create/update 检测并拒绝 |
| B13 | 重启后后台结果丢失 | 磁盘记录 + `unknown` 标记 |
| B14 | 路径穿越 | stem 白名单 + `assertInside` |
| B15 | 规划文件格式漂移 | 单一 grammar + 写后校验警告 |

## 7. 安全

- OMD 不扩大 DSH 的权限；只读限制是工具层 + 提示词层，不是沙箱。
- `.omd` 写入限制在 workspace 内；`prometheus` 只能写 `.omd/`。
- 不执行配置中的任意脚本；`diagnostics.commands` 是用户显式配置的 argv。
- 没有网络监听、没有第三方依赖、没有遥测。
- `omd_session_*` 只读；`omd_background_cancel` 只能操作本会话任务。

## 8. 测试

- `node --test tests/`：核心状态、配置、计划、boulder、任务、后台、隔离、
  runtime 工具/命令/Hook/技能（fake ctx）。
- `scripts/generate-presets.mjs --check`：preset 生成物确定性。
- `scripts/check.mjs`：manifest、版本、preset 行、必需文件、语法。
- `scripts/check-parity.mjs`：对齐矩阵覆盖所有角色/工具/命令/技能。
- `scripts/license-audit.mjs`：可选 8-gram 重叠审计。
- 安装后：`plugin_manager` 的 `application: applied` + `Config.listConfigs`
  的 11 个 preset 行；新会话运行 `omd-doctor` 技能为端到端门。
