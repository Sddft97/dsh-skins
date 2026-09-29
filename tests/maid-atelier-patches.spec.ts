/**
 * maid-atelier stylesheet guards (issues #1501 and #1742).
 *
 * #1501: the skin shipped three Desktop-only rendering defects — the composer
 * backing layer painted above the typed text, the character stage relied on a
 * negative z-index plus paint containment that the Electron compositor dropped,
 * and the statistics strip sat outside the dock selectors so its text kept the
 * tertiary label colour. #1742: the body-level top trim painted over the
 * official plugin manager page head, hiding the crumb back to the plugin list.
 * Each fix is a single declaration that an unrelated edit could silently undo,
 * so this spec pins the declarations, the precondition that makes the stacking
 * one work, and (for #1742) the cascade the declarations actually produce.
 */

// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Path-based like the other jsdom specs: under the jsdom environment the URL
// base of import.meta.url is not a file: URL, so resolving from __dirname is
// the stable form.
const CSS = readFileSync(resolve(__dirname, '../skins/maid-atelier/patches.css'), 'utf8')

/** The declaration block of the rule whose selector starts a line. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp('^' + escaped + ' \\{', 'm').exec(CSS)
  expect(match, 'rule not found: ' + selector).not.toBeNull()
  const start = CSS.indexOf('{', match!.index)
  return CSS.slice(start + 1, CSS.indexOf('}', start))
}

describe('maid-atelier composer backing', () => {
  it('keeps the backing layer under the card content', () => {
    const declarations = block('[data-composer-card]:after')
    expect(declarations).toContain('z-index: -1')
    expect(declarations).not.toContain('z-index: 0')
  })

  it('keeps the stacking context that makes -1 paint above the card background', () => {
    // Without isolation the negative-z layer would escape the card's stacking
    // context and could fall behind an ancestor background instead.
    expect(CSS).toMatch(/\[data-composer-card\],[\s\S]{0,80}?isolation: isolate/)
  })
})

describe('maid-atelier character stage', () => {
  it('does not depend on negative z-index or paint containment', () => {
    const declarations = block('[data-skin-chrome="character-stage"]')
    expect(declarations).toContain('z-index: 0')
    expect(declarations).not.toContain('z-index: -1')
    expect(declarations).not.toContain('contain:')
  })

  it('stays a non-interactive full-viewport layer', () => {
    const declarations = block('[data-skin-chrome="character-stage"]')
    expect(declarations).toContain('pointer-events: none')
    expect(declarations).toContain('position: fixed')
  })
})

describe('maid-atelier statistics strip', () => {
  it('colors the strip the composer dock selectors never reached', () => {
    expect(block('body:not([data-ds-dark-theme]) [data-composer-stats]')).toContain('color: #33415f')
    expect(block('body:not([data-ds-dark-theme]) [data-composer-stats] [class*="sep"]')).toContain('color: #7d8aa6')
    expect(block('body[data-ds-dark-theme] [data-composer-stats]')).toContain('color: #aebdde')
    expect(block('body[data-ds-dark-theme] [data-composer-stats] [class*="sep"]')).toContain('color: #aebdde80')
  })

  it('leaves the strip background to the layers beneath it', () => {
    // The official StatsPills root is background: transparent; a background
    // here would fight the skin's own composer layers.
    expect(block('body:not([data-ds-dark-theme]) [data-composer-stats]')).not.toContain('background')
  })
})

/** The trim plus its two layers, exactly as hooks.mjs builds them. */
const TRIM = '<div data-skin-chrome="top-trim"><div data-skin-trim-layer="landing"></div>'
  + '<div data-skin-trim-layer="workspace"></div></div>'

/**
 * The plugin manager as the shell mounts it: the main outlet is a
 * `display: contents` anchor (ui-renderer SlotOutlet), so the page's own head
 * row starts at the window's top edge, inside the trim's 76px band.
 */
const MAIN_PANEL_PAGE = '<div data-slot="main" style="display: contents">'
  + '<section data-plugin-panel aria-busy="false">'
  + '<header><h1>Plugins</h1></header></section></div>' + TRIM

/** An ordinary active conversation, for the untouched-look baseline. */
const MAIN_CONVERSATION = '<div data-slot="main" style="display: contents">'
  + '<div data-phase="active"><div data-slot="conversation" data-dsh-surface="conversation"></div></div>'
  + '</div>' + TRIM

/**
 * The trim's computed style under a fixture, with the real stylesheet applied.
 * `sidebarSize` is the state hooks.mjs writes for the measured sidebar width
 * (rail <= 120px, narrow <= 220px, wide above), so the yield is asserted at
 * every sidebar width the skin distinguishes.
 */
function topTrimStyle(bodyHtml: string, dark: boolean, sidebarSize = 'wide'): { display: string; height: string } {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.setAttribute('data-dsh-skin', 'maid-atelier')
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.setAttribute('data-maid-sidebar-size', sidebarSize)
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  document.body.innerHTML = bodyHtml
  const trim = document.body.querySelector('[data-skin-chrome="top-trim"]')
  expect(trim, 'the fixture must mount the trim layer').not.toBeNull()
  const computed = getComputedStyle(trim as Element)
  return { display: computed.display, height: computed.height }
}

describe('maid-atelier plugin manager top-trim yield (#1742)', () => {
  it('removes the decoration from the plugin manager page in both themes', () => {
    // Given the official plugin manager page occupying the main outlet
    // When the trim's computed style is read
    // Then it paints nothing, so the page head and its crumb stay visible
    // (the 76px band is still there, only its paint is dropped)
    expect(topTrimStyle(MAIN_PANEL_PAGE, false)).toEqual({ display: 'none', height: '76px' })
    expect(topTrimStyle(MAIN_PANEL_PAGE, true)).toEqual({ display: 'none', height: '76px' })
  })

  it('yields at every sidebar width the skin distinguishes', () => {
    // Given the plugin manager page mounted while the sidebar is a rail,
    // narrow, or wide (the widths hooks.mjs measures and records)
    // When the trim's computed display is read at each width
    // Then it is hidden at all of them, in both themes
    for (const size of ['rail', 'narrow', 'wide']) {
      expect(topTrimStyle(MAIN_PANEL_PAGE, false, size).display, 'light ' + size).toBe('none')
      expect(topTrimStyle(MAIN_PANEL_PAGE, true, size).display, 'dark ' + size).toBe('none')
    }
  })

  it('keeps the decoration over the conversation area unchanged', () => {
    // Given an ordinary active conversation in the same body-level position
    // When the same layer is read
    // Then the absolute 76px band still paints (the skin's own look is intact)
    expect(topTrimStyle(MAIN_CONVERSATION, false)).toEqual({ display: 'block', height: '76px' })
    expect(topTrimStyle(MAIN_CONVERSATION, true)).toEqual({ display: 'block', height: '76px' })
  })

  it('pins the yield declaration and the base trim declaration it overrides', () => {
    // The yield is one declaration; the conversation-area rule keeps its
    // absolute 76px band and its sidebar-width offset.
    const yieldBlock = block('body:has([data-slot="main"] [data-plugin-panel]) [data-skin-chrome="top-trim"],'
      + '\nbody:has([data-slot="main"] [data-plugin-detail]) [data-skin-chrome="top-trim"]')
    expect(yieldBlock).toContain('display: none')
    const base = block('[data-skin-chrome="top-trim"]')
    expect(base).toContain('position: absolute')
    expect(base).toContain('height: 76px')
    expect(base).toContain('translate: var(--maid-sidebar-width) 0')
    expect(base).not.toContain('display: none')
  })

  it('anchors the yield on the official data-plugin-* hooks, never a hash class', () => {
    // The manager page carries data-plugin-panel / data-plugin-detail; its
    // CSS-module class names change on any official build, so this fails if
    // the yield is ever re-anchored on [class*=...].
    const at = CSS.indexOf('body:has([data-slot="main"] [data-plugin-panel])')
    expect(at, 'the yield rule must exist').toBeGreaterThanOrEqual(0)
    const selectorList = CSS.slice(at, CSS.indexOf('{', at))
    expect(selectorList).toContain('[data-plugin-panel]')
    expect(selectorList).toContain('[data-plugin-detail]')
    expect(selectorList).not.toContain('[class*=')
  })
})

describe('maid-atelier desktop whole-window frame transparency (#1763)', () => {
  it('sets transparent background on the whole-window frame element', () => {
    const declarations = block('[class*="_frame"]')
    expect(declarations).toContain('background: transparent !important')
  })
})

describe('maid-atelier desktop titlebar brand svg sizing (#1763)', () => {
  it('restores fixed height and flex none on titlebar-brand svg', () => {
    const declarations = block('[data-skin-chrome="titlebar-brand"] svg')
    expect(declarations).toContain('height: 18px')
    expect(declarations).toContain('flex: none')
  })
})
