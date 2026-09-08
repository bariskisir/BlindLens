/** Verifies display selection, self-window exclusion, cancellation, and restoration after errors. */

import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScreenCaptureService from '@main/services/ScreenCaptureService'

const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  display: vi.fn(),
  pointer: vi.fn(() => ({ x: 1500, y: 50 })),
}))
vi.mock('electron', () => ({
  desktopCapturer: { getSources: mocks.sources },
  screen: { getCursorScreenPoint: mocks.pointer, getDisplayNearestPoint: mocks.display },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.display.mockReturnValue({ id: 2, size: { width: 1920, height: 1080 }, scaleFactor: 1 })
})
afterEach(() => vi.useRealTimers())

/** Creates only the native window capabilities needed for capture exclusion. */
const createWindow = (visible = true) => ({
  isVisible: () => visible,
  isMinimized: () => false,
  hide: vi.fn(),
  showInactive: vi.fn(),
  isDestroyed: () => false,
})

describe('screen capture boundary', () => {
  it('selects the pointer display, excludes itself, and restores without stealing focus', async () => {
    const thumbnail = {
      isEmpty: () => false,
      getSize: () => ({ width: 1920, height: 1080 }),
      toPNG: () => Buffer.from('png'),
    }
    mocks.sources.mockResolvedValue([
      { display_id: '1', thumbnail: { ...thumbnail, toPNG: () => Buffer.from('wrong') } },
      { display_id: '2', thumbnail },
    ])
    const window = createWindow()
    const pending = new ScreenCaptureService(window as unknown as BrowserWindow).capture(
      new AbortController().signal,
    )
    expect(window.hide).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(180)
    expect(await pending).toMatchObject({ bytes: Buffer.from('png'), width: 1920 })
    expect(mocks.display).toHaveBeenCalledWith({ x: 1500, y: 50 })
    expect(window.showInactive).toHaveBeenCalledOnce()
  })
  it('restores its window when screen recording permission is denied', async () => {
    mocks.sources.mockRejectedValue(new Error('Permission denied'))
    const window = createWindow()
    const result = new ScreenCaptureService(window as unknown as BrowserWindow).capture(
      new AbortController().signal,
    )
    const assertion = expect(result).rejects.toThrow('Permission denied')
    await vi.advanceTimersByTimeAsync(180)
    await assertion
    expect(window.showInactive).toHaveBeenCalledOnce()
  })
  it('does not reveal a tray-hidden window and stops before native capture when cancelled', async () => {
    const window = createWindow(false)
    const controller = new AbortController()
    const result = new ScreenCaptureService(window as unknown as BrowserWindow).capture(
      controller.signal,
    )
    const assertion = expect(result).rejects.toThrow()
    controller.abort()
    await vi.advanceTimersByTimeAsync(180)
    await assertion
    expect(mocks.sources).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
    expect(window.showInactive).not.toHaveBeenCalled()
  })
})
