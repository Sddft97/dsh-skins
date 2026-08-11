/**
 * In-GUI skin center, browser half: registers the Skins settings section
 * (a feature-owned settings surface) and provides the try-on controller +
 * official theme handle to it. The section lists every installed skin
 * (embedded registry), tries it on live inside the GUI, exits with a full
 * restore, and copies the one-command apply. The plugin writes only DOM and
 * the settings ledger — no services, no events, no model access.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeService } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls the shell's SlotMap merges (settings.section seat, ctx.locale).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SkinCenter, type SkinCenterInjected } from './SkinCenter.tsx'
import { en, zh, type SkinCenterKey } from './locales.ts'
import { TryOnController } from './try-on.ts'

export type { SkinCenterComponentProps, SkinCenterInjected } from './SkinCenter.tsx'
export { TryOnController } from './try-on.ts'

/** Locale namespace owned by this plugin. */
export const NS = 'skinCenter'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The skin-center section's copy. */
    skinCenter: SkinCenterKey
  }
}

/** Required services: slots + locale (settings surface) and theme (preview toggle). */
export const inject = ['slots', 'locale', 'theme']

/**
 * Register the skin-center dictionaries, the body scope attribute, and the
 * Skins settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skin-center: dictionaries')

  // The panel's own styles scope under this attribute so they keep applying
  // during try-on (when the active skin's attribute is retracted).
  ctx.effect(() => {
    document.body.dataset.dshSkinCenter = ''
    return () => { delete document.body.dataset.dshSkinCenter }
  }, 'ui-skin-center: body scope')

  const t = ctx.locale.bind(NS)
  const theme = ctx.get('theme') as ThemeService
  const controller = new TryOnController()
  const injected = (): SkinCenterInjected => ({
    controller,
    theme: {
      getTheme: () => theme.getTheme(),
      subscribe: listener => ctx.on('theme/change', listener),
      setTheme: id => theme.setTheme(id),
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skins',
    order: 50,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkinCenter))
}
