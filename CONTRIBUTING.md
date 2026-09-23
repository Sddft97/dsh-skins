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

