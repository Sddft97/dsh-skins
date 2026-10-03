# Agent Note: Refuse blocked contributors and prohibited works

Status: implemented

## Problem

The meridian skin was pulled from the catalog on 2026-10-02 (see
[the takedown note](2026-10-02-skin-takedown-meridian.md)), and the maintainer
asked for two things to survive that removal: the submitting account must not be
able to submit again, and the character the skin shipped must not come back
through another account or another submission.

Neither existed as repository state. The intake gates
([skin contribution gates](2026-09-25-skin-contribution-gates.md)) judge each
submission on its own evidence, declaration and aesthetics; nothing let a
maintainer *prohibit a subject* or *refuse an account*, and neither decision was
recorded anywhere a reviewer or a workflow could read. A takedown that leaves no
rule behind is re-litigated by every later submission that looks similar, and the
artwork can simply return from an account that is not blocked.

The maintainer then widened the ask twice. The refusal is a category, not one
design: any skin built around a DeepSeek male persona is out. And the evidence a
submission offers has to be checkable - the screenshots pasted into the
description must be the same bytes as files the same pull request commits,
because a screenshot that shows a background the diff never contained proves
nothing about the diff.

## Decision

One policy file, one checker, one workflow.

- `.github/submission-policy.json` carries all three rules: `blockedContributors`
  (login, date, reason), `prohibitedWorks` (id, kind, date, reason, description,
  references, optional `matchPatterns`) and `evidence` (directory,
  requiredImages). It is the single source; the gates, the pull request template
  and the workflow read it instead of keeping copies.
- `scripts/submission-policy.mjs` validates the file and answers two questions
  (`--login <login>`, `--text-file <path>`). It exits 3 for a refused submission,
  0 for an allowed one and
  2 for a malformed policy. Blocked is deliberately not 1: the Node runtime exits
  1 for a missing module or any other crash, and a checker that cannot run must
  never be read as a contributor to refuse.
- `.github/workflows/submission-policy.yml` runs on `pull_request_target` for
  opened / reopened / ready_for_review / edited / synchronize pull requests,
  checks out the base commit (never the pull request's code) and, when any rule
  refuses, posts the reason plus the standard notice and closes the pull request
  without review. A closed pull request is not touched again until it is
  reopened, so an edit after the fact cannot re-close it silently.
- Copyright review is strengthened on the same authority: a submission declares
  the source of every artwork asset and names any depicted character with its
  work and rights holder. The template and CONTRIBUTING.md state the requirement;
  `prohibitedWorks` records the subjects already refused. Two entries exist: the
  character created for the removed meridian skin, and the whole DeepSeek
  male-persona category it belongs to. A category entry carries `matchPatterns`,
  regexes over the pull request title and description, so a submission that
  announces the type is closed by the workflow instead of waiting for a reader to
  recognise it.
- Evidence is verified mechanically before a person reads it. A skin pull request
  embeds two screenshots (light and dark) in its description and commits the same
  files under `evidence/`; `scripts/verify-evidence.mjs` downloads every image the
  description references and requires a byte-identical `sha256` twin among the
  `evidence/` files this pull request commits. A missing image, a mismatch, or a
  link that cannot be downloaded closes the pull request without review; a match
  is what hands the submission to the gates. It exits 4 when it refuses, never 1,
  for the same crash-vs-decision reason as the blocked-contributor checker.
  The evidence directory must stay outside a skin directory: everything under
  `skins/<id>/` is zipped and shipped to users.
- The account block (`LOrz-3`) is policy data, not the protection. The
  repository cannot stop a new account from submitting, so the subject list is
  what keeps the artwork out of the catalog.

## Alternatives considered

- **Rely on the account-level GitHub block alone.** Rejected: a block stops one
  account, not the artwork, and the same character can arrive from an unblocked
  one. The block is worth having for the account, but it is not the gate.
- **Make the market build drop specific skin ids.** Rejected: the market reads
  `skins/`, so a suppression list would leave the content in the repository and
  only hide it downstream - the failure mode the takedown note rejected for the
  manifest.
- **Close the pull request from the intake review instead of a workflow.**
  Rejected: the requested outcome is that the submission is never reviewed, and a
  human step on that path is what the policy removes.
- **Extend `skin-center:check` with the policy.** Rejected: the catalog check
  validates the v2 manifest contract; a prohibited-work judgement is editorial,
  and its input is a pull request, not a skin directory. The check stays
  structural.
- **Store the prohibited character as an image for comparison.** Rejected:
  re-committing the artwork in order to police it inverts the reason for the
  takedown. The record is a description plus the git history of the removed skin.
- **Close only on a screenshot that mismatches, and let a description with no
  screenshot through.** Rejected by the maintainer: the requirement is that the
  evidence exists and is checkable, and a text-only evidence section is exactly
  the thing that cannot be checked. The cost is that submissions which argued
  from prose alone are now refused, and the template says so.
- **Compare the screenshot against the rendered skin instead of against a
  committed file.** Rejected as the first rule: rendering needs a host, and the
  maintainer asked for the chain-of-custody check (the pasted image is the
  committed image). The rendering question stays with the human gates.

## Consequences

- A blocked account's pull request is closed with a standard notice and no
  review; a prohibited subject is refused at intake however it arrives.
- The policy is data, so a maintainer lifts an entry by editing one file, and the
  next reviewer sees the decision and its date without archaeology.
- `scripts/submission-policy.test.mjs` runs in the existing "Script tests" CI
  step and pins the repository's own entries (LOrz-3 blocked, the meridian
  character prohibited) plus the checker's exit codes, so removing an entry to
  make CI pass is visible rather than silent.
- A rule that lives only in `.github/` is invisible to a contributor reading
  CONTRIBUTING.md, so the policy is stated in both, and the checklist asks for
  the declaration the copyright gate reads.
- A skin pull request with no screenshots in its description is now closed
  without review. The two submissions merged in the 2026-10-02 round that argued
  from text alone (crt-phosphor, black-gold-vip) would be refused under this
  rule; the template and CONTRIBUTING.md state the requirement, so the next
  submission can comply. Verified against the merged skin pull requests on
  2026-10-02: #5 and #7 pass (10 and 6 images byte-identical), #14 is refused
(its screenshots live on a fork branch and no file is committed under
  `evidence/`), #30 and #31 are refused for missing evidence.
