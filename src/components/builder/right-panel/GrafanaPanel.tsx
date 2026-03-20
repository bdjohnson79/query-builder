'use client'
import { useState, useEffect } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Check, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validatePanelType, findFirstTimestampColumn } from '@/lib/templates/panel-validation'
import type { GrafanaPanelType } from '@/types/query'

// ---------------------------------------------------------------------------
// Macro reference list
// ---------------------------------------------------------------------------

const MACRO_REFS = [
  {
    macro: '$__timeFilter(column)',
    desc: 'WHERE clause time range filter using the dashboard time picker.',
  },
  {
    macro: '$__timeFrom()',
    desc: 'Start of the dashboard time range as a timestamp literal.',
  },
  {
    macro: '$__timeTo()',
    desc: 'End of the dashboard time range as a timestamp literal.',
  },
  {
    macro: '$__timeGroup(column, interval)',
    desc: 'Rounds timestamps to the given interval for time-series GROUP BY.',
  },
  {
    macro: '$__timeGroupAlias(column, interval)',
    desc: 'Same as $__timeGroup but adds AS "time" alias automatically.',
  },
  {
    macro: '$__unixEpochFilter(column)',
    desc: 'Time range filter for columns stored as Unix epoch integers.',
  },
  {
    macro: '$__unixEpochFrom()',
    desc: 'Dashboard time range start as a Unix epoch integer.',
  },
  {
    macro: '$__unixEpochTo()',
    desc: 'Dashboard time range end as a Unix epoch integer.',
  },
  {
    macro: '$__unixEpochNanoFilter(column)',
    desc: 'Time range filter for nanosecond-precision Unix epoch columns.',
  },
  {
    macro: '$__timeEpoch(column)',
    desc: 'Converts a timestamp column to Unix epoch ms for time-series panels.',
  },
  {
    macro: '$__schema()',
    desc: 'Expands to the datasource schema configured in Grafana.',
  },
  {
    macro: '$__table()',
    desc: 'Expands to the table configured in the panel datasource.',
  },
  {
    macro: '$__column()',
    desc: 'Expands to the column configured in the panel datasource.',
  },
]

// ---------------------------------------------------------------------------
// Timestamp type helpers (shared across sub-components)
// ---------------------------------------------------------------------------

const TIMESTAMP_TYPES = [
  'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone',
]
const NUMERIC_TYPES = [
  'float8', 'float4', 'numeric', 'int4', 'int8', 'int2',
  'double precision', 'real', 'bigint', 'integer', 'smallint',
]

function isTimestampType(pgType: string) {
  return TIMESTAMP_TYPES.some((t) => pgType === t || pgType.startsWith(t))
}

// ---------------------------------------------------------------------------
// Copy button helper
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="h-3 w-3 text-green-500" />
        : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Time axis designation
// ---------------------------------------------------------------------------

function TimeAxisSection() {
  const tables         = useQueryStore((s) => s.queryState.tables)
  const timeColumn     = useQueryStore((s) => s.queryState.timeColumn)
  const setTimeColumn  = useQueryStore((s) => s.setTimeColumn)
  const orderBy        = useQueryStore((s) => s.queryState.orderBy)
  const setOrderBy     = useQueryStore((s) => s.setOrderBy)

  const timestampCols = tables.flatMap((t) =>
    t.columns
      .filter((c) => isTimestampType(c.pgType))
      .map((c) => ({ label: `${t.alias}.${c.name}`, tableAlias: t.alias, columnName: c.name }))
  )

  const currentValue = timeColumn ? `${timeColumn.tableAlias}.${timeColumn.columnName}` : ''

  const handleChange = (val: string) => {
    if (!val) { setTimeColumn(undefined); return }
    const dotIdx = val.indexOf('.')
    setTimeColumn({ tableAlias: val.slice(0, dotIdx), columnName: val.slice(dotIdx + 1) })
  }

  const hasOrderBy = timeColumn
    ? orderBy.some((o) => o.tableAlias === timeColumn.tableAlias && o.columnName === timeColumn.columnName)
    : false

  const addOrderBy = () => {
    if (!timeColumn || hasOrderBy) return
    setOrderBy([...orderBy, { tableAlias: timeColumn.tableAlias, columnName: timeColumn.columnName, direction: 'ASC' }])
  }

  const timeFilterMacro = timeColumn
    ? `$__timeFilter(${timeColumn.tableAlias}.${timeColumn.columnName})`
    : null

  if (tables.length === 0) return null

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold">Time Axis</p>
        <p className="text-[11px] text-muted-foreground">Mark the query's time column to unlock auto-suggestions.</p>
      </div>
      <select
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">Not set</option>
        {timestampCols.map((c) => (
          <option key={c.label} value={c.label}>{c.label}</option>
        ))}
      </select>

      {timeColumn && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1 rounded bg-white/70 border border-blue-100 px-2 py-0.5">
            <code className="flex-1 text-[11px] font-mono text-blue-700 truncate">{timeFilterMacro}</code>
            <CopyButton text={timeFilterMacro!} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              ORDER BY {timeColumn.tableAlias}.{timeColumn.columnName} ASC
            </span>
            <button
              onClick={addOrderBy}
              disabled={hasOrderBy}
              className="text-[11px] text-blue-600 hover:text-blue-800 disabled:text-muted-foreground disabled:cursor-default font-medium"
            >
              {hasOrderBy ? '✓ Added' : '+ Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// $__timeGroup builder
// ---------------------------------------------------------------------------

const INTERVALS = [
  '$__interval',
  '1s', '10s', '30s', '1m', '5m', '10m', '15m', '30m',
  '1h', '3h', '6h', '12h', '1d', '7d', '30d',
]

function TimeGroupBuilder() {
  const tables     = useQueryStore((s) => s.queryState.tables)
  const timeColumn = useQueryStore((s) => s.queryState.timeColumn)
  const setGroupBy = useQueryStore((s) => s.setGroupBy)
  const groupBy    = useQueryStore((s) => s.queryState.groupBy)

  const [column, setColumn]       = useState('')
  const [interval, setInterval]   = useState('1m')
  const [withAlias, setWithAlias] = useState(true)

  // Auto-wire: pre-select the designated time column when set
  useEffect(() => {
    if (timeColumn && !column) {
      setColumn(`${timeColumn.tableAlias}.${timeColumn.columnName}`)
    }
  }, [timeColumn, column])

  const allColumns = tables.flatMap((t) =>
    t.columns.map((c) => ({ label: `${t.alias}.${c.name}`, value: `${t.alias}.${c.name}` }))
  )

  // $__interval must not be quoted; fixed intervals get single quotes
  const intervalStr = interval === '$__interval' ? '$__interval' : `'${interval}'`
  const macro = withAlias
    ? `$__timeGroupAlias(${column || 'column'}, ${intervalStr})`
    : `$__timeGroup(${column || 'column'}, ${intervalStr})`

  const addToGroupBy = () => {
    if (!column) return
    const expr = `$__timeGroup(${column}, ${intervalStr})`
    const already = groupBy.some((g) => g.tableAlias === '__grafana__' && g.columnName === expr)
    if (!already) setGroupBy([...groupBy, { tableAlias: '__grafana__', columnName: expr }])
  }

  if (tables.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Add tables to the canvas first.</p>
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Time column</Label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={column}
          onChange={(e) => setColumn(e.target.value)}
        >
          <option value="">Select column…</option>
          {allColumns.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Interval</Label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i === '$__interval' ? '$__interval  (auto-calculated by Grafana)' : i}
            </option>
          ))}
        </select>
        {interval === '$__interval' && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Grafana auto-calculates the bucket width from the panel's time range and pixel width. Recommended when users will adjust the time range.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={withAlias}
          onChange={(e) => setWithAlias(e.target.checked)}
        />
        Add <code className="font-mono">AS "time"</code> alias
      </label>

      <div className="flex items-center gap-1 rounded bg-muted/40 border px-2 py-1">
        <code className="flex-1 text-xs font-mono text-muted-foreground break-all">{macro}</code>
        <CopyButton text={macro} />
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full"
        disabled={!column}
        onClick={addToGroupBy}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add to GROUP BY
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manual edit notice
// ---------------------------------------------------------------------------

function ManualEditNotice() {
  const userEditedSql    = useQueryStore((s) => s.userEditedSql)
  const setUserEditedSql = useQueryStore((s) => s.setUserEditedSql)
  if (!userEditedSql) return null
  return (
    <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
      <span className="flex-1">
        SQL has been manually edited. The macro helpers below apply to the auto-generated version.
      </span>
      <button
        onClick={() => setUserEditedSql(null)}
        className="shrink-0 underline hover:text-amber-900 whitespace-nowrap"
      >
        Revert
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel type intent
// ---------------------------------------------------------------------------

const PANEL_TYPES: { value: GrafanaPanelType; label: string }[] = [
  { value: 'time-series', label: 'Time Series' },
  { value: 'stat',        label: 'Stat' },
  { value: 'bar-chart',   label: 'Bar Chart' },
  { value: 'table',       label: 'Table' },
  { value: 'heatmap',     label: 'Heatmap' },
]

function PanelTypeIntent() {
  const panelType    = useQueryStore((s) => s.queryState.grafanaPanelType)
  const isVariable   = useQueryStore((s) => s.queryState.isGrafanaVariable)
  const timeColumn   = useQueryStore((s) => s.queryState.timeColumn)
  const setPanelType = useQueryStore((s) => s.setPanelType)
  const queryState   = useQueryStore((s) => s.queryState)
  const setOrderBy   = useQueryStore((s) => s.setOrderBy)
  const orderBy      = useQueryStore((s) => s.queryState.orderBy)

  if (isVariable) return null

  const warnings = panelType ? validatePanelType(panelType, queryState) : []
  const hasOrderByWarning = warnings.some((w) => w.includes('ORDER BY'))

  const fixOrderBy = () => {
    // Prefer the designated time column; fall back to first timestamp found
    const col = timeColumn ?? findFirstTimestampColumn(queryState)
    if (!col) return
    const already = orderBy.some(
      (o) => o.tableAlias === col.tableAlias && o.columnName === col.columnName
    )
    if (!already) {
      setOrderBy([...orderBy, { tableAlias: col.tableAlias, columnName: col.columnName, direction: 'ASC' }])
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold">What are you building?</p>
        <p className="text-[11px] text-muted-foreground">Select a panel type for validation hints.</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {PANEL_TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPanelType(panelType === value ? undefined : value)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
              panelType === value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-background text-muted-foreground border-border hover:border-blue-400 hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </div>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-700 leading-relaxed">• {w}</li>
            ))}
          </ul>
          {hasOrderByWarning && (
            <button
              onClick={fixOrderBy}
              className="text-[11px] text-amber-700 underline hover:text-amber-900"
            >
              Fix: add first timestamp column to ORDER BY
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Multi-series time-series query guide
// ---------------------------------------------------------------------------

function MultiSeriesGuide() {
  const panelType       = useQueryStore((s) => s.queryState.grafanaPanelType)
  const selectedColumns = useQueryStore((s) => s.queryState.selectedColumns)
  const tables          = useQueryStore((s) => s.queryState.tables)
  const timeColumn      = useQueryStore((s) => s.queryState.timeColumn)
  const [open, setOpen] = useState(false)

  if (panelType !== 'time-series') return null

  const getColType = (col: { tableAlias: string; columnName: string }) => {
    if (col.tableAlias === '__expr__' || col.tableAlias === '__grafana__') return undefined
    const table = tables.find((t) => t.alias === col.tableAlias)
    return table?.columns.find((c) => c.name === col.columnName)?.pgType
  }

  const hasTimeCol = selectedColumns.some((c) => {
    if (timeColumn && c.tableAlias === timeColumn.tableAlias && c.columnName === timeColumn.columnName) return true
    const t = getColType(c)
    return t ? isTimestampType(t) : false
  })

  const hasNumericCol = selectedColumns.some((c) => {
    const t = getColType(c)
    return t ? NUMERIC_TYPES.includes(t) : false
  })

  const hasSeriesCol = selectedColumns.some((c) => {
    const t = getColType(c)
    if (!t) return false
    return !isTimestampType(t) && !NUMERIC_TYPES.includes(t)
  })

  const allGood = hasTimeCol && hasNumericCol && hasSeriesCol

  const checks = [
    { label: 'Time column (timestamp)', ok: hasTimeCol },
    { label: 'Value column (numeric)',   ok: hasNumericCol },
    { label: 'Series label (text / categorical)', ok: hasSeriesCol },
  ]

  return (
    <div className="space-y-1.5 rounded border border-border/60 bg-muted/10 px-3 py-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-semibold"
      >
        <span>Multi-Series Structure</span>
        <span className="text-muted-foreground text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            For a multi-line Time Series panel, Grafana requires 3 column roles:
          </p>
          <div className="space-y-1">
            {checks.map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px]">
                <span className={ok ? 'text-green-600' : 'text-amber-500'}>{ok ? '✓' : '○'}</span>
                <span className={cn(ok ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
              </div>
            ))}
          </div>

          {allGood && (
            <p className="text-[11px] text-green-700 font-medium">
              Structure looks good for a multi-series panel.
            </p>
          )}

          <div className="rounded bg-muted/50 border px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground mb-1">
              Example — name the label column <code className="font-mono">metric</code>:
            </p>
            <pre className="text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">{`SELECT ae.time,
  i.time_run AS value,
  l.name AS metric
FROM agg a ...
ORDER BY ae.time`}</pre>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Grafana uses the non-time, non-numeric column as the series discriminator — one line per unique value.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variable mode toggle
// ---------------------------------------------------------------------------

function VariableModeToggle() {
  const isVariable           = useQueryStore((s) => s.queryState.isGrafanaVariable)
  const setIsGrafanaVariable = useQueryStore((s) => s.setIsGrafanaVariable)
  const selectedColumns      = useQueryStore((s) => s.queryState.selectedColumns)

  const hasValueCol = selectedColumns.some(
    (c) => c.alias === '__value' || c.columnName === '__value'
  )
  const hasTextCol = selectedColumns.some(
    (c) => c.alias === '__text' || c.columnName === '__text'
  )

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!isVariable}
          onChange={(e) => setIsGrafanaVariable(e.target.checked)}
        />
        <span className="text-xs font-medium">This query populates a Grafana dashboard variable</span>
      </label>
      {isVariable && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
          <p className="text-[11px] text-blue-700 font-medium">Variable query convention</p>
          <p className="text-[11px] text-blue-600 leading-relaxed">
            Alias your ID column as <code className="font-mono">__value</code> and your display
            column as <code className="font-mono">__text</code>. Grafana uses these to populate
            the variable selector.
          </p>
          {(!hasValueCol || !hasTextCol) && (
            <p className="text-[11px] text-amber-600 mt-1">
              {!hasValueCol && (
                <span>• Missing <code className="font-mono">__value</code> alias in SELECT.<br /></span>
              )}
              {!hasTextCol && (
                <span>• Missing <code className="font-mono">__text</code> alias in SELECT.</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function GrafanaPanel() {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-3">
        <ManualEditNotice />

        {/* Time axis designation */}
        <TimeAxisSection />

        {/* Panel intent */}
        <div className="border-t pt-4 space-y-3">
          <PanelTypeIntent />
          <MultiSeriesGuide />
        </div>

        {/* Variable mode */}
        <div className="border-t pt-4">
          <VariableModeToggle />
        </div>

        {/* timeGroup builder */}
        <div className="border-t pt-4 space-y-2">
          <div>
            <p className="text-xs font-semibold">$__timeGroup Builder</p>
            <p className="text-[11px] text-muted-foreground">
              Build a time-series GROUP BY bucket for Grafana panels.
            </p>
          </div>
          <TimeGroupBuilder />
        </div>

        <div className="border-t pt-4 space-y-2">
          <div>
            <p className="text-xs font-semibold">Macro Reference</p>
            <p className="text-[11px] text-muted-foreground">
              Click copy to paste into WHERE conditions, SELECT expressions, or anywhere in your query.
            </p>
          </div>
          <div className="space-y-1">
            {MACRO_REFS.map(({ macro, desc }) => (
              <div key={macro} className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
                <div className="flex items-start gap-1">
                  <code className="flex-1 text-[11px] font-mono text-blue-600 break-all">{macro}</code>
                  <CopyButton text={macro} />
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </ScrollArea>
  )
}
