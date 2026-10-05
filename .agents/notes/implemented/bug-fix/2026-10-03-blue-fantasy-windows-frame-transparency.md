# Agent Note: a scrim-tracking sidebar fill also needs the Windows frame cleared

Status: implemented

## Problem

With blue-fantasy active, the whole DSH window on the Windows desktop client was
flat #1d2539 and the whale illustration was completely invisible as long as the
skin center's Background-occlusion slider stood at its default 0. Raising the
slider to 100 brought the illustration back, and at that value the desktop and
the web host rendered identically. On the web host the same skin at the same
occlusion 0 was correct ([zhu1090093659/dsh-web#1803](https://github.com/zhu1090093659/dsh-web/issues/1803)).

The reporter's F12 walk up the ancestor chain from a blank point in the
conversation column found the opaque element: `DIV.BynINW_frame`,
`background: rgb(29, 37, 57)`, whose ancestors (`#root`, `body`, `html`) all
carried no such colour. `rgb(29, 37, 57)` is exactly the fill this skin assigns
to `--dsw-specific-sidebar-fill` in its dark block.

The mechanism is the one
[2026-09-29-open-issues-resolution-1743-1751](https://github.com/zhu1090093659/dsh-web/blob/dev/.agents/notes/implemented/bug-fix/2026-09-29-open-issues-resolution-1743-1751.md)
recorded for #1763: the Windows shell paints `--dsw-specific-sidebar-fill` on
its whole-window frame element, and the web host consumes the same token on the
sidebar only. What is new here is the trigger. maid-atelier and cyber-night kept
that token translucent enough for the illustration to survive the frame; this
skin writes it as a scrim-tracking colour:

```css
/* skin.css, light block :95 and dark block :186 */
--dsw-specific-sidebar-fill: rgba(29, 37, 57, calc(1 - var(--dsw-skin-scrim, 0) * .45));
```

At scrim 0 the alpha is 1, so the token the web host is happy with becomes a
fully opaque frame on the desktop shell. Because that frame is an ancestor of
the conversation column and a stacking context of its own, it painted after the
`z-index: -2` `contributes.backgroundMedia` layer and covered it there. Every
other skin that reads this fill at a fixed alpha hides the difference; this one
makes it maximal at the default slider position, which is why the bug had never
shown up as a whole-window blank before.

## Decision

The frame is cleared, exactly as maid-atelier and cyber-night clear it. One
declaration, appended to `skins/blue-fantasy/patches.css`:

```css
[class*="_frame"] {
  background: transparent !important;
}
```

The suffix match on `_frame` covers the shell's CSS-module hash
(`BynINW_frame` in the reporter's trace, `ZTP-Xa_frame` in #1763) and, unlike a
`:root` head, survives the skin-center `/patches` prefix pipeline, which scopes
every selector under `html[data-dsh-skin="<id>"] `. It matches only an element
whose class carries that suffix; the web host tolerates the identical rule under
maid-atelier today, so the two hosts keep rendering the same declarations.

The other half of the #1763 pair, `body { isolation: isolate }`, is deliberately
**not** added. That rule belongs to a skin whose own stylesheet paints an opaque
`body` background, which stops the host's -2 layer from propagating; this skin's
opaque paint is on `html` (the `background-color: #e8ecf5` / `#101624` in
`skin.css` are on `:root` and are cloned onto `body` by the transform), and the
reporter's trace shows the illustration painting correctly at occlusion 100,
where body is still painted. Adding isolation would change which step the body
background paints at, in both hosts, to fix nothing the frame rule does not
already fix. If a future shell change makes the art disappear on the web host
too, that is the point to revisit the pair.

The scrim-tracking token itself is kept, because the three columns must stay one
surface at every slider value -- that is the decision the skin's own chrome block
owns (`patches.css`, issue #1579) and `tests/blue-fantasy-chrome-density.spec.ts`
pins; this change does not touch it.

## Alternatives considered

- **Give `--dsw-specific-sidebar-fill` a fixed alpha.** Rejected: the value has
  to reproduce the left pane's ramp from scrim 0 to scrim 1 for the three
  columns to read as one surface (#1579). A fixed alpha would flatten that ramp
  on the one token the whole frame is built from.
- **Clear the frame with `background: none` like miku's `[data-dsh-frame]`
  rule.** Rejected: that rule is anchored on the aggregate shim's compat
  attribute, which the Windows shell's own frame does not carry; the reporter's
  trace is a `frame` class element. The suffix form is what the two skins that
  solved this same shell on Windows already use (#1763).
- **Fix it in the host, by having the Windows frame paint
  `--dsw-alias-bg-base` instead of `--dsw-specific-sidebar-fill`.** Rejected for
  the same reason #1763 rejected it: it is host CSS this repository does not own,
  it would move every installed skin at once, and it is not needed -- the token
  is correct for the sidebar, which is what the web host uses it for.
- **Raise the frame's stacking instead of clearing its paint.** Rejected: the
  frame wraps the entire app, so no z-index on it or on its descendants can put
  the illustration above the frame while leaving the conversation below the
  conversation panels.

## Consequences

- The whale illustration is visible on the Windows desktop at occlusion 0, and
  the occlusion slider keeps driving the sidebar, the conversation header and
  the right panel through the same token it drove before.
- The frame element paints no fill at all under this skin, in either host. No
  skin content sat on it: the frame is the shell's own box and the skin's
  columns paint their own fills.
- The class-suffix selector is flagged by the transform's warning pass as
  relying on a CSS-modules hash name, as it is for maid-atelier and cyber-night.
  That warning is a note, not a failure; the declaration is the accepted form
  for this shell, and the spec pins it.
- Any other skin that writes `--dsw-specific-sidebar-fill` as an
  occlusion-tracking `rgba()` carries the same latent whole-window blank on the
  Windows desktop. white-snake is the one other skin in this catalog that does
  (`calc(1 - var(--dsw-skin-scrim, 0) * 0.35)`, light and dark, 0.65 alpha at
  scrim 0); it is not fixed here because it was not reported and its 0.65 alpha
  may well be survivable, but it is the next candidate if that report arrives.

## Testing

- `tests/blue-fantasy-frame.spec.ts` pins the declaration, the surface it lives
  on, the fact that the frame rule does not neutralize the scrim token, the
  scoped selector `transformSkinCss` emits (`html[data-dsh-skin="blue-fantasy"]
  [class*="_frame"]`), and the cascade result under a Windows-shell fixture: an
  opaque `.BynINW_frame` background with the served stylesheet applied computes
  to `rgba(0, 0, 0, 0)`, while a sibling `.sidebarCol` keeps its own fill.
- The spec was mutation-tested rather than only observed passing: deleting the
  two-line rule fails 5 of its 7 assertions, including the computed-style one.
- The Electron compositor still cannot be reproduced in this session -- the
  running GUI is the web host, which paints the same illustration with and
  without the rule -- so the Windows-visible outcome rests on the reporter's
  own before/after (the mitigation they applied by hand is byte-identical to
  this rule), plus the #1763 and #1745/#1746 desktop measurements.
- `pnpm test`, `pnpm typecheck`, `pnpm skin-center:check` and
  `pnpm skin-hooks:check` pass; the market build in dsh-web is regenerated from
  the new gitlink and verified with `pnpm market:check`.
