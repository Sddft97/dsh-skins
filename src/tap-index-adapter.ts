/**
 * Skin bootstrap adapter (issue #506, contract section 8). Stylesheets use the
 * structured `webserver/index-inject` table introduced in DSH 0.1.1, so the
 * same rows work in served HTML and worker boot payloads. The raw `tapIndex`
 * escape hatch remains only for stamping html[data-dsh-skin], which no
 * structured row can express, and as a compatibility fallback when rows were
 * not rendered ahead of the tap.
 *
 * Both halves stand down together when the delegated wallpaper plugin's
 * persisted selection says a wallpaper is about to render (issue #51): the
 * browser's first paint is decided by the delivered document, and the peer's
 * live marker only arrives after its own client chain has run. Withholding
 * here makes the first screen the wallpaper instead of a frame of skin.
 *
 * Fail-closed: any problem yields the stock look plus at most one warning per
 * adapter and reason. Neither the row collector nor the tap throws.
 * @module @linxin666/dsh-client-ui-skin-center/tap-index-adapter
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { findSkin, loadSkinCatalog } from './skin-repo.ts'
import type { SkinCatalog } from './skin-repo.ts'
import { SKIN_CENTER_V2_PREFIX } from './routes-v2.ts'
import { WALLPAPER_EXPECTED_ATTR } from './core/wallpaper-handoff.ts'
import { isDelegatedSkinId } from './core/delegated-skins.ts'

export interface SkinIndexTapDeps {
  readActiveId: () => string | null
  /**
   * First-screen pre-judgment (issue #51): true when the delegated wallpaper
   * plugin's persisted selection says a wallpaper is about to render, so this
   * screen must carry neither the `html[data-dsh-skin]` stamp nor the skin
   * stylesheet. Without it the first paint is the skin and the page only cuts
   * to the wallpaper once the peer's client chain stamps its marker.
   *
   * Only consulted when an active skin exists, so the stock look costs no
   * extra read. Absent (older hosts, tests) means "no wallpaper": the
   * document keeps whatever the runtime then decides.
   */
  readWallpaperOnStage?: () => boolean
  loadCatalog?: () => SkinCatalog
  /** Defaults to console.warn; tests inject a collector. */
  warn?: (message: string) => void
}

const HTML_TAG = /<html(\s[^>]*)?>/i
const HEAD_CLOSE = /<\/head>/i
const SKIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Stamp or replace an attribute on the <html> tag. */
function stampHtmlAttribute(html: string, name: string, value: string): string {
  return html.replace(HTML_TAG, (match, attrs: string | undefined) => {
    const rest = attrs ?? ''
    const quoted = ` ${name}="${value}"`
    if (new RegExp(`\\s${name}=`).test(rest)) {
      return match.replace(new RegExp(`\\s${name}=("[^"]*"|'[^']*'|[^\\s>]+)`), quoted)
    }
    return `<html${rest}${quoted}>`
  })
}

/**
 * Mark a document as withheld for a PREDICTED wallpaper (issue #51).
 *
 * The withheld document alone is not enough: the browser half boots
 * asynchronously and recovers the selection from GET /active, so without this
 * mark its first activation would paint the very frame the host declined to
 * deliver. The mark is what tells that switch to stand down, and the browser
 * half releases it once the peer's marker answers.
 * @param html - the document about to be served.
 * @returns the document with the prediction attribute on <html>.
 */
export function stampWallpaperExpected(html: string): string {
  return stampHtmlAttribute(html, WALLPAPER_EXPECTED_ATTR, '')
}

/** Stamp or replace data-dsh-skin on the <html> tag. */
export function stampSkinAttribute(html: string, skinId: string): string {
  return html.replace(HTML_TAG, (match, attrs: string | undefined) => {
    const rest = attrs ?? ''
    if (/\sdata-dsh-skin=/.test(rest)) {
      return match.replace(/\sdata-dsh-skin=("[^"]*"|'[^']*'|[^\s>]+)/, ` data-dsh-skin="${skinId}"`)
    }
    return `<html${rest} data-dsh-skin="${skinId}">`
  })
}

/** Build the link tags injected before </head>. */
export function skinLinkTags(skinId: string, hasPatches: boolean): string {
  if (!SKIN_ID.test(skinId)) throw new TypeError(`invalid skin id: ${skinId}`)
  const base = `${SKIN_CENTER_V2_PREFIX}/skins/${skinId}`
  const links = [
    `<link rel="stylesheet" href="${base}/stylesheet" data-dsh-skin-link="stylesheet">`,
  ]
  if (hasPatches) {
    links.push(`<link rel="stylesheet" href="${base}/patches" data-dsh-skin-link="patches">`)
  }
  return links.join('')
}

/** Build the structured rows collected fresh for every index render. */
export function makeSkinIndexRows(deps: SkinIndexTapDeps): () => IndexInjection[] {
  const loadCatalog = deps.loadCatalog ?? (() => loadSkinCatalog())
  const warn = deps.warn ?? ((message: string) => console.warn(`[skin-center] ${message}`))
  const wallpaperOnStage = deps.readWallpaperOnStage ?? (() => false)
  const warned = new Set<string>()
  const warnOnce = (reason: string, message: string) => {
    if (warned.has(reason)) return
    warned.add(reason)
    warn(message)
  }

  return (): IndexInjection[] => {
    try {
      const active = deps.readActiveId()
      if (!active) return []
      // A delegated skin paints nothing here: the plugin that owns the page
      // mounts its own bundle from its own client chain, and the stamp below is
      // precisely the signal that tells it to stand down. Injecting a
      // stylesheet row for it would fail the catalog lookup below and warn
      // about a skin that is not missing, it is delegated.
      if (isDelegatedSkinId(active)) return []
      // The wallpaper owns this screen (issue #51): rows are the anti-FOUC half
      // of the injection, so withholding them is what keeps the first paint
      // off the skin. The runtime still holds the verdict.
      if (wallpaperOnStage()) return []
      const entry = findSkin(loadCatalog(), active)
      if (!entry) {
        warnOnce(`missing:${active}`, `active skin "${active}" not in catalog; serving stock look`)
        return []
      }
      return [{
        kind: 'html',
        placement: 'head',
        html: skinLinkTags(active, entry.manifest.contributes.patches !== undefined),
      }]
    } catch (error) {
      warnOnce('row-error', `skin index rows failed closed: ${(error as Error)?.message ?? error}`)
      return []
    }
  }
}

/**
 * Create the raw index tap. Structured rows run before it on DSH 0.1.1; when
 * their marker is present the tap only stamps the html element. Without the
 * marker it also injects links, preserving fail-closed behavior on older hosts.
 */
export function makeSkinIndexTap(deps: SkinIndexTapDeps): (html: string) => string {
  const loadCatalog = deps.loadCatalog ?? (() => loadSkinCatalog())
  const warn = deps.warn ?? ((message: string) => console.warn(`[skin-center] ${message}`))
  const wallpaperOnStage = deps.readWallpaperOnStage ?? (() => false)
  const warned = new Set<string>()
  const warnOnce = (reason: string, message: string) => {
    if (warned.has(reason)) return
    warned.add(reason)
    warn(message)
  }

  return (html: string): string => {
    try {
      const active = deps.readActiveId()
      if (!active) return html
      // A delegated skin is the stock look on the first screen, and the
      // delegated plugin paints it from its own client chain. Stamping
      // html[data-dsh-skin] here would be the opposite message: that plugin
      // reads the stamp to stand down. Leaving it off is the whole handoff.
      if (isDelegatedSkinId(active)) return html
      // Same first-screen pre-judgment as the rows above (issue #51), on the
      // raw tap: it is the half that stamps the opening html tag, and a
      // document that reaches the browser already carrying a wallpaper must
      // not reach it carrying the skin either. The document is marked as
      // withheld-for-prediction so the browser half's boot activation stands
      // down too, and releases that mark once the peer answers.
      if (wallpaperOnStage()) return stampWallpaperExpected(html)
      const catalog = loadCatalog()
      const entry = findSkin(catalog, active)
      if (!entry) {
        warnOnce(`missing:${active}`, `active skin "${active}" not in catalog; serving stock look`)
        return html
      }
      if (!HTML_TAG.test(html) || !HEAD_CLOSE.test(html)) {
        warnOnce('malformed-html', 'index.html has no <html>/</head> anchors; skipping skin injection')
        return html
      }
      const stamped = stampSkinAttribute(html, active)
      if (stamped.includes('data-dsh-skin-link=')) return stamped
      const links = skinLinkTags(active, entry.manifest.contributes.patches !== undefined)
      return stamped.replace(HEAD_CLOSE, `${links}</head>`)
    } catch (error) {
      warnOnce('tap-error', `skin index tap failed closed: ${(error as Error)?.message ?? error}`)
      return html
    }
  }
}
