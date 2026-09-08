/**
 * Validates every untrusted payload accepted by the IPC boundary.
 */

import { LOG_LEVELS } from '@shared/types'
import { z } from 'zod'

/** Maximum length accepted for a session title. */
export const MAX_SESSION_TITLE_LENGTH = 200

export const sessionIdSchema = z.uuid()

/** Validates shortcut recording suspension requested by the focused settings editor. */
export const hotkeyRecordingSchema = z.boolean()

export const credentialSaveSchema = z
  .object({
    provider: z.enum(['deepgram', 'openrouter']),
    key: z
      .string()
      .trim()
      .max(2000)
      .refine((key) => !/[\r\n]/.test(key)),
  })
  .strict()
export const captureRetrySchema = z.object({ id: z.uuid(), speechOnly: z.boolean() }).strict()
export const captureMediaSchema = z.object({ id: z.uuid(), assetId: z.uuid() }).strict()
export const captureExportSchema = z
  .object({ id: z.uuid(), kind: z.enum(['image', 'text', 'audio']) })
  .strict()

export const sessionRenameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(MAX_SESSION_TITLE_LENGTH),
})

export const rendererLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  details: z.string().max(8_000).optional(),
})

export const alwaysOnTopSchema = z.boolean({ error: 'Invalid window preference.' })

export const resolvedThemeSchema = z.enum(['light', 'dark'], { error: 'Invalid theme.' })

export const externalUrlSchema = z.string({ error: 'Invalid external URL.' })
/** Validates browser speech availability without exposing browser objects to the main process. */
export const speechAvailabilitySchema = z
  .object({ available: z.boolean(), voiceUris: z.array(z.string().max(300)).max(2000) })
  .strict()

/** Limits catalog refreshes to the explicitly requested provider. */
export const providerRefreshSchema = z.enum(['chatgpt', 'openrouter'])
