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

**#29 and #37 were merged. #42 was held with changes requested. #46 was held
with changes requested on a regression the round reproduced. #47 and #48 were
reviewed as fixes and left for the collaborator who owns that domain.**

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
- #42 (model-dorm) passes the evidence and aesthetic gates - the two
  `evidence/` files are byte-identical to the skin's `preview/` pair, and both
  renders read cleanly - but the licensing record names no licence: `skin.json`
  carries an `attribution` with no `license`/`licenseUrl`, and the directory
  ships no `LICENSE`/`NOTICE`. Held until that record exists, with a note that
  `nameEn` duplicates the Chinese `name`.
- #46 (skin-center boot activation) fixes the reported root cause, but the round
  reproduced a regression it introduces: `switching` is not released until
  `await persist(id)` returns, so a hanging `POST /active` leaves a wallpaper
  verdict flip queued and the skin stamp and `stoodDown: false` in place while
  the wallpaper is already rendering. Confirmed by a direct controller test on
  the head (base has no gate and stands down immediately). Held with a
  request for changes that separates the visual commit from the persist wait.
- #47 and #48 are collaborator bug fixes in the Wallpaper Engine / skin-center
  domain (the Windows caption-menu host being matched by a classless
  `body > div` fallback; the blue-fantasy scrim-tracking sidebar fill painting
  the Windows whole-window frame opaque). Both pass their local gates - #47
  599 tests, #48 605 - and their own reproductions are mutation-checked. They
  are approved on the record; the domain owner merges them, and the dsh-web
  gitlink bumps ride that owner's own landing PRs (#1808, #1809, #1810).

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
- **Moving the dsh-web gitlinks from this round.** Rejected. #29 and #37 are
  content additions whose market landing the maintainer performs when
  publishing; #47/#48/#46 already have the domain owner's own landing PRs in
  dsh-web.

## Consequences

- Two skins enter the catalogue: lucy-nightsignal and the crt-phosphor
  provenance correction. Both carry a contributor-responsibility statement, a
  named rights holder and their own licence file.
- #42 stays open on one item; the next round re-checks only the licence record.
- #46 stays open on one regression; the contributor has the reproduction and
  the suggested split between the visual activation and the persist wait.
- The round records a reusable check: a controller gate added for one race can
  starve an unrelated path if it is held open across an unbounded await, and
  the way to see it is to drive the controller directly with a persist that
  never settles.
