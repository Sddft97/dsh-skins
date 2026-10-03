/**
 * Focused tests for the ORCA LINK (orca-link) skin port: scene layers,
 * wordmark/signal chrome, link-state projection, status character and
 * cleanup. Exercises the real skins/orca-link/hooks.mjs in jsdom.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'

import defineSkinHooks from '../skins/orca-link/hooks.mjs'

function orcaSkinDir(): string {
  for (const base of [process.cwd(), path.resolve(process.cwd(), 'packages/skins/skin-center')]) {
    const dir = path.join(base, 'skins', 'orca-link')
    if (existsSync(path.join(dir, 'skin.json'))) return dir
  }
  throw new Error('cannot locate skins/orca-link directory')
}

function sidebarFixture(): void {
  const sidebar = document.createElement('div')
  sidebar.setAttribute('data-slot', 'sidebar')
  const pane = document.createElement('div')
  const logoRow = document.createElement('div')
  const brand = document.createElement('button')
  brand.setAttribute('aria-label', 'DeepSeek Harness')
  logoRow.append(brand)
  pane.append(logoRow)
  sidebar.append(pane)
  document.body.append(sidebar)
}

/**
 * The sidebar shell as the macOS desktop client renders it: the column opens
 * with the 52px traffic-light strip that carries the collapse toggle, and the
 * brand row (a plain span, not a New Session button) is the sibling below it.
 */
function darwinSidebarFixture(): { pane: HTMLElement; strip: HTMLElement; logoRow: HTMLElement } {
  const sidebar = document.createElement('div')
  sidebar.setAttribute('data-slot', 'sidebar')
  const pane = document.createElement('div')

  const strip = document.createElement('div')
  strip.className = 'pjj1TG_topStrip'
  strip.setAttribute('data-window-drag', 'true')
  const toggle = document.createElement('button')
  toggle.setAttribute('aria-label', 'Collapse sidebar')
  strip.append(toggle)

  const logoRow = document.createElement('div')
  logoRow.className = 'pjj1TG_logoRow'
  logoRow.setAttribute('data-window-drag', 'true')
  const brand = document.createElement('span')
  brand.className = 'pjj1TG_brand'
  const identity = document.createElement('span')
  identity.className = 'pjj1TG_brandIdentity'
  const mark = document.createElement('span')
  mark.className = 'pjj1TG_brandMark'
  const markSlot = document.createElement('div')
  markSlot.setAttribute('data-slot', 'sidebar.brand.mark')
  markSlot.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  const name = document.createElement('span')
  name.className = 'pjj1TG_brandName'
  const nameSlot = document.createElement('div')
  nameSlot.setAttribute('data-slot', 'sidebar.brand.name')
  mark.append(markSlot)
  name.append(nameSlot)
  identity.append(mark, name)
  brand.append(identity)
  logoRow.append(brand)

  pane.append(strip, logoRow)
  sidebar.append(pane)
  document.body.append(sidebar)
  return { pane, strip, logoRow }
}

function conversationFixture(phase: string): HTMLElement {
  const root = document.createElement('div')
  root.setAttribute('data-phase', phase)
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  root.append(scroll)
  document.body.append(root)
  return root
}

function setup() {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.setAttribute('data-dsh-skin', 'orca-link')
  document.title = 'orca-link-hooks-spec'
  const cleanups: Array<() => void> = []
  const theme = {
    get: () => (document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'),
    subscribe: () => () => {},
  }
  const ctx = {
    skinId: 'orca-link',
    scopeAttr: 'orca-link',
    assetBase: '/api/skin-center/v2/skins/orca-link',
    theme,
    onCleanup: (fn: () => void) => cleanups.push(fn),
  }
  const runCleanup = () => {
    for (const fn of cleanups.splice(0).reverse()) fn()
  }
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 10))
  return { ctx, runCleanup, cleanups, flush }
}

describe('orca-link hooks: scene layers and chrome', () => {
  it('mounts the two-layer light and dark scenes and resolves artwork through assetBase', () => {
    const { ctx, runCleanup } = setup()
    defineSkinHooks().apply(ctx)

    const light = document.body.querySelector('[data-skin-chrome="light-scene"]')
    const dark = document.body.querySelector('[data-skin-chrome="dark-scene"]')
    expect(light).not.toBeNull()
    expect(dark).not.toBeNull()
    // The crossfade layers carry BOTH the Layer and Hero/Active classes on one
    // element (the v1 stylesheet sizes them that way); a bare Layer wrapper
    // would end up static with 0 height.
    const hero = light?.querySelector('.orca-ch-lightSceneLayer.orca-ch-lightSceneHero')
    const active = light?.querySelector('.orca-ch-lightSceneLayer.orca-ch-lightSceneActive')
    expect(hero).not.toBeNull()
    expect(active).not.toBeNull()

    expect(document.body.style.getPropertyValue('--orca-link-light-hero-art')).toContain(
      'assets/orca-link-light-hero.webp',
    )
    expect(document.body.style.getPropertyValue('--orca-link-dark-active-art')).toContain(
      'assets/orca-link-dark-active.webp',
    )
    expect(document.body.hasAttribute('data-dsh-orca-link')).toBe(true)
    expect(document.body.querySelector('[data-skin-chrome="spine"]')).not.toBeNull()
    expect(document.body.querySelector('[data-skin-chrome="standby"]')).not.toBeNull()

    runCleanup()
    expect(document.body.querySelector('[data-skin-chrome="light-scene"]')).toBeNull()
    expect(document.body.querySelector('[data-skin-chrome="dark-scene"]')).toBeNull()
    expect(document.body.hasAttribute('data-dsh-orca-link')).toBe(false)
    expect(document.body.style.getPropertyValue('--orca-link-light-hero-art')).toBe('')
    expect(document.title).toBe('orca-link-hooks-spec')
  })

  it('mounts the wordmark and signal chip into the sidebar logo row', async () => {
    const { ctx, runCleanup, flush } = setup()
    sidebarFixture()
    defineSkinHooks().apply(ctx)

    const row = document.body.querySelector("[data-slot='sidebar'] > :first-child > :first-child")
    expect(row?.querySelector('[data-orca-link-wordmark]')).not.toBeNull()
    const chip = document.body.querySelector('[data-orca-link-signal]')
    expect(chip).not.toBeNull()
    await flush()
    expect(chip?.getAttribute('data-orca-link-status')).toBe('standby')

    runCleanup()
    expect(document.body.querySelector('[data-orca-link-signal]')).toBeNull()
    expect(document.body.querySelector('[data-orca-link-wordmark]')).toBeNull()
  })

  it('seats the wordmark and signal chip in the brand row on the macOS desktop shell', () => {
    const { ctx, runCleanup } = setup()
    const { strip, logoRow } = darwinSidebarFixture()
    defineSkinHooks().apply(ctx)

    // Given the desktop shell's traffic-light strip and brand row, the chrome
    // lands in the brand row: the strip must stay clear of the window buttons.
    expect(logoRow.querySelector('[data-orca-link-wordmark]')).not.toBeNull()
    expect(logoRow.querySelector('[data-orca-link-signal]')).not.toBeNull()
    expect(strip.querySelector('[data-orca-link-wordmark]')).toBeNull()
    expect(strip.querySelector('[data-orca-link-signal]')).toBeNull()
    expect(logoRow.getAttribute('data-orca-logo-row')).toBe('')
    expect(strip.hasAttribute('data-orca-logo-row')).toBe(false)
    // The shell's own brand artwork is replaced by the wordmark on this shell
    // too, where the brand host is the span rather than the button.
    expect(logoRow.querySelector(':scope > span')?.getAttribute('data-orca-link-brand')).toBe('')

    runCleanup()
    expect(document.body.querySelector('[data-orca-logo-row]')).toBeNull()
    expect(document.body.querySelector('[data-orca-link-brand]')).toBeNull()
  })

  it('keeps one wordmark in the brand row when the desktop strip appears late', async () => {
    const { ctx, runCleanup, flush } = setup()
    const { pane, strip, logoRow } = darwinSidebarFixture()
    strip.remove()
    defineSkinHooks().apply(ctx)
    expect(logoRow.querySelector('[data-orca-link-wordmark]')).not.toBeNull()

    // When the shell inserts the caption strip above the brand row
    pane.prepend(strip)
    await flush()

    // Then the chrome stays in the brand row, exactly once
    expect(strip.querySelector('[data-orca-link-wordmark]')).toBeNull()
    expect(document.querySelectorAll('[data-orca-link-wordmark]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-orca-link-signal]')).toHaveLength(1)
    expect(logoRow.getAttribute('data-orca-logo-row')).toBe('')

    runCleanup()
  })

  it('projects the conversation phase onto body[data-orca-scene] and back', async () => {
    const { ctx, runCleanup, flush } = setup()
    conversationFixture('settling')
    defineSkinHooks().apply(ctx)
    expect(document.body.getAttribute('data-orca-scene')).toBe('active')

    const root = document.body.querySelector('[data-phase]')
    root?.setAttribute('data-phase', 'hero')
    await flush()
    expect(document.body.getAttribute('data-orca-scene')).toBe('hero')

    root?.setAttribute('data-phase', 'active')
    await flush()
    expect(document.body.getAttribute('data-orca-scene')).toBe('active')

    runCleanup()
    expect(document.body.hasAttribute('data-orca-scene')).toBe(false)
  })

  it('mounts the status character and mirrors the projected link status', () => {
    const { ctx, runCleanup } = setup()
    sidebarFixture()
    const active = conversationFixture('active')
    const running = document.createElement('div')
    running.setAttribute('data-state', 'running')
    active.append(running)
    defineSkinHooks().apply(ctx)

    const character = document.body.querySelector('[data-orca-link-character]')
    expect(character).not.toBeNull()
    expect(character?.getAttribute('data-orca-link-status')).toBe('working')
    const sprite = document.body.querySelector('[data-orca-link-character-sprite]')
    expect(sprite?.style.getPropertyValue('--orca-status-x')).not.toBe('')
    expect(character?.style.getPropertyValue('--orca-status-column')).toBe('')
    expect(character?.style.getPropertyValue('--orca-link-status-atlas')).toContain(
      'assets/orca-link-status-atlas.webp',
    )

    runCleanup()
    expect(document.body.querySelector('[data-orca-link-character]')).toBeNull()
  })
})

describe('orca-link hooks: icon reconciler', () => {
  const makeSvg = (d: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.append(path)
    return svg
  }

  it('only reconciles host glyphs matching a fingerprint key', async () => {
    const { ctx, runCleanup, flush } = setup()
    const hit = makeSvg('M9.67272 0.522841C10.8339 2.1')
    const miss = makeSvg('M0 0 C1 1 2 2 3 3 -- no fingerprint here')
    document.body.append(hit, miss)
    defineSkinHooks().apply(ctx)

    expect(hit.getAttribute('data-orca-link-icon')).toBe('panel-collapse')
    expect(hit.querySelector('[data-orca-link-icon-art]')).not.toBeNull()
    expect(miss.getAttribute('data-orca-link-icon')).toBeNull()
    expect(miss.querySelector('[data-orca-link-icon-art]')).toBeNull()

    // Late-inserted svgs (session loads, skill pickers) reconcile through
    // the mount observer as well.
    const late = makeSvg('M4 4l8 8M12 4l-8 8')
    document.body.append(late)
    await flush()
    expect(late.getAttribute('data-orca-link-icon')).toBe('close')

    // Idempotent: further churn must not stack a second art group.
    document.body.append(document.createElement('div'))
    await flush()
    expect(late.querySelectorAll('[data-orca-link-icon-art]')).toHaveLength(1)

    runCleanup()
    expect(hit.getAttribute('data-orca-link-icon')).toBeNull()
  })
})

describe('orca-link hooks: background throttling', () => {
  it('mirrors tab visibility onto body and resumes on return', () => {
    const { ctx, runCleanup } = setup()
    sidebarFixture()
    defineSkinHooks().apply(ctx)

    expect(document.body.hasAttribute('data-orca-page-hidden')).toBe(false)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.body.hasAttribute('data-orca-page-hidden')).toBe(true)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.body.hasAttribute('data-orca-page-hidden')).toBe(false)

    runCleanup()
    expect(document.body.hasAttribute('data-orca-page-hidden')).toBe(false)
  })
})

describe('orca-link hooks: composer seat and settings overlay', () => {
  function composerFixture(phase = 'active', hasFlow = true): { root: HTMLElement; seat: HTMLElement; card: HTMLElement } {
    const root = document.createElement('div')
    root.setAttribute('data-phase', phase)
    const scroll = document.createElement('div')
    scroll.setAttribute('data-conversation-scroll', '')
    if (hasFlow) {
      const flow = document.createElement('div')
      flow.setAttribute('data-chat-flow', '')
      flow.setAttribute('data-chat-flow-kind', 'message')
      scroll.append(flow)
    }
    const seat = document.createElement('div')
    seat.setAttribute('data-composer-seat', '')
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    const textarea = document.createElement('textarea')
    card.append(textarea)
    seat.append(card)
    scroll.append(seat)
    root.append(scroll)
    document.body.append(root)
    return { root, seat, card }
  }

  // dsh 0.2.0 ports the settings panel to <body>: SettingsPanel renders
  // {overlay[role=presentation] > mask, dialog} through createPortal, so the
  // dialog is a body child and NOT inside the sidebar.settings slot, which
  // holds only the trigger row. The skin center marks the real dialog with
  // [data-dsh-surface=settings] (semantic-adapter: a role=dialog containing
  // the settings.section outlet), which is the anchor the skin watches.
  function settingsFixture(): { slot: HTMLElement; overlay: HTMLElement; dialog: HTMLElement } {
    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'sidebar.settings')
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'presentation')
    const mask = document.createElement('div')
    mask.className = 'mask'
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-shortcut-modal', 'settings')
    // the skin center's semantic adapter marks the real dialog this way
    dialog.setAttribute('data-dsh-surface', 'settings')
    const section = document.createElement('div')
    section.setAttribute('data-slot', 'settings.section')
    dialog.append(section)
    overlay.append(mask, dialog)
    document.body.append(slot, overlay)
    return { slot, overlay, dialog }
  }

  it('mounts composer drag handles without throwing on initial binding (#1200)', () => {
    const { ctx, runCleanup } = setup()
    const { card } = composerFixture('active', true)

    expect(() => {
      defineSkinHooks().apply(ctx)
    }).not.toThrow()

    const left = card.querySelector('[data-orca-composer-handle="left"]')
    const right = card.querySelector('[data-orca-composer-handle="right"]')
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()

    runCleanup()
    expect(card.querySelector('[data-orca-composer-handle]')).toBeNull()
  })

  it('synchronizes body[data-orca-settings-open] when settings dialog mounts and unmounts', async () => {
    const { ctx, runCleanup, flush } = setup()
    composerFixture('active', true)
    defineSkinHooks().apply(ctx)

    expect(document.body.hasAttribute('data-orca-settings-open')).toBe(false)

    // Given a settings dialog portalled beside the sidebar slot
    const { overlay } = settingsFixture()
    // When the observer synchronizes
    await flush()
    // Then the open marker is set
    expect(document.body.hasAttribute('data-orca-settings-open')).toBe(true)

    // And when the dialog unmounts, the marker clears
    overlay.remove()
    await flush()
    expect(document.body.hasAttribute('data-orca-settings-open')).toBe(false)

    runCleanup()
  })

  it('operator sees composer handles mounted when conversation-scroll is nested in PTC tabs container', () => {
    // Given an active conversation root wrapping conversation-scroll within a PTC tabs container
    const { ctx, runCleanup } = setup()
    const root = document.createElement('div')
    root.setAttribute('data-phase', 'active')
    const tabsWrapper = document.createElement('div')
    tabsWrapper.setAttribute('data-ptc-tabs-panel', '')
    const scroll = document.createElement('div')
    scroll.setAttribute('data-conversation-scroll', '')
    const flow = document.createElement('div')
    flow.setAttribute('data-chat-flow', '')
    flow.setAttribute('data-chat-flow-kind', 'message')
    scroll.append(flow)
    const seat = document.createElement('div')
    seat.setAttribute('data-composer-seat', '')
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    const textarea = document.createElement('textarea')
    card.append(textarea)
    seat.append(card)
    scroll.append(seat)
    tabsWrapper.append(scroll)
    root.append(tabsWrapper)
    document.body.append(root)

    // When skin hooks are applied to the context
    defineSkinHooks().apply(ctx)

    // Then composer drag handles are successfully discovered and mounted on both edges
    const left = card.querySelector('[data-orca-composer-handle="left"]')
    const right = card.querySelector('[data-orca-composer-handle="right"]')
    expect(left?.getAttribute('data-orca-composer-handle')).toBe('left')
    expect(right?.getAttribute('data-orca-composer-handle')).toBe('right')

    runCleanup()
    expect(card.querySelector('[data-orca-composer-handle]')).toBe(null)
  })
})

describe('orca-link hooks: shell top inset', () => {
  type ResizeCallback = () => void

  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []

    readonly callback: ResizeCallback
    observed: Element[] = []

    constructor(callback: ResizeCallback) {
      this.callback = callback
      FakeResizeObserver.instances.push(this)
    }

    observe(node: Element): void {
      this.observed.push(node)
    }

    unobserve(): void {}

    disconnect(): void {
      this.observed = []
    }

    fire(): void {
      this.callback()
    }
  }

  function seat(element: HTMLElement, top: number, height: number): void {
    element.getBoundingClientRect = (() => ({
      top,
      bottom: top + height,
      left: 0,
      right: 280,
      width: 280,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    })) as unknown as () => DOMRect
  }

  function inset(): string {
    return document.body.style.getPropertyValue('--orca-shell-top-inset')
  }

  it('re-reads the caption-strip offset when the shell styles the strip after the row mounts', () => {
    // Given a darwin shell whose strip is not yet sized by the shell's
    // stylesheet, so the brand row still sits at the pane's content start
    const { ctx, runCleanup } = setup()
    const { pane, strip, logoRow } = darwinSidebarFixture()
    pane.style.paddingTop = '6px'
    seat(pane, 0, 760)
    seat(strip, 0, 0)
    seat(logoRow, 6, 60)
    ;(window as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver = FakeResizeObserver
    FakeResizeObserver.instances = []

    defineSkinHooks().apply(ctx)

    // Then the pane-anchored chrome starts at the browser-shell offset, and the
    // boxes that decide that offset are watched
    expect(inset()).toBe('0px')
    const observer = FakeResizeObserver.instances.find((instance) => instance.observed.includes(strip))
    expect(observer).toBeDefined()
    expect(observer?.observed).toContain(logoRow)
    expect(observer?.observed).toContain(pane)

    // When the stylesheet lands, giving the 52px strip its seat and pushing the
    // brand row 34px down without any further DOM change
    seat(strip, 0, 52)
    seat(logoRow, 40, 60)
    observer.fire()

    // Then the offset follows the layout, so the pricing light keeps its seat
    // relative to the wordmark instead of staying 34px above the row
    expect(inset()).toBe('34px')

    runCleanup()
    expect(inset()).toBe('')
  })

  it('keeps the browser-shell offset at zero when no caption strip precedes the row', () => {
    // Given the browser shell, whose first pane child is the brand row itself
    const { ctx, runCleanup } = setup()
    sidebarFixture()
    const pane = document.querySelector("[data-slot='sidebar'] > :first-child") as HTMLElement
    const logoRow = pane.firstElementChild as HTMLElement
    pane.style.paddingTop = '6px'
    seat(pane, 0, 760)
    seat(logoRow, 6, 60)
    ;(window as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver = FakeResizeObserver
    FakeResizeObserver.instances = []

    defineSkinHooks().apply(ctx)

    // Then the offset is the browser-shell baseline and re-measures stay there
    expect(inset()).toBe('0px')
    seat(logoRow, 6, 60)
    FakeResizeObserver.instances[0]?.fire()
    expect(inset()).toBe('0px')

    runCleanup()
  })
})
