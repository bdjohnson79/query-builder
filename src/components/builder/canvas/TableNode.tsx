'use client'
import { memo, useCallback, useState } from 'react'
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
  const selectedColumns = useQueryStore((s) => s.queryState.selectedColumns)
  const toggleColumn = useQueryStore((s) => s.toggleColumn)
  const removeTable = useQueryStore((s) => s.removeTable)
  const updateTableAlias = useQueryStore((s) => s.updateTableAlias)

  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState(instance.alias)

  const commitAlias = () => {
    const trimmed = aliasInput.trim()
    if (trimmed && trimmed !== instance.alias) updateTableAlias(instance.id, trimmed)
    else setAliasInput(instance.alias)
    setEditingAlias(false)
  }

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
    <div className="min-w-[140px] rounded border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t bg-blue-600 px-2 py-1 text-white">
        <div className="min-w-0">
          <div className="truncate font-semibold text-[10px]">{instance.tableName}</div>
          {editingAlias ? (
            <input
              autoFocus
              className="nodrag w-full rounded bg-blue-700 px-0.5 text-[8px] text-white outline-none"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onBlur={commitAlias}
              onKeyDown={(e) => { if (e.key === 'Enter') commitAlias(); if (e.key === 'Escape') { setAliasInput(instance.alias); setEditingAlias(false) } }}
            />
          ) : (
            <div
              className="truncate text-[8px] opacity-75 cursor-pointer hover:opacity-100"
              title="Click to set alias"
              onClick={() => { setAliasInput(instance.alias); setEditingAlias(true) }}
            >
              {instance.alias === instance.tableName ? <span className="italic opacity-60">alias…</span> : instance.alias}
            </div>
          )}
        </div>
        <button
          className="ml-1 shrink-0 rounded hover:bg-white/20 p-0.5"
          onClick={() => removeTable(instance.id)}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Columns */}
      <div className="divide-y divide-border">
        {instance.columns.map((col) => (
          <div
            key={col.id}
            className="relative flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/50"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Left handle for join target */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${instance.alias}__${col.name}__target`}
              className="!h-1.5 !w-1.5 !border-blue-400 !bg-white"
            />

            <Checkbox
              checked={isSelected(col)}
              onCheckedChange={() => handleToggle(col)}
              id={`${instance.id}-${col.id}`}
              className="h-3 w-3"
            />

            <label
              htmlFor={`${instance.id}-${col.id}`}
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-1 text-[10px]',
                col.isPrimaryKey && 'font-medium'
              )}
            >
              {col.isPrimaryKey && <Key className="h-2 w-2 text-amber-500" />}
              <span className="truncate">{col.name}</span>
              <span className="ml-auto text-[8px] text-muted-foreground">{col.pgType}</span>
            </label>

            {/* Right handle for join source */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${instance.alias}__${col.name}__source`}
              className="!h-1.5 !w-1.5 !border-blue-400 !bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  )
})
