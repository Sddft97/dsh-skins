import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Where the orca-link settings dialog lands inside the viewport.
 *
 * orca-link is the only skin in the catalog that overrides where the settings
 * dialog sits: its patches dock a fixed-size panel into the lower-left corner,
 * clear of the sidebar rail. A corner dock carries no relationship to the
 * viewport it lands in, so on a 4K display the dialog stayed 760x680 in the
 * corner of a 3840x2160 screen and read as dislocated
 * (zhu1090093659/dsh-web#1792). The dock is kept for exactly as long as a
 * centred dialog would still land on the rail.
 *
 * jsdom boxes every element at 0x0, so nothing here is measured -- the box the
 * reporter sees is computed. The cascade the browser would apply is resolved
 * out of the authored stylesheet (media queries, specificity, source order and
 * the padding shorthand included), the panel's own width and height are
 * evaluated as CSS lengths, and the overlay's flex alignment places the panel.
 * The assertions read that box.
 *
 * The resolver models the two boxes the placement rules address and the
 * data-orca-settings-open / data-orca-sidebar-wide body markers the skin sets,
 * so a test states the body state it means. It does not model the rest of the
 * page: those boxes are fixed by the host's own centered overlay, and no rule
 * here changes them.
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

// Parsed once: the width sweep below resolves the cascade for over a thousand
// viewports, and re-reading and re-parsing an 80kB stylesheet each time made it
// the slowest test in the file for no benefit.
let parsedPatches: CssRule[] | undefined

function patches(): CssRule[] {
  parsedPatches ??= parseRules(readFileSync(resolve(__dirname, '../skins/orca-link/patches.css'), 'utf-8'))
  return parsedPatches
}

interface Viewport {
  width: number
  height: number
}

/** The skin's own :root custom properties the settings rules resolve against. */
const ROOT_VARIABLES: Record<string, string> = {
  '--orca-sidebar-width': 'clamp(258px, 20.2vw, 326px)',
}

function mediaQueryApplies(query: string, viewport: Viewport): boolean {
  return splitTopLevel(query, ',').some((alternative) =>
    alternative.split(/\s+and\s+/).every((feature) => {
      // The suite models a plain desktop with motion allowed, so a
      // reduced-motion preference never matches here.
      if (/^\(prefers-reduced-motion\s*:/i.test(feature)) return false
      const match = /^\(\s*(width|height)\s*(>=|<=)\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(feature.trim())
      // An unrecognized feature throws instead of answering false. Returning
      // false would read as "this query does not apply here" and quietly drop
      // a rule the browser would have applied, which is exactly the direction
      // that makes a placement suite report a false pass.
      if (match === null) throw new Error('unsupported media feature: ' + feature)
      const actual = match[1] === 'width' ? viewport.width : viewport.height
      return match[2] === '>=' ? actual >= Number(match[3]) : actual <= Number(match[3])
    }),
  )
}

/**
 * Whether a rule nested in this at-rule context reaches the viewport.
 *
 * A @media query is evaluated. @supports and @container are not modellable
 * here, so their blocks are read as applying -- which is only safe while none
 * of them addresses the settings overlay or panel, and a test below pins that.
 * Any other at-rule throws, so a new one cannot quietly drop declarations.
 */
function contextApplies(context: string, viewport: Viewport): boolean {
  if (context === '') return true
  const atRule = /^@([a-z-]+)\s*/i.exec(context)
  if (atRule === null) throw new Error('unreadable at-rule context: ' + context)
  const name = atRule[1]!.toLowerCase()
  if (name === 'media') return mediaQueryApplies(context.slice(atRule[0].length), viewport)
  if (name === 'supports' || name === 'container') return true
  throw new Error('unsupported at-rule: ' + name)
}

/** A recursive-descent reader for the CSS values the skin writes here. */
class Length {
  private cursor = 0

  constructor(private readonly source: string, private readonly viewport: Viewport) {}

  parse(): number {
    const value = this.expression()
    this.space()
    if (this.cursor !== this.source.length) {
      throw new Error('unread tail: ' + this.source.slice(this.cursor))
    }
    return value
  }

  private space(): void {
    while (this.cursor < this.source.length && /\s/.test(this.source[this.cursor]!)) this.cursor += 1
  }

  private expression(): number {
    let value = this.term()
    for (;;) {
      this.space()
      const operator = this.source[this.cursor]
      if (operator !== '+' && operator !== '-') return value
      this.cursor += 1
      const right = this.term()
      value = operator === '+' ? value + right : value - right
    }
  }

  private term(): number {
    let value = this.factor()
    for (;;) {
      this.space()
      const operator = this.source[this.cursor]
      if (operator !== '*' && operator !== '/') return value
      this.cursor += 1
      const right = this.factor()
      value = operator === '*' ? value * right : value / right
    }
  }

  private factor(): number {
    this.space()
    if (this.source[this.cursor] === '(') {
      this.cursor += 1
      const value = this.expression()
      this.close(')')
      return value
    }
    const call = /^[a-zA-Z-]+/.exec(this.source.slice(this.cursor))
    if (call !== null) {
      this.cursor += call[0].length
      this.close('(')
      const args: number[] = []
      if (this.source[this.cursor] !== ')') {
        for (;;) {
          args.push(this.expression())
          this.space()
          if (this.source[this.cursor] !== ',') break
          this.cursor += 1
        }
      }
      this.close(')')
      const name = call[0].toLowerCase()
      if (name === 'calc') return args[0] ?? 0
      if (name === 'min') return Math.min(...args)
      if (name === 'max') return Math.max(...args)
      if (name === 'clamp') return Math.min(Math.max(args[0] ?? 0, args[1] ?? 0), args[2] ?? 0)
      throw new Error('unsupported function ' + name)
    }
    return this.number()
  }

  private close(character: string): void {
    if (this.source[this.cursor] !== character) {
      throw new Error('expected ' + character + ' in ' + this.source)
    }
    this.cursor += 1
  }

  private number(): number {
    const match = /^\d+(\.\d+)?/.exec(this.source.slice(this.cursor))
    if (match === null) throw new Error('expected a number in ' + this.source)
    this.cursor += match[0].length
    const value = Number(match[0])
    this.space()
    const unit = /^[a-z%]+/.exec(this.source.slice(this.cursor))
    if (unit === null) return value
    this.cursor += unit[0].length
    return value * this.scale(unit[0].toLowerCase())
  }

  private scale(unit: string): number {
    if (unit === 'px') return 1
    if (unit === 'vw') return this.viewport.width / 100
    if (unit === 'vh' || unit === 'dvh') return this.viewport.height / 100
    throw new Error('unsupported unit ' + unit)
  }
}

function length(expression: string, viewport: Viewport): number {
  const resolved = expression.replace(/var\((--[\w-]+)\)/g, (_match, name: string) => {
    const value = ROOT_VARIABLES[name]
    if (value === undefined) throw new Error('unknown variable ' + name)
    return value
  })
  return new Length(resolved, viewport).parse()
}

type Weight = [number, number, number]

const compareWeight = (a: Weight, b: Weight): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** Splits on a separator, ignoring separators nested inside parentheses. */
function splitTopLevel(source: string, separator: ',' | ' '): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (depth === 0 && (separator === ',' ? character === ',' : /\s/.test(character))) {
      if (source.slice(start, index).trim() !== '') parts.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  if (source.slice(start).trim() !== '') parts.push(source.slice(start).trim())
  return parts
}

/** Counts a selector as [ids, classes+attributes+pseudo-classes, elements]. */
function specificityOf(selector: string): Weight {
  // Selectors Level 4: :has() weighs exactly as its most specific argument
  // and nothing else, so it is peeled off and its weight added column by
  // column. Counting it as a pseudo-class as well would overstate every
  // selector that uses it, and shifting its columns would compare an id
  // against a class.
  let total: Weight = [0, 0, 0]
  let rest = selector
  for (let guard = 0; guard < 8; guard += 1) {
    const open = rest.indexOf(':has(')
    if (open === -1) break
    let depth = 1
    let cursor = open + 5
    while (cursor < rest.length && depth > 0) {
      if (rest[cursor] === '(') depth += 1
      else if (rest[cursor] === ')') depth -= 1
      cursor += 1
    }
    const inner = rest.slice(open + 5, cursor - 1)
    rest = rest.slice(0, open) + rest.slice(cursor)
    let best: Weight = [0, 0, 0]
    for (const argument of splitTopLevel(inner, ',')) {
      const candidate = specificityOf(argument)
      if (compareWeight(candidate, best) > 0) best = candidate
    }
    total = [total[0] + best[0], total[1] + best[1], total[2] + best[2]]
  }
  const ids = (rest.match(/#[A-Za-z0-9_-]+/g) ?? []).length
  const attributes = (rest.match(/\[[^\]]*\]/g) ?? []).length
  const classes = (rest.match(/\.[A-Za-z0-9_-]+/g) ?? []).length
  const pseudoClasses = (rest.match(/(^|[^:]):[A-Za-z-]+/g) ?? []).length
  const elements = (rest.match(/(^|[\s>+~])[A-Za-z][\w-]*/g) ?? []).length
  return [
    total[0] + ids,
    total[1] + attributes + classes + pseudoClasses,
    total[2] + elements,
  ]
}

/** The body markers a selector requires, read off its explicit body compound. */
function bodyRequirements(selector: string): string[] {
  return [...selector.matchAll(/\bbody\[([^\]=]+)/g)].map((match) => match[1]!)
}

/**
 * The last compound of a selector, which is what decides which box it hits.
 */
function lastCompound(selector: string): string {
  // A combinator inside a functional pseudo-class is not a subject combinator:
  // ":has(> [data-dsh-surface])" ends the overlay rather than descending from
  // it, so the scan tracks parenthesis depth instead of splitting on every
  // greater-than or space in the selector.
  let depth = 0
  let start = 0
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (depth === 0 && /[\s>+~]/.test(character)) start = index + 1
  }
  return selector.slice(start).trim()
}

function hitsBox(selector: string, box: 'overlay' | 'panel'): boolean {
  const target = lastCompound(selector)
  return box === 'overlay'
    ? target.includes('[class*="_overlay"]')
    : target === '[data-dsh-surface="settings"]'
}

/** The padding shorthand resolved to its four longhands. */
function expandShorthand(property: string, value: string): Array<[string, string]> {
  if (property !== 'padding') return [[property, value]]
  const parts = splitTopLevel(value, ' ')
  const top = parts[0] ?? '0px'
  const right = parts[1] ?? top
  const bottom = parts[2] ?? top
  const left = parts[3] ?? right
  return [
    ['padding-top', top],
    ['padding-right', right],
    ['padding-bottom', bottom],
    ['padding-left', left],
  ]
}

/** The declarations in effect for a box, after media queries and the cascade. */
function appliedDeclarations(
  viewport: Viewport,
  box: 'overlay' | 'panel',
  body: ReadonlySet<string>,
): Record<string, string> {
  const winners = new Map<string, { weight: Weight; order: number; value: string }>()
  patches().forEach((rule, order) => {
    // Which box a rule addresses is decided before its at-rule context is.
    // A @keyframes block parses into "selectors" such as "0%" and "to" that
    // address no element, so resolving its context first would mean teaching
    // the resolver about every declaration at-rule in the stylesheet instead
    // of only the ones that can place a dialog.
    const matching = splitTopLevel(rule.selector, ',')
      .filter((selector) => hitsBox(selector, box))
      .filter((selector) => bodyRequirements(selector).every((name) => body.has(name)))
    if (matching.length === 0) return
    if (!contextApplies(rule.context, viewport)) return
    const weight = matching.map(specificityOf).reduce((a, b) => (compareWeight(b, a) > 0 ? b : a))
    for (const [property, value] of Object.entries(rule.declarations)) {
      for (const [name, resolved] of expandShorthand(property, value)) {
        const held = winners.get(name)
        if (held === undefined || compareWeight(weight, held.weight) > 0 || (compareWeight(weight, held.weight) === 0 && order > held.order)) {
          winners.set(name, { weight, order, value: resolved })
        }
      }
    }
  })
  const effective: Record<string, string> = {}
  for (const [name, winner] of winners) effective[name] = winner.value
  return effective
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

function offset(mode: string | undefined, space: number, size: number): number {
  if (mode === 'flex-end' || mode === 'end') return space - size
  if (mode === 'center') return (space - size) / 2
  return 0
}

/** The dialog box, as the browser would place it in the given viewport. */
function dialogBox(viewport: Viewport, body: ReadonlySet<string>): Box {
  const overlay = appliedDeclarations(viewport, 'overlay', body)
  const panel = appliedDeclarations(viewport, 'panel', body)
  const edge = (side: string): number => length(overlay['padding-' + side] ?? '0px', viewport)
  const width = length(panel['width'] ?? '0px', viewport)
  const height = length(panel['height'] ?? '0px', viewport)
  const left = edge('left') + offset(overlay['justify-content'], viewport.width - edge('left') - edge('right'), width)
  const top = edge('top') + offset(overlay['align-items'], viewport.height - edge('top') - edge('bottom'), height)
  return { left, top, width, height }
}

const centreOf = (from: number, size: number): number => from + size / 2

/** The dialog box with the settings dialog open, in either sidebar state. */
const withWideSidebar = new Set(['data-orca-settings-open', 'data-orca-sidebar-wide'])
const withNarrowSidebar = new Set(['data-orca-settings-open'])

/**
 * The sidebar rail, as the hook would measure it at this viewport.
 *
 * The skin's sidebar-width hook re-measures --orca-sidebar-width onto <body>
 * from the live sidebar, so this is the CSS default rather than the real thing
 * -- the suite cannot know a real measurement. It is what the DOCK branch is
 * written against, so it is the right bound for asserting the dock.
 */
const measuredRail = (viewport: Viewport): number => length(ROOT_VARIABLES['--orca-sidebar-width']!, viewport)

/**
 * The widest the sidebar rail can ever be.
 *
 * 326px is the clamp() ceiling in skin.css, and the hook's measurement can only
 * land under it. The centring branch has to clear this worst case rather than a
 * typical one: the hand-over width is derived from it, and a breakpoint moved
 * earlier than the derivation allows would put the dialog on the rail for the
 * widest sidebar the skin can produce while still clearing a typical one.
 */
const WIDEST_RAIL = 326
const RAIL_GAP = 16

describe('orca-link settings dialog is centred on a large display', () => {
  // The reporter's machine is a 3840x2160 panel; Windows display scaling is
  // unknown. Scaling is what sets the CSS viewport, and the CSS viewport is
  // what decides the outcome, so the three viewports below are the same 4K
  // panel at 100%, 150% and 200% scaling.
  const FOUR_K: Array<[string, Viewport]> = [
    ['3840x2160 at 100% scaling', { width: 3840, height: 2160 }],
    ['2560x1440 at 150% scaling', { width: 2560, height: 1440 }],
    ['1920x1080 at 200% scaling', { width: 1920, height: 1080 }],
  ]

  for (const [description, viewport] of FOUR_K) {
    for (const [sidebar, body] of [['wide', withWideSidebar], ['narrow', withNarrowSidebar]] as const) {
      it('user sees the settings page in the centre of ' + description + ' with a ' + sidebar + ' sidebar', () => {
        // Given a 4K display showing the settings dialog
        // When the skin's own placement rules are resolved for that viewport
        const overlay = appliedDeclarations(viewport, 'overlay', body)
        const box = dialogBox(viewport, body)
        // Then the overlay centres the dialog on both axes rather than docking it
        expect(overlay['justify-content']).toBe('center')
        expect(overlay['align-items']).toBe('center')
        // And the dialog's centre is the screen's centre
        expect(centreOf(box.left, box.width)).toBeCloseTo(viewport.width / 2, 1)
        expect(centreOf(box.top, box.height)).toBeCloseTo(viewport.height / 2, 1)
      })
    }
  }

  // This one is a containment invariant, not the guard for the reported bug:
  // the corner dock also kept the dialog on screen, so this passes either way.
  // What it does catch is a centred panel whose own padding and size no longer
  // fit, which is the failure mode centring introduces and docking never had.
  it('user never sees the dialog cross an edge of a large display', () => {
    // Given large displays, including the narrowest one that centres
    const viewports: Viewport[] = [
      { width: 3840, height: 2160 },
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
      { width: 1444, height: 900 },
    ]
    for (const viewport of viewports) {
      const box = dialogBox(viewport, withWideSidebar)
      // When the dialog is placed
      // Then it stays inside the viewport on every side
      expect(box.left, 'left edge at ' + viewport.width).toBeGreaterThanOrEqual(0)
      expect(box.top, 'top edge at ' + viewport.height).toBeGreaterThanOrEqual(0)
      expect(box.left + box.width, 'right edge at ' + viewport.width).toBeLessThanOrEqual(viewport.width)
      expect(box.top + box.height, 'bottom edge at ' + viewport.height).toBeLessThanOrEqual(viewport.height)
    }
  })

  // The dock is kept precisely while a centred dialog would still land on the
  // sidebar rail. These two viewports straddle the width where that stops
  // being true, so neither branch can drift back into the other.
  it('hands the dialog over from the dock to the centre without either losing the rail', () => {
    // Given the narrowest display that still docks, and the narrowest that centres
    const docked: Viewport = { width: 1443, height: 900 }
    const centred: Viewport = { width: 1444, height: 900 }
    // When each places the dialog beside the wide sidebar rail
    const dockedBox = dialogBox(docked, withWideSidebar)
    const centredBox = dialogBox(centred, withWideSidebar)
    // Then the docked one keeps the corner seat and still clears the rail it
    // was written against, which is the branch this change must not disturb
    expect(centreOf(dockedBox.left, dockedBox.width)).toBeLessThan(centred.width / 2)
    expect(dockedBox.left).toBeGreaterThanOrEqual(measuredRail(docked) + RAIL_GAP)
    // And the centred one takes the middle while still clearing the WIDEST rail
    // the skin can produce, which is the bound 1444 was derived from. This is
    // the assertion that fails if the hand-over width is ever moved earlier
    // than the derivation allows: at 1380 the centred panel would start at
    // 310px and sit under a 326px rail, while still clearing a typical one.
    expect(centreOf(centredBox.left, centredBox.width)).toBeCloseTo(centred.width / 2, 1)
    expect(centredBox.left).toBeGreaterThanOrEqual(WIDEST_RAIL + RAIL_GAP)
  })

  // The hand-over test above pins one pair of widths, which is enough to
  // catch the centring rule being deleted but not enough to catch its
  // breakpoint being moved EARLIER, where the dialog is still centred and still
  // passes the pair -- just at a width where it lands on the rail. This states
  // the derivation as an invariant over the whole range instead: centring is
  // allowed at any width, and only at widths where the panel clears the
  // worst-case rail. Move the breakpoint below the derived width and the sweep
  // walks straight into a width where the two disagree.
  it('centres the dialog only at widths where it clears the worst-case rail', () => {
    // Given every desktop width from the dock floor up to a large display.
    // The sweep stops at 2000px: past there the panel clears the rail by
    // hundreds of pixels, so no further width can be the deciding one.
    const failures: string[] = []
    for (let width = 1100; width <= 2000; width += 1) {
      const viewport: Viewport = { width, height: 900 }
      const overlay = appliedDeclarations(viewport, 'overlay', withWideSidebar)
      if (overlay['justify-content'] !== 'center') continue
      const box = dialogBox(viewport, withWideSidebar)
      // When the dialog is centred at that width
      // Then it is in the middle and clear of the widest rail the skin can make
      if (box.left < WIDEST_RAIL + RAIL_GAP) {
        failures.push(width + 'px centres at left ' + Math.round(box.left) + 'px')
      }
      if (Math.abs(centreOf(box.left, box.width) - width / 2) > 0.5) {
        failures.push(width + 'px is not centred')
      }
    }
    // Then no width centres the dialog where it would cover the rail
    expect(failures).toEqual([])
  })

  it('user still sees the dialog docked on a desktop too narrow to clear the rail', () => {
    // Given a desktop narrower than the hand-over point
    const viewport: Viewport = { width: 1280, height: 800 }
    // When the skin places the dialog
    const overlay = appliedDeclarations(viewport, 'overlay', withWideSidebar)
    // Then the corner dock is unchanged, so narrow desktops keep the skin's seat
    expect(overlay['justify-content']).toBe('flex-start')
    expect(overlay['align-items']).toBe('flex-end')
  })

  it('user still sees the settings page fill a small display', () => {
    // Given a window too small for the docked dialog
    const viewport: Viewport = { width: 900, height: 700 }
    // When the dialog is placed
    const box = dialogBox(viewport, withWideSidebar)
    // Then it goes full-bleed, which the centring rule must not shrink
    expect(box.width).toBe(viewport.width)
    expect(box.height).toBe(viewport.height)
  })

  // The resolver ignores !important, so a placement declaration that used it
  // would be reported as the winning declaration while the browser computed
  // something else. Nothing that places the dialog may use it.
  it('places the dialog without an important declaration', () => {
    // Given every rule that places the overlay or sizes the panel
    const important = patches().flatMap((rule) =>
      splitTopLevel(rule.selector, ',')
        .filter((selector) => hitsBox(selector, 'overlay') || hitsBox(selector, 'panel'))
        .flatMap((selector) => Object.entries(rule.declarations))
        .filter(([, value]) => /!important\s*$/.test(value))
        .map(([property]) => property + ' in ' + rule.selector))
    // Then none of them is important
    expect(important).toEqual([])
  })

  // contextApplies reads @supports and @container blocks as applying, because a
  // feature query and a container query are not things this suite can evaluate.
  // That is only harmless while neither of them places a dialog, which is what
  // this pins: if one ever starts to, the assumption has to become a real
  // evaluation instead of a silent guess in the direction that hides a rule.
  it('keeps every rule the resolver cannot evaluate out of the dialog placement', () => {
    // Given every rule nested in a block whose condition cannot be evaluated
    const unmodellable = patches().filter((rule) => /^@(supports|container)\b/i.test(rule.context))
    // When the ones addressing the overlay or the panel are collected
    const placing = unmodellable
      .flatMap((rule) => splitTopLevel(rule.selector, ',')
        .filter((selector) => hitsBox(selector, 'overlay') || hitsBox(selector, 'panel'))
        .map((selector) => rule.context + ' >> ' + selector))
    // Then there are none, so reading those blocks as applying cannot hide one
    expect(placing).toEqual([])
  })
})
