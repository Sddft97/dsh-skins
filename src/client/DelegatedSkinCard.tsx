/**
 * The delegated-skin row: a skin whose visual is another plugin's.
 *
 * It renders where the wallpaper controls used to live and where a skin's own
 * card lives now, because it is both: it is a selection (apply it, and it is
 * remembered across a reload) and an install prompt (the plugin that paints it
 * is a separate package). The row is listed whether or not that package is
 * installed, because an installed-and-enabled plugin that the card hid until
 * the user went to the store is a plugin nobody finds.
 *
 * Three states, all read from two sources and never guessed:
 *
 *  - not installed: the one-click install through whichever plugin-management
 *    face the host publishes, or the exact command when it publishes none;
 *  - installed but not live: the plugin is wired into this profile but its
 *    browser half is not on the page, so this row cannot paint yet. The row
 *    says so instead of offering an apply that would deliver nothing;
 *  - live: the plugin paints. Try-on and apply are offered, because from here
 *    the selection is a normal one and every other skin, the stock look and a
 *    running wallpaper all take the page back.
 *
 * A live plugin that does NOT advertise the handoff attribute is a build that
 * cannot stand down. Offering apply on it would let the user select this skin
 * and then pick a real skin over it, which is the broken overlap the whole
 * delegation exists to prevent, so the row says the plugin has to be updated
 * and still lets them look at it.
 *
 * Everything the peer publishes is read, never written: the two attributes
 * (see runtime/delegated-theme.ts) and the install call the host itself makes.
 * @module @linxin666/dsh-client-ui-skin-center/DelegatedSkinCard
 */
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

import {
  getInstallFaces,
  installPluginSpec,
  isInstallSpecValid,
  subscribeInstallFaces,
} from './plugin-install-faces.ts'
import type { CatalogSkin } from './runtime/boot.ts'
import type { DelegatedThemeState } from './runtime/delegated-theme.ts'
import css from './skin-center.module.css'

/** The delegated payload a delegated row's manifest carries. */
interface DelegatedPayload {
  package: string
  repository: string
  installCommand: string
  bodyAttr: string
  handoffAttr: string
  installed: boolean
  signals: string[]
  descriptorMatches: boolean | null
}

/** Business face the card injects; the row needs only the theme state. */
export interface DelegatedSkinCardProps {
  t: PropsLocale<'skinCenter'>['t']
  skin: CatalogSkin
  /** Whether the delegated plugin is on this page, and whether it can yield. */
  theme: DelegatedThemeState
  isActive: boolean
  isTrying: boolean
  busy: boolean
  disabled: boolean
  onTryOn: () => void
  onExitTryOn: () => void
  onApply: () => void
  /** Re-read the catalog after a successful install (the probe moves). */
  onInstalled: () => void
}

/** The copyable command line, used when no management face is available. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Render one delegated-skin row.
 * @param props - the row's locale seat, its catalog entry and the card's actions.
 * @returns the row.
 */
export function DelegatedSkinCard(props: DelegatedSkinCardProps): ReactNode {
  const { t, skin, theme, isActive, isTrying, busy, disabled } = props
  const manifest = skin.manifest as CatalogSkin['manifest'] & { delegated: DelegatedPayload }
  const payload = manifest.delegated
  const faces = useSyncExternalStore(subscribeInstallFaces, getInstallFaces)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null)

  const canInstall = faces.native !== null || faces.family !== null
  const spec = payload.package
  // The row is applicable only when the plugin is actually on the page AND its
  // build can hand the page back. Anything less is stated, not offered.
  const applicable = theme.live && theme.canYield
  const claimable = theme.live && !theme.canYield

  const onInstall = (): void => {
    if (installing || !isInstallSpecValid(spec)) return
    setInstalling(true)
    setError(null)
    const cryptoObj = typeof window === 'undefined' ? undefined : window.crypto
    const requestId = cryptoObj && typeof cryptoObj.randomUUID === 'function'
      ? cryptoObj.randomUUID()
      : 'skin-center-delegated-' + spec
    void installPluginSpec(spec, requestId).then((outcome) => {
      if (outcome.kind === 'failed') {
        setError(outcome.message)
        return
      }
      if (outcome.kind === 'installed') props.onInstalled()
    }).finally(() => { setInstalling(false) })
  }

  const onCopy = (): void => {
    void copyText(payload.installCommand).then((ok) => { setNotice(ok ? 'copied' : 'failed') })
  }

  const status = !payload.installed
    ? t('delegatedSkinMissing', { package: payload.package })
    : !theme.live
      ? t('delegatedSkinNotRunning')
      : claimable
        ? t('delegatedSkinNoHandoff')
        : t('delegatedSkinReady')

  return (
    <div className={`${css.card} ${css.skinCard} ${css.delegatedCard}`} data-delegated-skin={manifest.id}>
      <div className={css.thumbWrap}>
        <div className={css.thumbEmpty} style={{ background: manifest.accent ?? '#98a1ab' }} aria-hidden="true" />
        <span className={css.delegatedBadge}>{t('delegatedSkinBadge')}</span>
        {(isActive || isTrying) && (
          <span className={`${css.badge} ${isActive && !isTrying ? css.badgeActive : css.badgeTrying}`}>
            {isActive && !isTrying ? t('active') : t('tryingOn')}
          </span>
        )}
      </div>
      <div className={css.cardHead}>
        <span className={css.swatch} style={{ background: manifest.accent ?? '#98a1ab' }} aria-hidden="true" />
        <span className={css.cardName} title={manifest.nameEn}>{manifest.nameEn}</span>
      </div>
      <div className={css.cardTagline} title={manifest.tagline ?? ''}>{manifest.tagline ?? ''}</div>
      <p className={css.delegatedStatus} role="status">{status}</p>
      {error !== null && <p className={css.delegatedStatus} role="alert">{t('delegatedSkinInstallFailed', { reason: error })}</p>}
      {payload.descriptorMatches === false && (
        <p className={css.delegatedStatus} role="alert">{t('delegatedSkinDescriptorMismatch')}</p>
      )}
      <div className={css.actions}>
        {!payload.installed && (
          <>
            {canInstall ? (
              <button
                type="button"
                className={`${css.button} ${css.buttonPrimary}`}
                disabled={installing || disabled}
                onClick={onInstall}
              >
                {installing ? t('delegatedSkinInstalling') : t('delegatedSkinInstall')}
              </button>
            ) : (
              <code className={css.externalWallpaperCommand}>{payload.installCommand}</code>
            )}
            <button type="button" className={css.button} disabled={installing || disabled} onClick={onCopy}>
              {notice === 'copied' ? t('externalWallpaperCopied') : t('externalWallpaperCopyCommand')}
            </button>
          </>
        )}
        {applicable && (
          isActive && !isTrying ? (
            <button type="button" className={`${css.button} ${css.buttonGhost}`} disabled>
              {t('tryOn')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${css.button} ${css.buttonPrimary}`}
                disabled={busy || disabled}
                onClick={isTrying ? props.onExitTryOn : props.onTryOn}
              >
                {isTrying ? t('exitTryOn') : t('tryOn')}
              </button>
              <button type="button" className={css.button} disabled={busy || disabled} onClick={props.onApply}>
                {busy ? t('applying') : t('apply')}
              </button>
            </>
          )
        )}
      </div>
      <a
        className={css.externalWallpaperLink}
        href={payload.repository}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('delegatedSkinLink')}
      </a>
    </div>
  )
}
