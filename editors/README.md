# 邮件编辑器样例

部署在 GitHub Pages 的 6 个开源邮件编辑器在线样例：

- 构建产物：`editors/<name>/`（访问 `/editors/<name>/`）
- 源码工程：`editors/source/<name>/`（已排除 node_modules/.git/.next/out 等）

| 编辑器 | 构建产物 | 源码 | 上游/技术栈 |
|---|---|---|---|
| Templatical | `editors/templatical/` | `editors/source/templatical/` | `templatical/sdk` 的 `examples/react-vite` |
| Easy Email | `editors/easy-email/` | `editors/source/easy-email/` | `zalify/easy-email-editor` |
| Mail Studio | `editors/mail-studio/` | `editors/source/mail-studio/` | `wzc520pyfm/mail-studio` |
| Maily | `editors/maily/` | `editors/source/maily/` | React + Vite + `@maily-to/core` |
| GrapesJS + MJML | `editors/grapesjs/` | `editors/source/grapesjs/` | Vite + `grapesjs-mjml` |
| EmailBuilder.js | `editors/emailbuilder/` | `editors/source/emailbuilder/` | `@usewaypoint/email-builder` |

资源库（纯静态替代后端）：清单源 `editors/resources/library.txt` → 运行
`python3 editors/resources/generate_manifest.py` → 生成 `mailchimp/api/resources`（编辑器请求
`GET /mailchimp/api/resources` 时读取）。

## 隔离设计

每个编辑器都是**独立的 Vite 应用**：

```text
editor-samples/
├── maily/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
├── grapesjs/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
└── emailbuilder/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
```

约束：

1. 每个目录有自己的 `package.json`、依赖、构建配置和源码，**互不 import**。
2. 样例主页只通过 URL 链接进入，不嵌入任何编辑器运行时代码。
3. 每个编辑器独立构建，产物分别落到：

```text
webstatic/mailchimp/maily/
webstatic/mailchimp/grapesjs/
webstatic/mailchimp/emailbuilder/
```

4. 删除或替换其中一个编辑器，不影响另外两个，也不影响 Templatical / Easy Email / Mail Studio。
5. EmailBuilder.js 保留官方示例左侧 Samples 侧栏，图片组件内的资源库入口独立新增。
5. 各编辑器只通过约定好的外部接口与样例交互：
   - 查询参数 `?account=<mailchimp account key>`
   - `POST /mailchimp/api/accounts/{key}/templates` 保存为 Mailchimp 模板
   - 其余能力（导出 HTML/JSON/MJML）在各自应用内完成

## 构建

### Maily

```bash
cd editor-samples/maily
npm install
npm run build
rm -rf ../../webstatic/mailchimp/maily
cp -r dist ../../webstatic/mailchimp/maily
```

### GrapesJS + MJML

```bash
cd editor-samples/grapesjs
npm install
npm run build
rm -rf ../../webstatic/mailchimp/grapesjs
cp -r dist ../../webstatic/mailchimp/grapesjs
```

### EmailBuilder.js

```bash
cd editor-samples/emailbuilder
npm install
npm run build
rm -rf ../../webstatic/mailchimp/emailbuilder
cp -r dist ../../webstatic/mailchimp/emailbuilder
```

## 各编辑器接入说明

### Maily

- 官方 `@maily-to/core` 组件 + `@maily-to/render` 渲染 HTML
- 初始内容为简单文档，可输入 `/` 打开块菜单
- 工具栏：导出 HTML、导出 JSON、保存为 Mailchimp 模板
- 渲染在浏览器完成

### GrapesJS + MJML

- 报告写的 `@grapesjs/mjml` 在 npm 上不存在，实际包名是 `grapesjs-mjml`
- 画布直接使用 MJML 组件，导出 `editor.getHtml()` 即 MJML
- 工具栏：导出 MJML、导出 HTML（`mjml-browser` 编译）、保存为 Mailchimp 模板
- 默认打开 Blocks 面板

### EmailBuilder.js

- 使用官方 `examples/vite-emailbuilder-mui` 示例改造
- 默认加载 `#sample/welcome`
- 原生支持 JSON / HTML 导入导出
- 去掉了 CDN 的 highlight.js 样式，改为本地打包，避免外网依赖

## 与样例的入口约定

样例主页「模板」工具栏中新增：

```text
Maily 可视化编辑器
GrapesJS + MJML
EmailBuilder.js
```

点击时会自动带上当前账号：

```text
/mailchimp/maily/?account=afcc88991218
/mailchimp/grapesjs/?account=afcc88991218
/mailchimp/emailbuilder/?account=afcc88991218
```

账号受保护时，样例会拦截入口；直接打开时保存接口也会返回 403。


## 资源库接入

三个编辑器都接入同一个模拟资源库接口：

```text
GET /mailchimp/api/resources
```

资源清单来自 `mailchimp-demo/resources/library.txt`，图片由 nginx 提供。

| 编辑器 | 入口 | 插入 / 替换行为 |
|---|---|---|
| Maily | 顶部「资源库」；选中图片后按钮变为「替换图片」 | 未选中图片：插入到光标位置；选中 Image / Logo / Inline Image：原地替换 `src` / `alt` |
| GrapesJS + MJML | 顶部「资源库」；`mj-image` 组件设置面板「从资源库选择图片」 | 选中图片时替换 `src` / `alt`；否则追加 `<mj-image>` 到当前 Column |
| EmailBuilder.js | 顶部「资源库」；选中 Image block 后左侧浮动菜单的图片图标 | 从 Image block 打开时替换该 block 的 URL；顶部按钮则追加新 Image block |

隔离说明：三个资源库弹窗、数据加载和插入逻辑分别写在各自工程内部，没有共享运行时模块。
