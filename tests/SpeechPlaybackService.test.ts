/** Verifies delayed media cancellation and Web Speech pause/resume behavior without a browser. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpeechPlaybackService } from '@renderer/services/SpeechPlaybackService'
import type { SessionDocument } from '@shared/session'
import type { AppState } from '@renderer/store/appSlice'

/** Constructs a complete saved capture with a selected speech engine. */
const session = (provider: 'web-speech' | 'deepgram'): SessionDocument => ({
  id: 'session',
  title: 'Test',
  isDefaultTitle: false,
  createdAt: '',
  updatedAt: '',
  data: {
    capture: {
      phase: 'ready',
      image: null,
      answer: 'A long description. '.repeat(40),
      model: 'test',
      prompt: 'test',
      language: 'tr',
      error: null,
      speech: {
        provider,
        model: '',
        voice: '',
        language: 'tr',
        rate: 1,
        assetIds: provider === 'deepgram' ? ['asset'] : [],
      },
    },
  },
})

/** Minimal browser utterance used to drive completion callbacks explicitly. */
class FakeUtterance {
  public onend: (() => void) | null = null
  public onerror: (() => void) | null = null
  public lang = ''
  public rate = 1
  /** Saves phrase content so tests can inspect queued speech. */
  public constructor(public readonly text: string) {}
}

afterEach(() => vi.unstubAllGlobals())

describe('saved speech playback', () => {
  it('does not play a late audio asset after the user stops playback', async () => {
    let resolve: (url: string) => void = () => undefined
    const getCaptureMedia = vi.fn(
      () =>
        new Promise<string>((complete) => {
          resolve = complete
        }),
    )
    const audio = vi.fn()
    vi.stubGlobal('window', { app: { getCaptureMedia } })
    vi.stubGlobal('Audio', audio)
    const service = new SpeechPlaybackService()
    const play = service.play(session('deepgram'))
    service.stop()
    resolve('data:audio/mpeg;base64,SURz')
    await play
    expect(audio).not.toHaveBeenCalled()
  })
  it('does not advance to the next phrase while paused and clears queued speech on stop', async () => {
    const spoken: FakeUtterance[] = []
    const synthesis = {
      getVoices: () => [],
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    }
    vi.stubGlobal('window', { speechSynthesis: synthesis })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    const service = new SpeechPlaybackService()
    let state: AppState['playback'] | null = null
    service.subscribe((value) => {
      state = value
    }, vi.fn())
    await service.play(session('web-speech'))
    service.pause()
    spoken[0]?.onend?.()
    expect(spoken).toHaveLength(1)
    expect(state).toMatchObject({ status: 'paused' })
    await service.resume()
    expect(spoken).toHaveLength(2)
    service.stop()
    spoken[1]?.onend?.()
    expect(spoken).toHaveLength(2)
    expect(state).toMatchObject({ status: 'idle' })
  })
})
