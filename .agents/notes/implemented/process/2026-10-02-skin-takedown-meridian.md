# Agent Note: Pull the meridian skin from the workshop catalog

Status: implemented

## Problem

`meridian` (DeepSeek-Meridian, PR #18) was merged into the catalog on
2026-09-30 and has been served by the Workshop (dsh-market.com) since. The
maintainer asked for the skin to be pulled from the Workshop. No content-level
defect is recorded here: this is a takedown, and the note records the mechanics
so the next removal does not have to rediscover them.

## Decision

Delete `skins/meridian/` and republish.

- `skins/meridian/` is deleted outright. The catalog is derived from the skin
  directories, so the directory is the only switch: `scripts/market-build`
  (dsh-web) reads the pinned `skins/` content for the manifest, install zips,
  try-on assets and sitemap, and `scripts/skin-center-catalog-check.cjs`
  validates the same directories. There is no per-skin suppression list, so a
  skin that keeps its directory keeps everything it ships.
- `src/reviewed-hooks.generated.ts` and `lib/` are regenerated
  (`node scripts/skin-hooks-registry.mjs`, `pnpm build`), because meridian's
  `hooks.mjs` identity would otherwise stay in the reviewed-hook registry after
  its content was gone.
- The dsh-web side moves the `satellites/dsh-skins` pin and regenerates
  `market/dist` (`pnpm market:build`); `deploy-market.yml` deploys the
  committed artifacts on the dev push. No skin-specific code changes.

## Alternatives considered

- Keeping the directory and hiding the manifest entry: rejected - the manifest
  is a build product, and the installable zip, try-on CSS and sitemap URL would
  keep being served from a directory that is still in the repository.
- Batching the removal into the next intake round: rejected - the takedown is
  requested from the storefront now, and republishing the market is independent
  of the intake process.
- Keeping meridian in `src/reviewed-hooks.generated.ts` so existing installs
  stay recognised: rejected - the registry vouches for the reviewed catalog, and
  a stale entry would keep vouching for a hook whose content no longer exists.

## Consequences

- The repository catalog drops to 55 skins; `pnpm skin-center:check` reports
  `check OK (55 repo catalog skins; package ships blue-fantasy only)`.
- After the market republish the Workshop no longer lists, downloads or
  try-on-renders meridian. The removed files stay recoverable from git history.
- An already-installed copy is untouched: removal stops new store installs, it
  does not reach into a user's `$DSH_HOME/skins/meridian`.
