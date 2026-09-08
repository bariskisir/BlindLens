/**
 * Verifies session timestamp formatting for both supported clock formats.
 */

import { describe, expect, it } from 'vitest'
import { formatDate } from '../src/renderer/src/utils/formatters'

describe('formatDate', () => {
  const isoDate = '2026-12-25T14:30:00.000Z'

  it('formats 24-hour timestamps without a period suffix', () => {
    const result = formatDate(isoDate, '24-hour')
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
    expect(result).toContain('.2026 ')
  })

  it('formats 12-hour timestamps with AM or PM', () => {
    expect(formatDate(isoDate, '12-hour')).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} (AM|PM)$/)
  })
})
