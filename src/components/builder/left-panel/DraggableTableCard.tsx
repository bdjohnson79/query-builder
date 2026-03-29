'use client'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'

interface Props {
  table: AppTable
  schema: AppSchema
  columns: AppColumn[]
}

export function DraggableTableCard({ table, schema, columns }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `table-${table.id}`,
    data: { type: 'table', table, schema, columns },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-sm transition-opacity hover:bg-accent active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Table2 className="h-3.5 w-3.5 shrink-0 text-teal-600" />
      <div className="min-w-0">
        <div className="truncate font-medium" title={table.description ?? undefined}>
          {table.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">{columns.length} columns</div>
      </div>
    </div>
  )
}
