# Bucketlist Movies

## 目标

把原来的“收藏”占位页改成 `Bucketlist`，第一阶段提供 Movies 清单。页面保留现有 Astro/React 架构和视觉语言，后续再逐步增加 TV Shows、Books、Destinations。

## 范围

- 使用本地内容集合 `src/content/bucketlist/catalog.json` 保存固定的 IMDb Top 250 快照。
- 仅在页面展示公开的电影元数据和 IMDb 官方链接，不在运行时抓取 IMDb。
- 支持标题、年份、类型、简介搜索。
- 支持四个分类入口；Movies 当前启用，其余分类显示为后续预留状态。
- 每页显示 10 条，支持页码、上一页、下一页。
- “已看/未看”只保存在当前浏览器的 localStorage，不上传服务器。

## 不做

- 不引入数据库、CMS、重量级搜索服务或新的运行时依赖。
- 不把 IMDb 页面或图片作为服务端抓取源。
- 不修改认证、BFF、helper 后端和部署拓扑。

## 验收标准

- `/bucketlist/` 可打开，导航顺序为：文章、笔记、项目、导航、金融、Bucketlist、关于。
- `/favorites/` 保留兼容跳转到 `/bucketlist/`。
- 桌面端一行一部电影，移动端不横向溢出；标题可打开 IMDb 官方页面。
- 搜索、分类按钮、分页和已看状态可用；刷新页面后已看状态仍保留。
- `pnpm build` 通过，且不新增密码、Token、API Key、个人敏感信息或第三方运行时请求。

## 数据说明

IMDb 榜单会变化，因此 `catalog.json` 是一个需要人工维护的快照，而不是实时榜单。本次快照参考 [IMDb Top 250](https://www.imdb.com/chart/top/?hl=en)，页面不在运行时抓取 IMDb；IMDb 的公开数据使用也应遵守其[数据使用说明](https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX)。数据字段保持可扩展，后续可以逐条补充中文片名、片长、海报和准确的 `imdbId`。页面会对缺失信息显示温和的占位，不伪造精确数据。
