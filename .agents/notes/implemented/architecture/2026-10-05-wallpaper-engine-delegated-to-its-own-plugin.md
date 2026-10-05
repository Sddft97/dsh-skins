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

## Follow-up: boot recovery across an external verdict flip (issue #1805)

The withhold contract above assumed the page's activation was already settled
when the wallpaper started. On the desktop client it is not: the page carries no
tapIndex `data-dsh-skin` stamp, so boot recovers the persisted selection
asynchronously (`GET /active`, then a switch that loads the skin stylesheet).
The wallpaper's media layer mounts inside that window and `refresh()` sees the
verdict flip while the boot switch is still loading.

`refresh()` used to act on that flip immediately, opening a second (empty)
activation. That bumped the request sequence, so the in-flight boot switch was
discarded as stale, and the page settled on the stock look with the official
default marked active — while `~/.dsh/skin-center-active.json` still named the
real skin. The selection follower could not repair it either: the disk value had
not changed, and the repair path opens exactly the second activation that caused
the problem.

The controller now tracks the in-flight switch (`isSwitching()`) and:

- defers a verdict flip observed mid-switch, replaying it once the newest switch
  settles (the flip is not dropped: the in-flight activation sampled its verdict
  before it);
- the selection follower reads nothing while a switch is in flight, checking on
  both sides of the GET, so a poll cannot supersede the activation that boot is
  still establishing (a switch that starts while the GET is in flight would
  otherwise be superseded by the returning value, which is older than it);
- the in-flight flag is released at the atomic cut, not after the persist
  round-trip: `POST /active` has no timeout and can hang on a paired desktop,
  and a page that already painted must still yield the moment the external
  owner's verdict flips.

`watchPersistedSelection` keeps following a selection changed by another page,
which is what it is for; the boot window is closed by the two rules above rather
than by weakening the follower.

## Follow-up: a user-initiated activation claims the stage (issue #49)

The withhold contract above made an explicit user action invisible while a
wallpaper renders. A try-on during a wallpaper painted nothing and left no
`html[data-dsh-skin]` stamp, so the delegated plugin could not tell "the user
just asked for this skin" from "the skin is idle" - and it had nothing to act
on, because the whole activation was withheld. Re-applying the skin already on
was the same blind spot from the other side: the persisted selection does not
move, so `POST /active` writes the value the peer can already read and an
action leaves no trace anywhere.

`tryOn()` and `switchTo()` now take an optional `userInitiated` flag, and the
card passes it on the two paths a person clicks (try-on, apply - including
re-applying what is already worn). That activation claims the stage: it skips
the stand-down for exactly one activation, so the public stamp flips and the
other plugin, which watches that stamp, can hand the page back. The claim is
deliberately narrow:

- **only a real skin claims it.** The stock look has nothing to paint, so a
  withheld stock preview keeps reporting itself as stood down instead of
  claiming a stage it does not use - otherwise the card's "paused" notice would
  hide while the wallpaper still owns the page;
- **it is one-shot and bounded.** `USER_INITIATED_YIELD_GRACE_MS` after the
  atomic cut, a claim whose owner still reports itself active withdraws through
  the ordinary withheld path. The hand-back it is waiting for is DOM-level and
  far shorter than that window, so the window only has to cover a peer that
  never answers;
- **the withdrawal stands down** when a newer activation replaced the claim
  (that one applies its own verdict), when another switch is in flight (it
  sampled the verdict itself), and when the owner did answer;
- **the timer is ledger-recorded**, so superseding the activation or shutting
  the runtime down cancels it.

Everything else is unchanged: the boot activation, the persisted-selection
follower, `refresh()` and every rollback still honour the stand-down on their
first evaluation. That is what makes the handoff self-healing - the claim only
has to make the request visible, and the verdict flip that follows re-applies
the remembered selection normally.

Rejected: a second attribute (`html[data-dsh-skin-request]`) announcing the
request without painting. It is zero-overlap and looks safer, but it adds an
attribute contract both sides must keep in step and hands the sequencing of two
attributes to the peer; reusing `html[data-dsh-skin]` keeps the dependency on
one attribute pointing one way. Rejected as well: the claim without the
withdrawal window - it would turn a frame-level overlap into a permanent one
whenever the peer predates this contract.

## Follow-up: the first screen is pre-judged from the peer's persisted selection (issue #51)

The withhold contract above turned on "the state is read synchronously BEFORE
the runtime boots, so a page that loads with a wallpaper already rendering
never paints a frame of skin first". That only covers a marker the DOCUMENT
already carries, and the delegated plugin does not stamp one: it writes
`body[data-we-wallpaper]` from its own client chain, a few hundred
milliseconds into the boot. The browser's first paint is decided by the
delivered document, so the page painted the skin - injected by the anti-FOUC
seam - and only then cut to the wallpaper. The runtime could not fix it: no
matter how fast it boots, the frame is already on screen.

The host half therefore pre-judges the first screen. `persistedExternalWallpaperActive`
in `src/external-wallpaper.ts` reads the peer's own persisted selection
(`$DSH_WE_DATA_DIR/config.json`, defaulting to `~/.dsh-wallpaper-engine/config.json`)
synchronously, and a non-empty `settings.id` stands the index injection down:
no `html[data-dsh-skin]` stamp and no skin stylesheet row, so the document
reaches the browser as the stock look. It is read per render and only when a
skin is actually applied, so the stock-look path pays nothing.

The rules that keep this from becoming a second source of truth:

- **the marker stays the verdict.** The runtime still decides on
  `body[data-we-wallpaper]`; the file only decides the frame the marker
  cannot reach yet. A peer that fails to render takes its marker with it, and
  the boot activation repaints the skin normally - the cost of a wrong
  prediction is one stylesheet fetch, never a page stuck on the wrong look;
- **it fails OPEN toward the skin.** An absent, unreadable, malformed or
  not-yet-written file means "no wallpaper". Withholding a user's skin on a
  broken read would be a worse defect than the flash this removes;
- **the peer's file is its own contract, read-only.** `settings.id` is the
  peer's stable persistence key and the host file its single source of truth;
  `DSH_WE_DATA_DIR` moves the directory and nothing else. Nothing here writes
  it, and the dependency keeps pointing one way;
- **the probe is optional on the adapter.** `readWallpaperOnStage` defaults to
  "no wallpaper", so a caller that does not wire it keeps today's document
  exactly.

Rejected: a declaration line the peer injects into the index HTML
(`<meta name="we-wallpaper-active">`) for this side's tap to string-match.
It needs no knowledge of the peer's on-disk layout, but it makes this package's
first paint depend on the peer's injection ORDER, adds a second contract to
keep in step for a decision one synchronous read already answers, and pushes
the coordination onto the side that filed the issue. The peer's data directory
is documented and stable; a string-match on injected HTML is neither.
Rejected as well: withholding for any installed peer rather than a persisted
selection - that would hand the page to a wallpaper plugin the user never
picked, and would withhold the skin of every user who merely has it installed.

