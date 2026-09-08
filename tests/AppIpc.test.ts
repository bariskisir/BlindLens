/** Verifies shortcut rollback and serialization of settings persistence with native side effects. */

import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAppIpc, type AppIpcServices } from '@main/ipc/appIpc'
import IpcRegistrar from '@main/ipc/IpcRegistrar'
import { settingsSchema } from '@main/settingsSchema'
import { IpcChannel } from '@shared/IpcChannel'
import { DEFAULT_SETTINGS, type AppSettingsPatch } from '@shared/settings'

/** A renderer-invoked handler stored in the fake Electron dispatcher. */
type Handler = (event: unknown, payload: unknown) => Promise<unknown>
const mocks = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }))
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  ipcMain: { handle: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler) },
}))
const frame = {}
const window = {
  setAlwaysOnTop: vi.fn(),
  webContents: { id: 1, mainFrame: frame, setZoomFactor: vi.fn() },
} as unknown as BrowserWindow
const event = { sender: { id: 1 }, senderFrame: frame }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
})

describe('settings IPC side effects', () => {
  it('restores the preceding shortcut when persistence fails', async () => {
    const applyHotkey = vi.fn()
    const services = {
      storage: {
        loadSettings: async () => DEFAULT_SETTINGS,
        updateSettings: async () => {
          throw new Error('Disk unavailable.')
        },
      },
      lens: { applyHotkey },
    } as unknown as AppIpcServices
    registerAppIpc(new IpcRegistrar(window), window, services, 'win32')
    await expect(
      mocks.handlers.get(IpcChannel.SettingsSave)?.(event, { captureHotkey: 'Ctrl+Shift+A' }),
    ).rejects.toThrow('Disk unavailable')
    expect(applyHotkey.mock.calls).toEqual([['Ctrl+Shift+A'], ['Ctrl+Alt']])
  })
  it('rejects conflicting shortcuts before writing settings', async () => {
    const updateSettings = vi.fn()
    const services = {
      storage: { loadSettings: async () => DEFAULT_SETTINGS, updateSettings },
      lens: {
        applyHotkey: () => {
          throw new Error('Shortcut conflict.')
        },
      },
    } as unknown as AppIpcServices
    registerAppIpc(new IpcRegistrar(window), window, services, 'win32')
    await expect(
      mocks.handlers.get(IpcChannel.SettingsSave)?.(event, { captureHotkey: 'Ctrl+Shift+A' }),
    ).rejects.toThrow('Shortcut conflict')
    expect(updateSettings).not.toHaveBeenCalled()
  })
  it('serializes concurrent settings writes and applies the final persisted shortcut', async () => {
    const order: string[] = []
    let saved = { ...DEFAULT_SETTINGS }
    const services = {
      storage: {
        loadSettings: async () => saved,
        updateSettings: async (patch: AppSettingsPatch) => {
          order.push(`save:${patch.captureHotkey}`)
          saved = settingsSchema.parse({ ...saved, ...patch })
          return saved
        },
      },
      lens: { applyHotkey: (key: string) => order.push(`apply:${key}`) },
      tray: { applySettings: vi.fn() },
      updater: { applySettings: vi.fn() },
      logger: { setLevel: vi.fn() },
    } as unknown as AppIpcServices
    registerAppIpc(new IpcRegistrar(window), window, services, 'win32')
    const handle = mocks.handlers.get(IpcChannel.SettingsSave)
    await Promise.all([
      handle?.(event, { captureHotkey: 'Ctrl+Shift+A' }),
      handle?.(event, { captureHotkey: 'Ctrl+Shift+B' }),
    ])
    expect(order).toEqual([
      'apply:Ctrl+Shift+A',
      'save:Ctrl+Shift+A',
      'apply:Ctrl+Shift+B',
      'save:Ctrl+Shift+B',
    ])
    expect(saved.captureHotkey).toBe('Ctrl+Shift+B')
  })
})
