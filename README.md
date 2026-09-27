# Aiflow

> 把与 AI 的对话组织成思维导图，让发散式学习不再污染主线。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Electron](https://img.shields.io/badge/Electron-44-47848f.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

---

## 这是什么

Aiflow 是一个本地优先的桌面应用，解决一个很具体的学习痛点：

> 读一段代码时（例如标准库里涉及**时钟、推挽输出、电平翻转速度**的一段实现），
> 我想顺着某个点追问下去，但在**线性长对话**里，这些追问会不断污染上下文，
> 等你回到主线（只想看对这段代码本身的解释）时，已经很难找回来了。

Aiflow 把对话组织成一棵**可视化的思维导图**：

- 每个话题是一个**节点**，追问是它的**子节点**；
- 每条分支拥有**独立的上下文**，兄弟分支互不影响；
- 随时可以跳回主线，也随时可以深挖某个分支。

一句话：**线性对话 → 可导航的对话树。**

<!-- 截图：建议在此放一张主界面截图（图皮肤 + 右侧详情面板），并删掉这段注释。 -->

## 核心概念

| 概念 | 说明 |
|---|---|
| **画布 (Canvas)** | 相当于一个会话，容纳一棵节点树；**一个画布一个根** |
| **根 (Root)** | 画布的主题锚点（如一段代码 / 一个问题），**手动创建**，创建时不调用模型 |
| **话题 (Node)** | 导图上的一个点 = **话题容器**，里面可以承载多轮问答；子话题从它分叉 |
| **轮 (Turn)** | 话题里的一次提问 + 回答；回答可保留多个版本 |
| **锚点 (Anchor)** | 话题绑定的代码片段或引用文字（从父话题选中文字生成子话题时产生） |
| **皮肤 (Skin)** | 画布的视图切换：**图** / **树** / 文件树（待实现），共享同一份数据 |
| **Compact** | 手动把祖先链压缩成一条摘要，避免触达上下文上限，且可随时还原 |

## 功能特性

**对话与结构**

- 手动创建根话题、右键添加子话题，**搭结构不消耗 token**（不调用模型）
- 话题内可连续多轮问答，回答以 Markdown 渲染、支持流式输出与「停止生成」
- 在回答里**选中文字 → 右键 → 新建子话题**，自动记录引用来源
- 把某一轮问答**「转为子话题」**：那一轮连同回答独立成枝，不调用模型
- **重新生成**保留历史版本，可在 v1 / v2 … 之间切换当前生效回答
- 折叠子树、拖拽摆放节点（图皮肤）、重命名、删除话题树或单轮

**上下文与成本**

- 上下文 = **祖先话题链 + 当前话题已有轮次**，序列化顺序固定以**最大化前缀缓存命中**
- **手动压缩（compact）**：把祖先链压成一条摘要，**保留原文、可一键展开还原**
- 顶栏**环形指示器**显示当前分支的上下文占用（≥70% 变黄、≥90% 变红，提示压缩）
- **Token 记账**：区分缓存命中 / 未命中输入；每轮显示输入 / 缓存 / 输出，叶子节点显示分支总量，顶栏显示画布总量

**模型与安全**

- **OpenAI 协议兼容**：任意兼容 `/chat/completions` 的服务均可接入
- **多 Provider 管理**：设置页添加 / 删除 / 设为默认，可从 `/models` 拉取并选择模型，可测试连接
- 可为**单个画布**在顶栏切换 Provider 与模型
- **API Key 使用系统级加密**（Electron `safeStorage`）保存，密钥永不返回给渲染进程、不写入明文配置

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron（main = 后端，renderer = UI，preload 通过 `contextBridge` 暴露 API） |
| 前端 | React 19 · TypeScript（strict） · Tailwind CSS · Zustand · React Flow (`@xyflow/react`) |
| 后端逻辑 | Node.js（主进程），领域逻辑集中在纯函数模块 `src/core`，可单测 |
| 数据 | SQLite（`better-sqlite3`） + Drizzle ORM |
| LLM | OpenAI 兼容协议，流式 SSE，`gpt-tokenizer` 估算 token |
| 校验 | Zod（IPC 契约与配置 schema） |
| 构建 / 测试 | electron-vite · Vitest |

## 快速开始

环境要求：**Node.js 20+**。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式（Electron 窗口 + 热更新）
npm run dev
```

首次启动后：

1. 左下角进入**设置**，添加一个 Provider（填 Base URL，如 `https://api.openai.com/v1`）、保存、填写 API Key；
2. 需要的话点**拉取模型列表**选择默认模型，并**测试连接**；
3. 左侧**新建画布** → 写下**根话题**（例如「C语言指针」）；
4. 在话题上**右键 →「添加子话题」**把结构搭出来，或选中话题直接在右下输入框提问。

### 常用命令

```bash
npm run dev        # 开发模式
npm run build      # 构建
npm start          # 预览构建产物
npm run typecheck  # 类型检查
npm test           # 单元 + 会话集成测试（Vitest）
npm run dist       # 打包安装包（electron-builder）
```

> **Windows 提示**：若环境中 `NODE_ENV=production`，npm 会默认跳过 `devDependencies`，
> 导致 `node_modules` 不完整。此时请用 `npm install --include=dev`。
> 若 Electron 二进制未随安装下载，可执行
> `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ && node node_modules/electron/install.js`。

## 数据与隐私

Aiflow **本地优先**，所有数据都在你自己的机器上：

| 位置 | 内容 |
|---|---|
| `~/.aiflow/aiflow.db` | SQLite：画布 / 话题 / 轮次 / 消息 |
| `~/.aiflow/config.json` | Provider 配置与 UI 偏好（**不含密钥**） |
| `~/.aiflow/auth.json` | 经 `safeStorage` 加密后的 API Key（密文） |

- 除你主动调用的模型接口外，应用**不向任何第三方上传数据**；
- 渲染进程开启了 `contextIsolation` + `sandbox`，并设置了严格 CSP，**拿不到密钥也无法直连外网**；
- 可用环境变量 `AIFLOW_HOME` 覆盖数据目录。

## 项目结构

```
src/
├─ main/         Electron 主进程：窗口、IPC 注册、services(session/credentials)
├─ preload/      contextBridge 暴露 window.api（渲染进程唯一入口）
├─ shared/       领域类型 + Zod IPC 契约 + 常量（main / renderer 共用）
├─ core/         纯逻辑，可单测
│  ├─ config/      配置读写
│  ├─ secrets/     safeStorage 密钥加解密
│  ├─ db/          Drizzle schema + 各仓库 repos
│  ├─ llm/         OpenAI 兼容流式客户端
│  ├─ context/     上下文构建与渲染
│  └─ token/        token 估算与分支/画布聚合
└─ renderer/     React UI：store + features(Sidebar / GraphCanvas / TreeCanvas / NodeDetail / Settings …)
tests/           Vitest：单元测试 + 基于 Mock OpenAI 的会话集成测试
```

### 架构要点

- **进程隔离**：只有 preload 能触达 `window.api`；主进程通过 **Zod 校验**每一个 IPC 请求（`src/shared/contract`），密钥仅存在于主进程。
- **纯逻辑与副作用分离**：`src/core` 不依赖 Electron，上下文构建、token 聚合、LLM 客户端都是可单测的纯函数。
- **上下文策略**：`buildContext` 按 `system → 根锚点 → 压缩摘要 → 祖先话题链 → 当前话题已有问答 → 本轮问题` 的固定顺序拼装，天然利于前缀缓存；兄弟分支内容不会进入上下文。
- **生成并发控制**：同一轮同时只允许一个生成任务，生成期间 UI 锁定相关操作。

## 状态与路线图

**里程碑 A 已完成**：脚手架、配置与密钥、SQLite 数据层、OpenAI 兼容流式客户端、
上下文构建（祖先链 + 前缀缓存友好 + compact）、token 记账、会话服务、IPC、UI 壳，
**图皮肤（React Flow）与树皮肤均可用**。

- [ ] **文件树皮肤**（数据同源，仅换视图）
- [ ] 代码锚点完善（选中代码片段作为话题锚点）
- [ ] 到达上下文窗口 ~70% 的**自动提示压缩**
- [ ] 跨节点**全文检索**（SQLite FTS5，默认不注入上下文）
- [ ] 导出（Markdown / Markmap / Obsidian）
- [ ] 更多 Provider 预设与本地模型

## 参与贡献

欢迎提 Issue 与 PR。提交前请确保：

```bash
npm run typecheck && npm test
```

## License

[MIT](./LICENSE)。若仓库中暂无 `LICENSE` 文件，请在上传前补充。
