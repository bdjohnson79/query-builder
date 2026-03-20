'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ChevronUp, ChevronDown, X, Plus, GitBranch, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SelectedColumn } from '@/types/query'

// ---------------------------------------------------------------------------
// Time dimension presets
// ---------------------------------------------------------------------------

const TIME_DIM_PRESETS = [
  { label: 'Hour of day',          expr: 'EXTRACT(HOUR FROM {col})',                    alias: 'hour_of_day' },
  { label: 'Day of week (number)', expr: 'EXTRACT(DOW FROM {col})',                     alias: 'day_of_week' },
  { label: 'Day of week (name)',   expr: "TO_CHAR({col}, 'Day')",                       alias: 'day_name' },
  { label: 'Week number',          expr: 'EXTRACT(WEEK FROM {col})',                    alias: 'week_num' },
  { label: 'Month (number)',       expr: 'EXTRACT(MONTH FROM {col})',                   alias: 'month' },
  { label: 'Month (name)',         expr: "TO_CHAR({col}, 'Month')",                     alias: 'month_name' },
  { label: 'Date only',            expr: 'DATE({col})',                                 alias: 'date' },
  { label: 'Shift bucket (6h)',    expr: '(EXTRACT(HOUR FROM {col}) / 6)::int * 6',    alias: 'shift_hour' },
]

const TIMESTAMP_PG_TYPES = ['timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone']

// ---------------------------------------------------------------------------
// CASE WHEN builder
// ---------------------------------------------------------------------------

interface CaseRow {
  id: string
  when: string
  then: string
}

function buildCaseExpression(rows: CaseRow[], elseVal: string): string {
  const valid = rows.filter((r) => r.when.trim() && r.then.trim())
  if (valid.length === 0) return ''
  const whenLines = valid.map((r) => `  WHEN ${r.when.trim()} THEN ${r.then.trim()}`).join('\n')
  const elseLine = elseVal.trim() ? `\n  ELSE ${elseVal.trim()}` : ''
  return `CASE\n${whenLines}${elseLine}\nEND`
}

function CaseWhenDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (expression: string, alias: string) => void
}) {
  const [rows, setRows] = useState<CaseRow[]>([{ id: crypto.randomUUID(), when: '', then: '' }])
  const [elseVal, setElseVal] = useState('')
  const [alias, setAlias] = useState('')

  const addRow = () =>
    setRows((prev) => [...prev, { id: crypto.randomUUID(), when: '', then: '' }])

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id))

  const updateRow = (id: string, field: 'when' | 'then', value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))

  const preview = buildCaseExpression(rows, elseVal)

  const handleAdd = () => {
    if (!preview || !alias.trim()) return
    onAdd(preview, alias.trim())
    // Reset
    setRows([{ id: crypto.randomUUID(), when: '', then: '' }])
    setElseVal('')
    setAlias('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>CASE WHEN Builder</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {/* WHEN/THEN rows */}
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-start">
                <div className="space-y-0.5">
                  {i === 0 && <Label className="text-[10px] text-muted-foreground">WHEN</Label>}
                  <Input
                    value={row.when}
                    onChange={(e) => updateRow(row.id, 'when', e.target.value)}
                    placeholder="condition"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  {i === 0 && <Label className="text-[10px] text-muted-foreground">THEN</Label>}
                  <Input
                    value={row.then}
                    onChange={(e) => updateRow(row.id, 'then', e.target.value)}
                    placeholder="result"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div className={cn(i === 0 && 'mt-4')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addRow} className="w-full h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" />
            Add condition
          </Button>

          {/* ELSE */}
          <div className="space-y-1">
            <Label className="text-xs">ELSE (optional)</Label>
            <Input
              value={elseVal}
              onChange={(e) => setElseVal(e.target.value)}
              placeholder="default value"
              className="h-7 text-xs font-mono"
            />
          </div>

          {/* Alias */}
          <div className="space-y-1">
            <Label className="text-xs">Column alias <span className="text-destructive">*</span></Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. status_label"
              className="h-7 text-xs"
            />
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Preview</Label>
              <pre className="rounded bg-muted/50 border px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {preview}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!preview || !alias.trim()}
          >
            Add to SELECT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Column row
// ---------------------------------------------------------------------------

const AGGREGATE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'COUNT', label: 'COUNT' },
  { value: 'SUM', label: 'SUM' },
  { value: 'AVG', label: 'AVG' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'COUNT DISTINCT', label: 'COUNT DISTINCT' },
]

function ColumnRow({
  col,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdateAlias,
  onUpdateAggregate,
}: {
  col: SelectedColumn
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onUpdateAlias: (alias: string) => void
  onUpdateAggregate: (agg: string) => void
}) {
  const [aliasVal, setAliasVal] = useState(col.alias ?? '')

  const sourceLabel = col.expression
    ? col.expression.length > 36
      ? col.expression.slice(0, 34) + '…'
      : col.expression
    : `${col.tableAlias}.${col.columnName}`

  const commitAlias = () => {
    onUpdateAlias(aliasVal.trim())
  }

  return (
    <div className="flex items-center gap-1.5 rounded border bg-background px-2 py-1.5 text-xs">
      {/* Reorder */}
      <div className="flex flex-col shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Source label */}
      <span
        className="flex-1 min-w-0 font-mono text-[10px] text-muted-foreground truncate"
        title={col.expression ?? `${col.tableAlias}.${col.columnName}`}
      >
        {sourceLabel}
      </span>

      {/* Alias */}
      <input
        className="w-24 rounded border bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        value={aliasVal}
        placeholder="alias"
        onChange={(e) => setAliasVal(e.target.value)}
        onBlur={commitAlias}
        onKeyDown={(e) => { if (e.key === 'Enter') commitAlias() }}
      />

      {/* Aggregate */}
      <select
        className="rounded border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
        value={col.aggregate ?? ''}
        onChange={(e) => onUpdateAggregate(e.target.value)}
      >
        {AGGREGATE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SelectColumnsPanel() {
  const selectedColumns = useQueryStore((s) => s.queryState.selectedColumns)
  const tables          = useQueryStore((s) => s.queryState.tables)
  const updateColumn    = useQueryStore((s) => s.updateColumn)
  const reorderColumns  = useQueryStore((s) => s.reorderColumns)
  const addColumn       = useQueryStore((s) => s.addColumn)
  const toggleColumn    = useQueryStore((s) => s.toggleColumn)

  const [showExprForm, setShowExprForm]   = useState(false)
  const [exprVal, setExprVal]             = useState('')
  const [exprAlias, setExprAlias]         = useState('')
  const [caseOpen, setCaseOpen]           = useState(false)
  const [showTimeDim, setShowTimeDim]     = useState(false)
  const [timeDimCol, setTimeDimCol]       = useState('')
  const [timeDimPreset, setTimeDimPreset] = useState(TIME_DIM_PRESETS[0].label)

  // All timestamp/timestamptz columns from current query tables
  const timestampColumns = tables.flatMap((t) =>
    t.columns
      .filter((c) => TIMESTAMP_PG_TYPES.some((pt) => c.pgType === pt || c.pgType.startsWith(pt)))
      .map((c) => ({ label: `${t.alias}.${c.name}`, value: `${t.alias}.${c.name}` }))
  )

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const cols = [...selectedColumns]
    ;[cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]]
    reorderColumns(cols)
  }

  const moveDown = (idx: number) => {
    if (idx === selectedColumns.length - 1) return
    const cols = [...selectedColumns]
    ;[cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]]
    reorderColumns(cols)
  }

  const addExpression = () => {
    if (!exprVal.trim() || !exprAlias.trim()) return
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: exprAlias.trim(),
      alias: exprAlias.trim(),
      expression: exprVal.trim(),
    })
    setExprVal('')
    setExprAlias('')
    setShowExprForm(false)
  }

  const addCaseWhen = (expression: string, alias: string) => {
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: alias,
      alias,
      expression,
    })
  }

  const addTimeDim = () => {
    if (!timeDimCol) return
    const preset = TIME_DIM_PRESETS.find((p) => p.label === timeDimPreset)
    if (!preset) return
    const expression = preset.expr.replace('{col}', timeDimCol)
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: preset.alias,
      alias: preset.alias,
      expression,
    })
    setShowTimeDim(false)
    setTimeDimCol('')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SELECT — {selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs px-2"
            onClick={() => { setShowExprForm(!showExprForm); setCaseOpen(false); setShowTimeDim(false) }}
          >
            <Plus className="h-3 w-3" />
            Expression
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs px-2"
            onClick={() => setCaseOpen(true)}
          >
            <GitBranch className="h-3 w-3" />
            CASE WHEN
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs px-2"
            onClick={() => { setShowTimeDim(!showTimeDim); setShowExprForm(false) }}
          >
            <Clock className="h-3 w-3" />
            Time Dim
          </Button>
        </div>
      </div>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
        {selectedColumns.length === 0 && !showExprForm ? (
          <p className="py-6 text-center text-xs text-muted-foreground leading-relaxed px-4">
            Check columns in the table nodes on the canvas to add them to SELECT.<br />
            Use <strong>Expression</strong> or <strong>CASE WHEN</strong> above to add computed columns.
          </p>
        ) : (
          selectedColumns.map((col, idx) => (
            <ColumnRow
              key={col.id}
              col={col}
              isFirst={idx === 0}
              isLast={idx === selectedColumns.length - 1}
              onMoveUp={() => moveUp(idx)}
              onMoveDown={() => moveDown(idx)}
              onRemove={() => toggleColumn(col)}
              onUpdateAlias={(alias) => updateColumn(col.id, { alias: alias || undefined })}
              onUpdateAggregate={(agg) => updateColumn(col.id, { aggregate: agg || undefined })}
            />
          ))
        )}

        {/* Inline time dimension form */}
        {showTimeDim && (
          <div className="rounded border bg-muted/20 p-2 space-y-2 mt-2">
            <Label className="text-xs font-medium">Time dimension</Label>
            {timestampColumns.length === 0 ? (
              <p className="text-xs text-muted-foreground">No timestamp columns found in current tables.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Time column</Label>
                  <select
                    className="w-full rounded border bg-background px-2 py-1 text-xs"
                    value={timeDimCol}
                    onChange={(e) => setTimeDimCol(e.target.value)}
                  >
                    <option value="">Select column…</option>
                    {timestampColumns.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Dimension</Label>
                  <select
                    className="w-full rounded border bg-background px-2 py-1 text-xs"
                    value={timeDimPreset}
                    onChange={(e) => setTimeDimPreset(e.target.value)}
                  >
                    {TIME_DIM_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {timeDimCol && (
                  <div className="rounded bg-muted/50 border px-2 py-1">
                    <code className="text-[10px] font-mono text-muted-foreground break-all">
                      {TIME_DIM_PRESETS.find((p) => p.label === timeDimPreset)?.expr.replace('{col}', timeDimCol)}
                    </code>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setShowTimeDim(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-xs flex-1"
                    disabled={!timeDimCol}
                    onClick={addTimeDim}
                  >
                    Add to SELECT
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Inline expression form */}
        {showExprForm && (
          <div className="rounded border bg-muted/20 p-2 space-y-2 mt-2">
            <Label className="text-xs font-medium">Custom expression</Label>
            <textarea
              className="w-full rounded border bg-background px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={exprVal}
              onChange={(e) => setExprVal(e.target.value)}
              placeholder="e.g. (i.time_run / NULLIF(i.time_scheduled, 0)) * 100"
            />
            <div className="space-y-1">
              <Label className="text-xs">Alias</Label>
              <Input
                value={exprAlias}
                onChange={(e) => setExprAlias(e.target.value)}
                placeholder="e.g. oee_pct"
                className="h-7 text-xs"
                onKeyDown={(e) => { if (e.key === 'Enter') addExpression() }}
              />
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setShowExprForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-xs flex-1"
                disabled={!exprVal.trim() || !exprAlias.trim()}
                onClick={addExpression}
              >
                Add to SELECT
              </Button>
            </div>
          </div>
        )}
      </div>

      <CaseWhenDialog open={caseOpen} onClose={() => setCaseOpen(false)} onAdd={addCaseWhen} />
    </div>
  )
}
