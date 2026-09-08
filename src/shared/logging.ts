/**
 * Defines the diagnostic levels and renderer log entries shared by both processes.
 */

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const

/** Supported diagnostic logging level. */
export type LogLevel = (typeof LOG_LEVELS)[number]

/** Renderer diagnostic accepted by the main-process logger. */
export interface RendererLogEntry {
  level: LogLevel
  module: string
  message: string
  details?: string | undefined
}
