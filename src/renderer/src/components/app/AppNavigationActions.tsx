/**
 * Renders global window and settings actions in either sidebar or titlebar form.
 */

import { Button, Tooltip } from 'antd'
import { Monitor, Moon, Pin, PinOff, Settings, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NavbarPosition, ThemeMode } from '@shared/types'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setPage } from '@renderer/store/appSlice'
import { cx } from '@renderer/utils/classNames'
import styles from './AppNavigationActions.module.scss'

interface AppNavigationActionsProps {
  placement: NavbarPosition
}

const NEXT_THEME: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const THEME_ICONS: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

/** Displays pinning, theme, and settings actions in the configured navbar. */
const AppNavigationActions = ({ placement }: AppNavigationActionsProps): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const settings = useAppSelector((state) => state.app.settings)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()
  const pinnedProps = useAccentButtonProps(settings.alwaysOnTop)
  const settingsPageProps = useAccentButtonProps(page === 'settings')
  const tooltipPlacement = placement === 'left' ? 'right' : 'bottom'
  const iconSize = placement === 'top' ? 16 : 18
  const ThemeIcon = THEME_ICONS[settings.theme]

  return (
    <div className={cx(styles.container, styles[placement], 'no-drag')}>
      <Tooltip placement={tooltipPlacement} title={t('settings.alwaysOnTop')}>
        <Button
          className={cx(styles.actionButton)}
          aria-label={t('settings.alwaysOnTop')}
          {...pinnedProps}
          icon={settings.alwaysOnTop ? <Pin size={iconSize} /> : <PinOff size={iconSize} />}
          onClick={() => void settingsActions.saveSettings({ alwaysOnTop: !settings.alwaysOnTop })}
        />
      </Tooltip>
      <Tooltip placement={tooltipPlacement} title={t(`themes.${settings.theme}`)}>
        <Button
          className={cx(styles.actionButton)}
          aria-label={t(`themes.${settings.theme}`)}
          type="text"
          icon={<ThemeIcon size={iconSize} />}
          onClick={() => void settingsActions.saveSettings({ theme: NEXT_THEME[settings.theme] })}
        />
      </Tooltip>
      <Tooltip placement={tooltipPlacement} title={t('nav.settings')}>
        <Button
          className={cx(styles.actionButton)}
          aria-label={t('nav.settings')}
          {...settingsPageProps}
          icon={<Settings size={iconSize} />}
          onClick={() => dispatch(setPage('settings'))}
        />
      </Tooltip>
    </div>
  )
}

export default AppNavigationActions
