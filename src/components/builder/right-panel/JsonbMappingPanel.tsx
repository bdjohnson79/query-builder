'use client'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'

export function JsonbMappingPanel() {
  const tables = useQueryStore((s) => s.queryState.tables)
  const jsonbMappings = useQueryStore((s) => s.queryState.jsonbMappings)
  const setJsonbMapping = useQueryStore((s) => s.setJsonbMapping)
  const clearJsonbMapping = useQueryStore((s) => s.clearJsonbMapping)
  const structures = useJsonStructureStore((s) => s.structures)

  // Collect all jsonb columns across all table instances
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
    <div className="p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Map each JSONB column to a structure to enable path extraction in SELECT and WHERE.
      </p>

      {jsonbColumns.map(({ tableAlias, tableName, columnName }) => {
        const mapping = jsonbMappings.find(
          (m) => m.tableAlias === tableAlias && m.columnName === columnName
        )
        return (
          <div key={`${tableAlias}.${columnName}`} className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium">
              <span className="text-muted-foreground">{tableName} / </span>
              <span className="font-mono">{tableAlias}.{columnName}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded border px-2 py-1 text-xs"
                value={mapping?.structureId ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  if (!val) {
                    clearJsonbMapping(tableAlias, columnName)
                  } else {
                    setJsonbMapping(tableAlias, columnName, Number(val))
                  }
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
