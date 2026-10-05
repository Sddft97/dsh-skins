# Agent Note: The 2026-10-05 skin intake round

Status: implemented

## Problem

The 2026-10-05 round took the open skin submissions in this repository: #29
(lucy-nightsignal, held since the 2026-09-30 round on a missing declaration
item), #37 (the crt-phosphor provenance follow-up to the merged #30), #42
(model-dorm, a new submission from a first-time contributor) and #46 (the
skin-center boot-activation fix for zhu1090093659/dsh-web#1805). #29's hold was
specific: the contributor-responsibility statement, the model attribution and
the skin's own licence. #46 was a source change, so it needed a code review
rather than the content gates. Two more source fixes, #47 (the app-body lift
anchored on `#root`) and #48 (the blue-fantasy Windows whole-window frame),
arrived during the round and were reviewed with the rest.

## Decision

**All four submissions were merged across the round: #29 and #37 on the first
pass, #42 and #46 after the requested changes came back.**

- #29 (lucy-nightsignal) answered all three items from the 2026-10-03 round:
  the contributor-responsibility statement is now in `README.md`,
  `README.zh.md` and `assets/NOTICE.md`; the attribution model is unified on
  `volcengine/doubao-seedream-5.0-pro` with the two superseded
  `openai/gpt-image-2.5-sunburst` runs marked and unshipped; the skin ships
  its own `LICENSE` (CC BY-NC-SA 4.0) matching `skin.json`'s `license` /
  `licenseUrl`, with the repository's BSD-3-Clause root licence explicitly
  excluded. Verified on head `e46bed1`: `evidence/` matches the `preview/`
  bytes, `dsh-skin validate` and `skin-center:check` pass, and both themes
  pass the aesthetic gate. Merged as `3b6ea3c5`.
- #37 (crt-phosphor provenance) brings the already-merged #30 up to the same
  standard without touching style or assets: the skin's own `LICENSE`, the
  contributor-responsibility statement, and an attribution naming the shipped
  models. Merged as `586bd202`.
- #42 (model-dorm) passed the evidence and aesthetic gates on its first head -
  the two `evidence/` files are byte-identical to the skin's `preview/` pair,
  and both renders read cleanly - but the licensing record named no licence:
  `skin.json` carried an `attribution` with no `license`/`licenseUrl`, and
  the directory shipped no `LICENSE`/`NOTICE`. It was held for that, and for
  an `nameEn` that duplicated the Chinese `name`. Head `968db3f2` answers
  both: `license: "MIT"` plus `licenseUrl` in the manifest, a committed
  `LICENSE` (`Copyright (c) 2026 Daizhdd`), a License section in both
  READMEs, and `nameEn: "Home Model Girls"`. Re-verified on that head:
  `dsh-skin validate` PASS, `skin-center:check` exit 0 at 56 catalogue
  skins, the full suite 800 tests green, `tsc --noEmit` clean. Merged as
  `8cbb6276`.
- #46 (skin-center boot activation) fixed the reported root cause, but the
  round reproduced a regression it introduced: `switching` was not released
  until `await persist(id)` returned, so a hanging `POST /active` left a
  wallpaper verdict flip queued and the skin stamp and `stoodDown: false` in
  place while the wallpaper was already rendering. Confirmed by a direct
  controller test on head `f5e2bbd7` (base has no gate and stands down
  immediately). Head `4340e9b4` answers it: a new `settleSwitch(seq)` runs at
  the atomic cut - after the `data-dsh-skin` flip and the previous activation's
  dispose, before the write - with the switch's `finally` keeping an idempotent
  call as the bail-before-the-cut safety net; `readPersistedSelection` now
  checks `isSwitching()` on both sides of the `GET /active`. Re-verified: the
  round's own hanging-persist reproduction now reads `stoodDown === true` with
  the stamp removed while the POST is still pending (it read `false` on the
  previous head), the added spec passes, 610 tests green, and a rebuild leaves
  `lib` byte-identical to the sources. Merged by the domain owner as
  `6386564`.
- #47 and #48 are collaborator bug fixes in the Wallpaper Engine / skin-center
  domain (the Windows caption-menu host being matched by a classless
  `body > div` fallback; the blue-fantasy scrim-tracking sidebar fill painting
  the Windows whole-window frame opaque). Both pass their local gates - #47
  599 tests, #48 605 - and their own reproductions are mutation-checked. They
  are approved on the record; the domain owner merged them as `118d5aa1` and
  `eb2acbef`, and the dsh-web gitlink bumps rode that owner's own landing PRs
  (#1808, #1809, #1810).

## Alternatives considered

- **Merging #42 on its attribution field alone.** Rejected. The 2026-09-25 gate
  note requires the source, the rights holder and the licence name to be
  recorded in the tree; an `attribution` string carries the first two, not the
  licence, and four of the recent catalogue merges (xinghai-heart, rainy-night,
  whale-fantasy, crt-phosphor) all ship a `LICENSE`.
- **Merging #46 because CI is green and the root-cause analysis is correct.**
  Rejected. Green CI proves the new spec passes; it does not prove the new
  persist gate is safe. The reproduced failure is a behavior change against the
  base, so it is exactly the kind of regression the gate exists to catch.
- **Treating #47 and #48 as ordinary content submissions.** Rejected. Both are
  source/stylesheet fixes with no skin checklist to apply; they were reviewed
  against the code and their own specs, and their merge decision stays with the
  collaborator who owns that domain.
- **Moving the dsh-web gitlinks for #29/#37 from this round.** Rejected at the
  time. #29 and #37 are content additions whose market landing the maintainer
  performs when publishing; #47/#48/#46 already had the domain owner's own
  landing PRs in dsh-web. #42's landing went out with the round that merged it,
  because a new skin is content the market must publish.

## Consequences

- Three skins enter the catalogue from this round: lucy-nightsignal, the
  crt-phosphor provenance correction and model-dorm. Each carries a named
  rights holder and its own licence file.
- The round records a reusable check: a controller gate added for one race can
  starve an unrelated path if it is held open across an unbounded await, and
  the way to see it is to drive the controller directly with a persist that
  never settles. The fix is to release the gate at the point the state actually
  changes, not after the last unrelated round-trip.
- The round also records that a first-time contributor's workflow run stays in
  action_required until someone with write access approves it; every first-time
  merge this round needed that approval before the required check could go
  green.
