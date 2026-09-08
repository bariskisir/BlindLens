/**
 * Centralizes the session sidebar's persisted width and safe viewport limits.
 */

/** Initial session sidebar width used before a saved preference is restored. */
export const DEFAULT_SESSIONS_SIDEBAR_WIDTH = 266
/** Narrowest usable width for session labels and actions. */
export const MIN_SESSIONS_SIDEBAR_WIDTH = 100
/** Content width kept available beside the sidebar in narrow windows. */
export const MIN_WORKSPACE_WIDTH = 160

/** Calculates the widest sidebar that still leaves the workspace usable. */
export const getMaxSessionsSidebarWidth = (viewportWidth: number): number => {
  const safeViewportWidth = Number.isFinite(viewportWidth)
    ? Math.max(0, Math.floor(viewportWidth))
    : DEFAULT_SESSIONS_SIDEBAR_WIDTH + MIN_WORKSPACE_WIDTH
  return Math.max(MIN_SESSIONS_SIDEBAR_WIDTH, safeViewportWidth - MIN_WORKSPACE_WIDTH)
}

/** Clamps an arbitrary width to the supported sidebar range for the current viewport. */
export const clampSessionsSidebarWidth = (width: number, viewportWidth: number): number => {
  const normalizedWidth = Number.isFinite(width)
    ? Math.round(width)
    : DEFAULT_SESSIONS_SIDEBAR_WIDTH
  return Math.min(
    Math.max(normalizedWidth, MIN_SESSIONS_SIDEBAR_WIDTH),
    getMaxSessionsSidebarWidth(viewportWidth),
  )
}
