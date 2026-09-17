# 会话报告 · 2026-09-17

用户指令：**暂停开发，写报告，全线停止。**

---

## 一、停止状态（全部已执行）

| 项 | 状态 |
| --- | --- |
| 自主开发循环（每 15 分钟的 cron） | **已取消**（job `39693bc7`） |
| 我起的 preview 服务（PID 33121，端口 4399） | **已停止** |
| 我起的 python 静态服务 / 无头浏览器 | **无残留**（探测脚本都在 finally 里关闭） |
| 工作区 | **干净**，无未提交改动 |

**刻意没动的两个进程**（不是本会话起的，避免误杀）：

- PID 7897 —— `Blog-v2` 的 preview，9 月 15 日启动
- PID 12164 —— 本项目的 `astro dev`，9 月 15 日启动

**按指示未触碰的 5 个未跟踪文件**：

```
studio/backup/transport.mjs
studio/backup/local-transport.mjs
studio/backup/local-transport.test.mjs
studio/backup/transport-conformance.mjs
studio/backup/webdav-conformance.test.mjs
```

---

## 二、本会话完成的提交

本地领先 `origin/main` **4 个提交**，其中 **3 个是本会话的**：

| 提交 | 内容 |
| --- | --- |
| `d14179f` | 治理收口：部署依赖质量、自动提交不再越权、lint 归零 |
| `ab936f0` | 站点实况审查：项目页接入真实入口，纠两条误报 |
| `afbed84` | KNOW-002：研究与审查流水线 |

> `f199dcf`（docs: 重建双层文档入口）**不是本会话的** —— 它来自另一个会话或 Agent。
> 这正好印证了多 Agent 场景的真实性，也是治理收口里 Stop hook 改动要解决的问题。

**未 push**（ADR-010）。线上仍是 `a66c5f4`（PERF-001）。

---

## 三、三件提交各自解决了什么

### 1. 治理收口（`d14179f`）

三件事有一个共同点：**此前的「通过」是假的通过。**

- **部署会在质量没跑完时进行。** `quality.yml` 与 `deploy.yml` 都监听 push，
  各自跑各自的，一次失败只出现在两条流水线中的一条上。
  改成 `deploy` 用 `needs: quality` 依赖质量 —— 检查不过时 build 与 deploy
  根本不会开始。
- **自动提交会把别人的改动一起提交。** Stop hook 的 `git add -A` 看不到改动
  来源，未跟踪文件尤其危险。改成必须声明自己拥有的文件，多出别的改动就跳过并报告。
- **lint 退出码为 0 却输出 48 条诊断。** 等于把「通过」定义成「没到失败的程度」。

同时把 `check:tasks` / `check:coverage` / `check:preview` 补进 CI，
新增 `check:projects` 与 `check:offline`（断网真跑一次构建）。

### 2. 站点实况审查（`ab936f0`）

用真实浏览器逐页核对，**纠了两条不成立的指控**：

- 关于页「旧 Fuwari 风格残留」**不成立** —— 线上已是新版，`fuwari` 出现 0 次
- 归档页体积异常**不成立** —— 15.8 KB / 198 节点 / 34 ms

真正的重量级页面是 `blog/transformer/`：**1412 KB、31,753 个 DOM 节点**，
其中 190 KB 是 Shiki 给每个 token 写的内联 `style`。用户遇到的「读取错误」
来自它，被误记到了归档页头上。

项目页原先**链不到任何地方**，现接入真实文章入口与诚实的仓库状态。

### 3. KNOW-002 研究与审查流水线（`afbed84`）

迁移 v11 + 25 项测试。核心是把**「AI 不可绕过人工发布」写成数据库 CHECK 约束**，
而不是应用层约定。

踩到一个 SQL 三值逻辑的坑，**是我自己的用例抓到的**：
`CHECK (... OR decided_by = 'human')` 在 `decided_by` 为 NULL 时求值为 NULL，
而 NULL 不算违反约束 —— 整个约束形同虚设。必须是空值安全的 `IS`。

---

## 四、需要你决定的三件事

### PENDING-003 — 归档目录的 Dependabot 告警噪音

`dependabot.yml` 的 `exclude-paths` **只挡版本更新 PR、挡不住告警**
（已核对官方文档）。依赖图不支持按路径排除，所以**无法从仓库配置解决**。
需要你在仓库 Settings 里建一条 auto-triage 规则（按 manifest path 匹配，
动作选 dismiss）—— 那个只能从 UI 建，没有 API 也没有配置文件。

### PENDING-004 — 未提交的 transport 文件里有一个已复现的越界缺陷

`studio/backup/local-transport.mjs` 的**符号链接绕过已实测确认可利用**：
在备份根目录放一个指向外部的符号链接，`put` 会写到根目录之外。
词法检查（`resolve` + `startsWith`）看不出符号链接。

三个选项：**保留并修** / **丢弃** / **先放着**。

⚠️ 无论选哪个都要知道：那批文件里的越界用例**本身是空转的** ——
突变测试证明去掉防线不会让用例变红。真要保留，用例得一起重写。

### PENDING-001 / PENDING-002 — 之前就挂着的两项

- 归档只读保护改用 `chmod -R a-w`，并删掉会自我阻塞的 Bash 钩子
- DeepSeek 凭证轮换（需你本人操作）

**本会话又撞到两次钩子自阻塞**：一次是读取归档目录状态的 `git status`
被拒（纯只读），一次是**提交信息里提到归档路径**被拒。都不是真的在写归档。

---

## 五、当前任务全景

**52 项：已完成 39 · 可开工 6 · 阻塞 7**

### 可开工

| 任务 | 优先级 | 说明 |
| --- | --- | --- |
| `CRED-001` | P0 | **执行者是你**：提供 WebDAV 三个 endpoint 与凭据 |
| `COLLECT-001` | P0 | Collection threat model 与协议（**本次被打断在这里**） |
| `CONTENT-001` | P1 | 内容发布契约（连带解锁 INTEG-001/002） |
| `MEDIA-002` | P1 | 响应式公开派生物 |
| `MEDIA-003` | P2 | AI 生图适配器 |
| `KNOW-003` | P2 | 公开批注与讨论 |

### 一条链卡住 7 项

`CRED-001` → `WEBDAV-002` → `COLLECT-002` / `RECOVERY-001` / `VAULT-001`
→ `RECOVERY-002`。**I2/I3/I4/R2 四条轨道全部压在 WebDAV 凭据上。**

### 各轨道完成度

已完成：G0、W1、W2、W3、S1、S2、S3、S4、**K1、K2（本次收口）**、K4、R1

- **W4** 0/1 · **M1** 1/2 · **M2** 0/1
- **I1** 0/2 · **I2** 0/2 · **I3** 0/1 · **I4** 0/2 · **R2** 3/5

---

## 六、下次从哪里继续

**推荐起点：`COLLECT-001`** —— 它是 P0、已解锁，本次刚读完背景材料就被打断，
上下文还热。

已核实的现状（避免重复开发）：

- `docs/architecture/SECURITY_MODEL.md` 第 4 节**已有**一个 Collection 威胁模型，
  但那是**摘要**（必须防什么 + 最低控制清单）
- 验收要的是**逐项协议 + 测试计划**：隔离 / 令牌 / 限额 / 过期 / 删除 /
  Owner 查看 / 大文件数据面 / 滥用控制
- 可复用的既有实现：`studio/access/tokens.mjs`（令牌哈希存储、作用域、
  默认拒绝）、`studio/research/pipeline.mjs`（审查队列模式）
- `docs/product/PRODUCT_SPEC.md` 第 8 节、`docs/architecture/DATA_MODEL.md`
  第 83 行、`docs/execution/TEST_MATRIX.md` 第 34 行都有 Collection 条目

**必须先面对的一个架构前提**：`docs/research/webdav-provider.md` 已记录 ——
123 云盘 WebDAV 的专用密码权限边界**未知**，若它实际能访问整个网盘，
则「三个 endpoint 用独立凭据最小权限隔离」这个设想**在 WebDAV 上可能不成立**。
协议里不能假定它成立。

---

## 七、一条贯穿本会话的教训

三个提交里最值得记住的都不是功能本身，而是**「验证本身失效」**：

- 变异测试发现我写的越界用例**是空转的**（去掉防线也不变红）
- `astro build` **缓存渲染好的 markdown**，换 rehype 插件不会失效 ——
  我据此做的变异验证给出过「一切正常」的假结论
- 闸门**跳过了 `_astro/`**，于是只统计到 104 KB，
  而用户真正下载的 432 KB 一个没算
- `sandbox-exec --version` 不存在，用它探测会让断网验证**永远走「跳过」分支**
- SQL 的 `CHECK` 在 NULL 上求值为 NULL，**不算违反约束**

每一个都是「看起来做了验证，实际没有」。
