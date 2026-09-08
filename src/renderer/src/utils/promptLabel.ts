/** Localizes the built-in prompt names while preserving user-renamed entries. */

import { DEFAULT_SYSTEM_PROMPTS, type SystemPrompt } from '@shared/lens'

/** Resolves the display name for one built-in or user-authored prompt. */
export const promptLabel = (prompt: SystemPrompt, t: (key: string) => string): string => {
  if (!DEFAULT_SYSTEM_PROMPTS.some((item) => item.id === prompt.id && item.name === prompt.name))
    return prompt.name
  if (prompt.id === 'describe') return t('lens.promptDescribe')
  if (prompt.id === 'read') return t('lens.promptRead')
  if (prompt.id === 'navigate') return t('lens.promptNavigate')
  return prompt.name
}
