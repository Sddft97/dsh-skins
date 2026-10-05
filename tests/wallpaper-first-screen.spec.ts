// @vitest-environment jsdom
/**
 * The first screen honours a persisted wallpaper, all the way through boot
 * (issue #51).
 *
 * Withholding the document is only half of it. The browser half boots
 * asynchronously: with no `html[data-dsh-skin]` stamp it recovers the
 * selection from GET /active and activates it, so the first activation after
 * the host declined to deliver a skin is precisely the switch that would paint
 * a frame of skin back into the gap - a few hundred milliseconds later, which
 * is the same flash, moved.
 *
 * These tests pin the whole chain: the host marks a withheld document, the boot
 * activation stands down while that mark is outstanding, the peer's marker
 * ends the prediction, and a prediction the peer never answers expires on its
 * own so the remembered skin comes back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootSkinRuntime, type CatalogSkin } from '../src/client/runtime/boot.ts'
import {
  EXTERNAL_WE_ACTIVE_ATTR,
  externalWallpaperPredicted,
  releasePrediction,
} from '../src/client/runtime/external-wallpaper-engine.ts'
import { stampWallpaperExpected } from '../src/tap-index-adapter.ts'
import { PREDICTED_WALLPAPER_GRACE_MS, WALLPAPER_EXPECTED_ATTR } from '../src/core/wallpaper-handoff.ts'

const API = '/api/skin-center/v2'
const SKIN = 'blue-fantasy'
const HTML = `<!doctype html><html><head><title>dsh</title></head><body></body></html>`

function catalogSkin(id: string): CatalogSkin {
  return {
    origin: 'builtin',
    warnings: [],
    manifest: { id, name: id, nameEn: id, contributes: { stylesheet: 'skin.css' } },
  } as CatalogSkin
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fetch that answers the two boot endpoints and 404s anything else. */
function bootFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/catalog')) return jsonResponse({ ok: true, skins: [catalogSkin(SKIN)], diagnostics: [] })
    if (url.endsWith('/active')) return jsonResponse({ ok: true, active: SKIN })
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
}

function stylesheetLinks(): HTMLLinkElement[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>(`link[href*="${SKIN}/stylesheet"]`)]
}

/** Let the newest pending stylesheet load resolve; jsdom never fetches one. */
function settleStylesheet(): void {
  const links = stylesheetLinks()
  if (links.length === 0) return
  links[links.length - 1]!.dispatchEvent(new Event('load'))
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.body.removeAttribute(EXTERNAL_WE_ACTIVE_ATTR)
  document.documentElement.removeAttribute('data-dsh-skin')
  document.documentElement.removeAttribute(WALLPAPER_EXPECTED_ATTR)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the host mark on a withheld document (issue #51)', () => {
  it('marks the document it withholds, without stamping a skin', () => {
    // Given the document the host serves for a predicted wallpaper
    const served = stampWallpaperExpected(HTML)

    // Then the prediction is readable from it and the skin is nowhere in it
    expect(served).toContain(`${WALLPAPER_EXPECTED_ATTR}=""`)
    expect(served).not.toContain('data-dsh-skin')

    // And it replaces rather than duplicates an existing mark
    expect(stampWallpaperExpected(served).match(new RegExp(WALLPAPER_EXPECTED_ATTR, 'g'))).toHaveLength(1)
  })

  it('reads the mark off the live document and releases it', () => {
    // Given a document the host marked
    document.documentElement.setAttribute(WALLPAPER_EXPECTED_ATTR, '')
    expect(externalWallpaperPredicted(document)).toBe(true)

    // When the peer answers, or the window closes
    releasePrediction(document)

    // Then the prediction is over
    expect(externalWallpaperPredicted(document)).toBe(false)
  })
})

describe('boot activation while a wallpaper is predicted (issue #51)', () => {
  it('stands the first activation down instead of refilling the withheld document', async () => {
    // Given the document the host withheld and marked, with the peer's marker
    // not yet written (its client chain is still resolving)
    document.documentElement.setAttribute(WALLPAPER_EXPECTED_ATTR, '')
    const store = bootSkinRuntime({
      apiBase: API,
      fetchImpl: bootFetch(),
      suppressSkin: () => externalWallpaperPredicted(document),
    })

    // When boot recovers the persisted selection and its switch settles
    // When boot recovers the persisted selection and its switch settles. The
    // withheld activation installs no stylesheet, so there is no link to wait
    // on: the settled selection is the signal that the switch completed.
    await vi.waitFor(() => { expect(store.controller.active).toBe(SKIN) })
    await vi.waitFor(() => { expect(store.controller.isSwitching()).toBe(false) })

    // Then no skin was painted into the gap the host left open
    expect(stylesheetLinks()).toHaveLength(0)
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)
    expect(store.controller.getState().stoodDown).toBe(true)

    // And the user's choice is still remembered, not discarded
    expect(store.controller.getState().active).toBe(SKIN)

    store.shutdown()
  })

  it('paints the remembered skin when the prediction expires unanswered', async () => {
    // Given a prediction whose peer never stamps its marker (a wallpaper that
    // failed to render)
    vi.useFakeTimers()
    document.documentElement.setAttribute(WALLPAPER_EXPECTED_ATTR, '')
    const store = bootSkinRuntime({
      apiBase: API,
      fetchImpl: bootFetch(),
      suppressSkin: () => externalWallpaperPredicted(document),
    })

    await vi.waitFor(() => { expect(store.controller.active).toBe(SKIN) })
    await vi.waitFor(() => { expect(store.controller.isSwitching()).toBe(false) })
    expect(store.controller.getState().stoodDown).toBe(true)

    // When the grace window closes with no answer
    releasePrediction(document)
    const repaint = store.controller.refresh()

    // Then the skin the user chose comes back on its own
    await vi.waitFor(() => { expect(stylesheetLinks()).toHaveLength(1) })
    settleStylesheet()
    await repaint
    expect(store.controller.getState().stoodDown).toBe(false)
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe(SKIN)

    store.shutdown()
  })

  it('paints the remembered skin when the peer answers no', async () => {
    // Given a prediction and a peer that resolves to "no wallpaper after all"
    document.documentElement.setAttribute(WALLPAPER_EXPECTED_ATTR, '')
    const store = bootSkinRuntime({
      apiBase: API,
      fetchImpl: bootFetch(),
      suppressSkin: () => externalWallpaperPredicted(document),
    })
    await vi.waitFor(() => { expect(store.controller.active).toBe(SKIN) })
    await vi.waitFor(() => { expect(store.controller.isSwitching()).toBe(false) })
    expect(store.controller.getState().stoodDown).toBe(true)

    // When the marker says inactive and the prediction is released
    releasePrediction(document)
    const repaint = store.controller.refresh()

    // Then the skin applies normally
    await vi.waitFor(() => { expect(stylesheetLinks()).toHaveLength(1) })
    settleStylesheet()
    await repaint
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe(SKIN)

    store.shutdown()
  })

  it('keeps the skin withheld for the whole window the peer needs', () => {
    // Given the measured peer chain is 300ms-1s
    // Then the grace window covers it with room to spare
    expect(PREDICTED_WALLPAPER_GRACE_MS).toBeGreaterThanOrEqual(1000)
  })
});
