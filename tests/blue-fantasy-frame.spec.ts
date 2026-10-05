// @vitest-environment jsdom

/**
 * blue-fantasy Windows whole-window frame transparency (issue #1803).
 *
 * The skin defines --dsw-specific-sidebar-fill as a scrim-tracking rgba():
 * at the default Background-occlusion 0 its alpha is 1, so the fill is fully
 * opaque. The web host consumes that token on the sidebar only and renders the
 * whale illustration fine, but the Windows desktop shell paints it on its
 * whole-window frame element, which is an ancestor of the conversation column.
 * The opaque frame therefore covered the host's z-index: -2 illustration layer
 * and the window read as flat #1d2539 until the occlusion slider was raised.
 *
 * The fix is the single declaration maid-atelier and cyber-night already ship
 * (#1763). Because it is one line an unrelated edit could silently drop, this
 * spec pins the declaration, the surface it lives on, the selector the
 * skin-center /patches transform produces for it, and the cascade result under
 * a Windows-shell fixture.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { transformSkinCss } from '../src/core/css-safety/transform.ts'

// Path-based like the other jsdom specs: under the jsdom environment the URL
// base of import.meta.url is not a file: URL, so resolving from __dirname is
// the stable form.
const SKIN_ID = 'blue-fantasy'
const SCOPE = `html[data-dsh-skin="${SKIN_ID}"]`
const DIR = resolve(__dirname, '../skins/blue-fantasy')
const PATCHES = readFileSync(resolve(DIR, 'patches.css'), 'utf8')
const TRANSFORMED = transformSkinCss(PATCHES, { skinId: SKIN_ID, filename: 'patches.css' })

/** The declaration block of the rule whose selector starts a line. */
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+$^{}()|[\]\\]/g, '\\$&')
  const match = new RegExp('^' + escaped + ' \\{', 'm').exec(css)
  expect(match, 'rule not found: ' + selector).not.toBeNull()
  const start = css.indexOf('{', match!.index)
  return css.slice(start + 1, css.indexOf('}', start))
}

describe('blue-fantasy Windows frame transparency (#1803)', () => {
  it('clears the whole-window frame the desktop shell paints opaque', () => {
    // Given the Windows shell paints --dsw-specific-sidebar-fill, fully opaque
    // at scrim 0, on its whole-window frame element
    // When the skin's patch stylesheet is read
    // Then the frame is forced transparent, so the -2 illustration shows
    const declarations = block(PATCHES, '[class*="_frame"]')
    expect(declarations).toContain('background: transparent !important')
  })

  it('anchors on the hashed class suffix the host actually emits', () => {
    // The shell's frame class is a CSS-module hash (e.g. BynINW_frame); the
    // suffix form is the one proven on maid-atelier and cyber-night, so the
    // three skins stay interchangeable.
    expect(PATCHES).toContain('[class*="_frame"]')
  })

  it('keeps the scrim-tracking sidebar fill the frame rule must not neutralize', () => {
    // Given the fix targets only the frame
    // When the token definitions are read
    // Then the sidebar token still rides the scrim (the slider keeps working
    // on the panels and the sidebar), and the frame rule declares no token
    const skin = readFileSync(resolve(DIR, 'skin.css'), 'utf8')
    expect(skin).toContain('--dsw-specific-sidebar-fill: rgba(242, 245, 250, calc(1 - var(--dsw-skin-scrim, 0) * .5))')
    expect(skin).toContain('--dsw-specific-sidebar-fill: rgba(29, 37, 57, calc(1 - var(--dsw-skin-scrim, 0) * .45))')
    expect(block(PATCHES, '[class*="_frame"]')).not.toContain('--dsw-specific-sidebar-fill')
  })
})

describe('blue-fantasy frame fix as the skin-center serves it', () => {
  it('scopes the frame rule into a selector that can match the shell frame', () => {
    // Then the attribute selector survives the prefixing intact, unquoted-value
    // forms and all, so a hashed BynINW_frame element matches it.
    expect(TRANSFORMED.code).toContain(`${SCOPE} [class*="_frame"]`)
  })

  it('reports no scoping or whitelist diagnostics for the added rule', () => {
    // [class*=] reliance warns, as it does for maid-atelier, but nothing in the
    // added rule may fail closed: the stylesheet has to keep serving.
    expect(TRANSFORMED.warnings.filter((w) => w.includes('_frame'))).toEqual([])
  })
})

/**
 * The Windows shell as the browser paints it: an opaque frame element wrapping
 * the app, the sidebar column the token is also used on, and the host's own
 * background layer appended to <body> at -2.
 */
const WINDOWS_SHELL = '<div class="BynINW_frame">'
  + '<div class="sidebarCol"></div>'
  + '<div data-dsh-skin-layer="background" style="position:absolute;inset:0;z-index:-2"></div>'
  + '</div>'

/**
 * Computed style of one element under the served stylesheet plus the shell's
 * own fills, with the skin attribute the skin center sets on activation.
 */
function computedUnder(selector: string, hostCss: string): CSSStyleDeclaration {
  document.head.innerHTML = ''
  document.body.innerHTML = WINDOWS_SHELL
  document.documentElement.setAttribute('data-dsh-skin', SKIN_ID)
  document.body.setAttribute('data-ds-dark-theme', '')
  const host = document.createElement('style')
  host.textContent = hostCss
  document.head.append(host)
  const style = document.createElement('style')
  style.textContent = TRANSFORMED.code
  document.head.append(style)
  const element = document.body.querySelector(selector)
  expect(element, 'the fixture must mount ' + selector).not.toBeNull()
  return getComputedStyle(element as Element)
}

describe('blue-fantasy under the Windows shell', () => {
  it('wins the cascade against the shell frame fill at scrim 0', () => {
    // Given the shell's own opaque frame background, a normal declaration
    // When the frame's computed background-color is read
    // Then the skin's !important transparency wins, so the frame stops
    // covering the illustration
    const shell = '.BynINW_frame { background: rgb(29, 37, 57); }'
    expect(computedUnder('.BynINW_frame', shell).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })

  it('leaves the sidebar element the token is used on untouched', () => {
    // Given the same shell and the sidebar column inside the frame
    // When the sidebar's computed background-color is read
    // Then it keeps the host's fill, because the fix targets the frame only
    const shell = '.BynINW_frame { background: rgb(29, 37, 57); }'
      + ' .sidebarCol { background: rgb(29, 37, 57); }'
    expect(computedUnder('.sidebarCol', shell).backgroundColor).toBe('rgb(29, 37, 57)')
  })
})
