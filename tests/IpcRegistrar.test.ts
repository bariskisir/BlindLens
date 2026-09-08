/**
 * Verifies that registered IPC handlers reject untrusted senders and invalid payloads.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import IpcRegistrar, { removeIpcHandlers } from '../src/main/ipc/IpcRegistrar'
import { alwaysOnTopSchema, rendererLogSchema } from '../src/main/ipc/schemas'
import { IpcChannel } from '../src/shared/IpcChannel'

type InvokeHandler = (event: unknown, input: unknown) => unknown

const ipcMocks = vi.hoisted(() => ({
  invokeHandlers: new Map<string, InvokeHandler>(),
  messageHandlers: new Map<string, InvokeHandler>(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: InvokeHandler) => {
      ipcMocks.invokeHandlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: InvokeHandler) => {
      ipcMocks.messageHandlers.set(channel, handler)
    }),
    removeHandler: ipcMocks.removeHandler,
    removeAllListeners: ipcMocks.removeAllListeners,
  },
}))

const MAIN_FRAME = { url: 'file:///renderer/index.html' }
const WEB_CONTENTS_ID = 7

/** Creates the window capabilities the registrar needs to identify its renderer. */
const createWindow = (destroyed = false) => {
  const send = vi.fn()
  const window = {
    isDestroyed: () => destroyed,
    webContents: { id: WEB_CONTENTS_ID, mainFrame: MAIN_FRAME, send },
  } as unknown as BrowserWindow
  return { window, send }
}

/** Builds one event as it would arrive from the trusted renderer main frame. */
const createEvent = (
  senderId = WEB_CONTENTS_ID,
  senderFrame: unknown = MAIN_FRAME,
): IpcMainInvokeEvent & IpcMainEvent =>
  ({ sender: { id: senderId }, senderFrame }) as unknown as IpcMainInvokeEvent & IpcMainEvent

/** Returns the handler the registrar bound to one channel. */
const getHandler = (handlers: Map<string, InvokeHandler>, channel: IpcChannel): InvokeHandler => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler was registered for ${channel}.`)
  return handler
}

describe('IpcRegistrar', () => {
  beforeEach(() => {
    ipcMocks.invokeHandlers.clear()
    ipcMocks.messageHandlers.clear()
    ipcMocks.removeHandler.mockClear()
    ipcMocks.removeAllListeners.mockClear()
  })

  it('answers commands sent by the trusted renderer main frame', async () => {
    const { window } = createWindow()
    new IpcRegistrar(window).handle(IpcChannel.WindowIsMaximized, () => true)

    const result = await getHandler(ipcMocks.invokeHandlers, IpcChannel.WindowIsMaximized)(
      createEvent(),
      undefined,
    )

    expect(result).toBe(true)
  })

  it.each([
    ['another web contents', createEvent(WEB_CONTENTS_ID + 1)],
    ['a subframe of the renderer', createEvent(WEB_CONTENTS_ID, { url: 'https://example.com' })],
  ])('rejects commands sent by %s', async (_description, event) => {
    const { window } = createWindow()
    const handler = vi.fn(() => true)
    new IpcRegistrar(window).handle(IpcChannel.WindowIsMaximized, handler)

    await expect(
      getHandler(ipcMocks.invokeHandlers, IpcChannel.WindowIsMaximized)(event, undefined),
    ).rejects.toThrow('Untrusted IPC sender.')
    expect(handler).not.toHaveBeenCalled()
  })

  it('validates command payloads before the handler observes them', async () => {
    const { window } = createWindow()
    const handler = vi.fn()
    new IpcRegistrar(window).handle(IpcChannel.WindowAlwaysOnTop, alwaysOnTopSchema, handler)
    const invoke = getHandler(ipcMocks.invokeHandlers, IpcChannel.WindowAlwaysOnTop)

    await invoke(createEvent(), true)
    await expect(invoke(createEvent(), 'yes')).rejects.toThrow()

    expect(handler).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('drops messages with an untrusted sender or an unacceptable payload', () => {
    const { window } = createWindow()
    const handler = vi.fn()
    new IpcRegistrar(window).on(IpcChannel.LogWrite, rendererLogSchema, handler)
    const send = getHandler(ipcMocks.messageHandlers, IpcChannel.LogWrite)
    const entry = { level: 'warn', module: 'Renderer', message: 'Something happened.' }

    send(createEvent(WEB_CONTENTS_ID + 1), entry)
    send(createEvent(), { level: 'trace', module: '', message: '' })
    send(createEvent(), entry)

    expect(handler).toHaveBeenCalledExactlyOnceWith(entry)
  })

  it('sends events only while the bound window is alive', () => {
    const alive = createWindow()
    const destroyed = createWindow(true)

    new IpcRegistrar(alive.window).send(IpcChannel.WindowMaximizedChanged, true)
    new IpcRegistrar(destroyed.window).send(IpcChannel.WindowMaximizedChanged, false)

    expect(alive.send).toHaveBeenCalledExactlyOnceWith(IpcChannel.WindowMaximizedChanged, true)
    expect(destroyed.send).not.toHaveBeenCalled()
  })

  it('removes every enumerated handler before a replacement window is attached', () => {
    removeIpcHandlers()

    expect(ipcMocks.removeHandler).toHaveBeenCalledTimes(Object.values(IpcChannel).length)
    expect(ipcMocks.removeAllListeners).toHaveBeenCalledWith(IpcChannel.LogWrite)
  })
})
