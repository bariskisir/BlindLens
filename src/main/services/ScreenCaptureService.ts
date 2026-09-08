/** Captures the pointer's display while temporarily hiding the application window. */

import { desktopCapturer, screen, type BrowserWindow } from 'electron'

/** Normalized PNG screenshot returned by the native capture boundary. */
export interface CapturedScreen {
  bytes: Uint8Array
  width: number
  height: number
}

/** Captures one explicit user-requested screen without granting renderer desktop access. */
export default class ScreenCaptureService {
  /** Binds the window that must be excluded from its own screenshot. */
  public constructor(private readonly window: BrowserWindow) {}
  /** Captures the display selected before hiding the window and restores it without stealing focus. */
  public async capture(signal: AbortSignal): Promise<CapturedScreen> {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const wasVisible = this.window.isVisible() && !this.window.isMinimized()
    try {
      if (wasVisible) this.window.hide()
      await new Promise<void>((resolve) => setTimeout(resolve, 180))
      signal.throwIfAborted()
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.min(2560, Math.round(display.size.width * display.scaleFactor)),
          height: Math.min(2560, Math.round(display.size.height * display.scaleFactor)),
        },
      })
      signal.throwIfAborted()
      const source =
        sources.find((item) => item.display_id === String(display.id)) ??
        (sources.length === 1 ? sources[0] : undefined)
      if (!source || source.thumbnail.isEmpty())
        throw new Error(
          'Screen capture is unavailable. Check screen-recording permission in your system settings.',
        )
      const size = source.thumbnail.getSize()
      return { bytes: source.thumbnail.toPNG(), ...size }
    } finally {
      if (wasVisible && !this.window.isDestroyed()) this.window.showInactive()
    }
  }
}
