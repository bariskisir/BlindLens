/** Validates persisted screen descriptions and their bounded media references. */

import { z } from 'zod'
import { CAPTURE_PHASES, MAX_DESCRIPTION_LENGTH, SPEECH_PROVIDERS } from '@shared/lens'

export const captureSchema = z.object({
  phase: z.enum(CAPTURE_PHASES),
  image: z
    .object({
      assetId: z.uuid(),
      width: z.number().int().positive().max(16384),
      height: z.number().int().positive().max(16384),
    })
    .nullable(),
  answer: z.string().max(MAX_DESCRIPTION_LENGTH),
  model: z.string().max(200),
  prompt: z.string().max(20000),
  language: z.string().max(40),
  speech: z
    .object({
      provider: z.enum(SPEECH_PROVIDERS),
      model: z.string().max(200),
      voice: z.string().max(300),
      language: z.string().max(40),
      rate: z.number().min(0.5).max(2),
      assetIds: z.array(z.uuid()).max(64),
    })
    .nullable(),
  error: z.string().max(500).nullable(),
})
