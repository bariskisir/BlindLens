/**
 * Defines the generic local session workspace persisted by the desktop shell.
 */

/** Maximum number of characters stored in a session title. */
export const MAX_SESSION_TITLE_LENGTH = 200

import type { ScreenCapture } from './lens'

/** Screen description and media references owned by one workspace. */
export interface SessionData {
  capture?: ScreenCapture | undefined
}

/** Complete locally persisted generic session workspace. */
export interface SessionDocument {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
  data: SessionData
}

/** Compact session metadata used by the persistent sidebar. */
export interface SessionSummary {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
}

/** Result of deleting a session while preserving one ready workspace. */
export interface DeleteSessionResult {
  deleted: boolean
  replacement?: SessionDocument
}

/** Converts a complete session into the compact metadata shown in the sidebar. */
export const toSessionSummary = (session: SessionDocument): SessionSummary => ({
  id: session.id,
  title: session.title,
  isDefaultTitle: session.isDefaultTitle,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})
