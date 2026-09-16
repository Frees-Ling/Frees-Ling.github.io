# 长期记忆服务契约（MEM-001）

日期：2026-09-17
实现：`studio/memory/service.mjs`
上游：ADR-023（自建，不引入第三方记忆引擎）、`docs/research/memory-engines.md`

本文是记忆层的真相源。它定义接口、三条不可让步的规则，以及
「换引擎」在本项目里到底指什么。

---

## 一、三层模型：三张表，字段不混用

| 层 | 表 | 是什么 | 谁写 |
| --- | --- | --- | --- |
| 原始档案 | `archive_entries` | 完整历史与来源，**不可被摘要替代** | 导入（增量、幂等） |
| 长期记忆 | `memories` | 从档案提取的偏好、背景、决策 | AI 提议 + **人工确认** |
| 知识库 | `notes` | 已整理的正式内容 | 人写，或 AI 起草后人工转正 |

**「分离」不是指三张表，而是指字段不互相塞。** 有一条测试专门守这件事：
记忆表里不出现 `title`（它不是条目），知识库表里不出现 `confidence`
（条目不携带置信度）。三张表但字段互相塞，那还是混在一起。

层与层之间的连接是**显式外键**，不靠字段复用：

```
memories.source_entry_id   → archive_entries   （来自哪份档案）
memories.source_message_id → messages          （来自哪条对话）
memory_notes               → notes             （在哪几篇笔记里被印证）
```

两处删除语义是刻意的：`source_entry_id` 与 `source_message_id` 都是
`ON DELETE SET NULL` 而不是 `CASCADE`。**删掉一段对话不该销毁它产生的结论** ——
那等于用一次清理动作丢失一条已确认的事实。来源没了就置空，记忆还在。

---

## 二、三条不可让步的规则

### 规则 1：AI 提取的内容一律是 `pending`

`add()` 是**唯一的写入路径**，它没有「直接写 approved」的入口。
`proposeMemory` 的插入语句里 `status` 是写死的 `'pending'`。

这条不是约定，是数据层的强制 —— 审核门禁若只是一个调用方记得遵守的约定，
迟早会有第二个调用方不遵守。

### 规则 2：纠正靠追加，不靠改写

```
correct(oldId, { content }) → { previous, current }
```

新写一条，把旧的那条用 `superseded_by` 指过去。**旧的那条留着。**

就地 `UPDATE` 一条已确认的记忆等于**静默篡改历史**：昨天的结论被今天的
覆盖，没有任何痕迹说明它变过；一旦改错，连「原来的说法是什么」都查不回来。
`supersessionChain(id)` 能从任意一环出发走到最新，还原完整演化史。

`correct()` 写出的新记忆直接是 `approved` —— 因为纠正这个动作本身就是人的
判断，而审核门禁防的是「AI 自动总结被当成事实」，不是防人。但只有
**已确认**的记忆才能被纠正：纠正一条还没生效的、或已被拒绝的东西没有意义。

### 规则 3：被取代的、有冲突的，都不参与检索

```sql
status = 'approved' AND superseded_by IS NULL AND conflict_group IS NULL
```

这三条（`RETRIEVABLE`）集中在一处，关键词检索用它、`exportable()` 用它、
`filterRetrievable()` 也用它。**语义检索的结果必须过 `filterRetrievable()`** ——
各写一份迟早会漂移，而漂移的表现是「换个检索方式就冒出一些不该出现的记忆」。

给模型当依据时把争议当结论用，比不给依据危害更大。

---

## 三、接口

### 写入与审核

| 方法 | 说明 |
| --- | --- |
| `add({ content, sourceEntryId, sourceMessageId, confidence, visibility, source })` | 写入**待审核**记忆。返回 `{ memory, duplicates }` |
| `review(id, 'approved' \| 'rejected')` | 审核。已审核过的会被拒绝 |
| `correct(id, { content, confidence })` | 追加式纠正，见规则 2 |
| `supersessionChain(id)` | 完整演化链 |
| `remove(id)` | 删除，返回是否真的删掉 |

`add()` 的 `source` 参数是 `'user'` 或 `'auto'`，**默认 `'auto'`** ——
保守侧。自动提取会被开关拦截，手动不受影响，见第五节。

### 检索与列举

| 方法 | 说明 |
| --- | --- |
| `search(query, { limit, includeConflicted, visibility })` | 关键词检索，只返回 `RETRIEVABLE` 的 |
| `filterRetrievable(memories)` | 把任意来源的结果过一遍同一组规则 |
| `list({ status, limit })` | 按状态列举 |
| `exportable({ limit })` | 可对外导出的，见第四节 |

### 来源、关联、去重、冲突、可见性

| 方法 | 说明 |
| --- | --- |
| `provenance(id)` | `{ memory, archive, message, notes }` |
| `linkToNote` / `unlinkFromNote` / `notesFor` | 与知识库条目的关联 |
| `findDuplicates(content)` | 规范化后内容相同的记忆 |
| `backfillDedupKeys()` | 回填迁移前写入的记忆的去重键 |
| `flagConflict(ids, { group })` / `clearConflict(group)` / `conflicts()` | 冲突标记 |
| `setVisibility(id, 'private' \| 'exportable')` | 可见性 |

### 自动提取开关

| 方法 | 说明 |
| --- | --- |
| `isAutoCaptureEnabled()` | 读不到配置时返回 **false**（宁可什么都不记） |
| `setAutoCapture(bool)` | 写入配置项 `memory.autoCapture` |

---

## 四、去重与冲突：能确定的做，不能确定的留给人

**去重是算出来的**：内容经 NFKC 规范化、空白折叠、大小写折叠后取 sha256
前 16 位。NFKC 不能省 —— 中文环境里全角半角混用（`（` vs `(`、`１` vs `1`），
不做兼容分解的话内容相同的两条会被算成不同的。

它只做**提示**，不自动合并：`add()` 返回 `duplicates`，合并与否由人判断。

**冲突是标出来的**：`flagConflict` 只支持人工指定。这不只是「暂时没做自动检测」——
判定两句话矛盾需要语义理解，本地没有可靠手段，而**假装能判**会产出
「系统认为它们不冲突」这种没人验证过的结论，那比不判更危险，
因为它带着系统背书的语气。

**可见性默认 `private`**。记忆来自私人对话，默认不对外是唯一安全的默认值。
`exportable()` 还要再过一遍 `RETRIEVABLE` —— 有争议的记忆即使被标为可导出
也不会导出。

---

## 五、自动提取开关：拦自动，不拦手动

开关名叫「自动提取记忆」。人去点「存为记忆」是明确要求，
把两者一起拦掉会变成「我把自动关了，结果手动也存不进去」——
那是这个功能最容易做错的地方，有专门一条用例守着。

`add()` 的 `source` 默认值是 `'auto'`（保守侧），因此将来接自动提取的人
**忘了写参数也绕不过开关**。

**目前没有自动提取器**：唯一的真实路径是用户手动触发的
`POST /api/conversations/:id/memories`，它显式传 `source: 'user'`。
开关现在拦不到任何现存行为 —— 这一点如实记在这里，不假装它已经在工作；
它的价值是让「自动提取」在被接进来的那一天就已经是可关闭的。

---

## 六、「换引擎」在本项目里指什么

ADR-023 已决定自建，不引入 Mem0 / Letta / OpenMemory（理由见该 ADR：
三者都没有人工审核门禁，而那是本项目三层模型的基石）。
因此「可替换」不是指换第三方引擎，而是指**这一层的三个维度都解耦**：

| 维度 | 解耦方式 | 验证 |
| --- | --- | --- |
| 存储 | 全部在 SQLite 表里，无私有格式 | `exportAll` 会带走全部记忆，含被取代与被拒绝的 |
| 检索 | 关键词与向量是两种实现，规则由 `RETRIEVABLE` 统一给出 | `filterRetrievable()` 供语义检索复用 |
| 提取 | `add()` 只接受提议，是否生效由人决定 | 规则 1 的用例 |

**导出完整性**有专门用例：被取代的、被拒绝的记忆也必须在导出里。
导出只带「生效的那些」会让换引擎时丢掉全部历史 —— 而那正是本任务存在的理由。

---

## 七、验收对照

| 验收项 | 落在哪 |
| --- | --- |
| 添加 | `add()`，永远 pending |
| 检索 | `search()` + `filterRetrievable()`，只给可当依据用的 |
| 更新纠正 | `correct()`，追加式 + `supersessionChain()` |
| 删除 | `remove()` |
| 列举导出 | `list()` / `exportable()` / `exportAll()` 含全部记忆 |
| 来源与时间 | `provenance()`，`created_at` / `reviewed_at` / `updated_at` |
| 关联会话或知识条目 | `source_message_id` / `source_entry_id` / `memory_notes` |
| 去重与冲突标记 | `findDuplicates()` / `flagConflict()` |
| 可见性与权限 | `visibility`，默认 private + `exportable()` |
| 可关闭自动记忆 | `isAutoCaptureEnabled()` / `setAutoCapture()` |
| 三层分离且不混字段 | 三张表 + 一条守着字段不互串的用例 |
| 来源、置信、审核状态；允许纠正 | `source_*` / `confidence` / `status` / `correct()` |
| AI 总结不得直接当已验证事实 | 规则 1，`add()` 没有直接写 approved 的入口 |
| 重启后记忆仍在 | 文件库用例，含取代链与冲突标记 |
| 换引擎后可重新索引 | 第六节；导出完整性用例 |
| 可完整导出 | `exportAll()` 用例 |

31 项测试见 `studio/memory/service.test.mjs`。
