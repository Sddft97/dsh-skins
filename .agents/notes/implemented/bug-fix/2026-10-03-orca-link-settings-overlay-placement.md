# Agent Note: the orca-link settings dialog centres once a centred dialog clears the sidebar rail

Status: implemented

## Problem

With the orca-link skin active, the settings dialog was docked into the
lower-left corner of the screen at every desktop size. The dock seats a
fixed 760x680 panel with `justify-content: flex-start` and `align-items:
flex-end` on the overlay that carries it, so the dialog's position has no
relationship to the viewport it lands in. On a 4K display that puts a
760x680 box in the corner of a 3840x2160 screen, which the reporter filed as
a dislocated settings page ([zhu1090093659/dsh-web#1792](https://github.com/zhu1090093659/dsh-web/issues/1792))
and asked to be shown in the centre instead.

orca-link is the only skin in the catalog that overrides the settings
overlay's placement at all; every other skin inherits the host's centered
overlay. The defect is therefore this skin's alone, and it is in the skin's
stylesheet rather than in the shell.

The dock is not arbitrary. It exists so a dialog of this size does not land on
the sidebar rail, which the skin also styles (`--orca-sidebar-width:
clamp(258px, 20.2vw, 326px)`). Removing it outright would push the dialog onto
the rail on narrower desktops, so the dock has to be kept where it still earns
its place.

## Decision

The dock is kept exactly as long as a centered dialog would collide with the
rail, and dropped the moment there is room. The hand-over width follows from
the panel's own size and the rail's own ceiling:

```
(100vw - 760px) / 2  >=  326px (rail ceiling) + 16px gap   =>   100vw >= 1444px
```

The rail is `--orca-sidebar-width`, and the skin's own sidebar-width hook
re-measures it onto `<body>` whenever the layout changes, so it is not a
constant: 326px is the `clamp()` ceiling in `skin.css`, and the measurement
only ever lands under it. The bound is taken at that ceiling on purpose.
Centring a moment earlier than strictly necessary would put the dialog on the
rail for the widest sidebar the skin can produce; centring a moment later is
merely conservative, and below the threshold nothing changes at all.

```css
@media (width >= 1444px) and (height >= 681px) {
  body[data-orca-settings-open] [class*="_overlay"]:has(> [data-dsh-surface="settings"]),
  body[data-orca-sidebar-wide] [class*="_overlay"]:has(> [data-dsh-surface="settings"]) {
    justify-content: center;
    align-items: center;
    padding: 18px;
  }
}
```

**The threshold is expressed in CSS pixels, not in device pixels, and that is
the whole point of deriving it.** The issue could not say how the reporter's
Windows display scaling was set, and it decides the answer: a 4K panel at 100%
is a 3840 CSS px viewport, at 150% it is 2560, at 200% it is 1920. A threshold
picked as "a 4K display" would have to be restated for each scaling factor and
would leave a 4K user at 200% still looking at the corner dock. Comparing the
viewport against the panel it has to place holds at every scaling, because
both sides of the comparison are already in the same unit.

The rule keeps the desktop height floor of the dock it replaces, so the
full-bleed small-screen layout (`(width <= 1099px), (height <= 680px)`) is
untouched, and the two media queries stay mutually exclusive.

## Alternatives considered

- **Center at every size and delete the dock.** Rejected: below 1440px a 760px
  dialog centered in the viewport does land on the sidebar rail, which is the
  one thing the dock was written to prevent. It would also throw away a
  deliberate part of the skin's look for no gain on the viewports that are
  already comfortable.
- **Key the hand-over to a display size ("4K and above").** Rejected: display
  size is not a CSS value. The same 4K panel reaches the rule at 100%, 150%
  and 200% scaling through three different viewport widths, so a
  device-pixel threshold fixes some of the reporter's configurations and
  misses the rest.
- **Scale the panel up with the viewport and keep the corner.** Rejected: it
  answers a problem the reporter did not report. The complaint is that the
  dialog is not in the middle, and a larger dialog in the corner is still in
  the corner.
- **Fix it in the host's settings overlay.** Rejected: the host centers
  correctly, and no other skin misplaces the dialog. Changing the host would
  be a fix for a defect that does not exist there.
- **Leave the placement alone and tell the reporter it is by design.**
  Rejected: the design intent recorded in the stylesheet is clearing the rail,
  not stranding the dialog in a corner, and on a 4K viewport the placement no
  longer achieves the intent it was written for.

## Consequences

- The settings dialog is centered on every display wide enough to center it,
  which includes all three common scalings of a 4K panel and every ordinary
  desktop. This is a visible change at 1920x1080 as well, which is the point:
  the same fixed-pixel seat was merely less obviously wrong there.
- Desktops below 1440 CSS px keep the corner dock unchanged, and so do short
  and small windows, which keep their full-bleed layout.
- Nothing else about the dialog changed. Its size, border, shadow, square
  chrome, nav and hosted panels are the work of
  [2026-09-30-orca-link-settings-panel-geometry](2026-09-30-orca-link-settings-panel-geometry.md),
  which is unaffected.
- orca-link still sits apart from the rest of the catalog below 1440 CSS px,
  where it is the only skin that moves the settings dialog at all.

## Testing

- `tests/orca-link-settings-overlay-placement.spec.ts` resolves the cascade
  out of the authored stylesheet -- media queries, specificity, source order
  and the `padding` shorthand -- evaluates the panel's `width`/`height` as
  CSS lengths and places the box with the overlay's flex alignment, so the
  assertions read the box a user would see rather than a stylesheet string.
  It covers the 4K panel at 100%, 150% and 200% scaling in both sidebar
  states, the hand-over at 1443 and 1444 CSS px, the retained dock, the
  full-bleed small-screen layout, and that no placement declaration is
  `!important` (the resolver ignores it, so an important declaration would
  otherwise be reported as the winning one).
- The suite was mutation-tested rather than only observed passing, because a
  placement resolver that silently mis-evaluates a rule reports a confident
  false pass. Four mutations, each of which must fail it:
  deleting the centring rule (7 failures); moving the hand-over earlier than
  the derivation allows, to 1380px (the width sweep names every width that
  centres onto the rail); moving it later, to 2000px (3 failures, so a
  needlessly conservative breakpoint is caught too); and centring only the
  horizontal axis (6 failures).
- The resolver fails loudly rather than guessing wherever it cannot be exact.
  An unrecognized media feature or at-rule throws instead of returning false,
  because "this rule does not apply here" is the one answer that hides a rule
  the browser would have applied. That is what keeps the `@keyframes`,
  `@supports` and `@container` blocks honest: their contents are read as
  applying only because a test pins that none of them addresses the dialog, and
  `:has()` is weighed as its argument alone, per Selectors Level 4.
- The rail is asserted at its clamp ceiling, not at a typical measurement. The
  hand-over width is derived from the ceiling, so a breakpoint moved earlier
  still clears a typical rail and would pass a test written against one; the
  sweep is what closes that.
- `pnpm test`: 55 files, 799 tests. `pnpm typecheck`, `pnpm skin-center:check`
  and `pnpm skin-hooks:check` pass.