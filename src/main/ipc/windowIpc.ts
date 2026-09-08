/**
 * Registers native window state commands and forwards native maximize changes.
 */

import type { BrowserWindow } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type { DesktopPlatform } from '@shared/types'
import { getTitleBarOverlay } from '../titleBarOverlay'
import type IpcRegistrar from './IpcRegistrar'
import { alwaysOnTopSchema, resolvedThemeSchema } from './schemas'

/** Exposes frameless-window controls and keeps the renderer aware of native state. */
export const registerWindowIpc = (
  registrar: IpcRegistrar,
  window: BrowserWindow,
  platform: DesktopPlatform,
): void => {
  window.on('maximize', () => registrar.send(IpcChannel.WindowMaximizedChanged, true))
  window.on('unmaximize', () => registrar.send(IpcChannel.WindowMaximizedChanged, false))

  registrar.handle(IpcChannel.WindowAlwaysOnTop, alwaysOnTopSchema, (enabled) => {
    window.setAlwaysOnTop(enabled)
  })
  registrar.handle(IpcChannel.WindowMinimize, () => {
    window.minimize()
  })
  registrar.handle(IpcChannel.WindowToggleMaximize, () => {
    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }
    window.maximize()
    return true
  })
  registrar.handle(IpcChannel.WindowClose, () => {
    window.close()
  })
  registrar.handle(IpcChannel.WindowIsMaximized, () => window.isMaximized())
  registrar.handle(IpcChannel.ThemeSet, resolvedThemeSchema, (theme) => {
    if (platform === 'darwin') window.setTitleBarOverlay(getTitleBarOverlay(theme))
  })
}
