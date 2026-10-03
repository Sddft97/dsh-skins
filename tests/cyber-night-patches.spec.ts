// @vitest-environment jsdom

/**
 * cyber-night stylesheet guards (issues #1745 A / #1746 and #1763).
 *
 * The skin declares a full-viewport `contributes.backgroundMedia` illustration
 * the host appends to <body> at z-index: -2. Two separate stacking facts hid it
 * on the Windows desktop client while the web host rendered it:
 *
 *  - the skin's own skin.css paints an opaque
 *    `body[data-ds-dark-theme] { background-color: #04060d }`, so without a
 *    stacking context on body the -2 layer propagated to the root and painted
 *    before that background (#1745 A / #1746);
 *  - the Windows shell paints a 90% opaque --dsw-specific-sidebar-fill on its
 *    whole-window frame element, a stacking context that paints after every
 *    negative-z descendant (#1763).
 *
 * Each fix is a single declaration an unrelated edit could silently undo, so
 * this spec pins the declarations, the surface they must live on, and - the
 * part that actually decides whether they reach the browser - the scoped
 * selectors the skin-center /patches transform produces for them.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { transformSkinCss } from '../src/core/css-safety/transform.ts'

// Path-based like the other jsdom specs: under the jsdom environment the URL
// base of import.meta.url is not a file: URL, so resolving from __dirname is
// the stable form.
const SKIN_ID = 'cyber-night'
const SCOPE = `html[data-dsh-skin="${SKIN_ID}"]`
const DIR = resolve(__dirname, '../skins/cyber-night')
const CSS = readFileSync(resolve(DIR, 'patches.css'), 'utf8')
const TRANSFORMED = transformSkinCss(CSS, { skinId: SKIN_ID, filename: 'patches.css' })

/** The declaration block of the rule whose selector starts a line. */
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp('^' + escaped + ' \\{', 'm').exec(css)
  expect(match, 'rule not found: ' + selector).not.toBeNull()
  const start = css.indexOf('{', match!.index)
  return css.slice(start + 1, css.indexOf('}', start))
}

describe('cyber-night background illustration: body stacking root (#1745 A / #1746)', () => {
  it('gives body its own stacking context', () => {
    // Given the skin's patch stylesheet
    // When the body rule is read
    // Then body isolates, so the opaque body background paints at the canvas
    // step and the host's -2 illustration layer paints above it again
    expect(block(CSS, 'body')).toContain('isolation: isolate')
  })

  it('never moves the rule onto a head the patch pipeline cannot scope', () => {
    // The /patches route force-scopes every selector under
    // html[data-dsh-skin="<id>"]; a :root or html head rewrites into the scope
    // itself, so isolation there would never reach the body element.
    expect(CSS).not.toMatch(/^:root[^{]*\{[^}]*isolation: isolate/m)
    expect(CSS).not.toMatch(/^html[^{]*\{[^}]*isolation: isolate/m)
  })

  it('leaves the host layer z-index alone so the conversation stays on top', () => {
    // The host owns the -2 layer. Raising it to 0 would paint the illustration
    // over the conversation, so the skin must never target that element at all.
    expect(CSS).not.toMatch(/data-dsh-skin-layer/)
  })
})

describe('cyber-night background illustration: Windows frame transparency (#1763)', () => {
  it('clears the whole-window frame the desktop shell paints opaque', () => {
    // Given the Windows shell's 90% opaque sidebar fill on its frame element
    // When the skin's patch stylesheet is read
    // Then the frame is forced transparent, because that frame is a stacking
    // context and paints after every negative-z descendant
    const declarations = block(CSS, '[class*="_frame"]')
    expect(declarations).toContain('background: transparent !important')
  })

  it('anchors on the hashed class suffix the host actually emits', () => {
    // The shell's frame class is a CSS-module hash (e.g. ZTP-Xa_frame); a bare
    // [class*="frame"] would also be a valid match, but the suffix form is the
    // one already proven on maid-atelier, so both skins stay interchangeable.
    expect(CSS).toContain('[class*="_frame"]')
  })
})

describe('cyber-night fix as the skin-center serves it', () => {
  it('scopes body isolation into a selector that can match the body', () => {
    // Given the /patches transform the skin center applies on every activation
    // When the isolation declaration is looked up in the output
    // Then it is a descendant of the skin scope, so the body element matches
    const code = TRANSFORMED.code
    expect(code).toContain(`${SCOPE} body`)
    const start = code.indexOf(`${SCOPE} body`)
    const declarations = code.slice(code.indexOf('{', start) + 1, code.indexOf('}', start))
    expect(declarations).toContain('isolation: isolate')
  })

  it('scopes the frame rule into a selector that can match the shell frame', () => {
    // Then the attribute selector survives the prefixing intact, unquoted-value
    // forms and all, so a hashed ZTP-Xa_frame element matches it.
    expect(TRANSFORMED.code).toContain(`${SCOPE} [class*="_frame"]`)
  })

  it('reports no scoping or whitelist diagnostics for the added rules', () => {
    // [class*=] reliance warns, as it does for maid-atelier, but nothing in the
    // added rules may fail closed: the stylesheet has to keep serving.
    expect(TRANSFORMED.warnings.filter((w) => w.includes('_frame'))).toEqual([])
  })
})

/**
 * The Windows shell as the browser paints it: an opaque frame element wrapping
 * the app, plus the host's own background layer appended to <body> at -2.
 */
const WINDOWS_SHELL = '<div class="ZTP-Xa_frame">'
  + '<div data-dsh-skin-layer="background" style="position:absolute;inset:0;z-index:-2"></div>'
  + '<div data-dsh-skin-layer="foreground"></div></div>'

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
  // querySelector only searches descendants, and body is the fixture root.
  const element = selector === 'body' ? document.body : document.body.querySelector(selector)
  expect(element, 'the fixture must mount ' + selector).not.toBeNull()
  return getComputedStyle(element as Element)
}

describe('cyber-night under the Windows shell', () => {
  it('isolates the body so the -2 layer is not painted under the skin background', () => {
    // Given the served stylesheet on a dark-theme body
    // When the body's computed isolation is read
    // Then the body is a stacking context of its own
    expect(computedUnder('body', 'body { background-color: #04060d; }').isolation).toBe('isolate')
  })

  it('wins the cascade against the shell frame fill', () => {
    // Given the shell's own frame background, a normal declaration
    // When the frame's computed background-color is read
    // Then the skin's !important transparency wins, so the frame stops
    // covering the illustration
    const shell = '.ZTP-Xa_frame { background-color: rgba(4, 6, 13, 0.9); }'
    expect(computedUnder('.ZTP-Xa_frame', shell).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })
})
