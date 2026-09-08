/**
 * Registers IPC handlers that always validate their sender and their untrusted payload.
 */

import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  IpcEventArguments,
  IpcEventChannel,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
  IpcSendChannel,
  IpcSendPayload,
} from '@shared/ipcContract'

/** Validates one untrusted IPC payload before a handler can observe it. */
export interface IpcInputSchema<Value> {
  /** Returns the validated payload or throws when the input is unacceptable. */
  parse(input: unknown): Value
}

/** Handler result accepted for both synchronous and asynchronous commands. */
type Awaitable<Value> = Value | Promise<Value>

/** Accepts a payload-free handler or a schema paired with a validated handler. */
type InvokeHandler<Channel extends IpcInvokeChannel> =
  | [handle: () => Awaitable<IpcResponse<Channel>>]
  | [
      schema: IpcInputSchema<IpcRequest<Channel>>,
      handle: (request: IpcRequest<Channel>) => Awaitable<IpcResponse<Channel>>,
    ]

/** Removes every handler and listener owned by a previous application window. */
export const removeIpcHandlers = (): void => {
  Object.values(IpcChannel).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  ipcMain.removeAllListeners(IpcChannel.LogWrite)
}

/** Binds typed channels to one window so no handler can skip the trust boundary. */
export default class IpcRegistrar {
  /** Creates a registrar bound to the only renderer allowed to call the main process. */
  public constructor(private readonly window: BrowserWindow) {}

  /** Registers one command that answers the renderer with its contract response. */
  public handle<Channel extends IpcInvokeChannel>(
    channel: Channel,
    ...handler: InvokeHandler<Channel>
  ): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
      this.assertTrustedSender(event)
      if (handler.length === 1) return handler[0]()
      const [schema, handleRequest] = handler
      return handleRequest(schema.parse(input))
    })
  }

  /** Registers one message listener that silently drops unacceptable payloads. */
  public on<Channel extends IpcSendChannel>(
    channel: Channel,
    schema: IpcInputSchema<IpcSendPayload<Channel>>,
    handle: (payload: IpcSendPayload<Channel>) => void,
  ): void {
    ipcMain.on(channel, (event: IpcMainEvent, input: unknown) => {
      if (!this.isTrustedSender(event)) return
      let payload: IpcSendPayload<Channel>
      try {
        payload = schema.parse(input)
      } catch {
        return
      }
      handle(payload)
    })
  }

  /** Sends one typed event while the bound window is still alive. */
  public send<Channel extends IpcEventChannel>(
    channel: Channel,
    ...payload: IpcEventArguments<Channel>
  ): void {
    if (!this.window.isDestroyed()) this.window.webContents.send(channel, ...payload)
  }

  /** Rejects any call that did not originate from the bound renderer's main frame. */
  private assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
    if (!this.isTrustedSender(event)) throw new Error('Untrusted IPC sender.')
  }

  /** Reports whether an event was sent by the bound renderer's main frame. */
  private isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return (
      event.sender.id === this.window.webContents.id &&
      event.senderFrame === this.window.webContents.mainFrame
    )
  }
}
