'use client'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { X, Plus, Trash2, Save } from 'lucide-react'
import type { AppTable, AppColumn } from '@/types/schema'

const PG_TYPES = [
  'text', 'integer', 'bigint', 'smallint', 'boolean', 'numeric', 'decimal',
  'real', 'double precision', 'date', 'timestamp', 'timestamptz', 'uuid',
  'jsonb', 'json', 'bytea', 'varchar', 'char', 'serial', 'bigserial',
]

interface Props {
  table: AppTable & { columns: AppColumn[] }
  schemaId: number
  onSaved: (tableName: string, isNew: boolean) => void
  onCancel: () => void
}

export function TableEditor({ table, schemaId, onSaved, onCancel }: Props) {
  const isNew = table.id === 0
  const [name, setName] = useState(table.name)
  const [displayName, setDisplayName] = useState(table.displayName ?? '')
  const [columns, setColumns] = useState<Omit<AppColumn, 'id' | 'tableId'>[]>(
    table.columns.map(({ id: _, tableId: __, ...c }) => c)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addColumn = () => {
    setColumns([
      ...columns,
      {
        name: '',
        pgType: 'text',
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        ordinalPosition: columns.length,
      },
    ])
  }

  const updateColumn = (idx: number, updates: Partial<Omit<AppColumn, 'id' | 'tableId'>>) => {
    setColumns(columns.map((c, i) => (i === idx ? { ...c, ...updates } : c)))
  }

  const removeColumn = (idx: number) => {
    setColumns(columns.filter((_, i) => i !== idx))
  }

  const save = async () => {
    if (!name.trim()) return setError('Table name is required')
    setSaving(true)
    setError(null)
    try {
      let tableId = table.id
      if (isNew) {
        const created = await api.tables.create({
          schemaId,
          name,
          displayName: displayName || undefined,
        })
        tableId = created.id
      } else {
        await api.tables.update(table.id, {
          name,
          displayName: displayName || undefined,
        })
        // Delete all existing columns and re-create (simple approach for MVP)
        for (const col of table.columns) {
          await api.columns.delete(table.id, col.id)
        }
      }
      // Create columns
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        if (!col.name.trim()) continue
        await api.columns.create(tableId, {
          ...col,
          ordinalPosition: i,
          defaultValue: col.defaultValue ?? undefined,
        })
      }
      onSaved(name, isNew)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isNew ? 'New Table' : `Edit: ${table.name}`}</h2>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Table Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="orders" />
        </div>
        <div className="space-y-1">
          <Label>Display Name (optional)</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Orders" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Columns</Label>
          <Button variant="outline" size="sm" onClick={addColumn}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Column
          </Button>
        </div>

        {columns.length > 0 && (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-xs">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">Default</th>
                  <th className="px-3 py-2 text-center font-medium text-xs">Nullable</th>
                  <th className="px-3 py-2 text-center font-medium text-xs">PK</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {columns.map((col, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5">
                      <Input
                        className="h-7 text-xs"
                        value={col.name}
                        onChange={(e) => updateColumn(idx, { name: e.target.value })}
                        placeholder="column_name"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        className="w-full rounded border px-2 py-1 text-xs"
                        value={col.pgType}
                        onChange={(e) => updateColumn(idx, { pgType: e.target.value })}
                      >
                        {PG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        className="h-7 text-xs"
                        value={col.defaultValue ?? ''}
                        onChange={(e) => updateColumn(idx, { defaultValue: e.target.value || null })}
                        placeholder="NULL"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Checkbox
                        checked={col.isNullable}
                        onCheckedChange={(v) => updateColumn(idx, { isNullable: Boolean(v) })}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Checkbox
                        checked={col.isPrimaryKey}
                        onCheckedChange={(v) => updateColumn(idx, { isPrimaryKey: Boolean(v) })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeColumn(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {columns.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4 border rounded-md border-dashed">
            No columns yet. Click "Add Column" to start.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? 'Saving…' : isNew ? 'Create Table' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
