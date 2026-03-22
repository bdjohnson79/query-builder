'use client'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Braces } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CTEDef } from '@/types/query'

interface Props {
  cte: CTEDef
}

export function DraggableCteCard({ cte }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cte-${cte.id}`,
    data: { type: 'cte', cte },
  })

  const colCount = cte.outputColumns?.length ?? 0
  const rawMode = cte.rawSql !== undefined && cte.rawSql !== null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-sm transition-opacity hover:bg-accent active:cursor-grabbing',
        isDragging && 'opacity-40',
        !rawMode && colCount === 0 && 'opacity-60'
      )}
      title={
        !rawMode
          ? 'Visual CTE — columns auto-derived from SELECT list'
          : colCount === 0
          ? 'No output columns defined — add columns in the CTE editor before dragging'
          : undefined
      }
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Braces className="h-3.5 w-3.5 shrink-0 text-purple-500" />
      <div className="min-w-0">
        <div className="truncate font-medium">{cte.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {rawMode
            ? colCount > 0
              ? `${colCount} column${colCount !== 1 ? 's' : ''}`
              : 'no output columns'
            : 'visual CTE'}
        </div>
      </div>
    </div>
  )
}
