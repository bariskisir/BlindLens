/**
 * Renames one session from a focused dialog without leaving the workspace.
 */

import { useEffect, useRef, useState } from 'react'
import { Input, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import { MAX_SESSION_TITLE_LENGTH, type SessionSummary } from '@shared/types'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useSessionActions } from '@renderer/hooks/useSessionActions'
import { useSessionTitle } from '@renderer/hooks/useSessionTitle'
import { cx } from '@renderer/utils/classNames'
import styles from './SessionsSidebar.module.scss'

interface RenameSessionModalProps {
  session: SessionSummary | null
  onClose: () => void
}

/** Collects and persists a new title for the selected session. */
const RenameSessionModal = ({ session, onClose }: RenameSessionModalProps): React.JSX.Element => {
  const actions = useSessionActions()
  const sessionTitle = useSessionTitle()
  const { t } = useTranslation()
  const confirmProps = useAccentButtonProps()
  const [title, setTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const wasOpen = useRef(false)

  /** Starts every edit from the title currently shown in the sidebar. */
  useEffect(() => {
    if (session && !wasOpen.current) setTitle(sessionTitle(session))
    wasOpen.current = session !== null
  }, [session, sessionTitle])

  /** Persists the edited title and closes the dialog after a successful update. */
  const commit = async (): Promise<void> => {
    if (!session || !title.trim()) return
    setRenaming(true)
    const renamed = await actions.renameSession(session.id, title.trim())
    setRenaming(false)
    if (renamed) onClose()
  }

  return (
    <Modal
      title={t('sessions.renameSession')}
      open={session !== null}
      okText={t('common.rename')}
      cancelText={t('common.cancel')}
      confirmLoading={renaming}
      okButtonProps={{ disabled: !title.trim(), ...confirmProps }}
      onOk={() => void commit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Input
        className={cx(styles.renameInput)}
        value={title}
        maxLength={MAX_SESSION_TITLE_LENGTH}
        autoFocus
        placeholder={t('sessions.renameSession')}
        onChange={(event) => setTitle(event.target.value)}
        onPressEnter={() => void commit()}
      />
    </Modal>
  )
}

export default RenameSessionModal
