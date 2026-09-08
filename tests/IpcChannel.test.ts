/**
 * Verifies IPC channel naming conventions and the reusable shell surface.
 */

import { describe, expect, it } from 'vitest'
import { IpcChannel } from '../src/shared/IpcChannel'

describe('IpcChannel', () => {
  const channels = Object.values(IpcChannel)

  it('contains no duplicate values and uses namespaced channel names', () => {
    expect(new Set(channels).size).toBe(channels.length)
    channels.forEach((channel) => {
      expect(channel).toMatch(/^[a-z-]+:[a-z-]+$/)
    })
  })

  it('separates main-to-renderer events with the event namespace', () => {
    const events = channels.filter((channel) => channel.startsWith('event:'))
    expect(events.length).toBeGreaterThan(0)
    events.forEach((channel) => {
      expect(channel).toMatch(/^event:[a-z-]+$/)
    })
  })

  it('includes bootstrap, settings, and generic session commands', () => {
    expect(channels).toContain('app:bootstrap')
    expect(channels).toContain('settings:save')
    expect(channels).toContain('session:create')
    expect(channels).toContain('session:get')
    expect(channels).toContain('session:rename')
    expect(channels).toContain('session:delete')
    expect(channels).toContain('session:delete-all')
  })

  it('includes desktop shell, logging, and update channels', () => {
    expect(channels).toContain('window:always-on-top')
    expect(channels).toContain('window:toggle-maximize')
    expect(channels).toContain('theme:set')
    expect(channels).toContain('shell:open-external')
    expect(channels).toContain('logs:write')
    expect(channels).toContain('updates:check')
    expect(channels).toContain('event:update-state')
    expect(channels).toContain('event:settings-open-requested')
  })
})
