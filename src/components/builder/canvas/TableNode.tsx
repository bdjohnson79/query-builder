'use client'
import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { X, Key } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { useQueryStore } from '@/store/queryStore'
import type { TableInstance, ColumnMeta, SelectedColumn } from '@/types/query'

interface TableNodeData {
  instance: TableInstance
}

export const TableNode = memo(function TableNode({ data }: NodeProps<TableNodeData>) {
  const { instance } = data
  const { selectedColumns, toggleColumn, removeTable } = useQueryStore((s) => ({
    selectedColumns: s.queryState.selectedColumns,
    toggleColumn: s.toggleColumn,
    removeTable: s.removeTable,
  }))

  const isSelected = useCallback(
    (col: ColumnMeta) =>
      selectedColumns.some(
        (c) => c.tableAlias === instance.alias && c.columnName === col.name
      ),
    [selectedColumns, instance.alias]
  )

  const handleToggle = (col: ColumnMeta) => {
    const col_: SelectedColumn = {
      id: crypto.randomUUID(),
      tableAlias: instance.alias,
      columnName: col.name,
    }
    toggleColumn(col_)
  }

  return (
    <div className="min-w-[200px] rounded-lg border border-border bg-card shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-blue-600 px-3 py-2 text-white">
        <div className="min-w-0">
          <div className="truncate font-semibold text-sm">{instance.tableName}</div>
          <div className="truncate text-xs opacity-80">{instance.alias}</div>
        </div>
        <button
          className="ml-2 shrink-0 rounded hover:bg-white/20 p-0.5"
          onClick={() => removeTable(instance.id)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Columns */}
      <div className="divide-y divide-border">
        {instance.columns.map((col) => (
          <div
            key={col.id}
            className="relative flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50"
          >
            {/* Left handle for join target */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${instance.alias}__${col.name}__target`}
              className="!h-2 !w-2 !border-blue-400 !bg-white"
            />

            <Checkbox
              checked={isSelected(col)}
              onCheckedChange={() => handleToggle(col)}
              id={`${instance.id}-${col.id}`}
            />

            <label
              htmlFor={`${instance.id}-${col.id}`}
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-1 text-sm',
                col.isPrimaryKey && 'font-medium'
              )}
            >
              {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-500" />}
              <span className="truncate">{col.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{col.pgType}</span>
            </label>

            {/* Right handle for join source */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${instance.alias}__${col.name}__source`}
              className="!h-2 !w-2 !border-blue-400 !bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  )
})
