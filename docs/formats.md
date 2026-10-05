# 文件格式版本 1

以下是说明用精简示例。每次不兼容变更必须提升 version，并提供显式迁移；不应默默按旧结构加载。

## 工程 .json / .scifigure

```json
{
  "format": "scifigure-project",
  "version": 1,
  "id": "project-unique-id",
  "name": "膜结构示意图",
  "createdAt": "2026-10-05T00:00:00Z",
  "updatedAt": "2026-10-05T00:00:00Z",
  "canvas": {"width": 1200, "height": 800, "background": "#ffffff"},
  "scene": {
    "defs": "",
    "body": "<g data-item=\"item-1\" data-name=\"文字\" data-kind=\"text\" transform=\"translate(100 100)\"><text font-size=\"24\">示例</text></g>"
  }
}
```

顶层 item 数据：`data-item` 唯一编号，`data-name` 图层名，`data-kind` 为 text/icon/shape/line/group，`data-locked="true"` 禁止画布操作，`data-hidden="true"` 配合 `display="none"` 隐藏。保留文字为 text/tspan。defs 和 body 是同一 SVG 引用作用域。

导入工程会分配新的项目 ID，避免覆盖已有项目。前版 `biology-svg-editor` version 1 可以导入并迁移。

## 素材包 .sciassets

```json
{
  "format": "scifigure-assets",
  "version": 1,
  "name": "细胞膜结构素材包",
  "assets": [{
    "id": "membrane-001",
    "name": "磷脂双分子层",
    "category": "细胞膜",
    "tags": ["membrane", "phospholipid", "磷脂"],
    "author": "作者署名",
    "source": "来源或说明",
    "license": "素材自己的许可声明",
    "favorite": false,
    "createdAt": "2026-10-05T00:00:00Z",
    "updatedAt": "2026-10-05T00:00:00Z",
    "width": 100,
    "height": 100,
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"20\" fill=\"#72b6c5\"/></svg>"
  }]
}
```

尺寸从实际 SVG 归一化得到，不盲信输入 width/height。包完整验证通过后才写入事务。相同 id 在包内或现有库中冲突时重新编号。导出素材包包含全部素材，搜索和收藏筛选不会造成遗漏。矢量中的定义引用在导入及画布插入时重新编号。

## 绘制建议

每个素材使用正确 viewBox，适量分组，颜色用常规 fill/stroke 或内部渐变。不要依赖网页外链图像/字体，不要把整个图标栅格化后包装成 SVG。文字保留 text 便于编辑，但导出显示取决于目标机器字体。主题色、膜结构参数等未来扩展可放在有明确命名空间的附加元数据中，新增功能需明确兼容规则。
