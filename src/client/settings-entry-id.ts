/**
 * Which profile entry row the skin center's settings form is bound to.
 *
 * 0.1.7 addresses configuration as one form per profile entry id, and this
 * package can be installed under two different rows: the family aggregate's
 * generated `web-ui-skin-center` row, or its own standalone bundle row
 * `ui-skin-center` (cordis.patch.yml, and the `name` the plugin exports).
 * `ctx.configForms` carries no package identity, so the only authority on which
 * row is live is the served-namespace list in the shared describe mirror.
 *
 * Issue #1769 / dsh-skins#17:
 * Under an aggregate install (@linxin666/dsh-web-all), freezing an entry id
 * before the describe mirror answers resulted in binding to 'ui-skin-center',
 * which does not exist in an aggregate profile. The Host answers
 * 'No configurable plugin entry "ui-skin-center"' and settings mutations fail.
 *
 * Deferred binding avoids guessing a row while the mirror is unready: the form
 * reports 'unavailable' and prevents writes until the mirror answers, and then
 * binds the row the Host actually serves.
 *
 * @module @linxin666/dsh-client-ui-skin-center/settings-entry-id
 */
import type { ConfigForm, ConfigFormSnapshot, ConfigForms } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Profile entry id the family aggregate's generated row carries. */
const AGGREGATE_ENTRY_ID = 'web-ui-skin-center'

/**
 * This package's own declared plugin name, which is also the entry id its
 * standalone bundle patch row carries (cordis.patch.yml) and the `name` the
 * plugin exports (src/index.ts).
 */
const OWN_ENTRY_ID = 'ui-skin-center'

/**
 * Profile entry ids this package's rows can be served under: its own standalone
 * row, the family aggregate's generated row, and the legacy background
 * namespace a profile that named the row after it still serves. The served
 * mirror decides which one is real; this list only ranks the candidates.
 */
const SKIN_CENTER_ENTRY_IDS: readonly string[] = [OWN_ENTRY_ID, AGGREGATE_ENTRY_ID, 'skin-background']

/**
 * The entry id of the first skin-center row the Host says it serves, or `null`
 * when the mirror cannot say. `null` means "unknown", never "none": the mirror
 * is asynchronous, so an unreadable snapshot is a pre-boot window, not proof
 * that this package is absent.
 * @param forms - the shared configuration forms service.
 * @param candidates - entry ids to look for, in preference order.
 * @returns the served entry id, or `null` when the mirror cannot answer.
 */
export function servedEntryId(forms: ConfigForms, candidates: readonly string[] = SKIN_CENTER_ENTRY_IDS): string | null {
  let served: readonly string[] | undefined
  try {
    served = forms.describe().getSnapshot().view?.namespaces.map(view => view.ns)
  } catch {
    served = undefined
  }
  if (served === undefined) return null
  return candidates.find(id => served.includes(id)) ?? null
}

/**
 * The entry id to bind, which is this package's OWN row whenever the mirror
 * cannot name a skin-center row.
 *
 * @deprecated Prefer {@link boundConfigForm} which performs deferred binding
 * and avoids guessing rows that do not exist under aggregate installs.
 * @param forms - the shared configuration forms service.
 * @returns the entry id whose form the plugin should address.
 */
export function boundEntryId(forms: ConfigForms): string {
  return servedEntryId(forms) ?? OWN_ENTRY_ID
}

/**
 * Snapshot for a form whose entry is unserved or whose describe mirror has
 * not yet answered.
 */
function unavailableSnapshot<T>(): ConfigFormSnapshot<T> {
  return {
    status: 'unavailable',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'host',
  }
}

/**
 * A deferred ConfigForm that binds the row actually served once the describe
 * mirror answers, and degrades to 'unavailable' without issuing silent writes to
 * guessed entry ids while the mirror is unready or absent.
 *
 * @param forms - the shared configuration forms service.
 * @param candidates - candidate entry ids in preference order.
 * @returns a ConfigForm delegating to the resolved entry's form.
 */
export function boundConfigForm<T>(
  forms: ConfigForms,
  candidates: readonly string[] = SKIN_CENTER_ENTRY_IDS,
): ConfigForm<T> {
  const listeners = new Set<() => void>()
  let bound: ConfigForm<T> | undefined
  let boundId: string | undefined
  let offBound: (() => void) | undefined
  let subscribedToMirror = false
  // Re-entrancy guard: getSnapshot() lazily binds, bind() publishes, and a
  // listener that reads the form while the mirror is still unanswered would
  // otherwise re-enter bind() -> publish() -> getSnapshot() until the stack
  // overflows (the apply then throws and the whole web boot fails).
  let binding = false

  const resolve = (): string | null => {
    return servedEntryId(forms, candidates)
  }

  const publish = (): void => {
    for (const listener of [...listeners]) {
      listener()
    }
  }

  const bind = (): void => {
    if (binding) return
    binding = true
    try {
      ensureMirrorSubscription()
      const target = resolve()
      if (target === boundId) return
      offBound?.()
      offBound = undefined
      if (target === null) {
        // Unbinding is a change only when something was bound; an unanswered
        // mirror leaving the form unbound must not publish (the publish would
        // re-enter this bind through any listener reading the form).
        const hadBinding = bound !== undefined
        boundId = undefined
        bound = undefined
        if (hadBinding) publish()
        return
      }
      let form: ConfigForm<T>
      try {
        form = forms.get<T>(target)
      } catch {
        const hadBinding = bound !== undefined
        boundId = undefined
        bound = undefined
        if (hadBinding) publish()
        return
      }
      boundId = target
      bound = form
      offBound = form.subscribe(() => { publish() })
      publish()
    } finally {
      binding = false
    }
  }

  const ensureMirrorSubscription = (): void => {
    if (subscribedToMirror) return
    try {
      const describeFace = forms.describe()
      if (typeof describeFace?.subscribe === 'function') {
        describeFace.subscribe(() => { bind() })
        subscribedToMirror = true
      }
      if (typeof describeFace?.ensure === 'function') {
        void describeFace.ensure()
      }
    } catch {
      // Mirror not ready or does not support subscribe
    }
  }

  bind()

  return {
    getSnapshot: () => {
      if (bound === undefined) {
        bind()
      }
      return bound?.getSnapshot() ?? unavailableSnapshot<T>()
    },
    subscribe: (listener) => {
      ensureMirrorSubscription()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (field, value) => {
      if (bound === undefined) {
        bind()
      }
      return bound?.set(field, value) ?? Promise.resolve(false)
    },
    unset: (field) => {
      if (bound === undefined) {
        bind()
      }
      return bound?.unset(field) ?? Promise.resolve(false)
    },
    mutate: (ops, expectedRevision) => {
      if (bound === undefined) {
        bind()
      }
      return bound?.mutate(ops, expectedRevision) ?? Promise.resolve(false)
    },
  }
}
