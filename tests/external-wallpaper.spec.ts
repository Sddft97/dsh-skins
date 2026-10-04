/**
 * Delegated Wallpaper Engine plugin probe (issue #39, migration round).
 *
 * The probe decides whether the card points the user at
 * `dsh-plugin-wallpaper-engine` (install command + docs) or reports that the
 * plugin is present. Each signal is a separate way the plugin reaches a
 * profile — the manifest dependency of an npm or link install, and the wiring
 * row in a patch layer — and the tests pin the two together with the
 * "not installed" steady state.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  EXTERNAL_WE_INSTALL_COMMAND,
  EXTERNAL_WE_PLUGIN,
  SIGNAL_CORDIS_ROW,
  SIGNAL_PROFILE_DEPENDENCY,
  detectExternalWallpaperEngine,
  externalWallpaperPaths,
  manifestNamesExternalWallpaper,
  patchNamesExternalWallpaper,
} from '../src/external-wallpaper.ts'

/**
 * One user home whose `.dsh` harness home carries the requested profiles.
 * The probe takes the same `home` argument the launcher does: a user home
 * whose `.dsh` child is the harness home.
 */
function userHome(...profiles: string[]): string {
  const home = mkdtempSync(join(tmpdir(), 'skin-external-we-'))
  for (const profile of profiles.length > 0 ? profiles : ['web']) {
    mkdirSync(join(home, '.dsh', 'profiles', profile), { recursive: true })
  }
  return home
}

/** Write one profile's manifest with the given dependency value. */
function writeManifest(home: string, spec: string | null, profile = 'web'): void {
  const dependencies = spec === null ? {} : { [EXTERNAL_WE_PLUGIN]: spec }
  writeFileSync(
    join(home, '.dsh', 'profiles', profile, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-' + profile, private: true, dependencies }),
  )
}

/** Write one profile's patch layer. */
function writeProfilePatch(home: string, patch: string, profile = 'web'): void {
  writeFileSync(join(home, '.dsh', 'profiles', profile, 'cordis.patch.yml'), patch)
}

/** Write the harness-home patch layer (the CLI's secondary location). */
function writeHomePatch(home: string, patch: string): void {
  writeFileSync(join(home, '.dsh', 'cordis.patch.yml'), patch)
}

describe('delegated wallpaper plugin detection', () => {
  it('reports not installed, with the install pointer, when no signal is present', () => {
    // Given a profile whose manifest holds only its own bundles
    const home = userHome('web')
    writeManifest(home, null)

    // When the probe runs
    const report = detectExternalWallpaperEngine({ home, profile: 'web' })

    // Then the card offers the install command instead of implying presence
    expect(report.installed).toBe(false)
    expect(report.signals).toEqual([])
    expect(report.packageName).toBe(EXTERNAL_WE_PLUGIN)
    expect(report.installCommand).toBe(EXTERNAL_WE_INSTALL_COMMAND)
    expect(report.installCommand).toContain(EXTERNAL_WE_PLUGIN)
    expect(report.repository).toContain('dsh-wallpaper-engine')
  })

  it('reports an npm-range install from the profile manifest', () => {
    // Given the dependency a registry install writes
    const home = userHome('web')
    writeManifest(home, '^0.3.2')

    // When the probe runs
    const report = detectExternalWallpaperEngine({ home, profile: 'web' })

    // Then the dependency signal names it
    expect(report.installed).toBe(true)
    expect(report.signals).toEqual([SIGNAL_PROFILE_DEPENDENCY])
  })

  it('reports a link install, which uses the same dependency key', () => {
    // Given the dependency a local link install writes
    const home = userHome('web')
    writeManifest(home, 'link:../../wallpaper-engine')

    // When the probe runs
    // Then the probe matches the key and ignores how the spec resolves
    expect(detectExternalWallpaperEngine({ home, profile: 'web' }).installed).toBe(true)
  })

  it('reports a wiring row left in a patch layer', () => {
    // Given a profile whose patch activates the plugin's row
    const home = userHome('web')
    writeProfilePatch(home, "- insert:\n    - id: wallpaper-engine\n      name: 'dsh-plugin-wallpaper-engine'\n")

    // When the probe runs
    const report = detectExternalWallpaperEngine({ home, profile: 'web' })

    // Then the row signal names it
    expect(report.installed).toBe(true)
    expect(report.signals).toEqual([SIGNAL_CORDIS_ROW])
  })

  it('reports a row the harness-home layer carries', () => {
    // Given the CLI's secondary write location
    const home = userHome('web')
    writeHomePatch(home, '- id: wallpaper-engine\n  name: "dsh-plugin-wallpaper-engine"\n  disabled: true\n')

    // When the probe runs
    // Then a DISABLED row still counts: the plugin is installed and wired, so
    // the card must not offer to install it again
    expect(detectExternalWallpaperEngine({ home, profile: 'web' }).installed).toBe(true)
  })

  it('reports both signals when the manifest and a patch layer agree', () => {
    // Given a profile carrying the dependency and the row
    const home = userHome('web')
    writeManifest(home, '^0.3.2')
    writeProfilePatch(home, "- insert:\n    - id: wallpaper-engine\n      name: 'dsh-plugin-wallpaper-engine'\n")

    // When the probe runs
    const report = detectExternalWallpaperEngine({ home, profile: 'web' })

    // Then each contributing signal is reported once
    expect(report.signals).toEqual([SIGNAL_PROFILE_DEPENDENCY, SIGNAL_CORDIS_ROW])
  })

  it('isolates profiles: another profile install is not this profile install', () => {
    // Given the plugin installed into a DIFFERENT profile
    const home = userHome('web', 'headless')
    writeManifest(home, '^0.3.2', 'headless')

    // When the probe runs against the web profile
    // Then only the probed profile is read
    expect(detectExternalWallpaperEngine({ home, profile: 'web' }).installed).toBe(false)
  })

  it('resolves the probe paths under the requested profile', () => {
    // Given a non-default profile
    // When the paths resolve
    const paths = externalWallpaperPaths({ home: 'C:/home/dsh', profile: 'desktop' })

    // Then the profile manifest and patch sit under it
    expect(paths.profileManifestPath.replace(/\\/g, '/')).toContain('/profiles/desktop/package.json')
    expect(paths.patchPaths[0].replace(/\\/g, '/')).toContain('/profiles/desktop/cordis.patch.yml')
  })
})

describe('external wallpaper signal matching', () => {
  it('matches the dependency in any dependency section', () => {
    // Given each section a package manager may write the dependency into
    // When the manifest is inspected
    // Then every section is read
    expect(manifestNamesExternalWallpaper({ dependencies: { [EXTERNAL_WE_PLUGIN]: '1.0.0' } })).toBe(true)
    expect(manifestNamesExternalWallpaper({ devDependencies: { [EXTERNAL_WE_PLUGIN]: '1.0.0' } })).toBe(true)
    expect(manifestNamesExternalWallpaper({ optionalDependencies: { [EXTERNAL_WE_PLUGIN]: '1.0.0' } })).toBe(true)
  })

  it('does not match a different package whose name merely contains the plugin name', () => {
    // Given a neighbouring package name and no manifest at all
    // When the inputs are inspected
    // Then a substring is not a match
    expect(manifestNamesExternalWallpaper({ dependencies: { 'dsh-plugin-wallpaper-engine-extra': '1.0.0' } })).toBe(false)
    expect(manifestNamesExternalWallpaper(null)).toBe(false)
    expect(patchNamesExternalWallpaper('name: dsh-plugin-wallpaper-engine-extra')).toBe(false)
    expect(patchNamesExternalWallpaper(null)).toBe(false)
  })

  it('ignores a commented-out row', () => {
    // Given a patch whose only mention is a comment
    const patch = "# name: 'dsh-plugin-wallpaper-engine' (retired)\n[]\n"

    // When the patch is inspected
    // Then a comment is not a wiring row
    expect(patchNamesExternalWallpaper(patch)).toBe(false)
  })

  it('matches quoted, double-quoted and bare scalars', () => {
    // Given the quoting styles yaml may keep
    // When each patch text is inspected
    // Then all three match
    expect(patchNamesExternalWallpaper("name: 'dsh-plugin-wallpaper-engine'")).toBe(true)
    expect(patchNamesExternalWallpaper('name: "dsh-plugin-wallpaper-engine"')).toBe(true)
    expect(patchNamesExternalWallpaper('name: dsh-plugin-wallpaper-engine')).toBe(true)
  })

  it('survives an unreadable input instead of throwing', () => {
    // Given a home directory that does not exist
    // When the probe runs
    // Then it reports not installed rather than failing the route
    expect(detectExternalWallpaperEngine({ home: join(tmpdir(), 'skin-external-we-absent'), profile: 'web' }).installed).toBe(false)
  })
})
