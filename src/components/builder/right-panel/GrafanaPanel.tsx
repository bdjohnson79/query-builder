'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Check, Plus } from 'lucide-react'

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
// $__timeGroup builder
// ---------------------------------------------------------------------------

const INTERVALS = [
  '1s', '10s', '30s', '1m', '5m', '10m', '15m', '30m',
  '1h', '3h', '6h', '12h', '1d', '7d', '30d',
]

function TimeGroupBuilder() {
  const tables = useQueryStore((s) => s.queryState.tables)
  const setGroupBy = useQueryStore((s) => s.setGroupBy)
  const groupBy = useQueryStore((s) => s.queryState.groupBy)

  const [column, setColumn] = useState('')
  const [interval, setInterval] = useState('1m')
  const [withAlias, setWithAlias] = useState(true)

  const allColumns = tables.flatMap((t) =>
    t.columns.map((c) => ({ label: `${t.alias}.${c.name}`, value: `${t.alias}.${c.name}` }))
  )

  const macro = withAlias
    ? `$__timeGroupAlias(${column || 'column'}, '${interval}')`
    : `$__timeGroup(${column || 'column'}, '${interval}')`

  const addToGroupBy = () => {
    if (!column) return
    const expr = `$__timeGroup(${column}, '${interval}')`
    // Store as a raw expression using a sentinel tableAlias
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
          {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
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
// Main panel
// ---------------------------------------------------------------------------

export function GrafanaPanel() {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-3">

        {/* timeGroup builder */}
        <div className="space-y-2">
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
