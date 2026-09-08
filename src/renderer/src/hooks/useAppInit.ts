/**
 * Bootstraps renderer state and binds reusable main-to-renderer lifecycle events.
 */

import { useEffect, useRef } from 'react'
import { App as AntdApp } from 'antd'
import { APP_NAME } from '@shared/appInfo'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import { hydrate, setInitializationError, setPage, setUpdateState } from '@renderer/store/appSlice'
import { useAppDispatch } from '@renderer/store'
import { applyCaptureEvent, setLensState, setPlayback } from '@renderer/store/appSlice'
import { speechPlayback } from '@renderer/services/SpeechPlaybackService'
import { useSpeechVoices } from './useSpeechVoices'
import { readinessMessage } from '@renderer/utils/readinessMessage'

const logger = createLogger('AppInit')

/** Loads persisted state and maintains typed IPC subscriptions for the app lifetime. */
export const useAppInit = (): void => {
  const dispatch = useAppDispatch()
  const { message } = AntdApp.useApp()
  const messageRef = useRef(message)
  const voices = useSpeechVoices()
  const lastNotice = useRef(0)

  useEffect(() => {
    void window.app
      .updateSpeechAvailability({
        available: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
        voiceUris: voices.map((voice) => voice.voiceURI),
      })
      .catch((error) => logger.warn('Speech availability could not be reported.', error))
  }, [voices])

  useEffect(() => {
    messageRef.current = message
  }, [message])

  useEffect(() => {
    let active = true
    const cleanup = [
      speechPlayback.subscribe(
        (state) => dispatch(setPlayback(state)),
        () => {
          void messageRef.current.error(i18n.t('lens.playbackFailed'))
        },
      ),
      window.app.onLensState((state) => {
        dispatch(setLensState(state))
        if (state.notice && state.notice.id !== lastNotice.current) {
          lastNotice.current = state.notice.id
          void messageRef.current.warning({
            content: readinessMessage(state.notice.reason, i18n.t.bind(i18n)),
            duration: 7,
          })
        }
      }),
      window.app.onCaptureChanged((event) => {
        if (event.select) speechPlayback.stop()
        dispatch(applyCaptureEvent(event))
        if (event.speak)
          void speechPlayback.play(event.session).catch(() => {
            void messageRef.current.error(i18n.t('lens.playbackFailed'))
          })
      }),
      window.app.onUpdateState((event) => dispatch(setUpdateState(event))),
      window.app.onSettingsOpenRequested(() => dispatch(setPage('settings'))),
    ]

    void window.app
      .bootstrap()
      .then(async (payload) => {
        if (!active) return
        dispatch(hydrate(payload))
        dispatch(setLensState(await window.app.getLensState()))
        document.title = APP_NAME
        document.documentElement.lang = payload.settings.uiLanguage
        await i18n.changeLanguage(payload.settings.uiLanguage)
      })
      .catch((error) => {
        logger.error('Renderer bootstrap failed.', error)
        dispatch(setInitializationError(true))
        void messageRef.current.error(i18n.t('errors.generic'))
      })

    return () => {
      active = false
      cleanup.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }, [dispatch])
}
