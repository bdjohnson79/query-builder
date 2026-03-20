'use client'
import { useQueryStore } from '@/store/queryStore'
import { useAvailableColumns } from '@/hooks/useAvailableColumns'
import { Checkbox } from '@/components/ui/checkbox'
import type { ColumnRef } from '@/types/query'

export function GroupByPanel() {
  const tables    = useQueryStore((s) => s.queryState.tables)
  const groupBy   = useQueryStore((s) => s.queryState.groupBy)
  const setGroupBy = useQueryStore((s) => s.setGroupBy)
  const allColumns = useAvailableColumns()

  const isSelected = (ref: ColumnRef) =>
    groupBy.some((g) => g.tableAlias === ref.tableAlias && g.columnName === ref.columnName)

  const toggle = (ref: ColumnRef) => {
    if (isSelected(ref)) {
      setGroupBy(groupBy.filter((g) => !(g.tableAlias === ref.tableAlias && g.columnName === ref.columnName)))
    } else {
      setGroupBy([...groupBy, ref])
    }
  }

  if (tables.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground text-center">Add tables to the canvas first.</p>
  }

  // Group columns by tableAlias for display
  const byAlias = allColumns.reduce<Record<string, typeof allColumns>>((acc, col) => {
    if (!acc[col.tableAlias]) acc[col.tableAlias] = []
    acc[col.tableAlias].push(col)
    return acc
  }, {})

  return (
    <div className="space-y-3 p-2">
      {Object.entries(byAlias).map(([alias, cols]) => (
        <div key={alias}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {alias}
            {cols[0]?.isExpansion && (
              <span className="rounded bg-blue-100 px-1 py-0 text-[9px] font-medium text-blue-600">
                expanded
              </span>
            )}
          </div>
          <div className="space-y-1">
            {cols.map((col, i) => {
              const ref: ColumnRef = { tableAlias: col.tableAlias, columnName: col.columnName }
              return (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm">
                  <Checkbox checked={isSelected(ref)} onCheckedChange={() => toggle(ref)} />
                  <span>{col.columnName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{col.pgType}</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
