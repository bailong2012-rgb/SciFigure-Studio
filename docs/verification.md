# 0.1 验证记录

验证日期：2026-10-05。目标环境：Windows，Edge 与 Chrome，浏览器直接打开本地 file:// 文件，无应用服务器。

## 编辑器验收

`python tests/acceptance.py` 和 `python tests/acceptance.py --browser chrome`。

真实鼠标操作验证顶部手柄旋转 90°、四个角分别缩放、撤销与重做；新建空白项目、中文改名、双击多行文字；复制、对齐、组合/拆组、锁定与隐藏；素材插入与重复引用；SVG 和 3600 × 2400 PNG 导出；工程备份、刷新恢复、无效版本导入不改动当前画布、切回原项目。浏览器脚本错误 0，外部网络请求 0。

## 素材库

`python tests/library_test.py`、`python tests/library-workflow.py`、`python tests/library-workflow.py --app`。

SVG 脚本、事件、外链、foreignObject、动画等被拒绝；内部渐变、裁剪、use、CSS、命名空间与 ID 保留/重映射。批量导入、元数据编辑、收藏、搜索、完整素材包导出（不受筛选影响）、重复编号处理、坏包不部分写入、重新加载、删除。10,000 条合成素材元数据时只创建 48 张当前页卡片；这不是 10,000 个复杂真实 SVG 的性能保证。

## 项目和存储

`python tests/project-tests.py`。

IndexedDB 素材索引和 SVG 内容分开保存；项目新建/改名/复制/删除；修改后立即切项目的保存归属；工程导入分配新 ID；额度不足保留当前场景并报错；无持久化时明确提示临时内存；保存进行中关闭页面的提醒。

## 回归与独立审查

`python tests/regressions.py`。修复并覆盖：微小鼠标抖动不应在未记历史时吸附；CSS 定义的填充/描边/字号可修改；拆组不重复定义渐变 ID；文本在组合后拆组仍可编辑。独立审查复测这些修复及双击、撤销和空白区交互，没有发现该复查范围内的剩余阻断问题。

## 分发检查

`python build.py` 生成便携包和源码包，校验 ZIP 完整性并输出 SHA-256。对便携目录再次运行 `tests/acceptance.py --app outputs/SciFigure-Studio-0.1.0/index.html`；截图人工检查。用户无需 Python，测试/构建才需要开发环境。

## 当前边界

0.1 是本地便携预览版。没有验证 Safari/Firefox、macOS、Linux 或移动设备；没有节点级路径编辑、PDF/PPTX 导出、云同步、在线插件系统。导入大型或复杂真实素材库仍需继续实测。字体依赖本机，项目与素材持久数据需通过文件导出才能随电脑迁移。
