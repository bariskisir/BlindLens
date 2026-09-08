/**
 * Manages generic sessions in the collapsible workspace sidebar.
 */

import { useState } from 'react'
import { Button, Empty, Tooltip } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionSummary } from '@shared/types'
import { useSessionActions } from '@renderer/hooks/useSessionActions'
import { useSessionsSidebarWidth } from '@renderer/hooks/useSessionsSidebarWidth'
import { useAppSelector } from '@renderer/store'
import { cx } from '@renderer/utils/classNames'
import RenameSessionModal from './RenameSessionModal'
import SessionListItem from './SessionListItem'
import styles from './SessionsSidebar.module.scss'

/** Renders resize, create, open, rename, and guarded delete actions for local sessions. */
const SessionsSidebar = (): React.JSX.Element => {
  const sessions = useAppSelector((state) => state.app.sessions)
  const currentSession = useAppSelector((state) => state.app.currentSession)
  const timeFormat = useAppSelector((state) => state.app.settings.timeFormat)
  const sidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const actions = useSessionActions()
  const { t } = useTranslation()
  const { width, resizing, beginResize } = useSessionsSidebarWidth()
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  const onlyEmptySession =
    sessions.length === 1 &&
    currentSession !== null &&
    sessions[0]?.id === currentSession.id &&
    Object.keys(currentSession.data).length === 0

  /** Deletes all history when useful content exists and keeps the fresh replacement selected. */
  const deleteAllSessions = async (): Promise<void> => {
    if (deletingAll || onlyEmptySession) return
    setDeletingAll(true)
    try {
      await actions.deleteAllSessions()
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <>
      <aside
        className={cx(
          styles.container,
          !sidebarOpen && styles.collapsed,
          resizing && styles.resizing,
        )}
        data-sidebar-width={width}
        aria-hidden={!sidebarOpen}
      >
        {sidebarOpen && (
          <>
            <div className={styles.resizeHandle} aria-hidden="true" onPointerDown={beginResize} />
            <header className={styles.header}>
              <span>{t('nav.sessions')}</span>
              <div className={styles.headerActions}>
                <Tooltip title={t('sessions.deleteAll')}>
                  <Button
                    type="text"
                    danger
                    size="small"
                    aria-label={t('sessions.deleteAll')}
                    icon={<Trash2 size={15} />}
                    disabled={deletingAll || sessions.length === 0 || onlyEmptySession}
                    onClick={() => void deleteAllSessions()}
                  />
                </Tooltip>
                <Tooltip title={t('sessions.newSession')}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t('sessions.newSession')}
                    icon={<Plus size={15} />}
                    onClick={() => void actions.createSession()}
                  />
                </Tooltip>
              </div>
            </header>

            <div className={styles.scrollArea}>
              {sessions.length === 0 ? (
                <div className={styles.emptyWrap}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('sessions.emptyTitle')}
                  />
                </div>
              ) : (
                <div className={styles.list}>
                  {sessions.map((session) => (
                    <SessionListItem
                      key={session.id}
                      session={session}
                      active={currentSession?.id === session.id}
                      timeFormat={timeFormat}
                      deletable={!onlyEmptySession}
                      onOpen={() => void actions.openSession(session.id)}
                      onRename={() => setRenameTarget(session)}
                      onDelete={() => void actions.deleteSession(session.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
      <RenameSessionModal session={renameTarget} onClose={() => setRenameTarget(null)} />
    </>
  )
}

export default SessionsSidebar
