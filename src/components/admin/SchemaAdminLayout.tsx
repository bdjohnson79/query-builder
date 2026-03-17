'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { TableEditor } from './TableEditor'
import { ForeignKeyManager } from './ForeignKeyManager'
import { Plus, Database, Trash2, ChevronRight, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppSchema, AppTable, AppColumn } from '@/types/schema'

type RightView = 'table' | 'relationships'

function SchemaAdminInner() {
  const toast = useToast()
  const [schemas, setSchemas] = useState<AppSchema[]>([])
  const [tables, setTables] = useState<(AppTable & { columns: AppColumn[] })[]>([])
  const [selectedSchema, setSelectedSchema] = useState<AppSchema | null>(null)
  const [selectedTable, setSelectedTable] = useState<(AppTable & { columns: AppColumn[] }) | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [rightView, setRightView] = useState<RightView>('table')
  const [newSchemaName, setNewSchemaName] = useState('')
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadSchemas = async () => {
    const s = await api.schemas.list()
    setSchemas(s)
    if (s.length > 0 && !selectedSchema) setSelectedSchema(s[0])
  }

  const loadTables = async (schemaId: number) => {
    const t = await api.tables.list(schemaId)
    setTables(t as (AppTable & { columns: AppColumn[] })[])
  }

  useEffect(() => { loadSchemas() }, [])
  useEffect(() => {
    if (selectedSchema) loadTables(selectedSchema.id)
  }, [selectedSchema])

  const createSchema = async () => {
    if (!newSchemaName.trim()) return
    setCreating(true)
    try {
      const s = await api.schemas.create({ name: newSchemaName })
      setSchemas([...schemas, s])
      setSelectedSchema(s)
      setSchemaDialogOpen(false)
      setNewSchemaName('')
      toast(`Schema "${s.name}" created`)
    } finally {
      setCreating(false)
    }
  }

  const deleteSchema = async (id: number) => {
    if (!confirm('Delete this schema and all its tables?')) return
    await api.schemas.delete(id)
    const updated = schemas.filter((s) => s.id !== id)
    setSchemas(updated)
    if (selectedSchema?.id === id) {
      setSelectedSchema(updated[0] ?? null)
      setSelectedTable(null)
    }
    toast('Schema deleted')
  }

  const deleteTable = async (table: AppTable, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete table "${table.displayName ?? table.name}" and all its columns?`)) return
    await api.tables.delete(table.id)
    const updated = tables.filter((t) => t.id !== table.id)
    setTables(updated)
    if (selectedTable?.id === table.id) setSelectedTable(null)
    toast(`Table "${table.displayName ?? table.name}" deleted`)
  }

  const selectTable = (table: (AppTable & { columns: AppColumn[] }) | null) => {
    setSelectedTable(table)
    setRightView('table')
    setEditorKey((k) => k + 1)
  }

  const openRelationships = () => {
    setSelectedTable(null)
    setRightView('relationships')
  }

  const handleTableSaved = (tableName: string, isNew: boolean) => {
    if (selectedSchema) loadTables(selectedSchema.id)
    setSelectedTable(null)
    toast(isNew ? `Table "${tableName}" created` : `Table "${tableName}" saved`)
  }

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Database className="h-4 w-4 text-blue-600" />
          Schema Admin
        </div>
        <a href="/admin/json-structures" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors">
          JSON Structures
        </a>
        <a href="/builder" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors">
          ← Query Builder
        </a>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Schemas sidebar */}
        <div className="w-56 shrink-0 border-r bg-muted/20 p-3 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schemas</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSchemaDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {schemas.map((schema) => (
            <div
              key={schema.id}
              className={cn(
                'group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                selectedSchema?.id === schema.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onClick={() => { setSelectedSchema(schema); selectTable(null) }}
            >
              <span className="text-sm truncate">{schema.name}</span>
              <button
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => { e.stopPropagation(); deleteSchema(schema.id) }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
          {schemas.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No schemas yet.</p>
          )}
        </div>

        {/* Tables list + Relationships button */}
        <div className="w-64 shrink-0 border-r p-3 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tables {selectedSchema && `— ${selectedSchema.name}`}
            </span>
            {selectedSchema && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  selectTable({ id: 0, schemaId: selectedSchema.id, name: '', displayName: null, columns: [] })
                }
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {tables.map((table) => (
            <div
              key={table.id}
              className={cn(
                'group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                rightView === 'table' && selectedTable?.id === table.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onClick={() => selectTable(table)}
            >
              <span className="text-sm truncate">{table.displayName ?? table.name}</span>
              <button
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => deleteTable(table, e)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}

          {selectedSchema && tables.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No tables. Click + to add one.</p>
          )}
          {!selectedSchema && (
            <p className="text-xs text-muted-foreground text-center py-4">Select a schema first.</p>
          )}

          {/* Relationships entry */}
          {selectedSchema && tables.length > 0 && (
            <div className="pt-2 border-t mt-2">
              <button
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  rightView === 'relationships'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                )}
                onClick={openRelationships}
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Relationships
              </button>
            </div>
          )}
        </div>

        {/* Right pane: table editor or FK manager */}
        <div className="flex-1 overflow-y-auto p-4">
          {rightView === 'relationships' && selectedSchema ? (
            <ForeignKeyManager
              key={selectedSchema.id}
              schemaId={selectedSchema.id}
              tables={tables}
              onToast={toast}
            />
          ) : selectedTable ? (
            <TableEditor
              key={editorKey}
              table={selectedTable}
              schemaId={selectedSchema?.id ?? 0}
              onSaved={handleTableSaved}
              onCancel={() => selectTable(null)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select or create a table to edit
            </div>
          )}
        </div>
      </div>

      {/* Create Schema Dialog */}
      <Dialog open={schemaDialogOpen} onOpenChange={setSchemaDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Schema</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Schema Name</Label>
            <Input
              value={newSchemaName}
              onChange={(e) => setNewSchemaName(e.target.value)}
              placeholder="e.g. public"
              onKeyDown={(e) => e.key === 'Enter' && createSchema()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemaDialogOpen(false)}>Cancel</Button>
            <Button onClick={createSchema} disabled={creating || !newSchemaName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function SchemaAdminLayout() {
  return (
    <ToastProvider>
      <SchemaAdminInner />
    </ToastProvider>
  )
}
