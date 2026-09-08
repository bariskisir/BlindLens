/**
 * Defines the desktop update lifecycle reported to the renderer.
 */

export const UPDATE_STATES = [
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'up-to-date',
  'error',
] as const

/** Stage of the update lifecycle currently reported by the update service. */
export type UpdateState = (typeof UPDATE_STATES)[number]

/** Lifecycle state emitted by the desktop update service. */
export interface UpdateStateEvent {
  state: UpdateState
  version?: string
  percent?: number
  releaseNotes?: string
  message?: string
  pageUrl?: string
}
