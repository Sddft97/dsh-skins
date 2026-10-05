/**
 * External Wallpaper Engine plugin interop (issue #39, migration round).
 *
 * The skin center no longer ships a Wallpaper Engine bridge: wallpaper support
 * is delegated to `dsh-plugin-wallpaper-engine`, which owns the WE library,
 * the wallpaper rendering and the theme follows the wallpaper. That plugin
 * signals an active wallpaper on the document itself with the stable
 * `body[data-we-wallpaper]` attribute (it stamps the attribute while a
 * wallpaper renders and removes it when playback stops).
 *
 * While that attribute is present the skin center stands its own visual work
 * down, so the wallpaper owns the backdrop:
 *
 *  - the composer frost follower is not mounted (the wallpaper plugin paints
 *    its own glass, and two fixed `backdrop-filter` stacks sample a shell the
 *    other one relaid);
 *  - the skin manifest's `backgroundMedia` is not painted, so the wallpaper is
 *    never covered by skin art (this replaces the old in-house priority rule);
 *  - the active skin keeps its token remaps and patches, which remain correct
 *    over a wallpaper because every skin already yields its opaque plates to
 *    `body[data-we-wallpaper]` (see the catalog skins and
 *    contracts/semantic-attrs-v1.md).
 *
 * The watcher is attribute-only and read-only: it never writes the other
 * plugin's marker, never mounts a layer of its own, and reports through a
 * plain callback so the two consumers (the skin controller's background-media
 * gate and the scene marker) stay independent.
 * @module @linxin666/dsh-client-ui-skin-center/runtime/external-wallpaper-engine
 */

import { WALLPAPER_EXPECTED_ATTR } from '../../core/wallpaper-handoff.ts'

/**
 * The stable attribute `dsh-plugin-wallpaper-engine` stamps on `body` while a
 * wallpaper is rendering. This is the plugin's public interop contract, the
 * same one other third-party plugins key on.
 */
export const EXTERNAL_WE_ACTIVE_ATTR = 'data-we-wallpaper'

/** The element the attribute is stamped on. */
export const EXTERNAL_WE_ACTIVE_TARGET = 'body'

/** True when the external wallpaper plugin currently renders a wallpaper. */
export function externalWallpaperEngineActive(doc: Document): boolean {
  return doc.body?.hasAttribute(EXTERNAL_WE_ACTIVE_ATTR) === true
}

/**
 * True when the host withheld this document's skin for a PREDICTED wallpaper
 * (issue #51), and no marker has arrived yet to confirm or deny it.
 *
 * This is what closes the second half of the flash. The host can pre-judge the
 * first screen from the peer's persisted selection, but the browser half boots
 * asynchronously: with no stamp in the document it recovers the selection from
 * GET /active and activates it, which is exactly the switch that would paint a
 * frame of skin into the gap the host just left. The prediction is what tells
 * that switch to stand down until the peer's marker speaks.
 *
 * It expires (see {@link releasePrediction}) rather than standing forever: a
 * wallpaper that never renders must not keep the user off their own skin.
 * @param doc - the document the host stamped.
 * @returns true while a prediction is outstanding.
 */
export function externalWallpaperPredicted(doc: Document): boolean {
  return doc.documentElement?.hasAttribute(WALLPAPER_EXPECTED_ATTR) === true
}

/**
 * Drop the host's prediction from the document, so a later read reports none.
 *
 * Called once the peer's marker has answered (either way) or the grace window
 * has closed. The attribute is this package's own - the host half stamped it
 * and no other plugin reads it - so clearing it here only ends this package's
 * own first-screen bookkeeping and never touches the peer's marker.
 * @param doc - the document the host stamped.
 */
export function releasePrediction(doc: Document): void {
  doc.documentElement?.removeAttribute(WALLPAPER_EXPECTED_ATTR)
}

/**
 * Observe the external plugin's active marker.
 *
 * The callback fires once immediately with the current state (so a page that
 * boots with a wallpaper already rendering never paints a frame of skin art
 * first), then on every flip while the returned teardown is live.
 *
 * @param doc - the document whose `body` carries the marker.
 * @param listener - called with the new state on every change.
 * @returns the idempotent teardown.
 */
export function watchExternalWallpaperEngine(
  doc: Document,
  listener: (active: boolean) => void,
): () => void {
  let last = false
  let stopped = false

  const read = (): boolean => externalWallpaperEngineActive(doc)

  const report = (): void => {
    if (stopped) return
    const next = read()
    if (next === last) return
    last = next
    listener(next)
  }

  // Wrapped in a try/catch by construction: an unknown attribute at boot is
  // simply "not active", never an error path.
  try {
    last = read()
    listener(last)
  } catch {
    // An unreadable body (a detached document) leaves the default: inactive.
  }

  const win = doc.defaultView
  if (win === null || typeof win.MutationObserver !== 'function') {
    return () => { stopped = true }
  }
  const observer = new win.MutationObserver(report)
  observer.observe(doc.body ?? doc.documentElement, {
    attributes: true,
    attributeFilter: [EXTERNAL_WE_ACTIVE_ATTR],
  })
  return () => {
    stopped = true
    observer.disconnect()
  }
}
