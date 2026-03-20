'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JsonField } from '@/types/json-structure'
import type { JsonbExpansion } from '@/types/query'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldToPgType(field: JsonField): string {
  if (field.pgCast) return field.pgCast
  switch (field.type) {
    case 'boolean': return 'boolean'
    case 'number':  return 'numeric'
    case 'object':  return 'jsonb'
    case 'array':   return 'jsonb'
    default:        return 'text'
  }
}

function getExpandFields(fields: JsonField[]): { name: string; pgType: string }[] {
  return fields.map((f) => ({ name: f.key, pgType: fieldToPgType(f) }))
}

function defaultExpandAlias(columnName: string): string {
  return columnName.charAt(0).toLowerCase() || 'x'
}

// ---------------------------------------------------------------------------
// Expand-as-record panel for a single JSONB column
// ---------------------------------------------------------------------------

function ExpandAsRecordPanel({
  tableAlias,
  columnName,
  structureFields,
}: {
  tableAlias: string
  columnName: string
  structureFields: JsonField[]
}) {
  const jsonbExpansions       = useQueryStore((s) => s.queryState.jsonbExpansions)
  const applyJsonbExpansion   = useQueryStore((s) => s.applyJsonbExpansion)
  const removeJsonbExpansion  = useQueryStore((s) => s.removeJsonbExpansion)
  const selectedColumns       = useQueryStore((s) => s.queryState.selectedColumns)

  const existing = jsonbExpansions.find(
    (e) => e.tableAlias === tableAlias && e.columnName === columnName
  )

  const allFields = getExpandFields(structureFields)
  const [expandAlias, setExpandAlias] = useState(
    existing?.expandAlias ?? defaultExpandAlias(columnName)
  )
  // Which fields are checked — defaults to whatever existing expansion selected
  const [checkedFields, setCheckedFields] = useState<Set<string>>(() => {
    if (!existing) return new Set()
    return new Set(
      selectedColumns
        .filter((c) => c.tableAlias === existing.expandAlias)
        .map((c) => c.columnName)
    )
  })

  const toggleField = (name: string) => {
    setCheckedFields((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleApply = () => {
    if (!expandAlias.trim()) return
    const exp: JsonbExpansion = {
      id: existing?.id ?? crypto.randomUUID(),
      tableAlias,
      columnName,
      expandAlias: expandAlias.trim(),
      fields: allFields,
    }
    applyJsonbExpansion(exp, Array.from(checkedFields))
  }

  const handleRemove = () => {
    if (existing) removeJsonbExpansion(existing.id)
    setCheckedFields(new Set())
  }

  return (
    <div className="space-y-2">
      {existing && (
        <div className="flex items-center gap-2 rounded bg-blue-50 border border-blue-200 px-2 py-1">
          <span className="text-[10px] text-blue-700 flex-1">
            CROSS JOIN active — alias <code className="font-mono">{existing.expandAlias}</code>
          </span>
          <button
            onClick={handleRemove}
            className="text-blue-400 hover:text-destructive"
            title="Remove expansion"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Record alias */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground shrink-0">Record alias:</span>
        <Input
          value={expandAlias}
          onChange={(e) => setExpandAlias(e.target.value)}
          className="h-6 text-xs font-mono w-20"
          placeholder="i"
        />
      </div>

      {/* Field list */}
      <div className="space-y-0.5 max-h-48 overflow-y-auto rounded border bg-muted/20 p-1.5">
        {allFields.map((f) => (
          <label
            key={f.name}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 hover:bg-muted/40 text-[10px]"
          >
            <Checkbox
              checked={checkedFields.has(f.name)}
              onCheckedChange={() => toggleField(f.name)}
              className="h-3 w-3"
            />
            <span className="flex-1 font-mono">{f.name}</span>
            <span className="text-muted-foreground">{f.pgType}</span>
          </label>
        ))}
        {allFields.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-2">
            No top-level fields in this structure.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Checked fields are added to SELECT as <code className="font-mono">{expandAlias || 'alias'}.field</code>.
        The SQL will include <code className="font-mono">CROSS JOIN jsonb_to_record(...)</code>.
      </p>

      <Button size="sm" className="w-full h-7 text-xs" onClick={handleApply}>
        Apply
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type Mode = 'path' | 'expand'

export function JsonbMappingPanel() {
  const tables            = useQueryStore((s) => s.queryState.tables)
  const jsonbMappings     = useQueryStore((s) => s.queryState.jsonbMappings)
  const setJsonbMapping   = useQueryStore((s) => s.setJsonbMapping)
  const clearJsonbMapping = useQueryStore((s) => s.clearJsonbMapping)
  const structures        = useJsonStructureStore((s) => s.structures)

  // Per-column mode state
  const [modes, setModes] = useState<Record<string, Mode>>({})

  const getMode = (key: string): Mode => modes[key] ?? 'path'
  const setMode = (key: string, mode: Mode) =>
    setModes((prev) => ({ ...prev, [key]: mode }))

  const jsonbColumns = tables.flatMap((t) =>
    t.columns
      .filter((c) => c.pgType === 'jsonb' || c.pgType === 'json')
      .map((c) => ({ tableAlias: t.alias, tableName: t.tableName, columnName: c.name }))
  )

  if (jsonbColumns.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        No JSONB columns on the canvas. Add a table that contains a <code>jsonb</code> column.
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4">
      <p className="text-xs text-muted-foreground">
        Map each JSONB column to a structure, then choose how to extract values.
      </p>

      {jsonbColumns.map(({ tableAlias, tableName, columnName }) => {
        const colKey = `${tableAlias}.${columnName}`
        const mapping = jsonbMappings.find(
          (m) => m.tableAlias === tableAlias && m.columnName === columnName
        )
        const structure = mapping ? structures.find((s) => s.id === mapping.structureId) : undefined
        const mode = getMode(colKey)

        return (
          <div key={colKey} className="rounded-md border p-3 space-y-3">
            {/* Column label */}
            <div className="text-xs font-medium">
              <span className="text-muted-foreground">{tableName} / </span>
              <span className="font-mono">{tableAlias}.{columnName}</span>
            </div>

            {/* Structure selector */}
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded border px-2 py-1 text-xs bg-background"
                value={mapping?.structureId ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  if (!val) clearJsonbMapping(tableAlias, columnName)
                  else setJsonbMapping(tableAlias, columnName, Number(val))
                }}
              >
                <option value="">— no structure —</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {mapping && (
                <button
                  className="text-xs text-destructive hover:underline shrink-0"
                  onClick={() => clearJsonbMapping(tableAlias, columnName)}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Mode tabs (only shown when a structure is mapped) */}
            {structure && (
              <div className="space-y-2">
                <div className="flex rounded-md border overflow-hidden text-[10px] font-medium">
                  <button
                    onClick={() => setMode(colKey, 'path')}
                    className={cn(
                      'flex-1 py-1 transition-colors',
                      mode === 'path'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Path extraction
                  </button>
                  <button
                    onClick={() => setMode(colKey, 'expand')}
                    className={cn(
                      'flex-1 py-1 transition-colors border-l',
                      mode === 'expand'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Expand as record
                  </button>
                </div>

                {mode === 'path' && (
                  <p className="text-[10px] text-muted-foreground">
                    Check individual paths directly in the table node on the canvas.
                    Each path appears in SELECT as a separate <code className="font-mono">#&gt;&gt;</code> expression.
                  </p>
                )}

                {mode === 'expand' && (
                  <ExpandAsRecordPanel
                    tableAlias={tableAlias}
                    columnName={columnName}
                    structureFields={structure.definition.fields}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      {structures.length === 0 && (
        <p className="text-xs text-amber-600">
          No JSON structures defined yet. Visit{' '}
          <a href="/admin/json-structures" className="underline">Admin → JSON Structures</a>{' '}
          to create one.
        </p>
      )}
    </div>
  )
}
