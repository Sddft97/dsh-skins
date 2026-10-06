---
name: dsh-skin-developer
description: Develop a skin for the dsh web GUI skin collection in this repository, and submit it here — scaffold with scripts/dsh-skin-new.cjs, author the v2 skin.json manifest plus the skin.css token remap (a pure asset directory at skins/<id>/, no package.json, no build step), validate with scripts/dsh-skin.cjs and pnpm skin-center:check, then open the pull request through this repository's submission-policy, copyright and screenshot-evidence gates. The dsh-web monorepo consumes the published @linxin666/dsh-client-ui-skin-center package and reads the skin content pinned by the submodule gitlink when building the market. Use when the user asks to create, add, develop, scaffold, or publish a new skin for the dsh web GUI skin collection.
whenToUse: 用户要新建/新增/开发一个皮肤，或把皮肤投稿进皮肤中心，或询问皮肤在哪个仓库开发、投稿要过哪些门禁。不适用于应用/切换皮肤（那是本仓库的 `dsh-skin.cjs use`），也不适用于只改市场产物；宠物走 dsh-pet 仓库的 dsh-pet-developer skill。
disable-model-invocation: true
---

# 皮肤开发者（dsh-skins 皮肤集合）

皮肤的开发与投稿都在本仓库（[dsh-skins](https://github.com/zhu1090093659/dsh-skins)）进行；dsh-web 把它作为子模块挂在 `satellites/dsh-skins`，并只以已发布 npm 包消费皮肤中心。一个皮肤就是 `skins/<id>/` 下的纯资产目录（没有 package.json，没有构建步骤）。本仓库同时承载皮肤中心插件本体（`src/` 与 `tests/`）。契约归本仓库所有，索引见 [contracts/README.md](../../../contracts/README.md)：清单 schema 见 [contracts/skin-manifest-v2.schema.json](../../../contracts/skin-manifest-v2.schema.json)，语义属性契约见 [contracts/semantic-attrs-v1.md](../../../contracts/semantic-attrs-v1.md)。目录构成、字段含义与投稿流程以本仓库的 [CONTRIBUTING.md](../../../CONTRIBUTING.md) 和 [README.md](../../../README.md) / [README.zh.md](../../../README.zh.md) 为准，本技能不重复。

## 1. 工作命令（在本仓库或其 dsh-web 子模块检出里执行）

```sh
# 在 dsh-web 克隆里开发时，本仓库是其子模块；也可以直接 clone dsh-skins
git submodule update --init satellites/dsh-skins
git -C satellites/dsh-skins checkout main          # 子模块检出停在 gitlink 固定的提交（detached），改动提交到 main
cd satellites/dsh-skins                            # 独立克隆 dsh-skins 时从仓库根开始
pnpm install
node scripts/dsh-skin-new.cjs <name>       # 脚手架，kebab-case 皮肤名，生成 skins/<id>/
node scripts/dsh-skin.cjs validate <dir>   # 契约校验；同一脚本还提供 install / use / list / current / uninstall
node scripts/submission-policy.mjs --list  # 投稿政策：屏蔽账号、禁投作品/类别/关键词、证据规则
pnpm skin-center:check                     # = node scripts/skin-center-catalog-check.cjs --check，逐皮肤跑运行时同款安全管线
pnpm skin-hooks:check                      # hooks 身份注册表；改了带 hooks.mjs 皮肤的 skin.json 后重跑 pnpm build，提交再生的 src/reviewed-hooks.generated.ts 与 lib/
pnpm test                                  # vitest；scripts/*.test.mjs 的脚本测试由 CI 另跑
pnpm typecheck
pnpm build
```

dsh-web 的根 `package.json` 里没有任何名字含 skin 的脚本，皮肤命令都在本仓库。CI 在 build 后还跑 `git diff --exit-code -- lib` 守卫提交的指纹。维护脚本：`scripts/dsh-skin-migrate-v2.mjs`（v1 清单迁移）、`scripts/submission-policy.mjs` / `scripts/verify-evidence.mjs`（投稿政策与证据核验，verify-evidence 只判定不关 PR）。

## 2. 投稿流程（PR 开在本仓库）

- 分支与提交：`main` 受分支规则集保护，无写权限的贡献者对 `main` 开 PR，协作者与所有者直接 push；Conventional Commits（`feat(skins): add <name>`），无 emoji。
- 投稿政策：先跑 `node scripts/submission-policy.mjs --list`（源是 `.github/submission-policy.json`）。被屏蔽账号的 PR 不评审直接关闭；禁投作品、类别或标题/描述命中关键词的投稿在版权门禁被拒，与账号无关。
- 版权与授权：每个美术资产都声明来源（skin.json 的 `license` / `licenseUrl` / `attribution`，或皮肤目录的 LICENSE / NOTICE）；画到的每个角色写明作品与权利人；出处不成立的素材不合并。皮肤自带双语 `README.md` + `README.zh.md`。
- 证据门禁（CI 强制）：PR 描述内嵌亮/暗两张截图，并把同一对文件逐字节相同地提交为 `evidence/<skin-id>-light.<ext>` 与 `evidence/<skin-id>-dark.<ext>`；CI 下载描述引用的每张图，要求与该 PR 提交的 evidence 文件 sha256 一致——缺图、不一致或链接不可下载都会不评审直接关闭。用 `capture-previews` 的输出作为证据字节即可。
- 进商店：PR 合并进本仓库后，还要在 dsh-web 移动 `satellites/dsh-skins` gitlink 并用 pinned 内容重建提交 `market/dist`；卫星仓三步流程（提交、推远程、移 gitlink）见 dsh-web 的 [CONTRIBUTING.md](https://github.com/zhu1090093659/dsh-web/blob/main/CONTRIBUTING.md)。

## 3. dsh-web 这一侧（消费者）

- dsh-web 以已发布 npm 包 `@linxin666/dsh-client-ui-skin-center` 消费皮肤中心；皮肤本身的改动是向本仓库提 PR，不是向 dsh-web 提，dsh-web 的 `.github/workflows/reject-non-content-pr.yml` 会关闭投错仓库的 PR 并指向正确仓库。
- 市场构建读取的皮肤内容，是 dsh-web 里子模块 gitlink 记录的那个提交；其 `market-inputs.lock.json` 把 skins 输入映射到本仓库的 `skins/` 目录。
- dsh-web 的 `pnpm market:fetch` 把 pinned 内容物化进 `.market-inputs/`：子模块工作树正好在 pinned 提交上就复制它，否则下载该提交的 tarball，所以从未初始化子模块的克隆行为一致；`--force` 强制重取。
- `pnpm market:fetch --local` 从已初始化的子模块工作树物化其当前内容，用来把你自己的改动送进市场构建；不在 pinned 提交上的检出在不加 `--local` 时会被忽略（运行时输出会说明）。缓存按子模块 HEAD 提交记账，未提交的改动要加 `--force` 才会被重新复制；这样构建出的 `market/dist` 来自未 pin 的内容，不得提交。
- 开发循环：编辑本仓库 `skins/<id>/`，然后在 dsh-web 里 `pnpm market:fetch --local --force`、`pnpm market:build`，在 `market/dist/preview.html?skin=<id>&theme=light|dark` 预览亮/暗两态。`node scripts/capture-previews <id>` 用 headless Chromium（需要 playwright）把 `preview/{light,dark}.jpg` 重拍成 1440×900 JPEG 落回本仓库的皮肤源目录，`node scripts/skins-montage.mjs` 生成拼图，这两个脚本属于 dsh-web 仓库。
- dsh-web 的 `pnpm market:check` 校验已提交的 `market/dist` 与 pinned 输入一致。

## 4. 验收清单

- [ ] 皮肤目录在本仓库 `skins/<id>/`，`node scripts/dsh-skin.cjs validate` 与 `pnpm skin-center:check` 通过
- [ ] 皮肤有双语 `README.md` / `README.zh.md` 与重拍过的 `preview/{light,dark}.jpg`（dsh-web 的 `node scripts/capture-previews <id>`）
- [ ] 美术资产都声明了来源，角色标注作品与权利人，未命中 `.github/submission-policy.json` 的禁投清单
- [ ] PR 描述内嵌亮/暗截图，且与提交到 `evidence/` 的文件字节一致（sha256）
- [ ] 市场模拟器亮/暗两态渲染正常（`market/dist/preview.html?skin=<id>&theme=light|dark`）
- [ ] 进市场的改动：合并后已在 dsh-web 移动 gitlink，`market/dist` 已用 pinned 内容重建并提交，`pnpm market:check` 通过；用 `--local` 构建的产物没有提交
- [ ] PR 开在本仓库（不是 dsh-web），按本仓库 PR 模板逐项勾选

## 5. 常见坑

- **把皮肤改动留在 dsh-web 的 `satellites/dsh-skins` 工作树里**：那只是本地预览，投稿仍然要开在本仓库。
- **只提交卫星仓不推远程、不移 gitlink**：三步缺一不可，漏掉 push 会让全新克隆与 CI 的 `pnpm market:fetch` 404（见 dsh-web CONTRIBUTING.md）。
- **提交 `--local` 构建出的 `market/dist`**：它来自未 pin 的内容，`pnpm market:check` 会失败。
- **证据截图与提交的 evidence 文件不一致**：sha256 比对失败即不评审直接关闭；用 `capture-previews` 拍出的同一对文件。
- **子模块不在 pinned 提交上**：不加 `--local` 的 `pnpm market:fetch` 会忽略你的工作树，输出里会说明这一点。
- **找 `pnpm skin-center:check`**：它是本仓库的命令；在 dsh-web 克隆里要先 `cd satellites/dsh-skins`。
