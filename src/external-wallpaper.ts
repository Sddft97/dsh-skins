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
 * installs, removes, disables or rewrites anything — installation is the
 * user's, performed with the official CLI.
 *
 * Detection is best-effort by construction: the profile layout, a hand-edited
 * patch file and a remote install all move under it, so every read is fenced
 * and a missing or unreadable input simply means "not installed".
 *
 * Signals, any of which is enough:
 *  - the profile manifest's dependencies name the package (npm/registry and
 *    `link:` installs both land here);
 *  - any patch layer reachable from the harness home carries a row naming the
 *    package (the plugin-manager write, including rows the manifest no longer
 *    backs).
 * @module @linxin666/dsh-client-ui-skin-center/external-wallpaper
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveHarnessPaths } from './harness-home.ts'

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

/** Signal names, stable enough to assert on and to log. */
export const SIGNAL_PROFILE_DEPENDENCY = 'profile-dependency'
export const SIGNAL_CORDIS_ROW = 'cordis-row'

/**
 * Read one file, or null when it is absent, a directory, or unreadable.
 * @param path - absolute path to read.
 * @returns the file's UTF-8 text, or null.
 */
function readIfFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null
    if (!statSync(path).isFile()) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Read one JSON file into an object, or null when it is absent or invalid.
 * @param path - absolute path to read.
 * @returns the parsed object, or null.
 */
function readJsonIfFile(path: string): Record<string, unknown> | null {
  const text = readIfFile(path)
  if (text === null) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

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
  if (manifest === null) return false
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const map = manifest[section]
    if (typeof map !== 'object' || map === null || Array.isArray(map)) continue
    if (Object.prototype.hasOwnProperty.call(map, packageName)) return true
  }
  return false
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
  if (patch === null) return false
  // Quote style varies (yaml may keep 'x', "x" or x); match the scalar
  // anywhere on a line rather than pinning one quoting convention.
  const pattern = new RegExp(`(^|[^a-z0-9._-])${packageName.replace(/\./g, '\\.')}([^a-z0-9._-]|$)`)
  return patch.split(/\r?\n/).some((line) => pattern.test(line.replace(/#.*$/, '')))
}

/** Paths the probe reads, resolved once. */
export interface ExternalWallpaperPaths {
  /** The active profile's package.json (dependency signal). */
  profileManifestPath: string
  /** Patch layers that may carry a wiring row (row signal). */
  patchPaths: string[]
}

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
  const paths = resolveHarnessPaths(options.home, options.profile)
  const profileDir = join(paths.patchPath, '..')
  return {
    profileManifestPath: paths.profileManifestPath,
    patchPaths: [
      paths.patchPath,
      paths.legacyPatchPath,
      join(profileDir, 'cordis.yml'),
    ],
  }
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
  const signals: string[] = []
  try {
    const paths = externalWallpaperPaths(options)
    if (manifestNamesExternalWallpaper(readJsonIfFile(paths.profileManifestPath))) {
      signals.push(SIGNAL_PROFILE_DEPENDENCY)
    }
    if (paths.patchPaths.some((path) => patchNamesExternalWallpaper(readIfFile(path)))) {
      signals.push(SIGNAL_CORDIS_ROW)
    }
  } catch {
    // Fail closed to "not installed": a broken probe must never be the reason
    // the card tells the user to install something they already have.
  }
  return {
    installed: signals.length > 0,
    signals,
    packageName: EXTERNAL_WE_PLUGIN,
    repository: EXTERNAL_WE_REPO,
    installCommand: EXTERNAL_WE_INSTALL_COMMAND,
    // The registry name and the install spec are the same string for this
    // package; it stays its own field so a pinned dist-tag can diverge later.
    npm: EXTERNAL_WE_PLUGIN,
  }
}
