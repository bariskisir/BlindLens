/**
 * Composes the reusable desktop shell, workspace, settings, and update notice.
 */

import { lazy, Suspense } from 'react'
import { Button, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import styles from './App.module.scss'
import AppSidebar from '@renderer/components/app/AppSidebar'
import StartupScreen from '@renderer/components/app/StartupScreen'
import Titlebar from '@renderer/components/app/Titlebar'
import UpdateNotice from '@renderer/components/app/UpdateNotice'
import { useAppInit } from '@renderer/hooks/useAppInit'
import HomePage from '@renderer/pages/home/HomePage'
import { useAppSelector } from '@renderer/store'
import { cx } from '@renderer/utils/classNames'

const SettingsPage = lazy(() => import('@renderer/pages/settings/SettingsPage'))

/** Renders application pages after main-process bootstrap completes. */
const App = (): React.JSX.Element => {
  useAppInit()
  const initialized = useAppSelector((state) => state.app.initialized)
  const initializationError = useAppSelector((state) => state.app.initializationError)
  const page = useAppSelector((state) => state.app.page)
  const compactMode = useAppSelector((state) => state.app.compactMode)
  const navbarPosition = useAppSelector((state) => state.app.settings.navbarPosition)
  const { t } = useTranslation()

  if (initializationError) {
    return (
      <StartupScreen
        alert
        message={t('errors.startup')}
        action={
          <Button size="small" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  }

  if (!initialized) return <StartupScreen message={t('common.loading')} />

  return (
    <div className={styles.shell}>
      <Titlebar />
      <div className={styles.body}>
        {!compactMode && navbarPosition === 'left' && <AppSidebar />}
        <div className={styles.workspace}>
          {page === 'home' ? (
            <HomePage />
          ) : (
            <Suspense fallback={<Spin className={cx(styles.pageSpinner)} size="small" />}>
              <SettingsPage />
            </Suspense>
          )}
        </div>
      </div>
      <UpdateNotice />
    </div>
  )
}

export default App
