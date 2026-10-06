/**
 * Skin runtime controller (issue #506, contract section 8) — the browser
 * switch engine. One switch is one NEW activation identity:
 *
 *   switchTo(id):
 *     1. seq = ++latestRequest          (latest-request-wins)
 *     2. activation = ledger.beginActivation()
 *     3. fetch stylesheet (+ patches)   (already scoped + whitelisted host-side)
 *     4. install <style> tags, background media, hooks (all ledger-recorded)
 *     5. if seq is stale -> dispose this activation and bail
 *     6. flip html[data-dsh-skin]       (the atomic visual cut)
 *     7. dispose the previous activation
 *     8. persist the selection
 *
 * Every step before the flip is discardable; a stale or failed switch leaves
 * the previous skin fully intact. hooks import/apply errors are caught: the
 * static part (stylesheet, media) stays active — the escape hatch can never
 * take the skin down with it.
 *
 * lifecycleScope split: the ledger tracks activation scope; the catalog
 * snapshot, the decoration layer elements and the persisted selection are
 * component scope and survive every switch.
 *
 * One activation is an exception to "an external owner always wins": the one
 * the user just asked for (issue #49). It paints once even while
 * `suppressSkin()` reports another owner, because the public
 * `html[data-dsh-skin]` stamp IS the signal that owner keys its hand-back on.
 * The claim is bounded and one-shot - see {@link USER_INITIATED_YIELD_GRACE_MS}.
 * @module @linxin666/dsh-client-ui-skin-center/runtime/skin-controller
 */

import type { EffectLedger } from './effect-ledger.ts'
import { buildBackgroundMedia, clearLayer, ensureDecorationLayers } from './decoration-layers.ts'
import type { DecorationLayers } from './decoration-layers.ts'
import { setSceneBackdropActive } from './backdrop-scene.ts'

/**
 * The delegated-plugin payload a delegated skin's catalog row carries.
 *
 * It is the whole of what the controller needs: the entry is recognized as a
 * delegated skin by this field existing. Everything else on it is card copy and
 * install wiring, and the controller reads none of it.
 */
export interface DelegatedSkinPayload {
  /** npm package spec the card installs through the plugin manager. */
  package: string
  /** Upstream repository (docs, issues, changelog). */
  repository: string
  /** The attribute the delegated plugin stamps on body while it owns the page. */
  bodyAttr: string
  /** The attribute it stamps while it can hand the page back (capability). */
  handoffAttr: string
  /** Whether the delegated package is installed in this profile. */
  installed: boolean
}

/** Catalog entry shape the controller needs (mirrors the v2 catalog route). */
export interface ControllerSkinEntry {
  manifest: {
    id: string
    /**
     * Absent for a delegated skin: that plugin owns the stylesheet, the
     * background and the visual, so this package loads none of them.
     */
    contributes?: {
      stylesheet: string
      patches?: string
      backgroundMedia?: {
        light?: { type: 'image' | 'video'; src: string; scrim?: string }
        dark?: { type: 'image' | 'video'; src: string; scrim?: string }
      }
    }
    /** Present exactly for a delegated skin; absent for every asset skin. */
    delegated?: DelegatedSkinPayload
    facets?: { client?: { entry: string; apiVersion: string } }
  }
}

/**
 * Whether this entry's visual belongs to a delegated plugin.
 *
 * A delegated skin is a real selection, not a stand-down: it is persisted,
 * adopted on boot, and shown as the active row. What it never does is paint.
 * @param entry - a catalog entry, or null.
 * @returns true when the entry is a delegated skin.
 */
export function isDelegatedEntry(entry: ControllerSkinEntry | null): boolean {
  return entry?.manifest.delegated !== undefined
}

export interface SkinControllerDeps {
  doc: Document
  ledger: EffectLedger
  /** Same-origin base of the v2 API (default /api/skin-center/v2). */
  apiBase?: string
  /** fetch injection for tests. */
  fetchImpl?: typeof fetch
  /** Persist the selection (POST /active by default). */
  persist?: (id: string | null) => Promise<void>
  /** Current light/dark theme (defaults to body[data-ds-dark-theme]). */
  themeGet?: () => 'light' | 'dark'
  /**
   * Theme-change subscription. The default observes the official
   * body[data-ds-dark-theme] attribute (the same ground truth v1 skins
   * used), so hooks get live theme flips out of the box.
   */
  themeSubscribe?: (listener: (theme: 'light' | 'dark') => void) => () => void
  /**
   * Stylesheet loader seam. Default installs a <link rel="stylesheet"> and
   * awaits its load (relative url() inside the served CSS resolves against
   * the route URL — inlining into <style> would break asset resolution).
   */
  loadStylesheet?: (href: string) => Promise<void>
  /** hooks.mjs dynamic import seam for tests. */
  importHooks?: (url: string) => Promise<unknown>
  /**
   * External stand-down (issue #39): when this returns true another plugin
   * owns the whole visual — the delegated `dsh-plugin-wallpaper-engine` is
   * rendering a wallpaper — and a skin must not be painted at all, because
   * that plugin rewrites the same shell and paints its own glass.
   *
   * The user's chosen skin is still remembered (and still persisted when they
   * apply one), so it returns untouched the moment the wallpaper stops; only
   * the painting is withheld. Re-evaluated on every activation and on
   * refresh().
   */
  suppressSkin?: () => boolean
  /** Diagnostics sink (switch failures, hook errors). */
  onError?: (message: string, error: unknown) => void
}

/**
 * How long a user-initiated activation may hold the stage while another
 * plugin still owns the visual (issue #49).
 *
 * The claim exists to make the request VISIBLE on the public
 * `html[data-dsh-skin]` stamp, not to compete for the backdrop. The hand-back
 * itself is DOM-level (the other plugin observes that stamp and clears its
 * own), so this window only has to cover that round trip; when it expires
 * without a hand-back the activation withdraws and the remembered selection
 * repaints the moment that owner stops.
 */
export const USER_INITIATED_YIELD_GRACE_MS = 1500

/** Per-activation options the card threads down from its own controls. */
export interface SkinActivationOptions {
  /**
   * True when the user just asked for this activation from the card (try-on,
   * apply, or re-apply of the skin already on). Such an activation CLAIMS THE
   * STAGE: it paints once even while {@link SkinControllerDeps.suppressSkin}
   * reports another owner, so `html[data-dsh-skin]` flips and that owner can
   * give the page back (issue #49).
   *
   * The claim is one-shot and bounded (it withdraws after
   * {@link USER_INITIATED_YIELD_GRACE_MS}), and it means nothing for the stock
   * look: a withheld stock preview has nothing to paint, so it keeps
   * reporting itself as stood down.
   */
  userInitiated?: boolean
}

/**
 * How one activation treats the persisted selection (issue #54).
 *
 * - `commit` - the user chose this in the card: it becomes the committed
 *   selection AND is POSTed, so every other client follows.
 * - `preview` - a try-on (or an internal re-paint): the committed selection is
 *   untouched and nothing is written.
 * - `adopt` - this page is mirroring a selection ANOTHER client already
 *   persisted (boot recovery, the persisted-selection follower). It becomes
 *   this page's committed selection so try-on restores it and the poll sees it
 *   as applied, but it is never written back: a reader that writes can
 *   overwrite a newer choice the other client has since made.
 */
export type SkinActivationMode = 'commit' | 'preview' | 'adopt'

export interface SkinControllerState {
  /** The currently applied skin (null = stock look). */
  active: string | null
  /**
   * True while a skin is selected but withheld because another plugin owns the
   * visual (see {@link SkinControllerDeps.suppressSkin}). The selection is
   * intact and repaints as soon as that plugin stops.
   */
  stoodDown: boolean
  /** The previewed skin id (null = the stock look is being previewed). */
  trying: string | null
  /** Whether a try-on preview is live (distinguishes previewing the stock
   *  look from having no preview). */
  previewing: boolean
}

export interface SkinController {
  /** Current applied skin id (null = stock look). */
  readonly active: string | null
  /** The fixed decoration layer handles (component scope). */
  readonly layers: DecorationLayers
  /**
   * Switch to a skin (or null for stock). Latest request wins; resolves to
   * the id that is actually active after this call settles (which may be a
   * newer one if a later switch superseded it).
   */
  switchTo(id: string | null, entry: ControllerSkinEntry | null, options?: SkinActivationOptions): Promise<string | null>
  /**
   * Preview a skin without persisting it. The committed skin is remembered;
   * exitTryOn() restores it. Try-on of the stock look passes null.
   */
  tryOn(id: string | null, entry: ControllerSkinEntry | null, options?: SkinActivationOptions): Promise<string | null>
  /**
   * Adopt a selection another client already persisted, without writing it
   * back (issue #54). The activation is a COMMIT - the selection becomes the
   * committed one try-on restores and a later poll sees it as applied - but
   * the value is not POSTed, because this page did not choose it. The two
   * reader paths (boot recovery and the persisted-selection follower) use
   * this: they mirror another client's choice, and mirroring must never
   * overwrite a newer choice that client has since made.
   */
  adopt(id: string | null, entry: ControllerSkinEntry | null, options?: SkinActivationOptions): Promise<string | null>
  /** Leave the preview, restoring the committed skin. */
  exitTryOn(): Promise<string | null>
  /** React-friendly store: subscribe + snapshot of {active, trying}. */
  subscribe(listener: () => void): () => void
  getState(): SkinControllerState
  /**
   * Re-apply the current committed skin without persisting (e.g. the
   * wallpaper bridge just toggled, flipping background-media priority).
   * A full fresh activation — latest-request-wins keeps it race-safe.
   */
  refresh(): Promise<string | null>
  /**
   * True while a switch (including the boot recovery that reads the persisted
   * selection) is in flight. A page that recovers its selection asynchronously
   * must be allowed to finish before any follower converges on a selection,
   * or the late convergence supersedes the in-flight activation and the boot
   * switch is discarded as stale (issue #1805).
   */
  isSwitching(): boolean
  /** Dispose the current activation (e.g. on plugin teardown). */
  shutdown(): void
}

interface HooksModule {
  default?: () => { apply(ctx: unknown): void; dispose?: () => void }
}

export function createSkinController(deps: SkinControllerDeps): SkinController {
  const doc = deps.doc
  const ledger = deps.ledger
  const apiBase = deps.apiBase ?? '/api/skin-center/v2'
  const fetchImpl = deps.fetchImpl ?? fetch.bind(doc.defaultView)
  const layers = ensureDecorationLayers(doc)
  const onError = deps.onError ?? (() => {})

  const themeGet = deps.themeGet ?? (() =>
    (doc.body?.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'))
  const themeSubscribe = deps.themeSubscribe ?? ((listener) => {
    let last = themeGet()
    const observer = new doc.defaultView!.MutationObserver(() => {
      const next = themeGet()
      if (next !== last) {
        last = next
        listener(next)
      }
    })
    if (doc.body) observer.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  })
  /**
   * Re-paint the current activation's background media for the live
   * light/dark theme (the controller owns the layer, so a theme flip must
   * swap the variant the same way an activation does). No-op when there is
   * nothing painted or the manifest carries no backgroundMedia.
   */
  function repaintBackgroundForTheme(): void {
    if (active === null || currentActivation === null || lastEntry === null) return
    // A withheld skin has no paint to repaint (issue #39).
    if (stoodDown) return
    const media = lastEntry.manifest.contributes?.backgroundMedia
    if (!media) return
    const variant = themeGet() === 'dark' ? (media.dark ?? media.light) : (media.light ?? media.dark)
    if (!variant) return
    const assetBase = `${apiBase}/skins/${lastEntry.manifest.id}`
    setBackgroundLayer(currentActivation, buildBackgroundMedia(doc, variant, assetBase))
  }
  const unsubscribeTheme = themeSubscribe(() => repaintBackgroundForTheme())
  const loadStylesheet = deps.loadStylesheet ?? ((href: string) => new Promise<void>((resolveLink, rejectLink) => {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    const timer = setTimeout(() => rejectLink(new Error(`stylesheet load timeout: ${href}`)), 15000)
    link.onload = () => { clearTimeout(timer); resolveLink() }
    link.onerror = () => { clearTimeout(timer); rejectLink(new Error(`stylesheet load failed: ${href}`)) }
    doc.head.appendChild(link)
  }))

  let latestRequest = 0
  /**
   * True from the moment a switch begins until the newest switch settles. A
   * page that recovers its selection asynchronously (the desktop client boots
   * without the tapIndex stamp) has an activation in flight while other
   * subsystems start publishing, and an external verdict flip read during that
   * window is replayed after it settles instead of racing it (issue #1805).
   */
  let switching = false
  /** An external verdict flip observed while a switch was in flight. */
  let refreshQueued = false
  let currentActivation: number | null = null
  const initialSkinId = doc.documentElement?.getAttribute('data-dsh-skin') || null
  let active: string | null = initialSkinId
  /** The committed selection try-on restores (component scope). */
  let committed: { id: string | null; entry: ControllerSkinEntry | null } = { id: initialSkinId, entry: null }
  /** Last non-null applied entry, so refresh() can re-activate it. */
  let lastEntry: ControllerSkinEntry | null = null
  /** Last evaluated stand-down verdict (refresh() skips no-ops). */
  let lastSuppressed: boolean | null = deps.suppressSkin?.() === true
  let trying: string | null = null
  let previewing = false
  const listeners = new Set<() => void>()
  // React's useSyncExternalStore requires a CACHED snapshot: getSnapshot must
  // return the same reference until the state actually changes, or the store
  // consumer loops forever (and the settings card crashes blank).
  let stoodDown = lastSuppressed === true
  let stateSnapshot: SkinControllerState = { active: initialSkinId, stoodDown, trying: null, previewing: false }
  const emit = (): void => {
    stateSnapshot = { active, stoodDown, trying, previewing }
    for (const listener of listeners) listener()
  }

  /**
   * Install one stylesheet as a tracked <link> (the load itself happened in
   * loadStylesheet; here we only register the teardown). Links keep relative
   * url() resolution intact — a <style> tag would resolve them against the
   * document and 404 every skin asset.
   */
  function trackStylesheet(activation: number, label: string, href: string): void {
    const link = doc.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`)
    ledger.record(activation, `style:${label}`, () => link?.remove())
  }

  /**
   * Paint the skin background art into the `background` decoration layer
   * (z-index:-2) with a snapshot for the activation ledger. Only the CURRENT
   * activation may restore: when an older activation is disposed after a
   * newer one already re-painted the layer, restoring its snapshot would
   * clobber the newer paint.
   *
   * Two reasons the art lives in the layer, not on `document.body`:
   *  - Chromium's backdrop-filter does not sample the canvas/body background,
   *    so the skin-center blur layer (z-index:-1) could never blur body-painted
   *    art (issue #732 defect A). A real fixed element IS sampled, so after
   *    this change the same blur + scrim controls work on the skin backdrop
   *    just like they already do on the Wallpaper Engine layers (issue #777).
   *  - dragon-heir hooks expect the art in ctx.layers.background (they swap
   *    the painted img and apply the v1 filter lift); the layer is the v2
   *    contract and body painting was a leftover half-migration.
   * The body's own opaque background is forced transparent while art is
   * mounted, or the shell's static panels would cover the negative-z layer.
   */
  function setBackgroundLayer(activation: number, nodes: HTMLElement[]): void {
    const style = doc.body.style
    const previousBackgroundColor = style.getPropertyValue('background-color')
    const previousBackgroundImage = style.getPropertyValue('background-image')
    const restore = (): void => {
      if (currentActivation !== activation) return
      clearLayer(layers.background)
      setSceneBackdropActive(doc, 'skin', false)
      if (previousBackgroundColor === '') style.removeProperty('background-color')
      else style.setProperty('background-color', previousBackgroundColor)
      if (previousBackgroundImage === '') style.removeProperty('background-image')
      else style.setProperty('background-image', previousBackgroundImage)
    }
    clearLayer(layers.background)
    if (nodes.length > 0) {
      for (const node of nodes) layers.background.appendChild(node)
      style.setProperty('background-color', 'transparent')
      style.setProperty('background-image', 'none')
      setSceneBackdropActive(doc, 'skin', true)
    } else {
      setSceneBackdropActive(doc, 'skin', false)
      if (previousBackgroundColor === '') style.removeProperty('background-color')
      else style.setProperty('background-color', previousBackgroundColor)
      if (previousBackgroundImage === '') style.removeProperty('background-image')
      else style.setProperty('background-image', previousBackgroundImage)
    }
    ledger.record(activation, 'background:layer', restore)
  }

  function installBackground(
    activation: number,
    entry: ControllerSkinEntry,
  ): void {
    const media = entry.manifest.contributes?.backgroundMedia
    if (!media) {
      setBackgroundLayer(activation, [])
      return
    }
    // An external owner (the delegated wallpaper plugin) withholds the whole
    // skin, background media included, before this is reached (see
    // switchInternal); nothing to arbitrate here.
    const variant = themeGet() === 'dark' ? (media.dark ?? media.light) : (media.light ?? media.dark)
    if (!variant) {
      setBackgroundLayer(activation, [])
      return
    }
    const assetBase = `${apiBase}/skins/${entry.manifest.id}`
    setBackgroundLayer(activation, buildBackgroundMedia(doc, variant, assetBase))
  }

  async function installHooks(activation: number, entry: ControllerSkinEntry): Promise<void> {
    const facet = entry.manifest.facets?.client
    if (!facet) return
    const importHooks = deps.importHooks ?? ((url: string) => import(/* @vite-ignore */ url))
    try {
      const mod = (await importHooks(`${apiBase}/skins/${entry.manifest.id}/hooks.mjs`)) as HooksModule
      const factory = mod?.default
      if (typeof factory !== 'function') throw new Error('hooks.mjs must default-export defineSkinHooks()')
      const hooks = factory()
      if (typeof hooks?.apply !== 'function') throw new Error('defineSkinHooks() must return { apply }')
      const cleanups: Array<() => void> = []
      const ctx = {
        skinId: entry.manifest.id,
        scopeAttr: entry.manifest.id,
        assetBase: `${apiBase}/skins/${entry.manifest.id}`,
        layers,
        theme: {
          get: themeGet,
          subscribe: themeSubscribe,
        },
        onCleanup: (fn: () => void) => {
          cleanups.push(fn)
        },
      }
      hooks.apply(ctx)
      ledger.record(activation, 'hooks', () => {
        try {
          hooks.dispose?.()
        } catch (error) {
          onError(`hooks dispose failed for ${entry.manifest.id}`, error)
        }
        for (const cleanup of cleanups.reverse()) {
          try {
            cleanup()
          } catch (error) {
            onError(`hooks cleanup failed for ${entry.manifest.id}`, error)
          }
        }
      })
    } catch (error) {
      // The escape hatch never takes the static skin down with it.
      onError(`hooks failed for ${entry.manifest.id}; static skin stays active`, error)
    }
  }

  async function persist(id: string | null): Promise<void> {
    if (deps.persist) {
      await deps.persist(id)
      return
    }
    await fetchImpl(`${apiBase}/active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: id }),
    })
  }

  async function switchInternal(
    id: string | null,
    entry: ControllerSkinEntry | null,
    mode: SkinActivationMode,
    options?: SkinActivationOptions,
  ): Promise<string | null> {
    const seq = ++latestRequest
    switching = true
    const activation = ledger.beginActivation()
    // External stand-down (issue #39): another plugin owns the visual, so this
    // activation is recorded and persisted but nothing is painted. `active`
    // still names the user's choice, which is what the card shows and what
    // repaints the moment that plugin stops.
    //
    // A user-initiated activation of a real skin is the one exception (issue
    // #49): it claims the stage, so the public `html[data-dsh-skin]` stamp
    // flips and that owner can see the request and hand the page back. The
    // claim needs a skin to paint, so the stock look keeps reporting itself as
    // stood down rather than claiming a stage it does not use.
    const suppressed = deps.suppressSkin?.() === true
    // A delegated skin has no stylesheet of its own: the plugin that owns the
    // page paints it. The activation is still a real one (it persists the
    // selection and records the row as active), it simply paints nothing and
    // leaves html[data-dsh-skin] off, which is the very signal that plugin
    // reads to stand down. It never claims the stage: there is no paint to
    // claim one with.
    const delegated = isDelegatedEntry(entry)
    const claimsStage = options?.userInitiated === true && id !== null && entry !== null && !delegated
    const withheld = suppressed && !claimsStage
    try {
      if (!withheld && !delegated && id !== null && entry !== null) {
        const stylesheetHref = `${apiBase}/skins/${id}/stylesheet`
        const patchesHref = entry.manifest.contributes?.patches !== undefined
          ? `${apiBase}/skins/${id}/patches`
          : null
        await loadStylesheet(stylesheetHref)
        trackStylesheet(activation, 'stylesheet', stylesheetHref)
        if (patchesHref !== null) {
          await loadStylesheet(patchesHref).catch(() => {})
          trackStylesheet(activation, 'patches', patchesHref)
        }
        if (seq !== latestRequest) throw new StaleSwitch()
        installBackground(activation, entry)
        await installHooks(activation, entry)
      } else {
        // Stock / entryless / withheld switch owns the background layer too: it
        // must clear a previous skin's paint (the old activation's restore is
        // skipped as stale by the ownership gate).
        setBackgroundLayer(activation, [])
      }
      if (seq !== latestRequest) throw new StaleSwitch()

      // The atomic cut: attribute first, then retire the old activation. A
      // withheld skin leaves the stamp off, which is what actually removes the
      // skin's CSS from the page. A delegated skin leaves it off for the same
      // reason from the other side: its owner reads the stamp.
      if (id === null || withheld || delegated) doc.documentElement.removeAttribute('data-dsh-skin')
      else doc.documentElement.setAttribute('data-dsh-skin', id)
      const previous = currentActivation
      currentActivation = activation
      active = id
      // Stood down is only ever the EXTERNAL verdict: a wallpaper rendering
      // over whatever is selected. A delegated skin on its own is not stood
      // down, it is simply painted by its plugin rather than here.
      stoodDown = withheld
      // This activation already applied the current verdict, so refresh() must
      // not read it as a change and re-switch on the next call.
      lastSuppressed = withheld
      if (entry !== null) lastEntry = entry
      if (mode === 'preview') {
        previewing = id !== committed.id
        trying = previewing ? id : null
      } else {
        // 'commit' and 'adopt' both settle the selection: try-on restores it
        // and the follower sees it as already applied. Only 'commit' writes it
        // back, which is the whole difference (issue #54).
        committed = { id, entry }
        trying = null
        previewing = false
      }
      emit()
      if (previous !== null) ledger.disposeActivation(previous)
      // A claim the external owner never answers must not sit on top of that
      // owner's visual: re-check once the hand-back window is over (issue #49).
      // Recorded while this activation is still the current one, because the
      // settleSwitch below may replay a queued verdict flip, and that opens a
      // newer activation which disposes this one (and its window) right away.
      if (claimsStage && suppressed) scheduleYieldCheck(activation)
      // The paint has changed and the previous activation is retired: this is
      // the point an external verdict flip must be able to take over.
      // Persisting is a separate, unscheduled round-trip (POST /active can hang
      // on a paired desktop) and must not hold the page on a superseded paint
      // (issue #1805).
      settleSwitch(seq)
      if (mode === 'commit') {
        await persist(id).catch((error) => onError('failed to persist the skin selection', error))
      }
      return active
    } catch (error) {
      ledger.disposeActivation(activation)
      if (error instanceof StaleSwitch) return active
      if (currentActivation === null) {
        active = null
        stoodDown = false
        committed = { id: null, entry: null }
        doc.documentElement.removeAttribute('data-dsh-skin')
        emit()
      }
      onError(`switch to ${id ?? 'stock'} failed; previous skin intact`, error)
      return active
    } finally {
      // Safety net for the paths that bail before the atomic cut (a stale
      // switch, or a failed stylesheet load). The normal path already settled
      // before persisting, so this is a no-op there.
      settleSwitch(seq)
    }
  }

  /**
   * The visual half of a switch is done: release the in-flight flag and replay
   * a verdict flip that arrived while it was loading.
   *
   * Called at the atomic cut, NOT after the persist round-trip. POST /active
   * has no timeout and can hang on a paired desktop, and a page that has
   * already painted must still yield to an external owner the moment that
   * owner's verdict flips - waiting for the write would leave the skin painted
   * over the wallpaper (issue #1805). Idempotent, so the failure paths can
   * call it again from the switch's `finally`.
   */
  function settleSwitch(seq: number): void {
    // An older switch settling late must not report an in-flight newer switch
    // as settled (issue #1805).
    if (seq !== latestRequest) return
    if (!switching && !refreshQueued) return
    switching = false
    // A verdict flip that arrived while this switch was loading: it sampled its
    // verdict before the flip, so replay the flip now that nothing is in
    // flight. Dropping it would leave the page on a paint the external owner
    // already superseded (issue #39 handoff, issue #1805).
    if (refreshQueued) {
      refreshQueued = false
      void refresh()
    }
  }

  /**
   * Re-check a stage claim once the hand-back window is over (issue #49).
   *
   * The claim is a request, not permission: if the external owner still
   * reports itself active at the end of the window, this activation withdraws
   * through the ordinary withheld path, so a peer that never answers the
   * `html[data-dsh-skin]` stamp cannot leave the skin painted over its visual.
   *
   * Three ways the check stands down without acting, each correct:
   *  - a newer activation replaced this one (it applies its own verdict, and
   *    a newer claim brings its own window);
   *  - another switch is in flight (that switch sampled the verdict itself);
   *  - the owner handed the page back (the paint is what the user asked for,
   *    and `refresh()` already sees a matching verdict, so it is left alone).
   *
   * The timer is ledger-recorded, so superseding this activation or shutting
   * the runtime down cancels it.
   * @param activation - the claiming activation this window belongs to.
   */
  function scheduleYieldCheck(activation: number): void {
    const timer = setTimeout(() => {
      if (activation !== currentActivation) return
      if (switching) return
      if (deps.suppressSkin?.() !== true) return
      void switchInternal(active, active === null ? null : lastEntry, 'preview')
    }, USER_INITIATED_YIELD_GRACE_MS)
    ledger.record(activation, 'yield:claim-window', () => clearTimeout(timer))
  }

  /**
   * Re-apply the current selection under the current external verdict.
   *
   * A switch already in flight sampled the verdict before this call, so this
   * defers the flip instead of opening a second activation: the second one
   * would bump the request sequence and cancel the first, which is how the
   * desktop boot lost its persisted selection (issue #1805).
   */
  async function refresh(): Promise<string | null> {
    const suppressed = deps.suppressSkin?.() === true
    if (suppressed === lastSuppressed) return active
    if (switching) {
      refreshQueued = true
      return active
    }
    lastSuppressed = suppressed
    if (active !== null && lastEntry === null) return active
    // Re-apply the SAME logical selection: switchInternal decides whether it
    // paints or withholds, so a wallpaper starting or stopping flips the page
    // without touching what the user chose. Preview mode keeps this a pure
    // repaint: the committed selection is already this one, and a repaint must
    // never write (issue #54).
    return await switchInternal(active, active === null ? null : lastEntry, 'preview')
  }

  return {
    get active() {
      return active
    },
    get layers() {
      return layers
    },

    async switchTo(id, entry, options) {
      return await switchInternal(id, entry, 'commit', options)
    },

    async tryOn(id, entry, options) {
      return await switchInternal(id, entry, 'preview', options)
    },

    async adopt(id, entry, options) {
      return await switchInternal(id, entry, 'adopt', options)
    },

    async exitTryOn() {
      const result = await switchInternal(committed.id, committed.entry, 'preview')
      return result
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getState() {
      return stateSnapshot
    },

    isSwitching() {
      return switching
    },

    refresh,

    shutdown() {
      latestRequest += 1
      unsubscribeTheme()
      if (currentActivation !== null) {
        ledger.disposeActivation(currentActivation)
        currentActivation = null
      }
      active = null
      stoodDown = false
      trying = null
      previewing = false
      committed = { id: null, entry: null }
      emit()
      doc.documentElement.removeAttribute('data-dsh-skin')
    },
  }
}

class StaleSwitch extends Error {
  constructor() {
    super('superseded by a newer switch')
  }
}
