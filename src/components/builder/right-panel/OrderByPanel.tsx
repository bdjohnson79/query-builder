'use client'
import { useQueryStore } from '@/store/queryStore'
import { useAvailableColumns } from '@/hooks/useAvailableColumns'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus } from 'lucide-react'
import type { OrderByItem } from '@/types/query'

export function OrderByPanel() {
  const orderBy    = useQueryStore((s) => s.queryState.orderBy)
  const setOrderBy = useQueryStore((s) => s.setOrderBy)
  const allColumns = useAvailableColumns()

  const add = () => {
    if (allColumns.length === 0) return
    const first = allColumns[0]
    setOrderBy([...orderBy, { tableAlias: first.tableAlias, columnName: first.columnName, direction: 'ASC' }])
  }

  const update = (idx: number, updates: Partial<OrderByItem>) => {
    setOrderBy(orderBy.map((o, i) => (i === idx ? { ...o, ...updates } : o)))
  }

  const remove = (idx: number) => {
    setOrderBy(orderBy.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2 p-2">
      {orderBy.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={`${item.tableAlias}.${item.columnName}`}
            onValueChange={(v) => {
              const dotIdx = v.indexOf('.')
              const tableAlias  = v.slice(0, dotIdx)
              const columnName = v.slice(dotIdx + 1)
              update(i, { tableAlias, columnName })
            }}
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allColumns.map((c, ci) => (
                <SelectItem key={ci} value={`${c.tableAlias}.${c.columnName}`} className="text-xs">
                  {c.tableAlias}.{c.columnName}
                  {c.isExpansion && (
                    <span className="ml-1 text-[9px] text-blue-500">(expanded)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={item.direction} onValueChange={(v) => update(i, { direction: v as 'ASC' | 'DESC' })}>
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ASC" className="text-xs">ASC</SelectItem>
              <SelectItem value="DESC" className="text-xs">DESC</SelectItem>
            </SelectContent>
          </Select>

          <Select value={item.nulls ?? 'default'} onValueChange={(v) => update(i, { nulls: v === 'default' ? undefined : v as OrderByItem['nulls'] })}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue placeholder="NULLS…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">Default</SelectItem>
              <SelectItem value="NULLS FIRST" className="text-xs">NULLS FIRST</SelectItem>
              <SelectItem value="NULLS LAST" className="text-xs">NULLS LAST</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} disabled={allColumns.length === 0} className="w-full">
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add ORDER BY
      </Button>
    </div>
  )
}
