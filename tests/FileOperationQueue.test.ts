/**
 * Verifies that durable file operations are serialized per key and survive failures.
 */

import { describe, expect, it } from 'vitest'
import FileOperationQueue from '../src/main/storage/FileOperationQueue'

/** Resolves after the given delay so overlapping operations become observable. */
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

describe('FileOperationQueue', () => {
  it('runs operations sharing one key in request order', async () => {
    const queue = new FileOperationQueue()
    const events: string[] = []

    /** Records the start and end of one tracked operation. */
    const track = (name: string, duration: number) => async (): Promise<string> => {
      events.push(`${name}:start`)
      await delay(duration)
      events.push(`${name}:end`)
      return name
    }

    const results = await Promise.all([
      queue.run('settings.json', track('first', 15)),
      queue.run('settings.json', track('second', 1)),
      queue.run('settings.json', track('third', 1)),
    ])

    expect(results).toEqual(['first', 'second', 'third'])
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ])
  })

  it('keeps the queue usable after a failed operation', async () => {
    const queue = new FileOperationQueue()

    const failure = queue.run('settings.json', () => Promise.reject(new Error('write failed')))
    const recovery = queue.run('settings.json', () => Promise.resolve('written'))

    await expect(failure).rejects.toThrow('write failed')
    await expect(recovery).resolves.toBe('written')
  })

  it('allows operations on different keys to overlap', async () => {
    const queue = new FileOperationQueue()
    let running = 0
    let peak = 0

    /** Reports the highest number of operations that ran at the same time. */
    const measure = async (): Promise<void> => {
      running += 1
      peak = Math.max(peak, running)
      await delay(5)
      running -= 1
    }

    await Promise.all([queue.run('one.json', measure), queue.run('two.json', measure)])

    expect(peak).toBe(2)
  })
})
