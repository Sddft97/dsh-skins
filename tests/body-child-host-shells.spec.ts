import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Host shells that the desktop shell (and plugins) append to document.body are
// not the application root: each one carries its own positioning and stacking.
// The Windows caption menu host is the sharpest example - it is a bare
// <div data-windows-menu> whose role="menubar" lives inside its shadow tree, so
// a fallback selector written as "body > div:not([class]):not([role])" matches
// it, rewrites its position: fixed + z-index: 1100 into relative + 2, and the
// 应用 / 编辑 buttons disappear off the caption (issue #1802). The lift rule
// exists to raise the application body only, and #root is that body.
//
// So a rule may anchor the application root, but no rule may take a classless
// body child as its subject: an element-name or universal subject there matches
// every host shell that happens to be a bare div, including ones a future
// desktop shell or plugin has not shipped yet.
const BODY_CHILD = /^body\s*>\s*/

/** The subject is the rightmost compound of one selector part. */
const subjectOf = (part: string): string =>
  part.trim().split(/\s*>\s*|\s+/).filter(Boolean).pop() ?? ''

/** Drop :not(...) qualifiers so only the real subject remains. */
const withoutNegations = (subject: string): string => {
  let previous = ''
  let current = subject
  while (current !== previous) {
    previous = current
    current = current.replace(/:not\([^()]*\)/g, '')
  }
  return current
}

/** True when the subject is an element type or * with no id, class or attribute. */
const isClasslessElement = (subject: string): boolean => {
  const bare = withoutNegations(subject).trim()
  if (bare === '') return true
  if (bare === '*') return true
  return /^[a-zA-Z][\w-]*$/.test(bare)
}

describe('skin body-child host shell safety', () => {
  const skinsDir = resolve(__dirname, '../skins')

  it('user enabling any skin keeps the desktop caption menus reachable', () => {
    // Given every shipped skin stylesheet
    const offenders: string[] = []
    const rootAnchors: string[] = []
    let scanned = 0

    // When every rule whose subject is a body direct child is inspected
    for (const id of readdirSync(skinsDir)) {
      for (const file of ['skin.css', 'patches.css']) {
        let css: string
        try {
          css = readFileSync(resolve(skinsDir, id, file), 'utf-8')
        } catch {
          continue
        }
        scanned += 1
        const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
        for (const rule of stripped.match(/[^{}]+\{[^{}]*\}/g) ?? []) {
          const brace = rule.indexOf('{')
          const selector = rule.slice(0, brace)
          for (const part of selector.split(',')) {
            const trimmed = part.trim().replace(/\s+/g, ' ')
            if (!BODY_CHILD.test(trimmed)) continue
            const subject = subjectOf(trimmed)
            if (isClasslessElement(subject)) {
              offenders.push(`${id}/${file}: ${trimmed}`)
            } else if (/^#root$/.test(withoutNegations(subject).trim())) {
              rootAnchors.push(`${id}/${file}: ${trimmed}`)
            }
          }
        }
      }
    }

    // Then the scan saw the corpus, the app root stays anchored, and no rule
    // takes a classless body child as its subject
    expect(scanned).toBeGreaterThan(0)
    expect(rootAnchors.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
