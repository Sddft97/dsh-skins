/**
 * Bulk skin maintenance for the Skin Center.
 *
 * Integrity verification (provenance.ts) answers "are these bytes the ones I
 * installed?" — a stale install passes it, because a whole old release is
 * internally consistent. Nothing in the catalog can tell a user that a newer
 * release exists, which is why an install can silently fall many versions
 * behind and still look healthy. These helpers ask the official market
 * manifest instead and answer the two questions the bulk buttons need:
 * which installed skins are behind, and what does the market publish.
 *
 * Deliberately read-only. The bulk update and bulk uninstall buttons drive the
 * existing, individually tested per-skin `repair` and `uninstall` routes, so
 * this module never mutates a skin directory itself.
 *
 * @module @linxin666/dsh-client-ui-skin-center/bulk
 */

import { MARKET_PROVENANCE_SOURCE } from './provenance.ts'
import type { SkinCatalog } from './skin-repo.ts'

/** The market manifest URL that publishes one version per published skin. */
export const MARKET_SKINS_MANIFEST_URL = `${MARKET_PROVENANCE_SOURCE}/manifest/skins.json`

/** Default network budget for one manifest read. */
const DEFAULT_TIMEOUT_MS = 15_000

/** One installed skin paired with what the market currently publishes. */
export interface SkinVersionRow {
  id: string
  /** Builtin skins ship with the package and are never "outdated". */
  origin: 'builtin' | 'user'
  /** Version recorded by the installed skin.json, or null when unparseable. */
  installed: string | null
  /** Version the market publishes, or null when the skin is not published. */
  latest: string | null
  /** True only when the market publishes a strictly newer version. */
  outdated: boolean
}

/** Market read result: the version map, or why it could not be read. */
export interface MarketVersions {
  versions: Map<string, string>
  error: string | null
}

export interface FetchMarketVersionsOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Compare two dotted numeric versions segment by segment; a missing segment
 * reads as 0 so "1.2" and "1.2.0" are equal. Non-numeric segments read as 0
 * too, which keeps a malformed version from ever claiming to be newer.
 * @param a - left version.
 * @param b - right version.
 * @returns negative when a < b, 0 when equal, positive when a > b.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.')
  const right = b.split('.')
  const length = Math.max(left.length, right.length, 3)
  for (let index = 0; index < length; index++) {
    const l = Number.parseInt(left[index] ?? '0', 10)
    const r = Number.parseInt(right[index] ?? '0', 10)
    const lv = Number.isNaN(l) ? 0 : l
    const rv = Number.isNaN(r) ? 0 : r
    if (lv !== rv) return lv < rv ? -1 : 1
  }
  return 0
}

/**
 * Read the market manifest and return its id -> version map.
 *
 * Fails closed: any transport, status, or shape problem resolves to an empty
 * map plus an error string, so a caller can never mistake "the market is
 * unreachable" for "everything is up to date" or "everything is outdated".
 * @param options - fetch override and timeout for tests.
 * @returns the version map and a null-or-error status.
 */
export async function fetchMarketVersions(
  options: FetchMarketVersionsOptions = {},
): Promise<MarketVersions> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let payload: unknown
  try {
    const res = await fetchImpl(MARKET_SKINS_MANIFEST_URL, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      return { versions: new Map(), error: `manifest-fetch-failed: ${res.status}` }
    }
    payload = await res.json()
  } catch (error) {
    return { versions: new Map(), error: `manifest-fetch-failed: ${(error as Error)?.message ?? 'network'}` }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { versions: new Map(), error: 'manifest-malformed' }
  }
  const items = (payload as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return { versions: new Map(), error: 'manifest-malformed' }
  }
  const versions = new Map<string, string>()
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as { id?: unknown; version?: unknown }
    if (typeof record.id !== 'string' || record.id === '') continue
    if (typeof record.version !== 'string' || record.version === '') continue
    // First publication wins, so a duplicated id cannot make an installed skin
    // look newer than the release the rest of the manifest agrees on.
    if (!versions.has(record.id)) versions.set(record.id, record.version)
  }
  return { versions, error: null }
}

/**
 * Pair every catalog skin with the market's version for it.
 *
 * Builtin skins are never outdated: they ship inside the package and are
 * replaced by upgrading that package, not by pulling from the market.
 * @param catalog - the current skin catalog snapshot.
 * @param versions - id -> version map from the market manifest.
 * @returns one row per catalog skin, catalog order preserved.
 */
export function planVersionRows(catalog: SkinCatalog, versions: Map<string, string>): SkinVersionRow[] {
  return catalog.skins.map((entry) => {
    const id = entry.manifest.id
    const installed = entry.manifest.version
    const latest = versions.get(id) ?? null
    return {
      id,
      origin: entry.origin,
      installed,
      latest,
      outdated: entry.origin === 'user' && latest !== null && compareVersions(installed, latest) < 0,
    }
  })
}

/** Ids the bulk update button should repair, in catalog order. */
export function outdatedIds(rows: readonly SkinVersionRow[]): string[] {
  return rows.filter((row) => row.outdated).map((row) => row.id)
}
