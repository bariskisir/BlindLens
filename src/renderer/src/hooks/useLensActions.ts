/** Provides error-bounded provider, capture, export, and speech playback commands. */

import { useCallback } from 'react'
import type { CredentialProvider } from '@shared/lens'
import type { SessionDocument } from '@shared/session'
import { createLogger } from '@renderer/services/LoggerService'
import { speechPlayback } from '@renderer/services/SpeechPlaybackService'
import { useFailureReporter } from './useFailureReporter'

const logger = createLogger('LensActions')

/** Explicit commands consumed by presentation components. */
export interface LensActions {
  /** Starts a screen description. */
  capture(): Promise<boolean>
  /** Repeats a saved description or its speech with current settings. */
  retry(id: string, speechOnly: boolean): Promise<boolean>
  /** Stops both generation and playback. */
  cancel(): Promise<boolean>
  /** Starts browser login. */
  signIn(): Promise<boolean>
  /** Removes saved login. */
  signOut(): Promise<boolean>
  /** Refreshes provider model catalogs. */
  refresh(provider: 'chatgpt' | 'openrouter'): Promise<boolean>
  /** Saves or removes a provider key. */
  saveKey(provider: CredentialProvider, key: string): Promise<boolean>
  /** Exports a saved artifact. */
  export(id: string, kind: 'image' | 'text' | 'audio'): Promise<boolean>
  /** Copies a saved answer. */
  copy(id: string): Promise<boolean>
  /** Replays saved speech. */
  play(session: SessionDocument): Promise<boolean>
  /** Pauses active speech. */
  pause(): void
  /** Resumes paused speech. */
  resume(): Promise<boolean>
  /** Stops active speech. */
  stop(): void
}

/** Returns commands that route failures through the shared application notice. */
export const useLensActions = (): LensActions => {
  const report = useFailureReporter(logger)
  /** Executes an asynchronous action and returns whether it completed successfully. */
  const run = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      try {
        await action()
        return true
      } catch (error) {
        report('The requested action failed.', error)
        return false
      }
    },
    [report],
  )
  /** Refreshes one provider independently with a stable reference for catalog-loading effects. */
  const refresh = useCallback(
    (provider: 'chatgpt' | 'openrouter') => run(() => window.app.refreshProviders(provider)),
    [run],
  )
  return {
    /** Starts a new capture after stopping earlier speech. */
    capture: () => {
      speechPlayback.stop()
      return run(() => window.app.captureScreen())
    },
    /** Repeats a selected stage after stopping earlier speech. */
    retry: (id, speechOnly) => {
      speechPlayback.stop()
      return run(() => window.app.retryCapture(id, speechOnly))
    },
    /** Cancels the current generation and audio. */
    cancel: () => {
      speechPlayback.stop()
      return run(() => window.app.cancelCapture())
    },
    /** Opens browser login. */
    signIn: () => run(() => window.app.signInChatGpt()),
    /** Removes local account authorization. */
    signOut: () => run(() => window.app.signOutChatGpt()),
    /** Refreshes model catalogs. */
    refresh,
    /** Writes a provider secret through the protected IPC command. */
    saveKey: (provider, key) => run(() => window.app.saveCredential(provider, key)),
    /** Opens the native export dialog. */
    export: (id, kind) => run(() => window.app.exportCapture(id, kind)),
    /** Copies a persisted answer. */
    copy: (id) => run(() => window.app.copyCaptureText(id)),
    /** Replays the selected saved speech. */
    play: (session) => run(() => speechPlayback.play(session)),
    /** Pauses audible speech. */
    pause: () => speechPlayback.pause(),
    /** Resumes audible speech. */
    resume: () => run(() => speechPlayback.resume()),
    /** Stops audible speech. */
    stop: () => speechPlayback.stop(),
  }
}
