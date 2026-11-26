# Templatical 构建产物补丁

`assets/index-Csx8wBLZ.js` 是 Templatical 的构建产物。为支持变量锚点，在初始化调用中增加：

```js
mergeTags: { syntax: "handlebars" }
```

原调用：

```js
W5({ container: "#editor", content: t, shadowDom: false, onChange(e) { vu = ""; } })
```

补丁后：

```js
W5({
  container: "#editor",
  content: t,
  shadowDom: false,
  mergeTags: { syntax: "handlebars" },
  onChange(e) { vu = ""; }
})
```

作用：

- `{{key}}` 在正文中渲染为 protected merge tag chip
- `setContent()` 载入带 `data-merge-tag` 的内容时也能恢复 chip
- 保存草稿时把 chip 归一化成 `{{key}}` token_html

重新构建 Templatical 后需要重新应用此补丁。
