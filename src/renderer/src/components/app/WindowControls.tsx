/**
 * Renders zoom-aware frameless-window controls for Windows and Linux.
 */

import { Tooltip } from 'antd'
import { Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/services/LoggerService'
import { useAppSelector } from '@renderer/store'
import { cx } from '@renderer/utils/classNames'
import styles from './WindowControls.module.scss'

const logger = createLogger('WindowControls')

/** Draws the overlapping-window symbol used while the window is maximized. */
const RestoreIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.5" y="5.5" width="8" height="8" rx="0.8" stroke="currentColor" />
    <path d="M5.5 5.5V2.5H13.5V10.5H10.5" stroke="currentColor" />
  </svg>
)

interface WindowControlButtonProps {
  label: string
  closing?: boolean
  onClick: () => void
  children: React.ReactNode
}

/** Renders one native-style window control with a delayed tooltip. */
const WindowControlButton = ({
  label,
  closing = false,
  onClick,
  children,
}: WindowControlButtonProps): React.JSX.Element => (
  <Tooltip placement="bottom" title={label} mouseEnterDelay={0.6}>
    <button
      type="button"
      className={cx(styles.controlButton, closing && styles.closeButton)}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  </Tooltip>
)

/** Displays minimize, maximize/restore, and close actions inside the renderer titlebar. */
const WindowControls = (): React.JSX.Element | null => {
  const platform = useAppSelector((state) => state.app.platform)
  const [maximized, setMaximized] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (platform === 'darwin') return undefined
    let active = true
    void window.app
      .isWindowMaximized()
      .then((value) => {
        if (active) setMaximized(value)
      })
      .catch((error: unknown) => {
        logger.warn('Initial maximized state could not be loaded.', error)
      })
    const unsubscribe = window.app.onWindowMaximizedChange(setMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [platform])

  if (platform === 'darwin') return null

  /** Runs one native window command without leaving an unhandled rejection. */
  const runWindowAction = (action: () => Promise<void>, failure: string): void => {
    void action().catch((error: unknown) => logger.warn(failure, error))
  }

  /** Toggles maximized state and synchronizes the icon immediately. */
  const toggleMaximized = (): void => {
    void window.app
      .toggleMaximizeWindow()
      .then(setMaximized)
      .catch((error: unknown) => {
        logger.warn('Window maximized state could not be changed.', error)
      })
  }

  return (
    <div className={cx(styles.container, 'no-drag')}>
      <WindowControlButton
        label={t('windowControls.minimize')}
        onClick={() => runWindowAction(window.app.minimizeWindow, 'Window could not be minimized.')}
      >
        <Minus size={14} />
      </WindowControlButton>
      <WindowControlButton
        label={t(maximized ? 'windowControls.restore' : 'windowControls.maximize')}
        onClick={toggleMaximized}
      >
        {maximized ? <RestoreIcon /> : <Square size={12} />}
      </WindowControlButton>
      <WindowControlButton
        closing
        label={t('windowControls.close')}
        onClick={() => runWindowAction(window.app.closeWindow, 'Window could not be closed.')}
      >
        <X size={17} />
      </WindowControlButton>
    </div>
  )
}

export default WindowControls
