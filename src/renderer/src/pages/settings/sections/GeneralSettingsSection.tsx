/**
 * Renders interface language and clock-format preferences.
 */

import { Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { APP_LOCALES, TIME_FORMATS, type AppLocale, type TimeFormat } from '@shared/types'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import { cx } from '@renderer/utils/classNames'
import SettingRow from '../components/SettingRow'
import styles from '../SettingsPage.module.scss'

/** Displays locale and session timestamp-format controls. */
const GeneralSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()

  return (
    <div className={styles.settingContainer}>
      <h2 className={styles.groupTitle}>{t('settings.general')}</h2>
      <section className={styles.settingGroup}>
        <SettingRow
          title={t('settings.interfaceLanguage')}
          description={t('settings.interfaceLanguageDescription')}
        >
          <Select
            className={cx(styles.compactControl)}
            value={settings.uiLanguage}
            options={APP_LOCALES.map((locale) => ({
              value: locale,
              label: t(`locales.${locale}`),
            }))}
            onChange={(uiLanguage: AppLocale) => void settingsActions.saveSettings({ uiLanguage })}
          />
        </SettingRow>
        <SettingRow
          title={t('settings.timeFormat')}
          description={t('settings.timeFormatDescription')}
        >
          <Select
            className={cx(styles.compactControl)}
            value={settings.timeFormat}
            options={TIME_FORMATS.map((timeFormat) => ({
              value: timeFormat,
              label: t(`settings.timeFormats.${timeFormat}`),
            }))}
            onChange={(timeFormat: TimeFormat) => void settingsActions.saveSettings({ timeFormat })}
          />
        </SettingRow>
      </section>
    </div>
  )
}

export default GeneralSettingsSection
