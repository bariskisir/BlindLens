/**
 * Owns the main Electron window, navigation policy, and permission boundary.
 */

import { join } from 'node:path'
import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import { APP_NAME } from '@shared/appInfo'
import { isTrustedRendererNavigation } from '../security/RendererNavigationPolicy'
import { getTitleBarOverlay } from '../titleBarOverlay'
import type { WindowBounds } from '../windowState'
import type LoggerService from './LoggerService'
import WindowStateStore from './WindowStateStore'

/** Window size used before a previous session's placement is restored. */
const DEFAULT_WINDOW_SIZE = { width: 1180, height: 760 }
/** Delay that lets the renderer mount before its health is verified. */
const RENDERER_MOUNT_CHECK_DELAY_MS = 1_000
/** Fallback that reveals the window when the ready-to-show event never fires. */
const REVEAL_WINDOW_FALLBACK_MS = 250

/** Creates and secures the main window while persisting its desktop state. */
export default class WindowService {
  private mainWindow: BrowserWindow | null = null
  private readonly rendererPath = join(__dirname, '../renderer/index.html')
  private readonly stateStore: WindowStateStore

  /** Creates a window owner that persists shell state in the durable application data directory. */
  public constructor(dataRoot: string) {
    this.stateStore = new WindowStateStore(join(dataRoot, 'window-state.json'))
  }

  /** Returns the active main window when it is still alive. */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  /** Creates and loads a hardened desktop window, optionally hidden to the system tray. */
  public async createWindow(logger: LoggerService, startMinimized = false): Promise<BrowserWindow> {
    const restored = await this.stateStore.load(
      screen.getAllDisplays().map((display) => display.workArea),
    )
    const window = new BrowserWindow(this.buildWindowOptions(restored?.bounds ?? null))
    this.mainWindow = window

    this.stateStore.track(window, restored, logger)
    this.configureRendererDiagnostics(window, logger)
    this.configureSecurity(window)
    /** Reveals the initialized window unless startup is explicitly minimized to the tray. */
    const revealWindow = (): void => {
      if (window.isDestroyed() || window.isVisible()) return
      if (startMinimized) window.hide()
      else window.show()
    }
    window.once('ready-to-show', () => {
      if (restored?.fullScreen) window.setFullScreen(true)
      else if (restored?.maximized) window.maximize()
      revealWindow()
    })
    window.webContents.on('did-finish-load', () =>
      setTimeout(revealWindow, REVEAL_WINDOW_FALLBACK_MS),
    )
    window.once('closed', () => {
      if (this.mainWindow === window) this.mainWindow = null
    })
    await this.loadRenderer(window)
    return window
  }

  /** Builds hardened window options that keep Node.js capabilities out of the renderer. */
  private buildWindowOptions(bounds: WindowBounds | null): BrowserWindowConstructorOptions {
    return {
      ...(bounds ?? DEFAULT_WINDOW_SIZE),
      minWidth: 450,
      minHeight: 300,
      show: false,
      backgroundColor: '#181818',
      title: APP_NAME,
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: getTitleBarOverlay('dark') }
        : { frame: false }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        partition: `${app.name}-session`,
      },
    }
  }

  /** Records packaged renderer load, preload, console, and process failures in AppData logs. */
  private configureRendererDiagnostics(window: BrowserWindow, logger: LoggerService): void {
    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        logger.error('WindowService', 'Renderer document failed to load.', {
          errorCode,
          errorDescription,
          validatedUrl,
        })
      },
    )
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      logger.error('WindowService', 'Renderer preload failed.', { preloadPath, error })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('WindowService', 'Renderer process exited unexpectedly.', details)
    })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') return
      logger.error('RendererConsole', details.message, {
        source: details.sourceId,
        line: details.lineNumber,
      })
    })
    window.webContents.on('did-finish-load', () => {
      setTimeout(
        () => void this.verifyRendererMounted(window, logger),
        RENDERER_MOUNT_CHECK_DELAY_MS,
      )
    })
  }

  /** Detects an empty React root so a packaged gray screen leaves an actionable log entry. */
  private async verifyRendererMounted(window: BrowserWindow, logger: LoggerService): Promise<void> {
    if (window.isDestroyed()) return
    try {
      const childCount = await window.webContents.executeJavaScript(
        "document.getElementById('root')?.childElementCount ?? 0",
        true,
      )
      if (childCount === 0) {
        logger.error('WindowService', 'Renderer finished loading without mounting the application.')
      }
    } catch (error) {
      logger.error('WindowService', 'Renderer health check failed.', error)
    }
  }

  /** Loads the Vite development server or packaged renderer document. */
  private async loadRenderer(window: BrowserWindow): Promise<void> {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL
    if (developmentUrl) await window.loadURL(developmentUrl)
    else await window.loadFile(this.rendererPath)
  }

  /** Blocks popups and navigation outside the bundled renderer. */
  private configureSecurity(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!this.isTrustedRendererUrl(url)) event.preventDefault()
    })
    const appSession = window.webContents.session
    appSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    appSession.setPermissionCheckHandler(() => false)
  }

  /** Accepts only the packaged file or exact Vite development origin. */
  private isTrustedRendererUrl(url: string): boolean {
    return isTrustedRendererNavigation(url, this.rendererPath, process.env.VITE_DEV_SERVER_URL)
  }
}
