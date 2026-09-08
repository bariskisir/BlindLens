/**
 * Wraps fallible desktop-shell commands with consistent renderer diagnostics.
 */

import { useCallback } from 'react'
import { createLogger } from '@renderer/services/LoggerService'
import { useFailureReporter } from './useFailureReporter'

const logger = createLogger('DesktopActions')

interface DesktopActions {
  /** Checks GitHub Releases for a newer application version. */
  checkForUpdates(): Promise<void>
  /** Installs the downloaded application update. */
  installUpdate(): Promise<void>
  /** Opens an allow-listed URL in the operating-system browser. */
  openExternal(url: string): Promise<void>
  /** Opens the application log directory. */
  openLogsDirectory(): Promise<void>
}

/** Returns safe commands for external links, logs, and application updates. */
export const useDesktopActions = (): DesktopActions => {
  const reportFailure = useFailureReporter(logger)

  /** Opens an allow-listed external URL in the operating-system browser. */
  const openExternal = useCallback(
    async (url: string): Promise<void> => {
      try {
        await window.app.openExternal(url)
      } catch (error) {
        reportFailure('External URL could not be opened.', error)
      }
    },
    [reportFailure],
  )

  /** Opens the application log directory in the operating-system file manager. */
  const openLogsDirectory = useCallback(async (): Promise<void> => {
    try {
      await window.app.openLogsDirectory()
    } catch (error) {
      reportFailure('Log directory could not be opened.', error)
    }
  }, [reportFailure])

  /** Checks GitHub Releases while keeping a rejected check out of the user's way. */
  const checkForUpdates = useCallback(async (): Promise<void> => {
    try {
      await window.app.checkForUpdates()
    } catch (error) {
      logger.error('Application update check failed.', error)
    }
  }, [])

  /** Installs a downloaded update while reporting a rejected restart request. */
  const installUpdate = useCallback(async (): Promise<void> => {
    try {
      await window.app.installUpdate()
    } catch (error) {
      reportFailure('Downloaded application update could not be installed.', error)
    }
  }, [reportFailure])

  return { checkForUpdates, installUpdate, openExternal, openLogsDirectory }
}
