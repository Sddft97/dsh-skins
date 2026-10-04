/**
 * Serializes skin and theme previews into one preview session (issue #39
 * migration round: the wallpaper dimension left with the built-in Wallpaper
 * Engine bridge, so this coordinator no longer arbitrates it).
 *
 * A transition in one dimension fully retires the other dimension's preview
 * before it starts, so async skin switches cannot race theme publishes.
 */
export interface PreviewSkinController {
  getState(): { previewing: boolean }
  exitTryOn(): Promise<string | null>
}

export interface PreviewCustomThemeController {
  getState(): { previewing: boolean }
  exitTryOn(): void
  suspend(): void
  resume(): void
}

export class PreviewCoordinator {
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly skin: PreviewSkinController,
    private readonly customTheme?: PreviewCustomThemeController,
  ) {}

  runSkin<T>(action: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      if (this.customTheme?.getState().previewing === true) this.customTheme.exitTryOn()
      this.customTheme?.suspend()
      try {
        return await action()
      } finally {
        if (!this.skin.getState().previewing) this.customTheme?.resume()
      }
    })
  }

  runCustomTheme<T>(action: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const continuingCustomPreview = this.customTheme?.getState().previewing === true
      if (!continuingCustomPreview && this.skin.getState().previewing) await this.skin.exitTryOn()
      this.customTheme?.resume()
      return await action()
    })
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.tail.then(action, action)
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }
}
