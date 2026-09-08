/**
 * Verifies that optional CSS Module class names join without stray separators.
 */

import { describe, expect, it } from 'vitest'
import { cx } from '../src/renderer/src/utils/classNames'

describe('cx', () => {
  it('joins present class names with single spaces', () => {
    expect(cx('container', 'active')).toBe('container active')
  })

  it('drops missing module lookups and inactive conditions', () => {
    expect(cx('container', undefined, false, null, 'no-drag')).toBe('container no-drag')
  })

  it('returns an empty string when nothing applies', () => {
    expect(cx(undefined, false)).toBe('')
  })
})
