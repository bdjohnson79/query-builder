'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown, ChevronUp, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JsonField } from '@/types/json-structure'
import type { JsonbExpansion, JsonbArrayUnnesting } from '@/types/query'
import {
  inferJsonStructure,
  flattenToPathOptions,
  suggestAlias,
} from '@/lib/json-structure/infer'
import { ST_ONE_AGG_INFO_IDS } from '@/lib/jsonb-presets/st-one-presets'

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
// Expand-as-record panel
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
  const jsonbExpansions      = useQueryStore((s) => s.queryState.jsonbExpansions)
  const applyJsonbExpansion  = useQueryStore((s) => s.applyJsonbExpansion)
  const removeJsonbExpansion = useQueryStore((s) => s.removeJsonbExpansion)
  const selectedColumns      = useQueryStore((s) => s.queryState.selectedColumns)

  const existing = jsonbExpansions.find(
    (e) => e.tableAlias === tableAlias && e.columnName === columnName
  )

  const allFields = getExpandFields(structureFields)
  const [expandAlias, setExpandAlias] = useState(
    existing?.expandAlias ?? defaultExpandAlias(columnName)
  )
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

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground shrink-0">Record alias:</span>
        <Input
          value={expandAlias}
          onChange={(e) => setExpandAlias(e.target.value)}
          className="h-6 text-xs font-mono w-20"
          placeholder="i"
        />
      </div>

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
        Checked fields are added to SELECT as{' '}
        <code className="font-mono">{expandAlias || 'alias'}.field</code>.
        The SQL will include <code className="font-mono">CROSS JOIN jsonb_to_record(...)</code>.
      </p>

      <Button size="sm" className="w-full h-7 text-xs" onClick={handleApply}>
        Apply
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Array unnesting section (shown in path extraction mode)
// ---------------------------------------------------------------------------

const DEFAULT_PG_TYPES = ['text', 'numeric', 'float8', 'integer', 'boolean', 'jsonb', 'timestamptz']

function ArrayUnnestSection({
  tableAlias,
  columnName,
  arrayFields,
}: {
  tableAlias: string
  columnName: string
  arrayFields: JsonField[]
}) {
  const unnestings              = useQueryStore((s) => s.queryState.jsonbArrayUnnestings ?? [])
  const addJsonbArrayUnnesting  = useQueryStore((s) => s.addJsonbArrayUnnesting)
  const removeJsonbArrayUnnesting = useQueryStore((s) => s.removeJsonbArrayUnnesting)

  // Which array field currently has the sub-form open
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [unnestAlias, setUnnestAlias] = useState('')
  const [mode, setMode] = useState<'elements' | 'recordset'>('elements')
  const [recordsetFields, setRecordsetFields] = useState<{ name: string; pgType: string }[]>([])

  if (arrayFields.length === 0) return null

  const openSubForm = (field: JsonField) => {
    setOpenFor(field.key)
    setUnnestAlias(field.key.charAt(0))
    setMode('elements')
    // Pre-populate from itemSchema if available
    const initialFields = (field.itemSchema ?? []).map((f) => ({
      name: f.key,
      pgType: f.pgCast ?? fieldToPgType(f),
    }))
    setRecordsetFields(initialFields)
  }

  const handleAdd = (arrayPath: string) => {
    if (!unnestAlias.trim()) return
    const u: JsonbArrayUnnesting = {
      id: crypto.randomUUID(),
      tableAlias,
      columnName,
      arrayPath,
      unnestAlias: unnestAlias.trim(),
      mode,
      recordsetFields: mode === 'recordset' ? recordsetFields : [],
    }
    addJsonbArrayUnnesting(u)
    setOpenFor(null)
  }

  const updateFieldPgType = (idx: number, pgType: string) => {
    setRecordsetFields((prev) => prev.map((f, i) => i === idx ? { ...f, pgType } : f))
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">Array fields</p>

      {/* Active unnesting badges */}
      {unnestings
        .filter((u) => u.tableAlias === tableAlias && u.columnName === columnName)
        .map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-1.5 rounded bg-violet-50 border border-violet-200 px-2 py-1"
          >
            <span className="text-[10px] text-violet-700 flex-1">
              <code className="font-mono">{u.arrayPath}</code>
              {' '}→{' '}
              <code className="font-mono">{u.unnestAlias}</code>
              {' '}({u.mode})
            </span>
            <button
              onClick={() => removeJsonbArrayUnnesting(u.id)}
              className="text-violet-400 hover:text-destructive"
              title="Remove unnesting"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

      {/* Per-array-field unnest buttons */}
      {arrayFields.map((field) => {
        const alreadyUnnested = unnestings.some(
          (u) =>
            u.tableAlias === tableAlias &&
            u.columnName === columnName &&
            u.arrayPath === field.key
        )

        return (
          <div key={field.key} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="flex-1 text-[10px] font-mono text-muted-foreground">{field.key}</span>
              <span className="text-[9px] text-muted-foreground">array</span>
              {!alreadyUnnested && (
                <button
                  onClick={() => openFor === field.key ? setOpenFor(null) : openSubForm(field)}
                  className="text-[10px] text-violet-600 hover:text-violet-800 font-medium"
                >
                  {openFor === field.key ? 'Cancel' : 'Unnest'}
                </button>
              )}
            </div>

            {openFor === field.key && (
              <div className="ml-2 space-y-2 rounded border border-violet-200 bg-violet-50/50 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground shrink-0">Alias:</span>
                  <Input
                    value={unnestAlias}
                    onChange={(e) => setUnnestAlias(e.target.value)}
                    className="h-6 text-xs font-mono w-20"
                    placeholder="f"
                  />
                </div>

                <div className="flex gap-3">
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <input
                      type="radio"
                      checked={mode === 'elements'}
                      onChange={() => setMode('elements')}
                      className="h-3 w-3"
                    />
                    Elements (jsonb)
                  </label>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <input
                      type="radio"
                      checked={mode === 'recordset'}
                      onChange={() => setMode('recordset')}
                      className="h-3 w-3"
                    />
                    Recordset (typed)
                  </label>
                </div>

                {mode === 'elements' && (
                  <p className="text-[9px] text-muted-foreground">
                    Reference elements as <code className="font-mono">{unnestAlias || 'f'}.value</code>{' '}
                    in expressions (jsonb type).
                  </p>
                )}

                {mode === 'recordset' && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-muted-foreground">Field types for the recordset:</p>
                    {recordsetFields.map((f, idx) => (
                      <div key={f.name} className="flex items-center gap-1">
                        <span className="font-mono text-[10px] flex-1">{f.name}</span>
                        <select
                          value={f.pgType}
                          onChange={(e) => updateFieldPgType(idx, e.target.value)}
                          className="rounded border px-1 py-0.5 text-[10px] bg-background"
                        >
                          {DEFAULT_PG_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {recordsetFields.length === 0 && (
                      <p className="text-[9px] text-amber-600">
                        No item schema defined — add field definitions in Admin → JSON Structures.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full h-6 text-[10px]"
                  variant="outline"
                  onClick={() => handleAdd(field.key)}
                  disabled={!unnestAlias.trim() || (mode === 'recordset' && recordsetFields.length === 0)}
                >
                  Add LATERAL JOIN
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline JSON path explorer
// ---------------------------------------------------------------------------

function InlinePathExplorer({
  tableAlias,
  columnName,
}: {
  tableAlias: string
  columnName: string
}) {
  const addColumn = useQueryStore((s) => s.addColumn)

  const [open, setOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pathOptions, setPathOptions] = useState<ReturnType<typeof flattenToPathOptions>>([])
  const [aliasOverrides, setAliasOverrides] = useState<Record<string, string>>({})

  const handleParse = () => {
    setError(null)
    setPathOptions([])
    setAliasOverrides({})
    if (!jsonText.trim()) return
    try {
      const parsed = JSON.parse(jsonText)
      const fields = inferJsonStructure(parsed)
      const options = flattenToPathOptions(fields, tableAlias, columnName)
      setPathOptions(options)
      const defaults: Record<string, string> = {}
      for (const opt of options) {
        defaults[opt.path] = suggestAlias(opt.path)
      }
      setAliasOverrides(defaults)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  const handleAdd = (pgExpression: string, path: string) => {
    const alias = aliasOverrides[path] ?? suggestAlias(path)
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: alias,
      alias,
      expression: pgExpression,
    })
  }

  return (
    <div className="border-t pt-2 mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Paste JSON sample to extract paths
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full rounded border bg-muted/20 p-1.5 text-[10px] font-mono resize-y min-h-[60px]"
            placeholder={'{ "shift": "morning", "prod_out": 120 }'}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full h-6 text-[10px]"
            onClick={handleParse}
          >
            Parse →
          </Button>

          {error && (
            <p className="text-[10px] text-destructive">{error}</p>
          )}

          {pathOptions.length > 0 && (
            <div className="space-y-1 rounded border bg-muted/20 p-1.5 max-h-48 overflow-y-auto">
              {pathOptions.map((opt) => (
                <div key={opt.path} className="flex items-center gap-1.5 text-[10px]">
                  <span className="flex-1 font-mono text-muted-foreground truncate" title={opt.pgExpression}>
                    {opt.label}
                  </span>
                  <Input
                    value={aliasOverrides[opt.path] ?? ''}
                    onChange={(e) =>
                      setAliasOverrides((prev) => ({ ...prev, [opt.path]: e.target.value }))
                    }
                    className="h-5 text-[10px] font-mono w-24"
                    placeholder="alias"
                  />
                  <button
                    onClick={() => handleAdd(opt.pgExpression, opt.path)}
                    className="text-[10px] text-primary hover:underline shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
  const addColumn         = useQueryStore((s) => s.addColumn)

  const builtinStructures = useJsonStructureStore((s) => s.builtinStructures)
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

  const handleAddSkuColumns = (tableAlias: string, columnName: string) => {
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: 'sku_code',
      alias: 'sku_code',
      expression: `${tableAlias}.${columnName}#>>'{sku,sku}'`,
    })
    addColumn({
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: 'sku_label',
      alias: 'sku_label',
      expression: `${tableAlias}.${columnName}#>>'{sku,label}'`,
    })
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

        // Look up structure in builtins first, then DB structures
        const allStructures = [...builtinStructures, ...structures]
        const structure = mapping
          ? allStructures.find((s) => s.id === mapping.structureId)
          : undefined

        const mode = getMode(colKey)
        const isSkuPreset = mapping && ST_ONE_AGG_INFO_IDS.has(mapping.structureId)

        // Array fields in the structure (for unnesting)
        const arrayFields = structure?.definition.fields.filter((f) => f.type === 'array') ?? []

        return (
          <div key={colKey} className="rounded-md border p-3 space-y-3">
            {/* Column label */}
            <div className="text-xs font-medium">
              <span className="text-muted-foreground">{tableName} / </span>
              <span className="font-mono">{tableAlias}.{columnName}</span>
            </div>

            {/* Structure selector with preset optgroups */}
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
                <optgroup label="ST-One presets">
                  {builtinStructures.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                {structures.length > 0 && (
                  <optgroup label="Custom structures">
                    {structures.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
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

            {/* SKU columns shortcut (agg_event.info presets only) */}
            {isSkuPreset && (
              <button
                onClick={() => handleAddSkuColumns(tableAlias, columnName)}
                className={cn(
                  'flex items-center gap-1.5 w-full rounded px-2 py-1',
                  'bg-amber-50 border border-amber-200 text-amber-700',
                  'text-[10px] font-medium hover:bg-amber-100 transition-colors'
                )}
              >
                <Zap className="h-3 w-3 shrink-0" />
                Quick add: SKU columns (sku_code, sku_label)
              </button>
            )}

            {/* Mode tabs + content (only shown when a structure is mapped) */}
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
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      Check individual paths directly in the table node on the canvas.
                      Each path appears in SELECT as a separate <code className="font-mono">#&gt;&gt;</code> expression.
                    </p>
                    {arrayFields.length > 0 && (
                      <ArrayUnnestSection
                        tableAlias={tableAlias}
                        columnName={columnName}
                        arrayFields={arrayFields}
                      />
                    )}
                  </div>
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

            {/* Inline path explorer — always visible */}
            <InlinePathExplorer tableAlias={tableAlias} columnName={columnName} />
          </div>
        )
      })}
    </div>
  )
}
