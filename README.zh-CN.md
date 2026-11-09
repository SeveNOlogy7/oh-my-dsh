# Oh-My-DSH

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B32C3.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)
[![npm](https://img.shields.io/badge/npm-%E5%B0%9A%E6%9C%AA%E5%8F%91%E5%B8%83-lightgrey.svg)](#从-npm-安装)
[![GitHub](https://img.shields.io/badge/GitHub-SeveNOlogy7%2Foh--my--dsh-181717.svg)](https://github.com/SeveNOlogy7/oh-my-dsh)

[English](README.md) | 简体中文

面向 **DeepSeek Harness** 的智能体编排插件，能力对齐
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) **v4.19.4**
（commit `b072d27`）。

Oh-My-DSH 安装 11 个可选择的 Agent preset，并把规划、访谈、委派、后台任务、
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

在当前 DSH profile 中安装：

```
plugin_manager install_bundle  target: E:\Oh-My-DSH
```

或在终端：

```
dsh plugin --profile <profile> add E:\Oh-My-DSH
```

安装**只新增 11 个 `agent-preset` 声明**，不新增全局工具/命令/Hook，也不修改
默认 preset。标准会话完全不受影响。如果安装时应用已在运行，请先重启一次应用，
再选择 OMD preset，以确保加载当前运行时模块。

### 语言开关

OMD preset 名称与消息的语言开关属于 OMD 配置，不是安装参数。完整说明见
[`docs/configuration.md`](docs/configuration.md)。

## 使用

1. 新建会话，在 New Session 里选择 **Sisyphus · OMD**（或其它 OMD preset）。
   preset 只能在首轮之前选择。
2. 运行 `/omd-init` 创建 `.omd/`。
3. 运行 `omd-doctor` 技能自检。
4. 用 `/omd-ulw <目标>`、`/omd-plan <目标>`、`/omd-start-work`，或直接提需求。

| Preset | 职责 |
|---|---|
| Sisyphus · OMD | 主编排器 |
| Hephaestus · OMD | 自主深度执行 |
| Prometheus · OMD | 访谈式规划 |
| Atlas · OMD | 计划执行指挥（只读） |
| Oracle · OMD | 只读架构咨询 |
| Librarian · OMD | 只读文档/上游检索 |
| Explore · OMD | 只读代码扫描 |
| Multimodal Looker · OMD | 只读视觉分析 |
| Metis · OMD | 计划缺口分析 |
| Momus · OMD | 对抗式评审 |
| Sisyphus-Junior · OMD | 委派任务执行器 |

## 命令

`/omd-init`、`/omd-status`、`/omd-config`、
`/omd-ulw`、`/omd-plan`、`/omd-hyperplan`、`/omd-team`、
`/omd-start-work`、`/omd-stop-continuation`、`/omd-handoff`、
`/omd-init-deep`、`/omd-refactor`、`/omd-remove-ai-slops`。

`/goal` 使用 DeepSeek Harness 原生能力。

doctor 做成**技能**而不是指令：每个 OMD 角色都带 `omd-doctor` 技能，它驱动
`omd_doctor` 工具，因此诊断与修复可以在同一次回答里闭环。详见
`docs/commands.md` 与 `docs/tools.md`。

`Settings → Oh-My-DSH` 是本 bundle 的设置页：读写当前会话工作区的
`.omd/config.jsonc`，并展示生效的 `language` 与模型路由分档及其来源。详见
`docs/configuration.md`。

## 零侵入

- OMD 工具/命令/Hook/技能只存在于 OMD preset 内。
- 安装不改变默认 preset；不使用 OMD 命令/工具就不会写 `.omd/`。
- 关键字 `ulw`、`team`、`hyperplan` 在 OMD preset 内默认开启，可在
  `.omd/config.jsonc` 关闭。

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
notepad、评审 verdict、会话读取/搜索、任务系统、规则注入、模型路由，以及
ultrawork、plan、start-work、hyperplan、team、review、handoff、init-deep、
refactor、AI-slop 协议。

OmO 4.19.4 中与宿主强绑定的能力在
[`docs/parity-omo-4.19.4.md`](docs/parity-omo-4.19.4.md) 逐项登记为替代或延期：
dashboard/Client UI、Team Mode 的 `team_*` 工具族、hashline 编辑、交互式 tmux、
skill-embedded MCP、CodeGraph、Claude Code hooks、动态模型回退链。

## 许可

本仓库 MIT。上游为 SUL-1.0；见 `NOTICE` 与 `upstream/`。
