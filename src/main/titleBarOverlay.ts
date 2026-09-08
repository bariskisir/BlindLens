/**
 * Defines the native title-bar colors that follow the resolved renderer theme.
 */

import type { ResolvedThemeMode } from '@shared/types'

/** Native window-controls overlay appearance applied to the desktop title bar. */
export interface TitleBarOverlayTheme {
  color: string
  symbolColor: string
  height: number
}

/** Height shared by the native overlay and the renderer title bar. */
export const TITLE_BAR_HEIGHT = 42

/** Returns the overlay colors matching one resolved theme. */
export const getTitleBarOverlay = (theme: ResolvedThemeMode): TitleBarOverlayTheme =>
  theme === 'dark'
    ? { color: '#1f1f1f', symbolColor: '#ffffff99', height: TITLE_BAR_HEIGHT }
    : { color: '#f4f4f4', symbolColor: '#00000099', height: TITLE_BAR_HEIGHT }
