/** Verifies actual capture handlers and preload wiring enforce the typed capability boundary. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import IpcRegistrar from '@main/ipc/IpcRegistrar'
import { registerLensIpc } from '@main/ipc/lensIpc'
import { registerSessionIpc } from '@main/ipc/sessionIpc'
import type LensService from '@main/services/LensService'
import type StorageService from '@main/services/StorageService'
import { IpcChannel } from '@shared/IpcChannel'
import { INITIAL_LENS_STATE } from '@shared/lens'
import type { AppApi } from '@shared/api'

/** A handler installed in the fake Electron dispatcher. */
type Handler = (event: unknown, value?: unknown) => Promise<unknown>
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler) },
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, on: mocks.on, removeListener: mocks.remove },
}))
const frame = {}
const window = {
  isDestroyed: () => false,
  webContents: { id: 1, mainFrame: frame, send: vi.fn() },
} as unknown as BrowserWindow
const event = { sender: { id: 1 }, senderFrame: frame }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
})

describe('capture IPC', () => {
  it('accepts only a boolean for shortcut recording suspension', async () => {
    const service = { subscribe: vi.fn(), setHotkeyRecording: vi.fn() } as unknown as LensService
    registerLensIpc(new IpcRegistrar(window), service)
    await mocks.handlers.get(IpcChannel.HotkeyRecording)?.(event, true)
    expect(service.setHotkeyRecording).toHaveBeenCalledWith(true)
    await expect(mocks.handlers.get(IpcChannel.HotkeyRecording)?.(event, 'true')).rejects.toThrow()
    await expect(
      mocks.handlers.get(IpcChannel.HotkeyRecording)?.({ ...event, senderFrame: {} }, false),
    ).rejects.toThrow('Untrusted')
  })
  it('validates the provider selector and browser speech capability payload', async () => {
    const service = {
      subscribe: vi.fn(),
      refresh: vi.fn(),
      setSpeechAvailability: vi.fn(),
    } as unknown as LensService
    registerLensIpc(new IpcRegistrar(window), service)
    await mocks.handlers.get(IpcChannel.ProvidersRefresh)?.(event, 'openrouter')
    expect(service.refresh).toHaveBeenCalledWith('openrouter')
    await expect(
      mocks.handlers.get(IpcChannel.ProvidersRefresh)?.(event, 'untrusted'),
    ).rejects.toThrow()
    await mocks.handlers.get(IpcChannel.SpeechAvailability)?.(event, {
      available: true,
      voiceUris: ['system'],
    })
    expect(service.setSpeechAvailability).toHaveBeenCalledWith({
      available: true,
      voiceUris: ['system'],
    })
    await expect(
      mocks.handlers.get(IpcChannel.SpeechAvailability)?.(event, {
        available: 'yes',
        voiceUris: [],
      }),
    ).rejects.toThrow()
  })
  it('rejects untrusted senders and invalid media IDs before touching services', async () => {
    const getMedia = vi.fn()
    const service = { subscribe: vi.fn(), getMedia } as unknown as LensService
    registerLensIpc(new IpcRegistrar(window), service)
    const handler = mocks.handlers.get(IpcChannel.CaptureMedia)
    expect(handler).toBeDefined()
    await expect(handler?.({ ...event, senderFrame: {} }, {})).rejects.toThrow('Untrusted')
    await expect(handler?.(event, { id: '../private', assetId: '../secret' })).rejects.toThrow()
    expect(getMedia).not.toHaveBeenCalled()
  })
  it('sends deletions through capture cancellation before mutating durable history', async () => {
    const order: string[] = []
    const service = {
      mutateHistory: async (action: () => Promise<void>) => {
        order.push('cancel')
        return action()
      },
    } as unknown as LensService
    const storage = {
      deleteAllSessions: async () => {
        order.push('delete')
      },
    } as unknown as StorageService
    registerSessionIpc(new IpcRegistrar(window), storage, service)
    await mocks.handlers.get(IpcChannel.SessionDeleteAll)?.(event)
    expect(order).toEqual(['cancel', 'delete'])
  })
  it('exposes only typed preload operations and removes event subscriptions correctly', async () => {
    await import('../src/preload/index.js')
    const api = mocks.expose.mock.calls[0]?.[1] as AppApi
    expect(mocks.expose.mock.calls[0]?.[0]).toBe('app')
    await api.saveCredential('deepgram', 'test-key')
    expect(mocks.invoke).toHaveBeenCalledWith(IpcChannel.CredentialSave, {
      provider: 'deepgram',
      key: 'test-key',
    })
    const listener = vi.fn()
    const unsubscribe = api.onLensState(listener)
    const callback = mocks.on.mock.calls[0]?.[1] as (event: unknown, state: unknown) => void
    callback({ sender: 'never forwarded' }, INITIAL_LENS_STATE)
    expect(listener).toHaveBeenCalledWith(INITIAL_LENS_STATE)
    unsubscribe()
    expect(mocks.remove).toHaveBeenCalledWith(IpcChannel.LensStateChanged, callback)
    expect(api).not.toHaveProperty('ipcRenderer')
  })
})
