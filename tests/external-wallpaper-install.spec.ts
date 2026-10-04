/**
 * One-click install of the delegated wallpaper plugin (issue #39).
 *
 * The card's Install button goes through whichever plugin-management face the
 * host publishes. These tests pin the properties that matter: the spec is
 * validated before it ever reaches a manager (a manifest must not drive an
 * install shape the store would reject), the official in-process manager is
 * preferred whenever both faces exist (it is the only writer on the packaged
 * Desktop client), and a refusal is surfaced rather than reported as success.
 *
 * The faces store is a module-level singleton, so every case imports a FRESH
 * copy of the module: a face left over from an earlier case would otherwise be
 * read as "a manager is published" and the no-manager case would pass for the
 * wrong reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InstallModule = typeof import('../src/client/external-wallpaper-install.ts')

let mod: InstallModule

beforeEach(async () => {
  vi.resetModules()
  mod = await import('../src/client/external-wallpaper-install.ts')
})

/** A stand-in for the official in-process manager's remote namespace. */
function nativeFace(installBundle: (spec: string, options?: unknown) => Promise<unknown>) {
  return { installBundle: installBundle as never }
}

/** A stand-in for the family plugin-manager face. */
function familyFace(install: (spec: string) => Promise<unknown>) {
  return { isLoopback: true, install: install as never }
}

/**
 * Publish a fixed set of faces through the module's own bridge.
 * @param faces - the faces to make visible; an omitted one stays absent.
 * @returns the teardowns the bridge registered.
 */
function publishFaces(faces: { native?: unknown; family?: unknown }): Array<() => void> {
  const teardowns: Array<() => void> = []
  mod.bridgeWallpaperInstallFaces({
    inject: (deps: string[], cb: (inner: unknown) => void) => {
      const inner = {
        get: (name: string) => (name === 'remote.pluginManager' ? faces.native : faces.family),
        effect: (fn: () => () => void) => { teardowns.push(fn()) },
      }
      for (const dep of deps) cb(inner)
      return () => {}
    },
  } as never)
  return teardowns
}

describe('wallpaper install spec validation', () => {
  it('accepts a plain and a versioned npm package name', () => {
    // Given the specs the store itself would hand a manager
    // When each is validated
    // Then package names pass, with or without a version or tag suffix
    expect(mod.isInstallSpecValid('dsh-plugin-wallpaper-engine')).toBe(true)
    expect(mod.isInstallSpecValid('@scope/pkg')).toBe(true)
    expect(mod.isInstallSpecValid('dsh-plugin-wallpaper-engine@1.2.3')).toBe(true)
    expect(mod.isInstallSpecValid('@scope/pkg@next')).toBe(true)
  })

  it('rejects shapes that could reach a local path or a non-https remote', () => {
    // Given specs outside the npm-name convention
    // When each is validated
    // Then a range, a path, a url and a shell-looking string are all refused
    for (const spec of ['', 'pkg@^1.0.0', 'link:../elsewhere', './local', 'file:///tmp/x', 'https://evil.example/x', 'pkg; rm -rf /', '@scope/pkg@1.2.3 || bad']) {
      expect(mod.isInstallSpecValid(spec)).toBe(false)
    }
  })
})

describe('wallpaper install face selection', () => {
  it('prefers the official in-process manager when both faces are published', async () => {
    // Given both a native and a family face
    const nativeInstall = vi.fn(async () => ({ ok: true, value: {} }))
    const familyInstall = vi.fn(async () => ({}))
    publishFaces({ native: nativeFace(nativeInstall), family: familyFace(familyInstall) })

    // When a spec is installed
    const outcome = await mod.installPluginSpec('dsh-plugin-wallpaper-engine', 'req-1')

    // Then the official manager carried it, with the run's request id
    expect(outcome).toEqual({ kind: 'installed' })
    expect(nativeInstall).toHaveBeenCalledWith('dsh-plugin-wallpaper-engine', { enabled: true, requestId: 'req-1' })
    expect(familyInstall).not.toHaveBeenCalled()
  })

  it('falls back to the family face when no official remote is published', async () => {
    // Given only the family face
    const familyInstall = vi.fn(async () => ({}))
    publishFaces({ family: familyFace(familyInstall) })

    // When a spec is installed
    const outcome = await mod.installPluginSpec('dsh-plugin-wallpaper-engine', 'req-2')

    // Then the family face carried it
    expect(outcome).toEqual({ kind: 'installed' })
    expect(familyInstall).toHaveBeenCalledWith('dsh-plugin-wallpaper-engine')
  })

  it('reports no-manager instead of pretending to install on a bare host', async () => {
    // Given a host that publishes neither face
    // When an install is attempted
    const outcome = await mod.installPluginSpec('dsh-plugin-wallpaper-engine', 'req-3')

    // Then the card is told to keep its copy-command fallback
    expect(outcome).toEqual({ kind: 'no-manager' })
  })

  it('surfaces a refusal from the official manager instead of claiming success', async () => {
    // Given an official manager that refuses the install
    publishFaces({ native: nativeFace(async () => ({ ok: false, error: { message: 'peer range rejected' } })) })

    // When the install runs
    const outcome = await mod.installPluginSpec('dsh-plugin-wallpaper-engine', 'req-4')

    // Then the refusal reaches the card
    expect(outcome).toEqual({ kind: 'failed', message: 'peer range rejected' })
  })

  it('never throws: a rejected install becomes a failed outcome', async () => {
    // Given a manager whose transport blows up
    publishFaces({ family: familyFace(async () => { throw new Error('offline') }) })

    // When the install runs
    const outcome = await mod.installPluginSpec('dsh-plugin-wallpaper-engine', 'req-5')

    // Then it resolves with the message rather than rejecting into the card
    expect(outcome).toEqual({ kind: 'failed', message: 'offline' })
  })

  it('refuses an invalid spec before any manager sees it', async () => {
    // Given a manager is published
    const nativeInstall = vi.fn(async () => ({ ok: true, value: {} }))
    publishFaces({ native: nativeFace(nativeInstall) })

    // When an invalid spec is installed
    const outcome = await mod.installPluginSpec('link:../elsewhere', 'req-6')

    // Then it is refused locally and the manager is never called
    expect(outcome.kind).toBe('failed')
    expect(nativeInstall).not.toHaveBeenCalled()
  })

  it('notifies subscribers when a face appears and disappears', () => {
    // Given a subscriber on the faces store
    const seen: number[] = []
    const off = mod.subscribeWallpaperInstallFaces(() => seen.push(1))

    // When the bridge installs a face and then tears it down
    const teardowns = publishFaces({ family: familyFace(async () => ({})) })
    const afterMount = mod.getWallpaperInstallFaces()
    for (const teardown of teardowns) teardown()
    const afterTeardown = mod.getWallpaperInstallFaces()
    off()

    // Then each transition woke the subscriber, and the faces cleared on teardown
    expect(seen.length).toBeGreaterThan(0)
    expect(afterMount.family).not.toBeNull()
    expect(afterTeardown.family).toBeNull()
  })
})
