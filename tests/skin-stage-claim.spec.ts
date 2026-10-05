// @vitest-environment jsdom
/**
 * A user-initiated activation claims the stage (issue #49).
 *
 * The delegated wallpaper plugin hands the page back when it reads the public
 * `html[data-dsh-skin]` stamp, but a stand-down used to swallow the request
 * before it ever reached the DOM: a try-on during a wallpaper painted nothing
 * and left no trace anywhere, and re-applying the skin already on wrote the
 * same value again. These tests pin the claim, its one-shot withdrawal when no
 * peer answers it, and that every automatic activation still stands down.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEffectLedger } from '../src/client/runtime/effect-ledger.ts'
import {
  createSkinController,
  USER_INITIATED_YIELD_GRACE_MS,
  type ControllerSkinEntry,
} from '../src/client/runtime/skin-controller.ts'

function entryFor(id: string): ControllerSkinEntry {
  return {
    manifest: { id, contributes: { stylesheet: 'skin.css' } },
  } as ControllerSkinEntry
}

/** A controller whose stand-down verdict is the mutable `state.suppressed` flag. */
function harness(options: { suppressed?: boolean; loadStylesheet?: (href: string) => Promise<void> } = {}) {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-dsh-skin')
  const state = { suppressed: options.suppressed ?? false }
  const persisted: Array<string | null> = []
  const controller = createSkinController({
    doc: document,
    ledger: createEffectLedger(),
    loadStylesheet: options.loadStylesheet ?? (async (href: string) => {
      // Mirror the default loader's DOM effect so trackStylesheet finds it.
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
    }),
    persist: async (id) => { persisted.push(id) },
    suppressSkin: () => state.suppressed,
  })
  return { controller, state, persisted }
}

const skinStamp = (): string | null => document.documentElement.getAttribute('data-dsh-skin')
const styleLinks = (): number => document.head.querySelectorAll('link[rel="stylesheet"]').length

/** Flush the MutationObserver microtask queue. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('a user-initiated activation claims the stage', () => {
  it('a try-on during a wallpaper paints and flips the public stamp (#49)', async () => {
    // Given the delegated plugin rendering a wallpaper, so every activation so
    // far has been withheld
    const { controller, state } = harness({ suppressed: true })

    // When the user clicks try-on on a skin
    await controller.tryOn('mint', entryFor('mint'), { userInitiated: true })

    // Then the public stamp flips - the one signal that plugin keys its
    // hand-back on - and the card reads the skin as painted, not paused
    expect(skinStamp()).toBe('mint')
    expect(styleLinks()).toBe(1)
    expect(controller.getState()).toEqual({
      active: 'mint', stoodDown: false, trying: 'mint', previewing: true,
    })

    // And when that plugin clears its marker, the verdict flip is a no-op that
    // leaves this very paint alone
    state.suppressed = false
    await controller.refresh()
    expect(skinStamp()).toBe('mint')
    expect(controller.getState().stoodDown).toBe(false)
  })

  it('re-applying the skin already on still publishes the action on the DOM (#49)', async () => {
    // Given a skin that is already applied
    const { controller } = harness()
    await controller.switchTo('mint', entryFor('mint'), { userInitiated: true })
    expect(skinStamp()).toBe('mint')

    // A peer watches the stamp rather than the persisted value, because
    // re-applying the same skin writes the same value to /active
    const seen: Array<string | null> = []
    const observer = new MutationObserver(() => { seen.push(skinStamp()) })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-skin'] })

    // When the user applies that same skin again
    await controller.switchTo('mint', entryFor('mint'), { userInitiated: true })
    await flush()
    observer.disconnect()

    // Then the action is visible on the stamp even though its value did not move
    expect(seen).toEqual(['mint'])
    expect(skinStamp()).toBe('mint')
  })

  it('the stock look does not claim a stage it never paints (#49)', async () => {
    // Given a wallpaper rendering
    const { controller } = harness({ suppressed: true })

    // When the user previews the stock look
    await controller.tryOn(null, null, { userInitiated: true })

    // Then nothing is painted and the card keeps saying the skin is paused:
    // there is no stamp for a peer to read, so a claim would only be a lie
    expect(skinStamp()).toBeNull()
    expect(styleLinks()).toBe(0)
    expect(controller.getState().stoodDown).toBe(true)
  })

  it('a verdict flip landing on a claim hands the page over cleanly (#49)', async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-skin')
    // Given a claim whose stylesheet is still loading, and an owner that stops
    // rendering in the middle of it
    let blocking = false
    let release!: () => void
    let gate: Promise<void> = Promise.resolve()
    const state = { suppressed: true }
    const errors: string[] = []
    const controller = createSkinController({
      doc: document,
      ledger: createEffectLedger(),
      persist: async () => {},
      suppressSkin: () => state.suppressed,
      onError: (message) => { errors.push(message) },
      loadStylesheet: async (href: string) => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        document.head.appendChild(link)
        if (blocking) await gate
      },
    })
    blocking = true
    gate = new Promise<void>((resolve) => { release = resolve })
    const claimed = controller.tryOn('mint', entryFor('mint'), { userInitiated: true })
    expect(controller.isSwitching()).toBe(true)

    // When the owner clears its marker while that claim is still loading
    state.suppressed = false
    await controller.refresh()
    blocking = false
    release()
    await claimed
    await flush()

    // Then the replayed flip owns the page: the claim hands over instead of
    // failing on the way out
    expect(errors).toEqual([])
    expect(controller.isSwitching()).toBe(false)
    expect(skinStamp()).toBe('mint')
  })

  it('an automatic activation still stands down while the wallpaper renders (#39)', async () => {
    // Given a wallpaper rendering (the boot activation and the persisted
    // selection follower both take this path - they never claim the stage)
    const { controller, persisted } = harness({ suppressed: true })

    // When a skin is switched
    await controller.switchTo('mint', entryFor('mint'))

    // Then it is recorded and persisted but nothing is painted
    expect(skinStamp()).toBeNull()
    expect(styleLinks()).toBe(0)
    expect(controller.active).toBe('mint')
    expect(persisted).toEqual(['mint'])
  })
})

describe('an unanswered stage claim is withdrawn', () => {
  it('gives the stage back when the hand-back window closes (#49)', async () => {
    vi.useFakeTimers()
    // Given a wallpaper rendering that never answers the claim
    const { controller } = harness({ suppressed: true })
    await controller.tryOn('mint', entryFor('mint'), { userInitiated: true })
    expect(skinStamp()).toBe('mint')

    // When the window closes with the owner still active
    await vi.advanceTimersByTimeAsync(USER_INITIATED_YIELD_GRACE_MS)

    // Then the skin stands down instead of sitting on top of that owner's
    // visual, and the remembered selection is intact
    expect(skinStamp()).toBeNull()
    expect(styleLinks()).toBe(0)
    expect(controller.getState().stoodDown).toBe(true)
    expect(controller.active).toBe('mint')
  })

  it('keeps the paint when the plugin answers the claim (#49)', async () => {
    vi.useFakeTimers()
    // Given a claim on the stage
    const { controller, state } = harness({ suppressed: true })
    await controller.tryOn('mint', entryFor('mint'), { userInitiated: true })

    // When the delegated plugin reads the stamp and hands the page back
    state.suppressed = false
    await controller.refresh()

    // Then the window closing changes nothing: the withdrawal only fires while
    // the owner is still active
    await vi.advanceTimersByTimeAsync(USER_INITIATED_YIELD_GRACE_MS)
    expect(skinStamp()).toBe('mint')
    expect(controller.getState().stoodDown).toBe(false)
  })

  it('shutdown cancels the pending withdrawal (#49)', async () => {
    vi.useFakeTimers()
    const { controller } = harness({ suppressed: true })
    await controller.switchTo('mint', entryFor('mint'), { userInitiated: true })
    const seen: number[] = []
    controller.subscribe(() => { seen.push(controller.getState().stoodDown ? 1 : 0) })

    // When the runtime is torn down inside the window
    controller.shutdown()
    const emissions = seen.length

    // Then the cancelled window never opens a withdrawal on a dead runtime
    await vi.advanceTimersByTimeAsync(USER_INITIATED_YIELD_GRACE_MS * 2)
    expect(seen.length).toBe(emissions)
    expect(controller.active).toBeNull()
    expect(skinStamp()).toBeNull()
  })

  it('a window that opens mid-switch leaves that switch alone (#49)', async () => {
    vi.useFakeTimers()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-skin')
    // Given a claim on the stage, and a stylesheet loader that a later switch
    // can stall on
    let stall: Promise<void> | null = null
    let releaseStall!: () => void
    const stalling = new Promise<void>((resolve) => { releaseStall = resolve })
    let suppressed = true
    const controller = createSkinController({
      doc: document,
      ledger: createEffectLedger(),
      persist: async () => {},
      suppressSkin: () => suppressed,
      loadStylesheet: async (href: string) => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        document.head.appendChild(link)
        await stall
      },
    })
    await controller.tryOn('mint', entryFor('mint'), { userInitiated: true })

    // When an automatic switch starts loading and the window closes mid-flight
    stall = stalling
    const following = controller.switchTo('ocean', entryFor('ocean'))
    await vi.advanceTimersByTimeAsync(USER_INITIATED_YIELD_GRACE_MS)
    releaseStall()
    await following

    // Then the withdrawal did not supersede it: that switch sampled the
    // verdict itself and owns the page
    expect(controller.active).toBe('ocean')
    expect(skinStamp()).toBeNull()
    expect(controller.getState().stoodDown).toBe(true)
  })
})
