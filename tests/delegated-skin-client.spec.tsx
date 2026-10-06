// @vitest-environment jsdom
/**
 * Delegated skins in the browser half: the marker watcher, the controller's
 * withheld activation, and the card row.
 *
 * A delegated skin is a real selection that paints nothing. Three properties
 * have to hold together, and each of them fails loudly if it is wrong:
 *
 *  - the page never claims a skin it is not painting, so html[data-dsh-skin]
 *    stays off and the plugin that owns the visual is never told to stand down;
 *  - the selection is still committed and still restored, so the delegated look
 *    survives a reload and any other skin takes the page back in one click;
 *  - the card offers the row only when the plugin is really on the page and its
 *    build can hand the page back, because two owners of one shell is the
 *    failure the whole delegation exists to prevent.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEffectLedger } from '../src/client/runtime/effect-ledger.ts'
import { createSkinController, isDelegatedEntry, type ControllerSkinEntry } from '../src/client/runtime/skin-controller.ts'
import { delegatedThemeState, watchDelegatedTheme } from '../src/client/runtime/delegated-theme.ts'
import { DelegatedSkinCard } from '../src/client/DelegatedSkinCard.tsx'
import { bridgeInstallFaces } from '../src/client/plugin-install-faces.ts'
import { zh, type SkinCenterKey } from '../src/client/locales.ts'
import type { CatalogSkin } from '../src/client/runtime/boot.ts'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

const MARKERS = { bodyAttr: 'data-dsh-claude-style', handoffAttr: 'data-dsh-claude-style-handoff' }

const DELEGATED_ENTRY = {
  manifest: {
    id: 'claude-style',
    delegated: {
      package: 'dsh-claude-style',
      repository: 'https://github.com/Nwflower/dsh-claude-style',
      bodyAttr: MARKERS.bodyAttr,
      handoffAttr: MARKERS.handoffAttr,
      installed: true,
    },
  },
} as unknown as ControllerSkinEntry

/** The zh dictionary with the row's interpolation applied. */
const t = (key: SkinCenterKey, params?: Record<string, string>): string => {
  const copy = zh[key] ?? key
  return params === undefined ? copy : copy.replace(/{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}

function controllerHarness(persist: (id: string | null) => Promise<void> = async () => {}) {
  const ledger = createEffectLedger()
  const loadStylesheet = vi.fn(async () => {})
  const controller = createSkinController({ doc: document, ledger, loadStylesheet, persist })
  return { controller, loadStylesheet }
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-dsh-skin')
  document.body.removeAttribute(MARKERS.bodyAttr)
  document.body.removeAttribute(MARKERS.handoffAttr)
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="root"></div>'
})

afterEach(() => { vi.unstubAllGlobals() })

describe('the delegated theme markers', () => {
  it('reads both markers off the body and never writes them', () => {
    // Given a page the delegated plugin has stamped
    document.body.setAttribute(MARKERS.bodyAttr, 'build-123')
    document.body.setAttribute(MARKERS.handoffAttr, '')

    // When the state is read
    const state = delegatedThemeState(document, MARKERS)

    // Then it is live and can yield, and the document is untouched
    expect(state).toEqual({ live: true, canYield: true })
    expect(document.body.getAttribute(MARKERS.bodyAttr)).toBe('build-123')
  })

  it('separates a live plugin from one that can hand the page back', () => {
    // Given a plugin from before the handoff contract
    document.body.setAttribute(MARKERS.bodyAttr, 'build-001')

    // When the state is read
    const state = delegatedThemeState(document, MARKERS)

    // Then it paints but cannot yield
    expect(state).toEqual({ live: true, canYield: false })
  })

  it('reports the first state immediately and every flip after it', async () => {
    // Given a page with no plugin yet
    const seen: Array<{ live: boolean; canYield: boolean }> = []
    const stop = watchDelegatedTheme(document, MARKERS, (state) => { seen.push(state) })

    // Then the first report is the current state, not a wait for a change
    expect(seen).toEqual([{ live: false, canYield: false }])

    // And a later stamp is reported (the observer callback is a microtask)
    document.body.setAttribute(MARKERS.bodyAttr, 'build-9')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen[seen.length - 1]).toEqual({ live: true, canYield: false })

    // And nothing arrives after the teardown
    stop()
    document.body.removeAttribute(MARKERS.bodyAttr)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toHaveLength(2)
  })
})

describe('the controller with a delegated selection', () => {
  it('recognizes a delegated entry without looking at its files', () => {
    expect(isDelegatedEntry(DELEGATED_ENTRY)).toBe(true)
    expect(isDelegatedEntry({ manifest: { id: 'harbor', contributes: { stylesheet: 'skin.css' } } } as ControllerSkinEntry)).toBe(false)
    expect(isDelegatedEntry(null)).toBe(false)
  })

  it('persists the selection and paints nothing', async () => {
    // Given a controller and a delegated skin
    const persist = vi.fn(async () => {})
    const { controller, loadStylesheet } = controllerHarness(persist)
    document.documentElement.setAttribute('data-dsh-skin', 'harbor')

    // When the user applies it
    const result = await controller.switchTo('claude-style', DELEGATED_ENTRY, { userInitiated: true })

    // Then the selection is the delegated skin and the page carries no skin
    expect(result).toBe('claude-style')
    expect(controller.active).toBe('claude-style')
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)
    // And no stylesheet was ever requested for a directory that has none
    expect(loadStylesheet).not.toHaveBeenCalled()
    // And the choice is persisted like any other
    expect(persist).toHaveBeenCalledWith('claude-style')
  })

  it('is a selection, not a stand-down, so the card does not read it as paused', async () => {
    // Given a delegated skin applied from a normal skin
    const { controller } = controllerHarness()

    // When it activates
    await controller.switchTo('claude-style', DELEGATED_ENTRY, { userInitiated: true })

    // Then the state says active, not stood down
    expect(controller.getState()).toMatchObject({ active: 'claude-style', stoodDown: false })
  })

  it('hands the page back the moment another skin is applied', async () => {
    // Given the delegated skin on the page
    const { controller } = controllerHarness()
    await controller.switchTo('claude-style', DELEGATED_ENTRY, { userInitiated: true })

    // When the user applies a real skin
    const harbor = { manifest: { id: 'harbor', contributes: { stylesheet: 'skin.css' } } } as ControllerSkinEntry
    await controller.switchTo('harbor', harbor, { userInitiated: true })

    // Then the stamp comes back, which is the signal the plugin yields on
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('harbor')
    expect(controller.active).toBe('harbor')
  })

  it('stands a delegated skin down as well while a wallpaper renders', async () => {
    // Given a delegated skin and a wallpaper plugin that owns the page
    const ledger = createEffectLedger()
    let wallpaper = true
    const controller = createSkinController({
      doc: document,
      ledger,
      loadStylesheet: vi.fn(async () => {}),
      suppressSkin: () => wallpaper,
    })

    // When it activates
    await controller.switchTo('claude-style', DELEGATED_ENTRY, { userInitiated: true })

    // Then the page is still the delegated plugin's and the card reads paused
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)
    expect(controller.getState().stoodDown).toBe(true)

    // And when the wallpaper stops, the selection repaints as usual
    wallpaper = false
    await controller.refresh()
    expect(controller.active).toBe('claude-style')
  })
})

describe('the delegated skin row', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.getElementById('root') as HTMLDivElement
    root = createRoot(host)
  })
  afterEach(() => { act(() => { root.unmount() }) })

  const skin = (installed: boolean): CatalogSkin => ({
    origin: 'delegated',
    warnings: [],
    manifest: {
      id: 'claude-style',
      name: 'Claude Code Style',
      nameEn: 'Claude Code Style',
      tagline: 'Claude Code Desktop theme',
      accent: '#d97757',
      delegated: {
        package: 'dsh-claude-style',
        repository: 'https://github.com/Nwflower/dsh-claude-style',
        installCommand: 'dsh plugin --profile web add dsh-claude-style',
        bodyAttr: MARKERS.bodyAttr,
        handoffAttr: MARKERS.handoffAttr,
        installed,
        signals: [],
        descriptorMatches: null,
      },
    },
  } as unknown as CatalogSkin)

  async function render(props: Partial<Parameters<typeof DelegatedSkinCard>[0]> = {}): Promise<void> {
    await act(async () => {
      root.render(
        <DelegatedSkinCard
          t={t as never}
          skin={skin(props.skin?.manifest.delegated?.installed ?? false)}
          theme={props.theme ?? { live: false, canYield: false }}
          isActive={false}
          isTrying={false}
          yieldedToSkin={false}
          busy={false}
          disabled={false}
          onTryOn={() => {}}
          onExitTryOn={() => {}}
          onApply={() => {}}
          onInstalled={() => {}}
          {...props}
        />,
      )
    })
  }

  /** Publish the official plugin-manager face into the module store. */
  async function publishNativeManager(service: unknown): Promise<void> {
    bridgeInstallFaces({
      inject: (deps: string[], cb: (inner: unknown) => void) => {
        const inner = {
          get: (name: string) => (name === 'remote.pluginManager' ? service : null),
          effect: (fn: () => () => void) => fn(),
        }
        for (const dep of deps) cb(inner)
        return () => {}
      },
    } as never)
  }

  /** The button carrying this label, if rendered. */
  function button(label: string): HTMLButtonElement | null {
    return (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label) ?? null) as HTMLButtonElement | null
  }

  it('offers the install command when the plugin is missing and no manager exists', async () => {
    // Given a profile without the plugin
    await render()

    // Then the row says so and shows the exact command
    expect(host.textContent).toContain('dsh-claude-style')
    expect(host.textContent).toContain('dsh plugin --profile web add dsh-claude-style')
    expect(button(zh.delegatedSkinInstall)).toBeNull()
  })

  it('installs through the host manager in one click', async () => {
    // Given a host that publishes the official plugin manager
    const installBundle = vi.fn(async () => ({ ok: true, value: {} }))
    await publishNativeManager({ installBundle })
    const onInstalled = vi.fn()

    // And a row for a profile without the plugin
    await render({ onInstalled })

    // When Install is pressed
    await act(async () => {
      button(zh.delegatedSkinInstall)?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the manager received the validated spec, and the catalog is re-read
    expect(installBundle).toHaveBeenCalledTimes(1)
    expect((installBundle.mock.calls[0] as unknown[])[0]).toBe('dsh-claude-style')
    expect(onInstalled).toHaveBeenCalled()
  })

  it('surfaces an install refusal instead of claiming success', async () => {
    // Given a manager that refuses the spec
    await publishNativeManager({
      installBundle: vi.fn(async () => ({ ok: false, error: { message: 'peer range rejected' } })),
    })

    // And a row for a profile without the plugin
    await render()

    // When Install is pressed
    await act(async () => {
      button(zh.delegatedSkinInstall)?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the reason is shown
    expect(host.textContent).toContain('peer range rejected')
  })

  it('offers try-on and apply only once the plugin is live and can yield', async () => {
    // Given an installed but absent plugin
    await render({ skin: skin(true) })

    // Then the row states it is not running and offers no selection
    expect(host.textContent).toContain(zh.delegatedSkinNotRunning)
    expect(button(zh.tryOn)).toBeNull()
    expect(button(zh.apply)).toBeNull()

    // And when the plugin is live, the selection controls appear
    await render({ skin: skin(true), theme: { live: true, canYield: true } })
    expect(button(zh.tryOn)).not.toBeNull()
    expect(button(zh.apply)).not.toBeNull()
  })

  it('calls an installed plugin yielded rather than missing when a skin owns the page', async () => {
    // Given an installed plugin that stood down for the skin this card
    // selected: its markers are gone, which is the handoff working
    await render({ skin: skin(true), theme: { live: false, canYield: false }, yieldedToSkin: true })

    // Then the row says it yielded, and never tells the reader to enable it
    expect(host.textContent).toContain(zh.delegatedSkinYielded)
    expect(host.textContent).not.toContain(zh.delegatedSkinNotRunning)
    expect(host.textContent).not.toContain(zh.delegatedSkinMissing)
  })

  it('keeps try-on and apply while yielded, so the reader can hand the page back', async () => {
    // Given the same yielded plugin
    await render({ skin: skin(true), theme: { live: false, canYield: false }, yieldedToSkin: true })

    // Then the selection controls are there: switching back is the action that
    // hands the page to the plugin again
    expect(button(zh.tryOn)).not.toBeNull()
    expect(button(zh.apply)).not.toBeNull()
  })

  it('still says not running when nothing is painted and the plugin is absent', async () => {
    // Given an installed plugin that is simply not on this page
    await render({ skin: skin(true), theme: { live: false, canYield: false }, yieldedToSkin: false })

    // Then the row points at the Plugins page, which is the actionable truth
    expect(host.textContent).toContain(zh.delegatedSkinNotRunning)
    expect(button(zh.apply)).toBeNull()
  })

  it('refuses to offer a live plugin that cannot hand the page back', async () => {
    // Given a running plugin from before the handoff contract
    await render({ skin: skin(true), theme: { live: true, canYield: false } })

    // Then the row says the build has to be updated, and offers nothing
    expect(host.textContent).toContain(zh.delegatedSkinNoHandoff)
    expect(button(zh.tryOn)).toBeNull()
    expect(button(zh.apply)).toBeNull()
  })

  it('exits a try-on instead of starting a second one', async () => {
    // Given the row in try-on
    const onExitTryOn = vi.fn()
    await render({ skin: skin(true), theme: { live: true, canYield: true }, isTrying: true, onExitTryOn })

    // Then the control offers to leave the preview
    await act(async () => { button(zh.exitTryOn)?.click() })
    expect(onExitTryOn).toHaveBeenCalled()
  })
})
