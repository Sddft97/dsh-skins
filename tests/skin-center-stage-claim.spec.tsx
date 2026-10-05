// @vitest-environment jsdom

/**
 * The card marks the activations the user just asked for (issue #49).
 *
 * Try-on and apply are the two paths a person clicks, and they are the two the
 * delegated wallpaper plugin must be able to see: each claims the stage once so
 * the public `html[data-dsh-skin]` stamp flips. Every other switch the card
 * makes (a rollback, the stock look) stays unmarked, because a claim it cannot
 * honour would only misreport the page as painting.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

import { SkinCenter } from '../src/client/SkinCenter.tsx'
import { CustomThemeController } from '../src/client/custom-theme-controller.ts'
import { zh, type SkinCenterKey } from '../src/client/locales.ts'
import type { SkinActivationOptions } from '../src/client/runtime/skin-controller.ts'
import { CUSTOM_THEME_DEFAULTS, type CustomThemeConfig } from '../src/core/custom-theme.ts'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

const t = (key: SkinCenterKey): string => zh[key] ?? key

/** Minimal writable settings form: the custom theme card reads and writes it. */
function customScope(): ConfigForm<CustomThemeConfig> {
  let value = { ...CUSTOM_THEME_DEFAULTS } as CustomThemeConfig
  const listeners = new Set<() => void>()
  const snapshot: ConfigFormSnapshot<CustomThemeConfig> = {
    status: 'ready', value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host',
  }
  return {
    getSnapshot: () => ({ ...snapshot, value }),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async (field, next) => {
      value = { ...value, [field]: next }
      for (const listener of listeners) listener()
      return true
    },
    unset: async () => true,
    mutate: async () => true,
  }
}

const mint = {
  origin: 'builtin',
  warnings: [],
  manifest: {
    id: 'mint', name: 'Mint', nameEn: 'Mint', tagline: 'Mint skin',
    contributes: { stylesheet: 'skin.css' },
  },
}

interface Activation {
  method: 'tryOn' | 'switchTo'
  id: string | null
  options: SkinActivationOptions | undefined
}

let root: Root
let host: HTMLDivElement
let customTheme: CustomThemeController
const activations: Activation[] = []

async function renderSkinCenter(): Promise<void> {
  const catalog = [mint]
  const themeSnapshot = { active: { colorScheme: 'light' } }
  const controllerState = { active: null, trying: null, previewing: false, stoodDown: true }
  const runtime = {
    controller: {
      active: null,
      layers: {},
      getState: () => controllerState,
      subscribe: () => () => {},
      tryOn: async (id: string | null, _entry: unknown, options?: SkinActivationOptions) => {
        activations.push({ method: 'tryOn', id, options })
        return id
      },
      exitTryOn: async () => null,
      switchTo: async (id: string | null, _entry: unknown, options?: SkinActivationOptions) => {
        activations.push({ method: 'switchTo', id, options })
        return id
      },
      refresh: async () => null,
      shutdown: () => {},
    },
    catalog: () => catalog,
    diagnostics: () => [],
    refreshCatalog: async () => {},
    find: (id: string) => catalog.find(entry => entry.manifest.id === id) ?? null,
    subscribe: () => () => {},
    shutdown: () => {},
  }
  await act(async () => {
    root.render(<SkinCenter
      t={t as never}
      runtime={runtime as never}
      preview={{
        runSkin: async action => await action(),
        runCustomTheme: async action => await action(),
      } as never}
      customTheme={customTheme}
      theme={{
        // A stable snapshot reference: useSyncExternalStore re-renders on a
        // changed one, and a fresh object per call never settles.
        getTheme: () => themeSnapshot as never,
        subscribe: () => () => {},
        setTheme: () => {},
      }}
      background={{
        enabled: () => true, opacity: () => 0, blurEmpty: () => 0, blurContent: () => 0,
        inputCardBlur: () => 10, bubbleOpacity: () => 50, bubbleBlur: () => 10,
        subscribe: () => () => {}, setEnabled: () => {}, set: () => {}, setBlurEmpty: () => {},
        setBlurContent: () => {}, setInputCardBlur: () => {}, setBubbleOpacity: () => {},
        setBubbleBlur: () => {}, dispose: () => {},
      }}
      externalWallpaper={{
        active: () => true,
        subscribe: () => () => {},
        repository: 'https://example.invalid/dsh-plugin-wallpaper-engine',
        packageName: 'dsh-plugin-wallpaper-engine',
      }}
    />)
  })
}

function cardNamed(name: string): HTMLElement {
  const label = Array.from(host.querySelectorAll('span')).find(node => node.textContent === name)
  const card = label?.parentElement?.parentElement
  if (!(card instanceof HTMLElement)) throw new Error(`missing ${name} card`)
  return card
}

function buttonNamed(card: ParentNode, name: string): HTMLButtonElement {
  const button = Array.from(card.querySelectorAll('button')).find(node => node.textContent === name)
  if (button === undefined) throw new Error(`missing ${name} button`)
  return button
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="root"></div>'
  host = document.getElementById('root') as HTMLDivElement
  root = createRoot(host)
  customTheme = new CustomThemeController(customScope(), { doc: document })
  activations.length = 0
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, installed: false, repository: '', packageName: '' }),
  })))
})

afterEach(() => {
  act(() => { root.unmount() })
  customTheme.dispose()
  vi.unstubAllGlobals()
})

describe('SkinCenter stage claim (issue #49)', () => {
  it('marks try-on as an activation the user asked for', async () => {
    await renderSkinCenter()

    await click(buttonNamed(cardNamed('Mint'), t('tryOn')))

    expect(activations).toEqual([
      { method: 'tryOn', id: 'mint', options: { userInitiated: true } },
    ])
  })

  it('marks apply as an activation the user asked for', async () => {
    await renderSkinCenter()

    await click(buttonNamed(cardNamed('Mint'), t('apply')))

    expect(activations).toEqual([
      { method: 'switchTo', id: 'mint', options: { userInitiated: true } },
    ])
  })

  it('leaves the stock look unmarked, because it claims nothing', async () => {
    await renderSkinCenter()

    await click(buttonNamed(cardNamed(t('official')), t('restore')))

    expect(activations).toEqual([
      { method: 'switchTo', id: null, options: undefined },
    ])
  })
})
