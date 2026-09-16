# 长期记忆引擎选型研究

日期：2026-09-17
方法：查仓库页面、LICENSE、包元数据、源码文件与 curl 实测状态码。
**区分「文档声称」与「代码佐证」**；查不到就写「未查到」，不猜测。

---

## 一、两条前提已失效（研究前必须知道）

研究任务下达时的前提里，有两条已经过时，直接影响选型：

### OpenMemory：已归档，且仓库名被挪用

- 原 OpenMemory（自托管 MCP server + dashboard）于 commit `b0bfce4b`（2026-07-23）
  被移入 `openmemory-archive/`，备注「Read-only, no longer maintained」
- 归档 README 里的安装命令 `raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh`
  **实测返回 HTTP 404**；`mem0ai/mem0/openmemory/` 目录同样 404
- `mem0ai/openmemory` 这个仓库现在装的是一个**完全无关**的项目
  （跨 Claude Code / Codex 迁移会话的 CLI），与记忆无关
- 同门 `mem0ai/mem0-chrome-extension` 亦已 `archived: true`

**结论：直接淘汰。**

### Letta：已重写为 TypeScript 并迁移仓库

- `letta-ai/letta` 现在根目录只有 10 个文件，**没有任何源码**。
  README 原文：「The current source code lives in `letta-ai/letta-code`」
- 旧 Python V1 服务端留在 `archive` 分支，PyPI `letta` 冻结在 0.16.8（2026-05-14），
  官方明确「will not shepherd community issues or pull requests in the archived code」
- 现在的 Letta 是 npm 包 `@letta-ai/letta-code`（TypeScript）

**结论：若要评估 Letta，对象是 `letta-code` 而不是原仓库。**

---

## 二、对比

| | Mem0 | Letta（letta-code） | OpenMemory |
| --- | --- | --- | --- |
| 许可证 | Apache-2.0，无附加条款；贡献需签 CLA | Apache-2.0 + 品牌资产排除条款；另有约束**服务**的 TERMS.md | 归档快照 Apache-2.0 |
| 维护 | 极活跃（最后 commit 2026-09-16） | 极活跃（v0.32.12，4 天 5 版） | **已死**（归档即最后一次提交） |
| 部署依赖 | 库模式零外部服务（嵌入式 Qdrant + SQLite）；服务器模式强制 Postgres | 本地模式零外部服务、无登录 | 需 Docker Compose + OpenAI Key |
| 本地模型 | **最强**：`lmstudio.py` 默认就是 `http://localhost:1234/v1`，另有 Ollama / vLLM / 通用 OpenAI 兼容 | 支持 LM Studio / Ollama / llama.cpp，默认 URL 精确 | 要求 OpenAI 云 API |
| 语言 | Python 为主，有官方 TS SDK | TypeScript（引入的是整套 agent harness） | — |
| 导出 | 无内置导出命令，JSON 化几行代码 | **最好**：Markdown + YAML frontmatter + 本地 git 仓库 | — |
| 提取机制 | 调 LLM 自动总结（两段式 prompt） | agent 自己撰写 Markdown | — |

### 三个关键事实

**① 没有一家默认离线。** Mem0 的 `telemetry.py` 默认向 PostHog 发数据，
且 `notices.py` 会在 `add()` / `get()` 路径上拉 GitHub 上的 JSON；
Letta 的 CLI 遥测默认 POST 到 `api.letta.com`。两者都需显式关闭
（`MEM0_TELEMETRY=False` / `LETTA_CODE_TELEM=0`）。

**② 没有一家有「人工审核」门禁。** 这是最关键的一条：

- Mem0：`add()` 后立即生效。对约 64KB 的 prompt 文件 grep
  `confidence|source|provenance|human review|approv`，**命中数为 0** ——
  无置信度、无来源标注、无待审核状态
- Letta：记忆由 agent 自行撰写编辑，文档明确说复核设置
  「does not ask you for approval」

**③ Letta 是完整 agent 平台，不是记忆层。** TUI、桌面应用、App Server、
多智能体、MCP client、crons、permissions 引擎……接入它等于接入一整套运行时。

---

## 三、决定：自建最小记忆层

**不引入上述任何一个。** 理由不是偏好，而是可验证的：

1. **决定性需求它们都不提供。** 「人工审核后再生效」在 Mem0 与 Letta 里
   **不是文档没写，而是代码里没有这个概念**。而这恰是本项目三层模型的基石。
2. **本项目已经自建完成。** KB-001～KB-006 已实现：`pending → approved` 状态机、
   来源追溯（对话/档案）、知识库关联、统一检索排除待审核、审核界面。
   再引入一个不含审核概念的系统，只会与它冲突。
3. **需要的三块能力都很小。** ① 落盘（已有 SQLite）；② 嵌入调用 ——
   本机 LM Studio 的 `/v1/embeddings` 就是一次 `fetch`；
   ③ 抽取 prompt。第 ③ 块可以直接借鉴（见下）。
4. **相反的成本是实打实的。** Mem0 库模式引入 Python 侧车或 TS SDK 的一串依赖，
   Letta 引入整套 agent 平台 —— 都违反「零新依赖优先」。

## 四、值得借鉴的一条设计（Apache-2.0，注明来源）

Mem0 的 `ADDITIVE_EXTRACTION_PROMPT` 里有两点设计得不错，
将来给本项目加**自动抽取**时应采用：

1. **ADD-only + `linked_memory_ids` 互链** —— 不做就地改写，只追加并互链。
   追加式比「让 LLM 决定 UPDATE 还是 DELETE」可审计得多：
   后者一旦判错就是静默篡改历史。
2. **相对时间必须锚定成绝对日期** —— 原文理由是
   「User went to Paris last week」六个月后毫无用处。
   这条对本项目尤其重要：记忆要长期保存，而相对时间会随时间失真。

来源：`mem0ai/mem0` 的 `mem0/configs/prompts.py`，Apache-2.0。
本项目只借鉴设计思路，不复制代码。

## 五、未核实事项

- letta-code 的 CONTRIBUTING 中未搜到 CLA 要求，但可能存在 CLA bot 层要求，未能从外部核实
- Letta 旧 Python V1 服务端是否仍可自托管：代码在 `archive` 分支，官方不建议
- 开放 issue 数为当前快照，且含 PR

## 六、若将来仍要用现成的

- 只要「LLM 自动抽取 + 本地模型 + 最省事」→ **Mem0**（优先 TS 版避免 Python 侧车），
  审核门禁做在调用方，务必设 `MEM0_TELEMETRY=False`
- 想要「agent 自主维护、Markdown + git 记忆、事后 diff 复核」→ **Letta Code 本地模式**，
  需接受它是 agent 平台并设 `LETTA_CODE_TELEM=0`
