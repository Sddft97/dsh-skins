# Agent Note: The persisted selection has one writer, and every reader adopts it

Status: implemented

## Problem

Applying a skin and saving that choice are one action in the card, but the
selection outlives the page that made it: it lives in
`$DSH_HOME/skin-center-active.json` and is read back by every other client
sharing that home. Three reader paths exist, and all three converged by calling
`controller.switchTo()`, which commits AND writes (`POST /active`):

- boot recovery (`bootSkinRuntime`): the tapIndex adapter stamps
  `html[data-dsh-skin]` for first paint, and boot applies that stamp; on a host
  without the stamp (the packaged desktop client) it reads `GET /active`
  instead;
- the persisted-selection follower (`watchPersistedSelection`), documented as
  "the poll only reads: it never writes the selection back";
- the workshop announcement (`dsh-skin-applied`).

Issue #54 reported the consequence with two clients on one `DSH_HOME` (DSH Web
plus the official Desktop, both `0.2.0-rc.2`): the user applies
`black-gold-vip` from one client, the skin switches on both, and some time later
it reverts to `claude` on its own. The isolated reproduction is deterministic -
a page still carrying the older `data-dsh-skin="claude"` boots, applies that
stamp, and POSTs `claude` back over the newer stored choice. The follower has
the same shape: it converges through `switchTo`, so following a write becomes a
write.

Two failures follow from one cause. First, a READER is authoritative: whichever
client boots last wins, regardless of which choice is newer. Second, the
documented read-only contract is not what the code does.

## Decision

**The persisted selection has exactly one writer: a user-initiated commit. Every
reader adopts.**

`switchInternal` takes an explicit three-valued mode instead of the old
`shouldPersist` boolean:

- `commit` - the user chose this in the card (apply, or re-apply). It becomes
  the committed selection AND is POSTed. This is the only writing mode.
- `preview` - a try-on, or an internal re-paint (`refresh()`, the yield check,
  `exitTryOn()`). The committed selection is untouched and nothing is written.
- `adopt` - this page is mirroring a choice another client already persisted.
  It becomes this page's committed selection, so try-on restores it and the
  follower sees it as applied, but it is never written back.

`SkinController` gains `adopt()`, and boot recovery, the follower and the
workshop announcement all go through it.

The follower's baseline seeding is part of the same fix. It used to seed
`applied` from a blind `GET /active`, which marks the disk value "already
applied" even when this page actually booted on a different stamp. When the two
differ another client wrote a newer choice while this page was loading, and that
newer choice must still be converged on; the baseline now follows what the page
actually shows, leaving the first tick to adopt the persisted value.

## Alternatives considered

- **Send the observed revision with the write and reject stale ones.** Rejected:
  it makes every reader a writer still (each would POST, and the server would
  have to arbitrate), and it needs a new wire field and a migration for a
  problem whose real shape is "readers should not write at all".
- **Have the follower compare timestamps before writing.** Rejected: the file
  carries no timestamp, and wall-clock ordering across two machines sharing one
  home is exactly the comparison that is not trustworthy.
- **Keep `switchTo` and pass a "don't persist" flag from the readers.**
  Rejected: it is the same three states spelled as a boolean plus call-site
  knowledge, and it leaves the next reader to rediscover which one applies.
  Naming the modes makes the choice visible where the activation is created.
- **Only fix boot recovery (the path the report isolated).** Rejected: the
  follower converges through the same method and would reintroduce the overwrite
  on the next poll. One cause, one fix.
- **Stop the follower from converging at all when the value did not change.**
  Already true, and not sufficient: the follower must still apply a value that
  DID change, and that application was the write.

## Consequences

- Two clients on one `DSH_HOME` no longer fight: each applies the persisted
  choice and neither overwrites the other. The reported revert is gone.
- The documented contract is now the code: the poll reads and never writes.
- `adopt` is a commit for try-on purposes, so a preview started after a
  convergence restores the adopted skin rather than a stale local one.
- The write path narrows to one call site (`switchTo`), so a future reader
  cannot reintroduce the bug without deliberately choosing the committing mode.
- `SkinActivationOptions` and the controller's public surface both changed;
  `adopt` is additive, so the market try-on shell (which calls `switchTo`
  directly for a user-driven picker) is unaffected.
