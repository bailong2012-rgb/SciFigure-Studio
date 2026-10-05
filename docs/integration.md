# Reuse and integration / 使用与集成

## 本地使用与静态部署

完整复制 `src/`，通过浏览器打开 `index.html`，或用任意静态 HTTP 服务发布整个目录。无需后端、API 密钥或构建步骤。GitHub Pages 可部署同样的静态文件，配置见 `.github/workflows/pages.yml`。

浏览器数据库受来源（协议、主机、端口等）隔离。在线版、离线版或不同域名之间不会自动共享图稿。使用工程文件和素材包迁移。

## 嵌入网站

```html
<iframe src="/scifigure/index.html" title="SciFigure Studio"
        width="100%" height="900" style="border:0"></iframe>
```

浏览器的 iframe 存储政策可能影响自动保存；始终保留文件备份。0.1 没有跨来源 postMessage 协议。父页面不能直接调用跨域 iframe 的内部函数。

## 源码级接口

应用就绪后，同一页面内可使用 `window.SF`：

```js
SF.events.addEventListener('app:ready', () => {
  const editor = SF.app.editor;
  console.log(editor.getDocument());
});
```

更多编辑器、素材、存储接口见 [architecture.md](architecture.md)，文件规范见 [formats.md](formats.md)。接口属于 0.1 源码扩展入口，后续可能调整；当前没有远程 REST API、npm SDK 或 AI 服务。

## English

Self-host the complete `src/` directory as static files or open it locally. Embed its `index.html` in an iframe if needed, observing browser storage and same-origin restrictions. The in-page `SF` namespace provides source-level hooks; version 0.1 does not offer a remote API or stable SDK. Projects never synchronize automatically between origins.
