/**
 * Verifies the cross-process helpers shared by the main and renderer processes.
 */

import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DESKTOP_PLATFORMS, toDesktopPlatform, toSessionSummary } from '../src/shared/types'

describe('toDesktopPlatform', () => {
  it.each(DESKTOP_PLATFORMS)('keeps the supported platform %s', (platform) => {
    expect(toDesktopPlatform(platform)).toBe(platform)
  })

  it.each(['freebsd', 'openbsd', 'sunos', 'aix'])(
    'maps the unsupported platform %s onto linux behavior',
    (platform) => {
      expect(toDesktopPlatform(platform)).toBe('linux')
    },
  )
})

describe('toSessionSummary', () => {
  it('keeps only sidebar metadata from a complete generic session', () => {
    const now = new Date().toISOString()

    const summary = toSessionSummary({
      id: randomUUID(),
      title: 'Workspace',
      isDefaultTitle: false,
      createdAt: now,
      updatedAt: now,
      data: {},
    })

    expect(summary.title).toBe('Workspace')
    expect(summary).not.toHaveProperty('data')
  })
})
