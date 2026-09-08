/**
 * Tracks and persists the durable position, size, and display mode of the main window.
 */

import type { BrowserWindow } from 'electron'
import { readJsonFile, writeJsonFileSync } from '../storage/atomicJson'
import {
  fitWindowBoundsToDisplays,
  parsePersistedWindowState,
  type PersistedWindowState,
  type WindowBounds,
} from '../windowState'
import type LoggerService from './LoggerService'

const SAVE_DEBOUNCE_MS = 250

/** Window placement restored from an earlier session and fitted to the connected displays. */
export interface RestoredWindowState {
  bounds: WindowBounds | null
  maximized: boolean
  fullScreen: boolean
}

/** Owns the small window-state document and the events that keep it current. */
export default class WindowStateStore {
  private state: PersistedWindowState | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private logger: LoggerService | null = null

  /** Creates a store for one durable window-state document. */
  public constructor(private readonly filePath: string) {}

  /**
   * Loads the last valid window state and keeps only bounds that still fit a connected
   * display, so stale coordinates cannot open the window off-screen.
   */
  public async load(workAreas: WindowBounds[]): Promise<RestoredWindowState | null> {
    let persisted: PersistedWindowState | null = null
    try {
      persisted = parsePersistedWindowState(await readJsonFile(this.filePath))
    } catch {
      persisted = null
    }
    if (!persisted) return null
    return {
      bounds: fitWindowBoundsToDisplays(persisted.bounds, workAreas),
      maximized: persisted.maximized,
      fullScreen: persisted.fullScreen,
    }
  }

  /** Records normal bounds, maximized state, and fullscreen state for later launches. */
  public track(
    window: BrowserWindow,
    restored: RestoredWindowState | null,
    logger: LoggerService,
  ): void {
    this.logger = logger
    this.state = {
      revision: 1,
      bounds: restored?.bounds ?? window.getBounds(),
      maximized: restored?.maximized ?? false,
      fullScreen: restored?.fullScreen ?? false,
    }

    window.on('move', () => this.scheduleSave(window))
    window.on('resize', () => this.scheduleSave(window))
    window.on('maximize', () => this.scheduleSave(window))
    window.on('unmaximize', () => this.scheduleSave(window))
    window.on('enter-full-screen', () => this.scheduleSave(window))
    window.on('leave-full-screen', () => this.scheduleSave(window))
    window.on('close', () => {
      this.cancelScheduledSave()
      this.capture(window)
      this.persist()
    })
    window.once('closed', () => this.cancelScheduledSave())
  }

  /** Debounces frequent move and resize events before saving the latest state. */
  private scheduleSave(window: BrowserWindow): void {
    this.capture(window)
    this.cancelScheduledSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.capture(window)
      this.persist()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Stops a pending debounced save so a closing window cannot write twice. */
  private cancelScheduledSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  /** Captures normal bounds while retaining them when maximized or fullscreen. */
  private capture(window: BrowserWindow): void {
    if (window.isDestroyed()) return
    const maximized = window.isMaximized()
    const fullScreen = window.isFullScreen()
    const bounds =
      maximized || fullScreen
        ? (this.state?.bounds ?? window.getNormalBounds())
        : window.getBounds()
    this.state = { revision: 1, bounds, maximized, fullScreen }
  }

  /** Writes the latest state atomically so a close event cannot lose the last move. */
  private persist(): void {
    if (!this.state) return
    try {
      writeJsonFileSync(this.filePath, this.state)
    } catch (error) {
      this.logger?.warn('WindowStateStore', 'Window state could not be persisted.', error)
    }
  }
}
