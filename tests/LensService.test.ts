/** Verifies durable capture stages, retries, cancellation, media ownership, and history deletion. */

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LensService, { type LensDependencies } from '@main/services/LensService'
import StorageService from '@main/services/StorageService'
import type LoggerService from '@main/services/LoggerService'
import { DEFAULT_SETTINGS } from '@shared/settings'
import {
  INITIAL_LENS_STATE,
  type CaptureEvent,
  type CaptureSpeech,
  type ScreenCapture,
} from '@shared/lens'

vi.mock('electron', () => ({
  safeStorage: {},
  clipboard: { writeText: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
}))

const imageBytes = new Uint8Array([137, 80, 78, 71])
const recipe: CaptureSpeech = {
  provider: 'web-speech',
  model: '',
  voice: '',
  language: 'tr',
  rate: 1,
  assetIds: [],
}
let root: string
let storage: StorageService
let service: LensService
let dependencies: LensDependencies
let events: CaptureEvent[]

/** Waits for one asynchronous capture pipeline to release its job slot. */
const finish = async (): Promise<void> => {
  await vi.waitFor(() => expect(service.getState().busy).toBe(false))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lens-history-'))
  storage = new StorageService(root)
  await storage.initialize()
  events = []
  dependencies = {
    credentials: {
      getStatus: vi.fn(async () => ({ deepgram: false, openrouter: false })),
      saveApiKey: vi.fn(),
    },
    chatGpt: {
      initialize: vi.fn(),
      getState: () => ({
        ...INITIAL_LENS_STATE.chatGpt,
        status: 'signed-in',
        models: [
          {
            id: 'test/vision',
            displayName: 'Vision',
            description: '',
            isDefault: true,
            supportsThinking: false,
            thinkingVariants: [],
          },
        ],
      }),
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      describe: vi.fn(async () => 'A document is open.'),
      dispose: vi.fn(),
    },
    speech: {
      getModels: vi.fn(async () => []),
      generate: vi.fn(async () => recipe),
      verifyCredential: vi.fn(async () => null),
      getBalance: vi.fn(async () => null),
    },
    capture: { capture: vi.fn(async () => ({ bytes: imageBytes, width: 1280, height: 720 })) },
    hotkey: {
      setRecording: vi.fn(),
      initialize: vi.fn(),
      apply: vi.fn(),
      getState: () => ({ accelerator: 'Ctrl+Alt', registered: true, error: null }),
      dispose: vi.fn(),
    },
  }
  service = new LensService(
    storage,
    root,
    { isMinimized: () => false, show: vi.fn(), focus: vi.fn() } as unknown as BrowserWindow,
    { warn: vi.fn(), error: vi.fn() } as unknown as LoggerService,
    dependencies,
  )
  service.subscribe(vi.fn(), (event) => events.push(event))
  await service.initialize(DEFAULT_SETTINGS)
  service.setSpeechAvailability({ available: true, voiceUris: ['test-voice'] })
})

afterEach(async () => {
  await service.cancel()
  service.dispose()
  await rm(root, { recursive: true, force: true })
})

describe('screen description lifecycle', () => {
  it('warns before creating history or capturing the screen when ChatGPT is signed out', async () => {
    dependencies.chatGpt.getState = () => structuredClone(INITIAL_LENS_STATE.chatGpt)
    await service.capture()
    await finish()
    expect(service.getState().notice?.reason).toBe('chatGptRequired')
    expect(await storage.listSessions()).toEqual([])
    expect(dependencies.capture.capture).not.toHaveBeenCalled()
    expect(dependencies.chatGpt.describe).not.toHaveBeenCalled()
  })
  it.each(['deepgram', 'openrouter'] as const)(
    'rejects missing %s credentials before spending a ChatGPT request',
    async (speechProvider) => {
      await storage.updateSettings({ speechProvider })
      await service.capture()
      await finish()
      expect(service.getState().notice?.reason).toBe(
        speechProvider === 'deepgram' ? 'deepgramKeyRequired' : 'openRouterKeyRequired',
      )
      expect(await storage.listSessions()).toEqual([])
      expect(dependencies.capture.capture).not.toHaveBeenCalled()
      expect(dependencies.speech.generate).not.toHaveBeenCalled()
    },
  )
  it('rejects an unavailable local speech engine without requiring a Web Speech login', async () => {
    service.setSpeechAvailability({ available: false, voiceUris: [] })
    await service.capture()
    await finish()
    expect(service.getState().notice?.reason).toBe('voiceMissing')
    expect(await storage.listSessions()).toEqual([])
    service.setSpeechAvailability({ available: true, voiceUris: ['voice'] })
    await service.capture()
    await finish()
    expect(events.at(-1)?.session.data.capture?.phase).toBe('ready')
  })
  it('leaves saved artifacts unchanged when a retry fails preflight', async () => {
    await service.capture()
    await finish()
    const previous = events.at(-1)?.session
    expect(previous).toBeDefined()
    await storage.updateSettings({ speechProvider: 'openrouter' })
    await service.retry(previous?.id ?? '', false)
    await finish()
    expect(await storage.getSession(previous?.id ?? '')).toEqual(previous)
    expect(dependencies.chatGpt.describe).toHaveBeenCalledOnce()
  })
  it('does not overwrite a working credential when a replacement key is rejected', async () => {
    vi.mocked(dependencies.speech.verifyCredential).mockRejectedValue(new Error('HTTP 401'))
    await expect(service.saveCredential('openrouter', 'invalid-test-key')).rejects.toThrow('401')
    expect(dependencies.credentials.saveApiKey).not.toHaveBeenCalled()
    await service.saveCredential('openrouter', '')
    expect(dependencies.credentials.saveApiKey).toHaveBeenCalledWith('openrouter', '')
  })
  it('refreshes OpenRouter without requiring or refreshing ChatGPT login', async () => {
    dependencies.chatGpt.getState = () => structuredClone(INITIAL_LENS_STATE.chatGpt)
    await service.refresh('openrouter')
    expect(dependencies.speech.getModels).toHaveBeenCalledOnce()
    expect(dependencies.chatGpt.refresh).not.toHaveBeenCalled()
  })
  it('persists the screenshot, selected prompt, answer, and replay recipe across restart', async () => {
    await storage.updateSettings({
      systemPrompts: [
        ...DEFAULT_SETTINGS.systemPrompts,
        {
          id: 'custom',
          name: 'Custom prompt',
          text: 'Read only the document title.',
          isBuiltIn: false,
        },
      ],
      systemPromptPreset: 'custom',
    })
    await service.capture()
    await finish()
    const summaries = await storage.listSessions()
    expect(summaries).toHaveLength(1)
    const saved = await new StorageService(root).getSession(summaries[0]?.id ?? '')
    expect(saved.data.capture).toMatchObject({
      phase: 'ready',
      answer: 'A document is open.',
      model: 'test/vision',
      speech: recipe,
    })
    expect(saved.data.capture?.prompt).toContain('Read only the document title.')
    expect(saved.data.capture?.prompt).toContain('English')
    expect(events.filter((event) => event.select)).toHaveLength(1)
    expect(events.at(-1)?.speak).toBe(true)
    const url = await service.getMedia(saved.id, saved.data.capture?.image?.assetId ?? '')
    expect(url).toBe(`data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`)
    expect(summaries[0]).not.toHaveProperty('data')
    await expect(service.getMedia(saved.id, randomUUID())).rejects.toThrow('does not belong')
  })
  it('preserves image and partial text when a ChatGPT stream fails', async () => {
    vi.mocked(dependencies.chatGpt.describe).mockImplementation(
      async (_prompt, _image, _model, _thinking, _signal, delta) => {
        delta('Partial description')
        throw new Error('Connection interrupted.')
      },
    )
    await service.capture()
    await finish()
    const capture = events.at(-1)?.session.data.capture
    expect(capture).toMatchObject({
      phase: 'error',
      answer: 'Partial description',
      error: 'Connection interrupted.',
    })
    expect(capture?.image).not.toBeNull()
    expect(dependencies.speech.generate).not.toHaveBeenCalled()
  })
  it('keeps the existing audio when regeneration fails and deletes only uncommitted new segments', async () => {
    vi.mocked(dependencies.speech.generate).mockImplementation(
      async (_text, _language, _settings, _signal, save) => ({
        ...recipe,
        provider: 'deepgram',
        assetIds: [await save(new Uint8Array([73, 68, 51]))],
      }),
    )
    await service.capture()
    await finish()
    const first = events.at(-1)?.session
    expect(first).toBeDefined()
    const previousAudio = first?.data.capture?.speech?.assetIds[0] ?? ''
    vi.mocked(dependencies.speech.generate).mockImplementation(
      async (_text, _language, _settings, _signal, save) => {
        await save(new Uint8Array([73, 68, 51]))
        throw new Error('Speech provider is unavailable.')
      },
    )
    await service.retry(first?.id ?? '', true)
    await finish()
    expect(events.at(-1)?.session.data.capture?.speech?.assetIds).toEqual([previousAudio])
    expect(await readdir(join(root, 'media'))).toHaveLength(2)
    expect(dependencies.chatGpt.describe).toHaveBeenCalledOnce()
  })
  it('cancels before deleting history and cannot resurrect deleted sessions or orphan media', async () => {
    vi.mocked(dependencies.chatGpt.describe).mockImplementation(
      async (_prompt, _image, _model, _thinking, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    )
    await service.capture()
    await vi.waitFor(() => expect(dependencies.chatGpt.describe).toHaveBeenCalledOnce())
    const id = service.getState().activeSessionId ?? ''
    await expect(service.capture()).rejects.toThrow('current operation')
    const result = await service.mutateHistory(() => storage.deleteSession(id))
    expect(result.deleted).toBe(true)
    expect((await storage.listSessions()).map((item) => item.id)).toEqual([result.replacement?.id])
    expect(await readdir(join(root, 'media'))).toEqual([])
    await expect(storage.getSession(id)).rejects.toThrow()
  })
  it('repairs interrupted captures on startup without triggering a network request', async () => {
    const session = await storage.createSession()
    const capture: ScreenCapture = {
      phase: 'analyzing',
      image: null,
      answer: 'Saved partial text',
      model: 'test/vision',
      prompt: 'Describe.',
      language: 'tr',
      speech: null,
      error: null,
    }
    await storage.saveCapture(session.id, capture)
    await service.initialize(DEFAULT_SETTINGS)
    expect((await storage.getSession(session.id)).data.capture).toMatchObject({
      phase: 'cancelled',
      answer: 'Saved partial text',
    })
    expect(dependencies.chatGpt.describe).not.toHaveBeenCalled()
  })
})
