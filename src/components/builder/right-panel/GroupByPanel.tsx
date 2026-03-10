'use client'
import { useQueryStore } from '@/store/queryStore'
import { Checkbox } from '@/components/ui/checkbox'
import type { ColumnRef } from '@/types/query'

export function GroupByPanel() {
  const tables = useQueryStore((s) => s.queryState.tables)
  const groupBy = useQueryStore((s) => s.queryState.groupBy)
  const setGroupBy = useQueryStore((s) => s.setGroupBy)

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

  return (
    <div className="space-y-3 p-2">
      {tables.map((t) => (
        <div key={t.id}>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{t.alias}</div>
          <div className="space-y-1">
            {t.columns.map((col) => {
              const ref: ColumnRef = { tableAlias: t.alias, columnName: col.name }
              return (
                <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm">
                  <Checkbox checked={isSelected(ref)} onCheckedChange={() => toggle(ref)} />
                  <span>{col.name}</span>
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
