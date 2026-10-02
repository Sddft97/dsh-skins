# Contributing

This repository owns the skin center plugin **and the built-in skin assets**.
It is the place to submit a new skin.

A skin is a pure asset directory under `skins/<id>/`: a `skin.json` manifest
(v2) plus the CSS and asset files it references. Nothing in a skin executes; the
skin center loads and renders it.

## Adding a skin

```sh
pnpm install
node scripts/dsh-skin-new.cjs <id>   # scaffold skins/<id>/ from the starter
pnpm skin-center:check               # validate every skin against the v2 contract
pnpm test
```

`pnpm skin-center:check` fails when a skin is missing, invalid, or carries
catalog diagnostics, and it runs every stylesheet through the same safety
pipeline the runtime uses (scoped to `html[data-dsh-skin]`, whitelist filtered),
so a violating skin cannot merge.

## What ships

Only `skins/blue-fantasy` is listed in the npm `files` whitelist: it is the
default skin that ships with the package. Every other skin is content - it is
built into the market (`dsh-market.com`) and installed on demand into
`$DSH_HOME/skins/<id>` by the Workshop. Adding a directory here is what makes a
skin available to that pipeline.

## Submission policy

Two maintainer decisions sit in front of the intake gates. Both are recorded
machine-readably in [.github/submission-policy.json](.github/submission-policy.json),
which is the single source for them; run
`node scripts/submission-policy.mjs --list` to read the current policy.

- **Blocked contributors.** Pull requests from a listed account are closed
  without review by `.github/workflows/submission-policy.yml`. The list is
  maintained by the repository owner; a listed account asks the owner to
  reconsider in an issue, not in a new pull request.
- **Prohibited works and categories.** A submission that depicts a listed work,
  or that belongs to a listed category (currently the DeepSeek male-persona skin
  type), is refused at the copyright gate whatever account it comes from. An
  entry may also declare keywords: a pull request whose title or description
  announces one is closed without review. Each entry records the subject, the
  date it was prohibited and the reason.
- **Evidence that can be checked.** A skin pull request embeds its two
  screenshots (light and dark) in the description and commits the same two files
  under `evidence/`. CI downloads every image the description references and
  requires a byte-identical (`sha256`) file among the `evidence/` files the pull
  request commits; a missing image, a mismatch, or a link that cannot be
  downloaded closes the pull request without review. Only a match hands the
  submission to the gates - a screenshot that does not correspond to the
  submitted source proves nothing about it.

Copyright review is part of intake, not a formality. Every artwork asset a skin
ships must declare its source (the manifest's `license`, `licenseUrl` or
`attribution` field, or a `LICENSE` / `NOTICE` file in the skin directory),
every depicted character must be named together with its work and its rights
holder, and artwork whose provenance is not established is not merged. A
prohibited work is refused even when the rest of the submission is complete.

## Commit and review

Use Conventional Commits (`feat(skins): add <name>`, `fix(skin-center): ...`).
Do not use emoji in code, comments, documentation, or commit messages. Skin
asset READMEs are bilingual (`README.md` + `README.zh.md`).

## Release

The version is per-repository: it advances here and no longer with the dsh-web
monorepo. To cut a release, bump `version` in `package.json`, add the matching
`docs/release-notes/vX.Y.Z.md`, commit both, then push the tag:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag is the release switch. `.github/workflows/release.yml` reruns the CI
gates, refuses to publish when `package.json` disagrees with the tag, publishes
to npm, verifies the version resolves from the registry, and creates the GitHub
Release. It needs the repository secret `NPM_TOKEN` (an npm automation token for
the `@linxin666` scope).

