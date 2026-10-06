# Agent Note: A delegated plugin can be a skin, and it keeps its own page

Status: implemented

## Problem

The delegated wallpaper bridge showed this package how to stop owning a visual
surface without losing its users (issue #39, see
[2026-10-05-wallpaper-engine-delegated-to-its-own-plugin.md](architecture/2026-10-05-wallpaper-engine-delegated-to-its-own-plugin.md)):
name the other plugin, probe the profile, point the card at it, stand the skin
down while that plugin owns the page. That works while the other feature is a
*mode* the user turns on and off inside its own settings - a wallpaper exists,
or it does not.

A whole-GUI theme plugin is not a mode. `dsh-claude-style` repaints the shell,
the sidebar, the composer and the conversation as Claude Code Desktop the
moment its client bundle mounts, and it ships its own `skin.json` declaring an
id, a package, the attribute it stamps and the cordis row it inserts - the
exact shape the retired v1 `package` / `wiring` / `bodyAttr` manifest fields
used to mean. Under v2 those fields are deprecated and ignored, so a user who
installs that plugin and opens the Skin Center finds nothing: no row, no
install prompt, no explanation. The theme simply fights whatever skin is
active, and the page ends up with two owners of one shell.

The v2 model itself is right and stays: a skin is a pure asset directory this
package loads, and only this package loads. What was missing is the one narrow
exception for a visual this package cannot ship, the same way the wallpaper
delegation is the one narrow exception for a visual it cannot render.

## Decision

**A delegated skin is a first-class, selectable skin whose visual belongs to
another plugin, and the handoff is one attribute pointing one way.**

Added, in the order the request travels:

- `src/core/delegated-skins.ts` - the registry of delegated plugins. One entry
  today (`dsh-claude-style`), each carrying its id, package, repository,
  install command, the attribute it stamps, the attribute that advertises it
  can hand the page back, and its cordis row. The registry is a copy of the
  plugin's own descriptor because the row has to exist BEFORE the package does;
  when the package IS installed, its own `skin.json` is read back and compared,
  and a mismatch becomes a catalog warning rather than a silently dead handoff.
- `src/core/profile-plugin-probe.ts` - the read-only "is this package in this
  profile" probe, extracted from the wallpaper module, which keeps its names.
  Two dependencies, any of which is enough: the profile manifest naming the
  package, or a patch layer carrying a row for it. It never writes.
- The row is served by the existing catalog route as `origin: 'delegated'`,
  listed whether or not the plugin is installed, because an installed-and-enabled
  plugin nobody can find is a plugin nobody uses. `GET`/`POST /active` accept
  the id, and the index tap leaves `html[data-dsh-skin]` off for it - which is
  the whole first screen: no stamp, no stylesheet row, no flash, and the
  plugin paints from its own client chain.
- `src/client/runtime/skin-controller.ts` - a delegated entry activates like any
  other skin (persisted, adopted on boot, restored by try-on) and paints
  nothing: no stylesheet request, no background, no stamp. It is a selection,
  not a stand-down, so the card shows it as the active row rather than the
  wallpaper's "paused" notice.
- `src/client/DelegatedSkinCard.tsx` + `src/client/runtime/delegated-theme.ts` -
  the row and the read-only watcher over the plugin's two body attributes.
  Try-on and apply are offered only when the plugin is on the page AND its
  build advertises the handoff; otherwise the row states which of the two is
  missing. Install goes through the host's own plugin manager, the same call
  the Plugins page and the Workshop make (`src/client/plugin-install-faces.ts`,
  extracted from the wallpaper notice and shared).

**The contract with the other plugin is one attribute pointing one way:** the
delegated plugin reads `html[data-dsh-skin]` and stands its visual down while
it is present (and while `body[data-we-wallpaper]` is). This package never
writes an attribute the plugin owns, the plugin never writes `data-dsh-skin`,
and neither can strand the other. The plugin also keeps its settings page and
its preferences while yielded - a yield suspends the visual, it does not
uninstall anything.

Capability is read, never assumed: the plugin stamps its handoff attribute
while it can stand down, and a build without it is not offered the row. That
is the difference between a feature and a claim - offering apply on a plugin
that cannot yield would let the user select this skin and then pick a real skin
over it, which is precisely the double-owner page the delegation exists to end.

## Alternatives considered

- **Keep it a notice, like the wallpaper coexistence advisory.** Rejected. That
  round was about two THINGS in one profile; this is one feature the user
  selects as their look. A notice leaves the plugin unfindable and the overlap
  unhandled, and the user has to be told the switch steps that the Skin Center
  should be offering as one click.
- **Make it a real skin directory whose `skin.json` carries the plugin's
  fields (resurrect v1).** Rejected: it puts a third party's runtime contract
  inside the fail-closed v2 manifest, where unknown fields are hard errors and
  the CSS pipeline would scope files that do not exist. It also makes the
  delegated plugin's own release cadence a schema change here.
- **Install/disable the plugin through the plugin manager as the selection.**
  Rejected. A skin is a transient visual choice; a plugin row is durable
  installed state. Toggling it would also take the plugin's settings page and
  preferences away with it, and would make a skin switch rewrite persisted
  plugin state - on a paired desktop, over the other client's profile.
- **Ask the plugin for a client service instead of reading an attribute.**
  Rejected as the request channel: the attribute is already in the served
  document, so the answer holds from the first frame for free, and the
  wallpaper delegation already established `html[data-dsh-skin]` as the public
  "a skin is on the page" signal other plugins key their hand-back on. Adding
  a second channel for the same fact would be a second contract to keep in
  step. (The capability marker is still an attribute, so a peer that cannot
  implement a service can still say what it can do.)
- **Bundle or vendor the peer plugin.** Rejected outright: it is another
  author's published package, independently versioned, and this repository has
  no business shipping it.
- **Let a wallpaper-owning page and a delegated skin coexist silently.** They
  already cannot: the delegated plugin yields to `body[data-we-wallpaper]` in
  the same contract, and the card says so while the wallpaper renders.

## Consequences

- The Skin Center gains one row kind. A delegated skin carries no `contributes`
  and no files, so every path that serves skin assets is untouched, and the
  bulk verify/update/uninstall buttons filter on `origin: 'user'` and never see
  one. A future delegated plugin is a registry entry, not a code change, unless
  it needs its own card state.
- The first screen needs no new machinery: a delegated selection means no
  `html[data-dsh-skin]` stamp, which is exactly the document the stock look
  already needs. The wallpaper prediction (issue #51) is untouched.
- The dependency on the peer is new work on its side: reading
  `html[data-dsh-skin]` and `body[data-we-wallpaper]` to stand down, and
  stamping its own handoff marker so this package can tell a build that can from
  one that cannot. A rename on either side needs the constant in
  `src/core/delegated-skins.ts` updated in the same change.
- The peer has to change for the row to be applicable. Until it does, the row
  says the build cannot hand the page back and offers nothing - the honest
  state, and one this package can reach without the peer.
- A delegated skin is only as independent as its plugin: an upgrade or
  removal of that plugin changes what the row does, and the row reports the
  live state rather than a stored guess.
