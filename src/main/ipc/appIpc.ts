/**
 * Registers renderer bootstrap and the settings write that reconfigures every service.
 */

import { app, type BrowserWindow } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import {
  toSessionSummary,
  type AppSettings,
  type BootstrapPayload,
  type DesktopPlatform,
  type SessionSummary,
} from '@shared/types'
import { normalizeSettingsForPlatform, settingsPatchSchema } from '../settingsSchema'
import { configureStartOnLogin } from '../startup'
import type AppUpdater from '../services/AppUpdater'
import type LoggerService from '../services/LoggerService'
import type StorageService from '../services/StorageService'
import type TrayService from '../services/TrayService'
import type LensService from '../services/LensService'
import type IpcRegistrar from './IpcRegistrar'
import FileOperationQueue from '@main/storage/FileOperationQueue'

/** Services reconfigured whenever the renderer persists new settings. */
export interface AppIpcServices {
  lens: LensService
  storage: StorageService
  tray: TrayService
  updater: AppUpdater
  logger: LoggerService
}

/** Applies the window preferences that Electron cannot restore on its own. */
const applyWindowSettings = (window: BrowserWindow, settings: AppSettings): void => {
  window.setAlwaysOnTop(settings.alwaysOnTop)
  window.webContents.setZoomFactor(settings.pageZoom)
}

/** Returns the newest workspace and creates one when no session exists yet. */
const resolveWorkspace = async (
  storage: StorageService,
  sessions: SessionSummary[],
): Promise<Pick<BootstrapPayload, 'sessions' | 'currentSession'>> => {
  const newest = sessions[0]
  if (newest) return { sessions, currentSession: await storage.getSession(newest.id) }
  const created = await storage.createSession()
  return { sessions: [toSessionSummary(created)], currentSession: created }
}

/** Exposes the initial renderer payload and the validated settings write. */
export const registerAppIpc = (
  registrar: IpcRegistrar,
  window: BrowserWindow,
  services: AppIpcServices,
  platform: DesktopPlatform,
): void => {
  const settingsQueue = new FileOperationQueue()
  registrar.handle(IpcChannel.AppBootstrap, async () => {
    const [persistedSettings, persistedSessions] = await Promise.all([
      services.storage.loadSettings(),
      services.storage.listSessions(),
    ])
    const settings = normalizeSettingsForPlatform(persistedSettings, platform)
    applyWindowSettings(window, settings)
    return {
      settings,
      ...(await resolveWorkspace(services.storage, persistedSessions)),
      platform,
      version: app.getVersion(),
    }
  })

  registrar.handle(IpcChannel.SettingsSave, settingsPatchSchema, (request) =>
    settingsQueue.run('settings', async () => {
      const patch = { ...request }
      const previous = await services.storage.loadSettings()
      if (patch.captureHotkey) services.lens.applyHotkey(patch.captureHotkey)
      if (platform === 'win32' && patch.startOnStartup === true) {
        patch.showTrayIcon = true
      }
      if (platform === 'linux') {
        delete patch.showTrayIcon
        delete patch.minimizeToTrayOnClose
        delete patch.startMinimized
      }
      let settings: AppSettings
      try {
        settings = normalizeSettingsForPlatform(
          await services.storage.updateSettings(patch),
          platform,
        )
      } catch (error) {
        if (patch.captureHotkey) services.lens.applyHotkey(previous.captureHotkey)
        throw error
      }
      if (patch.startOnStartup !== undefined) {
        configureStartOnLogin(app, platform, settings.startOnStartup)
      }
      applyWindowSettings(window, settings)
      services.tray.applySettings(settings)
      services.updater.applySettings(settings)
      services.logger.setLevel(settings.logLevel)
      return settings
    }),
  )
}
