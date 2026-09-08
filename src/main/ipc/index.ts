/**
 * Composes the validated IPC boundary between the renderer and main-process services.
 */

import type { BrowserWindow } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type { DesktopPlatform } from '@shared/types'
import { registerAppIpc, type AppIpcServices } from './appIpc'
import IpcRegistrar, { removeIpcHandlers } from './IpcRegistrar'
import { registerSessionIpc } from './sessionIpc'
import { registerSystemIpc, type SystemIpcServices } from './systemIpc'
import { registerWindowIpc } from './windowIpc'
import { registerLensIpc } from './lensIpc'

export { removeIpcHandlers }

/** Every main-process service the renderer can reach through a validated command. */
export interface IpcServices extends AppIpcServices, SystemIpcServices {}

/** Registers all renderer commands against explicit main-process services. */
export const registerIpc = (
  window: BrowserWindow,
  services: IpcServices,
  platform: DesktopPlatform,
): void => {
  removeIpcHandlers()
  const registrar = new IpcRegistrar(window)

  services.updater.initialize((event) => registrar.send(IpcChannel.UpdateState, event))
  registerAppIpc(registrar, window, services, platform)
  registerSessionIpc(registrar, services.storage, services.lens)
  registerLensIpc(registrar, services.lens)
  registerWindowIpc(registrar, window, platform)
  registerSystemIpc(registrar, services)
}
