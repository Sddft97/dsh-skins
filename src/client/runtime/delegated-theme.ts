/**
 * Delegated theme interop: is the plugin that owns a delegated skin's visual
 * actually on this page, and can it give the page back?
 *
 * A delegated skin (src/core/delegated-skins.ts) is selected, persisted and
 * adopted exactly like an asset skin, but this package paints none of it: the
 * delegated plugin mounts its own bundle from its own client chain. Two
 * attributes on the document say what it is doing, and both are its own public
 * contract. This module reads them; it never writes them.
 *
 *   body[data-dsh-claude-style]           the plugin is live: its stylesheet is
 *                                         mounted and its body attributes are
 *                                         stamped. The value is its build id.
 *   body[data-dsh-claude-style-handoff]   the running build watches for an
 *                                         external owner and stands down when
 *                                         one appears. Its PRESENCE is the
 *                                         capability: a build without it
 *                                         cannot yield, so the card must not
 *                                         let the user select this skin and
 *                                         then pick another one over it.
 *
 * Why the capability matters: the two packages repaint the same shell. If this
 * package stamped html[data-dsh-skin] while the peer kept painting, the result
 * is the degraded-glass, double-backdrop-filter page the Wallpaper Engine
 * delegation was built to end. Refusing to offer the row is the honest answer
 * on an old build; the fix belongs in the plugin, not in a skin-center
 * workaround.
 *
 * Attribute-only and read-only, exactly like the wallpaper interop next to it
 * (runtime/external-wallpaper-engine.ts): one MutationObserver over the known
 * attributes, a callback on every flip, and nothing else.
 * @module @linxin666/dsh-client-ui-skin-center/runtime/delegated-theme
 */

/** What one delegated plugin is doing on this page. */
export interface DelegatedThemeState {
  /** True while the plugin stamps its own body attribute (it is live). */
  live: boolean
  /** True while the plugin advertises that it can stand down for an owner. */
  canYield: boolean
}

/** The attributes one delegated plugin owns, as its descriptor names them. */
export interface DelegatedThemeMarkers {
  /** The plugin's own live marker on body. */
  bodyAttr: string
  /** The plugin's handoff-capability marker on body. */
  handoffAttr: string
}

/**
 * Read one delegated plugin's state from the document.
 * @param doc - the document the plugin stamps.
 * @param markers - the two attributes that plugin owns.
 * @returns whether it is live, and whether it can stand down.
 */
export function delegatedThemeState(
  doc: Document,
  markers: DelegatedThemeMarkers,
): DelegatedThemeState {
  const body = doc.body
  if (body === null) return { live: false, canYield: false }
  return {
    live: body.hasAttribute(markers.bodyAttr),
    canYield: body.hasAttribute(markers.handoffAttr),
  }
}

/**
 * Observe one delegated plugin's markers.
 *
 * The callback fires once immediately with the current state, so a page that
 * boots while the plugin is already live never renders a row that claims it is
 * not, then on every flip while the returned teardown is live.
 *
 * @param doc - the document whose body carries the markers.
 * @param markers - the two attributes that plugin owns.
 * @param listener - called with the new state on every change.
 * @returns the idempotent teardown.
 */
export function watchDelegatedTheme(
  doc: Document,
  markers: DelegatedThemeMarkers,
  listener: (state: DelegatedThemeState) => void,
): () => void {
  let last: DelegatedThemeState | null = null
  let stopped = false

  const report = (): void => {
    if (stopped) return
    const next = delegatedThemeState(doc, markers)
    if (last !== null && next.live === last.live && next.canYield === last.canYield) return
    last = next
    listener(next)
  }

  try {
    last = delegatedThemeState(doc, markers)
    listener(last)
  } catch {
    // A detached document (no body yet) leaves the default: not live.
    last = { live: false, canYield: false }
  }

  const win = doc.defaultView
  if (win === null || typeof win.MutationObserver !== 'function') {
    return () => { stopped = true }
  }
  const observer = new win.MutationObserver(report)
  const target = doc.body ?? doc.documentElement
  if (target !== null) {
    observer.observe(target, {
      attributes: true,
      attributeFilter: [markers.bodyAttr, markers.handoffAttr],
    })
  }
  return () => {
    stopped = true
    observer.disconnect()
  }
}
