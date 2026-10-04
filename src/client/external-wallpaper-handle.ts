/**
 * The delegated-wallpaper face the skin center injects into its card
 * (issue #39, migration round).
 *
 * The built-in Wallpaper Engine bridge is gone: `dsh-plugin-wallpaper-engine`
 * owns the wallpaper feature. This handle is only what the card still needs
 * from that relationship — whether the plugin is installed (so the card can
 * point at it), whether it currently renders a wallpaper (so hints stay
 * truthful), and where to install it from.
 *
 * It carries no controls: nothing here writes the other plugin's state.
 */
export interface ExternalWallpaperHandle {
  /** True while the delegated plugin renders a wallpaper (its DOM marker). */
  active(): boolean
  /** Observe a change in {@link active}. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** The delegated plugin's npm package name. */
  readonly packageName: string
  /** The delegated plugin's upstream repository (install + docs). */
  readonly repository: string
}
