/** Adapts AIHelper's ChatGPT PKCE login, token refresh, model discovery, and image responses. */

import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import { z } from 'zod'
import {
  INITIAL_LENS_STATE,
  type ChatGptState,
  type ThinkingLevel,
  type VerbosityLevel,
  type ServiceTier,
} from '@shared/lens'
import type CredentialService from './CredentialService'
import type { ChatGptAuthTokens } from './CredentialService'
import type LoggerService from './LoggerService'
import {
  formatChatGptUsage,
  normalizeChatGptModels,
  parseChatGptUsageWindows,
} from './ChatGptMetadata'
import { createOAuthCallback, OAUTH_REDIRECT_URL, type OAuthCallback } from './OAuthCallback'
import { readChatGptStream } from './ChatGptStream'
import { readProviderJson, requireProviderSuccess } from './providerTransport'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const API_ROOT = 'https://chatgpt.com/backend-api'
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().optional(),
  expires_in: z.number().positive(),
})

/** Owns only this application's login; tokens never cross the preload bridge. */
export default class ChatGptService {
  private state = structuredClone(INITIAL_LENS_STATE.chatGpt)
  private callback: OAuthCallback | null = null
  private refreshPromise: Promise<ChatGptAuthTokens | null> | null = null
  private revision = 0
  private loginBusy = false
  private clientVersion = '0.145.0'
  private versionFetched = false
  /** Injects the credential vault, public event sink, logger, and network transport. */
  public constructor(
    private readonly credentials: CredentialService,
    private readonly changed: () => void,
    private readonly logger: LoggerService,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  /** Restores authentication without blocking startup on network metadata. */
  public async initialize(): Promise<void> {
    const auth = await this.credentials.getChatGptAuth()
    if (auth) this.update({ status: 'signed-in', accountEmail: auth.accountEmail })
    if (auth)
      void this.refresh().catch(() =>
        this.logger.warn('ChatGPT', 'Account metadata refresh failed.'),
      )
  }
  /** Returns a renderer-safe copy of authentication and model state. */
  public getState(): ChatGptState {
    return structuredClone(this.state)
  }
  /** Starts the same browser PKCE flow used by AIHelper. */
  public async signIn(): Promise<void> {
    if (this.loginBusy) return
    this.loginBusy = true
    const revision = ++this.revision
    this.update({ status: 'signing-in', error: undefined })
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const callback = createOAuthCallback(state)
    this.callback = callback
    try {
      await callback.ready
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URL,
        scope: 'openid profile email offline_access',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        state,
      })
      await shell.openExternal(`https://auth.openai.com/oauth/authorize?${query}`)
      const code = await callback.code
      const response = await this.fetcher(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: OAUTH_REDIRECT_URL,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      })
      await requireProviderSuccess(response, 'ChatGPT login')
      const tokens = tokenSchema.parse(await readProviderJson(response))
      if (!tokens.refresh_token) throw new Error('ChatGPT did not return a refresh token.')
      if (revision !== this.revision) return
      const auth: ChatGptAuthTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accountId:
          this.claim(tokens.access_token, ['https://api.openai.com/auth', 'chatgpt_account_id']) ||
          this.claim(tokens.access_token, ['https://api.openai.com/auth', 'account_id']),
        accountEmail: this.claim(tokens.id_token ?? '', ['email']),
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }
      await this.credentials.saveChatGptAuth(auth)
      if (revision !== this.revision) {
        await this.credentials.deleteChatGptAuth()
        return
      }
      this.update({ status: 'signed-in', accountEmail: auth.accountEmail })
      await this.refresh()
    } catch (error) {
      if (revision === this.revision)
        this.update({
          status: 'error',
          error:
            error instanceof Error && !error.name.startsWith('Zod')
              ? error.message.slice(0, 300)
              : 'ChatGPT login failed. Try again.',
        })
      this.logger.warn('ChatGPT', 'ChatGPT login did not complete.')
    } finally {
      callback.cancel()
      if (this.callback === callback) this.callback = null
      this.loginBusy = false
    }
  }
  /** Invalidates pending authorization and removes saved OAuth tokens. */
  public async signOut(): Promise<void> {
    this.revision++
    this.callback?.cancel()
    await this.credentials.deleteChatGptAuth()
    this.state = structuredClone(INITIAL_LENS_STATE.chatGpt)
    this.changed()
  }
  /** Cancels window-scoped login work while retaining durable credentials. */
  public dispose(): void {
    this.revision++
    this.callback?.cancel()
  }
  /** Refreshes models and usage using AIHelper's catalog and usage adapters. */
  public async refresh(): Promise<void> {
    const revision = this.revision
    const auth = await this.validAuth()
    if (!auth || revision !== this.revision) return
    if (!this.versionFetched) {
      this.versionFetched = true
      try {
        const result = await this.fetcher('https://registry.npmjs.org/@openai/codex/latest', {
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        })
        if (result.ok) {
          const parsed = z
            .object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
            .safeParse(await readProviderJson(result))
          if (parsed.success) this.clientVersion = parsed.data.version
        }
      } catch {
        /* Preserve AIHelper's client-version fallback when discovery is unavailable. */
      }
    }
    const results = await Promise.allSettled([
      this.metadata(
        `${API_ROOT}/codex/models?client_version=${encodeURIComponent(this.clientVersion)}`,
        auth,
      ),
      this.metadata(`${API_ROOT}/wham/usage`, auth),
    ])
    if (revision !== this.revision) return
    const [models, usage] = results
    if (models.status === 'fulfilled') this.state.models = normalizeChatGptModels(models.value)
    if (usage.status === 'fulfilled') {
      this.state.limitLabel = formatChatGptUsage(usage.value)
      this.state.usageWindows = parseChatGptUsageWindows(usage.value)
    }
    this.update({ status: 'signed-in', accountEmail: auth.accountEmail })
  }
  /** Describes a PNG image through ChatGPT's subscription-backed Responses endpoint. */
  public async describe(
    prompt: string,
    imageBase64: string,
    model: string,
    thinking: ThinkingLevel,
    signal: AbortSignal,
    onDelta: (delta: string) => void,
    options: { verbosity: VerbosityLevel; serviceTier: ServiceTier } = {
      verbosity: 'medium',
      serviceTier: 'normal',
    },
  ): Promise<string> {
    let auth = await this.validAuth()
    if (!auth) throw new Error('Sign in to ChatGPT in settings first.')
    if (!model)
      throw new Error('Select a ChatGPT model in settings and refresh the model list if needed.')
    const metadata = this.state.models.find((item) => item.id === model)
    const effort = metadata?.thinkingVariants.some((item) => item.value === thinking)
      ? thinking
      : metadata?.thinkingVariants[0]?.value
    const body = JSON.stringify({
      model,
      instructions: prompt,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Describe the attached screen using the selected instructions.',
            },
            { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` },
          ],
        },
      ],
      stream: true,
      store: false,
      text: { verbosity: options.verbosity },
      ...(options.serviceTier === 'fast' ? { service_tier: 'priority' } : {}),
      ...(thinking !== 'off' && effort ? { reasoning: { effort } } : {}),
    })
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)])
    for (let attempt = 0; attempt < 2; attempt++) {
      requestSignal.throwIfAborted()
      const response = await this.fetcher(`${API_ROOT}/codex/responses`, {
        method: 'POST',
        headers: {
          ...this.headers(auth),
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'responses=experimental',
        },
        body,
        signal: requestSignal,
        redirect: 'error',
      })
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel()
        auth = await this.validAuth(true)
        if (!auth) throw new Error('ChatGPT login expired. Sign in again.')
        continue
      }
      await requireProviderSuccess(response, 'ChatGPT')
      return readChatGptStream(response, requestSignal, onDelta)
    }
    throw new Error('ChatGPT login expired. Sign in again.')
  }
  /** Fetches bounded account metadata with a finite timeout. */
  private async metadata(url: string, auth: ChatGptAuthTokens): Promise<unknown> {
    const response = await this.fetcher(url, {
      headers: this.headers(auth),
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    })
    await requireProviderSuccess(response, 'ChatGPT')
    return readProviderJson(response)
  }
  /** Shares one token refresh between concurrent requests. */
  private async validAuth(force = false): Promise<ChatGptAuthTokens | null> {
    if (this.refreshPromise) return this.refreshPromise
    const auth = await this.credentials.getChatGptAuth()
    if (!auth) return null
    if (!force && auth.expiresAt > Date.now() + 60_000) return auth
    if (!this.refreshPromise)
      this.refreshPromise = this.refreshToken(auth).finally(() => {
        this.refreshPromise = null
      })
    return this.refreshPromise
  }
  /** Refreshes access credentials without allowing sign-out to be undone by an in-flight response. */
  private async refreshToken(auth: ChatGptAuthTokens): Promise<ChatGptAuthTokens | null> {
    const revision = this.revision
    const response = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: auth.refreshToken,
      }),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    })
    await requireProviderSuccess(response, 'ChatGPT login')
    const tokens = tokenSchema.parse(await readProviderJson(response))
    if (revision !== this.revision) return null
    const updated = {
      ...auth,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? auth.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }
    await this.credentials.saveChatGptAuth(updated)
    if (revision !== this.revision) {
      await this.credentials.deleteChatGptAuth()
      return null
    }
    return updated
  }
  /** Constructs AIHelper-compatible authenticated request headers. */
  private headers(auth: ChatGptAuthTokens): Record<string, string> {
    return {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: 'application/json',
      originator: 'codex_cli_rs',
      ...(auth.accountId ? { 'chatgpt-account-id': auth.accountId } : {}),
    }
  }
  /** Reads display claims without using an unverified JWT as an authorization decision. */
  private claim(token: string, path: string[]): string {
    try {
      let value: unknown = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
      )
      for (const key of path) {
        if (!value || typeof value !== 'object') return ''
        value = (value as Record<string, unknown>)[key]
      }
      return typeof value === 'string' ? value : ''
    } catch {
      return ''
    }
  }
  /** Publishes a partial safe authentication state update. */
  private update(patch: Partial<ChatGptState>): void {
    this.state = { ...this.state, ...patch }
    this.changed()
  }
}
