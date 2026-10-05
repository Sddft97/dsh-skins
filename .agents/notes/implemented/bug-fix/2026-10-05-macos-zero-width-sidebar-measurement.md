# Agent Note: the sidebar width needs a measurement that does not depend on the observer reporting

Status: implemented

## Problem

On the macOS desktop client the maid-atelier skin laid its whole conversation
chrome one sidebar-width too far to the right: the top lace, the bottom crest
and the left maid all sat over a dead band on the left of the content instead
of framing it, while the composer itself stayed correctly centred. The web
host rendered the same skin correctly, and the Windows desktop client did too.

The skin stores "how wide is the sidebar" once, as `--maid-sidebar-width`, and
every sidebar-dependent offset is derived from it: `[data-skin-chrome="top-trim"]`
and `[data-skin-chrome="bottom-trim"]` translate by it, `body:before` and the
left maid are placed at it, and the landing bow and the bottom crest are
centred in `(100% - var(--maid-sidebar-width) - 8px) / 2`.

The host's sidebar track is not the same width everywhere. `AppFrame` computes
it as:

```js
// packages/client/ui-layout/src/client/AppFrame.tsx
const collapsedWidth = darwin
  || document.documentElement.hasAttribute('data-windows-titlebar') ? 0 : SIDEBAR_COLLAPSED
```

so a **collapsed sidebar is a zero-width track on the macOS desktop host**
(the host keeps no icon rail there, unlike the 56px rail every other host
shows), and a 56px track everywhere else. The skin had exactly one live source
for that value, a `ResizeObserver` attached to the sidebar column, and one
fallback branch:

```js
else if (resizeObserver === undefined) applySidebarWidth(sidebar.getBoundingClientRect().width)
```

That guard is dead code in every browser that ships `ResizeObserver`, so the
direct measurement effectively never ran.

The failure is a `data-sidebar-collapsed` flip. AppFrame performs a collapse by
setting one attribute on the frame and rewriting the frame's inline
`grid-template-columns`; the sidebar subtree itself does not change, so the
observer on the column never fires and no mutation the skin's observer watches
occurs either (`data-sidebar-collapsed` was absent from its
`attributeFilter`; the `data-dsh-sidebar-collapsed` already listed is an
unrelated plugin-side marker). The width froze at the stylesheet default,
`280px` — the exact value the expanded sidebar also reports — over a column
that was `0px` wide.

This is also why the report read as cross-platform: the frozen default equals
the true value on any host whose sidebar happens to be expanded, so the web and
Windows screenshots were indistinguishable from correct. Only the macOS host's
zero-width collapse separates the frozen 280px from the real 0.

## Decision

Two changes, both in `skins/maid-atelier/`; no host behaviour is touched.

1. **The skin reacts to the host's own collapse signal.** The mutation
   observer now also watches `data-sidebar-collapsed`, the stable un-hashed
   attribute AppFrame publishes on the frame for exactly this state, and treats
   a change to it as a sidebar-structure change. That is the one notification a
   width-only collapse produces.

2. **The direct measurement is a real fallback.** `applySidebarWidth` is now
   driven by `getBoundingClientRect()` whenever the observer has not actually
   reported for the column currently in the document, not only when
   `ResizeObserver` is absent. A new `sidebarMeasured` flag starts `false`
   on every (re)attach and is set only by an actual observer callback, so
   "attached" is never mistaken for "measured". This also covers the case the
   original guard was reaching for, where the observed node is a stale
   reference because the column was remounted.

Two `translate` declarations in `patches.css` that read
`var(--maid-sidebar-width)` without a fallback — the two trim bands, and the
only two such declarations left in the file — now carry `, 280px`. With the
custom property undefined those two declarations were invalid at
computed-value time, which would drop the band's own offset entirely and snap
the lace to the window edge.

## Alternatives considered

- **Read the collapse state directly and hard-zero the width.** Rejected: it
  duplicates the host's layout solve in a plugin and would need to learn every
  platform's collapsed width (0 on macOS, 56 elsewhere, 0 under
  `data-windows-titlebar`). Measuring the column that is actually laid out
  stays correct across hosts, including a future one that changes the rail.
- **Observe the frame's inline `style` instead of the attribute.** Rejected:
  `style` changes on every animated frame of a collapse transition, so the
  skin would re-measure and rewrite the variable continuously during the
  animation it is supposed to follow smoothly. `data-sidebar-collapsed` flips
  once, at the discrete decision.
- **Keep the observer and re-attach it on every collapse.** Rejected: the
  problem is not a stale attachment but an observer that is correctly attached
  and correctly silent, because a zero-width track is not a size change worth
  reporting to it. Re-attaching would not make it report.
- **Fix the widths in the host** (have a collapsed macOS sidebar keep a rail, or
  publish the resolved width as a custom property for skins to read). Rejected
  as out of scope for the same reason the
  `2026-10-03-blue-fantasy-windows-frame-transparency` note rejected a host fix:
  AppFrame is host source this repository does not own, and a skin must not
  require a host change to render correctly.
- **Apply the same fallback treatment to the other skins that measure a
  sidebar.** Not done here. `phoebe-atelier` and `orca-link` set custom
  properties on the sidebar hosts and do not derive conversation-chrome
  offsets from a measured width, and no other skin in the catalog has reported
  the symptom. This note records the shared trap rather than claiming an
  audit that was not run.

## Consequences

- A macOS sidebar collapse (and re-expand) now repaints the lace, the crest,
  the bow and the left maid against the real width: measured `280px -> 0px ->
  280px` across a collapse cycle, with the crest returning to the window
  centre instead of resting 280px right of it.
- The live-observer path is unchanged when the observer does report; the
  fallback only fills in for it, and it costs one layout read per sidebar
  structure change.
- `data-maid-sidebar-size` now flips to `rail` at the real collapse, so the
  rail-specific chrome (the mascot, the ring, the footer) returns to its
  collapsed place on the macOS host as it already did on the web host.
- The new case is pinned by a test that fails against the pre-fix hook, so the
  dead `resizeObserver === undefined` guard cannot come back unnoticed.

## Testing

- `tests/maid-atelier-hooks.spec.ts` gains a case that applies the real hook in
  jsdom with a `ResizeObserver` stub that never reports (the worst case), then
  walks `280px -> 0px -> 280px` by flipping `data-sidebar-collapsed` on a
  frame, asserting `--maid-sidebar-width` and `data-maid-sidebar-size` at each
  step. Verified to fail against the pre-fix `hooks.mjs` and pass after.
- `tests/maid-atelier-patches.spec.ts` now pins the fallback form of the
  top-trim offset.
- A browser A/B against a fixture reproducing AppFrame's grid semantics (same
  hashed class names, `grid-template-columns` written the way the host writes
  it, the observer stubbed silent) measured, at a 1400px viewport: pre-fix the
  collapsed state held `280px` with the column at `0px` and the trim's left
  edge at 280; post-fix it holds `0px` with the trim at 0 and the crest
  centred at 700. The same fixture with a real `ResizeObserver` tracks
  `280 -> 0 -> 280` both before and after, so the live path is not regressed.
- `pnpm test` (59 files, 639 tests), `pnpm typecheck`, `pnpm skin-center:check`
  and `pnpm skin-hooks:check` pass; the generated reviewed-hooks registry was
  regenerated for the changed hook hash.
- Not verified on a real macOS machine: the running GUI here is the web host on
  Windows, and the host's 401 browser-session auth is not available to it, so
  the evidence is the fixture that reproduces the host's own collapse contract
  plus the reporter's macOS screenshots, not a captured macOS client.
- The market build in dsh-web is regenerated from the new gitlink and verified
  with `pnpm market:check`.
