/**
 * Keeps highlighted Ant Design buttons readable in both the light and dark themes.
 */

import type { ButtonProps } from 'antd'
import { useTheme } from '@renderer/context/ThemeProvider'

/** Ant Design button appearance shared by highlighted and inactive actions. */
export type AccentButtonProps = Pick<ButtonProps, 'type' | 'ghost'>

/** Returns primary styling for highlighted actions and quiet styling for inactive ones. */
export const useAccentButtonProps = (highlighted = true): AccentButtonProps => {
  const { theme } = useTheme()
  if (!highlighted) return { type: 'text' }
  return theme === 'light' ? { type: 'primary', ghost: true } : { type: 'primary' }
}
