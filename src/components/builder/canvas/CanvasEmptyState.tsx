'use client'
import { Table2, ArrowLeft } from 'lucide-react'

interface CanvasEmptyStateProps {
  onStartTour: () => void
}

export function CanvasEmptyState({ onStartTour }: CanvasEmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex flex-col items-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/20 px-10 py-12 text-center shadow-sm max-w-sm">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <Table2 className="h-6 w-6 text-blue-600" />
        </div>

        <p className="text-base font-semibold text-foreground">Start by adding a table</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag any table from the left panel onto this canvas.
        </p>

        <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground/60">
          <ArrowLeft className="h-3 w-3" />
          <span>Tables are listed on the left</span>
        </div>

        <button
          onClick={onStartTour}
          className="mt-5 text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors"
        >
          Take the tour →
        </button>
      </div>
    </div>
  )
}
