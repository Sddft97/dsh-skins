/**
 * The delegated-skin face the skin center injects into its card.
 *
 * A delegated skin (src/core/delegated-skins.ts) is painted by another
 * plugin, so the card cannot decide on its own whether that plugin is on the
 * page: the answer is the plugin's own document marker, watched in
 * runtime/delegated-theme.ts. This handle is the read-only projection of that
 * watcher the card renders from.
 *
 * It carries no controls. Nothing here writes the other plugin's attributes
 * and nothing here installs or disables it; the row's Install button goes
 * through the host's own plugin manager (plugin-install-faces.ts).
 */
import { DELEGATED_SKINS } from '../core/delegated-skins.ts'
import type { DelegatedThemeState } from './runtime/delegated-theme.ts'

/** What the card needs to know about one delegated plugin. */
export interface DelegatedSkinHandle {
  /** The delegated skin ids this build knows, in card row order. */
  ids(): string[]
  /** Whether that plugin is on this page, and whether it can stand down. */
  state(id: string): DelegatedThemeState
  /** Observe a change in {@link state} for any delegated skin. */
  subscribe(listener: () => void): () => void
}

/**
 * Build the card's delegated-skin face over a state reader.
 * @param read - the current state of one delegated skin id.
 * @param subscribe - subscribe to changes of any of them.
 * @returns the handle the card consumes.
 */
export function createDelegatedSkinHandle(
  read: (id: string) => DelegatedThemeState,
  subscribe: (listener: () => void) => () => void,
): DelegatedSkinHandle {
  return {
    ids: () => DELEGATED_SKINS.map((skin) => skin.id),
    state: read,
    subscribe,
  }
}
