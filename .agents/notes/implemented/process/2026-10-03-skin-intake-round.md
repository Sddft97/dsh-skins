# Agent Note: The 2026-10-03 skin intake round

Status: implemented

## Problem

The 2026-10-03 round took over the three open skin submissions: #24
(endfield-baker), #29 (lucy-nightsignal) and #35 (midnight-contract with its
city companion, a resubmission of the closed #33). Each carried a hold from an
earlier round and each needed re-checking against the one item that round named.
#29 was the harder case: its hold was a catalog failure, so the round had to
reproduce the CSS parse instead of reading the contributor's account of the fix.

## Decision

**No skin merged. #29's structural blocker is cleared but its declaration is
still incomplete; #35 and #24 still lack the contributor-responsibility
statement.**

**#29 (lucy-nightsignal): the catalog regression is fixed; the declaration is
still short one item.** Head `3ee95a07` parses clean through the repository's
own bundled lightningcss (1.33.0), where `a3930214` fails with
"Unexpected end of input" at line 182 and `c460d9ab` parses; running
`scripts/skin-center-catalog-check.cjs --check` on a clone of that head exits 0
("check OK, 54 repo catalog skins"). The 19 `padding-left` / 20 `margin-left`
duplicates left by `0326a9d4` are down to the two intentional declarations, each
inside its own rule body, and the `@media (width <= 900px)` block closes
correctly at 155-160. The declaration now names why this is still open: the
2026-09-30 gate required the contributor to carry the copyright and compliance
responsibility and to warrant the right to distribute, and neither the two
READMEs nor `assets/NOTICE.md` contains it. Two smaller corrections are recorded
with it: `skin.json`'s attribution names a different scene model than the
READMEs and NOTICE, and the skin states CC BY-NC-SA 4.0 while pointing at a
repository `LICENSE` that is BSD 3-Clause and shipping no `LICENSE` of its own.
Aesthetics pass unchanged on both previews (blue-hour rooftop and neon skyline,
portraits uncropped, UI readable in both themes).

**#35 (midnight-contract + midnight-contract-city): evidence passes,
declaration short one item.** The four description screenshots, the four
`evidence/` files and the two packages' `preview/` images are byte-identical
(sha256 3763db90... for the castle light, and matching triples for the other
three), each package's 29 manifest/CSS references resolve to files that exist
with no remote URL and no executable hook, the bilingual READMEs are present and
CI is green on both checks. Aesthetics pass: the gold-and-black dragon-leather
sidebar, sapphire composer and castle/night-city backgrounds read clearly in both
themes with the character uncropped. What blocks it is the same gate-2 item as
#29 — the contributor must state that they carry the artwork's copyright and
compliance responsibility and warrant the right to distribute it. The present
`asset-provenance.json` `authorization` field says the contributor permits
distribution; that grants no warranty and does not carry the responsibility.

**#24 (endfield-baker): unchanged.** Branch unchanged since `11d26ae1`; the
2026-09-30 items (provenance classification and the contributor-responsibility
statement in `skin.json`) have not been answered. Its two `preview/` files are
byte-identical by design and that was already accepted as an aesthetic fact, not
a gate failure. The blocker today is the same declaration item.

## Alternatives considered

- **Merging #29 because the catalog gate is green and CI is green.** Rejected.
  Green CI proves the stylesheet parses; gate 2 is a separate requirement the
  contributor was asked for a round earlier, and it is still absent.
- **Letting #35's `authorization` field stand as the responsibility
  statement.** Rejected. "The contributor permits distribution for personal
  non-commercial use" describes the licence scope; the gate requires the
  contributor to warrant the right and accept the responsibility, and the
  2026-09-30 round held #24 and #26 for exactly that distinction.
- **Reading #35's byte-identical `preview/{light,dark}` pairs as missing
  evidence.** Rejected. #24 already established the posture for a skin that
  renders one shared palette in both themes; #35's castle and city each commit a
  distinct pair, and all four match their `evidence/` files.
- **Re-doing the aesthetics verdict as a fresh judgment.** Rejected. Both
  submissions pass, the images were inspected at full resolution this round, and
  re-litigating a passing verdict would only cost the contributor time.

## Consequences

- Three submissions stay open with one named item each, so the next round only
  re-checks the responsibility wording.
- The declaration gate now has a third worked example on record; the wording
  required is the contributor carrying copyright and compliance responsibility
  and warranting the right to distribute, distinct from a licence-scope sentence.
- The round records an operational check worth repeating: a held catalog failure
  is reproduced locally with the repository's own parser and gate command rather
  than accepted from the contributor's fix description.
