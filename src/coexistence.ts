/**
 * Standalone Wallpaper Engine plugin coexistence probe (issue #39).
 *
 * The skin center ships its own Wallpaper Engine bridge and owns the shell's
 * backdrop layers, the `data-dsh-skin` host stamp and the shared
 * shell-rendering adapter. `dsh-plugin-wallpaper-engine` independently scans
 * the same WE library, paints its own full-viewport fixed layer, rewrites the
 * shell (`body[data-we-wallpaper]`, `body[data-we-sidebar-glass]`) and drives
 * the host theme from the wallpaper's dominant color. Two backdrop owners in
 * one profile paint over each other, and the two `backdrop-filter` stacks
 * sample a shell whose ancestor chain the other one relaid — so the two are
 * alternatives, not companions.
 *
 * This module is the READ-ONLY detection half of that notice: it looks at the
 * profile this package is installed into and reports whether the standalone
 * plugin is present. It never installs, removes, disables or rewrites anything
 * — the switch is the user's, performed with the official CLI. Detection is
 * best-effort by construction: the profile layout, a hand-edited patch file
 * and a remote install all move under it, so every read is fenced and a
 * missing or unreadable input simply means "not detected".
 *
 * Signals, any of which is enough:
 *  - the profile manifest's dependencies name `dsh-plugin-wallpaper-engine`
 *    (npm/registry and `link:` installs both land here);
 *  - any `cordis.patch.yml` layer reachable from the harness home carries a
 *    row naming the package (the file installs through the plugin manager
 *    write, including rows the manifest no longer backs).
 * @module @linxin666/dsh-client-ui-skin-center/coexistence
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveHarnessPaths } from './harness-home.ts'

/** The standalone Wallpaper Engine plugin package this notice is about. */
export const STANDALONE_WE_PLUGIN = 'dsh-plugin-wallpaper-engine'

/** Upstream repository the notice links to (for the switch steps). */
export const STANDALONE_WE_REPO = 'https://github.com/elysia395/dsh-wallpaper-engine'

/** What the probe found, and where it found it. */
export interface CoexistenceReport {
  /** True when the standalone plugin is installed in this profile. */
  detected: boolean
  /** The signal names that matched, in report order. Empty when not detected. */
  signals: string[]
  /** The standalone plugin's package name (always present, detected or not). */
  packageName: string
  /** Upstream repository URL, so the card can link the switch steps. */
  repository: string
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
 * Whether a package.json dependency map names the standalone plugin.
 *
 * Matched by key only: a `link:`, `file:`, a caret range and a bare tag all
 * put the same key in the map, and the version range is not this probe's
 * business.
 * @param manifest - parsed profile package.json, or null.
 * @returns true when any dependency section names the plugin.
 */
export function manifestNamesStandalonePlugin(manifest: Record<string, unknown> | null): boolean {
  if (manifest === null) return false
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const map = manifest[section]
    if (typeof map !== 'object' || map === null || Array.isArray(map)) continue
    if (Object.prototype.hasOwnProperty.call(map, STANDALONE_WE_PLUGIN)) return true
  }
  return false
}

/**
 * Whether a cordis patch layer activates a row naming the standalone plugin.
 *
 * The row form is `name: 'dsh-plugin-wallpaper-engine'` under an insert list
 * or an id-targeted override; both spell the same package string, so the
 * probe looks for the package name as a quoted or bare scalar. A DISABLED row
 * still means the plugin is installed and wired (the loader keeps it mounted
 * as inactive), which is exactly the state this notice exists for.
 * @param patch - raw cordis.patch.yml text, or null.
 * @returns true when the text names the plugin.
 */
export function patchNamesStandalonePlugin(patch: string | null): boolean {
  if (patch === null) return false
  // Quote style varies (yaml may keep 'x', "x" or x); match the scalar
  // anywhere on a line rather than pinning one quoting convention.
  const pattern = new RegExp(`(^|[^a-z0-9._-])${STANDALONE_WE_PLUGIN.replace(/\./g, '\\.')}([^a-z0-9._-]|$)`)
  return patch.split(/\r?\n/).some((line) => pattern.test(line.replace(/#.*$/, '')))
}

/** Paths the probe reads, resolved once. */
export interface CoexistencePaths {
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
export function coexistencePaths(options: { home?: string; profile?: string } = {}): CoexistencePaths {
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
 * Probe this profile for the standalone Wallpaper Engine plugin.
 *
 * Never throws: an unreadable or missing input is "no signal" and the report
 * simply says not detected. The probe only reads.
 * @param options - explicit harness home / profile (tests), else the live layout.
 * @returns the report the card and the API render.
 */
export function detectStandaloneWallpaperEngine(options: { home?: string; profile?: string } = {}): CoexistenceReport {
  const signals: string[] = []
  try {
    const paths = coexistencePaths(options)
    if (manifestNamesStandalonePlugin(readJsonIfFile(paths.profileManifestPath))) {
      signals.push(SIGNAL_PROFILE_DEPENDENCY)
    }
    if (paths.patchPaths.some((path) => patchNamesStandalonePlugin(readIfFile(path)))) {
      signals.push(SIGNAL_CORDIS_ROW)
    }
  } catch {
    // Fail closed to "not detected": a broken probe must never be the reason
    // the card renders a warning about a plugin the user may not have.
  }
  return {
    detected: signals.length > 0,
    signals,
    packageName: STANDALONE_WE_PLUGIN,
    repository: STANDALONE_WE_REPO,
  }
}
