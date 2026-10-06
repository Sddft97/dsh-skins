/**
 * One-click install of a plugin this package points at, through the host.
 *
 * Two of this package's surfaces are delegated to other plugins rather than
 * implemented here — wallpapers to `dsh-plugin-wallpaper-engine` (issue #39)
 * and a whole-GUI theme to `dsh-claude-style` (see
 * core/delegated-skins.ts) — and a pointer is only useful if the user can act
 * on it. Both install through whichever plugin-management face the running host
 * publishes: the same call the official Plugins page and the Workshop store
 * make, rather than a writer of this package's own.
 *
 * Two faces are bridged, each OPTIONAL and each resolved through
 * `ctx.inject` (never the module-level inject array, which would park this
 * plugin on hosts that publish neither):
 *
 *  - `remote.pluginManager` — the official in-process manager's client remote
 *    namespace. The API gateway registers every namespace as the service
 *    `remote.<namespace>`, and `installBundle` is the very call the official
 *    Plugins page makes, so this works on the packaged Desktop client too,
 *    where the CLI refuses the application-owned profile.
 *  - `pluginManager` — the family face published by
 *    `@linxin666/dsh-client-ui-plugin-manager`, kept as the fallback for hosts
 *    that publish no official remote.
 *
 * When neither face is present the caller keeps its read-only copy-command
 * fallback.
 *
 * CONTRACT OBSERVATION: repository rules forbid cross-package value imports, so
 * the members this module calls are re-declared here. Both sides must stay
 * compatible on the wire.
 * @module @linxin666/dsh-client-ui-skin-center/plugin-install-faces
 */

import type { Context } from '@deepseek-ai/cordis'

/** Result envelope every `remote.<namespace>` method resolves with. */
export type NativeRemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code?: string; message?: string } }

/** The official in-process plugin manager's client remote namespace. */
export interface NativePluginManagerService {
  /**
   * Install (or update) one package spec through the official manager.
   * @param spec - package spec, e.g. `@scope/pkg` or `@scope/pkg@1.2.3`.
   * @param options - activation choice and the request id the run is tracked under.
   */
  installBundle(spec: string, options?: { enabled?: boolean; requestId?: string }): Promise<NativeRemoteResult<unknown>>
}

/** The family plugin-manager face (mirrors its frozen cross-plugin contract). */
export interface FamilyPluginManagerService {
  /** Whether this browser has loopback authority over the host routes. */
  readonly isLoopback: boolean
  /** Install one plugin from an npm spec or git URL. */
  install(spec: string): Promise<unknown>
}

/**
 * The official Plugins page's navigation face.
 *
 * Installing a plugin leaves the reader with one question the installer cannot
 * answer: where to turn it on, and what it installed. The official panel already
 * renders enablement, uninstall and install diagnostics, so a row that just
 * installed something hands the reader there instead of growing a management
 * surface of its own. Same face the Workshop store uses.
 */
export interface PluginNavigationService {
  /**
   * Open one installed bundle's page in the official Plugins panel.
   * @param packageName - installed dependency (package) name.
   */
  openBundle(packageName: string): void
}

/** The faces this module bridged, any of which may be absent. */
export interface InstallFaces {
  readonly native: NativePluginManagerService | null
  readonly family: FamilyPluginManagerService | null
  readonly navigation: PluginNavigationService | null
}

let faces: InstallFaces = { native: null, family: null, navigation: null }
const listeners = new Set<() => void>()

/** Current faces snapshot (a cached reference, safe for useSyncExternalStore). */
export function getInstallFaces(): InstallFaces {
  return faces
}

/** Subscribe to face changes; returns the unsubscribe function. */
export function subscribeInstallFaces(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Merge one face change into the snapshot and notify subscribers. */
function patchFaces(patch: Partial<InstallFaces>): void {
  faces = { ...faces, ...patch }
  for (const listener of listeners) listener()
}

/**
 * npm package name (optionally scoped, lowercase) plus the optional concrete
 * version/tag suffix npm accepts. Mirrors the store's own rule so this module
 * can never hand a manager a spec the store would have rejected.
 */
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[0-9A-Za-z][0-9A-Za-z._-]*)?$/

/**
 * Whether one install spec is safe to hand to a plugin manager.
 * @param spec - the candidate spec.
 * @returns true for a plain npm package name (optionally `pkg@version`).
 */
export function isInstallSpecValid(spec: string): boolean {
  return NPM_SPEC.test(spec)
}

/**
 * Bridge both optional faces into the module store. Uses `ctx.inject` so each
 * face stays optional: the inner callback runs when the face is provided and is
 * disposed when it goes away, which clears the store.
 * @param ctx - the client root context.
 */
export function bridgeInstallFaces(ctx: Context): void {
  ctx.inject(['remote.pluginManager'], (inner) => {
    inner.effect(() => {
      patchFaces({ native: (inner.get('remote.pluginManager') as NativePluginManagerService | undefined) ?? null })
      return () => { patchFaces({ native: null }) }
    }, 'ui-skin-center: official pluginManager bridge')
  })
  ctx.inject(['pluginManager'], (inner) => {
    inner.effect(() => {
      patchFaces({ family: (inner.get('pluginManager') as FamilyPluginManagerService | undefined) ?? null })
      return () => { patchFaces({ family: null }) }
    }, 'ui-skin-center: family pluginManager bridge')
  })
  ctx.inject(['pluginNavigation'], (inner) => {
    inner.effect(() => {
      patchFaces({ navigation: (inner.get('pluginNavigation') as PluginNavigationService | undefined) ?? null })
      return () => { patchFaces({ navigation: null }) }
    }, 'ui-skin-center: official pluginNavigation bridge')
  })
}

/** Outcome of one install attempt. */
export type InstallOutcome =
  | { kind: 'installed' }
  | { kind: 'no-manager' }
  | { kind: 'failed'; message: string }

/**
 * Install one spec through whichever management face is available.
 *
 * The official in-process manager is preferred whenever it is published: it is
 * the same call the official Plugins page makes and the only writer on the
 * packaged Desktop client. The family face is the fallback.
 *
 * @param spec - validated package spec.
 * @param requestId - id the run is tracked under.
 * @returns the outcome; never throws.
 */
export async function installPluginSpec(spec: string, requestId: string): Promise<InstallOutcome> {
  const useNative = faces.native !== null && typeof faces.native.installBundle === 'function'
  const useFamily = faces.family !== null && typeof faces.family.install === 'function'
  if (!isInstallSpecValid(spec)) {
    return { kind: 'failed', message: 'invalid install spec' }
  }
  if (!useNative && !useFamily) return { kind: 'no-manager' }
  try {
    if (useNative) {
      const result = await faces.native!.installBundle(spec, { enabled: true, requestId })
      if (result !== null && typeof result === 'object' && result.ok === false) {
        const error = (result as { error?: { code?: string; message?: string } }).error
        return { kind: 'failed', message: error?.message ?? error?.code ?? 'install failed' }
      }
      return { kind: 'installed' }
    }
    await faces.family!.install(spec)
    return { kind: 'installed' }
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
