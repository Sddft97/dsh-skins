# Agent Note: Skin contribution gates at intake

Status: implemented

## Problem

This repository receives skin submissions from outside contributors, and the
2026-09-25 maintenance round reviewed sixteen such pull requests at once. The CI
gate (`pnpm skin-center:check` plus `pnpm test`) validates the v2 manifest
contract and runs every stylesheet through the safety pipeline, but it says
nothing about whether the artwork is licensed, whether the "user-visible change
evidence" section was actually filled with evidence, or whether the result looks
acceptable. Those three questions decide whether a skin may be listed, and none
of them is mechanically checkable.

Reviewing that batch without a written rule produced three recurring failure
modes: evidence hosted on a branch that predates the change, a checklist box
ticked whose claim the repository contradicts, and skins carrying third-party
character art with no licensing record anywhere in the tree.

## Decision

Intake decisions for skin pull requests apply three gates, all three required
before merge, and two refusal rules that run in front of them. The gate
definitions and their rationale live in the maintenance workflow; what this note
fixes is how this repository records the outcome.

- **Two refusal rules run before the gates.** A prohibited work is refused on
  copyright grounds whatever the rest of the submission looks like, and a pull
  request from a blocked account is closed without review. Both lists are data
  in [.github/submission-policy.json](../../../../.github/submission-policy.json),
  enforced by `.github/workflows/submission-policy.yml`; the decision is
  recorded in [the submission policy note](2026-10-02-submission-policy-blocklist-and-prohibited-works.md).
- **Evidence must be reproducible against the pull request's own code.** A
  screenshot or video counts only when the branch serving it carries the pull
  request's bytes, and when the change it claims to prove is visible in the
  frame. The branch name is not the test: evidence committed in the pull
  request's own diff qualifies, and so does a screenshot on a follow-up branch
  whose tip contains the head commit — checked by comparing the pulled skin
  directory's tree hash with the head's and by fetching the images and matching
  their bytes against the URLs in the description. A byte-comparison of the
  evidence branch's asset files against the base is the check that catches the
  common case: evidence branches whose CSS is byte-identical to the base prove
  nothing, because they depict the code before the change. Screenshots of an
  empty-session hero page cannot demonstrate a right-column, session-header,
  code-block, or narrow-viewport fix.
- **A skin directory carries no install-time artifacts.**
  `dsh-market.provenance.json` is written by the Workshop installer into
  `$DSH_HOME/skins/<id>/`; a copy committed here is a stale record of one
  machine's install — it pins an `installedAt` and the hashes of the bytes as
  they were that day — and the market build's directory walk publishes it to
  every user. It is removed at intake rather than refreshed: a refreshed copy
  would be a trust record minted outside the installer, and the skin center
  reads that file to decide whether a user-directory skin may run its hooks.
- **Licensing is recorded in the repository, not in the pull request text.** The
  skin manifest's optional `license`, `licenseUrl`, and `attribution` fields,
  or a `LICENSE`/`NOTICE` file in the skin directory, must carry the source,
  the rights holder, and the license name. Skins bundling third-party character
  artwork require an explicit statement that the artwork is excluded from the
  project's own grant, that it is unofficial and non-commercial, and that rights
  remain with the original holder. A ticked checklist box is not evidence; the
  tree is.
- **Aesthetics are judged on the rendered asset, not the description.** The
  verdict is reached by viewing the actual `preview/{light,dark}` renders, and
  is recorded with file- and region-level reasons.

A closed-but-wrong means no listing: the pull request stays open with the missing
item named and the evidence quoted, rather than merged with a follow-up promise.

## Alternatives considered

- **Trust the submission checklist.** Rejected. Across the reviewed batch the
  checklist was ticked for README and licensing on skins where neither existed:
  `skins/miku/` has no README at all and no licensing field, and `skins/observatory/`
  shipped a manifest and two README files describing an hour-scale feature the same
  pull request had just deleted.
- **Let CI cover licensing by extending the catalog check.** Rejected as the
  primary mechanism. The catalog check is a manifest-contract validator; encoding
  a licensing policy into it would make an asset directory unbuildable for a
  judgment that is editorial and needs a human or model reader. The check stays
  structural; the licensing review stays an intake gate.
- **Require a LICENSE file in every skin directory.** Rejected as over-broad.
  Only 15 of the 42 catalog skins carry one, and the manifest's licensing fields
  are the declared home for this fact. Requiring both would invent a second,
  partially redundant convention.
- **Treat any evidence branch other than the pull request's own as absent.**
  Rejected in the second 2026-09-26 round. The rule exists because provenance
  cannot be inferred after the fact, and in that round it could be: a screenshot
  branch whose tip is the pull request's own head commit, with the skin tree hash
  and the image bytes both matching, carries the same guarantee as evidence
  inside the diff. Holding such a pull request costs a contributor a re-shoot
  while adding no assurance. A branch whose skin bytes differ from the head, or
  which cannot be fetched at all, is still refused.
- **Treat a high-resolution screenshot as sufficient evidence.** Rejected. Size
  and reachability do not establish provenance; the evidence branch used by three
  pull requests served valid 1440x900 JPEGs whose underlying stylesheet was
  byte-identical to the base.

## Consequences

- Pull requests that pass CI can still be blocked at intake. Contributors learn
  the specific missing item instead of a generic rejection, and the blocking
  reason is public on the pull request.
- Evidence hosted outside the pull request's own branch is treated as absent,
  which costs contributors a re-shoot even when the underlying fix is correct.
  That is the intended trade: provenance is not inferable after the fact.
- The three gates are documented here rather than in the pull request template,
  because the template can only state a requirement; this note records why a
  ticked box is not accepted as proof of one.
- Verification: at the 2026-09-25 round the gates were decisive — five skins were
  merged (three new, two adaptations) and six were held with file-level reasons,
  including one genuine functional regression caught by reading the stylesheet
  rather than the description (`min-height: 100dvh` on `[data-dsh-frame]`
  overriding the skin's own `height: calc(100vh - 56px) !important`).
- Verification: at the 2026-09-26 round the three gates were again decisive —
  three skins were merged (two new, one adaptation), and three were held: two on
  the frame-height convention now recorded in
  [the frame height note](2026-09-26-frame-height-belongs-to-the-host.md), and
  one on a stale generated registry plus two documentation defects that the
  licensing and evidence gates do not cover.
- Verification: the second 2026-09-26 round merged four skins — verdandi
  (`#3`, new), black-gold (`#5`) and cafe-roastery (`#7`) after the
  frame-height block came out, and whale-fantasy (`#14`, the first video
  background, its evidence accepted on the tree-hash check) — and held one:
  `#1` (Porco Rosso / Last Exile / White Snake) failed `builtin-skins.spec.ts`
  on its own head, because the three hooks left the `*-bg-a`, `*-bg-b` and
  `*-scrim-overlay` nodes they created in the background layer behind after
  teardown; it also shipped a stale `dsh-market.provenance.json` per skin and
  carried no user-visible evidence in its description. The hold cites the failing
  test, the three mismatched hook hashes, and the missing evidence section.
