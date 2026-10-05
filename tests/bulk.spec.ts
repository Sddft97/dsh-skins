/**
 * Bulk skin maintenance: market version reading, version comparison, and the
 * read-only report the Skin Center's bulk buttons drive.
 *
 * The property under test throughout is that a stale install must be visible
 * and an unreachable market must never look like "everything is current".
 */

import { describe, expect, it } from 'vitest'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createServer, request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  MARKET_SKINS_MANIFEST_URL,
  compareVersions,
  fetchMarketVersions,
  outdatedIds,
  planVersionRows,
} from '../src/bulk.ts'
import { makeSkinCenterV2Routes, SKIN_CENTER_V2_PREFIX } from '../src/routes-v2.ts'
import type { SkinCatalog, SkinCatalogEntry } from '../src/skin-repo.ts'

function catalogOf(entries: Array<{ id: string; version: string; origin: 'builtin' | 'user' }>): SkinCatalog {
  const skins: SkinCatalogEntry[] = entries.map((entry) => ({
    manifest: {
      skinManifestVersion: 2,
      id: entry.id,
      name: entry.id,
      nameEn: entry.id,
      version: entry.version,
    } as SkinCatalogEntry['manifest'],
    origin: entry.origin,
    dir: `/skins/${entry.id}`,
    warnings: [],
  }))
  return { skins, diagnostics: [], capturedAt: 0 }
}

/** A fetch that always answers the market manifest with the given items. */
function manifestFetch(items: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify({ generated: '2026-10-05', items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch
}

describe('bulk: compareVersions', () => {
  it('orders a lower release before a higher one', () => {
    expect(compareVersions('0.2.0', '0.4.0')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
  })

  it('treats a missing trailing segment as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0)
  })

  it('reads a malformed segment as zero so a corrupt version sorts oldest and gets repaired', () => {
    // A garbage version must never look current: reading it as 0 sends the
    // skin to the front of the update queue instead of silently skipping it.
    expect(compareVersions('not-a-version', '0.0.1')).toBeLessThan(0)
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
  })
})

describe('bulk: fetchMarketVersions', () => {
  it('reads one version per published skin from the market manifest', async () => {
    const result = await fetchMarketVersions({
      fetchImpl: manifestFetch([
        { id: 'miku', version: '0.4.0' },
        { id: 'deep-current', version: '1.2.0' },
      ]),
    })

    expect(result.error).toBeNull()
    expect(result.versions.get('miku')).toBe('0.4.0')
    expect(result.versions.get('deep-current')).toBe('1.2.0')
  })

  it('keeps the first publication when the manifest repeats an id', async () => {
    const result = await fetchMarketVersions({
      fetchImpl: manifestFetch([{ id: 'miku', version: '0.4.0' }, { id: 'miku', version: '9.9.9' }]),
    })

    expect(result.versions.get('miku')).toBe('0.4.0')
  })

  it('fails closed on a non-ok status so a broken market is never read as current', async () => {
    const failing = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    const result = await fetchMarketVersions({ fetchImpl: failing })

    expect(result.error).toBe('manifest-fetch-failed: 503')
    expect(result.versions.size).toBe(0)
  })

  it('fails closed on a network error and on a malformed payload', async () => {
    const throwing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect((await fetchMarketVersions({ fetchImpl: throwing })).error).toContain('offline')

    const garbage = (async () => new Response('{"items":"nope"}', { status: 200 })) as unknown as typeof fetch
    expect((await fetchMarketVersions({ fetchImpl: garbage })).error).toBe('manifest-malformed')
  })

  it('targets the published market manifest', () => {
    expect(MARKET_SKINS_MANIFEST_URL).toBe('https://dsh-market.com/manifest/skins.json')
  })
})

describe('bulk: planVersionRows', () => {
  it('marks an installed skin behind the market as outdated', () => {
    const rows = planVersionRows(
      catalogOf([{ id: 'miku', version: '0.2.0', origin: 'user' }]),
      new Map([['miku', '0.4.0']]),
    )

    expect(rows).toEqual([
      { id: 'miku', origin: 'user', installed: '0.2.0', latest: '0.4.0', outdated: true },
    ])
  })

  it('leaves a current install and a skin the market does not publish alone', () => {
    const rows = planVersionRows(
      catalogOf([
        { id: 'current', version: '1.0.0', origin: 'user' },
        { id: 'local-only', version: '1.0.0', origin: 'user' },
        { id: 'newer-local', version: '2.0.0', origin: 'user' },
      ]),
      new Map([['current', '1.0.0'], ['newer-local', '1.0.0']]),
    )

    expect(rows.map((row) => row.outdated)).toEqual([false, false, false])
    expect(outdatedIds(rows)).toEqual([])
  })

  it('never marks a builtin outdated, because builtins ship with the package', () => {
    const rows = planVersionRows(
      catalogOf([{ id: 'blue-fantasy', version: '1.0.0', origin: 'builtin' }]),
      new Map([['blue-fantasy', '9.9.9']]),
    )

    expect(rows[0].outdated).toBe(false)
  })

  it('lists the outdated ids in catalog order for the bulk update button', () => {
    const rows = planVersionRows(
      catalogOf([
        { id: 'a', version: '1.0.0', origin: 'user' },
        { id: 'b', version: '1.0.0', origin: 'user' },
        { id: 'c', version: '1.0.0', origin: 'user' },
      ]),
      new Map([['a', '1.0.0'], ['b', '2.0.0'], ['c', '3.0.0']]),
    )

    expect(outdatedIds(rows)).toEqual(['b', 'c'])
  })
})

describe('bulk: the versions route', () => {
  interface VersionsResponse {
    status: number
    body: { ok: boolean; error?: string; rows?: unknown[]; outdated?: number; total?: number }
  }

  /** Serve the real route set and read one JSON response back from it. */
  async function callVersions(
    catalog: SkinCatalog,
    fetchImpl: typeof fetch,
  ): Promise<VersionsResponse> {
    const routes: WebRoute[] = makeSkinCenterV2Routes({
      loadCatalog: () => catalog,
      shippedSkinIds: () => new Set<string>(),
      activeStatePath: 'unused-for-this-route',
      fetchImpl,
    })
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      const route = routes.find((r) => (r.kind === 'exact'
        ? r.path === pathname
        : pathname === r.path || pathname.startsWith(`${r.path}/`)))
      if (route === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      void route.handler(req, res)
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    try {
      const raw = await new Promise<string>((done, fail) => {
        const req = httpRequest({ host: '127.0.0.1', port, path: `${SKIN_CENTER_V2_PREFIX}/skins/versions` }, (res) => {
          let text = ''
          res.on('data', (chunk) => { text += chunk })
          res.on('end', () => done(text))
        })
        req.on('error', fail)
        req.end()
      })
      return { status: 200, body: JSON.parse(raw) as VersionsResponse['body'] }
    } finally {
      await new Promise<void>((done, fail) => server.close((error) => (error == null ? done() : fail(error))))
    }
  }

  it('reports which installed skin is behind so the card can label the bulk update button', async () => {
    const result = await callVersions(
      catalogOf([
        { id: 'miku', version: '0.2.0', origin: 'user' },
        { id: 'deep-current', version: '1.0.0', origin: 'user' },
      ]),
      manifestFetch([{ id: 'miku', version: '0.4.0' }, { id: 'deep-current', version: '1.0.0' }]),
    )

    expect(result.body.ok).toBe(true)
    expect(result.body.outdated).toBe(1)
    expect(result.body.total).toBe(2)
    expect(result.body.rows).toEqual([
      { id: 'miku', origin: 'user', installed: '0.2.0', latest: '0.4.0', outdated: true },
      { id: 'deep-current', origin: 'user', installed: '1.0.0', latest: '1.0.0', outdated: false },
    ])
  })

  it('answers with an error and no rows when the market cannot be read', async () => {
    const failing = (async () => new Response('down', { status: 500 })) as unknown as typeof fetch
    const result = await callVersions(catalogOf([{ id: 'miku', version: '0.2.0', origin: 'user' }]), failing)

    expect(result.body.ok).toBe(false)
    expect(result.body.error).toBe('manifest-fetch-failed: 500')
    expect(result.body.rows).toEqual([])
  })
})
