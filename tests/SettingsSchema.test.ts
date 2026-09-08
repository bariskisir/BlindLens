/**
 * Verifies generic shell settings validation, persistence cleanup, and IPC patches.
 */

import { describe, expect, it } from 'vitest'
import {
  normalizeSettingsForPlatform,
  parsePersistedSettings,
  settingsPatchSchema,
  settingsSchema,
} from '../src/main/settingsSchema'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'

describe('normalizeSettingsForPlatform', () => {
  it('disables unsupported tray behavior on Linux without mutating persisted settings', () => {
    const persisted = {
      ...DEFAULT_SETTINGS,
      showTrayIcon: true,
      minimizeToTrayOnClose: true,
      startMinimized: true,
    }

    const normalized = normalizeSettingsForPlatform(persisted, 'linux')

    expect(normalized).toMatchObject({
      showTrayIcon: false,
      minimizeToTrayOnClose: false,
      startMinimized: false,
    })
    expect(persisted).toMatchObject({
      showTrayIcon: true,
      minimizeToTrayOnClose: true,
      startMinimized: true,
    })
  })

  it('preserves tray preferences on supported desktop platforms', () => {
    expect(normalizeSettingsForPlatform(DEFAULT_SETTINGS, 'win32')).toBe(DEFAULT_SETTINGS)
    expect(normalizeSettingsForPlatform(DEFAULT_SETTINGS, 'darwin')).toBe(DEFAULT_SETTINGS)
  })
})

describe('parsePersistedSettings', () => {
  it('returns defaults for missing and non-object input', () => {
    expect(parsePersistedSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parsePersistedSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS)
  })

  it('preserves valid reusable shell preferences', () => {
    const result = parsePersistedSettings({
      theme: 'dark',
      navbarPosition: 'left',
      pageZoom: 1.4,
      uiLanguage: 'tr',
      timeFormat: '12-hour',
      telemetryEnabled: false,
    })
    expect(result).toMatchObject({
      settingsRevision: 1,
      theme: 'dark',
      navbarPosition: 'left',
      pageZoom: 1.4,
      uiLanguage: 'tr',
      timeFormat: '12-hour',
      telemetryEnabled: false,
    })
  })

  it('enables unattended updates when the persisted setting is missing', () => {
    expect(parsePersistedSettings({ autoUpdate: true }).unattendedUpdates).toBe(true)
  })

  it('enables startup telemetry when the persisted setting is missing', () => {
    expect(parsePersistedSettings({ theme: 'dark' }).telemetryEnabled).toBe(true)
  })

  it('discards obsolete and unknown fields', () => {
    const result = parsePersistedSettings({
      obsoleteProvider: 'legacy',
      obsoleteFeatureEnabled: true,
      theme: 'light',
    }) as AppSettings & Record<string, unknown>
    expect(result.theme).toBe('light')
    expect(result.obsoleteProvider).toBeUndefined()
    expect(result.obsoleteFeatureEnabled).toBeUndefined()
  })

  it('falls back per field for unsupported values', () => {
    const result = parsePersistedSettings({
      theme: 'neon',
      navbarPosition: 'bottom',
      pageZoom: 4,
      uiLanguage: 'xx',
      logLevel: 'trace',
    })
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(result.navbarPosition).toBe(DEFAULT_SETTINGS.navbarPosition)
    expect(result.pageZoom).toBe(DEFAULT_SETTINGS.pageZoom)
    expect(result.uiLanguage).toBe(DEFAULT_SETTINGS.uiLanguage)
    expect(result.logLevel).toBe(DEFAULT_SETTINGS.logLevel)
  })

  it('disables close-to-tray when the tray icon is disabled', () => {
    const result = parsePersistedSettings({
      showTrayIcon: false,
      minimizeToTrayOnClose: true,
    })
    expect(result.showTrayIcon).toBe(false)
    expect(result.minimizeToTrayOnClose).toBe(false)
  })

  it('disables minimized startup when the tray icon is disabled', () => {
    const result = parsePersistedSettings({
      showTrayIcon: false,
      startMinimized: true,
    })
    expect(result.showTrayIcon).toBe(false)
    expect(result.startMinimized).toBe(false)
  })
})

describe('settingsSchema', () => {
  it('accepts complete default and customized settings', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        theme: 'light',
        uiLanguage: 'de',
        timeFormat: '12-hour',
      }).success,
    ).toBe(true)
  })

  it('rejects close-to-tray without a tray icon', () => {
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        showTrayIcon: false,
        minimizeToTrayOnClose: true,
      }).success,
    ).toBe(false)
  })

  it('rejects minimized startup without a tray icon', () => {
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        showTrayIcon: false,
        startMinimized: true,
      }).success,
    ).toBe(false)
  })

  it('strips unknown full-document properties', () => {
    const result = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, futureField: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBeUndefined()
    }
  })
})

describe('settingsPatchSchema', () => {
  it('accepts one or several valid changes', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'dark' }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ unattendedUpdates: true }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ pageZoom: 1.5, telemetryEnabled: false }).success).toBe(
      true,
    )
  })

  it.each([0.4, 2.1])('rejects out-of-range zoom %s', (pageZoom) => {
    expect(settingsPatchSchema.safeParse({ pageZoom }).success).toBe(false)
  })

  it('rejects empty, unknown, and revision patches', () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ unknownField: true }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ settingsRevision: 1 }).success).toBe(false)
  })
})
