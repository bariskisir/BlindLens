/**
 * Renders the centered logo shown while the shell loads or fails to initialize.
 */

import logoUrl from '../../../../../build/icon.svg'
import styles from './StartupScreen.module.scss'

interface StartupScreenProps {
  message: string
  alert?: boolean
  action?: React.ReactNode
}

/** Displays one startup status message with an optional recovery action. */
const StartupScreen = ({ message, alert, action }: StartupScreenProps): React.JSX.Element => (
  <div className={styles.container} {...(alert ? { role: 'alert' } : {})}>
    <img className={styles.logo} src={logoUrl} alt="" />
    <span>{message}</span>
    {action}
  </div>
)

export default StartupScreen
