/** Coordinates screen capture, ChatGPT descriptions, speech generation, and durable history. */

import { writeFile } from 'node:fs/promises'
import { clipboard, dialog, type BrowserWindow } from 'electron'
import {
  INITIAL_LENS_STATE,
  type CaptureEvent,
  type CredentialProvider,
  type LensState,
  type ScreenCapture,
  type SpeechAvailability,
} from '@shared/lens'
import type { AppSettings, SessionDocument } from '@shared/types'
import FileOperationQueue from '@main/storage/FileOperationQueue'
import { getReadinessIssue } from '@shared/readiness'
import type StorageService from './StorageService'
import type LoggerService from './LoggerService'
import CredentialService from './CredentialService'
import ChatGptService from './ChatGptService'
import SpeechService from './SpeechService'
import ScreenCaptureService from './ScreenCaptureService'
import HotkeyService from './HotkeyService'

/** Injected services allow lifecycle tests to avoid live accounts and real desktop capture. */
export interface LensDependencies {
  credentials: Pick<CredentialService, 'getStatus' | 'saveApiKey'>
  chatGpt: Pick<
    ChatGptService,
    'initialize' | 'getState' | 'signIn' | 'signOut' | 'refresh' | 'describe' | 'dispose'
  >
  speech: Pick<SpeechService, 'getModels' | 'generate' | 'verifyCredential' | 'getBalance'>
  capture: Pick<ScreenCaptureService, 'capture'>
  hotkey: Pick<HotkeyService, 'initialize' | 'apply' | 'getState' | 'dispose' | 'setRecording'>
}

/** Owns one cancellable generation job while keeping history and provider state synchronized. */
export default class LensService {
  private state: LensState = structuredClone(INITIAL_LENS_STATE)
  private readonly dependencies: LensDependencies
  private readonly historyQueue = new FileOperationQueue()
  private controller: AbortController | null = null
  private running: Promise<void> | null = null
  private historyMutating = false
  private initialized = false
  private disposed = false
  private speechAvailability: SpeechAvailability = { available: false, voiceUris: [] }
  private noticeSequence = 0
  private onState: (state: LensState) => void = () => undefined
  private onCapture: (event: CaptureEvent) => void = () => undefined
  /** Builds provider services or uses isolated injected implementations. */
  public constructor(
    private readonly storage: StorageService,
    dataRoot: string,
    private readonly window: BrowserWindow,
    private readonly logger: LoggerService,
    dependencies?: LensDependencies,
  ) {
    const credentials = new CredentialService(dataRoot)
    this.dependencies = dependencies ?? {
      credentials,
      chatGpt: new ChatGptService(credentials, () => this.publish(), logger),
      speech: new SpeechService(credentials),
      capture: new ScreenCaptureService(window),
      hotkey: new HotkeyService(
        () => {
          void this.capture().catch(() =>
            this.logger.warn('Capture', 'Shortcut capture could not start.'),
          )
        },
        () => this.publish(),
      ),
    }
  }
  /** Binds validated IPC event delivery. */
  public subscribe(
    onState: (state: LensState) => void,
    onCapture: (event: CaptureEvent) => void,
  ): void {
    this.onState = onState
    this.onCapture = onCapture
  }
  /** Restores credentials, repairs interrupted jobs, and enables the persisted global shortcut. */
  public async initialize(settings: AppSettings): Promise<void> {
    try {
      this.state.credentials = await this.dependencies.credentials.getStatus()
      await this.dependencies.chatGpt.initialize()
    } catch {
      this.logger.warn('Credentials', 'Credential vault could not be restored.')
    }
    for (const summary of await this.storage.listSessions()) {
      const session = await this.storage.getSession(summary.id)
      const capture = session.data.capture
      if (capture && ['capturing', 'analyzing', 'synthesizing'].includes(capture.phase))
        await this.persist(session.id, { ...capture, phase: 'cancelled', error: null })
    }
    this.initialized = true
    this.dependencies.hotkey.initialize(settings.captureHotkey)
    this.publish()
  }
  /** Returns current safe account, catalog, job, and shortcut state. */
  public getState(): LensState {
    return structuredClone({
      ...this.state,
      chatGpt: this.dependencies.chatGpt.getState(),
      hotkey: this.dependencies.hotkey.getState(),
    })
  }
  /** Begins browser login asynchronously so the renderer can show progress and cancel it. */
  public signIn(): void {
    void this.dependencies.chatGpt
      .signIn()
      .catch(() => this.logger.warn('ChatGPT', 'Login could not start.'))
  }
  /** Cancels generation before removing the account login. */
  public async signOut(): Promise<void> {
    await this.mutateHistory(async () => {
      await this.dependencies.chatGpt.signOut()
      this.publish()
    })
  }
  /** Refreshes account models and the public OpenRouter speech catalog. */
  public async refresh(provider: 'chatgpt' | 'openrouter'): Promise<void> {
    try {
      if (provider === 'chatgpt') await this.dependencies.chatGpt.refresh()
      else {
        this.state.speechModels = await this.dependencies.speech.getModels()
        this.state.openRouterBalance = await this.dependencies.speech.getBalance()
      }
    } finally {
      this.publish()
    }
  }
  /** Keeps local speech capability checks available to the global shortcut path. */
  public setSpeechAvailability(availability: SpeechAvailability): void {
    this.speechAvailability = structuredClone(availability)
  }
  /** Updates a vault key and publishes only its presence flag. */
  public async saveCredential(provider: CredentialProvider, key: string): Promise<void> {
    const balance = key.trim()
      ? await this.dependencies.speech.verifyCredential(provider, key.trim())
      : null
    await this.dependencies.credentials.saveApiKey(provider, key)
    this.state.credentials = await this.dependencies.credentials.getStatus()
    if (provider === 'openrouter') this.state.openRouterBalance = balance
    this.publish()
  }
  /** Applies shortcut changes before settings are committed so conflicts reject the save. */
  public applyHotkey(accelerator: string): void {
    this.dependencies.hotkey.apply(accelerator)
  }
  /** Suspends capture shortcuts while the renderer's recorder is listening. */
  public setHotkeyRecording(recording: boolean): void {
    this.dependencies.hotkey.setRecording(recording)
  }
  /** Starts a fresh capture unless another generation or history mutation already owns the service. */
  public async capture(): Promise<void> {
    this.start(null, false)
  }
  /** Starts a retry with current settings while preserving the original screenshot. */
  public async retry(id: string, speechOnly: boolean): Promise<void> {
    this.start(id, speechOnly)
  }
  /** Aborts provider requests and waits until partial results have been persisted. */
  public async cancel(): Promise<void> {
    this.controller?.abort()
    await this.running
  }
  /** Prevents a hotkey from starting while a history deletion is waiting for cancellation. */
  public async mutateHistory<T>(action: () => Promise<T>): Promise<T> {
    return this.historyQueue.run('history', async () => {
      this.historyMutating = true
      try {
        await this.cancel()
        return await action()
      } finally {
        this.historyMutating = false
      }
    })
  }
  /** Stops window-scoped input and pending network work. */
  public dispose(): void {
    this.disposed = true
    this.controller?.abort()
    this.dependencies.hotkey.dispose()
    this.dependencies.chatGpt.dispose()
  }
  /** Loads only a media reference contained in the selected validated session. */
  public async getMedia(id: string, assetId: string): Promise<string> {
    const capture = (await this.storage.getSession(id)).data.capture
    if (capture?.image?.assetId !== assetId && !capture?.speech?.assetIds.includes(assetId))
      throw new Error('This media asset does not belong to the session.')
    const media = await this.storage.media.read(id, assetId)
    return `data:${media.mime};base64,${media.base64}`
  }
  /** Copies the saved description without granting arbitrary clipboard writes to the renderer. */
  public async copyText(id: string): Promise<void> {
    clipboard.writeText((await this.storage.getSession(id)).data.capture?.answer ?? '')
  }
  /** Exports one saved artifact to a destination selected in the native save dialog. */
  public async export(id: string, kind: 'image' | 'text' | 'audio'): Promise<void> {
    const session = await this.storage.getSession(id)
    const capture = session.data.capture
    if (!capture) throw new Error('This session has no capture.')
    let bytes: Buffer
    if (kind === 'text') {
      if (!capture.answer) throw new Error('No description is available.')
      bytes = Buffer.from(capture.answer)
    } else {
      const ids =
        kind === 'image'
          ? capture.image
            ? [capture.image.assetId]
            : []
          : (capture.speech?.assetIds ?? [])
      if (!ids.length) throw new Error('No generated media file is available for this selection.')
      const parts: Buffer[] = []
      for (const assetId of ids)
        parts.push(Buffer.from((await this.storage.media.read(id, assetId)).base64, 'base64'))
      bytes = Buffer.concat(parts)
    }
    const extension = kind === 'image' ? 'png' : kind === 'text' ? 'txt' : 'mp3'
    const safeTitle = Array.from(session.title)
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .replace(/[<>:"/\\|?*]/g, '_')
      .slice(0, 80)
    const result = await dialog.showSaveDialog(this.window, {
      defaultPath: `${safeTitle}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    })
    if (!result.canceled && result.filePath) await writeFile(result.filePath, bytes)
  }
  /** Claims the single job slot synchronously before starting asynchronous work. */
  private start(id: string | null, speechOnly: boolean): void {
    if (!this.initialized || this.disposed || this.state.busy || this.historyMutating)
      throw new Error('Wait for the current operation to finish or cancel it.')
    this.state.busy = true
    this.controller = new AbortController()
    this.publish()
    this.running = this.run(id, speechOnly, this.controller.signal)
      .catch(() => this.logger.error('Capture', 'Capture persistence failed.'))
      .finally(() => {
        this.controller = null
        this.running = null
        this.state.busy = false
        this.state.activeSessionId = null
        this.publish()
      })
  }
  /** Persists each completed stage and retains usable partial results after a failure. */
  private async run(id: string | null, speechOnly: boolean, signal: AbortSignal): Promise<void> {
    let session: SessionDocument | null = null
    let capture: ScreenCapture | null = null
    const newAssets: string[] = []
    let previousAudio: string[] = []
    try {
      const settings = await this.storage.loadSettings()
      signal.throwIfAborted()
      const existing = id ? await this.storage.getSession(id) : null
      const issue = getReadinessIssue(
        settings,
        this.getState(),
        this.speechAvailability,
        speechOnly,
        speechOnly ? existing?.data.capture?.language : settings.descriptionLanguage,
      )
      if (issue) {
        this.state.notice = { id: ++this.noticeSequence, reason: issue }
        this.publish()
        if (this.window.isMinimized()) this.window.restore()
        this.window.show()
        this.window.focus()
        return
      }
      this.state.notice = null
      session = id
        ? existing
        : await this.storage.createSession(
            new Intl.DateTimeFormat(settings.uiLanguage, {
              dateStyle: 'medium',
              timeStyle: 'medium',
            }).format(new Date()),
          )
      if (!session) throw new Error('The selected session is unavailable.')
      this.state.activeSessionId = session.id
      this.publish()
      const previous = session.data.capture
      const models = this.dependencies.chatGpt.getState().models
      const model =
        settings.chatGptModel || models.find((item) => item.isDefault)?.id || models[0]?.id || ''
      const prompt = `${settings.systemPrompts.find((item) => item.id === settings.systemPromptPreset)?.text ?? ''}\n\nRespond in ${new Intl.DisplayNames(['en'], { type: 'language' }).of(settings.descriptionLanguage)}. Use plain text suitable for speech.`
      if (speechOnly && !previous?.answer) throw new Error('There is no description to read yet.')
      if (id && !previous?.image) throw new Error('There is no saved screenshot to retry.')
      previousAudio = previous?.speech?.assetIds ?? []
      capture = {
        phase: id ? (speechOnly ? 'synthesizing' : 'analyzing') : 'capturing',
        image: previous?.image ?? null,
        answer: speechOnly ? (previous?.answer ?? '') : '',
        model: speechOnly ? (previous?.model ?? model) : model,
        prompt: speechOnly ? (previous?.prompt ?? prompt) : prompt,
        language: speechOnly
          ? (previous?.language ?? settings.descriptionLanguage)
          : settings.descriptionLanguage,
        speech: speechOnly ? (previous?.speech ?? null) : null,
        error: null,
      }
      await this.persist(session.id, capture, !id)
      signal.throwIfAborted()
      if (!id) {
        const image = await this.dependencies.capture.capture(signal)
        const assetId = await this.storage.media.save(session.id, 'image/png', image.bytes)
        newAssets.push(assetId)
        capture.image = { assetId, width: image.width, height: image.height }
      }
      if (!speechOnly && capture.image) {
        capture.phase = 'analyzing'
        await this.persist(session.id, capture)
        const image = await this.storage.media.read(session.id, capture.image.assetId)
        let lastEmit = 0
        capture.answer = await this.dependencies.chatGpt.describe(
          capture.prompt,
          image.base64,
          model,
          settings.chatGptThinkingLevel,
          signal,
          (delta) => {
            if (!capture || !session) return
            capture.answer += delta
            if (Date.now() - lastEmit > 150) {
              lastEmit = Date.now()
              this.onCapture({
                session: { ...session, data: { capture: structuredClone(capture) } },
                select: false,
                speak: false,
              })
            }
          },
          { verbosity: settings.chatGptVerbosity, serviceTier: settings.chatGptServiceTier },
        )
      }
      signal.throwIfAborted()
      capture.phase = 'synthesizing'
      await this.persist(session.id, capture)
      const sessionId = session.id
      capture.speech = await this.dependencies.speech.generate(
        capture.answer,
        capture.language,
        settings,
        signal,
        async (bytes) => {
          const assetId = await this.storage.media.save(sessionId, 'audio/mpeg', bytes)
          newAssets.push(assetId)
          return assetId
        },
      )
      signal.throwIfAborted()
      capture.phase = 'ready'
      await this.persist(session.id, capture, false, settings.autoSpeak)
    } catch (error) {
      if (capture && session) {
        capture.phase = signal.aborted ? 'cancelled' : 'error'
        capture.error = signal.aborted
          ? null
          : error instanceof Error && error.name !== 'ZodError'
            ? error.message.slice(0, 500)
            : 'The capture could not be completed.'
        await this.persist(session.id, capture)
      }
      if (!signal.aborted)
        this.logger.warn('Capture', 'A screen description operation failed.', {
          stage: capture?.phase ?? 'initializing',
        })
    } finally {
      if (session) {
        // Read committed references so a failed write cannot remove media still owned by history.
        const persisted = (await this.storage.getSession(session.id)).data.capture
        const kept = new Set([persisted?.image?.assetId, ...(persisted?.speech?.assetIds ?? [])])
        for (const assetId of [...newAssets, ...previousAudio])
          if (!kept.has(assetId))
            await this.storage.media
              .remove(session.id, assetId)
              .catch(() => this.logger.warn('Media', 'An obsolete asset could not be removed.'))
      }
    }
  }
  /** Emits a session only after its durable stage update has committed. */
  private async persist(
    id: string,
    capture: ScreenCapture,
    select = false,
    speak = false,
  ): Promise<void> {
    const session = await this.storage.saveCapture(id, capture)
    if (!this.disposed) this.onCapture({ session, select, speak })
  }
  /** Publishes safe service state while the window is alive. */
  private publish(): void {
    if (!this.disposed && this.dependencies) this.onState(this.getState())
  }
}
