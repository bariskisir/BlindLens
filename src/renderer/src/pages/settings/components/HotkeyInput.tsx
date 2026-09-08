/** Presents a keyboard recorder instead of a manually editable accelerator field. */

import { Alert, Button, Modal, Space, Typography } from 'antd'
import { Keyboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppSelector } from '@renderer/store'
import { useHotkeyRecorder } from '@renderer/hooks/useHotkeyRecorder'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'

/** Shows the saved shortcut and records a replacement in a focused, cancellable dialog. */
const HotkeyInput = (): React.JSX.Element => {
  const { t } = useTranslation()
  const hotkey = useAppSelector((state) => state.app.settings.captureHotkey)
  const recorder = useHotkeyRecorder()
  const accent = useAccentButtonProps()
  return (
    <>
      <Space>
        <Typography.Text keyboard>{hotkey}</Typography.Text>
        <Button
          {...accent}
          icon={<Keyboard size={15} />}
          loading={recorder.busy}
          onClick={() => void recorder.begin()}
        >
          {t('lens.changeHotkey')}
        </Button>
      </Space>
      <Modal
        title={t('lens.hotkey')}
        open={recorder.listening}
        keyboard={false}
        maskClosable={false}
        onCancel={recorder.cancel}
        footer={<Button onClick={recorder.cancel}>{t('common.cancel')}</Button>}
      >
        <p>{t('lens.recordHotkeyHint')}</p>
        <p role="status" aria-live="polite">
          <Typography.Text keyboard>
            {recorder.preview || t('lens.listeningHotkey')}
          </Typography.Text>
        </p>
        {recorder.invalid && <Alert showIcon type="warning" title={t('lens.invalidHotkey')} />}
      </Modal>
    </>
  )
}

export default HotkeyInput
