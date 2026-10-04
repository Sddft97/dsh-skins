// @vitest-environment jsdom
/**
 * Delegated wallpaper plugin pointer (issue #39, migration round).
 *
 * The pointer occupies the place the built-in wallpaper controls used to: it
 * must offer the install command when the plugin is missing, state that the
 * plugin owns wallpapers when it is present, and render nothing at all when
 * the host cannot answer the probe (an older host must never be told to
 * install something).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExternalWallpaperNotice } from '../src/client/ExternalWallpaperNotice.tsx'
import { zh, type SkinCenterKey } from '../src/client/locales.ts'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

/** The zh dictionary with the pointer's interpolation applied. */
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

/** Render the pointer and let the probe resolve. */
async function render(payload: unknown, ok = true): Promise<void> {
  stubProbe(payload, ok)
  await act(async () => {
    root.render(<ExternalWallpaperNotice t={t as never} />)
  })
}

const REPORT = {
  ok: true,
  packageName: 'dsh-plugin-wallpaper-engine',
  repository: 'https://github.com/elysia395/dsh-wallpaper-engine',
  installCommand: 'dsh plugin --profile web add dsh-plugin-wallpaper-engine',
  npm: 'dsh-plugin-wallpaper-engine',
}

/** The Install button of the notice, if rendered. */
function installButton(): HTMLButtonElement | null {
  const buttons = Array.from(host.querySelectorAll('button'))
  return (buttons.find((b) => b.textContent === zh.externalWallpaperInstall) ?? null) as HTMLButtonElement | null
}

/** A Stand-in set of install faces, published into the module store. */
async function publishFaces(native?: unknown, family?: unknown): Promise<void> {
  const { bridgeWallpaperInstallFaces } = await import('../src/client/external-wallpaper-install.ts')
  bridgeWallpaperInstallFaces({
    inject: (deps: string[], cb: (inner: unknown) => void) => {
      const inner = {
        get: (name: string) => (name === 'remote.pluginManager' ? native : family),
        effect: (fn: () => () => void) => fn(),
      }
      for (const dep of deps) cb(inner)
      return () => {}
    },
  } as never)
}

describe('ExternalWallpaperNotice', () => {
  it('offers the install command and the docs link when no manager is available', async () => {
    // Given a profile without the delegated plugin and a host publishing no
    // plugin-management face
    await render({ ...REPORT, installed: false, signals: [] })

    // When the pointer renders
    // Then it names the package, shows the exact command, and links upstream
    expect(host.textContent).toContain(zh.externalWallpaperMissingTitle)
    expect(host.textContent).toContain('dsh-plugin-wallpaper-engine')
    expect(host.textContent).toContain(REPORT.installCommand)
    const link = host.querySelector('a')
    expect(link?.getAttribute('href')).toBe(REPORT.repository)
  })

  it('marks the plugin recommended and offers one-click install when a manager exists', async () => {
    // Given the host publishes the official in-process manager
    const installBundle = vi.fn(async () => ({ ok: true, value: {} }))
    await publishFaces({ installBundle })
    await render({ ...REPORT, installed: false, signals: [] })

    // When the notice renders
    // Then it carries the recommended badge and a working Install button
    expect(host.textContent).toContain(zh.externalWallpaperRecommended)
    const button = installButton()
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // And the click reached the manager with the validated spec
    expect(installBundle).toHaveBeenCalledTimes(1)
    expect((installBundle.mock.calls[0] as unknown[])[0]).toBe('dsh-plugin-wallpaper-engine')
    expect(host.textContent).toContain(zh.externalWallpaperInstall)
  })

  it('surfaces an install refusal instead of claiming success', async () => {
    // Given a manager that refuses the spec
    await publishFaces({ installBundle: vi.fn(async () => ({ ok: false, error: { message: 'peer range rejected' } })) })
    await render({ ...REPORT, installed: false, signals: [] })

    // When Install is clicked
    await act(async () => {
      installButton()!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the reason is shown
    expect(host.textContent).toContain('peer range rejected')
  })

  it('states the delegation and hides the command when the plugin is present', async () => {
    // Given a profile that already carries the plugin
    await render({ ...REPORT, installed: true, signals: ['cordis-row'] })

    // When the pointer renders
    // Then it explains the split of responsibility instead of telling the
    // user to install what they already have
    expect(host.textContent).toContain(zh.externalWallpaperReadyTitle)
    expect(host.textContent).not.toContain(REPORT.installCommand)
    expect(host.querySelector('a')?.getAttribute('href')).toBe(REPORT.repository)
  })

  it('renders nothing when the host does not answer the probe', async () => {
    // Given an older host whose route 404s
    await render({ ok: false, error: 'not-found' }, false)

    // When the pointer renders
    // Then it stays silent rather than claiming the plugin is missing
    expect(host.textContent).toBe('')
  })

  it('renders nothing when the probe cannot be reached', async () => {
    // Given a failing fetch
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await act(async () => {
      root.render(<ExternalWallpaperNotice t={t as never} />)
    })

    // When the pointer renders
    // Then a broken probe never takes the card down
    expect(host.textContent).toBe('')
  })
})
