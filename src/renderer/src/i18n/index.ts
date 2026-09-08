/**
 * Initializes renderer localization and exposes all supported interface resources.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_APP_LOCALE, type AppLocale } from '@shared/types'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import ja from './locales/ja'
import ko from './locales/ko'
import pt from './locales/pt'
import ru from './locales/ru'
import tr from './locales/tr'
import zh from './locales/zh'
import type { LocaleResource } from './locales/localeFactory'

const resources = {
  en: { translation: en },
  tr: { translation: tr },
  de: { translation: de },
  fr: { translation: fr },
  pt: { translation: pt },
  zh: { translation: zh },
  es: { translation: es },
  ru: { translation: ru },
  ja: { translation: ja },
  ko: { translation: ko },
} satisfies Record<AppLocale, { translation: LocaleResource }>

/** Initializes i18next once with English as a complete fallback locale. */
export const initializeI18n = async (): Promise<void> => {
  if (i18n.isInitialized) return
  await i18n.use(initReactI18next).init({
    lng: DEFAULT_APP_LOCALE,
    fallbackLng: DEFAULT_APP_LOCALE,
    interpolation: { escapeValue: false },
    resources,
  })
}

export default i18n
