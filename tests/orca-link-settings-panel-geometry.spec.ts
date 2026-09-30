import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The settings dialog and the panels it hosts.
 *
 * Two separate defects, both invisible to a stylesheet that parses cleanly:
 *
 * 1. The skin squares the settings dialog through a blanket descendant
 *    reset, which also flattened every panel the dialog hosts -- the
 *    skin-center status badge (a 999px pill) read as a clipped block and its
 *    action buttons lost the rounded shape separating them from the card.
 *
 * 2. The dialog used to be reached through [data-slot="sidebar.settings"], but
 *    dsh 0.2.0 ports it to <body> (SettingsPanel uses createPortal), so every
 *    rule climbing that path matched nothing and the whole settings
 *    customization was dead. The skin center marks the real dialog with
    [data-dsh-surface="settings"], which is the anchor the skin now uses.
 *
 * There is no browser layout here (jsdom boxes every element at 0x0), so the
 * defense is asserted on the declarations the browser applies, read from the
 * authored stylesheet -- the same approach the hit-target suite uses.
 */
interface CssRule {
  context: string
  selector: string
  declarations: Record<string, string>
}

function declarationsOf(block: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const chunk of block.split(';')) {
    const colon = chunk.indexOf(':')
    if (colon === -1) continue
    const property = chunk.slice(0, colon).trim()
    if (property === '') continue
    declarations[property] = chunk.slice(colon + 1).trim().replace(/\s+/g, ' ')
  }
  return declarations
}

function parseRules(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let index = 0
  while (index < source.length) {
    const open = source.indexOf('{', index)
    if (open === -1) break
    const prelude = source.slice(index, open).trim().replace(/\s+/g, ' ')
    let depth = 1
    let cursor = open + 1
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1
      else if (source[cursor] === '}') depth -= 1
      cursor += 1
    }
    const block = source.slice(open + 1, cursor - 1)
    if (prelude.startsWith('@')) {
      for (const rule of parseRules(block)) {
        rules.push({
          context: rule.context === '' ? prelude : rule.context + ' ' + prelude,
          selector: rule.selector,
          declarations: rule.declarations,
        })
      }
    } else {
      rules.push({ context: '', selector: prelude, declarations: declarationsOf(block) })
    }
    index = cursor
  }
  return rules
}

const patchesRules = (): CssRule[] =>
  parseRules(readFileSync(resolve(__dirname, '../skins/orca-link/patches.css'), 'utf-8'))

/** The skin-center classes the skin-center module declares a radius for. */
const PANEL_GEOMETRY: Array<[string, string]> = [
  ['the card', '_card'],
  ['the status badge', '_badge'],
  ['the action button', '_button'],
]

describe('orca-link settings dialog keeps hosted panel geometry', () => {
  it('user sees each hosted skin-center surface keep its own radius', () => {
    // Given the skin-center panel hosted inside the squared settings dialog
    const rules = patchesRules()
    // When each surface carrying its own radius is looked up
    for (const [description, classFragment] of PANEL_GEOMETRY) {
      // Then a rule gives it a non-zero radius, so the blanket reset above it
      // does not leave the surface as a square block
      const rule = rules.find((entry) =>
        entry.selector.includes('data-dsh-skin-center')
        && entry.selector.includes(classFragment)
        && entry.declarations['border-radius'] !== undefined)
      expect(rule, 'expected a skin-center rule for ' + description).toBeDefined()
      const radius = rule!.declarations['border-radius'] ?? ''
      expect(radius, description + ' must keep a non-zero radius').not.toBe('0')
      expect(radius, description + ' must not revert the panel declaration').not.toMatch(/^revert/)
    }
  })

  it('user still sees the dialog chrome itself square', () => {
    // Given the settings dialog the skin squares off, now reached through the
    // semantic surface marker (the dialog is portalled to <body>, so the old
    // sidebar.settings path no longer matches anything)
    const rules = patchesRules()
    // When the blanket dialog rule is read
    const chrome = rules.find((entry) =>
      entry.selector.includes('data-dsh-surface')
      && entry.selector.includes('settings')
      && entry.declarations['border-radius'] !== undefined)
    // Then it still squares the dialog, so the fix did not abandon the grammar
    expect(chrome, 'expected the dialog chrome reset').toBeDefined()
    expect(chrome!.declarations['border-radius']).toMatch(/^0\b/)
  })

  // The dialog moved out of the sidebar slot in dsh 0.2.0. A rule that still
  // climbs through that slot matches nothing, which is how a whole skin's
  // settings customization goes silently dead: the CSS parses, the suite
  // passes, and the panel never changes.
  it('reaches the settings dialog only through the semantic surface marker', () => {
    // Given every rule the skin ships that addresses the settings dialog
    const dialogRules = patchesRules().filter((entry) =>
      entry.selector.includes('settings'))
    // Then none of them climbs the dead sidebar.settings path
    const stale = dialogRules
      .map((entry) => entry.selector)
      .filter((selector) => selector.includes('sidebar.settings'))
    expect(stale).toEqual([])
    // And the dialog is addressed at all, through the marker skin center sets
    expect(dialogRules.length).toBeGreaterThan(0)
  })

  // The overlay, the panel and the mask are three separate boxes since the
  // portal. Rules that collapse them onto one selector fight each other: the
  // covering sheet's position/inset would land on the floating panel.
  it('user sees the overlay and the panel kept as separate boxes', () => {
    // Given the skin's settings rules
    const rules = patchesRules()
    // When the ones carrying the open marker are collected
    const marked = rules
      .filter((entry) => entry.selector.includes('data-orca-settings-open')
        && entry.selector.includes('settings'))
    // Then the overlay is addressed through a selector distinct from the panel
    const overlay = marked.filter((entry) => entry.selector.includes(':has('))
    expect(overlay.length, 'expected overlay-scoped rules').toBeGreaterThan(0)
  })
})