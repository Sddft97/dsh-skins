# Agent Note: Wallpaper Engine is delegated, and the skin yields the page

Status: implemented

## Problem

The skin center shipped its own Wallpaper Engine bridge: a host half that located
the WE install and served the library over `/api/skin-center/we/*`, and a browser
half that rendered video, web and scene wallpapers into fixed layers with its own
glass, dimming and blur. `dsh-plugin-wallpaper-engine` does the same job with its
own renderer, its own settings surface and its own glass.

Two owners of one backdrop cannot coexist. Each paints a full-viewport fixed layer,
so which one is visible depends on mount order; each keeps a fixed
`backdrop-filter` element, and the two sample a shell whose ancestor chain the
other one relaid, so both glass passes degrade; both rewrite the same shell
(`data-dsh-skin` plus the shared shell-rendering adapter here,
`body[data-we-wallpaper]` / `body[data-we-sidebar-glass]` there); and both write
the host theme.

Issue #39 first asked only for a notice plus switch instructions, which shipped as
the read-only probe and the coexistence advisory. The project then decided the
delegated plugin is the WE component going forward, so the bridge had to come out
and the two had to stop being alternatives that break each other.

## Decision

**The built-in bridge is removed, and the skin yields the page to the delegated
plugin automatically.**

Removed: `src/we-library.ts`, `src/we-routes.ts`, `src/we-player-source.ts`,
`src/we-shim-source.ts`, `src/pkg-extract.ts`, `src/client/wallpaper.ts`,
`src/client/WallpaperPanel.tsx`, `src/client/DirBrowserDialog.tsx`, the whole
`/api/skin-center/we/*` route family, the `skin-wallpaper` configuration section,
the `remote.directoryPicker` inject, and the `jpeg-js` dependency that only the
PKG/TEX decoder used. A retired `skin-wallpaper` section left in an existing
profile resolves harmlessly (schemastery passes unknown keys through), so an
upgrade never breaks a profile over it.

Added: `src/external-wallpaper.ts` (read-only probe of the profile, replacing the
old coexistence probe) and `src/client/runtime/external-wallpaper-engine.ts`
(the interop watcher), plus the card's install pointer.

**The interop contract is the delegated plugin's own `body[data-we-wallpaper]`
attribute**, which it stamps while a wallpaper renders. This package only reads it.
The skin center never writes that attribute and the other plugin never writes
`data-dsh-skin`, so neither can strand the other.

While the attribute is present:

- the active skin is **withheld entirely** — no stylesheet, no patches, no hooks,
  no `backgroundMedia`, no backdrop marker, and the `html[data-dsh-skin]` stamp is
  removed. The withheld activation is still recorded and still persisted, so the
  user's choice survives and repaints when the attribute clears;
- the composer frost follower is not mounted, because the other plugin paints its
  own glass;
- the background blur layer stands down;
- the shared shell-rendering adapter's wallpaper scope is gone, since that plugin
  owns its own shell corrections.

The state is read **synchronously before the runtime boots**, so a page that loads
with a wallpaper already rendering never paints a frame of skin first; a
MutationObserver then keeps it current. The card renders a "paused" notice while a
skin is withheld, so the state reads as a state rather than a bug.

Skins that ship their own full-bleed plate had yield rules keyed on the retired
`data-dsh-wallpaper-active` attribute; those 16 skins now key them on
`body[data-we-wallpaper]`. This matters even with the whole-skin withhold in
place: it is the attribute that keeps them correct if the asset is ever used
outside this loader's control.

## Alternatives considered

- **Keep both bridges and let the user choose (the #39 advisory alone).** Rejected
  once the delegated plugin became the project's WE component: the advisory
  explains a broken state instead of preventing it, and every user who ignored the
  text kept a GUI that misrenders.
- **Pair the two by priority — wallpaper wins, skin keeps its tokens.** Rejected.
  The conflict is not only the backdrop. Both plugins rewrite the shell and both
  paint fixed glass; keeping the skin's CSS loaded leaves two `backdrop-filter`
  stacks and a shell relaid by one of them, which is exactly the degraded-glass
  outcome the issue reported. Withholding the whole skin is the only version that
  is correct by construction.
- **Detect the plugin from the browser (e.g. `body[data-we-wallpaper]` at boot and
  nothing else).** Rejected as the *only* mechanism: the install pointer needs to
  know whether the package is installed even when no wallpaper is running, which
  is a profile question the host half must answer. The DOM attribute is
  nevertheless what drives the runtime handoff, because it is live and needs no
  polling.
- **Unload the skin by clearing the user's selection when a wallpaper starts.**
  Rejected: it destroys a deliberate choice and forces the user to re-apply the
  skin after every wallpaper. Withholding the paint keeps the selection intact.
- **Keep the wallpaper settings section as a stub.** Rejected. Two settings
  surfaces for one feature is the confusion the delegation is meant to end; the
  section is gone and the card points at the plugin's own page.
- **Keep `jpeg-js` "in case".** Rejected: it existed only for the scene texture
  decoder, and leaving an unused runtime dependency ships code nobody runs.

## Consequences

- `@linxin666/dsh-client-ui-skin-center` no longer provides wallpapers. Users who
  had the built-in bridge must install `dsh-plugin-wallpaper-engine` to keep the
  feature; the card shows the exact command. This is a breaking change for the
  package and should be released as a major.
- The package shrinks by roughly 8.7k lines of host/client source and 4k lines of
  tests, and drops `jpeg-js`; the removed surface is one whole route family.
- The delegation makes this package depend on another plugin's public DOM
  attribute. That attribute is that plugin's own contract and is already relied on
  by other third-party plugins, but a rename there still needs the constant in
  `src/client/runtime/external-wallpaper-engine.ts` updated in the same change.
- A wallpaper plus a skin is now a supported combination with defined behavior
  (skin paused, skin remembered), where before it was an unsupported overlap.
- The retired `skin-wallpaper` section stays in existing profile files untouched.
  Nothing migrates it, and nothing reads it.
