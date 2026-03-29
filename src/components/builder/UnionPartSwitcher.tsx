'use client'

import { useQueryStore } from '@/store/queryStore'
import { validateUnion } from '@/lib/sql-builder/union-validator'
import { Button } from '@/components/ui/button'
import { Plus, X, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { UnionOperator } from '@/types/query'

function UnionValidationBadge() {
  const queryState = useQueryStore((s) => s.queryState)
  if (!queryState.unionQuery) return null

  const result = validateUnion(queryState, queryState.unionQuery)

  if (result.valid) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        Columns match
      </span>
    )
  }

  return (
    <span
      className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 cursor-help"
      title={result.warnings.map((w) => w.message).join('\n')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {result.warnings[0]?.message ?? 'Column mismatch'}
    </span>
  )
}

function OperatorDropdown() {
  const queryState = useQueryStore((s) => s.queryState)
  const updateUnionBranchOperator = useQueryStore((s) => s.updateUnionBranchOperator)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!queryState.unionQuery) return null
  const current = queryState.unionQuery.operator

  const options: UnionOperator[] = ['UNION ALL', 'UNION']

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-1 rounded border bg-muted/50 px-2 py-1 text-[11px] font-mono font-semibold hover:bg-muted transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {current}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 rounded border bg-background shadow-md">
          {options.map((op) => (
            <button
              key={op}
              className={`block w-full px-3 py-1.5 text-left text-[11px] font-mono hover:bg-muted transition-colors ${op === current ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
              onClick={() => { updateUnionBranchOperator(op); setOpen(false) }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function UnionPartSwitcher() {
  const queryState = useQueryStore((s) => s.queryState)
  const activeQueryPart = useQueryStore((s) => s.activeQueryPart)
  const setActiveQueryPart = useQueryStore((s) => s.setActiveQueryPart)
  const addUnionBranch = useQueryStore((s) => s.addUnionBranch)
  const removeUnionBranch = useQueryStore((s) => s.removeUnionBranch)

  const hasUnion = !!queryState.unionQuery

  if (!hasUnion) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1">
        <span className="text-[11px] text-muted-foreground">Single query</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => { addUnionBranch('UNION ALL'); setActiveQueryPart('union') }}
        >
          <Plus className="h-3 w-3" />
          Add UNION
        </Button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1">
      <button
        className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
          activeQueryPart === 'main'
            ? 'bg-background text-foreground shadow-sm border'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        onClick={() => setActiveQueryPart('main')}
      >
        Part 1
      </button>

      <OperatorDropdown />

      <button
        className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
          activeQueryPart === 'union'
            ? 'bg-background text-foreground shadow-sm border'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        onClick={() => setActiveQueryPart('union')}
      >
        Part 2
      </button>

      <UnionValidationBadge />

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          title="Remove UNION branch"
          onClick={() => removeUnionBranch()}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
