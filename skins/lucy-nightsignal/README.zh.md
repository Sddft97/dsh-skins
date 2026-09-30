# 露西·夜城信号

[English](README.md) | 中文

dsh web GUI 的赛博朋克皮肤，纯资产目录：黄昏与霓虹两张天台场景，两个抠好透明底的立绘分别贴着输入框的左沿与右沿，并随左右抽屉自动跟随。无 `package.json`、无构建步骤，皮肤中心是唯一加载器。

| | |
| --- | --- |
| id | `lucy-nightsignal` |
| 版本 | 0.1.0 |
| 清单 | v2 |
| 许可 | CC BY-NC-SA 4.0（非官方同人） |

## 预览

亮色：

![亮色](preview/light.jpg)

暗色：

![暗色](preview/dark.jpg)

两张都是 1440x900 JPEG q85，由市场自己那套 facade 渲染器拍摄。

## 是什么

- `skin.json`（v2 清单）+ `skin.css`（L1 token 重映射：亮色 `:root`、暗色 `body[data-ds-dark-theme]`）+ `patches.css`（L3：两层立绘与霓虹描边）。
- 立绘锚在 `[data-composer-card]` 上：左立绘的右沿贴输入框左沿（`left: anchor(... left)` + `translate: -100% 0`），右立绘的左沿贴输入框右沿。输入框在抽屉开合时会重新居中，所以两人跟着走，全程不需要测量。
- 立绘层级是 `z-index: 900`：高于所有官方面板、低于鲸鱼娘挂件（挂在 `<body>` 上、`z-index: 9999`），保证挂件气泡不被压住。
- **没有 `hooks.mjs`**：市场预览渲染器不执行皮肤 hooks，所以场景刻意做成纯声明式。

## 已知限制

- 纯呈现层：只改浏览器样式，不触及模型请求。
- 锚点定位需要 Chrome 125+；更老的引擎由普通回退值兜底。
- `patches.css` 有几处匹配 CSS-Modules 哈希类名，官方重建后可能改名（`dsh-skin validate` 会按设计给出 warning）。

完整的做法推导（含实测踩坑）见项目仓库的 `docs/SKIN-TECHNIQUE.md`。
