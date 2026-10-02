# Agent Note: The 2026-10-02 skin intake round

Status: implemented

## Problem

The 2026-10-02 round reviewed the six open skin submissions at once: the three
held by earlier rounds (#24 endfield-baker, #29 lucy-nightsignal, #30
crt-phosphor) and three new ones (#31 black-gold-vip, #32 xinghai-heart, #33
midnight-contract with its city companion). The three intake gates - evidence,
declaration, aesthetics - are unchanged, but two of the six turned on things
the earlier rounds had not needed to decide: a submission that fails the
repository's own catalog gate, and a pair whose provenance classification is
honestly reported as unknown by the contributor.

## Decision

**#30 (crt-phosphor) and #31 (black-gold-vip) are merged. #24, #29, #32 and
#33 stay open with a named blocker each.**

**#30 (crt-phosphor): merged as `719feaf9`.** The declaration gap from the
2026-10-01 round is closed: both READMEs and `assets/NOTICE.md` now name the
character and its work (Lucy / *Cyberpunk: Edgerunners*), the rights holders
(Studio TRIGGER and CD PROJEKT RED), the non-commercial / unofficial /
not-affiliated / rights-reserved terms, and the same-source relationship with
`lucy-nightsignal`'s matted portraits. The font paperwork was already complete.
CI was green on the head `633e8a2`.

**#31 (black-gold-vip): merged as `c1d94e2e`.** Scope is brand marks only, no
`--dsw-*` token is declared, and both themes are covered by construction, so it
composes with rather than replaces the shell palette. The brand vector path data
is MIT with the trademark credited to DeepSeek. Aesthetics pass on both previews
(png): the membership-card treatment and the metal wordmark are coherent, the
light card's gold stays legible on ivory, and the dark card's champagne gold
reads on near-black.

**#29 (lucy-nightsignal): held - the head fails the repository's own catalog
gate.** The provenance answer that the 2026-10-01 round asked for landed in
`a3930214` and is complete. What regressed is the stylesheet: commit
`0326a9d4` ("retune the pane inset") inserted a block of
`padding-left` / `margin-left` declarations into `patches.css` by the wrong
indentation, and two of those lines landed inside the `@media (width <= 900px)`
block after a nested rule's closing brace. Those stray declarations close the
`@media` block early, the rest of the file mis-parses, and lightningcss raises
`Unexpected end of input` at line 182. `pnpm skin-center:check` fails on the
head; the same check passes on `c460d9ab` (the pre-regression commit), so the
regression is `0326a9d4`. The 19 duplicated inset lines also put an inset
property on rules that should not carry one. The failure had been invisible
because this is a first-time contributor's pull request and its CI run sat in
**Action required**; approving the run reproduced the failure
(run 36867382872). Named next step: delete the stray declarations and get the
catalog gate green.

**#32 (xinghai-heart): held - the provenance classification is missing.** The
aesthetics pass (the footage is pointillist and the dotted decoration language
matches it; the empty session now draws nothing), the engineering is the
contributor's original work, and the skin clears the size ceiling at 14.26 MB.
The contributor explicitly flagged that the footage's own classification -
original render, AI-generated, or adapted - is not asserted in `skin.json` or
the READMEs and could not be verified from the files. The declaration gate asks
for the source of the artwork, so a self-declared unknown is a hold, not a
pass. Named next step: confirm the classification with the author and record it
in `skin.json`'s `attribution` and both READMEs.

**#24 (endfield-baker): unchanged, still waiting on the author.** The
2026-09-30 review's two items stand and the branch has had no new commit since
`11d26ae1`. Its CI is green (the earlier `action_required` run was approved in
this round).

**#33 (midnight-contract + midnight-contract-city): held - the third-party
character artwork has no license record.** Both directories are independently
installable, pass `dsh-skin validate` and `pnpm skin-center:check` (55 skins)
on head `1da6b08`, declare no remote asset and no executable hook, and carry
thirty-plus real host captures covering both themes, desktop and mobile. The
aesthetics pass (the character is uncropped, panel contrast holds in both
themes, light and dark are both complete). What is missing is gate 2: the
supplied left-hand background is a character illustration from the *Dragon
Raja* franchise, so the record must name the character and its work, the rights
holders, and the personal-non-commercial / unofficial / unrelated-to-this-
repository / rights-reserved terms. `NOTICE.md` carries only "No ownership of
the Dragon Raja franchise or its characters is claimed, and no official
endorsement is implied", and grepping the two skin directories for
`non-commercial`, `unofficial`, `not affiliated`, `非商业` or `无关联` finds
nothing. `asset-provenance.json` also records the background only as
"Contributor-provided image" without classifying it as original, AI-generated
or adapted. Named next step: add the required terms to both READMEs and
`NOTICE.md`, and classify the background in `asset-provenance.json`.

## Alternatives considered

- **Merging #29 on the strength of the now-complete declaration and treating the
  catalog failure as pre-existing.** Rejected. The gate is the repository's own
  `skin-center:check`, and it fails on the head that would be merged; the
  failure is a regression introduced by a commit in this pull request, not an
  inherited one.
- **Treating #32's honest "classification not asserted" as an acceptable open
  item.** Rejected. The declaration gate exists because provenance cannot be
  reconstructed after the fact; accepting a blank would set the precedent that
  the field is optional.
- **Re-classifying #33's two skins into one entry because they share a
  component language.** Rejected. They are independently installable
  directories with their own manifests and previews, and the repository catalog
  is per directory.
- **Accepting #33's "no official endorsement is implied" line as satisfying
  gate 2 for the character background.** Rejected. The gate asks for the
  personal-non-commercial scope, the non-affiliation with this repository, and
  the rights-holder reservation, none of which that sentence states; #30's
  declaration is the model for what the paragraph should look like, and the
  earlier rounds held submissions for exactly this gap.

## Consequences

- Two skins are published to the market and three stay open with one named item
  each, so the next round only re-checks that item.
- The round records an operational failure mode worth keeping: a first-time
  contributor's CI can be green-on-the-checks-API only after a maintainer
  approves the run, and until then a red catalog gate is invisible. Every head
  this round intended to merge had its pending run approved before the merge
  decision.
- The declaration gate now has a concrete worked example for #29's regression
  fix; the aesthetics verdicts for #30/#31 are on record so they are not
  re-litigated.
