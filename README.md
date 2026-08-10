# 项目雷达 GitHub Pages 看板

公开、只读的静态测试页面。它读取 `data/projects.json`，展示最近30天的脱敏公告，并支持按标题/编号、编号范围、标题类型、公告状态和日期筛选。

## 本地查看

不能直接双击 `index.html`，因为浏览器通常不允许本地页面读取 JSON。请在项目目录启动一个静态文件服务：

```bash
python3 -m http.server 8080
```

然后访问 `http://127.0.0.1:8080/`。

## 验证

项目没有第三方依赖，Node.js 20+ 仅用于运行测试：

```bash
npm test
npm run check:data
```

测试覆盖30天边界、组合筛选、重复ID、数据新鲜度和军队采购网链接白名单。

## 数据约定

`data/projects.json` 使用 `schema_version: 1`，包含：

- 根字段：`generated_at`、`last_success_at`、`projects`。
- 项目字段：`id`、`title`、`project_number`、`matched_prefix`、`purchase_method`、`region`、`published_date`、`notice_kind`、`matched_keyword`、`source_url`、`first_seen_at`、`last_seen_at`。
- `matched_prefix` 只能是 `JQ06-W` 或 `JQ01-W`。
- `notice_kind` 只能是 `new`、`change` 或 `baseline`。
- `source_url` 仅允许 HTTPS 的 `plap.mil.cn` 及其子域名；其他链接不会变成可点击链接。
- 可选根字段 `is_sample: true` 会在页面上显示“脱敏示例数据”提示。

当前 JSON 是脱敏示例，服务器首次发布真实数据时应删除 `is_sample`。

## GitHub Pages 发布

1. 创建公开仓库 `procurement-radar-pages`。
2. 将本目录推送到仓库的 `main` 分支。
3. 在仓库 `Settings → Pages` 中选择 `Deploy from a branch`、`main`、`/(root)`。
4. 先使用 GitHub 提供的 `github.io` 地址，不绑定备案中的域名。

此仓库只能包含静态页面和脱敏 JSON。不得提交爬虫代码、SQLite、Token、Cookie、联系人、附件、公告正文、内部备注、厂家或报价信息。
