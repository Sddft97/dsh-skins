/**
 * Delegated skins: a skin whose visual is another plugin's.
 *
 * The registry is this package's copy of what a delegated plugin publishes, the
 * probe decides whether this profile installed it, and the rows carry both into
 * the card. These tests pin the three decisions that matter: a row exists
 * before the plugin does (that row IS the install prompt), the probe reads the
 * profile and never writes it, and a descriptor the installed package renamed
 * is reported rather than silently trusted.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CLAUDE_STYLE_SKIN,
  DELEGATED_SKINS,
  delegatedSkinRows,
  findDelegatedSkin,
  isDelegatedSkinId,
  parseDelegatedDescriptor,
  readInstalledDescriptor,
} from '../src/core/delegated-skins.ts'
import { detectProfilePlugin, installedPackageDir } from '../src/core/profile-plugin-probe.ts'

let root: string

/** A cordis patch layer that carries no rows at all. */
const EMPTY_PATCH = '[]\n'

/**
 * One user home whose .dsh harness home carries the requested profiles. The
 * probe takes the same home argument the launcher does.
 */
function makeHome(profiles: Record<string, { dependencies?: Record<string, string>; patch?: string }>): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-delegated-'))
  const harness = join(home, '.dsh')
  mkdirSync(harness, { recursive: true })
  for (const [name, profile] of Object.entries(profiles)) {
    const dir = join(harness, 'profiles', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: profile.dependencies ?? {},
    }))
    writeFileSync(join(dir, 'cordis.patch.yml'), profile.patch ?? EMPTY_PATCH)
  }
  return home
}

/** Write the descriptor a delegated package ships beside its manifest. */
function writeInstalledDescriptor(home: string, profile: string, body: string): void {
  const dir = installedPackageDir(join(home, '.dsh', 'profiles', profile), CLAUDE_STYLE_SKIN.package)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'skin.json'), body)
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'dsh-delegated-rows-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('the delegated-skin registry', () => {
  it('names the Claude style plugin and nothing else', () => {
    // Given / When the registry is read
    // Then it is exactly one descriptor, and it is the peer's own published shape
    expect(DELEGATED_SKINS).toHaveLength(1)
    expect(CLAUDE_STYLE_SKIN.id).toBe('claude-style')
    expect(CLAUDE_STYLE_SKIN.package).toBe('dsh-claude-style')
    expect(CLAUDE_STYLE_SKIN.wiringId).toBe('ui-skin-claude-style')
    expect(CLAUDE_STYLE_SKIN.bodyAttr).toBe('data-dsh-claude-style')
    expect(CLAUDE_STYLE_SKIN.installCommand).toContain('dsh plugin --profile web add dsh-claude-style')
  })

  it('resolves a delegated id and refuses an asset one', () => {
    expect(findDelegatedSkin('claude-style')?.package).toBe('dsh-claude-style')
    expect(findDelegatedSkin('blue-fantasy')).toBeNull()
    expect(isDelegatedSkinId('claude-style')).toBe(true)
    expect(isDelegatedSkinId('blue-fantasy')).toBe(false)
  })
})

describe('the delegated-skin rows', () => {
  it('lists the row before the plugin is installed, because the row is the install prompt', () => {
    // Given a profile with no delegation at all
    const home = makeHome({ web: {} })

    // When the rows are built
    const rows = delegatedSkinRows({ home })

    // Then the row is there, uninstalled, with nothing compared
    expect(rows).toHaveLength(1)
    expect(rows[0].installed).toBe(false)
    expect(rows[0].signals).toEqual([])
    expect(rows[0].descriptorMatches).toBeNull()
  })

  it('reports the installed plugin through the profile manifest', () => {
    // Given a profile whose manifest depends on the delegated package
    const home = makeHome({ web: { dependencies: { 'dsh-claude-style': '^0.11.0' } } })

    // When the rows are built
    const rows = delegatedSkinRows({ home })

    // Then the row is installed and the signal is named
    expect(rows[0].installed).toBe(true)
    expect(rows[0].signals).toEqual(['profile-dependency'])
  })

  it('reports the installed plugin through a wiring row, manifest or not', () => {
    // Given a profile that wires the package without depending on it
    const home = makeHome({
      web: { patch: "- insert:\n    - id: ui-skin-claude-style\n      name: 'dsh-claude-style'\n" },
    })

    // When the rows are built
    const rows = delegatedSkinRows({ home })

    // Then the row signal carries it
    expect(rows[0].installed).toBe(true)
    expect(rows[0].signals).toEqual(['cordis-row'])
  })

  it('confirms the installed package own descriptor, and reports a renamed one', () => {
    // Given an installed package whose descriptor agrees with this copy
    const agree = makeHome({ web: { dependencies: { 'dsh-claude-style': '^0.11.0' } } })
    writeInstalledDescriptor(agree, 'web', JSON.stringify({
      id: 'claude-style',
      package: 'dsh-claude-style',
      bodyAttr: 'data-dsh-claude-style',
      wiring: { id: 'ui-skin-claude-style' },
    }))

    // Then the comparison passes
    expect(delegatedSkinRows({ home: agree })[0].descriptorMatches).toBe(true)

    // And given the same install where the plugin renamed its body attribute
    const renamed = makeHome({ web: { dependencies: { 'dsh-claude-style': '^0.12.0' } } })
    writeInstalledDescriptor(renamed, 'web', JSON.stringify({
      id: 'claude-style',
      package: 'dsh-claude-style',
      bodyAttr: 'data-dsh-claude-theme',
      wiring: { id: 'ui-skin-claude-style' },
    }))

    // Then the mismatch is reported instead of trusted
    expect(delegatedSkinRows({ home: renamed })[0].descriptorMatches).toBe(false)
  })

  it('never throws on a layout it cannot read', () => {
    // Given a home that does not exist at all
    // When the rows are built
    const rows = delegatedSkinRows({ home: join(root, 'missing') })
    // Then every row simply says "not installed"
    expect(rows[0].installed).toBe(false)
  })
})

describe('the descriptor parser', () => {
  it('reads only the fields this package acts on', () => {
    expect(parseDelegatedDescriptor({
      id: 'claude-style',
      name: 'Claude Code Style',
      package: 'dsh-claude-style',
      bodyAttr: 'data-dsh-claude-style',
      wiring: { id: 'ui-skin-claude-style' },
      somethingNew: true,
    })).toEqual({
      id: 'claude-style',
      package: 'dsh-claude-style',
      bodyAttr: 'data-dsh-claude-style',
      wiringId: 'ui-skin-claude-style',
    })
  })

  it('refuses a document that is not a descriptor', () => {
    expect(parseDelegatedDescriptor(null)).toBeNull()
    expect(parseDelegatedDescriptor([])).toBeNull()
    expect(parseDelegatedDescriptor({ id: 'claude-style' })).toBeNull()
    expect(parseDelegatedDescriptor({ id: 1, package: 'x', bodyAttr: 'y' })).toBeNull()
  })
})

describe('the shared profile probe', () => {
  it('answers per package, so one peer never stands in for another', () => {
    // Given a profile that wires only the wallpaper plugin
    const home = makeHome({
      web: { patch: "- insert:\n    - id: wallpaper-engine\n      name: 'dsh-plugin-wallpaper-engine'\n" },
    })

    // When both packages are probed
    // Then each answer is its own
    expect(detectProfilePlugin('dsh-plugin-wallpaper-engine', { home }).installed).toBe(true)
    expect(detectProfilePlugin('dsh-claude-style', { home }).installed).toBe(false)
  })

  it('reads an installed descriptor only through the profile node_modules', () => {
    const home = makeHome({ web: {} })
    writeInstalledDescriptor(home, 'web', JSON.stringify({
      id: 'claude-style',
      package: 'dsh-claude-style',
      bodyAttr: 'data-dsh-claude-style',
    }))
    expect(readInstalledDescriptor(join(home, '.dsh', 'profiles', 'web'), 'dsh-claude-style')?.id)
      .toBe('claude-style')
    expect(readInstalledDescriptor(join(home, '.dsh', 'profiles', 'other'), 'dsh-claude-style')).toBeNull()
  })
})
