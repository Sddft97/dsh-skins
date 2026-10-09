# verdandi 第二轮修复证据（PR #61 续）

本文件是 PR #61 追加轮次的截图证据。全部为**真壳实拍**：拍摄对象是本分支 `skins/verdandi/`
的样式与 hook，宿主是本机运行中的 v2 皮肤中心（`http://localhost:3080`，1440×900，deviceScaleFactor
按每张图标注明），换皮方式 = 皮肤中心按 `$DSH_HOME/skins/verdandi/` 提供样式，拍完还原本机原有那份。

## 拍摄与校验方法

- 每轮拍摄前从 `/api/skin-center/v2/skins/verdandi/patches` 回读**当轮真正被浏览器加载的** CSS
  并记录 sha256（下表），所以每张图对应的 CSS 版本由接口回读锚定，而不是口头说明。
- **before 图不是旧版本回滚**，而是在同一份 head 上临时注入"改动前的那条规则"复现旧观感：
  - 分体控件 before：把容器恢复成无底无边、两半各自 `border-radius: 999px`（改动前那条兜底规则的效果）；
  - 插件页 before：把 `.vd-characterStage` 的 `z-index` 强制回 `0`。
  注入用完即撤，after 图与接下来提交的内容一致。
- **运行状态两张是夹具图**：在真实会话页里按宿主自己的 DOM 结构插入运行节点（`[data-chat-running]`
  + 宿主类名 + TextShimmer 结构），由皮肤自己的 observer 接管后拍摄——这一轮拍不到真机运行瞬间，
  所以如实标注。图里可见的是皮肤自己那条行：剑形图标 + `薇儿烧烤中，用时 20 秒 ···`，宿主文案
  （`深度求索中`）被完整替换、计时原样保留。
- 无法截图的那一项（顶栏拖动区）用**量测**记录，见文末。

## 图片（sha256）

| 文件 | 大小 | sha256 |
| --- | --- | --- |
| `evidence/verdandi-split-control-before.png` | 19 KB | `17db697bd03e2b92bc0654416fafea45ab24d4d714db539e9216e8697ce25aa2` |
| `evidence/verdandi-split-control-after.png` | 19 KB | `e08e519e77448b3dcb38cd9d4dc6f254b7a3ac74c54dfa7482b79d90a7110cad` |
| `evidence/verdandi-plugin-page-before.jpg` | 307 KB | `fa841b1a8dbe6055632beae8716f03759e4eff89ede51043f6be342e90aff65a` |
| `evidence/verdandi-plugin-page-after.jpg` | 308 KB | `39eb4b9154987e097883557cf99ea019caf31c1891c58b9ec8052638950d1c2c` |
| `evidence/verdandi-running-status-light.png` | 100 KB | `ebb44d50848abd9c27bf2a1359ccab79d6dc4480e6ddcee44d8df4223632b9c7` |
| `evidence/verdandi-running-status-dark.png` | 93 KB | `3278756011994f7c45be736bd0e3b4d8c40b518aba1c38fe34f724e9d3eb737f` |

## 锚定的样式版本

| 来源 | sha256 | 长度 |
| --- | --- | --- |
| `patches.css`（本分支磁盘文件） | `fda9a2ce7f1691d751ba95f8e8da73316bffe0f6693a84d6e96adaf9e31d15dd` | 82033 |
| `/api/skin-center/v2/skins/verdandi/patches`（接口回读，即浏览器实际加载的） | `9eb445304235837de862ff9f59d3deec5455139b5385cc950c87f3b09bdace68` | 91970 |
| `hooks.mjs`（本分支磁盘文件） | `221a8647ae4effbfdada0b7e6984d7bf8e325db96a4f481c69865176e666e731` | — |

## 另两项的测量证据（无法截图）

- **顶栏拖动区（桌面端）**：遍历全部元素读 `-webkit-app-region`（不能用 `elementFromPoint`——
  它会跳过 `pointer-events: none` 的饰层，这正是这个 bug 一直不可见的原因）。修复前覆盖顶栏的
  `drag` 层 12 个（含皮肤 5 个饰层），修复后 7 个（全部是宿主自己的），皮肤各层计算值为 `no-drag`。
- **跨平台守卫**：宿主的拖动区规则带 `[data-platform="darwin"]` 前缀，只有 macOS 启用。hook 现在只在
  `getComputedStyle(header).webkitAppRegion === 'drag'` 时才挂拖动带；在没有拖动区的平台（实测 web 实例，
  等价于 Windows 形态）`headerRegion=none` → `stripCreated=false`，其余 5 个饰层照常。
