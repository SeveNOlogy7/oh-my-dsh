# Oh-My-DSH

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B32C3.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)
[![npm](https://img.shields.io/badge/npm-%E5%B0%9A%E6%9C%AA%E5%8F%91%E5%B8%83-lightgrey.svg)](#从-npm-安装)
[![GitHub](https://img.shields.io/badge/GitHub-SeveNOlogy7%2Foh--my--dsh-181717.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)

[English](README.md) | 简体中文

面向 **DeepSeek Harness** 的智能体编排插件，能力对齐
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) **v4.19.4**
（commit `b072d27`）。

Oh-My-DSH 新增 11 个 OMD 编排角色，并把规划、访谈、委派、后台任务、
评审门、证据与交接写入项目 `.omd/`。它是**能力对标 + 协议重写**：不复制上游
代码或提示词文本，来源与许可取证见 `NOTICE` 与
`upstream/omo-sources.lock.json`。

## 从 npm 安装

```
npm install @jhcai11/oh-my-dsh
```

或直接把 bundle 加进 DSH profile：

```
dsh plugin --profile <profile> add @jhcai11/oh-my-dsh
```

裸名 `oh-my-dsh` 属于另一个无关的包，所以本项目使用 scope。scoped 改名、
`npm publish --access public`、后续版本由 CI 带 provenance 发布，以及市场收录，
完整流程记录在 [`docs/releasing.md`](docs/releasing.md)。

## 安装

本 bundle 声明 `engines.dsh: "^0.2.1-rc.5"`，因此 DSH 会拒绝在此范围之外的构建上安装或激活它。下界是完成启动验证的版本；正在运行的 `0.2.2-rc.1` 是委派角色通道完成端到端验证的版本。两个边界的依据见
[Declared DSH compatibility](docs/verification.md#declared-dsh-compatibility-2026-11-10)。

在当前 DSH profile 中安装：

```
plugin_manager install_bundle  target: E:\Oh-My-DSH
```

或在终端：

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

安装只新增一行 profile 级运行时行 `omd-runtime`（生成于
`presets/omd-runtime.patch.yml`），外加浏览器资源行 `omd-ui`。这一行运行时行承载
全部工具、命令、技能与 Hook，因此 OMD 编排在**每个** preset 里都可用，包括自带的
`standard`。OMD **不再注册任何** agent preset：角色随委派子会话的
`subagent/descriptor` label 传递（写作 `omd:<role>`，分类委派追加 `@<category>`），由运行时从子会话自己的会话
日志里读回。自身不带角色的会话运行在 **capability-only** 状态：编排能力可用，但不注入
角色提示词、不施加角色限制。如果安装时应用已在运行，请先重启一次应用，以确保加载当前
运行时模块。

### 语言开关

OMD 工具、命令与技能描述的语言开关属于 OMD 配置，不是安装参数。完整说明见
[`docs/configuration.md`](docs/configuration.md)。

## 使用

1. 运行 `/omd-init` 创建 `.omd/`。任何 preset 下都可用。
2. 运行 `omd-doctor` 技能自检。
3. 用 `/omd-ulw <目标>`、`/omd-plan <目标>`、`/omd-start-work`，或直接提需求。

角色是**被委派的子会话**运行的身份：`omd_delegate` 把目标角色写到子会话的 subagent
descriptor label 上（`omd:<role>`），`omd_look_at` 同理，写入 multimodal-looker 角色。
根会话没有这个 label，因此始终是 capability-only。角色只由这个通道指定——OMD 没有可
选择的 preset。

preset 只能在首轮之前选择。`.omd/config.jsonc` 的 `delegation.childPreset` 决定委派
子会话从哪个 preset 组合：`null`（默认）表示继承父会话的 preset，非空 id 则指定该
preset。

| 角色 | 职责 |
|---|---|
| `sisyphus` | 主编排器 |
| `hephaestus` | 自主深度执行 |
| `prometheus` | 访谈式规划 |
| `atlas` | 计划执行指挥（只读） |
| `oracle` | 只读架构咨询 |
| `librarian` | 只读文档/上游检索 |
| `explore` | 只读代码扫描 |
| `multimodal-looker` | 只读视觉分析 |
| `metis` | 计划缺口分析 |
| `momus` | 对抗式评审 |
| `sisyphus-junior` | 委派任务执行器 |

## 命令

`/omd-init`、`/omd-status`、`/omd-config`、
`/omd-ulw`、`/omd-plan`、`/omd-hyperplan`、`/omd-team`、
`/omd-start-work`、`/omd-stop-continuation`、`/omd-handoff`、
`/omd-init-deep`、`/omd-refactor`、`/omd-remove-ai-slops`。

`/goal` 使用 DeepSeek Harness 原生能力。

doctor 做成**技能**而不是指令：每个 OMD 角色都带 `omd-doctor` 技能，它驱动
`omd_doctor` 工具，因此诊断与修复可以在同一次回答里闭环。详见
`docs/commands.md` 与 `docs/tools.md`。

「设置 → OMD」是本 bundle 的设置页：读写当前工作区的
`.omd/config.jsonc`，覆盖关键词激活、委派、任务系统、钩子与轮末延续、规则、诊断，
以及 agents/categories/models 覆盖项；每个取值都标注来源，因此可以移除本文件自己
设置的值，让继承值重新生效。agents/categories/models 覆盖项是一块图形化的模型链
工作台：有序列出主路由与模型回退步骤、模型目录别名、继承值，并保留一键切换的
高级 JSON 文档。只读区块展示生效的 `language` 与模型路由分档及其来源。
它通过插件行自己的已认证端点通信，因此打开设置页不会在任何会话里执行命令。详见
`docs/configuration.md`。

## OMD 的位置

- 运行时只在 profile 顶层挂载一次，因此 OMD 工具/命令/Hook/技能与 `.omd/` 目录在
  每个 preset 里都可达。原先的「零侵入」保证已作废。
- 安装不改变默认 preset；不使用 OMD 命令/工具就不会写 `.omd/`。
- 角色（提示词、工具策略、写入范围、技能集）只在一处解析，优先级为：挂载行上钉定的
  `agent`，其次是子会话自己的 `omd:<role>` descriptor label，最后才是历史遗留的
  `omd-<role>` preset（仅为 OMD 停止发布 per-role preset 之前创建的会话保留）。
  三者都没有的会话运行在 capability-only 状态，不注入提示词，也不施加角色限制。
- OMD 不注册 preset，因此 New Session 选择器里没有 OMD 条目；也不应残留任何 `omd-*`
  preset：一旦出现，doctor 的 `presets` 检查会 FAIL。
- 关键字 `ulw`、`team`、`hyperplan` 在所有会话默认开启，可在
  `.omd/config.jsonc` 关闭。关键字只在指令位置生效——行首裸词、`word:`、`/word`
  或 `[word]`——仅仅在句子里提到模式名不会切换模式。
- `ultrawork` 的门是真正执行的：没有非 draft 且含任务行的计划时拒绝写交付文件；
  第一次写之前还要先跑过一次基线验证；写过交付文件但没记录成功验证的轮次不会收尾。
  每个门都能在 `.omd/config.jsonc` 里用对应的 `ultrawork.*` 开关关闭。

## 验证

```
npm test
npm run check
```

然后新建 OMD 会话，运行 `omd-doctor` 技能：它调用 `omd_doctor` 工具，逐项报告
PASS/WARN/FAIL 并给出修复命令。详细步骤见 `docs/install-verify.md`，挂载探针
证据与剩余人工验收见 `docs/verification.md`。

## v0.1.0 范围

编排闭环完整：11 个角色、category/具名委派、后台队列与结果、计划、boulder、
notepad、评审 verdict、会话读取/搜索、任务系统、规则注入、模型路由与有序模型回退链，
以及 ultrawork、plan、start-work、hyperplan、team、review、handoff、init-deep、
refactor、AI-slop 协议。

OmO 4.19.4 中与宿主强绑定的能力在
[`docs/parity-omo-4.19.4.md`](docs/parity-omo-4.19.4.md) 逐项登记为替代或延期：
dashboard/Client UI、Team Mode 的 `team_*` 工具族、hashline 编辑、交互式 tmux、
skill-embedded MCP、CodeGraph、Claude Code hooks。

## 许可

本仓库 MIT。上游为 SUL-1.0；见 `NOTICE` 与 `upstream/`。
