# Agent Note: The standalone Wallpaper Engine plugin is detected, never displaced

Status: implemented

**Superseded by
[2026-10-05-wallpaper-engine-delegated-to-its-own-plugin.md](../architecture/2026-10-05-wallpaper-engine-delegated-to-its-own-plugin.md).**
The probe-and-advise half recorded here survives (renamed and repurposed as the
install pointer), but the decision this note owns — "detected, never displaced" —
no longer holds: the skin center removed its own Wallpaper Engine bridge and now
yields the page to that plugin while it renders. Read the superseding note for
current behavior; this one is kept as the record of the advisory round.

## Problem

`dsh-plugin-wallpaper-engine` renders the machine's Wallpaper Engine library onto
the DSH GUI by itself: it scans the same WE library, paints its own full-viewport
fixed layer, stamps `body[data-we-wallpaper]` / `body[data-we-sidebar-glass]`, replaces
the settings window's material and drives the host theme from the wallpaper's dominant
color. The skin center does each of those things too, through the `data-dsh-skin` stamp,
the shared shell-rendering adapter, the `data-dsh-composer-frost` follower and the host
theme.

Installed together in one profile the two are not merely redundant. Each paints a
full-screen fixed layer, so which one is visible depends on mount order; each keeps a
fixed `backdrop-filter` element, and the two sample a shell whose ancestor chain the
other one relaid, so both glass passes go wrong; and two writers fight over
`theme.setTheme`. The plugin's own README and workshop entry already state the
either-or, but nothing on this side told the user why the GUI looked broken, and the
switch steps — which are host-side, so a page refresh never suffices — were written
nowhere.

## Decision

**The skin center detects the standalone plugin and tells the user; it never tries to
remove, disable or outrank it.** Detection is a read-only host probe
(`src/coexistence.ts`), driven by two signals: the active profile manifest naming
`dsh-plugin-wallpaper-engine` in any dependency section (npm, `link:` and file installs
all land there) and any patch layer under the harness home carrying a row that names
the package. Either signal is enough; a disabled row still counts, because a wired but
inactive plugin is exactly the state the notice exists for.

The probe is exposed as `GET /api/skin-center/v2/coexistence` and rendered by
`src/client/CoexistenceNotice.tsx` at the top of the card. The client renders nothing
for a clean profile, a non-answering host or a failed fetch, so an older host that lacks
the route stays silent rather than showing a false alarm. The notice states the choice,
names the package, and links the standalone plugin's own README instead of duplicating
its install commands.

The switch guidance lives in the README pair (English and Chinese), which owns both
directions of the swap and the stopgap: select 官方默认, keep the custom theme off,
clear the wallpaper selection and turn the card's own master switch off, which leaves no
skin, scrim, blur layer or composer frost from this side.

## Alternatives considered

- **Auto-disable one side when the other is detected.** Rejected. The probe reads a
  profile the plugin manager may rewrite at any moment, the two installations answer to
  different owners, and silently disabling a plugin the user deliberately installed is a
  worse failure than the overlap it would prevent. The choice belongs to the user; the
  card's job is to make it informed.
- **Share one WE bridge between the two plugins.** Rejected as out of scope: it would
  couple this repository's release cycle to another package's, and the issue explicitly
  does not ask either implementation to change.
- **Detect from the browser instead of the host.** Rejected. The signals are profile
  files and patch layers; the browser half has no filesystem access, and inferring from
  `body[data-we-wallpaper]` would only report the plugin AFTER it painted, which is
  after the damage the notice is meant to explain.
- **Fail loudly (a card error) when the probe cannot read the profile.** Rejected. A
  missing patch file, a hand-written profile and a remote deployment all produce
  unreadable input without any coexistence problem, so the probe fails closed to "not
  detected" and the card stays quiet.
- **Delete the standalone plugin's files.** Rejected outright: the plugin is another
  author's published package, and this repository has no business removing it.

## Consequences

- The card gains one advisory box that appears only when the standalone plugin shares
  the profile. It is additive: no existing control changes behavior, and the notice
  carries no action beyond a documentation link.
- The probe is a new host read path over the harness home. It resolves paths through the
  existing `resolveHarnessPaths` (the same precedence the legacy bridge uses) and reads
  at most three small files plus one manifest per request; it never writes.
- Two plugins in one profile remain possible. The notice does not prevent the broken
  overlap; it names it and points at the fix, which is the most this side can correctly
  do for a package it does not own.
- A future rename of the standalone package needs the constant in
  `src/coexistence.ts` updated in the same change as the README's links.
