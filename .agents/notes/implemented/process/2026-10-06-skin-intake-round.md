# Agent Note: The 2026-10-06 skin intake round

Status: implemented

## Problem

This round took the open pull requests in this repository: #53 (shuimo-danqing /
Whale Girl - Ink Wash, held since the 2026-10-05 round on its copyright record),
#55 (midnight-contract v0.1.3, a content submission from a first-time
contributor) and #56 (skin-center HTTP range support for skin assets, a source
change that needs a code review rather than the content gates). Because this
repository publishes its assets to every Workshop user, each content decision has
to rest on the shipped artifacts: the evidence screenshots, the provenance
records inside the skin directory, and the rendered result itself.

## Decision

**All three pull requests were merged: #53 as `a81387c0`, #55 as `60bfc17d` and
#56 as `f18cb8c2`.**

- **#53 (shuimo-danqing)** answered the one hold that had kept it open across two
  rounds. At head `e6627548` the copyright record is complete: `skin.json`'s
  `attribution` names the character (鲸鱼娘 / Whale Girl) as the author's own
  character line, and both READMEs carry a licence-and-provenance section with a
  part / source / rights-holder table, the CC BY-NC-SA 4.0 scope for the
  engineering, the explicit exclusion of the artwork, the
  contributor-responsibility sentence and the unofficial, non-commercial
  statement. The round had also asked for a paper-phase screenshot and got one
  (`evidence/shuimo-danqing-paper-phase.jpg`, 98,566 B); the three evidence files
  share two byte identities with the `preview/` pair (`00a5aa97…`, 132,993 B for
  the ink phase and for the dark/light pair, which are the same render because the
  skin is dark-only). The aesthetic gate passes: the ink-wash palette sits with
  the host chrome, panel and composer text stay readable, the character is neither
  cropped nor distorted, and the paper phase keeps the shell legible. The loop
  point remains a hard cut; the contributor measured it (seam 171.06 against a p95
  frame step of 8.70), documented the cost and the seamless alternative, and this
  round accepted it as deliberate rather than holding the submission again.
- **#55 (midnight-contract)** is a first submission with an unusually complete
  provenance chain: `NOTICE.md`, `SOURCE-DECLARATION.md`,
  `asset-provenance.json`, `generation-prompts.json` and
  `inherited-icon-prompts.json` declare each material's origin, and the notice
  states the contributor's responsibility and a takedown undertaking. The
  landscape is character-free and AI-generated; the Steam Workshop reference is
  disclosed as style-only and is not redistributed, so the third-party-character
  item does not apply. `order` 1052 and the id were free on main (the tree's
  highest order was 1051). The evidence gate passes on three renders (light, dark
  and a 390x844 mobile view) and the aesthetic gate passes: the black-and-gold
  chrome is coherent, both themes stay readable, and nothing is clipped or
  overlapped. The two previews are nearly identical because the theme is an
  ornate dark one and the light variant differs mainly in the background scrim;
  both render completely, which is what the gate asks for.
- **#56 (skin-center video ranges)** is a source change. The range parser, the
  206 / 416 headers and the interaction with the existing `resolveInsideSkin`
  safety check were reviewed line by line, and the committed `lib/index.js` was
  confirmed to match a fresh build (`git diff --exit-code -- lib` empty). The
  pull request's CI had never executed because a fork run waits for a maintainer's
  approval; once approved, the required check ran green, and the round re-ran the
  catalogue gate, the hooks registry, the 51 script tests, `tsc` and the 660-test
  suite locally.

## Alternatives considered

- **Holding #56 for a streaming rewrite.** The range path still reads the whole
  asset with `readFileSync` before slicing, so a 206 allocates the full file even
  though the response is correct. That is exactly what the previous full-read path
  did, the client-visible goal (seeking a video background inside the desktop
  shell) is met, and `fs.createReadStream(abs, { start, end })` is a
  self-contained follow-up. Holding a working fix for a non-regression would have
  left the contributor's stated problem - a local pnpm patch that breaks on update
  - in place.
- **Holding #53 again on the hard cut.** The local guideline is that a loop seam
  be deliberate and documented, not that it be seamless. The contributor supplied
  the measurement and the alternative, so re-opening the item would have moved the
  goalposts.
- **Sending #55 back for a separate light-theme chrome.** Both themes render
  completely and legibly; a dedicated light chrome is a redesign, not a gate item.

## Consequences

- Main now carries 59 catalog skins (57 before the round).
- The Workshop sees #53 and #55 only after the dsh-web submodule gitlink moves to
  this repository's main and `market/dist` is rebuilt; this round pinned it in the
  same maintenance run.
- The range support ships in source. Publishing it to npm is a separate release
  decision and did not happen in this round.
