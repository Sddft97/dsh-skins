// @vitest-environment jsdom
/**
 * External Wallpaper Engine interop (issue #39, migration round).
 *
 * The skin center delegates wallpaper support to
 * `dsh-plugin-wallpaper-engine`, which marks an active wallpaper with
 * `body[data-we-wallpaper]`. These tests pin the contract the rest of the
 * runtime depends on: the marker is read, never written; every flip is
 * reported once; and the watcher's teardown stops reporting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EXTERNAL_WE_ACTIVE_ATTR,
  externalWallpaperEngineActive,
  watchExternalWallpaperEngine,
} from '../src/client/runtime/external-wallpaper-engine.ts'

/** Flush the MutationObserver microtask queue. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('external wallpaper engine marker', () => {
  it('reads the plugin marker off the body', () => {
    // Given a document with no wallpaper rendering
    expect(externalWallpaperEngineActive(document)).toBe(false)

    // When the delegated plugin stamps its marker
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')

    // Then the runtime sees it
    expect(externalWallpaperEngineActive(document)).toBe(true)
  })
})

describe('external wallpaper engine watcher', () => {
  let teardown: (() => void) | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    teardown?.()
    teardown = null
    document.body.removeAttribute(EXTERNAL_WE_ACTIVE_ATTR)
  })

  it('reports the current state immediately, before any mutation', () => {
    // Given a page that boots with a wallpaper already rendering
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')
    const seen: boolean[] = []

    // When the watcher starts
    teardown = watchExternalWallpaperEngine(document, (active) => seen.push(active))

    // Then the first report is the state as it stands, so no frame of skin
    // art is painted over the wallpaper
    expect(seen).toEqual([true])
  })

  it('reports each flip exactly once', async () => {
    // Given a watcher on a clean document
    const seen: boolean[] = []
    const listener = vi.fn((active: boolean) => seen.push(active))
    teardown = watchExternalWallpaperEngine(document, listener)
    expect(seen).toEqual([false])

    // When the plugin renders, stops, and renders again
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')
    await flush()
    document.body.removeAttribute(EXTERNAL_WE_ACTIVE_ATTR)
    await flush()
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')
    await flush()

    // Then every transition is delivered, and no duplicate for a no-op write
    expect(seen).toEqual([false, true, false, true])
    listener.mockClear()
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops reporting after teardown', async () => {
    // Given a live watcher
    const listener = vi.fn()
    teardown = watchExternalWallpaperEngine(document, listener)
    listener.mockClear()

    // When it is torn down and the plugin then flips the marker
    teardown()
    teardown = null
    document.body.setAttribute(EXTERNAL_WE_ACTIVE_ATTR, '')
    await flush()

    // Then nothing is reported: a disposed runtime leaves no observer behind
    expect(listener).not.toHaveBeenCalled()
  })

  it('never writes the marker it observes', async () => {
    // Given a watcher on a clean document
    teardown = watchExternalWallpaperEngine(document, () => {})
    await flush()

    // When the watcher has been running
    // Then the delegated plugin's attribute is still absent: the interop is
    // strictly read-only
    expect(document.body.hasAttribute(EXTERNAL_WE_ACTIVE_ATTR)).toBe(false)
  })
})
