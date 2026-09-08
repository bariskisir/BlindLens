/**
 * Renders the left-side global action rail.
 */

import { cx } from '@renderer/utils/classNames'
import AppNavigationActions from './AppNavigationActions'
import styles from './AppSidebar.module.scss'

/** Displays theme, pinning, and settings actions in the left navbar. */
const AppSidebar = (): React.JSX.Element => (
  <aside className={cx(styles.container, 'no-drag')}>
    <AppNavigationActions placement="left" />
  </aside>
)

export default AppSidebar
