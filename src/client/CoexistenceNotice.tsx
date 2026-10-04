/**
 * Standalone Wallpaper Engine plugin coexistence notice (issue #39).
 *
 * The skin center ships its own Wallpaper Engine bridge; the standalone
 * `dsh-plugin-wallpaper-engine` paints an independent full-screen wallpaper
 * layer over the same shell. Two backdrop owners in one profile fight over
 * the fixed layers, the `backdrop-filter` stacks and the host theme, so the
 * card tells the user they are alternatives and names the way out.
 *
 * The notice is advisory and self-contained: it probes the host once per
 * mount through `GET /api/skin-center/v2/coexistence` (see
 * src/coexistence.ts, which only reads the profile) and renders nothing when
 * the plugin is absent, the probe fails, or the host predates the route. The
 * switch commands live in the README, so the card states the choice and links
 * the standalone plugin's own documentation instead of duplicating them.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './skin-center.module.css'

/** Host base path of the coexistence probe (mirrors src/routes-v2.ts). */
const COEXISTENCE_API = '/api/skin-center/v2/coexistence'

/** The probe payload, as far as this notice reads it. */
interface CoexistencePayload {
  ok?: boolean
  detected?: boolean
  packageName?: string
  repository?: string
}

/** The payload narrowed to what the notice renders. */
interface CoexistenceReport {
  packageName: string
  repository: string
}

/**
 * Render the coexistence advisory, or nothing when the standalone plugin is
 * not installed in this profile.
 * @param props - the card's locale seat.
 * @returns the notice, or null.
 */
export function CoexistenceNotice({ t }: { t: PropsLocale<'skinCenter'>['t'] }): ReactNode {
  const [report, setReport] = useState<CoexistenceReport | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(COEXISTENCE_API)
      .then((res) => (res.ok ? res.json() as Promise<CoexistencePayload> : null))
      .then((payload) => {
        if (cancelled || payload?.ok !== true || payload.detected !== true) return
        setReport({
          packageName: typeof payload.packageName === 'string' && payload.packageName !== ''
            ? payload.packageName
            : 'dsh-plugin-wallpaper-engine',
          repository: typeof payload.repository === 'string' ? payload.repository : '',
        })
      })
      .catch(() => {
        // Offline, fenced, or an older host without the route: no notice. The
        // advisory must never be the reason the card fails to render.
      })
    return () => { cancelled = true }
  }, [])

  if (report === null) return null

  return (
    <div className={css.coexistenceNotice} role="status">
      <div className={css.coexistenceTitle}>{t('coexistenceTitle')}</div>
      <p className={css.coexistenceBody}>{t('coexistenceBody', { package: report.packageName })}</p>
      <p className={css.coexistenceSwitch}>{t('coexistenceSwitch')}</p>
      {report.repository !== '' && (
        <a
          className={css.coexistenceLink}
          href={report.repository}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('coexistenceLink')}
        </a>
      )}
    </div>
  )
}
