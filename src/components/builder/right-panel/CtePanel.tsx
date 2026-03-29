'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Pencil, Code2, Eye, GitMerge } from 'lucide-react'
import { emptyQueryState } from '@/types/query'
import type { CTEDef, CteOutputColumn } from '@/types/query'

// ── Output column editor (used when CTE is in raw SQL mode) ─────────────────

function OutputColumnsEditor({
  columns,
  onChange,
}: {
  columns: CteOutputColumn[]
  onChange: (cols: CteOutputColumn[]) => void
}) {
  const add = () => onChange([...columns, { name: '', pgType: 'text' }])
  const remove = (i: number) => onChange(columns.filter((_, idx) => idx !== i))
  const update = (i: number, field: 'name' | 'pgType', val: string) => {
    const next = columns.map((c, idx) => (idx === i ? { ...c, [field]: val } : c))
    onChange(next)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Output columns</Label>
        <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-0.5" /> Add
        </Button>
      </div>
      {columns.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Define columns so this CTE can be dragged onto the canvas.
        </p>
      )}
      {columns.map((col, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            className="h-6 text-xs flex-1"
            placeholder="name"
            value={col.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <Input
            className="h-6 text-xs w-24"
            placeholder="pg type"
            value={col.pgType}
            onChange={(e) => update(i, 'pgType', e.target.value)}
          />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => remove(i)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}

// ── CTE edit form ────────────────────────────────────────────────────────────

type CteBodyMode = 'visual' | 'raw' | 'guided'

function CteEditForm({ cte }: { cte: CTEDef }) {
  const updateCte = useQueryStore((s) => s.updateCte)
  const stopEditingCte = useQueryStore((s) => s.stopEditingCte)

  const rawMode = cte.rawSql !== undefined && cte.rawSql !== null
  const guidedMode = cte.recursive && cte.recursiveMode === 'guided'

  const currentMode: CteBodyMode = guidedMode ? 'guided' : rawMode ? 'raw' : 'visual'

  const switchMode = (mode: CteBodyMode) => {
    if (mode === 'visual') {
      updateCte(cte.id, { rawSql: undefined, recursiveMode: undefined })
    } else if (mode === 'raw') {
      updateCte(cte.id, { rawSql: rawMode ? cte.rawSql : '', recursiveMode: undefined })
    } else {
      // guided — only available when recursive is checked
      updateCte(cte.id, { rawSql: undefined, recursiveMode: 'guided' })
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={stopEditingCte}>
          ← Back
        </Button>
        <span className="text-xs font-semibold text-muted-foreground">Editing CTE</span>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <Label className="text-xs">CTE Name</Label>
        <Input
          className="h-7 text-xs"
          value={cte.name}
          onChange={(e) => updateCte(cte.id, { name: e.target.value })}
        />
      </div>

      {/* Recursive */}
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={cte.recursive}
          onChange={(e) => {
            updateCte(cte.id, { recursive: e.target.checked })
            // If turning off recursive, exit guided mode
            if (!e.target.checked && guidedMode) {
              updateCte(cte.id, { recursiveMode: undefined })
            }
          }}
        />
        RECURSIVE
      </label>

      {/* Mode toggle */}
      <div className="space-y-1">
        <Label className="text-xs">Body mode</Label>
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={currentMode === 'visual' ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => switchMode('visual')}
          >
            <Eye className="h-3 w-3" /> Visual
          </Button>
          <Button
            variant={currentMode === 'raw' ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => switchMode('raw')}
          >
            <Code2 className="h-3 w-3" /> Raw SQL
          </Button>
          {cte.recursive && (
            <Button
              variant={currentMode === 'guided' ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => switchMode('guided')}
              title="Two-pane guided mode for recursive CTEs"
            >
              <GitMerge className="h-3 w-3" /> Guided
            </Button>
          )}
        </div>
      </div>

      {currentMode === 'guided' ? (
        <>
          {/* Help text */}
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 space-y-1">
            <p className="font-medium">Recursive CTE pattern</p>
            <p>The anchor query returns the base rows. The recursive step joins back to <code className="font-mono bg-blue-100 px-0.5 rounded">{cte.name || 'this CTE'}</code> to traverse the hierarchy.</p>
          </div>

          {/* Anchor query */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Anchor query <span className="text-muted-foreground font-normal">(starting rows, non-recursive)</span></Label>
            <textarea
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
              value={cte.anchorSql ?? ''}
              onChange={(e) => updateCte(cte.id, { anchorSql: e.target.value })}
              placeholder={`SELECT id, parent_id, name, 0 AS depth\nFROM your_table\nWHERE parent_id IS NULL`}
              spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="flex-1 border-t" />
            <span className="font-mono">UNION ALL</span>
            <div className="flex-1 border-t" />
          </div>

          {/* Recursive step */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Recursive step <span className="text-muted-foreground font-normal">(each iteration)</span></Label>
            <textarea
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
              value={cte.recursiveStepSql ?? ''}
              onChange={(e) => updateCte(cte.id, { recursiveStepSql: e.target.value })}
              placeholder={`SELECT t.id, t.parent_id, t.name, r.depth + 1\nFROM your_table t\nINNER JOIN ${cte.name || 'cte_name'} r ON t.parent_id = r.id`}
              spellCheck={false}
            />
          </div>

          {/* Output columns */}
          <OutputColumnsEditor
            columns={cte.outputColumns ?? []}
            onChange={(cols) => updateCte(cte.id, { outputColumns: cols })}
          />
        </>
      ) : currentMode === 'raw' ? (
        <>
          {/* Raw SQL textarea */}
          <div className="space-y-1">
            <Label className="text-xs">SQL body</Label>
            <textarea
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-y min-h-[120px] focus:outline-none focus:ring-1 focus:ring-ring"
              value={cte.rawSql ?? ''}
              onChange={(e) => updateCte(cte.id, { rawSql: e.target.value })}
              placeholder="SELECT ..."
              spellCheck={false}
            />
          </div>

          {/* Output columns (required for dragging onto canvas) */}
          <OutputColumnsEditor
            columns={cte.outputColumns ?? []}
            onChange={(cols) => updateCte(cte.id, { outputColumns: cols })}
          />
        </>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-center">
          <p className="text-xs text-muted-foreground mb-2">
            The visual builder is active. Use the canvas and panels above to build this CTE.
          </p>
          <p className="text-xs text-muted-foreground">
            Output columns are derived automatically from the CTE&apos;s SELECT list.
          </p>
        </div>
      )}
    </div>
  )
}

// ── CTE list item ────────────────────────────────────────────────────────────

function CteListItem({ cte }: { cte: CTEDef }) {
  const removeCte = useQueryStore((s) => s.removeCte)
  const startEditingCte = useQueryStore((s) => s.startEditingCte)
  const rawMode = cte.rawSql !== undefined && cte.rawSql !== null
  const guidedMode = cte.recursive && cte.recursiveMode === 'guided'

  const modeLabel = guidedMode ? 'Guided' : rawMode ? 'Raw SQL' : 'Visual'
  const modeClass = guidedMode
    ? 'bg-blue-100 text-blue-700'
    : rawMode
    ? 'bg-purple-100 text-purple-700'
    : 'bg-green-100 text-green-700'

  return (
    <div className="rounded-md border p-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold truncate">WITH {cte.name}</span>
          {cte.recursive && (
            <span className="rounded bg-orange-100 text-orange-700 px-1 py-0.5 text-[10px] shrink-0">
              RECURSIVE
            </span>
          )}
          <span className={`rounded px-1 py-0.5 text-[10px] shrink-0 ${modeClass}`}>
            {modeLabel}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => startEditingCte(cte.id)}
            title="Edit CTE"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => removeCte(cte.id)}
            title="Delete CTE"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {(rawMode || guidedMode) && cte.outputColumns && cte.outputColumns.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {cte.outputColumns.length} output column{cte.outputColumns.length !== 1 ? 's' : ''}
          {' — '}
          {cte.outputColumns.map((c) => c.name).join(', ')}
        </p>
      )}
      {!rawMode && !guidedMode && (
        <p className="text-[10px] text-muted-foreground">
          Click Edit to open visual builder for this CTE
        </p>
      )}
    </div>
  )
}

// ── Main CtePanel ────────────────────────────────────────────────────────────

export function CtePanel() {
  const ctes = useQueryStore((s) => s.queryState.ctes)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const addCte = useQueryStore((s) => s.addCte)
  const startEditingCte = useQueryStore((s) => s.startEditingCte)

  const activeCte = activeCteId ? ctes.find((c) => c.id === activeCteId) : null

  const addNew = () => {
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: `cte_${ctes.length + 1}`,
      recursive: false,
      queryState: { ...emptyQueryState(), isSubquery: true },
      outputColumns: [],
    }
    addCte(cte)
    startEditingCte(cte.id)
  }

  // Edit mode
  if (activeCte) {
    return (
      <div className="p-2">
        <CteEditForm cte={activeCte} />
      </div>
    )
  }

  // List mode
  return (
    <div className="space-y-3 p-2">
      {ctes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No CTEs defined. Add a CTE to build reusable subquery components.
        </p>
      )}

      {ctes.map((cte) => (
        <CteListItem key={cte.id} cte={cte} />
      ))}

      <Button variant="outline" size="sm" className="w-full" onClick={addNew}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add CTE
      </Button>

    </div>
  )
}
