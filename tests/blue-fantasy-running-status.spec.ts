/**
 * Blue Fantasy running-status row readability backing guards (issue #20 / dsh-web#1756).
 *
 * Host 0.2.0-rc.1 renders the running status row with [data-chat-running="true"]
 * and [data-shimmer]. The old hashed class substring [class*="turnStatus"] no longer exists.
 * The guard ensures the dead selector is removed and the semantic selector
 * [data-chat-running] > span:has([data-shimmer]) is present with its readability plate.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PATCHES = readFileSync(resolve(__dirname, '../skins/blue-fantasy/patches.css'), 'utf8')
const CSS = PATCHES.replace(/\/\*[\s\S]*?\*\//g, '')

function block(selector: string): string {
  const escaped = selector.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
  const match = new RegExp('^' + escaped + ' \\{', 'm').exec(CSS)
  expect(match, 'rule not found: ' + selector).not.toBeNull()
  const start = CSS.indexOf('{', match!.index)
  return CSS.slice(start + 1, CSS.indexOf('}', start))
}

const RUNNING_STATUS_SELECTOR = '[data-chat-running] > span:has([data-shimmer])'

describe('blue-fantasy running-status row plate (issue #20 / dsh-web#1756)', () => {
  it('never targets the old dead turnStatus selector', () => {
    expect(CSS).not.toContain('turnStatus')
  })

  it('plates the running status row with semantic [data-chat-running] and :has([data-shimmer])', () => {
    const plate = block(RUNNING_STATUS_SELECTOR)
    expect(plate).toContain('background: rgb(242 245 250 / calc(var(--dsh-skin-bubble-alpha, .5) * 1))')
    expect(plate).toContain('backdrop-filter: blur(var(--dsh-skin-bubble-blur, 10px)) saturate(1.3)')
    expect(plate).toContain('border-radius: 8px')
    expect(plate).toContain('padding: 1px 8px')
    expect(plate).toContain('width: fit-content')
    expect(plate).toContain('max-width: 100%')
    expect(plate).toContain('margin-left: -8px')
  })

  it('provides dark theme readability plate for the running status row', () => {
    const darkPlate = block('body[data-ds-dark-theme] ' + RUNNING_STATUS_SELECTOR)
    expect(darkPlate).toContain('background: rgb(16 22 42 / calc(var(--dsh-skin-bubble-alpha, .5) * .8))')
  })
})
