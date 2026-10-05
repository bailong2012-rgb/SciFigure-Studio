# 0.1 架构与扩展接口

## 模块边界

| 文件 | 职责 |
|---|---|
| core.js | SF 命名空间、版本、事件、ID、下载、状态提示、扩展注册 |
| svg.js | 导入 SVG 校验、安全净化、样式展开、ID 与内部引用重映射 |
| storage.js | IndexedDB 项目、设置、素材元数据及独立矢量内容存储 |
| projects.js | 项目 CRUD、串行切换、自动保存与文件往返 |
| assets.js | 素材检索、分页、收藏、编辑、素材包验证与导入导出 |
| editor.js | SVG 场景、仿射变换、手柄、历史、图层与导出 |
| builtins.js | 首次运行种子素材与示例工程，本地静态数据 |
| app.js | 模块装配、启动、画布文件拖入 |

为了支持双击本地 HTML，使用经典 script 顺序加载，而非需要服务器处理跨域的 ES module fetch。未引入 UI 框架，未来可替换 UI，不改变工程/素材数据格式。

## 存储层

`SF.store.ready()` 后调用异步方法：

- 项目：`listProjects()`、`getProject(id)`、`putProject(doc)`、`deleteProject(id)`。
- 素材：`listAssets()` 只返回元数据；`getAsset(id)` 读取完整矢量内容；`putAssets(records)` 批量事务写入；`deleteAsset(id)`；`setFavorite(id, boolean)`。
- 设置：`getSetting(key)`、`setSetting(key, value)`。
- 能力：`persistent` 和 `warning` 表示是否有可靠持久化。

未来桌面文件数据库、同步服务等可实现同样异步接口后注入，不必重写素材 UI。0.1 没有云同步、多人协作或自动在线更新。

## 编辑器接口

`SF.app.editor` 暴露 `getDocument()`、`validateDocument(raw)`、`loadDocument(doc)`、`newDocument({name,width,height})`、`onChange(callback)`、`setName(name)`、`addAsset(asset, position?)`、`addItem(name,markup,kind,position?)`、`select(nodes)`、`exportSVG()`。

应用代码应将未知来源的内容交给 `SF.SVG.normalize` / `sanitizeFragment`，再调用低层 `addItem`。素材文件没有执行 JavaScript 的能力。`validateDocument` 成功后才替换画布，避免坏文件破坏正在编辑的工作。

场景使用顶层 `g[data-item]`。元素的 `transform` 是权威几何状态，允许仿射矩阵；`data-x/y/sx/sy/rotation` 为辅助信息。不要只修改 data 属性而忽略 SVG transform。旋转围绕选中对象整体中心；一次拖动作为一条撤销历史。组合保留内部 SVG，拆组维持变换、图层与文字种类，并移交内部定义。

## 扩展点

```js
SF.events.addEventListener('document:changed', event => {
  // event.detail: { id, reason }
});
SF.events.addEventListener('selection:changed', event => {
  // event.detail.ids
});
SF.events.addEventListener('document:opened', event => {});
SF.events.addEventListener('app:ready', event => {});

SF.registerExporter('custom-format', async document => {
  // 可选导出适配器：读取版本化工程或 SF.app.editor.exportSVG()
});
SF.registerImporter('custom-format', raw => {
  // 返回校验后的素材或工程；调用方负责展示与载入
});
```

注册表为源码级扩展入口。0.1 不提供第三方插件管理器，也不会从素材包运行代码。新增导出器需要开发者接入按钮或菜单。PDF、可编辑 PPTX、路径节点编辑、专业膜结构参数化组件都可作为后续独立模块；当前未实现这些功能。

## 大素材库

元数据与 SVG 分开存储；搜索不加载全部 SVG。页面仅创建当前页 48 张卡片，缩略图按页读取，离开页面释放 Blob URL。可基于 `id/category/tags` 加入全文检索或后台索引。0.1 搜索仍是内存元数据过滤；复杂大规模真实插画库需做额外实测，不能用合成索引测试替代。

稳定资产 ID 用于未来更新；当前素材包重号采取复制为新 ID，避免覆盖私人修改。后续可以增加更新来源、版本差异、显式替换和迁移策略，保留版本 1 兼容导入器。
