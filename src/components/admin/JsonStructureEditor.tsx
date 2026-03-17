'use client'
import { useState, useRef } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { X, Save, Plus, Trash2, ChevronRight, ChevronDown, Upload } from 'lucide-react'
import type { JsonStructure, JsonField, JsonFieldType } from '@/types/json-structure'
import { inferJsonStructure } from '@/lib/json-structure/infer'

const FIELD_TYPES: JsonFieldType[] = ['string', 'number', 'boolean', 'object', 'array']
const PG_CASTS = ['', 'numeric', 'integer', 'bigint', 'float8', 'boolean', 'text']

interface Props {
  structure: JsonStructure | null
  onSaved: (name: string, isNew: boolean) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Recursive field row
// ---------------------------------------------------------------------------

interface FieldRowProps {
  field: JsonField
  depth: number
  onChange: (updated: JsonField) => void
  onRemove: () => void
}

function JsonFieldRow({ field, depth, onChange, onRemove }: FieldRowProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren =
    (field.type === 'object' && field.children && field.children.length > 0) ||
    (field.type === 'array' && field.itemSchema && field.itemSchema.length > 0)

  const updateChild = (idx: number, updated: JsonField) => {
    if (field.type === 'object') {
      onChange({ ...field, children: (field.children ?? []).map((c, i) => (i === idx ? updated : c)) })
    } else if (field.type === 'array') {
      onChange({ ...field, itemSchema: (field.itemSchema ?? []).map((c, i) => (i === idx ? updated : c)) })
    }
  }

  const removeChild = (idx: number) => {
    if (field.type === 'object') {
      onChange({ ...field, children: (field.children ?? []).filter((_, i) => i !== idx) })
    } else if (field.type === 'array') {
      onChange({ ...field, itemSchema: (field.itemSchema ?? []).filter((_, i) => i !== idx) })
    }
  }

  const addChild = () => {
    const newChild: JsonField = { key: '', type: 'string' }
    if (field.type === 'object') {
      onChange({ ...field, children: [...(field.children ?? []), newChild] })
    } else if (field.type === 'array') {
      onChange({ ...field, itemSchema: [...(field.itemSchema ?? []), newChild] })
    }
    setExpanded(true)
  }

  const childFields =
    field.type === 'object' ? (field.children ?? []) :
    field.type === 'array' ? (field.itemSchema ?? []) : []

  const isLeaf = field.type !== 'object' && field.type !== 'array'

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 rounded hover:bg-muted/30"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {/* Expand toggle */}
        <button
          type="button"
          className="shrink-0 w-4 h-4 text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
          disabled={!hasChildren && field.type !== 'object' && field.type !== 'array'}
        >
          {(field.type === 'object' || field.type === 'array') ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : <span className="inline-block w-3.5" />}
        </button>

        {/* Key name */}
        <Input
          className="h-7 text-xs w-36 shrink-0"
          value={field.key}
          onChange={(e) => onChange({ ...field, key: e.target.value })}
          placeholder="field_name"
        />

        {/* Type selector */}
        <select
          className="rounded border px-2 py-1 text-xs h-7"
          value={field.type}
          onChange={(e) => {
            const t = e.target.value as JsonFieldType
            const updated: JsonField = { key: field.key, type: t }
            if (t === 'object') updated.children = []
            if (t === 'array') updated.itemSchema = []
            onChange(updated)
          }}
        >
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Cast (only for leaf scalar types) */}
        {isLeaf && (
          <select
            className="rounded border px-2 py-1 text-xs h-7"
            value={field.pgCast ?? ''}
            onChange={(e) => onChange({ ...field, pgCast: e.target.value || undefined })}
            title="PostgreSQL type cast"
          >
            {PG_CASTS.map((c) => (
              <option key={c} value={c}>{c || '(no cast)'}</option>
            ))}
          </select>
        )}

        {/* Add child button (object/array) */}
        {(field.type === 'object' || field.type === 'array') && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addChild} title="Add child field">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Array badge */}
        {field.type === 'array' && (
          <span className="text-[10px] text-muted-foreground italic">item schema</span>
        )}

        {/* Remove */}
        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {/* Children */}
      {expanded && childFields.map((child, idx) => (
        <JsonFieldRow
          key={idx}
          field={child}
          depth={depth + 1}
          onChange={(updated) => updateChild(idx, updated)}
          onRemove={() => removeChild(idx)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function JsonStructureEditor({ structure, onSaved, onCancel }: Props) {
  const isNew = structure === null || structure.id === 0
  const [name, setName] = useState(structure?.name ?? '')
  const [description, setDescription] = useState(structure?.description ?? '')
  const [fields, setFields] = useState<JsonField[]>(structure?.definition?.fields ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tree' | 'upload'>('tree')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateField = (idx: number, updated: JsonField) => {
    setFields(fields.map((f, i) => (i === idx ? updated : f)))
  }

  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx))
  }

  const addTopField = () => {
    setFields([...fields, { key: '', type: 'string' }])
  }

  const handleFileUpload = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploadError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        const inferred = inferJsonStructure(parsed)
        if (inferred.length === 0) {
          setUploadError('No fields could be inferred from the uploaded file. Make sure it is a JSON object.')
          return
        }
        setFields(inferred)
        setActiveTab('tree')
      } catch {
        setUploadError('Invalid JSON file. Please upload a valid .json file.')
      }
    }
    reader.readAsText(file)
  }

  const save = async () => {
    if (!name.trim()) return setError('Structure name is required')
    setSaving(true)
    setError(null)
    try {
      const definition = { fields }
      if (isNew) {
        await api.jsonStructures.create({
          name: name.trim(),
          description: description.trim() || undefined,
          definition,
        })
      } else {
        await api.jsonStructures.update(structure!.id, {
          name: name.trim(),
          description: description.trim() || null,
          definition,
        })
      }
      onSaved(name.trim(), isNew)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isNew ? 'New JSON Structure' : `Edit: ${structure!.name}`}
        </h2>
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
          <Label>Structure Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. machine_config"
          />
        </div>
        <div className="space-y-1">
          <Label>Description (optional)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tree' | 'upload')}>
        <TabsList>
          <TabsTrigger value="tree">Tree Editor</TabsTrigger>
          <TabsTrigger value="upload">JSON Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="tree">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fields</Label>
              <Button variant="outline" size="sm" onClick={addTopField}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Field
              </Button>
            </div>
            <div className="rounded-md border min-h-[120px]">
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No fields yet. Click "Add Field" or upload a JSON file.
                </p>
              ) : (
                <div className="py-1">
                  {fields.map((field, idx) => (
                    <JsonFieldRow
                      key={idx}
                      field={field}
                      depth={0}
                      onChange={(updated) => updateField(idx, updated)}
                      onRemove={() => removeField(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Set a <strong>Cast</strong> on numeric fields (e.g. <code>numeric</code>) to enable numeric comparisons in WHERE clauses.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="upload">
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a sample JSON file to auto-infer the structure. The result will replace the current tree editor contents.
            </p>
            {uploadError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {uploadError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleFileUpload}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                Parse
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? 'Saving…' : isNew ? 'Create Structure' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
