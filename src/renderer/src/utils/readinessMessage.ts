/** Resolves provider preflight failures to explicit, fully translated user guidance. */

import type { TFunction } from 'i18next'
import type { ReadinessIssue } from '@shared/lens'

/** Returns the actionable message for a failed local provider prerequisite. */
export const readinessMessage = (reason: ReadinessIssue, t: TFunction): string =>
  ({
    chatGptRequired: t('lens.chatGptRequired'),
    chatGptModelRequired: t('lens.chatGptModelRequired'),
    deepgramKeyRequired: t('lens.deepgramKeyRequired'),
    openRouterKeyRequired: t('lens.openRouterKeyRequired'),
    openRouterModelRequired: t('lens.openRouterModelRequired'),
    languageMismatch: t('lens.languageMismatch'),
    voiceMissing: t('lens.voiceMissing'),
  })[reason]
