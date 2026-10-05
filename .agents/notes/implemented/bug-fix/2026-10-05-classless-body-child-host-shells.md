# Agent Note: the app-body lift rule anchors #root, never a classless body child

Status: implemented

## Problem

With whale-fantasy active on the Windows desktop client, the caption's 应用 / 编辑
menu buttons disappeared and could not be clicked. Three skins
(`whale-fantasy`, `rainy-night`, `xinghai-heart`) lifted the application body
with a fallback selector:

```css
body > #root,
body > div:not([data-dsh-skin-layer]):not([data-dsh-plugin]):not([role]):not([class]) {
  position: relative;
  z-index: 2;
}
```

The comment above it assumed every other body-level portal carries a class or a
role. The desktop shell's Windows caption menu host does not: `installWindowsMenu`
(`apps/desktop/src/preload-menu.ts` in the DSH checkout) creates a bare
`<div data-windows-menu>` whose `role="menubar"` lives inside its shadow tree, and
appends it to `document.body`. The fallback matched it, and because a document
declaration outranks a shadow `:host` rule, the host's `position: fixed` +
`z-index: 1100` became `relative` + `2`: the host left the caption, was laid out
after `#root`, and rendered outside the viewport.

The desktop host is not the only risk. Any shell that appends a classless
container to `document.body` and positions it itself is matched by the same
pattern, and the skin cannot see such hosts before they ship.

## Decision

The lift rule keeps its declarations byte-for-byte and narrows to the element it
was always about:

```css
body > #root {
  position: relative;
  z-index: 2;
}
```

`#root` is the application body in every shell (the id is written in the shared
`index.html`), so the fallback bought nothing. The three skins carry the same
rule; all three are changed, and the comment records why the fallback must not
come back.

`tests/body-child-host-shells.spec.ts` pins the invariant mechanically: for every
skin, no rule may take a body direct child as its subject unless that subject
carries an id, a class, an attribute or a pseudo-class. The check is
comment-stripped and brace-scoped so an explanatory comment cannot trip it and a
`@media` wrapper cannot hide a rule.

## Alternatives considered

- **Excluding the known host** (`...:not([data-windows-menu])`): rejected. It
  fixes today's symptom by allow-listing the one host that was reported, and the
  next shell (or plugin) that appends a classless container to body reproduces
  the defect. The selector had no business matching host shells at all.
- **Restoring the host explicitly** (`body > div[data-windows-menu] { position: fixed !important; z-index: 1100 !important }`):
  rejected for the same reason, plus it makes every skin a maintainer of the
  desktop shell's private geometry — the values would silently drift from
  `preload-menu.ts`.
- **Keeping the fallback and listing the allowed attribute selectors**: rejected
  as an allow-list of the same kind; it encodes today's knowledge of host shells
  into three skins.

## Consequences

- The application body is still lifted, so the skin's background stack keeps
  painting under the shell surfaces; only the classless fallback is gone.
- A future shell that renders a classless body child is no longer styled by any
  skin, which is the intended boundary: skins style the application, not the
  host's own overlay shells.
- The new spec fails if any skin reintroduces a classless body-child subject
  (verified by reintroducing the old selector and observing the failure).
- The same pattern is the mechanism behind the 2026-09-16 better-sidebar
  containing-block defect; that note owns the paint side, this one the anchor
  side.
