import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The settings dialog is the one place a skin's square-corner grammar was
 * applied by a blanket descendant reset, which also flattened every panel the
 * dialog hosts. The skin-center card is the case that shipped visibly broken:
 * its status badge (a 999px pill) read as a clipped block and its action
 * buttons lost the rounded shape separating them from the card surface.
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
  it('restores the radius each skin-center surface declares', () => {
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

  it('keeps the dialog chrome itself square', () => {
    // Given the dialog the skin squares off
    const rules = patchesRules()
    // When the blanket dialog rule is read
    const chrome = rules.find((entry) =>
      entry.selector.includes('sidebar.settings')
      && entry.selector.includes('[role="dialog"] *'))
    // Then it still squares the dialog, so the fix did not abandon the grammar
    expect(chrome, 'expected the dialog chrome reset').toBeDefined()
    expect(chrome!.declarations['border-radius']).toMatch(/^0\b/)
  })
})
