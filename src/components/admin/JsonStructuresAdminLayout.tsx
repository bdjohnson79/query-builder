'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { JsonStructureEditor } from './JsonStructureEditor'
import { Plus, Braces, Trash2, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JsonStructure } from '@/types/json-structure'

function JsonStructuresAdminInner() {
  const toast = useToast()
  const [structures, setStructures] = useState<JsonStructure[]>([])
  const [selected, setSelected] = useState<JsonStructure | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const load = async () => {
    const rows = await api.jsonStructures.list()
    setStructures(rows as JsonStructure[])
  }

  useEffect(() => { load() }, [])

  const selectStructure = (s: JsonStructure) => {
    setSelected(s)
    setIsNew(false)
    setEditorKey((k) => k + 1)
  }

  const startNew = () => {
    setSelected(null)
    setIsNew(true)
    setEditorKey((k) => k + 1)
  }

  const handleSaved = (name: string, wasNew: boolean) => {
    load()
    setSelected(null)
    setIsNew(false)
    toast(wasNew ? `Structure "${name}" created` : `Structure "${name}" saved`)
  }

  const handleCancel = () => {
    setSelected(null)
    setIsNew(false)
  }

  const deleteStructure = async (s: JsonStructure, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete JSON structure "${s.name}"?`)) return
    await api.jsonStructures.delete(s.id)
    const updated = structures.filter((r) => r.id !== s.id)
    setStructures(updated)
    if (selected?.id === s.id) {
      setSelected(null)
      setIsNew(false)
    }
    toast(`Structure "${s.name}" deleted`)
  }

  const showEditor = isNew || selected !== null

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Braces className="h-4 w-4 text-blue-600" />
          JSON Structures
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/schema" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors">
            <Database className="h-3.5 w-3.5" />
            Schema Admin
          </a>
          <a href="/builder" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors">
            ← Query Builder
          </a>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Structures list sidebar */}
        <div className="w-64 shrink-0 border-r bg-muted/20 p-3 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Structures
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startNew}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {structures.map((s) => (
            <div
              key={s.id}
              className={cn(
                'group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                !isNew && selected?.id === s.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onClick={() => selectStructure(s)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{s.name}</p>
                {s.description && (
                  <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                )}
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 shrink-0 ml-1"
                onClick={(e) => deleteStructure(s, e)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}

          {structures.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No structures yet. Click + to add one.
            </p>
          )}
        </div>

        {/* Right pane: editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {showEditor ? (
            <JsonStructureEditor
              key={editorKey}
              structure={isNew ? null : selected}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select a structure to edit, or click + to create one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function JsonStructuresAdminLayout() {
  return (
    <ToastProvider>
      <JsonStructuresAdminInner />
    </ToastProvider>
  )
}
