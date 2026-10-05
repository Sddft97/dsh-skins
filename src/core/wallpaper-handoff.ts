/**
 * First-screen handoff contract with the delegated wallpaper plugin (issue #51).
 *
 * The browser's first paint is decided by the delivered document, and the
 * delegated plugin's `body[data-we-wallpaper]` marker only exists after its
 * own client chain has run. The host half therefore withholds the skin from
 * the document when the peer's persisted selection names a wallpaper, and
 * stamps this attribute so the browser half knows the withholding was a
 * PREDICTION rather than an observed verdict.
 *
 * The attribute is a first-screen prediction, never a verdict: it stands down
 * the skin for the window in which the peer's marker is expected to arrive, and
 * then expires on its own (see
 * src/client/runtime/external-wallpaper-engine.ts). The marker remains the only
 * thing that decides the page once the peer has spoken.
 *
 * Shared by both halves of this package (host stamps it, browser reads it), so
 * it lives in `core/` rather than in either runtime.
 * @module @linxin666/dsh-client-ui-skin-center/core/wallpaper-handoff
 */

/**
 * The `<html>` attribute the host stamps when it withheld the skin from a
 * document because the delegated wallpaper plugin's persisted selection says a
 * wallpaper is about to render. Presence means "the skin is withheld for a
 * predicted wallpaper"; the value carries nothing.
 */
export const WALLPAPER_EXPECTED_ATTR = 'data-dsh-wallpaper-expected'

/**
 * How long a first-screen prediction stands down the skin before it expires on
 * its own.
 *
 * The prediction covers exactly one window: the peer's client chain resolving
 * its persisted selection and stamping its marker, measured at roughly
 * 300ms-1s. This is the same bounded hand-back window the user-initiated
 * stage claim uses (USER_INITIATED_YIELD_GRACE_MS in skin-controller.ts), for
 * the same reason: the peer's answer is the live marker, and this only has to
 * cover the round trip to it.
 *
 * Expiry is what keeps a wrong prediction from stranding the page. A wallpaper
 * that never renders (a broken file, a decode failure) never stamps the
 * marker, so the window is the only thing standing between that user and their
 * skin. When it closes, the boot activation paints the remembered selection.
 */
export const PREDICTED_WALLPAPER_GRACE_MS = 1500
