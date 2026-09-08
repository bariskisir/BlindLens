/**
 * Renders the shared label, description, and control layout used by every settings row.
 */

import type { PropsWithChildren } from 'react'
import { cx } from '@renderer/utils/classNames'
import styles from '../SettingsPage.module.scss'

interface SettingRowProps extends PropsWithChildren {
  title: string
  description: string
  /** Additional class applied to the row itself. */
  className?: string | undefined
  /** Replaces the default control layout for rows with their own spacing. */
  controlClassName?: string | undefined
  /** Content rendered on its own line below the label and control. */
  extra?: React.ReactNode
}

/** Displays one preference with its explanation and the control that changes it. */
const SettingRow = ({
  title,
  description,
  className,
  controlClassName,
  extra,
  children,
}: SettingRowProps): React.JSX.Element => (
  <div className={cx(styles.settingRow, className)}>
    <div className={styles.settingLabel}>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
    <div className={cx(controlClassName ?? styles.settingControl)}>{children}</div>
    {extra}
  </div>
)

export default SettingRow
