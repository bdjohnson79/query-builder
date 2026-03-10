'use client'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus } from 'lucide-react'
import { emptyQueryState } from '@/types/query'
import type { CTEDef } from '@/types/query'

export function CtePanel() {
  const { ctes, addCte, updateCte, removeCte } = useQueryStore((s) => ({
    ctes: s.queryState.ctes,
    addCte: s.addCte,
    updateCte: s.updateCte,
    removeCte: s.removeCte,
  }))

  const addNew = () => {
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: `cte_${ctes.length + 1}`,
      recursive: false,
      queryState: { ...emptyQueryState(), isSubquery: true },
    }
    addCte(cte)
  }

  return (
    <div className="space-y-3 p-2">
      {ctes.map((cte) => (
        <div key={cte.id} className="rounded-md border p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">WITH {cte.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCte(cte.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CTE Name</Label>
            <Input
              className="h-7 text-xs"
              value={cte.name}
              onChange={(e) => updateCte(cte.id, { name: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={cte.recursive}
              onChange={(e) => updateCte(cte.id, { recursive: e.target.checked })}
            />
            RECURSIVE
          </label>
          <p className="text-xs text-muted-foreground">
            CTE body editing is available in a future version. Use the SQL preview to review the generated CTE.
          </p>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addNew}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add CTE
      </Button>
    </div>
  )
}
