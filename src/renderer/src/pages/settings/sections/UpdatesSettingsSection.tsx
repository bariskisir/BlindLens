/**
 * Renders automatic update preferences and GitHub Releases progress.
 */

import { Button, Progress, Switch } from 'antd'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UpdateStateEvent } from '@shared/types'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import SettingRow from '../components/SettingRow'
import styles from '../SettingsPage.module.scss'

/** Resolves localized copy for one updater lifecycle state. */
const useUpdateStatus = (update: UpdateStateEvent): string => {
  const { t } = useTranslation()
  switch (update.state) {
    case 'checking':
      return t('settings.checking')
    case 'available':
      return t('settings.updateAvailable', { version: update.version })
    case 'downloading':
      return t('settings.downloading', { percent: update.percent ?? 0 })
    case 'downloaded':
      return t('settings.readyToInstall', { version: update.version })
    case 'error':
      return t('settings.updateError')
    default:
      return t('settings.upToDate')
  }
}

/** Displays update configuration, progress, and release notes. */
const UpdatesSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const version = useAppSelector((state) => state.app.version)
  const update = useAppSelector((state) => state.app.update)
  const settingsActions = useSettingsActions()
  const desktopActions = useDesktopActions()
  const updateStatus = useUpdateStatus(update)
  const accentProps = useAccentButtonProps()
  const { t } = useTranslation()
  const releasePageUrl = update.state === 'available' ? update.pageUrl : undefined

  return (
    <div className={styles.settingContainer}>
      <h2 className={styles.groupTitle}>{t('settings.updates')}</h2>
      <section className={styles.settingGroup}>
        <SettingRow
          title={t('settings.checkUpdatesOnStartup')}
          description={t('settings.checkUpdatesOnStartupDescription')}
        >
          <Switch
            checked={settings.autoUpdate}
            onChange={(autoUpdate) => void settingsActions.saveSettings({ autoUpdate })}
          />
        </SettingRow>
        <SettingRow
          title={t('settings.unattendedUpdates')}
          description={t('settings.unattendedUpdatesDescription')}
        >
          <Switch
            checked={settings.unattendedUpdates}
            disabled={!settings.autoUpdate}
            onChange={(unattendedUpdates) =>
              void settingsActions.saveSettings({ unattendedUpdates })
            }
          />
        </SettingRow>
        <SettingRow
          className={styles.updateRow}
          title={updateStatus}
          description={t('settings.version', { version })}
          extra={
            update.state === 'downloading' ? (
              <Progress percent={update.percent ?? 0} size="small" />
            ) : null
          }
        >
          {update.state === 'downloaded' ? (
            <Button {...accentProps} onClick={() => void desktopActions.installUpdate()}>
              {t('settings.installNow')}
            </Button>
          ) : releasePageUrl ? (
            <Button
              {...accentProps}
              icon={<ExternalLink size={14} />}
              onClick={() => void desktopActions.openExternal(releasePageUrl)}
            >
              {t('settings.openDownloadPage')}
            </Button>
          ) : (
            <Button
              icon={<RefreshCw size={14} />}
              loading={update.state === 'checking'}
              onClick={() => void desktopActions.checkForUpdates()}
            >
              {t('settings.checkUpdates')}
            </Button>
          )}
        </SettingRow>
        {update.releaseNotes && (
          <div className={styles.releaseNotes}>
            <strong>{t('settings.releaseNotes')}</strong>
            <pre>{update.releaseNotes}</pre>
          </div>
        )}
      </section>
    </div>
  )
}

export default UpdatesSettingsSection
