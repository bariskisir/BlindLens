/**
 * Composes the reusable session sidebar and application workspace.
 */

import SessionsSidebar from '@renderer/components/sidebar/SessionsSidebar'
import { useAppSelector } from '@renderer/store'
import WorkspaceView from './WorkspaceView'
import styles from './HomePage.module.scss'

/** Renders the primary application workspace. */
const HomePage = (): React.JSX.Element => {
  const compactMode = useAppSelector((state) => state.app.compactMode)
  return (
    <main className={styles.container}>
      {!compactMode && <SessionsSidebar />}
      <section className={styles.workspace}>
        <WorkspaceView />
      </section>
    </main>
  )
}

export default HomePage
