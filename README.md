# Frees Blog

Frees Ling 的个人数字花园与 FREES / FIELD LOG 公共站，使用 Astro 构建并部署到 GitHub Pages。

长期方向还包括本地优先的 Frees Studio、Knowledge Engine、媒体与恢复系统；它们目前处于规划阶段，
不能把目标架构误认为已实现。产品范围、当前状态与下一任务见 [`docs/README.md`](docs/README.md)。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run format:check
npm run lint
npm run lint:md
npm run check
npm run build
```

文章位于 `src/content/posts/`。构建会同时生成全文搜索索引、RSS、站点地图和静态页面。
