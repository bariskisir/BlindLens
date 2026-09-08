/**
 * Formats stored timestamps with the clock format selected in settings.
 */

import type { TimeFormat } from '@shared/types'

/** Pads one date part to the two digits used by the shared timestamp format. */
const pad = (value: number): string => value.toString().padStart(2, '0')

/** Formats a stored ISO date as DD.MM.YYYY with the preferred 12- or 24-hour clock. */
export const formatDate = (isoDate: string, timeFormat: TimeFormat): string => {
  const date = new Date(isoDate)
  const day = pad(date.getDate())
  const month = pad(date.getMonth() + 1)
  const year = String(date.getFullYear())
  const minutes = pad(date.getMinutes())
  const localHours = date.getHours()

  if (timeFormat === '12-hour') {
    const period = localHours >= 12 ? 'PM' : 'AM'
    return `${day}.${month}.${year} ${pad(localHours % 12 || 12)}:${minutes} ${period}`
  }
  return `${day}.${month}.${year} ${pad(localHours)}:${minutes}`
}
