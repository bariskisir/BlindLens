/**
 * Types every approved IPC channel so the preload bridge and main handlers cannot drift apart.
 */

import type { LensState, CredentialProvider, CaptureEvent, SpeechAvailability } from './lens'
import { IpcChannel } from './IpcChannel'
import type { BootstrapPayload } from './api'
import type { RendererLogEntry } from './logging'
import type { DeleteSessionResult, SessionDocument } from './session'
import type { AppSettings, AppSettingsPatch, ResolvedThemeMode } from './settings'
import type { UpdateStateEvent } from './updates'

/** Request payload and resolved value of one renderer-invoked command. */
interface IpcCommand<Request, Response> {
  request: Request
  response: Response
}

/** Renderer-invoked commands answered by a main-process handler. */
export interface IpcInvokeContract {
  [IpcChannel.LensState]: IpcCommand<void, LensState>
  [IpcChannel.ChatGptSignIn]: IpcCommand<void, void>
  [IpcChannel.ChatGptSignOut]: IpcCommand<void, void>
  [IpcChannel.ProvidersRefresh]: IpcCommand<'chatgpt' | 'openrouter', void>
  [IpcChannel.SpeechAvailability]: IpcCommand<SpeechAvailability, void>
  [IpcChannel.HotkeyRecording]: IpcCommand<boolean, void>
  [IpcChannel.CredentialSave]: IpcCommand<{ provider: CredentialProvider; key: string }, void>
  [IpcChannel.CaptureScreen]: IpcCommand<void, void>
  [IpcChannel.CaptureRetry]: IpcCommand<{ id: string; speechOnly: boolean }, void>
  [IpcChannel.CaptureCancel]: IpcCommand<void, void>
  [IpcChannel.CaptureMedia]: IpcCommand<{ id: string; assetId: string }, string>
  [IpcChannel.CaptureExport]: IpcCommand<{ id: string; kind: 'image' | 'text' | 'audio' }, void>
  [IpcChannel.CaptureCopyText]: IpcCommand<string, void>
  [IpcChannel.AppBootstrap]: IpcCommand<void, BootstrapPayload>
  [IpcChannel.SettingsSave]: IpcCommand<AppSettingsPatch, AppSettings>
  [IpcChannel.SessionCreate]: IpcCommand<void, SessionDocument>
  [IpcChannel.SessionGet]: IpcCommand<string, SessionDocument>
  [IpcChannel.SessionRename]: IpcCommand<{ id: string; title: string }, SessionDocument>
  [IpcChannel.SessionDelete]: IpcCommand<string, DeleteSessionResult>
  [IpcChannel.SessionDeleteAll]: IpcCommand<void, SessionDocument>
  [IpcChannel.WindowAlwaysOnTop]: IpcCommand<boolean, void>
  [IpcChannel.WindowMinimize]: IpcCommand<void, void>
  [IpcChannel.WindowToggleMaximize]: IpcCommand<void, boolean>
  [IpcChannel.WindowClose]: IpcCommand<void, void>
  [IpcChannel.WindowIsMaximized]: IpcCommand<void, boolean>
  [IpcChannel.ThemeSet]: IpcCommand<ResolvedThemeMode, void>
  [IpcChannel.ShellOpenExternal]: IpcCommand<string, void>
  [IpcChannel.LogsOpenDirectory]: IpcCommand<void, void>
  [IpcChannel.UpdatesCheck]: IpcCommand<void, void>
  [IpcChannel.UpdatesInstall]: IpcCommand<void, void>
}

/** One-way renderer messages that never produce a response. */
export interface IpcSendContract {
  [IpcChannel.LogWrite]: RendererLogEntry
}

/** Payload delivered by one main-to-renderer event. */
interface IpcEvent<Payload> {
  payload: Payload
}

/** Events pushed from the main process to the active renderer. */
export interface IpcEventContract {
  [IpcChannel.LensStateChanged]: IpcEvent<LensState>
  [IpcChannel.CaptureChanged]: IpcEvent<CaptureEvent>
  [IpcChannel.UpdateState]: IpcEvent<UpdateStateEvent>
  [IpcChannel.WindowMaximizedChanged]: IpcEvent<boolean>
  [IpcChannel.SettingsOpenRequested]: IpcEvent<void>
}

/** Channel answered with a value by the main process. */
export type IpcInvokeChannel = keyof IpcInvokeContract
/** Channel accepting one-way renderer messages. */
export type IpcSendChannel = keyof IpcSendContract
/** Channel carrying main-to-renderer events. */
export type IpcEventChannel = keyof IpcEventContract

/** Payload accepted by one invokable channel. */
export type IpcRequest<Channel extends IpcInvokeChannel> = IpcInvokeContract[Channel]['request']
/** Value resolved by one invokable channel. */
export type IpcResponse<Channel extends IpcInvokeChannel> = IpcInvokeContract[Channel]['response']
/** Payload accepted by one one-way channel. */
export type IpcSendPayload<Channel extends IpcSendChannel> = IpcSendContract[Channel]
/** Payload delivered by one main-to-renderer event channel. */
export type IpcEventPayload<Channel extends IpcEventChannel> = IpcEventContract[Channel]['payload']

/** Omits the payload argument for commands that take no request value. */
export type IpcInvokeArguments<Channel extends IpcInvokeChannel> =
  IpcRequest<Channel> extends void ? [] : [request: IpcRequest<Channel>]

/** Omits the payload argument for events that carry no value. */
export type IpcEventArguments<Channel extends IpcEventChannel> =
  IpcEventPayload<Channel> extends void ? [] : [payload: IpcEventPayload<Channel>]

/** Resolves to the given type only when it is empty. */
type AssertNever<Value extends never> = Value

/** Fails to compile when an enumerated channel has no typed contract entry. */
export type IpcContractCoverage = AssertNever<
  Exclude<IpcChannel, IpcInvokeChannel | IpcSendChannel | IpcEventChannel>
>
