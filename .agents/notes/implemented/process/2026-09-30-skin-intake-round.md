# Agent Note: The 2026-09-30 skin intake round

Status: implemented

## Problem

The 2026-09-30 round reviewed the seven open pull requests in this repository at
once: five fixes (#23, #25 and #27) and two resubmissions the 2026-09-29 round
had held with changes requested (#16 rainy-night, #18 meridian), plus two new
skins (#24 endfield-baker, #26 national-day). Every head had green CI, and CI
cannot see the intake gates this repository asks: whether the artwork is
licensed and attributed, whether the user-visible evidence is real, and whether
the result is acceptable to look at. Two of the seven also needed a maintainer
action CI cannot self-serve: a first-time contributor's workflow run stays in
**Action required** until someone with write access approves it.

## Decision

**#18 and #16 were merged, clearing both holds from the 2026-09-29 round.**

- #18 (meridian) deleted `install-meridian.mjs` in `a9991d65`; the file is
  absent from the head tree and the diff is the skin directory plus the
  skin-center hooks registration. The previously verified parts (v2 contract,
  previews being the branch head's own renders, hooks touching no host API) were
  not re-reviewed. Merged as `0f86e0d`.
- #16 (rainy-night) answered all four items: the provenance statement now
  classifies the footage as AI-generated with the character "鲸鱼娘" as the
  author's own line and carves the artwork out of the CC grant; the bitrate is
  the whole-file arithmetic (32,494,969 B x 8 / 35.458 s = 7.33 Mbps); the
  `display: contents` session-header regression in `whale-fantasy` landed in the
  same pull request (`61927c8`, the glass moves onto the element that owns the
  band's box); the shipped blob went 48,520,965 -> 32,494,969 bytes. Merged as
  `b571783`.

**#23, #25 and #27 were merged.** All three are skin-side desktop/UI fixes whose
evidence is a real before/after capture pair, and all three were verified
against the delivered files rather than the description: #23 adds one rule that
clears the shell's opaque in-flow frame fill so the `pixel-anime` scene painted
on `body::after` (negative z-index) shows again on the desktop client; #25
applies the same rule to the eight skins that still lacked it and keeps the
titlebar drag strip; #27 collects four measured passes on `miku` (menu line
count, the brand row's dead `display: contents` rule, the new-session hover
overlap, and the settings panel's border count). Merged as `95ae44d`,
`4db2a3c9` and `b2de859`.

**#24 and #26 were held with changes requested.** Both are otherwise sound
submissions that pass the aesthetic gate, and both fail the attribution gate on
the same class of gap — the record does not classify where the artwork comes
from, and neither states that the contributor carries the copyright and
compliance responsibility:

- #24 (endfield-baker) declares the skin engineering as the contributor's own,
  the base theme as adapted from `blue-fantasy`, and the Endfield names as
  Hypergryph's with a non-commercial fan-work position, but it does not say
  whether the assets are original, AI-generated or adapted from official
  material, and it does not carry the unofficial / unrelated-to-this-repository
  / personal-non-commercial wording the gate asks for.
- #26 (national-day) contradicts itself on provenance: `skin.json` says the two
  backdrop paintings were supplied by the author while the pull request
  description calls them "用户给的一对画", and neither classifies them. The
  aesthetic verdict is a pass: two independent palettes, the figure uncropped,
  readable panel contrast, no banding, watermark or seam.

**Green CI is not self-serving.** #18's and #24's workflow runs were sitting in
**Action required** because both authors are first-time contributors; the round
approved them, both runs then went green, and #24's earlier run of the same head
had failed with **zero jobs** (a run that never started, not a test failure).

## Alternatives considered

- **Insist on #16's 16 MiB bake.** Rejected. The 2026-09-29 round asked for the
  leaner bake the author had already offered; the author first delivered it
  (16,549,139 bytes) and then re-baked the 32.49 MB cut from a newer master
  (SSIM 0.9917) and asked for a squash merge. The difference in fidelity
  between the two bakes is 0.0017 SSIM while the cost difference is 2x, so the
  request was not worth another round trip once the squash was on the table -
  but the acceptance is recorded here with its number rather than left implicit,
  because it is a departure from what the previous round asked for.
- **Merge #24 and #26 and ask for the attribution wording afterwards.**
  Rejected. The gate makes the declaration a precondition of the merge, and in
  #26 it is a factual contradiction about who made the artwork, not a formality.
- **Read #24's byte-identical `preview/{light,dark}` as missing evidence.**
  Rejected. The skin declares one shared terminal palette and renders the same
  frame in both themes; the 2026-09-29 round took the same posture for
  `whale-fantasy`'s dark-only previews. The screenshot is a real capture of the
  skin applied, which is what the gate asks for.
- **Treat the nine-skin frame fix as host work and push it back to dsh-web.**
  Rejected. macOS already carries the equivalent `[data-platform=darwin]` rule in
  the shell and the shipped skins carry this same rule; the Windows gap is a
  skin-side adaptation like the rest of the frame handling, not a host change.

## Consequences

- The catalog gains meridian and rainy-night and the desktop frame rule reaches
  nine skins; the dsh-web pin and `market/dist` move in one landing commit on
  `origin/dev`, so the store content follows this merge, not the other way
  round.
- #24 and #26 stay open with the blocking items named in the pull request, so
  each contributor has one place to act on.
- Every push to `main` here is a squash merge; the history stays linear and the
  previous bakes of #16's video stop being reachable.
- A first-time contributor's CI needs an explicit approval before it can be
  read as a gate result; expect to approve, then wait for the run, rather than
  reading the empty check list as a failure.
