// @vitest-environment jsdom

/**
 * Boot activation survives an external verdict flip (issue #1805).
 *
 * The desktop client loads its page without the tapIndex `data-dsh-skin`
 * stamp, so boot recovers the persisted selection asynchronously: GET /active,
 * then a switch that loads the skin stylesheet. While that switch is in flight
 * the delegated Wallpaper Engine plugin mounts its media layer and publishes
 * its `body[data-we-wallpaper]` marker, which flips this controller's verdict
 * to withheld.
 *
 * A verdict flip that opens a fresh (empty) activation in that window bumps
 * the request sequence and cancels the in-flight boot switch. The persisted
 * selection is still on disk, so the selection follower sees nothing to repair
 * and the page stays on the stock look with the official default marked active.
 * This spec pins the boot switch across the flip, and the repaint once the
 * wallpaper stops.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bootSkinRuntime, type CatalogSkin } from '../src/client/runtime/boot.ts'

const API = '/api/skin-center/v2'
const SKIN = 'blue-fantasy'

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

/** Every stylesheet link the controller installed for the skin. */
function stylesheetLinks(): HTMLLinkElement[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>(`link[href*="${SKIN}/stylesheet"]`)]
}

/**
 * Let the newest pending stylesheet load resolve. The controller awaits a real
 * link load, and jsdom never fetches one, so the load event is dispatched here.
 */
function settleStylesheet(): void {
  const links = stylesheetLinks()
  expect(links.length).toBeGreaterThan(0)
  links[links.length - 1]!.dispatchEvent(new Event('load'))
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.body.removeAttribute('data-we-wallpaper')
  document.documentElement.removeAttribute('data-dsh-skin')
})

describe('boot activation across an external verdict flip (issue #1805)', () => {
  it('a wallpaper publishing mid-boot keeps the persisted skin as the active selection', async () => {
    // Given a desktop page whose persisted selection arrives asynchronously
    // and whose boot switch is still loading the skin stylesheet
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/catalog')) {
        return jsonResponse({ ok: true, skins: [catalogSkin(SKIN)], diagnostics: [] })
      }
      if (url.endsWith('/active')) {
        return jsonResponse({ ok: true, active: SKIN })
      }
      return new Response('{}', { status: 404 })
    }) as unknown as typeof fetch

    let wallpaperActive = false
    const store = bootSkinRuntime({
      apiBase: API,
      fetchImpl,
      suppressSkin: () => wallpaperActive,
    })

    await vi.waitFor(() => { expect(stylesheetLinks()).toHaveLength(1) })
    expect(store.controller.active).toBeNull()
    expect(store.controller.isSwitching()).toBe(true)

    // When the delegated wallpaper plugin publishes its marker mid-boot
    wallpaperActive = true
    await store.controller.refresh()

    // Then the boot switch is still the activation in flight; the verdict flip
    // is deferred rather than opening a second (empty) activation that would
    // supersede it
    expect(store.controller.isSwitching()).toBe(true)
    expect(store.controller.active).toBeNull()

    // When the stylesheet finishes loading
    settleStylesheet()

    // Then the persisted selection is the active one, withheld by the
    // wallpaper rather than replaced by the stock look
    await vi.waitFor(() => { expect(store.controller.getState().stoodDown).toBe(true) })
    await vi.waitFor(() => { expect(store.controller.isSwitching()).toBe(false) })
    expect(store.controller.active).toBe(SKIN)
    expect(store.controller.getState().active).toBe(SKIN)
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)

    // And when the wallpaper stops, the remembered selection repaints. The
    // withheld activation that replaced the boot one had no stylesheet to
    // install, so the repaint is the page's only skin stylesheet.
    wallpaperActive = false
    const repaint = store.controller.refresh()
    await vi.waitFor(() => { expect(stylesheetLinks()).toHaveLength(1) })
    settleStylesheet()
    await repaint
    expect(store.controller.active).toBe(SKIN)
    expect(store.controller.getState().stoodDown).toBe(false)
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe(SKIN)

    store.shutdown()
  })
})
