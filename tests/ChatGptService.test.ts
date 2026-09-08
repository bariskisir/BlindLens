/** Verifies AIHelper-compatible PKCE login, token refresh serialization, and safe account state. */

import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatGptService from '@main/services/ChatGptService'
import type CredentialService from '@main/services/CredentialService'
import type { ChatGptAuthTokens } from '@main/services/CredentialService'
import type LoggerService from '@main/services/LoggerService'

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(async (_url: string) => undefined),
  callback: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }))
vi.mock('@main/services/OAuthCallback', () => ({
  OAUTH_REDIRECT_URL: 'http://localhost:1455/auth/callback',
  createOAuthCallback: mocks.callback,
}))

let saved: ChatGptAuthTokens | null
const vault = {
  /** Returns an isolated token document. */
  getChatGptAuth: async (): Promise<ChatGptAuthTokens | null> => saved,
  /** Saves tokens to test memory. */
  saveChatGptAuth: async (tokens: ChatGptAuthTokens): Promise<void> => {
    saved = tokens
  },
  /** Removes test tokens. */
  deleteChatGptAuth: async (): Promise<void> => {
    saved = null
  },
} as unknown as CredentialService
const logger = { warn: vi.fn() } as unknown as LoggerService

/** Encodes display claims without using a real authentication token. */
const jwt = (payload: object): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

/** Returns a minimal successful image-description stream. */
const answer = (): Response =>
  new Response(
    'data: {"type":"response.output_text.delta","delta":"A window."}\ndata: {"type":"response.completed"}\n',
  )

beforeEach(() => {
  vi.clearAllMocks()
  saved = null
  mocks.callback.mockReturnValue({
    ready: Promise.resolve(),
    code: Promise.resolve('test-code'),
    cancel: mocks.cancel,
  })
})

describe('ChatGPT account service', () => {
  it('uses AIHelper PKCE parameters and sends the matching verifier to token exchange', async () => {
    const access = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/oauth/token'))
        return Response.json({
          access_token: access,
          refresh_token: 'refresh-secret',
          id_token: jwt({ email: 'test@example.invalid' }),
          expires_in: 3600,
        })
      if (String(url).includes('registry.npmjs.org')) return Response.json({ version: '0.145.0' })
      if (String(url).includes('/models'))
        return Response.json({
          models: [{ slug: 'test/vision', display_name: 'Vision', is_default: true }],
        })
      return Response.json({})
    })
    const service = new ChatGptService(vault, vi.fn(), logger, fetcher)
    await service.signIn()
    const url = new URL(mocks.openExternal.mock.calls[0]?.[0] ?? '')
    expect(url.origin).toBe('https://auth.openai.com')
    expect(url.searchParams.get('client_id')).toBe('app_EMoamEEZ73f0CkXaXp7hrann')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(mocks.callback).toHaveBeenCalledWith(url.searchParams.get('state'))
    const request = fetcher.mock.calls.find(([target]) =>
      String(target).includes('/oauth/token'),
    )?.[1]
    const verifier = new URLSearchParams(String(request?.body)).get('code_verifier') ?? ''
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      url.searchParams.get('code_challenge'),
    )
    expect(service.getState()).toMatchObject({
      status: 'signed-in',
      accountEmail: 'test@example.invalid',
    })
    expect(JSON.stringify(service.getState())).not.toContain('refresh-secret')
    expect(mocks.cancel).toHaveBeenCalled()
  })
  it('refreshes an expired token only once for concurrent image requests', async () => {
    saved = {
      accessToken: 'expired',
      refreshToken: 'refresh',
      accountId: 'account',
      accountEmail: '',
      expiresAt: 1,
    }
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/oauth/token')
        ? Response.json({
            access_token: 'fresh-token',
            refresh_token: 'fresh-refresh',
            expires_in: 3600,
          })
        : answer(),
    )
    const service = new ChatGptService(vault, vi.fn(), logger, fetcher)
    await Promise.all([
      service.describe(
        'Describe.',
        'image',
        'test/vision',
        'off',
        new AbortController().signal,
        vi.fn(),
      ),
      service.describe(
        'Describe.',
        'image',
        'test/vision',
        'off',
        new AbortController().signal,
        vi.fn(),
      ),
    ])
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/oauth/token'))).toHaveLength(
      1,
    )
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/responses'))).toHaveLength(2)
  })
  it('closes the callback if the system browser cannot open', async () => {
    mocks.openExternal.mockRejectedValueOnce(new Error('Browser unavailable.'))
    const service = new ChatGptService(vault, vi.fn(), logger, vi.fn())
    await service.signIn()
    expect(service.getState()).toMatchObject({ status: 'error' })
    expect(mocks.cancel).toHaveBeenCalled()
    expect(saved).toBeNull()
  })
  it('does not restore credentials when sign-out occurs during refresh', async () => {
    saved = {
      accessToken: 'expired',
      refreshToken: 'refresh',
      accountId: '',
      accountEmail: '',
      expiresAt: 1,
    }
    let complete: (response: Response) => void = () => undefined
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const service = new ChatGptService(vault, vi.fn(), logger, fetcher)
    const pending = service.refresh()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await service.signOut()
    complete(Response.json({ access_token: 'late-token', expires_in: 3600 }))
    await pending
    expect(saved).toBeNull()
    expect(service.getState().status).toBe('signed-out')
  })
})
