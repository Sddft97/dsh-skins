/**
 * Preview serialization (issue #39 migration round): the wallpaper dimension
 * left with the built-in Wallpaper Engine bridge, so the coordinator now
 * arbitrates exactly two — skins and the custom theme. These tests pin the
 * orderings the card's try-on / exit / apply buttons rely on.
 */
import { describe, expect, it, vi } from 'vitest'
import { PreviewCoordinator } from '../src/client/preview-coordinator.ts'

/** A skin seat whose preview state the test drives. */
function skinSeat(previewing = false): {
  seat: { getState: () => { previewing: boolean }; exitTryOn: () => Promise<string | null> }
  calls: string[]
  setPreviewing: (value: boolean) => void
} {
  let state = previewing
  const calls: string[] = []
  return {
    calls,
    setPreviewing: (value) => { state = value },
    seat: {
      getState: () => ({ previewing: state }),
      exitTryOn: vi.fn(async () => { state = false; calls.push('skin-exit'); return null }),
    },
  }
}

/** A custom-theme seat recording its lifecycle calls. */
function themeSeat(previewing = false): {
  seat: { getState: () => { previewing: boolean }; exitTryOn: () => void; suspend: () => void; resume: () => void }
  calls: string[]
} {
  let state = previewing
  const calls: string[] = []
  return {
    calls,
    seat: {
      getState: () => ({ previewing: state }),
      exitTryOn: () => { state = false; calls.push('custom-exit') },
      suspend: () => { calls.push('custom-suspend') },
      resume: () => { calls.push('custom-resume') },
    },
  }
}

describe('PreviewCoordinator', () => {
  it('suspends an applied custom theme for a skin preview and resumes it on exit', async () => {
    // Given an applied theme and a skin seat that starts empty
    const skin = skinSeat(false)
    const theme = themeSeat(false)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    // One shared trace: the seats push into it, so the ordering across both
    // dimensions is what the assertions read.
    const calls: string[] = []
    const exitSkin = skin.seat.exitTryOn
    skin.seat.exitTryOn = async () => { calls.push('skin-exit'); return await exitSkin() }
    const suspend = theme.seat.suspend
    theme.seat.suspend = () => { calls.push('custom-suspend'); suspend() }
    const resume = theme.seat.resume
    theme.seat.resume = () => { calls.push('custom-resume'); resume() }

    // When a skin is previewed and then exited
    await coordinator.runSkin(async () => { skin.setPreviewing(true); calls.push('skin-preview'); return null })
    expect(calls).toEqual(['custom-suspend', 'skin-preview'])

    calls.length = 0
    await coordinator.runSkin(() => skin.seat.exitTryOn())

    // Then the theme is suspended for the preview and resumed once it ends
    expect(calls).toEqual(['custom-suspend', 'skin-exit', 'custom-resume'])
  })

  it('retires a live custom-theme preview before starting a skin transition', async () => {
    // Given a custom theme being tried on
    const skin = skinSeat(false)
    const theme = themeSeat(true)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    const calls: string[] = []
    const originalExit = theme.seat.exitTryOn
    theme.seat.exitTryOn = () => { originalExit(); calls.push('custom-exit') }

    // When a skin transition runs
    await coordinator.runSkin(async () => { calls.push('skin-start'); return null })

    // Then the theme preview is retired first, so the two never overlap
    expect(calls).toEqual(['custom-exit', 'skin-start'])
  })

  it('retires a skin preview before starting a custom-theme action', async () => {
    // Given a skin being tried on and no theme preview
    const skin = skinSeat(true)
    const theme = themeSeat(false)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    const calls: string[] = []
    const originalExit = skin.seat.exitTryOn
    skin.seat.exitTryOn = async () => { calls.push('skin-exit'); return await originalExit() }

    // When a custom-theme action runs
    await coordinator.runCustomTheme(async () => { calls.push('custom-preview'); return null })

    // Then the skin preview is exited first
    expect(calls).toEqual(['skin-exit', 'custom-preview'])
  })

  it('commits an existing custom-theme preview without restoring the underlying skin first', async () => {
    // Given a skin preview under a custom-theme preview
    const skin = skinSeat(true)
    const theme = themeSeat(true)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    const calls: string[] = []
    const originalExit = skin.seat.exitTryOn
    skin.seat.exitTryOn = async () => { calls.push('skin-exit'); return await originalExit() }

    // When the custom theme is applied
    await coordinator.runCustomTheme(async () => { calls.push('custom-apply'); return null })

    // Then the already-live theme preview is committed in place: exiting the
    // skin preview would flash the stock look under the applied theme
    expect(calls).toEqual(['custom-apply'])
  })

  it('serializes rapid cross-dimension actions in click order', async () => {
    // Given a coordinator with nothing previewing
    const skin = skinSeat(false)
    const theme = themeSeat(false)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    const calls: string[] = []

    // When two actions are requested back to back
    const first = coordinator.runSkin(async () => { calls.push('skin'); return null })
    const second = coordinator.runCustomTheme(async () => { calls.push('theme'); return null })
    await Promise.all([first, second])

    // Then they run one at a time, in click order
    expect(calls).toEqual(['skin', 'theme'])
  })

  it('runs a skin action after a slow theme transition has fully settled', async () => {
    // Given a theme action that is still in flight
    const skin = skinSeat(false)
    const theme = themeSeat(false)
    const coordinator = new PreviewCoordinator(skin.seat, theme.seat)
    const calls: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })

    const pending = coordinator.runCustomTheme(async () => { calls.push('theme-start'); await gate; calls.push('theme-end'); return null })
    const queued = coordinator.runSkin(async () => { calls.push('skin'); return null })
    await Promise.resolve()

    // When the theme action finishes
    expect(calls).toEqual(['theme-start'])
    release()
    await Promise.all([pending, queued])

    // Then the skin action runs only after it completed
    expect(calls).toEqual(['theme-start', 'theme-end', 'skin'])
  })
})
