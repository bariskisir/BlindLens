/**
 * Defines the capability-limited application API exposed by the preload bridge.
 */

import type { RendererLogEntry } from './logging'
import type { LensApi } from './lens'
import type { DeleteSessionResult, SessionDocument, SessionSummary } from './session'
import type { AppSettings, AppSettingsPatch, ResolvedThemeMode } from './settings'
import type { UpdateStateEvent } from './updates'

export const DESKTOP_PLATFORMS = ['win32', 'darwin', 'linux'] as const

/** Desktop platforms supported by the Electron shell. */
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number]

/** Maps a reported operating system onto the closest supported desktop platform. */
export const toDesktopPlatform = (platform: string): DesktopPlatform =>
  DESKTOP_PLATFORMS.includes(platform as DesktopPlatform) ? (platform as DesktopPlatform) : 'linux'

/** Initial renderer state returned by the main process. */
export interface BootstrapPayload {
  settings: AppSettings
  sessions: SessionSummary[]
  currentSession: SessionDocument
  platform: DesktopPlatform
  version: string
}

/** Removes one previously registered main-to-renderer subscription. */
export type Unsubscribe = () => void

/** Capability-limited API exposed by the preload bridge. */
export interface AppApi extends LensApi {
  /** Loads persisted settings, sessions, and application metadata. */
  bootstrap(): Promise<BootstrapPayload>
  /** Atomically merges and persists validated application settings fields. */
  saveSettings(patch: AppSettingsPatch): Promise<AppSettings>
  /** Creates and persists one empty generic session workspace. */
  createSession(): Promise<SessionDocument>
  /** Loads one complete session. */
  getSession(id: string): Promise<SessionDocument>
  /** Renames one session and returns the updated document. */
  renameSession(id: string, title: string): Promise<SessionDocument>
  /** Deletes one session while preserving the last-workspace invariant. */
  deleteSession(id: string): Promise<DeleteSessionResult>
  /** Deletes every session and returns a fresh empty workspace. */
  deleteAllSessions(): Promise<SessionDocument>
  /** Changes the native always-on-top state. */
  setAlwaysOnTop(enabled: boolean): Promise<void>
  /** Minimizes the main application window. */
  minimizeWindow(): Promise<void>
  /** Toggles maximized state and returns the resulting state. */
  toggleMaximizeWindow(): Promise<boolean>
  /** Closes the main application window. */
  closeWindow(): Promise<void>
  /** Reports whether the main application window is maximized. */
  isWindowMaximized(): Promise<boolean>
  /** Synchronizes native window chrome with the resolved renderer theme. */
  setTheme(theme: ResolvedThemeMode): Promise<void>
  /** Opens an allow-listed URL in the system browser. */
  openExternal(url: string): Promise<void>
  /** Opens the application log directory in the operating-system file manager. */
  openLogsDirectory(): Promise<void>
  /** Persists one validated renderer diagnostic through the main logger. */
  writeLog(entry: RendererLogEntry): void
  /** Checks GitHub Releases for an application update. */
  checkForUpdates(): Promise<void>
  /** Restarts and installs a downloaded update. */
  installUpdate(): Promise<void>
  /** Subscribes to updater lifecycle events. */
  onUpdateState(listener: (event: UpdateStateEvent) => void): Unsubscribe
  /** Subscribes to native maximize and restore state changes. */
  onWindowMaximizedChange(listener: (maximized: boolean) => void): Unsubscribe
  /** Subscribes to settings navigation requested from native desktop UI. */
  onSettingsOpenRequested(listener: () => void): Unsubscribe
}
