/** Adapts epubreader's Deepgram speech and AIMediaStudio's OpenRouter speech endpoint. */

import { z } from 'zod'
import type { AppSettings } from '@shared/settings'
import type { CaptureSpeech, SpeechModel, CredentialProvider } from '@shared/lens'
import { splitSpeechText } from '@shared/speech'
import type CredentialService from './CredentialService'
import { readBoundedBytes, readProviderJson, requireProviderSuccess } from './providerTransport'

const catalogSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().max(300),
        supported_voices: z.array(z.string().max(300)).max(2000).nullish(),
      }),
    )
    .max(2000),
})

/** Creates speech recipes and streams bounded generated segments into durable storage. */
export default class SpeechService {
  /** Injects the secret vault and network transport. */
  public constructor(
    private readonly credentials: CredentialService,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  /** Verifies a entered key before replacing the working encrypted credential. */
  public async verifyCredential(provider: CredentialProvider, key: string): Promise<number | null> {
    const response = await this.fetcher(
      provider === 'deepgram'
        ? 'https://api.deepgram.com/v1/projects'
        : 'https://openrouter.ai/api/v1/credits',
      {
        headers: { Authorization: `${provider === 'deepgram' ? 'Token' : 'Bearer'} ${key}` },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      },
    )
    await requireProviderSuccess(response, provider === 'deepgram' ? 'Deepgram' : 'OpenRouter')
    const payload = await readProviderJson(response)
    if (provider === 'deepgram') {
      z.object({ projects: z.array(z.object({ project_id: z.string() })).max(10000) }).parse(
        payload,
      )
      return null
    }
    const { data } = z
      .object({
        data: z.object({ total_credits: z.number().finite(), total_usage: z.number().finite() }),
      })
      .parse(payload)
    return data.total_credits - data.total_usage
  }
  /** Retrieves OpenRouter credit without hiding a usable catalog on transient account errors. */
  public async getBalance(): Promise<number | null> {
    const key = await this.credentials.getApiKey('openrouter')
    if (!key) return null
    return this.verifyCredential('openrouter', key).catch(() => null)
  }
  /** Discovers current speech models and voice choices using AIMediaStudio's catalog format. */
  public async getModels(): Promise<SpeechModel[]> {
    const response = await this.fetcher(
      'https://openrouter.ai/api/v1/models?output_modalities=speech',
      { signal: AbortSignal.timeout(20_000), redirect: 'error' },
    )
    await requireProviderSuccess(response, 'OpenRouter')
    return catalogSchema
      .parse(await readProviderJson(response))
      .data.map((model) => ({
        id: model.id,
        name: model.name,
        voices: model.supported_voices ?? [],
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }
  /** Saves generated MP3 segments, or returns a replay recipe for system Web Speech. */
  public async generate(
    text: string,
    language: string,
    settings: AppSettings,
    signal: AbortSignal,
    save: (bytes: Uint8Array) => Promise<string>,
  ): Promise<CaptureSpeech> {
    const provider = settings.speechProvider
    const recipe: CaptureSpeech = {
      provider,
      model:
        provider === 'deepgram'
          ? settings.deepgramModel
          : provider === 'openrouter'
            ? settings.openRouterModel
            : '',
      voice:
        provider === 'web-speech'
          ? settings.webSpeechVoice
          : provider === 'openrouter'
            ? settings.openRouterVoice
            : settings.deepgramModel,
      language,
      rate: settings.speechRate,
      assetIds: [],
    }
    signal.throwIfAborted()
    if (provider === 'web-speech') return recipe
    const key = await this.credentials.getApiKey(provider)
    if (!key)
      throw new Error(
        `Save your ${provider === 'deepgram' ? 'Deepgram' : 'OpenRouter'} API key in settings first.`,
      )
    if (provider === 'deepgram' && !settings.deepgramModel.endsWith(`-${language.split('-')[0]}`))
      throw new Error(
        'The Deepgram voice does not support the description language. Change the language or speech provider in settings.',
      )
    if (provider === 'openrouter' && (!settings.openRouterModel || !settings.openRouterVoice))
      throw new Error('Select an OpenRouter speech model and voice in settings first.')
    let totalBytes = 0
    for (const chunk of splitSpeechText(text)) {
      signal.throwIfAborted()
      const response = await this.fetcher(
        provider === 'deepgram'
          ? `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(settings.deepgramModel)}&encoding=mp3`
          : 'https://openrouter.ai/api/v1/audio/speech',
        {
          method: 'POST',
          headers: {
            Authorization: `${provider === 'deepgram' ? 'Token' : 'Bearer'} ${key}`,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify(
            provider === 'deepgram'
              ? { text: chunk }
              : {
                  model: settings.openRouterModel,
                  input: chunk,
                  voice: settings.openRouterVoice,
                  response_format: 'mp3',
                  speed: settings.speechRate,
                },
          ),
          signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
          redirect: 'error',
        },
      )
      await requireProviderSuccess(response, provider === 'deepgram' ? 'Deepgram' : 'OpenRouter')
      const mime = response.headers.get('content-type')?.split(';')[0]
      if (mime && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mime)) {
        await response.body?.cancel()
        throw new Error('The speech provider did not return MP3 audio.')
      }
      const bytes = await readBoundedBytes(response, 24 * 1024 * 1024 - totalBytes)
      if (!bytes.byteLength) throw new Error('The speech provider returned empty audio.')
      totalBytes += bytes.byteLength
      signal.throwIfAborted()
      recipe.assetIds.push(await save(bytes))
    }
    return recipe
  }
}
