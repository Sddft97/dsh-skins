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

## Decision

One policy file, one checker, one workflow.

- `.github/submission-policy.json` carries both lists: `blockedContributors`
  (login, date, reason) and `prohibitedWorks` (id, date, reason, description,
  references). It is the single source; the gates, the pull request template and
  the workflow read it instead of keeping copies.
- `scripts/submission-policy.mjs` validates the file and answers one question
  (`--login <login>`). It exits 3 for a blocked account, 0 for an allowed one and
  2 for a malformed policy. Blocked is deliberately not 1: the Node runtime exits
  1 for a missing module or any other crash, and a checker that cannot run must
  never be read as a contributor to refuse.
- `.github/workflows/submission-policy.yml` runs on `pull_request_target` for
  opened / reopened / ready_for_review pull requests, checks out the base commit
  (never the pull request's code) and, when the author is blocked, posts the
  standard notice and closes the pull request without review.
- Copyright review is strengthened on the same authority: a submission declares
  the source of every artwork asset and names any depicted character with its
  work and rights holder. The template and CONTRIBUTING.md state the requirement;
  `prohibitedWorks` records the subjects already refused. The first entry is the
  character created for the removed meridian skin.
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
