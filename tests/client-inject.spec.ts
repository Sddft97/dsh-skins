/**
 * The skin-center client plugin's Cordis contract (regression guard).
 *
 * The card used to require the `remote.directoryPicker` namespace for its
 * Wallpaper Engine bridge's folder browser. That bridge is gone (issue #39):
 * wallpaper configuration belongs to `dsh-plugin-wallpaper-engine`, which
 * owns its own pickers. These tests pin that the inject list no longer names
 * the picker — naming it would park the card on hosts that serve no picker —
 * while still declaring the four services the card genuinely uses.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { inject } from '../src/client/index.ts'

class RemoteService extends Service {
  constructor(ctx: Context) { super(ctx, 'remote') }
}

/** The stub service tree the client plugin declares. */
const STUB_SERVICES: Record<string, unknown> = {
  slots: { inject: () => () => {}, register: () => () => {} },
  locale: { bind: () => (key: string) => key, register: () => () => {} },
  theme: {
    getTheme: () => ({ active: { colorScheme: 'dark' } }),
    subscribe: () => () => {},
    setTheme: () => {},
  },
  configForms: {
    describe: () => ({ getSnapshot: () => ({ view: { namespaces: [] } }) }),
    get: () => ({
      getSnapshot: () => ({ status: 'ready', value: {}, revision: 0 }),
      subscribe: () => () => {},
      set: async () => true,
      mutate: async () => true,
    }),
  },
}

/** Mount the declared services and run one consumer plugin, with no picker. */
async function withoutPickerTopology(run: (ctx: Context) => void): Promise<void> {
  const root = new Context()
  await root.plugin({
    name: 'stubs',
    apply(ctx) {
      new RemoteService(ctx)
      for (const [name, value] of Object.entries(STUB_SERVICES)) ctx.provide(name, value as never)
    },
  })
  const consumer = root.plugin({ name: 'skin-center', inject: [...inject], apply: run })
  await consumer
  await new Promise(resolve => setTimeout(resolve, 30))
}

describe('skin-center client injects only the services it uses', () => {
  it('does not require the directory picker the wallpaper bridge used', () => {
    // Given the plugin's declared required services
    // When the declaration is read
    // Then the picker namespace is absent: the folder browser left with the
    // built-in bridge, and naming a namespace the host may not serve would
    // park the whole card waiting for it
    expect(inject).not.toContain('remote.directoryPicker')
    expect(inject).not.toContain('remote')
    expect(inject).not.toContain('connection')
  })

  it('declares the four services the card actually uses', () => {
    // Given the plugin's declared required services
    // When the declaration is read
    // Then slots (the settings section), locale (its copy), theme (the
    // preview toggle) and configForms (its preference sections) are named
    expect([...inject].sort()).toEqual(['configForms', 'locale', 'slots', 'theme'])
  })

  it('mounts on a host that serves no picker at all', async () => {
    // Given a host whose only services are the four the card needs
    let applied = false
    let failure: string | null = null

    // When the plugin is mounted
    await withoutPickerTopology(() => { applied = true }).catch((error: unknown) => {
      failure = error instanceof Error ? error.message : String(error)
    })

    // Then it applies instead of parking or throwing
    expect(failure).toBeNull()
    expect(applied).toBe(true)
  })
})
