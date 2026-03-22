'use client'
import { useState } from 'react'
import { z } from 'zod'
import { api } from '@/lib/api/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Copy, CheckCircle2 } from 'lucide-react'
import type { AppTable, AppColumn } from '@/types/schema'

// ── Helper SQL the admin runs in their DB client ──────────────────────────────

const HELPER_SQL = `SELECT json_build_object(
  'tables',
  COALESCE(json_agg(t ORDER BY t->>'schema', t->>'name'), '[]'::json)
)
FROM (
  SELECT json_build_object(
    'schema',      src.table_schema,
    'name',        src.table_name,
    'is_view',     src.is_view,
    'description', obj_description(pgc.oid, 'pg_class'),
    'columns', (
      SELECT COALESCE(json_agg(c_data ORDER BY (c_data->>'ordinal_position')::int), '[]'::json)
      FROM (
        SELECT json_build_object(
          'name',             c.column_name,
          'pg_type',          c.udt_name,
          'is_nullable',      (c.is_nullable = 'YES'),
          'is_primary_key',   EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema  = src.table_schema
              AND tc.table_name    = src.table_name
              AND kcu.column_name  = c.column_name
          ),
          'ordinal_position', c.ordinal_position,
          'default_value',    c.column_default,
          'description',      col_description(pgc.oid, c.ordinal_position::int)
        ) AS c_data
        FROM information_schema.columns c
        WHERE c.table_schema = src.table_schema
          AND c.table_name   = src.table_name
      ) cols
    )
  ) AS t
  FROM (
    SELECT table_schema, table_name, false AS is_view
      FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
    UNION ALL
    SELECT table_schema, table_name, true  AS is_view
      FROM information_schema.views
  ) src
  JOIN pg_class     pgc ON pgc.relname = src.table_name
  JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace
   AND pgn.nspname = src.table_schema
  WHERE src.table_schema NOT IN ('pg_catalog','information_schema')
    AND src.table_schema NOT LIKE 'pg_%'
) sub`

// ── Zod schema for the pasted JSON ───────────────────────────────────────────

const ImportColumnSchema = z.object({
  name: z.string().min(1),
  pg_type: z.string().min(1),
  is_nullable: z.boolean(),
  is_primary_key: z.boolean().default(false),
  ordinal_position: z.number().int(),
  default_value: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

const ImportTableSchema = z.object({
  schema: z.string().min(1),
  name: z.string().min(1),
  is_view: z.boolean().optional(),
  description: z.string().nullable().optional(),
  columns: z.array(ImportColumnSchema),
})

const ImportPayloadSchema = z.object({
  tables: z.array(ImportTableSchema),
})

type ImportTable = z.infer<typeof ImportTableSchema>

// ── Diff status computation ───────────────────────────────────────────────────

type DiffStatus = 'new' | 'changed' | 'unchanged'

interface TableDiffRow {
  key: string       // "schema.name"
  table: ImportTable
  status: DiffStatus
  newColCount: number
  changedColCount: number
}

function computeDiff(
  importTables: ImportTable[],
  existingTables: (AppTable & { columns?: AppColumn[] })[],
  existingColumns: Record<number, AppColumn[]>
): TableDiffRow[] {
  return importTables.map((t) => {
    const key = `${t.schema}.${t.name}`
    const existing = existingTables.find((et) => et.name === t.name)
    if (!existing) {
      return { key, table: t, status: 'new', newColCount: t.columns.length, changedColCount: 0 }
    }
    const existingCols = existingColumns[existing.id] ?? []
    const existingColMap = new Map(existingCols.map((c) => [c.name, c]))
    let newColCount = 0
    let changedColCount = 0
    for (const col of t.columns) {
      const ec = existingColMap.get(col.name)
      if (!ec) {
        newColCount++
      } else {
        const changed =
          ec.pgType !== col.pg_type ||
          ec.isNullable !== col.is_nullable ||
          ec.isPrimaryKey !== col.is_primary_key
        if (changed) changedColCount++
      }
    }
    const status: DiffStatus =
      newColCount > 0 || changedColCount > 0 || existing.description !== (t.description ?? null)
        ? 'changed'
        : 'unchanged'
    return { key, table: t, status, newColCount, changedColCount }
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  existingTables: (AppTable & { columns?: AppColumn[] })[]
  existingColumns: Record<number, AppColumn[]>
  onImported: () => void
  onToast: (msg: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SchemaImportDialog({
  open,
  onClose,
  existingTables,
  existingColumns,
  onImported,
  onToast,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [diffRows, setDiffRows] = useState<TableDiffRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [sqlCopied, setSqlCopied] = useState(false)

  const handleClose = () => {
    setStep(1)
    setJsonText('')
    setParseError(null)
    setDiffRows([])
    setSelected(new Set())
    onClose()
  }

  const handleParse = () => {
    setParseError(null)
    try {
      const raw = JSON.parse(jsonText)
      const result = ImportPayloadSchema.safeParse(raw)
      if (!result.success) {
        setParseError(`Invalid format: ${result.error.issues[0]?.message ?? 'unknown error'}`)
        return
      }
      const rows = computeDiff(result.data.tables, existingTables, existingColumns)
      setDiffRows(rows)
      // Default: select all new + changed
      setSelected(new Set(rows.filter((r) => r.status !== 'unchanged').map((r) => r.key)))
      setStep(2)
    } catch {
      setParseError('Invalid JSON — check that you copied the full query result.')
    }
  }

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(diffRows.map((r) => r.key)))
  const deselectAll = () => setSelected(new Set())

  const handleImport = async () => {
    setImporting(true)
    try {
      const result = ImportPayloadSchema.parse(JSON.parse(jsonText))
      const { added, updated, unchanged } = await api.schemaImport.apply({
        tables: result.tables,
        selectedKeys: Array.from(selected),
      })
      const parts: string[] = []
      if (added > 0) parts.push(`${added} added`)
      if (updated > 0) parts.push(`${updated} updated`)
      if (unchanged > 0) parts.push(`${unchanged} unchanged`)
      onToast(`Import complete: ${parts.join(', ')}`)
      onImported()
      handleClose()
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  const copySql = async () => {
    await navigator.clipboard.writeText(HELPER_SQL)
    setSqlCopied(true)
    setTimeout(() => setSqlCopied(false), 2000)
  }

  const newCount = diffRows.filter((r) => r.status === 'new' && selected.has(r.key)).length
  const changedCount = diffRows.filter((r) => r.status === 'changed' && selected.has(r.key)).length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Import Schema
            {step > 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Step {step} of 3
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Paste JSON */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  Run this query in your PostgreSQL client to generate the import JSON:
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={copySql}
                >
                  {sqlCopied ? (
                    <><CheckCircle2 className="h-3 w-3 text-green-600" /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy SQL</>
                  )}
                </Button>
              </div>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto max-h-24 leading-relaxed">
                {HELPER_SQL.split('\n').slice(0, 6).join('\n')}
                {'\n...'}
              </pre>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Paste the JSON result here</Label>
              <textarea
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono resize-y min-h-[140px] focus:outline-none focus:ring-1 focus:ring-ring"
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setParseError(null) }}
                placeholder='{"tables": [...]}'
                spellCheck={false}
              />
              {parseError && (
                <p className="text-xs text-destructive">{parseError}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Select tables */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {diffRows.length} table{diffRows.length !== 1 ? 's' : ''} found across{' '}
                {new Set(diffRows.map((r) => r.table.schema)).size} schema
                {new Set(diffRows.map((r) => r.table.schema)).size !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button className="text-xs text-blue-600 hover:underline" onClick={selectAll}>
                  Select all
                </button>
                <span className="text-xs text-muted-foreground">·</span>
                <button className="text-xs text-muted-foreground hover:underline" onClick={deselectAll}>
                  Deselect all
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b">
                  <tr>
                    <th className="w-8 px-2 py-1.5 text-left font-medium"></th>
                    <th className="px-2 py-1.5 text-left font-medium">Schema</th>
                    <th className="px-2 py-1.5 text-left font-medium">Table</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Columns</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {diffRows.map((row) => (
                    <tr
                      key={row.key}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => toggleRow(row.key)}
                    >
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={selected.has(row.key)}
                          onCheckedChange={() => toggleRow(row.key)}
                          className="h-3.5 w-3.5"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.table.schema}</td>
                      <td className="px-2 py-1.5 font-medium">
                        {row.table.name}
                        {row.table.is_view && (
                          <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1 text-[9px]">VIEW</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.status === 'new' && (
                          <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5 font-medium">New</span>
                        )}
                        {row.status === 'changed' && (
                          <span className="rounded bg-yellow-100 text-yellow-700 px-1.5 py-0.5 font-medium">
                            Changed
                          </span>
                        )}
                        {row.status === 'unchanged' && (
                          <span className="rounded bg-muted text-muted-foreground px-1.5 py-0.5">Unchanged</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.status === 'new' && `${row.table.columns.length} cols`}
                        {row.status === 'changed' && (
                          <>
                            {row.newColCount > 0 && (
                              <span className="text-green-700">+{row.newColCount} </span>
                            )}
                            {row.changedColCount > 0 && (
                              <span className="text-yellow-700">~{row.changedColCount} </span>
                            )}
                          </>
                        )}
                        {row.status === 'unchanged' && `${row.table.columns.length} cols`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">
                Ready to import {selected.size} table{selected.size !== 1 ? 's' : ''}
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                {newCount > 0 && <li>{newCount} new table{newCount !== 1 ? 's' : ''} will be created</li>}
                {changedCount > 0 && <li>{changedCount} existing table{changedCount !== 1 ? 's' : ''} will be updated</li>}
              </ul>
              <p className="text-xs text-muted-foreground">
                Existing tables not in this import are left unchanged. Existing columns are never deleted.
              </p>
            </div>
            {parseError && (
              <p className="text-xs text-destructive">{parseError}</p>
            )}
          </div>
        )}

        {/* Footer buttons */}
        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleParse} disabled={!jsonText.trim()}>
                Parse JSON →
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={() => setStep(3)} disabled={selected.size === 0}>
                Next → ({selected.size} selected)
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={handleImport} disabled={importing || selected.size === 0}>
                {importing ? 'Importing…' : `Import ${selected.size} table${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
