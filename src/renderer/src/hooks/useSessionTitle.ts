/**
 * Resolves generated session titles in the active interface language.
 */

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionSummary } from '@shared/types'

/** Returns a resolver that localizes generated titles and preserves custom names. */
export const useSessionTitle = (): ((session: SessionSummary) => string) => {
  const { t } = useTranslation()

  return useCallback(
    (session: SessionSummary) =>
      session.isDefaultTitle ? t('sessions.newSession') : session.title,
    [t],
  )
}
