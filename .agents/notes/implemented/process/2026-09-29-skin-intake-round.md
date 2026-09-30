# Agent Note: The 2026-09-29 skin intake round

Status: implemented

## Problem

The 2026-09-29 maintenance round reviewed the three open skin pull requests in
this repository at once: #1 (porco-rosso, last-exile, white-snake), #16
(rainy-night) and #18 (meridian). All three had green CI on their heads, and CI
cannot see the questions this repository's intake gates ask - whether the
artwork is licensed and attributed, whether the user-visible evidence is real,
and whether the result is acceptable to look at. Two of the three also carried
things CI does not fail on: a 46 MiB asset and a helper script outside the
submission's scope.

## Decision

**#1 was merged.** It had already returned from a request-changes review. Each
claimed fix was re-verified against the code rather than accepted from the
reply: the hooks now track and remove the background nodes and restore
`bgLayer.style.cssText`, and `tests/builtin-skins.spec.ts` moves from
`3 failed | 73 passed` at the reviewed head to `82 passed`; the three
`dsh-market.provenance.json` files are gone from the tree; the six description
images byte-match the branch head's `preview/{light,dark}`; the licence record
in each NOTICE names the work, the rights holder, the official-material scope,
the unofficial and non-commercial position, and carves the artwork out of the
CC grant. `© 1992 Studio Ghibli - NN` is the rightsholder's own form of the
credit (Nibariki), not an unfilled template token, so it is not a defect.

**#16 and #18 were held with changes requested, not merged.**

- #16 (rainy-night): the 46 MiB background video is 48,520,965 bytes, 7.3x the
  next-largest blob and 41.7% of the repository's blob bytes, with no Git LFS in
  place. The author had already offered a ~16 MiB bake at SSIM 0.990, so the
  size is the fixable part of an otherwise sound submission. Its provenance
  statement also has to classify the footage and name the character's origin,
  and the session-header glass regression it fixes for itself is still live in
  the merged `whale-fantasy`, so the one-line retarget is asked for in the same
  pull request rather than deferred. The two local `pnpm test` failures were
  confirmed as environmental (`autoDetect` reading the host's own Wallpaper
  Engine library, and `symlinkSync` needing a Windows privilege), both green on
  CI, and are not charged to this pull request.

- #18 (meridian): the skin itself passes every gate, including the aesthetic
  one. The blocker is `install-meridian.mjs` at the repository root, which
  copies into `~/.dsh/profiles/*/node_modules/...` and rewrites the installed
  package's own `package.json` `files` array. That is not a submission artifact,
  no repository document references it, and a top-level script that mutates an
  installed package is not something to keep in the tree.

**A vertical edge is not automatically a defect.** In #18 the boundary near
x=1171 in both previews was initially read as a torn or duplicated strip. It was
measured instead: the rightmost 269 px correlate with the declared
`[data-pane='details']` portrait at r=0.93 against 88.5 for a control, so the
edge is the intentional left boundary of that pane. The aesthetic verdict was
reached with the pane declared as an established layout fact.

## Alternatives considered

- **Treat the `- NN` credit as an unfilled placeholder and block #1 on it.**
  Rejected. Nibariki's own published notices use the same form, so the block
  would have been wrong. The check is what the rightsholder prints, not what a
  template would have produced.
- **Apply #16's session-header fix directly to `whale-fantasy` in this round.**
  Rejected. This round reviews a contributor's branch; editing a shipped skin
  from the maintenance seat would put a maintainer change on top of a
  contributor's, and the author has the measurement context for it.
- **Accept the 46 MiB asset because the encode is not lossy against its source.**
  Rejected. SSIM against a source that is not in the repository does not pay for
  41.7% of the clone cost, and the author already demonstrated a leaner bake.
- **Take the root installer out of #18 by amending the contributor's branch.**
  Rejected. The deletion is a one-line ask and belongs to the author; a
  maintainer edit would also have to be represented as a review the contributor
  never received.

## Consequences

- `skins/porco-rosso`, `skins/last-exile` and `skins/white-snake` are listed;
  the catalog moves 47 -> 50 with nothing removed, and the dsh-web pin and
  `market/dist` follow in a separate landing commit.
- #16 and #18 stayed open with their blocking items named in the pull request;
  the 2026-09-30 round verified both replies, merged both, and took #16 at
  32,494,969 bytes rather than the bake this note asked for (see the 2026-09-30
  note for that departure).
- The review record for #18 is now also a note about the details pane: the next
  round should read `[data-pane]` geometry before calling an edge a seam.
