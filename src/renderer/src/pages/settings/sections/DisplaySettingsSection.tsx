/**
 * Renders theme, navbar, and page-zoom display preferences.
 */

import { Button, Segmented, Tooltip } from 'antd'
import { Minus, Monitor, Moon, PanelLeft, PanelTop, Plus, RotateCcw, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PAGE_ZOOM_LIMITS, type NavbarPosition, type ThemeMode } from '@shared/types'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import SettingRow from '../components/SettingRow'
import styles from '../SettingsPage.module.scss'

/** Builds one segmented option that pairs an icon with its localized label. */
const segmentedOption = <Value extends string>(
  value: Value,
  Icon: typeof Monitor,
  label: string,
): { value: Value; label: React.JSX.Element } => ({
  value,
  label: (
    <span className={styles.segmentedOption}>
      <Icon size={15} />
      {label}
    </span>
  ),
})

/** Displays theme, navbar, and page-zoom controls. */
const DisplaySettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()

  /** Persists a bounded page zoom change at the same tenth-step used by Electron. */
  const changePageZoom = (delta: number): void => {
    const pageZoom = Math.min(
      PAGE_ZOOM_LIMITS.max,
      Math.max(PAGE_ZOOM_LIMITS.min, Number((settings.pageZoom + delta).toFixed(1))),
    )
    void settingsActions.saveSettings({ pageZoom })
  }

  return (
    <div className={styles.settingContainer}>
      <h2 className={styles.groupTitle}>{t('settings.displaySettings')}</h2>
      <section className={styles.settingGroup}>
        <SettingRow title={t('settings.theme')} description={t('settings.themeDescription')}>
          <Segmented
            value={settings.theme}
            options={[
              segmentedOption('light', Sun, t('themes.light')),
              segmentedOption('dark', Moon, t('themes.dark')),
              segmentedOption('system', Monitor, t('themes.system')),
            ]}
            onChange={(theme: ThemeMode) => void settingsActions.saveSettings({ theme })}
          />
        </SettingRow>
        <SettingRow
          title={t('settings.navbarPosition')}
          description={t('settings.navbarPositionDescription')}
        >
          <Segmented
            value={settings.navbarPosition}
            options={[
              segmentedOption('left', PanelLeft, t('settings.navbarPositions.left')),
              segmentedOption('top', PanelTop, t('settings.navbarPositions.top')),
            ]}
            onChange={(navbarPosition: NavbarPosition) =>
              void settingsActions.saveSettings({ navbarPosition })
            }
          />
        </SettingRow>
      </section>

      <h2 className={styles.groupTitle}>{t('settings.zoomSettings')}</h2>
      <section className={styles.settingGroup}>
        <SettingRow
          title={t('settings.pageZoom')}
          description={t('settings.pageZoomDescription')}
          controlClassName={styles.zoomControl}
        >
          <Tooltip title={t('settings.zoomOut')}>
            <Button
              type="text"
              aria-label={t('settings.zoomOut')}
              disabled={settings.pageZoom <= PAGE_ZOOM_LIMITS.min}
              icon={<Minus size={15} />}
              onClick={() => changePageZoom(-PAGE_ZOOM_LIMITS.step)}
            />
          </Tooltip>
          <span className={styles.zoomValue}>{Math.round(settings.pageZoom * 100)}%</span>
          <Tooltip title={t('settings.zoomIn')}>
            <Button
              type="text"
              aria-label={t('settings.zoomIn')}
              disabled={settings.pageZoom >= PAGE_ZOOM_LIMITS.max}
              icon={<Plus size={15} />}
              onClick={() => changePageZoom(PAGE_ZOOM_LIMITS.step)}
            />
          </Tooltip>
          <Tooltip title={t('settings.resetZoom')}>
            <Button
              type="text"
              aria-label={t('settings.resetZoom')}
              disabled={settings.pageZoom === PAGE_ZOOM_LIMITS.default}
              icon={<RotateCcw size={15} />}
              onClick={() =>
                void settingsActions.saveSettings({ pageZoom: PAGE_ZOOM_LIMITS.default })
              }
            />
          </Tooltip>
        </SettingRow>
      </section>
    </div>
  )
}

export default DisplaySettingsSection
