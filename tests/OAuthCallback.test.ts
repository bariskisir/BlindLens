/** Verifies loopback-only OAuth callbacks, CSRF rejection, listener errors, and cancellation. */

import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOAuthCallback } from '@main/services/OAuthCallback'

const mocks = vi.hoisted(() => ({ createServer: vi.fn() }))
vi.mock('node:http', () => ({ createServer: mocks.createServer }))

let server: EventEmitter & {
  listen: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  closeAllConnections: ReturnType<typeof vi.fn>
}
let handler: (request: IncomingMessage, response: ServerResponse) => void

beforeEach(() => {
  vi.useFakeTimers()
  server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port, _address, ready: () => void) => ready()),
    close: vi.fn(),
    closeAllConnections: vi.fn(),
  })
  mocks.createServer.mockImplementation((callback) => {
    handler = callback
    return server
  })
})
afterEach(() => vi.useRealTimers())

/** Delivers one HTTP request to the injected loopback listener. */
const request = (url: string, method = 'GET') => {
  const response = { writeHead: vi.fn(), end: vi.fn() }
  handler({ url, method } as IncomingMessage, response as unknown as ServerResponse)
  return response
}

describe('ChatGPT OAuth callback', () => {
  it('binds only loopback, rejects invalid state and paths, then accepts a matching callback', async () => {
    const callback = createOAuthCallback('expected-state')
    await callback.ready
    expect(server.listen).toHaveBeenCalledWith(1455, '127.0.0.1', expect.any(Function))
    expect(request('/other?state=expected-state&code=code').writeHead).toHaveBeenCalledWith(404)
    expect(request('/auth/callback?state=wrong&code=code').writeHead).toHaveBeenCalledWith(400)
    const response = request('/auth/callback?state=expected-state&code=accepted')
    expect(await callback.code).toBe('accepted')
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Cache-Control': 'no-store' }),
    )
    expect(server.close).toHaveBeenCalledOnce()
  })
  it('closes the listener on cancellation and port conflicts', async () => {
    const callback = createOAuthCallback('state')
    callback.cancel()
    await expect(callback.code).rejects.toThrow('cancelled')
    expect(server.close).toHaveBeenCalled()
    const conflicted = createOAuthCallback('state')
    server.emit('error', new Error('EADDRINUSE'))
    await expect(conflicted.code).rejects.toThrow('1455')
  })
  it('times out abandoned authorization attempts', async () => {
    const callback = createOAuthCallback('state')
    const assertion = expect(callback.code).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(180000)
    await assertion
    expect(server.close).toHaveBeenCalled()
  })
})
