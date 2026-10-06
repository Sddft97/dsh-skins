/**
 * Profile plugin probe: is one package installed in THIS profile?
 *
 * Two features of this package delegate a whole surface to another plugin and
 * need the same answer before they can point the user at it — the Wallpaper
 * Engine bridge handed wallpapers to `dsh-plugin-wallpaper-engine` (issue #39)
 * and a delegated skin hands the page to the theme plugin that ships it (see
 * ./delegated-skins.ts). The reads are identical, so they live here once and
 * each caller keeps its own constants and report shape.
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
 *
 * Nothing here writes. A probe that installs, disables or rewrites a plugin it
 * does not own is not a probe.
 * @module @linxin666/dsh-client-ui-skin-center/core/profile-plugin-probe
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveHarnessPaths } from '../harness-home.ts'

/** Signal names, stable enough to assert on and to log. */
export const SIGNAL_PROFILE_DEPENDENCY = 'profile-dependency'
export const SIGNAL_CORDIS_ROW = 'cordis-row'

/** What one probe found, and which signals found it. */
export interface PluginProbeResult {
  /** True when the package is installed in this profile. */
  installed: boolean
  /** The signal names that matched, in report order. Empty when not installed. */
  signals: string[]
}

/**
 * Read one file, or null when it is absent, a directory, or unreadable.
 * @param path - absolute path to read.
 * @returns the file's UTF-8 text, or null.
 */
export function readIfFile(path: string): string | null {
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
export function readJsonIfFile(path: string): Record<string, unknown> | null {
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
 * Whether a package.json dependency map names one package.
 *
 * Matched by key only: a `link:`, a `file:`, a caret range and a bare tag all
 * put the same key in the map, and the version range is not this probe's
 * business.
 * @param manifest - parsed profile package.json, or null.
 * @param packageName - the package to look for.
 * @returns true when any dependency section names the package.
 */
export function manifestNamesPlugin(
  manifest: Record<string, unknown> | null,
  packageName: string,
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
 * Whether a cordis patch layer activates a row naming one package.
 *
 * The row form is `name: '<package>'` under an insert list or an id-targeted
 * override; both spell the same package string, so the probe looks for the
 * package name as a quoted or bare scalar. A DISABLED row still means the
 * plugin is installed and wired (the loader keeps it mounted as inactive),
 * which is a real installation a caller must not offer to install again.
 * @param patch - raw cordis.patch.yml text, or null.
 * @param packageName - the package to look for.
 * @returns true when the text names the package.
 */
export function patchNamesPlugin(patch: string | null, packageName: string): boolean {
  if (patch === null) return false
  // Quote style varies (yaml may keep 'x', "x" or x); match the scalar
  // anywhere on a line rather than pinning one quoting convention.
  const pattern = new RegExp(`(^|[^a-z0-9._-])${packageName.replace(/\./g, '\\.')}([^a-z0-9._-]|$)`)
  return patch.split(/\r?\n/).some((line) => pattern.test(line.replace(/#.*$/, '')))
}

/** Paths the probe reads, resolved once. */
export interface ProfilePluginPaths {
  /** The active profile's package.json (dependency signal). */
  profileManifestPath: string
  /** Patch layers that may carry a wiring row (row signal). */
  patchPaths: string[]
  /** The active profile's root directory. */
  profileDir: string
}

/**
 * Resolve the files the probe reads for a harness home / profile pair. The
 * profile patch comes first, then the harness-home patch layer, then the
 * profile's own composition file, so an install written by any of the
 * manager's paths is seen.
 * @param options - explicit harness home / profile (tests), else the live layout.
 * @returns the paths, whether or not they exist.
 */
export function profilePluginPaths(
  options: { home?: string; profile?: string } = {},
): ProfilePluginPaths {
  const paths = resolveHarnessPaths(options.home, options.profile)
  const profileDir = join(paths.patchPath, '..')
  return {
    profileManifestPath: paths.profileManifestPath,
    patchPaths: [
      paths.patchPath,
      paths.legacyPatchPath,
      join(profileDir, 'cordis.yml'),
    ],
    profileDir,
  }
}

/**
 * Probe this profile for one package.
 *
 * Never throws: an unreadable or missing input is "no signal" and the result
 * simply says not installed. The probe only reads.
 * @param packageName - the package to look for.
 * @param options - explicit harness home / profile (tests), else the live layout.
 * @returns whether the package is installed, and the signals that found it.
 */
export function detectProfilePlugin(
  packageName: string,
  options: { home?: string; profile?: string } = {},
): PluginProbeResult {
  const signals: string[] = []
  try {
    const paths = profilePluginPaths(options)
    if (manifestNamesPlugin(readJsonIfFile(paths.profileManifestPath), packageName)) {
      signals.push(SIGNAL_PROFILE_DEPENDENCY)
    }
    if (paths.patchPaths.some((path) => patchNamesPlugin(readIfFile(path), packageName))) {
      signals.push(SIGNAL_CORDIS_ROW)
    }
  } catch {
    // Fail closed to "not installed": a broken probe must never be the reason a
    // caller tells the user to install something they already have.
  }
  return { installed: signals.length > 0, signals }
}

/**
 * Where an installed npm package's own files live under a profile root.
 *
 * A `link:` install resolves its realpath outside the profile tree, but the
 * link itself stays inside `node_modules`, and reading through it follows the
 * link — so one candidate covers npm, registry and link installs alike.
 * @param profileDir - the active profile's root directory.
 * @param packageName - the installed package.
 * @returns the absolute package directory, whether or not it exists.
 */
export function installedPackageDir(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

/**
 * Read the package.json an installed package ships, or null.
 * @param profileDir - the active profile's root directory.
 * @param packageName - the installed package.
 * @returns the parsed manifest, or null when it is absent or unreadable.
 */
export function installedPackageManifest(
  profileDir: string,
  packageName: string,
): Record<string, unknown> | null {
  return readJsonIfFile(join(installedPackageDir(profileDir, packageName), 'package.json'))
}
