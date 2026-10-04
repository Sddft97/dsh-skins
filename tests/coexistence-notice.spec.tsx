// @vitest-environment jsdom
/**
 * Coexistence notice (issue #39): the card's advisory that the standalone
 * Wallpaper Engine plugin and this bridge are alternatives.
 *
 * The notice is driven entirely by the host probe, so the contract under test
 * is what the card does with the three answers it can receive: detected, not
 * detected, and no answer at all. The last two must render nothing — an
 * advisory that appears on a clean profile, or that takes the card down when
 * an older host lacks the route, is worse than no advisory.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CoexistenceNotice } from '../src/client/CoexistenceNotice.tsx'
import { zh, type SkinCenterKey } from '../src/client/locales.ts'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

/** The zh dictionary with the notice's one interpolation applied. */
const t = (key: SkinCenterKey, params?: Record<string, string>): string => {
  const copy = zh[key] ?? key
  return params === undefined
    ? copy
    : copy.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  host = document.getElementById('root') as HTMLDivElement
  root = createRoot(host)
})

afterEach(() => {
  act(() => { root.unmount() })
  vi.unstubAllGlobals()
})

/** Stub the probe endpoint with one JSON answer. */
function stubProbe(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  })))
}

/** Render the notice and let the probe resolve. */
async function render(payload: unknown, ok = true): Promise<void> {
  stubProbe(payload, ok)
  await act(async () => {
    root.render(<CoexistenceNotice t={t as never} />)
  })
}

describe('CoexistenceNotice', () => {
  it('names the standalone plugin and the switch when the probe detects it', async () => {
    // Given a profile that also carries the standalone wallpaper plugin
    await render({
      ok: true,
      detected: true,
      signals: ['profile-dependency'],
      packageName: 'dsh-plugin-wallpaper-engine',
      repository: 'https://github.com/elysia395/dsh-wallpaper-engine',
    })

    // When the notice renders
    // Then it names the plugin, states the either-or, and links upstream
    expect(host.textContent).toContain(zh.coexistenceTitle)
    expect(host.textContent).toContain('dsh-plugin-wallpaper-engine')
    expect(host.textContent).toContain(zh.coexistenceSwitch)
    const link = host.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://github.com/elysia395/dsh-wallpaper-engine')
  })

  it('renders nothing on a profile without the standalone plugin', async () => {
    // Given a probe answer of not detected
    await render({
      ok: true,
      detected: false,
      signals: [],
      packageName: 'dsh-plugin-wallpaper-engine',
      repository: 'https://github.com/elysia395/dsh-wallpaper-engine',
    })

    // When the notice renders
    // Then the card stays uncluttered
    expect(host.textContent).toBe('')
  })

  it('renders nothing when the host does not answer the probe', async () => {
    // Given an older host whose route 404s
    await render({ ok: false, error: 'not-found' }, false)

    // When the notice renders
    // Then a missing route is not an advisory
    expect(host.textContent).toBe('')
  })

  it('renders nothing when the probe cannot be reached', async () => {
    // Given a failing fetch
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await act(async () => {
      root.render(<CoexistenceNotice t={t as never} />)
    })

    // When the notice renders
    // Then a broken probe never takes the card down
    expect(host.textContent).toBe('')
  })
})
