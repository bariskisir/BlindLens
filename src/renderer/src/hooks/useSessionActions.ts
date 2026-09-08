/**
 * Exposes renderer commands for generic session workspace management.
 */

import { useCallback } from 'react'
import { toSessionSummary } from '@shared/types'
import { createLogger } from '@renderer/services/LoggerService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addSessionSummary,
  removeSessionSummary,
  replaceCurrentSession,
  replaceSessionSummary,
  setCurrentSession,
  setSessions,
} from '@renderer/store/appSlice'
import { useFailureReporter } from './useFailureReporter'
import { speechPlayback } from '@renderer/services/SpeechPlaybackService'

const logger = createLogger('SessionActions')

let latestSelectionRevision = 0

/** Claims the newest selection so a slower load cannot replace a later choice. */
const beginSelection = (): number => {
  latestSelectionRevision += 1
  return latestSelectionRevision
}

/** Reports whether a selection is still the one the user is waiting for. */
const isLatestSelection = (revision: number): boolean => revision === latestSelectionRevision

interface SessionActions {
  /** Creates and selects a generic session workspace. */
  createSession(): Promise<void>
  /** Deletes one session while retaining a usable workspace. */
  deleteSession(id: string): Promise<void>
  /** Deletes every session while retaining a fresh usable workspace. */
  deleteAllSessions(): Promise<void>
  /** Loads and selects one complete session. */
  openSession(id: string): Promise<void>
  /** Renames a session and reports whether persistence succeeded. */
  renameSession(id: string, title: string): Promise<boolean>
}

/** Returns stable local session management commands. */
export const useSessionActions = (): SessionActions => {
  const dispatch = useAppDispatch()
  const sessions = useAppSelector((state) => state.app.sessions)
  const currentSessionId = useAppSelector((state) => state.app.currentSession?.id ?? null)
  const reportFailure = useFailureReporter(logger)

  /** Loads a complete session from local storage. */
  const openSession = useCallback(
    async (id: string): Promise<void> => {
      speechPlayback.stop()
      const revision = beginSelection()
      try {
        const session = await window.app.getSession(id)
        if (isLatestSelection(revision)) dispatch(setCurrentSession(session))
      } catch (error) {
        if (!isLatestSelection(revision)) return
        reportFailure('Session could not be loaded.', error)
      }
    },
    [dispatch, reportFailure],
  )

  /** Creates and selects a new session workspace. */
  const createSession = useCallback(async (): Promise<void> => {
    speechPlayback.stop()
    const revision = beginSelection()
    try {
      const session = await window.app.createSession()
      dispatch(addSessionSummary(toSessionSummary(session)))
      if (isLatestSelection(revision)) dispatch(setCurrentSession(session))
    } catch (error) {
      reportFailure('Session workspace could not be created.', error)
    }
  }, [dispatch, reportFailure])

  /** Renames a session and synchronizes the active document and summary. */
  const renameSession = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        const session = await window.app.renameSession(id, title)
        dispatch(replaceCurrentSession(session))
        dispatch(replaceSessionSummary(toSessionSummary(session)))
        return true
      } catch (error) {
        reportFailure('Session could not be renamed.', error)
        return false
      }
    },
    [dispatch, reportFailure],
  )

  /** Deletes one session while preserving and selecting a ready workspace. */
  const deleteSession = useCallback(
    async (id: string): Promise<void> => {
      speechPlayback.stop()
      const revision = beginSelection()
      try {
        const result = await window.app.deleteSession(id)
        if (!result.deleted) return
        dispatch(removeSessionSummary(id))
        const remaining = sessions.filter((item) => item.id !== id)
        if (result.replacement) dispatch(addSessionSummary(toSessionSummary(result.replacement)))

        if (currentSessionId !== id) return
        const nextSession =
          result.replacement ?? (remaining[0] ? await window.app.getSession(remaining[0].id) : null)
        if (isLatestSelection(revision)) dispatch(setCurrentSession(nextSession))
      } catch (error) {
        reportFailure('Session could not be deleted.', error)
      }
    },
    [currentSessionId, dispatch, reportFailure, sessions],
  )

  /** Deletes every session and selects the fresh replacement returned by storage. */
  const deleteAllSessions = useCallback(async (): Promise<void> => {
    speechPlayback.stop()
    const revision = beginSelection()
    try {
      const replacement = await window.app.deleteAllSessions()
      dispatch(setSessions([toSessionSummary(replacement)]))
      if (isLatestSelection(revision)) dispatch(setCurrentSession(replacement))
    } catch (error) {
      reportFailure('Sessions could not be deleted.', error)
    }
  }, [dispatch, reportFailure])

  return { createSession, deleteAllSessions, deleteSession, openSession, renameSession }
}
