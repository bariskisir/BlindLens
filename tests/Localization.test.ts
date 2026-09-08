/**
 * Verifies initial locale resolution and the completeness of every locale resource.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import i18n, { initializeI18n } from '../src/renderer/src/i18n/index'
import {
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  THEME_MODES,
  TIME_FORMATS,
  type AppLocale,
} from '../src/shared/types'

import de from '../src/renderer/src/i18n/locales/de'
import en from '../src/renderer/src/i18n/locales/en'
import es from '../src/renderer/src/i18n/locales/es'
import fr from '../src/renderer/src/i18n/locales/fr'
import ja from '../src/renderer/src/i18n/locales/ja'
import ko from '../src/renderer/src/i18n/locales/ko'
import pt from '../src/renderer/src/i18n/locales/pt'
import ru from '../src/renderer/src/i18n/locales/ru'
import tr from '../src/renderer/src/i18n/locales/tr'
import zh from '../src/renderer/src/i18n/locales/zh'

/** Flattens a nested locale resource into comparable leaf-key paths. */
function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/** Reads one locale leaf by its dot-delimited path. */
function getLocaleValue(resource: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[part]
  }, resource)
  return typeof value === 'string' ? value : ''
}

/** Extracts sorted i18next interpolation variable names from one translated value. */
function collectInterpolationVariables(value: string): string[] {
  return [...value.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((match) => match[1] ?? '').sort()
}

/** Recursively lists renderer TypeScript sources that can request translations. */
function collectRendererSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectRendererSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Collects literal and type-bounded dynamic translation keys used by renderer code. */
function collectUsedTranslationKeys(): string[] {
  const keyPattern =
    /['"`]((?:lens|app|common|nav|sessions|sidebar|workspace|windowControls|settings|themes|locales|errors)\.[A-Za-z0-9_.-]+)['"`]/g
  const keys = new Set<string>()
  const sourceRoot = join(process.cwd(), 'src', 'renderer', 'src')
  for (const file of collectRendererSourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(keyPattern)) {
      if (match[1]) keys.add(match[1])
    }
  }
  for (const theme of THEME_MODES) keys.add(`themes.${theme}`)
  for (const locale of APP_LOCALES) keys.add(`locales.${locale}`)
  for (const level of LOG_LEVELS) keys.add(`settings.logLevels.${level}`)
  for (const timeFormat of TIME_FORMATS) keys.add(`settings.timeFormats.${timeFormat}`)
  return [...keys].sort()
}

const locales: Record<AppLocale, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  tr: tr as unknown as Record<string, unknown>,
  de: de as unknown as Record<string, unknown>,
  fr: fr as unknown as Record<string, unknown>,
  pt: pt as unknown as Record<string, unknown>,
  zh: zh as unknown as Record<string, unknown>,
  es: es as unknown as Record<string, unknown>,
  ru: ru as unknown as Record<string, unknown>,
  ja: ja as unknown as Record<string, unknown>,
  ko: ko as unknown as Record<string, unknown>,
}

describe('default locale', () => {
  it('uses English as the persisted default and fallback language', () => {
    expect(DEFAULT_APP_LOCALE).toBe('en')
    expect(DEFAULT_SETTINGS.uiLanguage).toBe(DEFAULT_APP_LOCALE)
  })

  it('initializes i18next in English before persisted settings load', async () => {
    await initializeI18n()
    expect(i18n.language).toBe(DEFAULT_APP_LOCALE)
  })
})

describe('locale key consistency', () => {
  const englishKeys = collectKeys(locales.en).sort()

  it('English defines exactly the translation keys used by the renderer', () => {
    expect(englishKeys).toEqual(collectUsedTranslationKeys())
  })

  it('defines every supported locale', () => {
    expect(Object.keys(locales)).toHaveLength(APP_LOCALES.length)
    for (const locale of APP_LOCALES) {
      expect(locales[locale]).toBeDefined()
    }
  })

  it.each(APP_LOCALES.filter((locale) => locale !== 'en'))(
    '%s has the same keys as English',
    (locale) => {
      expect(collectKeys(locales[locale]).sort()).toEqual(englishKeys)
    },
  )

  it('all locale values are non-empty strings', () => {
    for (const [locale, resource] of Object.entries(locales)) {
      const keys = collectKeys(resource)
      for (const key of keys) {
        const value: unknown = key
          .split('.')
          .reduce<Record<string, unknown> | undefined>(
            (obj, part) => obj?.[part] as Record<string, unknown> | undefined,
            resource as Record<string, unknown>,
          )
        expect(typeof value, `Locale "${locale}" key "${key}" should be a string`).toBe('string')
        expect(
          (value as string).length,
          `Locale "${locale}" key "${key}" should not be empty`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it.each(APP_LOCALES.filter((locale) => locale !== DEFAULT_APP_LOCALE))(
    '%s preserves every English interpolation variable',
    (locale) => {
      for (const key of englishKeys) {
        expect(collectInterpolationVariables(getLocaleValue(locales[locale], key))).toEqual(
          collectInterpolationVariables(getLocaleValue(locales.en, key)),
        )
      }
    },
  )

  it('locale values do not contain accidental surrounding whitespace', () => {
    for (const resource of Object.values(locales)) {
      for (const key of englishKeys) {
        const value = getLocaleValue(resource, key)
        expect(value, `Locale value "${key}" should be trimmed`).toBe(value.trim())
      }
    }
  })
})
