'use client'
import { memo, useCallback, useState, useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { X, Key, ChevronDown, ChevronRight, Braces } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import { flattenToPathOptions } from '@/lib/json-structure/infer'
import type { TableInstance, ColumnMeta, SelectedColumn } from '@/types/query'

interface TableNodeData {
  instance: TableInstance
}

export const TableNode = memo(function TableNode({ data }: NodeProps<TableNodeData>) {
  const { instance } = data
  const selectedColumns = useQueryStore((s) => s.queryState.selectedColumns)
  const jsonbMappings = useQueryStore((s) => s.queryState.jsonbMappings)
  const toggleColumn = useQueryStore((s) => s.toggleColumn)
  const removeTable = useQueryStore((s) => s.removeTable)
  const updateTableAlias = useQueryStore((s) => s.updateTableAlias)
  const nudgeOverlappingTables = useQueryStore((s) => s.nudgeOverlappingTables)
  const nodeRef = useRef<HTMLDivElement>(null)
  const builtinStructures = useJsonStructureStore((s) => s.builtinStructures)
  const structures        = useJsonStructureStore((s) => s.structures)

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

  const [expandedJsonb, setExpandedJsonb] = useState<Record<string, boolean>>({})

  const toggleJsonbExpand = (colName: string) => {
    setExpandedJsonb((prev) => {
      const next = { ...prev, [colName]: !prev[colName] }
      if (next[colName]) {
        // Expanding — after the DOM repaints with the new rows, nudge any
        // overlapping sibling nodes to the right so they don't overlap.
        requestAnimationFrame(() => {
          if (nodeRef.current) {
            nudgeOverlappingTables(instance.id, nodeRef.current.offsetWidth)
          }
        })
      }
      return next
    })
  }

  const isJsonbPathSelected = useCallback(
    (colName: string, path: string) =>
      selectedColumns.some(
        (c) =>
          c.tableAlias === instance.alias &&
          c.columnName === colName &&
          c.expression !== undefined &&
          c.expression.includes(`::jsonb::`) === false &&
          // Match by the expression key segment or alias
          (c.alias === path.split('.').pop() || c.expression?.includes(`'${path.split('.').pop()}'`))
      ),
    [selectedColumns, instance.alias]
  )

  const handleJsonbPathToggle = (col: ColumnMeta, pathLabel: string, expression: string) => {
    const alias = pathLabel.split('.').pop() ?? pathLabel
    const existing = selectedColumns.find(
      (c) => c.tableAlias === instance.alias && c.expression === expression
    )
    if (existing) {
      toggleColumn(existing)
    } else {
      const col_: SelectedColumn = {
        id: crypto.randomUUID(),
        tableAlias: instance.alias,
        columnName: col.name,
        expression,
        alias,
      }
      toggleColumn(col_)
    }
  }

  const isCte = !!instance.cteId
  const headerBg = isCte ? 'bg-purple-600' : 'bg-blue-600'
  const handleColor = isCte ? '!border-purple-400' : '!border-blue-400'

  return (
    <div ref={nodeRef} className="min-w-[140px] rounded border border-border bg-card shadow-sm">
      {/* Header */}
      <div className={`flex items-center justify-between rounded-t ${headerBg} px-2 py-1 text-white`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <div className="truncate font-semibold text-[10px]">{instance.tableName}</div>
            {isCte && (
              <span className="rounded bg-white/20 px-0.5 text-[7px] font-semibold shrink-0">CTE</span>
            )}
          </div>
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
        {instance.columns.map((col) => {
          const isJsonb = !isCte && (col.pgType === 'jsonb' || col.pgType === 'json')
          const mapping = isJsonb
            ? jsonbMappings.find((m) => m.tableAlias === instance.alias && m.columnName === col.name)
            : undefined
          const structure = mapping
            ? [...builtinStructures, ...structures].find((s) => s.id === mapping.structureId)
            : undefined
          const pathOptions = structure
            ? flattenToPathOptions(structure.definition.fields, instance.alias, col.name)
            : []
          const isExpanded = expandedJsonb[col.name] ?? false

          return (
            <div key={col.id}>
              <div
                className="nodrag relative flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Left handle for join target */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`${instance.alias}__${col.name}__target`}
                  className={`!h-1.5 !w-1.5 ${handleColor} !bg-white`}
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
                  title={col.description ?? undefined}
                >
                  {col.isPrimaryKey && <Key className="h-2 w-2 text-amber-500" />}
                  <span className="truncate">{col.name}</span>
                  <span className="ml-auto text-[8px] text-muted-foreground">{col.pgType}</span>
                </label>

                {/* JSONB expand toggle */}
                {isJsonb && pathOptions.length > 0 && (
                  <button
                    className="shrink-0 text-blue-500 hover:text-blue-700"
                    onClick={() => toggleJsonbExpand(col.name)}
                    title="Expand JSONB paths"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-2.5 w-2.5" />
                      : <ChevronRight className="h-2.5 w-2.5" />}
                  </button>
                )}
                {isJsonb && !structure && (
                  <span title="Map a structure in the JSONB tab">
                    <Braces className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  </span>
                )}

                {/* Right handle for join source */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${instance.alias}__${col.name}__source`}
                  className={`!h-1.5 !w-1.5 ${handleColor} !bg-white`}
                />
              </div>

              {/* JSONB path rows */}
              {isExpanded && pathOptions.map((opt) => {
                const pathSelected = selectedColumns.some((c) => c.expression === opt.pgExpression)
                return (
                  <div
                    key={opt.path}
                    className="nodrag flex items-center gap-1.5 bg-blue-50/50 pl-8 pr-2 py-0.5 hover:bg-blue-50"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={pathSelected}
                      onCheckedChange={() => handleJsonbPathToggle(col, opt.path, opt.pgExpression)}
                      className="h-3 w-3"
                    />
                    <span className="text-[10px] text-blue-700 truncate flex-1">{opt.label}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">{opt.valueType}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})
