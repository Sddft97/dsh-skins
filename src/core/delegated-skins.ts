/**
 * Delegated skins: a skin whose visual is produced by ANOTHER plugin.
 *
 * Every skin in this package is a pure asset directory under skins/<id>/
 * (see contracts/README.md): this package loads the CSS, paints the
 * background media and stamps html[data-dsh-skin]. That model cannot express a
 * whole-GUI theme another package ships as a plugin, and pretending otherwise
 * is what the v1 package / wiring / bodyAttr manifest fields used to attempt,
 * which is why v2 deprecated them.
 *
 * A delegated skin is the one narrow exception, deliberately the same shape
 * as the Wallpaper Engine delegation (issue #39): the other plugin owns the
 * visual, this package keeps only the selection.
 *
 *   - The delegated plugin is a separate, independently versioned package. It
 *     is NOT vendored, forked or bundled here; this module only names it,
 *     probes whether this profile installed it, and offers the one-click
 *     install through the official plugin-management faces.
 *   - The row is listed whether or not the plugin is installed, because a row
 *     the user cannot use yet IS the install prompt.
 *   - Applying it is a normal skin selection: it persists, it is adopted on
 *     boot, and selecting anything else hands the page back. What it does not
 *     do is paint, because the delegated plugin paints. See
 *     src/client/runtime/skin-controller.ts for the withheld activation and
 *     src/client/runtime/delegated-theme.ts for the live marker contract.
 *   - The handoff is one-way and attribute-only: this package never writes an
 *     attribute a delegated plugin owns, and the plugin reads the public
 *     html[data-dsh-skin] stamp to stand down. See
 *     contracts/semantic-attrs-v1.md.
 *
 * The registry below is the built-in copy of each delegated plugin's own
 * descriptor, because a card must be able to offer an install BEFORE the
 * package exists on disk. When the package IS installed its own descriptor
 * file is read back and compared, so a rename upstream surfaces as a catalog
 * warning instead of a silently dead handoff.
 * @module @linxin666/dsh-client-ui-skin-center/core/delegated-skins
 */

import { join } from 'node:path'

import {
  detectProfilePlugin,
  installedPackageDir,
  profilePluginPaths,
  readJsonIfFile,
} from './profile-plugin-probe.ts'

/** A delegated plugin, as this package knows it. */
export interface DelegatedSkinDescriptor {
  /** Persisted selection value; also the card row id. Lowercase kebab-case. */
  id: string
  /** npm package spec the one-click install hands to the plugin manager. */
  package: string
  /** Upstream repository (docs, issues, changelog). */
  repository: string
  /** The command the card copies when no management face is published. */
  installCommand: string
  /** The attribute the plugin stamps on body while it owns the page. */
  bodyAttr: string
  /**
   * The attribute the plugin stamps on body while it can hand the page back.
   * Its PRESENCE is the capability signal: a build without it cannot stand
   * down for a skin, so the row must not be offered as applicable.
   */
  handoffAttr: string
  /** The plugin's cordis row id, for diagnostics and profile inspection. */
  wiringId: string
  /** Card copy: the plugin owns the wording, this is what it ships. */
  name: string
  nameEn: string
  tagline: string
  /** #rrggbb swatch shown where a skin would show a preview image. */
  accent: string
}

/**
 * The Claude Code Desktop theme, as a delegated skin.
 *
 * The plugin is dsh-claude-style (https://github.com/Nwflower/dsh-claude-style),
 * which repaints the whole GUI as Claude Code Desktop. It is a peer project:
 * this package neither vendors it nor edits it, and every field below is
 * either its own published value or the contract it agreed to.
 */
export const CLAUDE_STYLE_SKIN: DelegatedSkinDescriptor = {
  id: 'claude-style',
  package: 'dsh-claude-style',
  repository: 'https://github.com/Nwflower/dsh-claude-style',
  installCommand: 'dsh plugin --profile web add dsh-claude-style',
  // Its own body marker: the value is the build id, the presence is the claim.
  bodyAttr: 'data-dsh-claude-style',
  // Added by the handoff contract; absent on every build that predates it.
  handoffAttr: 'data-dsh-claude-style-handoff',
  wiringId: 'ui-skin-claude-style',
  name: 'Claude Code Style',
  nameEn: 'Claude Code Style',
  tagline: 'Claude Code Desktop theme, provided by the dsh-claude-style plugin',
  accent: '#d97757',
}

/** Every delegated skin this package knows. Order is the card's row order. */
export const DELEGATED_SKINS: readonly DelegatedSkinDescriptor[] = Object.freeze([
  CLAUDE_STYLE_SKIN,
])

/**
 * The delegated skin with this id, or null.
 * @param id - a persisted selection value.
 * @returns the descriptor, or null when the id is an asset skin or unknown.
 */
export function findDelegatedSkin(id: string): DelegatedSkinDescriptor | null {
  return DELEGATED_SKINS.find((skin) => skin.id === id) ?? null
}

/** Whether this id names a delegated skin (an asset skin resolves to false). */
export function isDelegatedSkinId(id: string): boolean {
  return findDelegatedSkin(id) !== null
}

/** The fields of a delegated descriptor this package acts on. */
export interface DelegatedDescriptorFields {
  id: string
  package: string
  bodyAttr: string
  wiringId: string | null
}

/**
 * Parse a delegated plugin's own descriptor file.
 *
 * The shape is the v1 delegated-skin manifest the peer already ships: an id, a
 * package, the attribute it stamps, and the wiring row it inserts. Only the
 * fields this package acts on are read, each one type-checked; anything else
 * is ignored rather than rejected, because the file belongs to another package
 * and this one must not become a second validator for it.
 * @param input - the parsed JSON (or anything else).
 * @returns the fields this package understands, or null when the core ones
 *   are missing or of the wrong type.
 */
export function parseDelegatedDescriptor(input: unknown): DelegatedDescriptorFields | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const id = record.id
  const pkg = record.package
  const bodyAttr = record.bodyAttr
  if (typeof id !== 'string' || id === '') return null
  if (typeof pkg !== 'string' || pkg === '') return null
  if (typeof bodyAttr !== 'string' || bodyAttr === '') return null
  const wiring = record.wiring
  const wiringId = typeof wiring === 'object' && wiring !== null && !Array.isArray(wiring)
    && typeof (wiring as Record<string, unknown>).id === 'string'
    ? (wiring as Record<string, unknown>).id as string
    : null
  return { id, package: pkg, bodyAttr, wiringId }
}

/**
 * Read a delegated package's own descriptor file from the installed tree.
 * @param profileDir - the active profile's root directory.
 * @param packageName - the installed package.
 * @returns the parsed fields, or null when the file is absent or unreadable.
 */
export function readInstalledDescriptor(
  profileDir: string,
  packageName: string,
): DelegatedDescriptorFields | null {
  const dir = installedPackageDir(profileDir, packageName)
  return parseDelegatedDescriptor(readJsonIfFile(join(dir, 'skin.json')))
}

/** Injection seam so tests never touch the real profile layout. */
export interface DelegatedSkinDeps {
  /** Explicit harness home / profile (tests), else the live layout. */
  home?: string
  profile?: string
  /** Registry override; defaults to DELEGATED_SKINS. */
  skins?: readonly DelegatedSkinDescriptor[]
}

/** One row of the catalog: the descriptor plus what this profile reports. */
export interface DelegatedSkinRow {
  descriptor: DelegatedSkinDescriptor
  /** Whether the delegated package is installed in this profile. */
  installed: boolean
  /** Probe signal names, for diagnostics. */
  signals: string[]
  /**
   * Whether the installed package's own descriptor agrees with this copy.
   * Null when the package is not installed (nothing to compare) or its
   * descriptor could not be read. False is a real mismatch and is surfaced to
   * the card: a renamed attribute or package would otherwise hand the page to
   * a plugin that never hears about it.
   */
  descriptorMatches: boolean | null
}

/**
 * Build one catalog row per delegated skin.
 *
 * The row is built whether or not the plugin is installed: a listed row with
 * installed=false is the install prompt, which is the whole point of a
 * delegated skin. The descriptor comparison is advisory, a mismatch becomes a
 * descriptorMatches=false the card can explain, and never a thrown error or a
 * skipped row.
 * @param deps - test seams; the live profile otherwise.
 * @returns one row per registry entry, in registry order.
 */
export function delegatedSkinRows(deps: DelegatedSkinDeps = {}): DelegatedSkinRow[] {
  const registry = deps.skins ?? DELEGATED_SKINS
  let profileDir: string | null = null
  try {
    profileDir = profilePluginPaths({ home: deps.home, profile: deps.profile }).profileDir
  } catch {
    profileDir = null
  }
  return registry.map((descriptor) => {
    const probe = detectProfilePlugin(descriptor.package, { home: deps.home, profile: deps.profile })
    let descriptorMatches: boolean | null = null
    if (probe.installed && profileDir !== null) {
      const installed = readInstalledDescriptor(profileDir, descriptor.package)
      descriptorMatches = installed === null
        ? null
        : installed.id === descriptor.id
          && installed.package === descriptor.package
          && installed.bodyAttr === descriptor.bodyAttr
    }
    return { descriptor, installed: probe.installed, signals: probe.signals, descriptorMatches }
  })
}
