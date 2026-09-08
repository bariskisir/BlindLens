/** Replays saved MP3 segments and epubreader-style Web Speech phrases across page navigation. */

import type { SessionDocument } from '@shared/session'
import { splitSpeechText } from '@shared/speech'
import type { AppState } from '@renderer/store/appSlice'

/** Owns a single cancellable playback sequence without persisting browser objects in Redux. */
export class SpeechPlaybackService {
  private revision = 0
  private audio: HTMLAudioElement | null = null
  private utterance: SpeechSynthesisUtterance | null = null
  private nextPhrase: (() => void) | null = null
  private state: AppState['playback'] = { sessionId: null, status: 'idle', progress: 0 }
  private listener: (state: AppState['playback']) => void = () => undefined
  private failure: () => void = () => undefined
  /** Subscribes the application shell to serializable playback status. */
  public subscribe(
    listener: (state: AppState['playback']) => void,
    failure: () => void,
  ): () => void {
    this.listener = listener
    this.failure = failure
    listener(this.state)
    return () => {
      this.stop()
      this.listener = () => undefined
      this.failure = () => undefined
    }
  }
  /** Loads the first saved segment or speaks the saved text using its original voice settings. */
  public async play(session: SessionDocument): Promise<void> {
    this.stop()
    const capture = session.data.capture
    const speech = capture?.speech
    if (!capture?.answer || !speech) return
    const revision = this.revision
    this.update({ sessionId: session.id, status: 'loading', progress: 0 })
    if (speech.provider === 'web-speech') {
      if (!('speechSynthesis' in window)) {
        this.stop()
        throw new Error('Web Speech is unavailable.')
      }
      const chunks = splitSpeechText(capture.answer, 250)
      /** Speaks the next bounded phrase only while this sequence still owns playback. */
      const speak = (index: number): void => {
        if (revision !== this.revision) return
        const text = chunks[index]
        if (!text) {
          this.stop()
          return
        }
        const utterance = new SpeechSynthesisUtterance(text)
        this.utterance = utterance
        utterance.lang = speech.language
        utterance.rate = speech.rate
        const voices = window.speechSynthesis.getVoices()
        const voice =
          voices.find((item) => item.voiceURI === speech.voice) ??
          voices.find((item) => item.lang.split('-')[0] === speech.language.split('-')[0])
        if (voice) utterance.voice = voice
        utterance.onend = () => {
          if (revision !== this.revision) return
          if (this.state.status === 'paused') this.nextPhrase = () => speak(index + 1)
          else speak(index + 1)
        }
        utterance.onerror = (event) => {
          if (revision === this.revision && !['interrupted', 'canceled'].includes(event.error)) {
            this.stop()
            this.failure()
          }
        }
        this.update({ status: 'playing', progress: index / chunks.length })
        window.speechSynthesis.speak(utterance)
      }
      speak(0)
      return
    }
    /** Loads segments on demand so the renderer does not retain every audio file in memory. */
    const playAt = async (index: number): Promise<void> => {
      if (revision !== this.revision) return
      const assetId = speech.assetIds[index]
      if (!assetId) {
        this.stop()
        return
      }
      this.update({ status: 'loading', progress: index / speech.assetIds.length })
      const url = await window.app.getCaptureMedia(session.id, assetId)
      if (revision !== this.revision) return
      this.clearAudio()
      const audio = new Audio(url)
      this.audio = audio
      audio.playbackRate = speech.provider === 'deepgram' ? speech.rate : 1
      audio.ontimeupdate = () =>
        this.update({
          progress:
            (index +
              (Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.currentTime / audio.duration
                : 0)) /
            speech.assetIds.length,
        })
      audio.onended = () => {
        void playAt(index + 1).catch(() => {
          if (revision === this.revision) {
            this.stop()
            this.failure()
          }
        })
      }
      audio.onerror = () => {
        if (revision === this.revision) {
          this.stop()
          this.failure()
        }
      }
      await audio.play()
      if (revision === this.revision) this.update({ status: 'playing' })
    }
    try {
      await playAt(0)
    } catch (error) {
      if (revision === this.revision) this.stop()
      throw error
    }
  }
  /** Pauses the current browser or generated audio sequence. */
  public pause(): void {
    if (this.state.status !== 'playing') return
    this.audio?.pause()
    if (this.utterance) window.speechSynthesis.pause()
    this.update({ status: 'paused' })
  }
  /** Resumes a paused sequence and reports browser autoplay failures. */
  public async resume(): Promise<void> {
    if (this.state.status !== 'paused') return
    const revision = this.revision
    if (this.audio) await this.audio.play()
    if (revision !== this.revision) return
    if (this.utterance) window.speechSynthesis.resume()
    this.update({ status: 'playing' })
    const next = this.nextPhrase
    this.nextPhrase = null
    next?.()
  }
  /** Cancels both pending asset loads and active speech. */
  public stop(): void {
    this.revision++
    this.nextPhrase = null
    this.clearAudio()
    if (this.utterance) {
      this.utterance.onend = null
      this.utterance.onerror = null
      window.speechSynthesis.cancel()
      this.utterance = null
    }
    this.update({ sessionId: null, status: 'idle', progress: 0 })
  }
  /** Releases event handlers and media buffers from the previous segment. */
  private clearAudio(): void {
    if (!this.audio) return
    this.audio.onended = null
    this.audio.onerror = null
    this.audio.ontimeupdate = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.audio = null
  }
  /** Publishes a serializable playback snapshot. */
  private update(patch: Partial<AppState['playback']>): void {
    this.state = { ...this.state, ...patch }
    this.listener({ ...this.state })
  }
}

export const speechPlayback = new SpeechPlaybackService()
