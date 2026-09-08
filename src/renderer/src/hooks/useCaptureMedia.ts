/** Loads a selected session's image while rejecting stale asynchronous results. */

import { useEffect, useState } from 'react'
import { createLogger } from '@renderer/services/LoggerService'
import { useFailureReporter } from './useFailureReporter'

const logger = createLogger('CaptureMedia')

/** Resolves an image only for the currently selected session and asset pair. */
export const useCaptureMedia = (id: string | undefined, assetId: string | undefined): string => {
  const [media, setMedia] = useState({ id: '', assetId: '', url: '' })
  const report = useFailureReporter(logger)
  useEffect(() => {
    if (!id || !assetId) return
    let active = true
    void window.app
      .getCaptureMedia(id, assetId)
      .then((url) => {
        if (active) setMedia({ id, assetId, url })
      })
      .catch((error) => {
        if (active) report('The saved image could not be loaded.', error)
      })
    return () => {
      active = false
    }
  }, [id, assetId, report])
  return media.id === id && media.assetId === assetId ? media.url : ''
}
