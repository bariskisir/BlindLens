/** Receives AIHelper's PKCE callback only on loopback and releases the listener on every exit. */

import { createServer } from 'node:http'

export const OAUTH_REDIRECT_URL = 'http://localhost:1455/auth/callback'

/** A temporary loopback listener with explicit readiness and cancellation. */
export interface OAuthCallback {
  ready: Promise<void>
  code: Promise<string>
  /** Cancels and closes the callback server. */
  cancel(): void
}

/** Opens the fixed OAuth callback port before the system browser is launched. */
export const createOAuthCallback = (expectedState: string): OAuthCallback => {
  let resolveCode: (value: string) => void = () => undefined
  let rejectCode: (error: Error) => void = () => undefined
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // Attach a rejection observer immediately while callers await listener readiness.
  void code.catch(() => undefined)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', OAUTH_REDIRECT_URL)
    if (request.method !== 'GET' || url.pathname !== '/auth/callback') {
      response.writeHead(404)
      response.end()
      return
    }
    if (url.searchParams.get('state') !== expectedState) {
      response.writeHead(400)
      response.end('Invalid OAuth state.')
      return
    }
    const value = url.searchParams.get('code')
    if (url.searchParams.has('error') || !value) {
      response.writeHead(400)
      response.end('Login was not completed. Return to the application.')
      rejectCode(new Error('ChatGPT login was cancelled.'))
      close()
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'no-store',
    })
    response.end(
      '<!doctype html><html lang="en"><title>Login complete</title><h1>Login complete</h1><p>You can close this tab and return to the application.</p></html>',
    )
    resolveCode(value)
    close()
  })
  /** Closes the loopback server and its timeout after completion or cancellation. */
  const close = (): void => {
    clearTimeout(timeout)
    server.close()
    server.closeAllConnections()
  }
  const timeout = setTimeout(() => {
    rejectCode(new Error('ChatGPT login timed out.'))
    close()
  }, 180_000)
  const ready = new Promise<void>((resolve, reject) => {
    server.on('error', () => {
      const error = new Error(
        'ChatGPT login port 1455 is unavailable. Close other pending ChatGPT login windows and try again.',
      )
      reject(error)
      rejectCode(error)
      close()
    })
    server.listen(1455, '127.0.0.1', resolve)
  })
  return {
    ready,
    code,
    /** Cancels a pending authorization attempt. */ cancel: () => {
      rejectCode(new Error('ChatGPT login was cancelled.'))
      close()
    },
  }
}
