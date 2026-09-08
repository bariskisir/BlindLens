/**
 * Verifies session sidebar width limits across normal and narrow windows.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SESSIONS_SIDEBAR_WIDTH,
  MIN_SESSIONS_SIDEBAR_WIDTH,
  clampSessionsSidebarWidth,
  getMaxSessionsSidebarWidth,
} from '../src/renderer/src/utils/sidebarSizing'

describe('session sidebar sizing', () => {
  it('keeps the default width when it fits the viewport', () => {
    expect(clampSessionsSidebarWidth(DEFAULT_SESSIONS_SIDEBAR_WIDTH, 1180)).toBe(266)
  })

  it('enforces the minimum usable sidebar width', () => {
    expect(clampSessionsSidebarWidth(40, 1180)).toBe(MIN_SESSIONS_SIDEBAR_WIDTH)
  })

  it('preserves minimum workspace room in a narrow application window', () => {
    expect(getMaxSessionsSidebarWidth(450)).toBe(290)
    expect(clampSessionsSidebarWidth(400, 450)).toBe(290)
  })

  it('falls back safely for invalid widths and extremely narrow viewports', () => {
    expect(clampSessionsSidebarWidth(Number.NaN, 1180)).toBe(DEFAULT_SESSIONS_SIDEBAR_WIDTH)
    expect(getMaxSessionsSidebarWidth(120)).toBe(MIN_SESSIONS_SIDEBAR_WIDTH)
  })
})
