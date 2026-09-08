/** Checks local provider prerequisites before screen capture, retries, and speech generation. */

import type { AppSettings } from './settings'
import type { LensState, ReadinessIssue, SpeechAvailability } from './lens'

/** Returns the first actionable setup issue without starting network or capture work. */
export const getReadinessIssue = (
  settings: AppSettings,
  state: LensState,
  speech: SpeechAvailability,
  speechOnly = false,
  language = settings.descriptionLanguage,
): ReadinessIssue | null => {
  if (!speechOnly) {
    if (state.chatGpt.status !== 'signed-in') return 'chatGptRequired'
    const model =
      settings.chatGptModel ||
      state.chatGpt.models.find((item) => item.isDefault)?.id ||
      state.chatGpt.models[0]?.id
    if (!model || !state.chatGpt.models.some((item) => item.id === model))
      return 'chatGptModelRequired'
  }
  if (settings.speechProvider === 'web-speech') {
    if (
      !speech.available ||
      !speech.voiceUris.length ||
      (settings.webSpeechVoice && !speech.voiceUris.includes(settings.webSpeechVoice))
    )
      return 'voiceMissing'
  } else if (settings.speechProvider === 'deepgram') {
    if (!state.credentials.deepgram) return 'deepgramKeyRequired'
    if (!settings.deepgramModel.endsWith(`-${language.split('-')[0]}`)) return 'languageMismatch'
  } else {
    if (!state.credentials.openrouter) return 'openRouterKeyRequired'
    const model = state.speechModels.find((item) => item.id === settings.openRouterModel)
    if (
      !settings.openRouterModel ||
      !settings.openRouterVoice ||
      (state.speechModels.length > 0 &&
        (!model || (model.voices.length > 0 && !model.voices.includes(settings.openRouterVoice))))
    )
      return 'openRouterModelRequired'
  }
  return null
}
