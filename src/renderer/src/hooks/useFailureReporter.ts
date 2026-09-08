/**
 * Reports failed renderer commands through the log bridge and one shared user notice.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import type { RendererLogger } from '@renderer/services/LoggerService'

/** Records one failed command and tells the user that it could not be completed. */
export type ReportFailure = (description: string, error: unknown) => void

/** Returns a reporter that logs a failure and shows the shared error notice once. */
export const useFailureReporter = (logger: RendererLogger): ReportFailure => {
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  return useCallback(
    (description: string, error: unknown) => {
      logger.error(description, error)
      void message.error(t('errors.generic'))
    },
    [logger, message, t],
  )
}
