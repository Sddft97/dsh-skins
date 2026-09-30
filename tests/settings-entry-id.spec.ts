/**
 * Which profile entry row the skin center binds its settings form to.
 *
 * 0.1.7 addresses configuration as one form per profile entry id, and this
 * package can be installed under two different rows: the family aggregate's
 * generated `web-ui-skin-center` row, or its own standalone bundle row
 * `ui-skin-center` (cordis.patch.yml, and the `name` the plugin exports). The
 * shared forms service carries no package identity, so the only authority on
 * which row is live is the served-namespace list in the describe mirror.
 *
 * Issue #1769 / dsh-skins#17:
 * Under an aggregate install (@linxin666/dsh-web-all), freezing an entry id
 * before the describe mirror answers resulted in binding to 'ui-skin-center',
 * an entry that does not exist in an aggregate profile. The Host answers
 * 'No configurable plugin entry "ui-skin-center"' and settings mutations fail.
 *
 * Deferred binding avoids freezing a guess: until the describe mirror answers,
 * the form degrades to 'unavailable' without issuing silent writes to guessed rows.
 * Once the mirror answers, it binds the row the Host actually serves.
 */
import type { ConfigForm, ConfigForms } from '@deepseek-ai/dsh-client-ui-settings/client'
import { describe, expect, it, vi } from 'vitest'

import * as settingsEntryIdModule from '../src/client/settings-entry-id.ts'
import { servedEntryId } from '../src/client/settings-entry-id.ts'

const bindConfigForm = (settingsEntryIdModule as { boundConfigForm?: typeof import('../src/client/settings-entry-id.ts').boundConfigForm }).boundConfigForm
  ?? ((forms: ConfigForms) => forms.get((settingsEntryIdModule as unknown as { boundEntryId: (f: ConfigForms) => string }).boundEntryId(forms)))

/** Entry id the aggregate's generated row carries. */
const AGGREGATE_ENTRY_ID = 'web-ui-skin-center'

/** Entry id this package's own standalone bundle row carries. */
const OWN_ENTRY_ID = 'ui-skin-center'

/**
 * A `configForms` stub that records which entry id was asked for, records mutations,
 * and answers `describe()` from the namespace list a Host would serve. `served: null`
 * models the pre-boot window in which the mirror has no view yet.
 */
function fakeForms(initialServed: readonly string[] | null) {
  const requested: string[] = []
  const mutations: Array<{ entryId: string; ops: unknown }> = []
  let served = initialServed
  const describeListeners = new Set<() => void>()
  const formListeners = new Map<string, Set<() => void>>()

  const form = (entryId: string): ConfigForm<unknown> => ({
    getSnapshot: () => ({
      status: 'ready' as const,
      value: { entryId },
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: (listener: () => void) => {
      if (!formListeners.has(entryId)) formListeners.set(entryId, new Set())
      formListeners.get(entryId)!.add(listener)
      return () => { formListeners.get(entryId)?.delete(listener) }
    },
    set: async (field: string, value: unknown) => {
      mutations.push({ entryId, ops: [{ op: 'set', field, value }] })
      return true
    },
    unset: async (field: string) => {
      mutations.push({ entryId, ops: [{ op: 'unset', field }] })
      return true
    },
    mutate: async (ops: readonly unknown[]) => {
      mutations.push({ entryId, ops })
      return true
    },
  })

  const forms = {
    describe: () => ({
      getSnapshot: () => ({
        status: (served === null ? 'loading' : 'ready') as 'loading' | 'ready',
        view: served === null ? undefined : { namespaces: served.map(ns => ({ ns })) },
        error: null,
      }),
      subscribe: (listener: () => void) => {
        describeListeners.add(listener)
        return () => { describeListeners.delete(listener) }
      },
      ensure: async () => {},
    }),
    get: (entryId: string) => {
      requested.push(entryId)
      return form(entryId)
    },
  } as unknown as ConfigForms

  const answerMirror = (nextServed: readonly string[]) => {
    served = nextServed
    for (const listener of [...describeListeners]) listener()
  }

  return { forms, requested, mutations, answerMirror }
}

describe('the skin center binds the entry row the Host actually serves', () => {
  it('binds the standalone row when that is the row in the profile', async () => {
    // Given a standalone install, where the profile carries only this package's own row
    const { forms, requested, mutations } = fakeForms([OWN_ENTRY_ID])

    // When the form is bound and used
    const form = bindConfigForm(forms)

    // Then the standalone row is addressed
    expect(requested).toEqual([OWN_ENTRY_ID])
    expect(form.getSnapshot().status).toBe('ready')
    const accepted = await form.mutate([{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }])
    expect(accepted).toBe(true)
    expect(mutations).toEqual([
      { entryId: OWN_ENTRY_ID, ops: [{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }] },
    ])
  })

  it('binds the aggregate row when the family aggregate serves it', async () => {
    // Given the family aggregate install, whose generated row is served
    const { forms, requested, mutations } = fakeForms([AGGREGATE_ENTRY_ID])

    // When the form is bound and used
    const form = bindConfigForm(forms)

    // Then the aggregate row is addressed
    expect(requested).toEqual([AGGREGATE_ENTRY_ID])
    expect(form.getSnapshot().status).toBe('ready')
    const accepted = await form.mutate([{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }])
    expect(accepted).toBe(true)
    expect(mutations).toEqual([
      { entryId: AGGREGATE_ENTRY_ID, ops: [{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }] },
    ])
  })

  it('degrades to unavailable and does not write to a guessed row when mirror is unanswered', async () => {
    // Given a describe mirror that is not readable yet (unanswered mirror)
    const { forms, requested, mutations } = fakeForms(null)

    // When the form is bound before the mirror has landed
    const form = bindConfigForm(forms)

    // Then it must NOT guess any row or address unserved rows
    expect(requested).toEqual([])
    expect(form.getSnapshot().status).toBe('unavailable')

    // And mutations fail closed rather than writing to a guessed entry id
    const accepted = await form.mutate([{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }])
    expect(accepted).toBe(false)
    expect(mutations).toEqual([])
  })

  it('promotes to the aggregate row once the mirror answers (#1769)', async () => {
    // Given a deployment where mirror is unanswered at initial bind time
    const { forms, requested, mutations, answerMirror } = fakeForms(null)
    const form = bindConfigForm(forms)
    expect(requested).toEqual([])
    expect(form.getSnapshot().status).toBe('unavailable')

    // When the mirror answers with the aggregate row
    answerMirror([AGGREGATE_ENTRY_ID])

    // Then the form binds the aggregate row and mutation succeeds on it
    expect(requested).toEqual([AGGREGATE_ENTRY_ID])
    expect(form.getSnapshot().status).toBe('ready')
    const accepted = await form.mutate([{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '456' }])
    expect(accepted).toBe(true)
    expect(mutations).toEqual([
      { entryId: AGGREGATE_ENTRY_ID, ops: [{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '456' }] },
    ])
  })

  it('notifies subscribers when the mirror answers and promotes the form', () => {
    // Given an unanswered mirror
    const { forms, answerMirror } = fakeForms(null)
    const form = bindConfigForm(forms)
    const listener = vi.fn()
    form.subscribe(listener)
    expect(listener).not.toHaveBeenCalled()

    // When the mirror answers
    answerMirror([AGGREGATE_ENTRY_ID])

    // Then subscribers are notified of the promotion
    expect(listener).toHaveBeenCalled()
  })

  it('does not recurse when a subscriber reads the form while the mirror is unanswered', () => {
    // Given an unanswered mirror and a subscriber that reads the form from
    // inside its notification (the boot reconcile loop does exactly this)
    const { forms } = fakeForms(null)
    const form = bindConfigForm(forms)
    const listener = vi.fn(() => { form.getSnapshot() })
    form.subscribe(listener)

    // When the form is read, lazily binding while the mirror is unanswered,
    // Then the read completes instead of recursing bind -> publish -> read
    // until the stack overflows (which failed the plugin's apply on boot)
    expect(() => form.getSnapshot()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })

  it('reports an unknown entry id when the mirror cannot answer', () => {
    // Given an unreadable mirror
    const { forms } = fakeForms(null)

    // When the served row is asked for directly
    const served = servedEntryId(forms)

    // Then it is reported as unknown rather than guessed
    expect(served).toBeNull()
  })

  it('handles a mirror whose describe throws without unhandled crash', () => {
    // Given a mirror that throws on describe
    const throwingForms = {
      describe: () => { throw new Error('mirror unavailable') },
      get: (id: string) => ({
        getSnapshot: () => ({ status: 'ready', value: { id }, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }),
        subscribe: () => () => {},
        set: async () => true,
        unset: async () => true,
        mutate: async () => true,
      }),
    } as unknown as ConfigForms

    const form = bindConfigForm(throwingForms)
    expect(form.getSnapshot().status).toBe('unavailable')
    expect(servedEntryId(throwingForms)).toBeNull()
  })

  it('prefers the standalone row when a profile serves both', () => {
    // Given a profile that serves both rows
    const { forms, requested } = fakeForms([AGGREGATE_ENTRY_ID, OWN_ENTRY_ID])

    bindConfigForm(forms)

    expect(requested).toEqual([OWN_ENTRY_ID])
  })

  it('degrades to unavailable when a profile serves neither row', async () => {
    // Given a deployment that serves no skin-center row at all
    const { forms, requested, mutations } = fakeForms(['some-other-plugin'])

    const form = bindConfigForm(forms)

    expect(requested).toEqual([])
    expect(form.getSnapshot().status).toBe('unavailable')
    const accepted = await form.mutate([{ op: 'set', path: ['skin-wallpaper', 'selection'], value: '123' }])
    expect(accepted).toBe(false)
    expect(mutations).toEqual([])
  })

  it('still resolves the legacy background namespace when only that is served', () => {
    // Given a profile that named the row after the legacy background namespace
    const { forms, requested } = fakeForms(['skin-background'])

    bindConfigForm(forms)

    expect(requested).toEqual(['skin-background'])
  })
})
