/** Verifies provider routing, speech request shapes, payload limits, and saved Web Speech recipes. */

import { describe, expect, it, vi } from 'vitest'
import SpeechService from '@main/services/SpeechService'
import type CredentialService from '@main/services/CredentialService'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { splitSpeechText } from '@shared/speech'
import { readBoundedBytes } from '@main/services/providerTransport'

/** Creates a speech client with an isolated fake credential boundary. */
const createService = (fetcher: typeof fetch): SpeechService =>
  new SpeechService({ getApiKey: async () => 'test-key' } as unknown as CredentialService, fetcher)

describe('speech providers', () => {
  it('validates Deepgram keys and reads OpenRouter credit without sending text or generating audio', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ projects: [{ project_id: 'test-project' }] }))
      .mockResolvedValueOnce(Response.json({ data: { total_credits: 20, total_usage: 7.5 } }))
    const service = createService(fetcher)
    expect(await service.verifyCredential('deepgram', 'test-key')).toBeNull()
    expect(await service.verifyCredential('openrouter', 'test-key')).toBe(12.5)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.deepgram.com/v1/projects')
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://openrouter.ai/api/v1/credits')
    expect(fetcher.mock.calls.every(([, request]) => !request?.body)).toBe(true)
  })
  it('keeps Web Speech replay settings without calling a network service', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const save = vi.fn()
    const recipe = await createService(fetcher).generate(
      'Hello',
      'tr',
      { ...DEFAULT_SETTINGS, webSpeechVoice: 'system-voice', speechRate: 1.3 },
      new AbortController().signal,
      save,
    )
    expect(recipe).toMatchObject({
      provider: 'web-speech',
      voice: 'system-voice',
      language: 'tr',
      rate: 1.3,
      assetIds: [],
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it('uses epubreader Deepgram authorization and bounded MP3 requests', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } }),
    )
    const result = await createService(fetcher).generate(
      'Hello. '.repeat(200),
      'en',
      { ...DEFAULT_SETTINGS, speechProvider: 'deepgram' },
      new AbortController().signal,
      async () => 'asset',
    )
    expect(result.assetIds.length).toBeGreaterThan(1)
    const [url, request] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3')
    expect(request?.headers).toMatchObject({ Authorization: 'Token test-key' })
    expect(JSON.parse(String(request?.body)).text.length).toBeLessThanOrEqual(900)
  })
  it('uses AIMediaStudio OpenRouter speech model, voice, format, and speed fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([73, 68, 51])))
    await createService(fetcher).generate(
      'Test',
      'tr',
      {
        ...DEFAULT_SETTINGS,
        speechProvider: 'openrouter',
        openRouterModel: 'test/speech',
        openRouterVoice: 'voice-one',
        speechRate: 1.2,
      },
      new AbortController().signal,
      async () => 'asset',
    )
    const [url, request] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'test/speech',
      input: 'Test',
      voice: 'voice-one',
      response_format: 'mp3',
      speed: 1.2,
    })
  })
  it('rejects mismatched languages, provider errors, and oversized audio', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('sensitive upstream content', { status: 429 }),
    )
    await expect(
      createService(fetcher).generate(
        'Test',
        'tr',
        { ...DEFAULT_SETTINGS, speechProvider: 'deepgram' },
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('does not support')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(
      createService(fetcher).generate(
        'Test',
        'en',
        { ...DEFAULT_SETTINGS, speechProvider: 'deepgram' },
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('HTTP 429')
    await expect(readBoundedBytes(new Response(new Uint8Array(20)), 10)).rejects.toThrow(
      'size limit',
    )
  })
  it('discovers model-specific voices from the OpenRouter catalog', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [{ id: 'test/tts', name: 'Test voice', supported_voices: ['one', 'two'] }],
      }),
    )
    expect(await createService(fetcher).getModels()).toEqual([
      { id: 'test/tts', name: 'Test voice', voices: ['one', 'two'] },
    ])
  })
  it('preserves words and Unicode when chunking speech', () => {
    const text = 'Hello world. これはテストです。 😀'.repeat(150)
    const chunks = splitSpeechText(text, 250)
    expect(chunks.every((chunk) => chunk.length <= 250)).toBe(true)
    expect(chunks.join('').replaceAll(/\s/g, '')).toBe(text.replaceAll(/\s/g, ''))
    expect(chunks.every((chunk) => !/[\ud800-\udbff]$/.test(chunk))).toBe(true)
  })
})
