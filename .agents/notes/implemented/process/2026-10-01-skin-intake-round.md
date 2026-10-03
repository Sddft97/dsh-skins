# Agent Note: The 2026-10-01 skin intake round

Status: implemented

## Problem

The 2026-10-01 maintenance round reviewed the three open skin submissions:
#24 (endfield-baker), #29 (lucy-nightsignal), and #30 (crt-phosphor). The
contribution gate has three legs - user-visible evidence, third-party source
declaration, and aesthetics - and CI proves none of the three, so each needs a
human verdict recorded where the next round can find it.

## Decision

**No skin was merged. Two carry a single named blocker each; one keeps waiting
on its author.**

**#29 (lucy-nightsignal) and #30 (crt-phosphor): held - the source declaration
does not meet the gate.** Both previews (all four files) were inspected at full
resolution: #29's blue-hour and neon scenes keep the UI readable in both
themes with the portraits free of clipping; #30's phosphor monochrome holds
contrast across both themes, the dot-matrix face stays legible, and the baked
scanlines do not moire. Aesthetics pass on both. What blocks them is gate 2:
the READMEs state only "CC BY-NC-SA 4.0 (unofficial fan artwork)" without the
character and its work (Lucy, Cyberpunk: Edgerunners), the rights holders
(TRIGGER / CD PROJEKT RED), or the required non-commercial /
non-affiliation / rights-reserved statement, and #29 ships no LICENSE or
NOTICE file in the skin directory. #30 additionally reuses #29's portraits
(lucy-signal-left/right.webp) and must declare that same-source relationship.
The font paperwork in #30 (FUSION-PIXEL-OFL.txt plus assets/licenses/) is the
model for what the artwork declaration should look like. Both were left
CHANGES_REQUESTED with the missing items named.

**#24 (endfield-baker): unchanged, still waiting on the author.** The
2026-09-30 review (source declaration gaps) stands; the branch has had no new
commits since. The first-time-contributor CI approval it asked for was already
granted and the checks are green, so the only mover is the author.

Both first-time-contributor CI runs on #29/#30 were approved this round so the
gates actually execute on their heads.

## Alternatives considered

- Accepting the README's "unofficial fan artwork" line as sufficient: rejected -
  the gate names the rights holder and the work as required content, and
  "unofficial" alone does not say who owns the character or that usage is
  non-commercial.
- Merging #29 and holding only #30 (or the reverse): rejected - the reused
  portraits make the declarations one unit; splitting them would let one skin
  ship artwork whose provenance record lives in a stalled PR.

## Consequences

Three submissions stay open with named blockers, and the aesthetics verdicts
are on record so the next round only re-checks the declarations. The round
also fixed an operational gap worth remembering: submissions from
first-time contributors sit in action_required with no checks reported at all,
which looks like a dead PR from the checks API - approving the workflow runs
is part of intake.
