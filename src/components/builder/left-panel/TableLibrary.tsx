'use client'
import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api/client'
import { useSchemaStore } from '@/store/schemaStore'
import { useQueryStore } from '@/store/queryStore'
import { DraggableTableCard } from './DraggableTableCard'
import { DraggableCteCard } from './DraggableCteCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Database, Braces, Plus, X } from 'lucide-react'
import type { AppSchema, AppTable, AppColumn } from '@/types/schema'
import { WorkflowStepIndicator } from './WorkflowStepIndicator'

export function TableLibrary() {
  const setSchemas = useSchemaStore((s) => s.setSchemas)
  const setTables = useSchemaStore((s) => s.setTables)
  const setColumnsForTable = useSchemaStore((s) => s.setColumnsForTable)
  const schemas = useSchemaStore((s) => s.schemas)
  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const [search, setSearch] = useState('')
  const ctes = useQueryStore((s) => s.queryState.ctes)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const activeLateralJoinId = useQueryStore((s) => s.activeLateralJoinId)
  const tableCount = useQueryStore((s) => s.queryState.tables.length)
  const addLateralJoin = useQueryStore((s) => s.addLateralJoin)
  const [lateralFormOpen, setLateralFormOpen] = useState(false)
  const [lateralAlias, setLateralAlias] = useState('')
  const lateralInputRef = useRef<HTMLInputElement>(null)

  const submitLateral = () => {
    const alias = lateralAlias.trim() || 'lateral_sub'
    addLateralJoin(alias)
    setLateralAlias('')
    setLateralFormOpen(false)
  }

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

      <WorkflowStepIndicator />

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {/* Virtual Tables (CTEs) — only show when NOT editing a CTE */}
          {!activeCteId && ctes.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Braces className="h-3 w-3" />
                Virtual Tables (CTEs)
              </div>
              <div className="space-y-1">
                {ctes.map((cte) => (
                  <DraggableCteCard key={cte.id} cte={cte} />
                ))}
              </div>
            </div>
          )}

          {/* LATERAL Joins — only show when tables exist and not in CTE/LATERAL editing mode */}
          {tableCount > 0 && !activeCteId && !activeLateralJoinId && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="font-mono text-xs text-cyan-600">LATERAL</span>
                Subqueries
              </div>
              {!lateralFormOpen ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed"
                  onClick={() => { setLateralFormOpen(true); setTimeout(() => lateralInputRef.current?.focus(), 50) }}
                >
                  <Plus className="h-3 w-3" />
                  Add LATERAL subquery
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Input
                    ref={lateralInputRef}
                    className="h-7 text-xs font-mono"
                    placeholder="alias (e.g. lj)"
                    value={lateralAlias}
                    onChange={(e) => setLateralAlias(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitLateral()
                      if (e.key === 'Escape') { setLateralFormOpen(false); setLateralAlias('') }
                    }}
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={submitLateral}>Add</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setLateralFormOpen(false); setLateralAlias('') }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          )}

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
