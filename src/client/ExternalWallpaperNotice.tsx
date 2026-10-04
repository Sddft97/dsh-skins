/**
 * External Wallpaper Engine plugin pointer (issue #39, migration round).
 *
 * Wallpaper support no longer ships inside the skin center: it is delegated to
 * `dsh-plugin-wallpaper-engine`. This card occupies the place the wallpaper
 * controls used to, so the feature stays discoverable where users expect it:
 * when the profile does not carry the plugin it names it, shows the install
 * command and links the plugin's repository; when it is present it states that
 * wallpapers are configured there and that an active wallpaper stands the
 * skin's own backdrop art down.
 *
 * The probe is read-only (see src/external-wallpaper.ts) and this component
 * renders nothing when the host does not answer it, so an older host never
 * shows a false "not installed" prompt.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './skin-center.module.css'

/** Host base path of the probe (mirrors src/routes-v2.ts). */
const EXTERNAL_WALLPAPER_API = '/api/skin-center/v2/external-wallpaper'

/** The probe payload, as far as this pointer reads it. */
interface ExternalWallpaperPayload {
  ok?: boolean
  installed?: boolean
  packageName?: string
  repository?: string
  installCommand?: string
}

/** The payload narrowed to what the pointer renders. */
interface ExternalWallpaperState {
  installed: boolean
  packageName: string
  repository: string
  installCommand: string
}

/** Fallbacks used only when the host omits a field. */
const FALLBACK = {
  packageName: 'dsh-plugin-wallpaper-engine',
  repository: 'https://github.com/elysia395/dsh-wallpaper-engine',
  installCommand: 'dsh plugin --profile web add dsh-plugin-wallpaper-engine',
}

/**
 * Render the delegated-plugin pointer, or nothing when the probe cannot be
 * reached.
 * @param props - the card's locale seat.
 * @returns the pointer, or null.
 */
export function ExternalWallpaperNotice({ t }: { t: PropsLocale<'skinCenter'>['t'] }): ReactNode {
  const [state, setState] = useState<ExternalWallpaperState | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(EXTERNAL_WALLPAPER_API)
      .then((res) => (res.ok ? res.json() as Promise<ExternalWallpaperPayload> : null))
      .then((payload) => {
        if (cancelled || payload?.ok !== true) return
        setState({
          installed: payload.installed === true,
          packageName: typeof payload.packageName === 'string' && payload.packageName !== ''
            ? payload.packageName
            : FALLBACK.packageName,
          repository: typeof payload.repository === 'string' && payload.repository !== ''
            ? payload.repository
            : FALLBACK.repository,
          installCommand: typeof payload.installCommand === 'string' && payload.installCommand !== ''
            ? payload.installCommand
            : FALLBACK.installCommand,
        })
      })
      .catch(() => {
        // Offline, fenced, or a host without the route: stay silent rather
        // than claim the plugin is missing.
      })
    return () => { cancelled = true }
  }, [])

  if (state === null) return null

  return (
    <div className={css.externalWallpaperNotice} role="status">
      <div className={css.externalWallpaperTitle}>
        {state.installed ? t('externalWallpaperReadyTitle') : t('externalWallpaperMissingTitle')}
      </div>
      <p className={css.externalWallpaperBody}>
        {state.installed
          ? t('externalWallpaperReadyBody')
          : t('externalWallpaperMissingBody', { package: state.packageName })}
      </p>
      {!state.installed && (
        <code className={css.externalWallpaperCommand}>{state.installCommand}</code>
      )}
      <a
        className={css.externalWallpaperLink}
        href={state.repository}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('externalWallpaperLink')}
      </a>
    </div>
  )
}
