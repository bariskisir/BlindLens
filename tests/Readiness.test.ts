/** Verifies account, model, language, and local voice prerequisites independently of provider requests. */

import { describe, expect, it } from 'vitest'
import { getReadinessIssue } from '@shared/readiness'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { INITIAL_LENS_STATE, type LensState } from '@shared/lens'

/** Provides one signed-in model catalog and configured cloud credential flags. */
const readyState = (): LensState => ({
  ...structuredClone(INITIAL_LENS_STATE),
  chatGpt: {
    ...INITIAL_LENS_STATE.chatGpt,
    status: 'signed-in',
    models: [
      {
        id: 'vision',
        displayName: 'Vision',
        description: '',
        isDefault: true,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ],
  },
  credentials: { deepgram: true, openrouter: true },
  speechModels: [{ id: 'speech', name: 'Speech', voices: ['one'] }],
})
const speech = { available: true, voiceUris: ['system'] }

describe('capture prerequisites', () => {
  it('accepts Web Speech without a cloud key and rejects removed local voices', () => {
    const state = readyState()
    state.credentials = { deepgram: false, openrouter: false }
    expect(getReadinessIssue(DEFAULT_SETTINGS, state, speech)).toBeNull()
    expect(
      getReadinessIssue({ ...DEFAULT_SETTINGS, webSpeechVoice: 'removed' }, state, speech),
    ).toBe('voiceMissing')
  })
  it('rejects unavailable ChatGPT models and mismatched Deepgram languages', () => {
    expect(
      getReadinessIssue({ ...DEFAULT_SETTINGS, chatGptModel: 'removed' }, readyState(), speech),
    ).toBe('chatGptModelRequired')
    expect(
      getReadinessIssue(
        { ...DEFAULT_SETTINGS, speechProvider: 'deepgram', descriptionLanguage: 'tr' },
        readyState(),
        speech,
      ),
    ).toBe('languageMismatch')
    expect(
      getReadinessIssue(
        { ...DEFAULT_SETTINGS, speechProvider: 'deepgram', descriptionLanguage: 'en' },
        readyState(),
        speech,
      ),
    ).toBeNull()
  })
  it('requires a compatible OpenRouter model and voice', () => {
    const settings = { ...DEFAULT_SETTINGS, speechProvider: 'openrouter' as const }
    expect(getReadinessIssue(settings, readyState(), speech)).toBe('openRouterModelRequired')
    expect(
      getReadinessIssue(
        { ...settings, openRouterModel: 'speech', openRouterVoice: 'wrong' },
        readyState(),
        speech,
      ),
    ).toBe('openRouterModelRequired')
    expect(
      getReadinessIssue(
        { ...settings, openRouterModel: 'speech', openRouterVoice: 'one' },
        readyState(),
        speech,
      ),
    ).toBeNull()
  })
  it('uses the saved answer language when regenerating speech without another ChatGPT request', () => {
    const state = readyState()
    state.chatGpt.status = 'signed-out'
    expect(getReadinessIssue(DEFAULT_SETTINGS, state, speech, true)).toBeNull()
    expect(
      getReadinessIssue(
        { ...DEFAULT_SETTINGS, speechProvider: 'deepgram', descriptionLanguage: 'en' },
        state,
        speech,
        true,
        'tr',
      ),
    ).toBe('languageMismatch')
  })
})
