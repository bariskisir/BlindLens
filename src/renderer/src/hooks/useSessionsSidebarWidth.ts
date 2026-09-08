/**
 * Keeps the session sidebar width inside safe viewport limits and remembers the last choice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setSessionsSidebarWidth } from '@renderer/store/appSlice'
import { clampSessionsSidebarWidth } from '@renderer/utils/sidebarSizing'

const SIDEBAR_WIDTH_KEY = 'sessionsSidebarWidth'
const RESIZING_BODY_CLASS = 'sessions-sidebar-resizing'

/** Current width and the pointer handler that drags the sidebar edge. */
interface SessionsSidebarWidth {
  width: number
  resizing: boolean
  beginResize: (event: React.PointerEvent<HTMLElement>) => void
}

/** Restores, constrains, and persists the width of the session sidebar. */
export const useSessionsSidebarWidth = (): SessionsSidebarWidth => {
  const dispatch = useAppDispatch()
  const width = useAppSelector((state) => state.app.sessionsSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const resizeAbortRef = useRef<AbortController | null>(null)

  /** Restores the previously dragged sidebar width from renderer-local storage. */
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (stored === null) return
    const parsed = Number(stored)
    if (Number.isFinite(parsed)) {
      dispatch(setSessionsSidebarWidth(clampSessionsSidebarWidth(parsed, window.innerWidth)))
    }
  }, [dispatch])

  /** Persists the selected sidebar width across application restarts. */
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
  }, [width])

  /** Shrinks an oversized sidebar when the application window becomes narrower. */
  useEffect(() => {
    /** Reapplies viewport constraints after native window size changes. */
    const onResize = (): void => {
      const nextWidth = clampSessionsSidebarWidth(width, window.innerWidth)
      if (nextWidth !== width) dispatch(setSessionsSidebarWidth(nextWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dispatch, width])

  /** Releases active pointer listeners if the sidebar is removed mid-drag. */
  useEffect(
    () => () => {
      resizeAbortRef.current?.abort()
      document.body.classList.remove(RESIZING_BODY_CLASS)
    },
    [],
  )

  /** Tracks pointer movement until release to resize the session panel. */
  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return
      event.preventDefault()
      resizeAbortRef.current?.abort()
      const controller = new AbortController()
      resizeAbortRef.current = controller
      const startX = event.clientX
      const startWidth = width
      setResizing(true)
      document.body.classList.add(RESIZING_BODY_CLASS)

      /** Applies the horizontal pointer delta within the safe viewport limits. */
      const onMove = (moveEvent: PointerEvent): void => {
        const nextWidth = startWidth + moveEvent.clientX - startX
        dispatch(setSessionsSidebarWidth(clampSessionsSidebarWidth(nextWidth, window.innerWidth)))
      }

      /** Ends dragging and removes the temporary global resize state. */
      const finishResize = (): void => {
        controller.abort()
        if (resizeAbortRef.current === controller) resizeAbortRef.current = null
        document.body.classList.remove(RESIZING_BODY_CLASS)
        setResizing(false)
      }

      window.addEventListener('pointermove', onMove, { signal: controller.signal })
      window.addEventListener('pointerup', finishResize, { signal: controller.signal })
      window.addEventListener('pointercancel', finishResize, { signal: controller.signal })
    },
    [dispatch, width],
  )

  return { width, resizing, beginResize }
}
