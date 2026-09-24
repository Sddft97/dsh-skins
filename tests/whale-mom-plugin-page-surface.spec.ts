/**
 * whale-mom's plugin-manager page surface (#1683).
 *
 * The official plugin manager paints no background of its own: the page
 * column, the official/installed groups and the plugin rows sit straight on
 * the skin's full-bleed artwork, and with the skin-center background scrim at
 * its default 0 the whale-mom layers there are fully transparent, so titles
 * and descriptions drown in the illustration. The skin must give that page a
 * surface in BOTH themes; the check is mechanical so the guard cannot be
 * dropped silently again.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(resolve(__dirname, '../skins/whale-mom/patches.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule {
  selectors: string[]
  body: string
}

const RULES: Rule[] = (CSS.match(/[^{}]+\{[^{}]*\}/g) ?? []).map((rule) => {
  const brace = rule.indexOf('{')
  return {
    selectors: rule.slice(0, brace).split(',').map(part => part.trim()).filter(Boolean),
    body: rule.slice(brace),
  }
})

/** The declared background of the first rule whose selector list matches. */
function backgroundFor(match: (selector: string) => boolean): string | undefined {
  for (const rule of RULES) {
    if (!rule.selectors.some(match)) continue
    const declared = /background:\s*([^;]+);/.exec(rule.body)
    if (declared !== null) return declared[1]!.trim()
  }
  return undefined
}

const isPanel = (selector: string): boolean =>
  selector.includes('[data-plugin-panel]') || selector.includes('[data-plugin-detail]')
const isPanelDark = (selector: string): boolean =>
  selector.includes('body[data-ds-dark-theme]') && isPanel(selector)

describe('whale-mom plugin manager page surface', () => {
  it('user sees the plugin manager page carry a surface in the light theme', () => {
    // Given the whale-mom patches for the plugin manager page
    // When the light-theme panel rule is read
    const background = backgroundFor(selector => isPanel(selector) && !selector.includes('data-ds-dark-theme'))
    // Then it paints a translucent surface instead of leaving the artwork bare
    expect(background, 'no light-theme background for the plugin manager panel').toBeDefined()
    expect(background).toMatch(/^rgba?\(/)
  })

  it('user sees the plugin manager page carry an opaque-enough surface in the dark theme', () => {
    // Given the same skin under the dark theme
    // When the dark-theme panel rule is read
    const background = backgroundFor(isPanelDark)
    // Then it paints a surface too (the dark artwork is just as busy)
    expect(background, 'no dark-theme background for the plugin manager panel').toBeDefined()
    expect(background).toMatch(/^rgba?\(/)
  })

  it('user sees the group and row surfaces scoped to the plugin manager hooks', () => {
    // Given the group and row hooks the official plugin manager renders
    // When every rule mentioning them is inspected
    const group = backgroundFor(selector => selector.includes('[data-plugin-group]'))
    const hover = backgroundFor(selector => selector.includes('[data-plugin-item]:hover') || selector.includes('[data-plugin-package]:hover'))
    // Then both carry a surface on the official data-plugin-* hooks only
    expect(group, 'no background for [data-plugin-group]').toBeDefined()
    expect(hover, 'no hover background for a plugin row').toBeDefined()
  })
})
