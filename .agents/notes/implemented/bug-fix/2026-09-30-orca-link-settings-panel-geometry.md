# Agent Note: orca-link keeps hosted panel geometry inside the squared settings dialog

Status: implemented

## Problem

With the orca-link skin active, the skin-center panel in Settings rendered as visibly broken: the status badge (当前激活) lost its pill shape and read as a clipped block, and the action buttons (试穿 / 应用 / 卸载) lost the rounded shape that separates them from the card surface. The card's own geometry was gone, so the row stopped reading as "a card with a status and some actions".

The cause is the skin's blanket corner reset, which squares the settings dialog:

```css
[data-slot="sidebar.settings"] [role="dialog"] *, ... :before, ... :after {
  border-radius: 0 !important;
}
```

The `*` reaches every descendant, so it also reaches every panel the dialog hosts. The skin-center module declares `border-radius: 999px` on `.badge`, `8px` on `.card` and `6px` on `.button`, and each of those is overridden. The buttons are plain `<button>` elements, which the skin's own root-level rule (the one that squares `:where(button, ...)`) already targeted, so the flattened look was doubly guaranteed.

This is the widest-scope rule the skin ships, and the settings dialog is the one place where third-party panels are composed in: the skin center, the pet plugin, the preset center and every other settings section live there, and none of them opt into a square grammar.

## Decision

The dialog chrome stays square — that is the skin's identity and it is deliberate. What changes is that a **hosted panel keeps the geometry its own component module declares**. orca-link now restores the three skin-center surfaces explicitly, each with the radius its module declares:

```css
body[data-dsh-skin-center] [class*="_card"]   { border-radius: 8px; }
body[data-dsh-skin-center] [class*="_badge"]  { border-radius: 999px; }
body[data-dsh-skin-center] [class*="_button"] { border-radius: 6px; }
```

The selectors use the panel's own hashed class fragments scoped by the `data-dsh-skin-center` body marker the panel itself sets, which is how the rest of the skin's exceptions are already written.

**A `revert` cannot express this** and was tried first: the blanket reset is `!important`, so beating it needs an `!important` declaration, and `revert` at that priority discards the panel's own `border-radius` along with the reset — restoring nothing. Restating the declared value is the only expression that hands the surface back to its component while leaving the dialog square. The value is duplicated from the panel's CSS module on purpose; the test below fails if either side moves.

## Alternatives considered

- **Narrow the blanket rule to the dialog's own chrome** (its padding, header and nav) instead of every descendant. Rejected for now: it is the correct end state, but the dialog's chrome has no stable anchors of its own — the rules that follow it address `> nav`, `nav + div` and their children positionally. Scoping it correctly means naming every chrome element, which is a larger, riskier change to a skin with no browser-layout test harness. The panel-scoped exception fixes the reported defect at its actual source (the panel's geometry) without disturbing the dialog work.
- **Restore radius for every descendant and re-square the chrome.** Same anchor problem as above, inverted, and it would fight any panel added later rather than leaving each panel to itself.
- **Ship the fix in the skin-center package instead** (a skin contract for panel geometry). Rejected: the skin is the component that flattened the panel, the defect is in this skin's stylesheet, and a contract for one reported skin would be a larger surface change than the bug warrants. A panel that wants the skin's square grammar remains free to declare it.
- **Restyle the skin-center panel to fit the skin** (square badge, square buttons, skin colors). Rejected: it would make the panel legible but leaves the blanket reset in place, so the next panel shipped by any plugin breaks the same way. The defect is the over-broad rule, not the panel.

## Consequences

- The skin-center card regains its pill badge and rounded actions; the card surface keeps its own radius too, so the row reads as one component.
- The dialog chrome, its nav and its own controls are unchanged — the skin's square grammar still reads in the frame around the panel.
- The fix is scoped to `data-dsh-skin-center`. Other hosted panels (pet, preset center, the host's own settings sections) are still flattened by the blanket rule; they are not reported as broken yet, and each needs its own exception when one is, since the panel's declared value is what must be restored.
- The skin's root-level square-off of `button` and the ARIA widget roles still applies everywhere else, including the composer and the chat surfaces, where it is the intended look.

## Testing

- `tests/orca-link-settings-panel-geometry.spec.ts`: the skin-center card, badge and button each have a rule giving them a non-zero radius (and not a `revert`, which would restore nothing), and the dialog chrome rule is still there squaring the frame — so the fix cannot be "solved" by deleting the skin's grammar. The suite asserts on parsed declarations rather than a file snapshot, matching the hit-target suite, because the defect is which declaration wins.
- Removing the three rules fails the suite, so the regression cannot return silently.
- `pnpm test`: 53 files, 772 tests. `pnpm typecheck`, `pnpm skin-center:check` and `pnpm skin-hooks:check` pass.
