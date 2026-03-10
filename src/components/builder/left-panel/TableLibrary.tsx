'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSchemaStore } from '@/store/schemaStore'
import { DraggableTableCard } from './DraggableTableCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Search, Database } from 'lucide-react'
import type { AppSchema, AppTable, AppColumn } from '@/types/schema'

export function TableLibrary() {
  const setSchemas = useSchemaStore((s) => s.setSchemas)
  const setTables = useSchemaStore((s) => s.setTables)
  const setColumnsForTable = useSchemaStore((s) => s.setColumnsForTable)
  const schemas = useSchemaStore((s) => s.schemas)
  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const [schemasData, tablesData] = await Promise.all([
        api.schemas.list(),
        api.tables.list(),
      ])
      setSchemas(schemasData)
      setTables(tablesData.map(({ columns: _, ...t }) => t))
      for (const t of tablesData) {
        if (t.columns) setColumnsForTable(t.id, t.columns)
      }
    }
    load()
  }, [setSchemas, setTables, setColumnsForTable])

  const filtered = tables.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.displayName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const bySchema = schemas.map((schema) => ({
    schema,
    tables: filtered.filter((t) => t.schemaId === schema.id),
  }))

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tables..."
          className="pl-8 h-9 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {bySchema.map(({ schema, tables: schemaTables }) =>
            schemaTables.length === 0 ? null : (
              <div key={schema.id}>
                <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Database className="h-3 w-3" />
                  {schema.name}
                </div>
                <div className="space-y-1">
                  {schemaTables.map((table) => (
                    <DraggableTableCard
                      key={table.id}
                      table={table}
                      schema={schema}
                      columns={columns[table.id] ?? []}
                    />
                  ))}
                </div>
              </div>
            )
          )}
          {bySchema.every(({ tables: t }) => t.length === 0) && (
            <p className="text-center text-xs text-muted-foreground py-8">
              {tables.length === 0
                ? 'No tables defined. Go to Schema Admin to add tables.'
                : 'No tables match your search.'}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
