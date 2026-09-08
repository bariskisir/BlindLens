/**
 * Registers operating-system, diagnostic, and application update commands.
 */

import { shell } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import { resolveTrustedExternalUrl } from '../security/ExternalUrlPolicy'
import type AppUpdater from '../services/AppUpdater'
import type LoggerService from '../services/LoggerService'
import type IpcRegistrar from './IpcRegistrar'
import { externalUrlSchema, rendererLogSchema } from './schemas'

/** Services backing the desktop integration commands. */
export interface SystemIpcServices {
  logger: LoggerService
  updater: AppUpdater
}

/** Exposes allow-listed external links, log access, and update commands. */
export const registerSystemIpc = (registrar: IpcRegistrar, services: SystemIpcServices): void => {
  registrar.handle(IpcChannel.ShellOpenExternal, externalUrlSchema, async (url) => {
    await shell.openExternal(resolveTrustedExternalUrl(url))
  })
  registrar.handle(IpcChannel.LogsOpenDirectory, async () => {
    const failure = await shell.openPath(services.logger.getLogsDirectory())
    if (failure) throw new Error(failure)
  })
  registrar.on(IpcChannel.LogWrite, rendererLogSchema, (entry) => {
    services.logger.writeRenderer(entry)
  })
  registrar.handle(IpcChannel.UpdatesCheck, () => services.updater.checkForUpdates())
  registrar.handle(IpcChannel.UpdatesInstall, () => services.updater.quitAndInstall())
}
