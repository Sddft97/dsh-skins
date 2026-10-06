/**
 * External Wallpaper Engine plugin probe (issue #39, migration round).
 *
 * Wallpaper support no longer ships inside the skin center: it is delegated to
 * `dsh-plugin-wallpaper-engine`, which owns the WE library scan, the video /
 * web / scene rendering paths, the wallpaper settings surface and the theme
 * that follows the wallpaper. The skin center keeps only the skin side, and
 * interoperates with that plugin through its public document marker
 * `body[data-we-wallpaper]` (see
 * src/client/runtime/external-wallpaper-engine.ts).
 *
 * This module is the READ-ONLY half of that relationship: it reports whether
 * the external plugin is installed in this profile, so the card can point the
 * user at it instead of offering a wallpaper feature of its own. It never
 * installs, removes, disables or rewrites anything; installation is the user's,
 * performed through the official plugin manager.
 *
 * The reads themselves are the shared profile probe
 * (core/profile-plugin-probe.ts), which the delegated-skin registry asks the
 * same questions. This file keeps the wallpaper-specific constants, the report
 * shape, and the peer's own persisted selection read.
 *
 * That persisted read is the FIRST-SCREEN prediction (issue #51). The runtime
 * withholds the skin off `body[data-we-wallpaper]`, which that plugin stamps
 * from its own client chain a few hundred milliseconds into the boot - later
 * than the browser's first paint, which the document itself decides. So the
 * first screen would paint the skin and then cut to the wallpaper, and this
 * package reads the peer's own persisted selection synchronously to pre-judge
 * the first screen instead. The prediction is exactly that: the runtime still
 * decides on the marker, and a prediction the peer never confirms costs one
 * extra stylesheet fetch when the boot activation repaints the skin.
 * @module @linxin666/dsh-client-ui-skin-center/external-wallpaper
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  SIGNAL_CORDIS_ROW,
  SIGNAL_PROFILE_DEPENDENCY,
  detectProfilePlugin,
  manifestNamesPlugin,
  patchNamesPlugin,
  profilePluginPaths,
  readJsonIfFile,
  type ProfilePluginPaths,
} from './core/profile-plugin-probe.ts'
import { firstNonBlank } from './harness-home.ts'

/** The delegated wallpaper plugin this package interoperates with. */
export const EXTERNAL_WE_PLUGIN = 'dsh-plugin-wallpaper-engine'

/** Upstream repository of the delegated plugin (install + docs pointer). */
export const EXTERNAL_WE_REPO = 'https://github.com/elysia395/dsh-wallpaper-engine'

/** The install command the card shows when the plugin is missing. */
export const EXTERNAL_WE_INSTALL_COMMAND = 'dsh plugin --profile web add ' + EXTERNAL_WE_PLUGIN

/** What the probe found, and which signal found it. */
export interface ExternalWallpaperReport {
  /** True when the delegated plugin is installed in this profile. */
  installed: boolean
  /** The signal names that matched, in report order. Empty when not installed. */
  signals: string[]
  /** The delegated plugin's package name (always present). */
  packageName: string
  /** Upstream repository URL, so the card can link install and docs. */
  repository: string
  /** The exact install command to show the user. */
  installCommand: string
  /** The npm package spec the card hands to the plugin manager. */
  npm: string
}

export { SIGNAL_CORDIS_ROW, SIGNAL_PROFILE_DEPENDENCY }

/**
 * Whether a package.json dependency map names the delegated plugin.
 *
 * Matched by key only: a `link:`, a `file:`, a caret range and a bare tag all
 * put the same key in the map, and the version range is not this probe's
 * business.
 * @param manifest - parsed profile package.json, or null.
 * @param packageName - the package to look for (defaults to the delegated one).
 * @returns true when any dependency section names the plugin.
 */
export function manifestNamesExternalWallpaper(
  manifest: Record<string, unknown> | null,
  packageName: string = EXTERNAL_WE_PLUGIN,
): boolean {
  return manifestNamesPlugin(manifest, packageName)
}

/**
 * Whether a cordis patch layer activates a row naming the delegated plugin.
 *
 * The row form is `name: 'dsh-plugin-wallpaper-engine'` under an insert list
 * or an id-targeted override; both spell the same package string, so the probe
 * looks for the package name as a quoted or bare scalar. A DISABLED row still
 * means the plugin is installed and wired (the loader keeps it mounted as
 * inactive), which is a real installation the card must not offer to install
 * again.
 * @param patch - raw cordis.patch.yml text, or null.
 * @param packageName - the package to look for (defaults to the delegated one).
 * @returns true when the text names the plugin.
 */
export function patchNamesExternalWallpaper(
  patch: string | null,
  packageName: string = EXTERNAL_WE_PLUGIN,
): boolean {
  return patchNamesPlugin(patch, packageName)
}

/** Paths the probe reads, resolved once. */
export type ExternalWallpaperPaths = ProfilePluginPaths

/**
 * Resolve the files the probe reads for a harness home / profile pair. The
 * profile patch comes first, then the harness-home patch layer, then the
 * profile's own composition file, so an install written by any of the
 * manager's paths is seen.
 * @param options - explicit harness home / profile (tests), else the live layout.
 * @returns the paths, whether or not they exist.
 */
export function externalWallpaperPaths(
  options: { home?: string; profile?: string } = {},
): ExternalWallpaperPaths {
  return profilePluginPaths(options)
}

/**
 * Probe this profile for the delegated Wallpaper Engine plugin.
 *
 * Never throws: an unreadable or missing input is "no signal" and the report
 * simply says not installed. The probe only reads.
 * @param options - explicit harness home / profile (tests), else the live layout.
 * @returns the report the card and the API render.
 */
export function detectExternalWallpaperEngine(
  options: { home?: string; profile?: string } = {},
): ExternalWallpaperReport {
  const probe = detectProfilePlugin(EXTERNAL_WE_PLUGIN, options)
  return {
    installed: probe.installed,
    signals: probe.signals,
    packageName: EXTERNAL_WE_PLUGIN,
    repository: EXTERNAL_WE_REPO,
    installCommand: EXTERNAL_WE_INSTALL_COMMAND,
    // The registry name and the install spec are the same string for this
    // package; it stays its own field so a pinned dist-tag can diverge later.
    npm: EXTERNAL_WE_PLUGIN,
  }
}

/** Environment variable the peer's own host reads its data directory from. */
export const EXTERNAL_WE_DATA_DIR_ENV = 'DSH_WE_DATA_DIR'

/** The peer's default data directory, under the user's home. */
export const EXTERNAL_WE_DEFAULT_DATA_DIR = '.dsh-wallpaper-engine'

/** The file that directory carries, where the peer persists its selection. */
export const EXTERNAL_WE_CONFIG_FILE = 'config.json'

/**
 * The peer's data directory: its own `$DSH_WE_DATA_DIR` override when set, and
 * the documented default under the user's home otherwise. The host file is the
 * only source of truth for the selection; this override moves where it lives
 * and changes nothing else.
 * @param env - the environment to read (tests), else this process's.
 * @returns an absolute directory path.
 */
export function externalWallpaperDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return firstNonBlank(env[EXTERNAL_WE_DATA_DIR_ENV]) ?? join(homedir(), EXTERNAL_WE_DEFAULT_DATA_DIR)
}

/**
 * The persisted-selection file the first-screen prediction reads.
 * @param env - the environment to read (tests), else this process's.
 * @returns an absolute file path, whether or not it exists.
 */
export function externalWallpaperConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(externalWallpaperDataDir(env), EXTERNAL_WE_CONFIG_FILE)
}

/**
 * Whether the peer's persisted selection names a wallpaper (issue #51).
 *
 * `settings.id` is that plugin's stable contract: its host owns the file and
 * writes the chosen wallpaper into it, so a non-empty id means the wallpaper is
 * what the next page load is about to bring up. Reading it synchronously is
 * what lets the first screen already be the wallpaper.
 *
 * This is a FIRST-SCREEN pre-judgment, not a second source of truth. The
 * runtime still decides on `body[data-we-wallpaper]`, which is the live
 * verdict, so a prediction the peer never confirms (a wallpaper that fails to
 * render and takes its marker with it) costs one stylesheet fetch when the
 * boot activation repaints the skin. It is therefore fail-OPEN toward the
 * skin: an absent, unreadable or malformed file means "no wallpaper", never a
 * reason to withhold the skin the user selected.
 * @param env - the environment to read (tests), else this process's.
 * @returns true when a wallpaper is persisted.
 */
export function persistedExternalWallpaperActive(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const config = readJsonIfFile(externalWallpaperConfigPath(env))
    if (config === null) return false
    const settings = config.settings
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return false
    const id = (settings as Record<string, unknown>).id
    return typeof id === 'string' && id.trim() !== ''
  } catch {
    // Fail toward the skin: an unreadable peer file must not cost a user
    // their skin.
    return false
  }
}
