# Contributing / 参与贡献

欢迎提交问题、使用体验、素材需求、文档改进和代码 Pull Request。请先搜索已有 Issues，避免重复。

## 代码

1. Fork 仓库，创建分支。
2. 修改 `src/`，打开 `src/index.html` 调试；不要加入远程字体、CDN、遥测或必须联网的运行时依赖。
3. 安装 `requirements-dev.txt` 并运行 `python tests/run_all.py`，执行 `python build.py`。
4. PR 中说明问题、改动效果、验证方式，界面变动请附图。不要提交 `work/`、`outputs/`、密钥或个人工程文件。

代码贡献采用 MIT。涉及文件格式的修改需明确兼容与迁移方案。不要在未经校验的用户 SVG 中执行脚本。

## 科研素材

欢迎原创细胞、细胞器、膜结构、组织、实验设备等 SVG。推荐每个素材单独一个 SVG，具有 viewBox，避免外链字体与外部图片。附名称、中英文关键词、分类、作者、来源和许可；可提供预览与科学含义说明。

优先接收愿意按 CC0-1.0 提供的原创基础素材。第三方素材须提供可核验的再分发授权。不要上传从商业素材库下载后无法再分发的图标，不要把位图包装成 SVG 后称为可编辑矢量。

用户可自行导入 `.sciassets` 包；合入内置库前应检查科学准确性、风格、授权、渲染和导出表现。

## English

Issues, documentation, code and original scientific SVG assets are welcome. Explain what changed and how you tested it. Keep the runtime offline-capable. Never commit secrets or private projects. Code contributions are MIT; original icon contributions should clearly state their license, preferably CC0-1.0. Include attribution and redistribution permission for third-party assets.
