/**
 * The skin-center settings section: every installed skin with live try-on
 * (real bundle execution inside the GUI, light/dark preview, full restore on
 * exit) and the one-command apply. Copy rides the standard `t` seat; the
 * theme preview control drives the official theme service (persisted, same
 * as the Appearance row).
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell's SlotMap merge for the settings section seat.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { SKIN_CENTER_ENTRIES, type SkinCenterEntry } from './generated/skins.ts'
import { activeSkinEntry, TryOnController } from './try-on.ts'
import css from './skin-center.module.css'

/** Business face the skin-center apply() injects into the section. */
export interface SkinCenterInjected {
  controller: TryOnController
  theme: {
    getTheme(): ThemeSnapshot
    subscribe(listener: () => void): () => void
    setTheme(id: 'light' | 'dark'): void
  }
}

/** Full section component props: settings-section runtime share + locale seat + injected face. */
export type SkinCenterComponentProps =
  PropsRuntime<'settings.section'> & PropsLocale<'skinCenter'> & SkinCenterInjected

/** The apply command the GUI copies (apply itself is terminal-side). */
function applyCommandFor(entry: SkinCenterEntry): string {
  return `dsh-skin use ${entry.id}`
}

/**
 * Render the skin-center section.
 * @param props - section props.
 * @returns the skin center content column.
 */
export function SkinCenter({ t, controller, theme }: SkinCenterComponentProps) {
  const snapshot = useSyncExternalStore(theme.subscribe, theme.getTheme)
  // The active skin only changes across a config reload + refresh.
  const activePackage = useMemo(() => activeSkinEntry()?.package, [])
  const [tryingId, setTryingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const tryOn = (entry: SkinCenterEntry): void => {
    setError(null)
    void controller.tryOn(entry)
      .then(() => setTryingId(entry.id))
      .catch(() => setError(t('tryOnError')))
  }

  const exitTryOn = (): void => {
    controller.exit()
    setTryingId(null)
  }

  const copyCommand = (entry: SkinCenterEntry): void => {
    const command = applyCommandFor(entry)
    void navigator.clipboard.writeText(command)
      .then(() => {
        setCopiedId(entry.id)
        window.setTimeout(() => setCopiedId(current => current === entry.id ? null : current), 1600)
      })
      .catch(() => setError(t('copyFailed')))
  }

  const dark = snapshot.active.colorScheme === 'dark'

  return (
    <div className={css.section}>
      <div className={css.head}>
        <div className={css.title}>
          {t('title')}
          <span className={css.titleBadge}>{String(SKIN_CENTER_ENTRIES.length)}</span>
        </div>
        <div className={css.intro}>{t('intro')}</div>
        <div className={css.themeRow}>
          <span className={css.themeLabel}>{t('theme')}</span>
          <button
            type="button"
            className={`${css.themeButton} ${dark ? '' : css.themeButtonActive}`}
            onClick={() => { theme.setTheme('light') }}
          >
            {t('themeLight')}
          </button>
          <button
            type="button"
            className={`${css.themeButton} ${dark ? css.themeButtonActive : ''}`}
            onClick={() => { theme.setTheme('dark') }}
          >
            {t('themeDark')}
          </button>
        </div>
      </div>

      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.list}>
        {SKIN_CENTER_ENTRIES.map(entry => {
          const isActive = entry.package === activePackage
          const isTrying = entry.id === tryingId
          const badge = isActive ? t('active') : isTrying ? t('tryingOn') : null
          return (
            <div className={css.card} key={entry.id}>
              <div className={css.cardHead}>
                <span className={css.swatch} style={{ background: entry.accent }} aria-hidden="true" />
                <span className={css.cardName}>{entry.nameEn}</span>
                {badge !== null && (
                  <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                    {badge}
                  </span>
                )}
              </div>
              <div className={css.cardTagline}>{entry.tagline}</div>
              <div className={css.actions}>
                {isActive ? (
                  <button type="button" className={`${css.button} ${css.buttonGhost}`} disabled>
                    {t('tryOn')}
                  </button>
                ) : isTrying ? (
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={exitTryOn}>
                    {t('exitTryOn')}
                  </button>
                ) : (
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={() => { tryOn(entry) }}>
                    {t('tryOn')}
                  </button>
                )}
                <button type="button" className={css.button} onClick={() => { copyCommand(entry) }}>
                  {copiedId === entry.id ? t('copied') : t('apply')}
                </button>
              </div>
              <div className={css.applyBlock}>
                <span className={css.applyHint}>{t('applyHint')}</span>
                <code className={css.command}>{applyCommandFor(entry)}</code>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
