/**
 * Composes main-process services and owns the Electron application lifecycle.
 */

import { app, BrowserWindow } from 'electron'
import { APP_ID, APP_NAME } from '@shared/appInfo'
import { toDesktopPlatform, type AppSettings, type DesktopPlatform } from '@shared/types'
import { configureApplicationPaths, type ApplicationPaths } from './ApplicationPaths'
import { registerIpc } from './ipc'
import { configureStartOnLogin, isHiddenStartupLaunch } from './startup'
import AppUpdater from './services/AppUpdater'
import LoggerService from './services/LoggerService'
import StorageService from './services/StorageService'
import TelemetryService from './services/TelemetryService'
import TrayService from './services/TrayService'
import WindowService from './services/WindowService'
import LensService from './services/LensService'

/** Creates every service the desktop shell needs and keeps their lifetimes aligned. */
export default class Application {
  private readonly paths: ApplicationPaths
  private readonly platform: DesktopPlatform
  private readonly windowService: WindowService
  private readonly telemetryService: TelemetryService
  private logger: LoggerService | null = null
  private tray: TrayService | null = null
  private lens: LensService | null = null

  /** Prepares isolated application directories before Electron initializes Chromium. */
  public constructor() {
    this.paths = configureApplicationPaths()
    this.platform = toDesktopPlatform(process.platform)
    this.windowService = new WindowService(this.paths.dataRoot)
    this.telemetryService = new TelemetryService(this.paths.dataRoot)
  }

  /** Starts the application unless another instance already owns the desktop session. */
  public start(): void {
    this.observeProcessFailures()
    if (!app.requestSingleInstanceLock()) {
      app.quit()
      return
    }

    app.on('second-instance', (_event, argv) => {
      if (isHiddenStartupLaunch(argv)) return
      this.focusMainWindow()
    })
    app.on('before-quit', () => {
      this.tray?.prepareToQuit()
      this.lens?.dispose()
    })
    app.on('window-all-closed', () => {
      if (this.platform !== 'darwin') app.quit()
    })

    void app
      .whenReady()
      .then(async () => {
        app.setAppUserModelId(APP_ID)
        await this.openWindow(isHiddenStartupLaunch(process.argv))
        app.on('activate', () => {
          if (BrowserWindow.getAllWindows().length === 0) this.reopenWindow()
        })
      })
      .catch((error: unknown) => {
        this.logger?.error('Application', 'Application initialization failed.', error)
        app.quit()
      })
  }

  /** Creates all window-scoped services and binds them to a newly opened window. */
  private async openWindow(startHidden = false): Promise<void> {
    const storage = new StorageService(this.paths.dataRoot)
    await storage.initialize()
    const settings = await storage.loadSettings()
    configureStartOnLogin(app, process.platform, settings.startOnStartup)
    const logger = new LoggerService(this.paths.logsRoot, settings.logLevel)
    this.logger = logger
    this.trackStartup(settings, logger)

    const updater = new AppUpdater(logger)
    updater.applySettings(settings)
    const shouldStartHidden = startHidden
    const window = await this.windowService.createWindow(
      logger,
      shouldStartHidden || (settings.showTrayIcon && settings.startMinimized),
    )
    this.tray?.dispose()
    const tray = new TrayService(
      window,
      shouldStartHidden ? { ...settings, showTrayIcon: true } : settings,
      logger,
      this.platform,
    )
    this.tray = tray

    window.on('close', (event) => {
      if (!tray.shouldMinimizeOnClose()) return
      event.preventDefault()
      window.hide()
    })
    const lens = new LensService(storage, this.paths.dataRoot, window, logger)
    this.lens?.dispose()
    this.lens = lens
    registerIpc(window, { storage, tray, updater, logger, lens }, this.platform)
    window.once('closed', () => lens.dispose())
    await lens.initialize(settings)

    if (shouldStartHidden) {
      logger.info('Application', `${APP_NAME} started hidden in the system tray.`)
    }

    logger.info('Application', `${APP_NAME} desktop started.`, {
      version: app.getVersion(),
      platform: this.platform,
    })
    if (settings.autoUpdate && app.isPackaged) {
      void updater.checkForUpdates().catch((error: unknown) => {
        logger.warn('Application', 'Startup update check failed.', error)
      })
    }
  }

  /** Opens a replacement macOS window and records initialization failures. */
  private reopenWindow(): void {
    void this.openWindow().catch((error: unknown) => {
      this.logger?.error('Application', 'Application window could not be reopened.', error)
    })
  }

  /** Restores and focuses the existing window when a second instance is launched. */
  private focusMainWindow(): void {
    const window = this.windowService.getMainWindow()
    if (!window) return
    window.show()
    if (window.isMinimized()) window.restore()
    window.focus()
  }

  /** Sends the configured startup event without letting telemetry failures block startup. */
  private trackStartup(settings: AppSettings, logger: LoggerService): void {
    void this.telemetryService
      .trackStartup({
        appName: APP_NAME,
        enabled: settings.telemetryEnabled,
        version: app.getVersion(),
        platform: process.platform,
        locale: settings.uiLanguage,
      })
      .catch((error: unknown) => {
        logger.warn('TelemetryService', 'Startup telemetry could not be sent.', error)
      })
  }

  /** Records process-level failures that would otherwise leave no diagnostic trace. */
  private observeProcessFailures(): void {
    process.on('uncaughtException', (error) => {
      this.logger?.error('Application', 'Uncaught exception.', error)
    })
    process.on('unhandledRejection', (error) => {
      this.logger?.error('Application', 'Unhandled rejection.', error)
    })
  }
}
