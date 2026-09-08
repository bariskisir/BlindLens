/**
 * Registers the generic session workspace commands.
 */

import { IpcChannel } from '@shared/IpcChannel'
import type StorageService from '../services/StorageService'
import type LensService from '../services/LensService'
import type IpcRegistrar from './IpcRegistrar'
import { sessionIdSchema, sessionRenameSchema } from './schemas'

/** Exposes local session creation, retrieval, renaming, and deletion. */
export const registerSessionIpc = (
  registrar: IpcRegistrar,
  storage: StorageService,
  lens: LensService,
): void => {
  registrar.handle(IpcChannel.SessionCreate, () => storage.createSession())
  registrar.handle(IpcChannel.SessionGet, sessionIdSchema, (id) => storage.getSession(id))
  registrar.handle(IpcChannel.SessionRename, sessionRenameSchema, ({ id, title }) =>
    storage.renameSession(id, title),
  )
  registrar.handle(IpcChannel.SessionDelete, sessionIdSchema, (id) =>
    lens.mutateHistory(() => storage.deleteSession(id)),
  )
  registrar.handle(IpcChannel.SessionDeleteAll, () =>
    lens.mutateHistory(() => storage.deleteAllSessions()),
  )
}
