# dsh-skins · Skin Center & Wallpaper Engine Dynamic Themes for DeepSeek Harness (DSH)

English | [中文](README.zh.md)

<p align="center">
  <img src="https://img.shields.io/npm/v/@linxin666/dsh-client-ui-skin-center?style=flat-square" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.2-4c6ef5?style=flat-square&amp;labelColor=454a54" alt="DSH">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="License">
</p>

<p align="center">
  <strong>Theme & Personalization Engine for DeepSeek Harness (DSH) Web GUI & Desktop Client</strong><br>
  <em>Themes & Skins · Wallpaper Engine Dynamic Backdrops · Frosted Glass Blur · Custom Themes · Live Try-On</em>
</p>

`@linxin666/dsh-client-ui-skin-center` (cordis plugin id `ui-skin-center`) is the single skin package of the dsh Web GUI: it puts the skin list / try-on / apply into the real GUI as the first-level Skin Center settings section (settings → 皮肤中心, listing only installed skins), and it is the only loader and renderer for skins. A skin is a pure asset directory — no package.json, no npm publish, no cordis wiring — that couples only to the skin-center contract (`contracts/`); the skin center absorbs every official-DSH coupling behind that contract. The card carries its own enable switch (off disables try-on, apply and the background controls).

- List: shows "官方默认" (official default) plus every installed skin in the catalog with its name, tagline and accent color; the currently active target carries the Active marker. The catalog merges two sources: the default skin shipped inside this package (`skins/blue-fantasy/`) and user skins dropped into `$DSH_HOME/skins/<id>/` (a user skin with the same id shadows the built-in one). Every other skin of the collection is a market item: install it on demand from the DSH Market store (one-click install) into `$DSH_HOME/skins/<id>/`, where this same catalog manages it as a user skin — no restart, reopen the card or reload to pick it up. Skins whose `skin.json` fails validation are excluded fail-closed and reported as catalog diagnostics.
- Custom theme: the final card is a user-level theme derived from the official stock look, separate from both the official-default card and catalog skins. Light and dark profiles independently edit accent, background, foreground and contrast (0–100), with live try-on, apply, current-mode reset and reload persistence. Its generated CSS is limited to an audited official-token allowlist; it cannot accept selectors, arbitrary CSS or asset URLs. Catalog skin definitions are never modified, and an active catalog skin automatically suppresses the custom-theme layer.
- Try-on / Apply: both go through the same atomic switch engine (`src/client/runtime/skin-controller.ts`). One switch is one new activation identity: fetch the scoped stylesheet, install it plus the background media and optional hooks, flip `html[data-dsh-skin="<id>"]`, then dispose the previous activation (append-only effect ledger, idempotent teardown). The latest request always wins; a failed or superseded switch leaves the previous skin fully intact. Try-on is the same switch without persistence — "Exit try-on" restores the committed skin. Apply persists the selection (`POST /api/skin-center/v2/active`). No page reload, no `cordis.patch.yml` rewrite, no boot-graph regeneration.
- First paint: the host half registers one index.html transform (`webServer.tapIndex`, single adapter module `src/tap-index-adapter.ts`) that stamps `html[data-dsh-skin]` and inserts the stylesheet links into every served document, so a reload boots straight into the active skin with no flash of the stock look. The tap fails closed to the stock look on any problem.
- Skin format (v2): `skin.json` (validated fail-closed, v1 fields `package`/`wiring`/`bodyAttr` ignored with migration warnings), `skin.css` (L1 token remaps + L2 semantic selectors), optional `patches.css` (L3 free selectors, high sensitivity), optional `hooks.mjs` (trusted escape hatch, high sensitivity), `assets/`, `preview/`. All CSS passes the safety pipeline (`src/core/css-safety/transform.ts`): every selector is force-scoped under `html[data-dsh-skin]`, `@import` / remote or protocol-relative URLs / escaping paths are hard errors. See `contracts/README.md`.
- Coverage contract: L1 remaps the official `--dsw-*` design tokens; L2 styles the semantic attributes (`data-dsh-surface` / `data-dsh-part` / `data-dsh-plugin`, enumeration in `contracts/semantic-attrs-v1.md`) which a compat adapter (`src/client/runtime/semantic-adapter.ts`) stamps onto the official shell DOM from stable anchors (`data-slot` outlets, `data-chat-flow-kind`, etc.); L3 patches carry any selector at the skin author's own risk. Plugins that output the semantic attributes themselves get the full L2 coverage; plugins that do not only get L1. A shared shell-rendering adapter applies only while a catalog skin, custom theme or wallpaper is active: it removes the workspace-list end fade, gives the composer placeholder an opaque theme-secondary text color, and reserves bottom clearance on conversation scrollports so messages remain readable above the sticky composer (#978), so individual skins do not need duplicate patches.
- Background priority: a Wallpaper Engine wallpaper always wins over the user manual background scrim, which wins over the skin's manifest background media; toggling the wallpaper re-evaluates the priority live.
- Background controls: a background-occlusion slider (0–100%) veils the backdrop behind the panels for skins that paint one, two per-state Gaussian-blur sliders (0–20 px) control the backdrop for empty and populated conversations, an input-card blur slider (0–20 px) controls only the frosted area behind the composer, and a bubble-opacity slider (0–100%) drives translucent message bubbles for skins that expose bubble alpha. Wallpaper-wide blur remains an independent wallpaper setting. The active background blur uses a fixed `backdrop-filter` element behind the shell; 0 disables it entirely (no element, no GPU cost). The input-card frost rides its own body-level fixed follower (the `data-dsh-composer-frost` element) sized to the composer card, never the card itself: a `backdrop-filter` on the card would make it the containing block for the shell's fixed tooltips inside it and jolt the conversation on every hover.
- Wallpaper Engine bridge: the card can use the machine's local Wallpaper Engine library as the GUI backdrop. The host half (`src/we-library.ts` + `src/we-routes.ts`) locates the WE install (Steam app 431960: registry, every path in `libraryfolders.vdf`, durable `appmanifest_431960.acf` ownership, and probe paths on Windows), scans its projects and workshop content plus optional manual folders, and serves the inventory, media (Range-streamed), previews, web-wallpaper project files (with the WE API shim injected), and scene main-texture PNGs (decoded in-process from PKG/TEX by `src/pkg-extract.ts`, cached on disk) through same-origin `/api/skin-center/we/*` routes. Video wallpapers render in a `<video>`, web wallpapers in a sandboxed `<iframe>`, scene wallpapers live in the built-in WebGL player (2D layered scenes and 3D model scenes replayed with WE material/shader semantics); scene-embedded scripts are ignored while supported image, reflection, water and particle passes remain live, and a "static frame" render mode pins a zero-animation-cost image for any type. Per-wallpaper Import copies the project into `<harness-home>/skin-center/wallpapers/` so it survives Steam library changes, with update detection against the workshop original. Wallpapers are the user's own local files and are never uploaded or redistributed — Workshop content belongs to its authors. The Manual folders row accepts loose `.mp4`/`.webm` media, one project, a project collection, a Wallpaper Engine install root, or a Steam library root (`~` expands to the home directory).
- Legacy migration: on the first boot after the v2 upgrade, a one-shot bridge (`src/legacy-bridge.ts`) reads the retired `dsh-skin` managed section from the harness home `cordis.patch.yml` (where the v1 CLI wrote it; the active profile's `cordis.patch.yml` is probed as a secondary location), migrates the active skin id into the v2 selection store, and strips the legacy rows. The migration is idempotent and fails closed (the old state stays untouched on any error). It logs only when it migrated, cleaned, or failed — the nothing-to-migrate steady state stays silent (issue #788).


## Core Capabilities & Scenarios

| User Goal & Scenario | Stock DSH Web Limitation | Skin Center (dsh-skins) Solution |
|---|---|---|
| Personalized aesthetics and eye-care dark theme | Default single monochrome theme only | Bundled Blue Fantasy dark theme + one-click install for dozens of curated themes from Workshop |
| Interactive dynamic wallpaper via Wallpaper Engine | No dynamic video or animated wallpaper support | Deep Steam Wallpaper Engine bridge supporting video, web, and 2D/3D WebGL real-time scenes |
| Frosted glass blur & composer scrim controls | Flat background with no visual depth or layering | Background scrim (0–100%), adaptive conversation blur, follower frosted composer glass & bubble opacity |
| Custom brand palette & CSS token remapping | Unable to tweak accent colors or contrast | Independent light/dark accent, background, foreground and contrast tuning with audited CSS token coverage |
| Live theme try-on and zero-flash hot switching | Theme changes require server restarts or reloads | Atomic hot-switch engine for live preview, clean rollback, and instant boot without white FOUC flashes |

## Most popular skins

The three most-liked skins in the Workshop's skin category on [dsh-market.com](https://dsh-market.com), in the site's default popularity order:

| Skin | Author | Look |
|---|---|---|
| [Abyssal Maid Atelier](https://dsh-market.com/#skin:maid-atelier) (`maid-atelier`) | Small-tailqwq | Twin-maid atelier backdrop, deep-sea blue lace surfaces and a chibi sidebar |
| [Whale Song](https://dsh-market.com/#skin:whale-song) (`whale-song`) | dsh-web | Deep-sea whale goddess backdrop, ice-blue ocean palette and gold hairlines |
| [Blue Fantasy](https://dsh-market.com/#skin:blue-fantasy) (`blue-fantasy`) | powerdog996 (DreamSkin community), adapted by dsh-web | Whale-illustration backdrop, periwinkle indigo palette and translucent panels |

| Abyssal Maid Atelier | Whale Song | Blue Fantasy |
|---|---|---|
| ![Abyssal Maid Atelier](skins/maid-atelier/preview/light.jpg) | ![Whale Song](skins/whale-song/preview/light.jpg) | ![Blue Fantasy](skins/blue-fantasy/preview/light.jpg) |

Install any of them from the Workshop in one click; `blue-fantasy` is also the skin this package ships as its built-in default.

## Install

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-skin-center
# From the repo (dev): dsh plugin --profile web add link:$(pwd)/packages/skins/skin-center
```

`$(pwd)` is your clone of the dsh-web monorepo. Only the default skin (blue-fantasy) ships inside this package; every other skin installs on demand from dsh-market.com into `$DSH_HOME/skins/<id>/`, and community skins are plain directories in the same place (no install command, no restart — reopen the card or reload to pick them up). A fresh install activates blue-fantasy by default (host seed); an update whose active skin is no longer available falls back to the stock look. The package ships `skins/blue-fantasy` only; the remaining skins stay in the repository under `skins/` as the market-build source and are never published in the package.

skin-center is a self-contained bundle meeting the official DSH plugin standard (`dsh.bundle.patch` points to `cordis.patch.yml`); it can also be installed via git: `dsh plugin --profile web add github:<org>/dsh-web#<sha>` (the `prepare` script builds `lib/` in place). pnpm ≥10 requires authorizing `allowBuilds` before installing a git dependency; a local `link:` install has no such requirement.

## Wallpaper Engine plugin coexistence

The skin center ships its own Wallpaper Engine bridge and owns the GUI backdrop, so it and [dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine) (`dsh-plugin-wallpaper-engine`) are alternatives, not companions: the two scan the same WE library and each paint a full-viewport fixed layer, each take over the shell (`data-dsh-skin` plus the shared shell-rendering adapter here; `body[data-we-wallpaper]` / `body[data-we-sidebar-glass]` there), each keep a fixed `backdrop-filter` element on the page, and each drive the light/dark theme. Running both overlays the two backdrops, invalidates both glass passes and fights over the theme, so pick one.

- **Keep the skin center**: remove or disable `dsh-plugin-wallpaper-engine` from the profile, then restart the host (`dsh web`; DSH Desktop: fully quit the app and reopen it). Confirm the row is gone from the plugin list, and set your WE wallpaper in this card's wallpaper panel (设置 → 皮肤中心).
- **Keep the standalone plugin**: remove or disable the skin center (`@linxin666/dsh-client-ui-skin-center`; where the `@linxin666/dsh-web-all` aggregate provides it, it is a child row of that bundle), then restart the same way. Its own settings page (设置 → Wallpaper Engine) then owns the wallpaper.
- **Without uninstalling either**: stand the skin center down instead of removing it. Select 官方默认 (Official default) in the card's list to drop `html[data-dsh-skin]`, keep the custom theme off, clear the wallpaper selection, and turn off the card's own master switch (设置 → 皮肤中心 → Enable skin center). The card then paints nothing — no skin, no scrim, no backdrop-blur layer, no composer frost — and the shared shell-rendering corrections stay inert, because their selectors require an active skin, custom theme or wallpaper. The host route families, the boot-time DOM stamps and the page event wiring still belong to both installed plugins, so this is a stopgap, not a supported state.

Both halves are host-side, so a page refresh is never enough: the loader rows and the `/api/skin-center/*` route family are decided at boot. The card probes the profile when it mounts and shows this advisory when it finds the package; the probe only reads, and it never installs, removes or disables anything. Install and switch commands for the other side are in [its README](https://github.com/elysia395/dsh-wallpaper-engine).

## Configuration

- **Enable switch**: turns the whole card (try-on / apply / background controls) on or off; persisted in the v2 active-state document.
- **Background sliders**: occlusion (0–100%), two backdrop blur radii, input-card blur (0–20 px), and bubble opacity (0–100%); persisted in the same v2 document.
- **Background persistence (remote-capable)**: background values live in the v2 active-state document (`$DSH_HOME/skin-center-active.json`, the `background` section) and are read/written through `GET|POST /api/skin-center/v2/active`, so paired remote desktops — where the settings surface is loopback-only — load and keep them across sessions. The `skin-background` section of the plugin's own configuration stays as the settings page's input face: a customized section is migrated into the v2 store once at boot, and later page edits are forwarded by the client. Card edits do not write back to that page, so it may show stale values until its next edit.
- **Wallpaper panel**: library folders, selection, render mode (live / static frame), dim, blur, pause-on-hidden, sound toggle and volume; persisted in the `skin-wallpaper` section of the plugin's own configuration.
- **Custom theme**: light/dark accent, background, foreground and contrast profiles plus the applied marker; persisted as a versioned contract in the `skin-custom-theme` section of the plugin's own configuration. Wallpaper selection and rendering remain owned by `skin-wallpaper`.
- **Where these settings live**: the three sections are one plugin configuration — the profile entry's own `Config`. The Host derives that entry's settings page from the schema in the GUI, and the card writes the same values; there is no separate settings document.
- **User skin directory**: `$DSH_HOME/skins/<id>/`; override precedence is `DSH_SKINS_HOME`, then `DSH_SKINS_DIR`, then `$DSH_HOME/skins`.

## Security model

- All `/api/skin-center/*` routes are same-origin only: writes reject cross-site requests (Sec-Fetch-Site / Origin fence), and asset reads are contained inside each skin directory (path escapes fail closed).
- Skin CSS is sanitized (whitelist) before serving; `patches.css` (L3) is arbitrary CSS by design and disclosed as such — it runs with full page styling power and is not a security boundary.
- The custom-theme editor emits only fixed declarations from `CUSTOM_THEME_ALLOWED_TOKENS`, each verified against the official token registry. User input is normalized color/contrast data and never becomes a selector, URL or free-form CSS payload.
- `hooks.mjs` is trusted code that shares this repository's review and release; it is served same-origin only and its import/apply errors can never take the static skin down. Hooks run for built-in skins and for user-directory skins whose executable identity is byte-verified as reviewed official-market content: current Workshop installs use `dsh-market.provenance.json`, while legacy pre-provenance installs must match the generated `src/reviewed-hooks.generated.ts` identity for id, declared entry, complete `skin.json`, and hooks bytes (verified by `src/provenance.ts`, issue #1073). The fallback is read-only and offline; any modified, renamed, hand-dropped, or tampered directory keeps the hooks facet refused while the declarative parts still load.

## Known limitations

- Inline styles written by plugins at runtime can only be overridden by L3 `!important` patches.
- Plugins that do not output semantic attributes (and have no stable DOM anchors) receive L1 token coverage only.
- A skin video background keeps playing regardless of the wallpaper pause-on-hidden setting; pause-on-hidden applies to the Wallpaper Engine bridge only.

## Telemetry

The browser half sends one anonymous install heartbeat per UTC day to dsh-market.com: a random localStorage id plus this package's name, nothing else. The server stores only a salted hash of that id, never IP addresses, and exposes aggregate counts only. See [docs/telemetry.md](../../docs/telemetry.md) for the full contract.

## Directory structure

```
skins/skin-center/
  contracts/                                # the skin-facing contract surface (schema, hooks API, semantic attrs)
  src/core/manifest-v2/                     # manifest v2 types + fail-closed validator
  src/core/css-safety/                      # lightningcss scoping + whitelist pipeline
  src/index.ts                              # host entry: routes, tapIndex adapter, legacy bridge
  src/skin-repo.ts                          # dual-source skin catalog (built-in + $DSH_HOME/skins)
  src/provenance.ts                         # official-market install provenance verification (hooks trust)
  src/routes-v2.ts                          # /api/skin-center/v2/* routes
  src/tap-index-adapter.ts                  # the single tapIndex adapter (anti-FOUC)
  src/active-state.ts                       # active-skin selection persistence
  src/legacy-bridge.ts                      # one-shot v1 → v2 migration
  src/http-utils.ts / harness-home.ts       # shared route helpers / DSH path resolution
  src/we-library.ts / we-routes.ts / we-shim-source.ts / pkg-extract.ts   # Wallpaper Engine bridge
  src/client/runtime/                       # effect ledger, decoration layers, semantic adapter, switch controller, boot store
  src/client/SkinCenter.tsx                 # the settings card
  src/core/custom-theme.ts                  # versioned palette contract + audited token-only CSS generator
  src/client/custom-theme-controller.ts / CustomThemePanel.tsx            # persistence/runtime owner + editor card
  src/client/background.ts / wallpaper.ts / WallpaperPanel.tsx            # scrim + blur / WE bridge UI
  skins/<id>/                               # built-in skins (pure asset directories)
```

## Acceptance checklist

- [x] The skin-center section appears in 设置 → 皮肤中心 without console errors
- [x] The list shows the official default plus every catalog skin; the active one is marked; invalid skins surface as diagnostics
- [x] Try-on takes effect immediately and Exit restores the committed skin; only one skin is ever on the page
- [x] One-click apply switches atomically with no reload; a later page load boots straight into the skin (no FOUC)
- [x] The custom theme keeps independent light/dark profiles, survives reload, and never overrides an active catalog skin
- [x] The Wallpaper Engine bridge, background scrim and blur controls are unaffected by skin switches
