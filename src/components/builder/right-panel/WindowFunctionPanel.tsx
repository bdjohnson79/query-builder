'use client'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus } from 'lucide-react'
import type { WindowFunctionDef } from '@/types/query'

const WINDOW_FNS = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'LAG', 'LEAD', 'NTILE', 'PERCENT_RANK', 'CUME_DIST']

export function WindowFunctionPanel() {
  const windowFunctions = useQueryStore((s) => s.queryState.windowFunctions)
  const tables = useQueryStore((s) => s.queryState.tables)
  const addWindowFunction = useQueryStore((s) => s.addWindowFunction)
  const updateWindowFunction = useQueryStore((s) => s.updateWindowFunction)
  const removeWindowFunction = useQueryStore((s) => s.removeWindowFunction)

  const addNew = () => {
    const wf: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'ROW_NUMBER',
      expression: '',
      partitionBy: [],
      orderBy: [],
      alias: `wf_${windowFunctions.length + 1}`,
    }
    addWindowFunction(wf)
  }

  return (
    <div className="space-y-3 p-2">
      {windowFunctions.map((wf) => (
        <div key={wf.id} className="rounded-md border p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{wf.fn}() AS {wf.alias}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeWindowFunction(wf.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Function</Label>
              <select
                className="w-full rounded border px-2 py-1 text-xs"
                value={wf.fn}
                onChange={(e) => updateWindowFunction(wf.id, { fn: e.target.value })}
              >
                {WINDOW_FNS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Alias</Label>
              <Input
                className="h-7 text-xs"
                value={wf.alias}
                onChange={(e) => updateWindowFunction(wf.id, { alias: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expression (argument)</Label>
            <Input
              className="h-7 text-xs"
              placeholder="e.g. t1.amount"
              value={wf.expression ?? ''}
              onChange={(e) => updateWindowFunction(wf.id, { expression: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">PARTITION BY (comma-separated)</Label>
            <Input
              className="h-7 text-xs"
              placeholder="e.g. t1.dept_id"
              value={wf.partitionBy.map(p => `${p.tableAlias}.${p.columnName}`).join(', ')}
              onChange={(e) => {
                const parts = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                updateWindowFunction(wf.id, {
                  partitionBy: parts.map(p => {
                    const [ta, cn] = p.split('.')
                    return { tableAlias: ta ?? '', columnName: cn ?? '' }
                  }),
                })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Frame Clause</Label>
            <Input
              className="h-7 text-xs"
              placeholder="e.g. ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
              value={wf.frameClause ?? ''}
              onChange={(e) => updateWindowFunction(wf.id, { frameClause: e.target.value || undefined })}
            />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addNew}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add Window Function
      </Button>
    </div>
  )
}
