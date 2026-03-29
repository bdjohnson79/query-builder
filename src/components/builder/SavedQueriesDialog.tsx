'use client'
import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api/client'
import { useToast } from '@/components/ui/toast'
import { Search, Folder, FolderOpen, Tag, Upload, Copy, Trash2, Download, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SavedQuery, QueryFolder } from '@/types/schema'
import type { QueryState } from '@/types/query'

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (queryState: QueryState, name: string) => void
}

type FolderFilter = 'all' | 'templates' | 'none' | number
type SortMode = 'newest' | 'oldest' | 'name'

function formatDate(d: Date | string) {
  const date = new Date(d)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

export function SavedQueriesDialog({ open, onClose, onLoad }: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [queries, setQueries] = useState<SavedQuery[]>([])
  const [folders, setFolders] = useState<QueryFolder[]>([])
  const [search, setSearch] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [sort, setSort] = useState<SortMode>('newest')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSearch('')
    setSelectedFolder('all')
    setActiveTags([])
    Promise.all([api.queries.list(), api.folders.list()])
      .then(([q, f]) => { setQueries(q); setFolders(f) })
      .finally(() => setLoading(false))
  }, [open])

  // Client-side filter + sort
  const filtered = queries
    .filter((q) => {
      if (!search) return true
      const s = search.toLowerCase()
      return q.name.toLowerCase().includes(s) || (q.description ?? '').toLowerCase().includes(s)
    })
    .filter((q) => {
      if (selectedFolder === 'templates') return q.isTemplate
      if (selectedFolder === 'all') return !q.isTemplate
      if (selectedFolder === 'none') return !q.folderId && !q.isTemplate
      return q.folderId === selectedFolder && !q.isTemplate
    })
    .filter((q) => activeTags.every((t) => q.tags?.includes(t)))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  // Folder counts
  const countTemplates = queries.filter((q) => q.isTemplate).length
  const countAll = queries.filter((q) => !q.isTemplate).length
  const countNone = queries.filter((q) => !q.folderId && !q.isTemplate).length
  const countByFolder = (id: number) => queries.filter((q) => q.folderId === id && !q.isTemplate).length

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleLoad = (q: SavedQuery) => {
    onLoad(q.queryState as QueryState, q.name)
    onClose()
  }

  const handleDuplicate = async (q: SavedQuery) => {
    try {
      await api.queries.create({
        name: `Copy of ${q.name}`,
        description: q.description ?? undefined,
        queryState: q.queryState as QueryState,
        generatedSql: q.generatedSql ?? undefined,
        folderId: q.folderId,
        tags: q.tags,
      })
      const updated = await api.queries.list()
      setQueries(updated)
      toast(`Duplicated "${q.name}"`)
    } catch {
      toast('Failed to duplicate query')
    }
  }

  const handleExport = (q: SavedQuery) => {
    const folder = folders.find((f) => f.id === q.folderId)
    const payload = {
      version: 1,
      name: q.name,
      description: q.description,
      tags: q.tags,
      folderName: folder?.name ?? null,
      queryState: q.queryState,
      generatedSql: q.generatedSql,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${q.name.replace(/[^a-z0-9_-]/gi, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (q: SavedQuery) => {
    if (!confirm(`Delete "${q.name}"?`)) return
    try {
      await api.queries.delete(q.id)
      setQueries((prev) => prev.filter((x) => x.id !== q.id))
      toast(`Deleted "${q.name}"`)
    } catch {
      toast('Failed to delete query')
    }
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.queryState) {
          toast('Invalid file: missing queryState')
          return
        }
        onLoad(data.queryState as QueryState, data.name ?? 'Imported query')
        onClose()
        toast('Query imported from file')
      } catch {
        toast('Failed to parse JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle>Saved Queries</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — folder filter */}
          <div className="w-44 shrink-0 border-r p-2 space-y-0.5 overflow-y-auto">
            <FolderEntry
              label="Templates"
              count={countTemplates}
              active={selectedFolder === 'templates'}
              onClick={() => setSelectedFolder('templates')}
              icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            />
            <div className="my-1 border-t" />
            <FolderEntry
              label="All Queries"
              count={countAll}
              active={selectedFolder === 'all'}
              onClick={() => setSelectedFolder('all')}
              icon={<FolderOpen className="h-3.5 w-3.5 shrink-0" />}
            />
            {folders.map((f) => (
              <FolderEntry
                key={f.id}
                label={f.name}
                count={countByFolder(f.id)}
                active={selectedFolder === f.id}
                onClick={() => setSelectedFolder(f.id)}
                icon={<Folder className="h-3.5 w-3.5 shrink-0" />}
              />
            ))}
            {queries.some((q) => !q.folderId) && (
              <FolderEntry
                label="Unfoldered"
                count={countNone}
                active={selectedFolder === 'none'}
                onClick={() => setSelectedFolder('none')}
                icon={<Folder className="h-3.5 w-3.5 shrink-0 opacity-40" />}
              />
            )}
          </div>

          {/* Right pane */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search + sort bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search queries…"
                  className="pl-7 h-7 text-sm"
                />
              </div>
              <select
                className="h-7 rounded-md border bg-background px-2 text-sm text-foreground"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A→Z</option>
              </select>
            </div>

            {/* Active tag filter chips */}
            {activeTags.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b shrink-0">
                {activeTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                    <span className="font-bold">×</span>
                  </button>
                ))}
              </div>
            )}

            {/* Query list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No queries found.</p>
              ) : (
                filtered.map((q) => (
                  <QueryCard
                    key={q.id}
                    query={q}
                    folder={folders.find((f) => f.id === q.folderId)}
                    activeTags={activeTags}
                    onTagClick={toggleTag}
                    onLoad={() => handleLoad(q)}
                    onDuplicate={() => handleDuplicate(q)}
                    onExport={() => handleExport(q)}
                    onDelete={() => handleDelete(q)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t shrink-0 flex justify-between">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import JSON
            </Button>
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FolderEntry({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span className="truncate flex-1 text-left">{label}</span>
      <span className="text-[11px] shrink-0">{count}</span>
    </button>
  )
}

function QueryCard({
  query,
  folder,
  activeTags,
  onTagClick,
  onLoad,
  onDuplicate,
  onExport,
  onDelete,
}: {
  query: SavedQuery
  folder: QueryFolder | undefined
  activeTags: string[]
  onTagClick: (tag: string) => void
  onLoad: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="group border-b px-3 py-2.5 hover:bg-muted/30 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-medium text-sm truncate">{query.name}</div>
            {query.isTemplate && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shrink-0">
                <Sparkles className="h-2.5 w-2.5" />
                Template
              </span>
            )}
          </div>
          {query.description && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{query.description}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {folder && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Folder className="h-2.5 w-2.5" />
                {folder.name}
              </span>
            )}
            {query.tags?.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className={cn(
                  'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] transition-colors',
                  activeTags.includes(tag)
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-700'
                )}
              >
                <Tag className="h-2 w-2" />
                {tag}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
              {formatDate(query.createdAt)}
            </span>
          </div>
        </div>

        <div className={cn(
          'flex items-center gap-1 shrink-0 transition-opacity',
          hovered ? 'opacity-100' : 'opacity-0'
        )}>
          <Button size="sm" className="h-6 px-2 text-xs" onClick={onLoad}>
            {query.isTemplate ? 'Use' : 'Load'}
          </Button>
          {!query.isTemplate && (
            <button
              onClick={onDuplicate}
              title="Duplicate"
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {!query.isTemplate && (
            <button
              onClick={onExport}
              title="Export JSON"
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          {!query.isTemplate && (
            <button
              onClick={onDelete}
              title="Delete"
              className="rounded p-1 hover:bg-muted text-destructive hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
