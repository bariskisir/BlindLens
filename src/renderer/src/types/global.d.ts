/**
 * Adds the typed preload bridge to the renderer Window interface.
 */

import type { AppApi } from '@shared/types'

declare global {
  interface Window {
    app: AppApi
  }
}
