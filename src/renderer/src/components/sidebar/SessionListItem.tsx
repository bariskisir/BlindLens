/**
 * Renders one selectable session row with its context menu and delete action.
 */

import { Button, Dropdown, Tooltip, type MenuProps } from 'antd'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionSummary, TimeFormat } from '@shared/types'
import { useSessionTitle } from '@renderer/hooks/useSessionTitle'
import { cx } from '@renderer/utils/classNames'
import { formatDate } from '@renderer/utils/formatters'
import styles from './SessionsSidebar.module.scss'

interface SessionListItemProps {
  session: SessionSummary
  active: boolean
  timeFormat: TimeFormat
  deletable: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}

/** Displays one session summary and the actions that manage it. */
const SessionListItem = ({
  session,
  active,
  timeFormat,
  deletable,
  onOpen,
  onRename,
  onDelete,
}: SessionListItemProps): React.JSX.Element => {
  const { t } = useTranslation()
  const sessionTitle = useSessionTitle()

  const menu: MenuProps = {
    items: [
      { key: 'rename', icon: <Pencil size={14} />, label: t('common.rename') },
      { type: 'divider' },
      {
        key: 'delete',
        danger: true,
        disabled: !deletable,
        icon: <Trash2 size={14} />,
        label: t('common.delete'),
      },
    ],
    /** Handles a session context-menu action without opening the underlying row. */
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'rename') onRename()
      if (key === 'delete') onDelete()
    },
  }

  return (
    <Dropdown menu={menu} trigger={['contextMenu']}>
      <div className={cx(styles.item, active && styles.active)}>
        <button type="button" className={styles.openButton} onClick={onOpen}>
          <span className={styles.fileIcon}>
            <FileText size={14} />
          </span>
          <span className={styles.itemBody}>
            <span className={styles.itemTitle}>{sessionTitle(session)}</span>
            <span className={styles.itemMeta}>{formatDate(session.updatedAt, timeFormat)}</span>
          </span>
        </button>
        <Tooltip title={t('common.delete')}>
          <Button
            className={cx(styles.deleteButton)}
            type="text"
            danger
            size="small"
            aria-label={t('common.delete')}
            icon={<Trash2 size={13} />}
            disabled={!deletable}
            onClick={onDelete}
          />
        </Tooltip>
      </div>
    </Dropdown>
  )
}

export default SessionListItem
