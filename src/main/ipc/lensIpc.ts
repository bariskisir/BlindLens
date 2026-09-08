/** Registers sender-checked capture, credential, and provider operations through the IPC registrar. */

import { IpcChannel } from '@shared/IpcChannel'
import type LensService from '@main/services/LensService'
import type IpcRegistrar from './IpcRegistrar'
import {
  captureExportSchema,
  captureMediaSchema,
  captureRetrySchema,
  credentialSaveSchema,
  sessionIdSchema,
  hotkeyRecordingSchema,
  speechAvailabilitySchema,
  providerRefreshSchema,
} from './schemas'

/** Exposes only explicit application capabilities and safe main-to-renderer events. */
export const registerLensIpc = (registrar: IpcRegistrar, lens: LensService): void => {
  lens.subscribe(
    (state) => registrar.send(IpcChannel.LensStateChanged, state),
    (event) => registrar.send(IpcChannel.CaptureChanged, event),
  )
  registrar.handle(IpcChannel.LensState, () => lens.getState())
  registrar.handle(IpcChannel.HotkeyRecording, hotkeyRecordingSchema, (recording) =>
    lens.setHotkeyRecording(recording),
  )
  registrar.handle(IpcChannel.ChatGptSignIn, () => lens.signIn())
  registrar.handle(IpcChannel.ChatGptSignOut, () => lens.signOut())
  registrar.handle(IpcChannel.ProvidersRefresh, providerRefreshSchema, (provider) =>
    lens.refresh(provider),
  )
  registrar.handle(IpcChannel.SpeechAvailability, speechAvailabilitySchema, (availability) =>
    lens.setSpeechAvailability(availability),
  )
  registrar.handle(IpcChannel.CredentialSave, credentialSaveSchema, ({ provider, key }) =>
    lens.saveCredential(provider, key),
  )
  registrar.handle(IpcChannel.CaptureScreen, () => lens.capture())
  registrar.handle(IpcChannel.CaptureRetry, captureRetrySchema, ({ id, speechOnly }) =>
    lens.retry(id, speechOnly),
  )
  registrar.handle(IpcChannel.CaptureCancel, () => lens.cancel())
  registrar.handle(IpcChannel.CaptureMedia, captureMediaSchema, ({ id, assetId }) =>
    lens.getMedia(id, assetId),
  )
  registrar.handle(IpcChannel.CaptureExport, captureExportSchema, ({ id, kind }) =>
    lens.export(id, kind),
  )
  registrar.handle(IpcChannel.CaptureCopyText, sessionIdSchema, (id) => lens.copyText(id))
}
