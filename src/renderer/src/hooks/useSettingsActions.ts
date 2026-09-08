/**
 * Exposes renderer commands for persisted desktop-shell settings.
 */

import { useCallback } from 'react'
import type { AppSettingsPatch } from '@shared/types'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import SettingsPersistenceQueue from '@renderer/services/SettingsPersistenceQueue'
import { useAppDispatch } from '@renderer/store'
import { setSettings } from '@renderer/store/appSlice'
import { useFailureReporter } from './useFailureReporter'

const logger = createLogger('SettingsActions')
const settingsPersistenceQueue = new SettingsPersistenceQueue()

interface SettingsActions {
  /** Persists and applies a partial desktop-shell settings update. */
  saveSettings(patch: AppSettingsPatch): Promise<boolean>
}

/** Returns stable settings commands backed by the preload API. */
export const useSettingsActions = (): SettingsActions => {
  const dispatch = useAppDispatch()
  const reportFailure = useFailureReporter(logger)

  /** Serializes a partial settings update so rapid controls cannot overwrite each other. */
  const saveSettings = useCallback(
    async (patch: AppSettingsPatch): Promise<boolean> => {
      try {
        const saved = await settingsPersistenceQueue.enqueue(patch, window.app.saveSettings)
        dispatch(setSettings(saved))
        document.documentElement.lang = saved.uiLanguage
        await i18n.changeLanguage(saved.uiLanguage)
        return true
      } catch (error) {
        reportFailure('Settings could not be saved.', error)
        return false
      }
    },
    [dispatch, reportFailure],
  )

  return { saveSettings }
}
