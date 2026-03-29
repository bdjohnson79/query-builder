'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const LS_LEFT_W = 'pq_left_w'
const LS_RIGHT_W = 'pq_right_w'
const LS_LEFT_V = 'pq_left_v'
const LS_RIGHT_V = 'pq_right_v'

function readLS(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) {
      const n = Number(v)
      if (isFinite(n)) return n
    }
  } catch { /* ignore */ }
  return fallback
}

function readLSBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return v === 'true'
  } catch { /* ignore */ }
  return fallback
}

function writeLS(key: string, value: number | boolean) {
  try { localStorage.setItem(key, String(value)) } catch { /* ignore */ }
}

export interface PanelResizeState {
  leftWidth: number
  rightWidth: number
  leftVisible: boolean
  rightVisible: boolean
  isDragging: boolean
  onLeftDividerMouseDown: (e: React.MouseEvent) => void
  onRightDividerMouseDown: (e: React.MouseEvent) => void
  toggleLeft: () => void
  toggleRight: () => void
}

export function usePanelResize(minLeft = 288, minRight = 384): PanelResizeState {
  const [leftWidth, setLeftWidth] = useState(() => readLS(LS_LEFT_W, minLeft))
  const [rightWidth, setRightWidth] = useState(() => readLS(LS_RIGHT_W, minRight))
  const [leftVisible, setLeftVisible] = useState(() => readLSBool(LS_LEFT_V, true))
  const [rightVisible, setRightVisible] = useState(() => readLSBool(LS_RIGHT_V, true))
  const [isDragging, setIsDragging] = useState(false)

  // Saved widths for restoring after unhide
  const savedLeftWidth = useRef(leftWidth)
  const savedRightWidth = useRef(rightWidth)

  // Track drag state in refs to avoid stale closures in event handlers
  const dragging = useRef<{
    side: 'left' | 'right'
    startX: number
    startWidth: number
  } | null>(null)

  const onLeftDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = { side: 'left', startX: e.clientX, startWidth: leftWidth }
    setIsDragging(true)
  }, [leftWidth])

  const onRightDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = { side: 'right', startX: e.clientX, startWidth: rightWidth }
    setIsDragging(true)
  }, [rightWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const { side, startX, startWidth } = dragging.current
      const delta = e.clientX - startX

      if (side === 'left') {
        const next = Math.max(minLeft, startWidth + delta)
        setLeftWidth(next)
        savedLeftWidth.current = next
        writeLS(LS_LEFT_W, next)
      } else {
        // Right panel grows leftward: delta is negative when expanding
        const next = Math.max(minRight, startWidth - delta)
        setRightWidth(next)
        savedRightWidth.current = next
        writeLS(LS_RIGHT_W, next)
      }
    }

    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = null
        setIsDragging(false)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [minLeft, minRight])

  const toggleLeft = useCallback(() => {
    setLeftVisible((v) => {
      const next = !v
      writeLS(LS_LEFT_V, next)
      return next
    })
  }, [])

  const toggleRight = useCallback(() => {
    setRightVisible((v) => {
      const next = !v
      writeLS(LS_RIGHT_V, next)
      return next
    })
  }, [])

  return {
    leftWidth: leftVisible ? leftWidth : 0,
    rightWidth: rightVisible ? rightWidth : 0,
    leftVisible,
    rightVisible,
    isDragging,
    onLeftDividerMouseDown,
    onRightDividerMouseDown,
    toggleLeft,
    toggleRight,
  }
}
