/** Owns shortcut recording, global activation suspension, and release-triggered settings persistence. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HotkeyRecorder } from '@shared/hotkey'
import { createLogger } from '@renderer/services/LoggerService'
import { useFailureReporter } from './useFailureReporter'
import { useSettingsActions } from './useSettingsActions'

const logger = createLogger('HotkeyRecorder')

/** Presentation state and commands for the keyboard capture dialog. */
interface HotkeyRecordingControls {
  listening: boolean
  busy: boolean
  preview: string
  invalid: boolean
  begin: () => Promise<void>
  cancel: () => void
}

/** Records one key combination and saves it only after the final physical key is released. */
export const useHotkeyRecorder = (): HotkeyRecordingControls => {
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState('')
  const [invalid, setInvalid] = useState(false)
  const active = useRef(false)
  const recorder = useRef(new HotkeyRecorder())
  const report = useFailureReporter(logger)
  const { saveSettings } = useSettingsActions()

  /** Cancels an incomplete recording and restores the previously configured shortcut. */
  const cancel = useCallback((): void => {
    active.current = false
    recorder.current.reset()
    setListening(false)
    void window.app
      .setHotkeyRecording(false)
      .catch((error) => report('Shortcut recording could not be stopped.', error))
  }, [report])

  /** Releases the global accelerator before allowing the dialog to consume keyboard events. */
  const begin = useCallback(async (): Promise<void> => {
    active.current = true
    setBusy(true)
    setPreview('')
    setInvalid(false)
    recorder.current.reset()
    try {
      await window.app.setHotkeyRecording(true)
      if (active.current) setListening(true)
      else await window.app.setHotkeyRecording(false)
    } catch (error) {
      active.current = false
      report('Shortcut recording could not start.', error)
    } finally {
      setBusy(false)
    }
  }, [report])

  useEffect(() => {
    if (!listening) return
    /** Captures physical keys while preventing dialog navigation and repeated browser actions. */
    const down = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
      setPreview(recorder.current.down(event.code))
    }
    /** Commits one complete chord after restoring native shortcut registration. */
    const up = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
      const accelerator = recorder.current.up(event.code)
      if (accelerator === undefined) return
      if (!accelerator) {
        setInvalid(true)
        setPreview('')
        return
      }
      active.current = false
      setListening(false)
      setBusy(true)
      void window.app
        .setHotkeyRecording(false)
        .then(() => saveSettings({ captureHotkey: accelerator }))
        .catch((error) => report('The recorded shortcut could not be saved.', error))
        .finally(() => setBusy(false))
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', cancel)
    const timer = window.setTimeout(cancel, 25_000)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', cancel)
      window.clearTimeout(timer)
    }
  }, [listening, cancel, report, saveSettings])

  useEffect(
    () => () => {
      active.current = false
      void window.app
        .setHotkeyRecording(false)
        .catch((error) => logger.warn('Shortcut restoration failed during cleanup.', error))
    },
    [],
  )

  return { listening, busy, preview, invalid, begin, cancel }
}
