/**
 * Offers the ready application update without interrupting the current workspace.
 */

import { Button } from 'antd'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useAppSelector } from '@renderer/store'
import styles from './UpdateNotice.module.scss'

/** Displays the install or download action for an update that is ready for the user. */
const UpdateNotice = (): React.JSX.Element | null => {
  const update = useAppSelector((state) => state.app.update)
  const desktopActions = useDesktopActions()
  const { t } = useTranslation()

  const installable = update.state === 'downloaded'
  const downloadable = update.state === 'available' && update.pageUrl !== undefined
  if (!installable && !downloadable) return null

  /** Installs the downloaded update or opens its release page. */
  const applyUpdate = (): void => {
    if (installable) {
      void desktopActions.installUpdate()
      return
    }
    if (update.pageUrl) void desktopActions.openExternal(update.pageUrl)
  }

  return (
    <div className={styles.container}>
      <Download size={15} />
      <span>
        {installable
          ? t('settings.readyToInstall', { version: update.version })
          : t('settings.updateAvailable', { version: update.version })}
      </span>
      <Button size="small" type="primary" onClick={applyUpdate}>
        {installable ? t('settings.installNow') : t('settings.openDownloadPage')}
      </Button>
    </div>
  )
}

export default UpdateNotice
