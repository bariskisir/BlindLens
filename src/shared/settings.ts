/**
 * Defines the persisted preferences owned by the reusable desktop shell.
 */

import type { LogLevel } from './logging'
import { DEFAULT_LENS_SETTINGS, type LensSettings } from './lens'

export const APP_LOCALES = ['en', 'tr', 'de', 'fr', 'pt', 'zh', 'es', 'ru', 'ja', 'ko'] as const
export const THEME_MODES = ['system', 'light', 'dark'] as const
export const NAVBAR_POSITIONS = ['left', 'top'] as const
/** Defines the supported page zoom range and control increment. */
export const PAGE_ZOOM_LIMITS = { min: 0.5, max: 2, step: 0.1, default: 1 } as const
export const TIME_FORMATS = ['24-hour', '12-hour'] as const

/** Supported renderer locale code. */
export type AppLocale = (typeof APP_LOCALES)[number]
/** Default and fallback renderer language. */
export const DEFAULT_APP_LOCALE: AppLocale = 'en'
/** Persisted application theme preference. */
export type ThemeMode = (typeof THEME_MODES)[number]
/** Theme applied to the interface after the system preference is resolved. */
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>
/** Placement of global application navigation. */
export type NavbarPosition = (typeof NAVBAR_POSITIONS)[number]
/** Clock format used for session timestamps. */
export type TimeFormat = (typeof TIME_FORMATS)[number]

/** Persisted settings owned by the reusable desktop shell. */
export interface AppSettings extends LensSettings {
  settingsRevision: 1
  uiLanguage: AppLocale
  theme: ThemeMode
  navbarPosition: NavbarPosition
  pageZoom: number
  timeFormat: TimeFormat
  startOnStartup: boolean
  alwaysOnTop: boolean
  showTrayIcon: boolean
  minimizeToTrayOnClose: boolean
  startMinimized: boolean
  autoUpdate: boolean
  unattendedUpdates: boolean
  telemetryEnabled: boolean
  logLevel: LogLevel
}

/** Partial settings update accepted by the persistence boundary. */
export type AppSettingsPatch = {
  [Key in keyof Omit<AppSettings, 'settingsRevision'>]?: AppSettings[Key] | undefined
}

/** Default desktop-shell settings for a fresh installation. */
export const DEFAULT_SETTINGS: AppSettings = {
  ...DEFAULT_LENS_SETTINGS,
  settingsRevision: 1,
  uiLanguage: DEFAULT_APP_LOCALE,
  theme: 'system',
  navbarPosition: 'top',
  pageZoom: PAGE_ZOOM_LIMITS.default,
  timeFormat: '24-hour',
  startOnStartup: true,
  alwaysOnTop: false,
  showTrayIcon: true,
  minimizeToTrayOnClose: true,
  startMinimized: true,
  autoUpdate: true,
  unattendedUpdates: true,
  telemetryEnabled: true,
  logLevel: 'info',
}
