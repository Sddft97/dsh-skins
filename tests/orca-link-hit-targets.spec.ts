import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The skin harness has no browser layout (jsdom reports every box as 0x0), so
 * the sidebar geometry this suite defends is asserted on the declarations the
 * browser applies, read from the authored stylesheet - never on a file
 * snapshot. parseRules flattens nested at-rules and hands every style rule
 * back with its declarations and its at-rule context.
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

function patchesRules(): CssRule[] {
  return parseRules(readFileSync(resolve(__dirname, '../skins/orca-link/patches.css'), 'utf-8'))
}

function onlyRule(rules: CssRule[], description: string, matches: (rule: CssRule) => boolean): CssRule {
  const found = rules.filter(matches)
  expect(found, 'expected exactly one rule: ' + description).toHaveLength(1)
  return found[0]!
}

/** Reads the stage default and the offset out of "calc(var(--orca-stage, Npx) - Mpx)". */
function stageOffset(value: string | undefined, description: string): { stage: number; offset: number } {
  const match = /^calc\(var\(--orca-stage, (\d+)px\) - (\d+)px\)$/.exec(value ?? '')
  expect(match, description + ' must be a stage offset, got: ' + value).not.toBeNull()
  return { stage: Number(match![1]), offset: Number(match![2]) }
}

// The host mounts the New Session button as the first control of the sidebar
// logo row; the skin rebrands it with the DSH wordmark. A pointer-events:none
// on that button (regression 2026-09-10) silently killed new-session clicks in
// the wide sidebar while the narrow layout kept working, so guard both
// stylesheets against ever targeting the brand button with pointer-events:none.
describe('orca-link sidebar hit targets', () => {
  const sheets: Array<[string, string]> = [
    ['skin.css', resolve(__dirname, '../skins/orca-link/skin.css')],
    ['patches.css', resolve(__dirname, '../skins/orca-link/patches.css')],
  ]

  it('keeps the brand New Session button clickable in every state', () => {
    for (const [filename, file] of sheets) {
      const stripped = readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
      const rules = stripped.match(/[^{}]+\{[^{}]*\}/g) ?? []
      const offenders = rules.filter((rule) => {
        const brace = rule.indexOf('{')
        const selector = rule.slice(0, brace)
        const body = rule.slice(brace)
        return selector.includes('[data-orca-link-brand]') && /pointer-events\s*:\s*none/.test(body)
      })
      expect(offenders, `${filename} disables pointer events on the brand button`).toEqual([])
    }
  })
})

/**
 * The wide stage presents a character area at the top of the sidebar pane and
 * offers it as the new-session target. Two defects are guarded here (issue
 * #1732): the hit surface used to keep the control's own 38px flow size with
 * pointer-events:none, so only part of the painted area reacted, and the stage
 * offset was keyed on the adapter-stamped row part, which the official Plugins
 * row never carries.
 */
describe('orca-link sidebar stage geometry', () => {
  const wide = '[data-orca-sidebar-wide]'
  const rules = patchesRules()
  const pane = 'body' + wide + ' [data-dsh-surface="sidebar"]'
  const rowReset = 'button:not([data-dsh-part="sidebar-entry"])'
  const control = onlyRule(rules, 'wide New Session control', (rule) => (
    rule.context === '' && rule.selector === pane + ' > :first-child > ' + rowReset
  ))
  const plane = onlyRule(rules, 'wide New Session hit plane', (rule) => (
    rule.context === '' && rule.selector === control.selector + ':before'
  ))
  const character = onlyRule(rules, 'status character stage', (rule) => (
    rule.context === ''
    && rule.selector === '[data-dsh-surface="sidebar"] > :first-child > .orca-ch-statusCharacter'
  ))
  const panelList = onlyRule(rules, 'wide panel list offset', (rule) => (
    rule.context === '' && rule.selector === pane + ' > :first-child > nav'
  ))
  const frame = onlyRule(rules, 'wide stage frame', (rule) => (
    rule.context === '' && rule.selector === control.selector + ':after'
  ))
  const artBox = onlyRule(rules, 'shared art box', (rule) => (
    rule.context === '' && rule.selector === '[data-dsh-surface="sidebar"] > :first-child'
  ))

  it('presents the stage character area as the New Session hit plane', () => {
    // Given the control's containing-block role is released, the pseudo
    // elements resolve against the sidebar pane exactly like the character
    const position = control.declarations['position']
    expect(position, 'the control must not be the containing block of its own hit plane').toBe('static')

    // And the plane is the stage's own rectangle, not the button's flow slot
    expect(plane.declarations['position']).toBe('absolute')
    expect(plane.declarations['top']).toBe(character.declarations['top'])
    expect(plane.declarations['left']).toBe(character.declarations['left'])
    expect(plane.declarations['width']).toBe(character.declarations['width'])
    // Its height is deliberately shorter than the painted character: the
    // plane is a hit surface, and the plugin rows are pushed up into the
    // lower part of the stage, so a plane as tall as the art swallowed the
    // first rows (issue #1743). The exact stop is asserted by the next case.
    expect(plane.declarations['height']).not.toBe(character.declarations['height'])
    // The old box stretched from the button's own slot (top/left/right offsets
    // against a 38px control); an explicitly placed box carries neither edge
    expect(plane.declarations['right']).toBeUndefined()
    expect(plane.declarations['bottom']).toBeUndefined()

    // And it stays a real hit surface: the decoration no longer opts out of
    // pointer events, and the cursor advertises the extended target
    expect(plane.declarations['pointer-events']).toBeUndefined()
    expect(plane.declarations['cursor']).toBe('pointer')
    expect(plane.declarations['z-index']).toBe('2')

    // And the plane paints nothing: it used to carry the corner brackets, which
    // is why the visible frame had to share its clipped height and ended up
    // framing the top half of the character. The frame is the other half.
    expect(plane.declarations['background']).toBeUndefined()
    expect(plane.declarations['box-shadow']).toBeUndefined()
  })

  it('frames the character area the art is painted in', () => {
    // Given the pane declares the art box once, for the picture and the frame
    expect(artBox.declarations['--orca-art-h']).toBe('calc(var(--orca-stage, 300px) - 66px)')
    expect(character.declarations['height']).toBe('var(--orca-art-h)')

    // Then the frame is exactly that box, edge for edge: the highlight is the
    // picture's own rectangle, not a clipped band across its top
    expect(frame.declarations['top']).toBe(character.declarations['top'])
    expect(frame.declarations['left']).toBe(character.declarations['left'])
    expect(frame.declarations['width']).toBe(character.declarations['width'])
    expect(frame.declarations['height']).toBe(character.declarations['height'])

    // And it stays decoration: the hit plane below is the only pointer target
    expect(frame.declarations['pointer-events']).toBe('none')
    expect(frame.declarations['position']).toBe('absolute')
    expect(frame.declarations['opacity']).toBe('0')

    // And the corner wedge, the one piece of the frame language that rests on
    // screen, takes the art's own bottom-right corner instead of a separately
    // positioned box that drifts off the picture
    const wedge = onlyRule(rules, 'stage corner wedge', (rule) => (
      rule.context === ''
      && rule.selector === pane + ' > :first-child > .orca-ch-statusCharacter:before'
    ))
    expect(wedge.declarations['background']).toBe('linear-gradient(to top left, var(--orca-blue) 0 50%, #0000 50%)')
    expect(wedge.declarations['right']).toBe('4px')
    expect(wedge.declarations['bottom']).toBe('3px')
    expect(wedge.declarations['pointer-events']).toBe('none')
    // And it is not also drawn by the frame, which would double the corner
    expect(frame.declarations['background']).not.toContain('to top left')
  })

  it('stops the hit plane where the panel list begins', () => {
    // Given the plane covers the character area from the pane top
    const planeTop = Number.parseFloat(plane.declarations['top']!)
    const planeHeight = stageOffset(plane.declarations['height'], 'the hit plane height')
    // And the native panel list starts on its own stage offset
    expect(panelList.declarations['margin-top']).toBe('calc(var(--orca-stage, 300px) - 116px)')
    const listOffset = stageOffset(panelList.declarations['margin-top'], 'the panel list offset')
    const listTop = listOffset.stage - listOffset.offset

    // Then the plane ends exactly there. It used to end at stage - 8, which
    // left it covering the first ~108px of the plugin list: the rows paint
    // above it, but the plane is a ::before on a sibling that keeps the pane
    // own child z-index, so a click on a row lower half opened a new session
    // instead of the plugin (issue #1743).
    expect(planeTop + planeHeight.stage - planeHeight.offset).toBe(listTop)

    // And it is never padded past the list in either direction
    expect(planeTop).toBeLessThan(listTop)
    expect(planeHeight.stage - planeHeight.offset).toBeGreaterThan(0)

    // And every panel row still paints on a higher rung than the hit plane, so
    // a host that moves the row slot can never hand a row tap to the button:
    // this is the swallowed-navigation trap the pointer-events flip caused
    const planeRung = Number(plane.declarations['z-index'])
    const listRung = Number(panelList.declarations['z-index'])
    expect(Number.isFinite(planeRung) && Number.isFinite(listRung)).toBe(true)
    expect(listRung).toBeGreaterThan(planeRung)
  })

  it('moves the whole native panel list, not the adapter-stamped rows alone', () => {
    // Given the semantic adapter stamps data-dsh-part="sidebar-entry" only on
    // rows carrying a third-party glyph, the official Plugins row never has it
    const rowLevelStageMargins = rules.filter((rule) => (
      rule.selector.includes('data-dsh-part="sidebar-entry"')
      && /--orca-stage/.test(rule.declarations['margin-top'] ?? '')
    ))
    // Then no stage offset is keyed on that part
    expect(rowLevelStageMargins.map((rule) => rule.selector)).toEqual([])

    // And the offset rides the pane's own list, which carries every row
    expect(panelList.selector).toContain('> :first-child > nav')
    expect(panelList.declarations['z-index']).toBe('3')

    // And the browsing region's own stage offset retires with the list,
    // keyed on the pane-level list so a glyph-less list matches as well
    const regionReset = onlyRule(rules, 'region stage-offset retirement', (rule) => (
      rule.context === ''
      && rule.selector === pane + ' > :first-child:has( > nav) [class*="regionArea"]'
    ))
    expect(regionReset.declarations['margin-top']).toBe('0')

    // And a list with no plugin glyph still matches the pane-level anchor
    expect(panelList.selector).not.toContain('data-dsh-panel-entry')
    expect(panelList.selector).not.toContain('data-dsh-part')
  })

  it('rolls the panel-list stage offset back on the narrow layout', () => {
    const narrow = onlyRule(rules, 'narrow panel-list reset', (rule) => (
      rule.context.includes('900px') && rule.selector === pane + ' > :first-child > nav'
    ))
    expect(narrow.declarations['margin-top']).toBe('0')
  })

  it('retires the stage-sized hit plane where the narrow layout hides the stage', () => {
    // Given the narrow layout paints no stage for the plane to imitate: the
    // pane decoration and the status character are hidden and the list keeps
    // no stage offset
    const hiddenAtNarrow = rules.filter((rule) => (
      rule.context.includes('900px')
      && rule.declarations['display'] === 'none'
      && /(^|, )\.orca-ch-statusCharacter(,|$)/.test(rule.selector)
    ))
    expect(hiddenAtNarrow, 'the narrow block must retire the stage art').toHaveLength(1)

    // When the plane is left live it outlives that art: the control is still a
    // direct child of the pane, so the plane still spans [58, stage - 8] over
    // a list that has just moved back up to the top of the pane
    expect(plane.declarations['pointer-events']).toBeUndefined()

    // Then the same block neutralises it, exactly as it already resets the
    // list offset - by returning the pseudo to the inert decoration role it
    // held before the wide stage took the hit surface, or by collapsing the
    // box. A live pointer-events plane here hands the browsing region to the
    // New Session button, a state reachable at this width because the wide
    // flag can still be set on a narrow viewport.
    const narrowPlane = onlyRule(rules, 'narrow hit plane', (rule) => (
      rule.context.includes('900px') && rule.selector === control.selector + ':before'
    ))
    const inert = narrowPlane.declarations['pointer-events'] === 'none'
      || /^0(?:px)?$/.test(narrowPlane.declarations['height'] ?? '')
    expect(inert, 'the narrow block must neutralise the stage-sized hit plane').toBe(true)
  })
})
