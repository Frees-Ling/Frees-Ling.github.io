# 项目说明

Frees Ling 的个人数字花园，使用 Astro 构建并部署到 GitHub Pages。
当前站点源码位于仓库根目录，旧版工程已归档到 `archives/sites/Frees-Blog/`。

## 开始工作前

先阅读：

1. `docs/execution/STATE.md`
2. `docs/execution/TASKS.md`
3. `docs/execution/MASTER_PLAN.md`
4. 当前任务对应的产品、架构或设计文档

文档分工与入口见 `docs/README.md`。不要依赖聊天上下文或临时任务列表保存长期状态。

当文档与仓库现状冲突时，先核实当前代码、Git 历史与测试结果，再修正文档并记录重要决策；
不要静默偏离。

## 开发

启动开发服务器请使用后台模式：

```
astro dev --background
```

用 `astro dev stop`、`astro dev status`、`astro dev logs` 管理后台服务器。

包管理器统一用 **npm**（根目录有 `package-lock.json`）。
`archives/sites/Frees-Blog/` 里的 `pnpm-lock.yaml` 是旧工程的残留，不要混用。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建产物并生成 Pagefind 全文搜索索引 |
| `npm run check` | Astro / TypeScript 类型检查 |
| `npm run lint` | Biome 检查 `.ts`、`.css`、`.json` |
| `npm run lint:md` | markdownlint 检查 `src/content/posts/*.md` |
| `npm run format` | Prettier 格式化 |
| `npm run format:check` | 检查格式，不写入 |

改动完成后请确认 `format:check`、`lint`、`lint:md`、`check`、`build` 全部通过。
CI（`.github/workflows/quality.yml`）会逐项执行这些命令。

## 提交约定

改动完成后**主动提交**，不要让改动滞留在工作区：

1. 先跑校验，全部通过再提交：`npm run format:check`、`lint`、`lint:md`、`check`
2. 提交信息用中文，讲清**为什么改**，而不是罗列改了哪些文件
3. **不要 push** —— 上线由维护者审核后手动推送（`git push` 已配置为需确认）

完成可独立验收的计划任务时，同步更新 `docs/execution/TASKS.md` 的 Evidence/Commit 与
`docs/execution/STATE.md`。影响长期架构的决定写入 `docs/execution/DECISIONS.md`。

`.claude/hooks/stop-commit.sh` 会在每轮回复结束时兜底：若发现未提交的改动，
它同样会先跑上述校验，通过才提交（信息形如 `chore: 自动提交 N 个文件`）。
正常情况下轮不到它出手，它只是防止改动长期滞留。

## 关键约定

以下几条是**反直觉**的，改动前请先读完原因。

### 不要格式化 `.astro`

`.astro` 的内联 `<style>` 块按可读性手工折行，模板标记也是。
`.prettierignore` 已排除它们，**不要移除该排除项**。实测把 Prettier 套上去
会让 `src/` 从 627 行膨胀到 3300 行（+425%）。

样式文件（`src/styles/*.css`）**不在排除之列**，它们走 Prettier 正常格式化 ——
P3 已把原先的单体 `global.css` 拆为 `tokens.css` / `base.css` / `primitives.css` /
`prose.css`，拆分后即采用常规多行格式。

### 不要移除 `biome.json` 中 `.astro` 的规则覆盖

该覆盖关闭了 `.astro` 的 `noUnusedImports` 与 `noUnusedVariables`。
原因是 Biome 只解析 `.astro` 的 frontmatter，看不到模板部分，会把模板里
确实在用的变量和组件导入误报成未使用 —— 实测这两条规则在 `.astro` 上的
62 条诊断**全部**是误报（38/38 与 24/24）。

更危险的是它们标记为 **unsafe autofix**：照它执行 `biome lint --write`
会删掉真实在用的 import，直接导致构建失败。

这两条规则在 `.ts` 文件上工作正常，因此只对 `.astro` 关闭。

### 归档目录只读

`archives/` 与 `public/history/` 是只读历史归档（见 `archives/README.md`），
不要在其中做任何改动。`.claude/settings.json` 的 deny 规则与
`.claude/hooks/protect-paths.sh` 会阻止写入，这是有意设计的。

### 站点样式

全站样式分两处：`src/styles/` 下的四个全局文件
（`tokens.css` / `base.css` / `primitives.css` / `prose.css`）
与各 `.astro` 的内联 scoped `<style>`。没有引入 Tailwind 或 CSS 框架。

**颜色字面量只允许出现在 `tokens.css`**，由 `npm run check:tokens` 强制。
该脚本还会检查 `var()` 引用完整性 —— CSS 变量引用未定义时**完全不报错**，
属性会静默失效，所以这条闸门不能绕过。

### 密钥与外部服务

不得把 API key、WebDAV 密码、Cloudflare/GitHub token、TOTP seed、备份密钥写入 Git、
公开前端、SQLite 明文、浏览器存储、日志、截图或测试夹具。供应商能力与限制可能变化，
实现前必须核对当前官方资料，并把结论记录到 `docs/research/OPEN_QUESTIONS.md` 或决策记录。

## 文档

Astro 完整文档：[docs.astro.build](https://docs.astro.build)

动手前按主题查阅：

- [页面、动态路由与中间件](https://docs.astro.build/en/guides/routing/)
- [Astro 组件](https://docs.astro.build/en/basics/astro-components/)
- [React、Vue、Svelte 等框架组件](https://docs.astro.build/en/guides/framework-components/)
- [内容集合与内容管理](https://docs.astro.build/en/guides/content-collections/)
- [样式](https://docs.astro.build/en/guides/styling/)
- [多语言支持](https://docs.astro.build/en/guides/internationalization/)
