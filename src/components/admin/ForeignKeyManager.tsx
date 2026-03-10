'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ArrowRight, RefreshCw } from 'lucide-react'
import type { AppTable, AppColumn } from '@/types/schema'
import type { ForeignKeyResponse } from '@/types/api'

interface Props {
  schemaId: number
  tables: (AppTable & { columns: AppColumn[] })[]
  onToast: (msg: string, variant?: 'success' | 'error') => void
}

export function ForeignKeyManager({ schemaId, tables, onToast }: Props) {
  const [fks, setFks] = useState<ForeignKeyResponse[]>([])
  const [loading, setLoading] = useState(true)

  // New FK form state
  const [fromTableId, setFromTableId] = useState<number | ''>('')
  const [fromColumnId, setFromColumnId] = useState<number | ''>('')
  const [toTableId, setToTableId] = useState<number | ''>('')
  const [toColumnId, setToColumnId] = useState<number | ''>('')
  const [constraintName, setConstraintName] = useState('')
  const [saving, setSaving] = useState(false)

  const fromTable = tables.find((t) => t.id === fromTableId)
  const toTable = tables.find((t) => t.id === toTableId)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.foreignKeys.list(schemaId)
      setFks(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [schemaId])

  // Auto-suggest a constraint name when both columns are selected
  useEffect(() => {
    if (fromTable && fromTable.columns.find((c) => c.id === fromColumnId) && toTable) {
      const fromCol = fromTable.columns.find((c) => c.id === fromColumnId)
      setConstraintName(`${fromTable.name}_${fromCol?.name}_fkey`)
    }
  }, [fromColumnId, toTableId])

  const handleAdd = async () => {
    if (!fromColumnId || !toColumnId) return
    setSaving(true)
    try {
      const fk = await api.foreignKeys.create({
        fromColumnId: fromColumnId as number,
        toColumnId: toColumnId as number,
        constraintName: constraintName || undefined,
      })
      onToast('Relationship added')
      // Reset form
      setFromTableId('')
      setFromColumnId('')
      setToTableId('')
      setToColumnId('')
      setConstraintName('')
      await load()
    } catch (e) {
      onToast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, label: string) => {
    if (!confirm(`Remove relationship "${label}"?`)) return
    try {
      await api.foreignKeys.delete(id)
      onToast('Relationship removed')
      await load()
    } catch (e) {
      onToast(String(e), 'error')
    }
  }

  const fkLabel = (fk: ForeignKeyResponse) => {
    const from = `${fk.fromColumn?.table?.name ?? '?'}.${fk.fromColumn?.name ?? '?'}`
    const to = `${fk.toColumn?.table?.name ?? '?'}.${fk.toColumn?.name ?? '?'}`
    return `${from} → ${to}`
  }

  const isRecursive = (fk: ForeignKeyResponse) =>
    fk.fromColumn?.table?.id === fk.toColumn?.table?.id

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Relationships</h2>
        <p className="text-sm text-muted-foreground">
          Define foreign key relationships between columns. Recursive relationships (a column referencing another column in the same table) are supported.
        </p>
      </div>

      {/* Existing FKs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Defined Relationships</Label>
          <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : fks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
            No relationships defined yet.
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden divide-y">
            {fks.map((fk) => (
              <div key={fk.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                {isRecursive(fk) && (
                  <span title="Recursive / self-referencing">
                    <RefreshCw className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  </span>
                )}
                <code className="flex-1 text-sm font-mono">
                  <span className="text-blue-600">{fk.fromColumn?.table?.name}</span>
                  <span className="text-muted-foreground">.</span>
                  <span>{fk.fromColumn?.name}</span>
                  <ArrowRight className="inline h-3.5 w-3.5 mx-2 text-muted-foreground" />
                  <span className="text-blue-600">{fk.toColumn?.table?.name}</span>
                  <span className="text-muted-foreground">.</span>
                  <span>{fk.toColumn?.name}</span>
                </code>
                {fk.constraintName && (
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {fk.constraintName}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleDelete(fk.id, fkLabel(fk))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new FK form */}
      <div className="space-y-4 rounded-md border p-4">
        <Label className="text-sm font-semibold">Add Relationship</Label>

        <div className="grid grid-cols-2 gap-4">
          {/* FROM */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</div>
            <div className="space-y-1">
              <Label className="text-xs">Table</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={fromTableId}
                onChange={(e) => {
                  setFromTableId(e.target.value === '' ? '' : Number(e.target.value))
                  setFromColumnId('')
                }}
              >
                <option value="">Select table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.displayName ?? t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background disabled:opacity-50"
                value={fromColumnId}
                onChange={(e) => setFromColumnId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!fromTable}
              >
                <option value="">Select column…</option>
                {fromTable?.columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.pgType})</option>
                ))}
              </select>
            </div>
          </div>

          {/* TO */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <ArrowRight className="h-3.5 w-3.5" /> To
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Table</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={toTableId}
                onChange={(e) => {
                  setToTableId(e.target.value === '' ? '' : Number(e.target.value))
                  setToColumnId('')
                }}
              >
                <option value="">Select table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName ?? t.name}
                    {t.id === fromTableId ? ' (same table — recursive)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background disabled:opacity-50"
                value={toColumnId}
                onChange={(e) => setToColumnId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!toTable}
              >
                <option value="">Select column…</option>
                {toTable?.columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.pgType})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Constraint Name <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            className="h-8 text-sm font-mono"
            value={constraintName}
            onChange={(e) => setConstraintName(e.target.value)}
            placeholder="e.g. orders_customer_id_fkey"
          />
        </div>

        <Button
          onClick={handleAdd}
          disabled={saving || !fromColumnId || !toColumnId}
          className="w-full"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {saving ? 'Adding…' : 'Add Relationship'}
        </Button>
      </div>
    </div>
  )
}
