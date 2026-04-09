'use client'
import { useState, useEffect, useRef } from 'react'
import { DndContext, DragOverlay, useDndContext } from '@dnd-kit/core'
import { TableLibrary } from './left-panel/TableLibrary'
import { QueryCanvas } from './canvas/QueryCanvas'
import { RightPanel } from './right-panel/RightPanel'
import { OnboardingOverlay, ONBOARDING_STORAGE_KEY } from './OnboardingOverlay'
import { TemplateLibrary } from './TemplateLibrary'
import { SavedQueriesDialog } from './SavedQueriesDialog'
import { ImportSqlDialog } from './ImportSqlDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToastProvider } from '@/components/ui/toast'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import { api } from '@/lib/api/client'
import { Save, FolderOpen, RotateCcw, Database, Copy, HelpCircle, LayoutTemplate, ArrowLeft, Tag, X, FileDown, FileUp, ChevronsLeft, ChevronsRight, FileCode } from 'lucide-react'
import { usePanelResize } from '@/hooks/usePanelResize'
import { UnionPartSwitcher } from './UnionPartSwitcher'
import type { QueryState } from '@/types/query'
import type { QueryFolder, SavedQuery } from '@/types/schema'

function TableDragOverlay() {
  const { active } = useDndContext()
  if (!active) return null

  const type = active.data.current?.type
  const name = type === 'table'
    ? (active.data.current?.table?.displayName ?? active.data.current?.table?.name)
    : type === 'cte'
    ? active.data.current?.cte?.name
    : null

  if (!name) return null

  const isCte = type === 'cte'
  return (
    <div className={`pointer-events-none min-w-[140px] rounded border-2 border-dashed px-3 py-1.5 text-sm font-medium shadow-lg opacity-90 ${isCte ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-teal-400 bg-teal-50 text-teal-700'}`}>
      {name}
    </div>
  )
}

export function BuilderLayout() {
  return (
    <ToastProvider>
      <BuilderLayoutInner />
    </ToastProvider>
  )
}

function BuilderLayoutInner() {
  const queryState = useQueryStore((s) => s.queryState)
  const generatedSql = useQueryStore((s) => s.generatedSql)
  const userEditedSql = useQueryStore((s) => s.userEditedSql)
  const loadQueryState = useQueryStore((s) => s.loadQueryState)
  const resetQuery = useQueryStore((s) => s.resetQuery)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const stopEditingCte = useQueryStore((s) => s.stopEditingCte)
  const activeCte = activeCteId ? queryState.ctes.find((c) => c.id === activeCteId) : null

  const activeQueryPart = useQueryStore((s) => s.activeQueryPart)
  const activeLateralJoinId = useQueryStore((s) => s.activeLateralJoinId)
  const stopEditingLateralJoin = useQueryStore((s) => s.stopEditingLateralJoin)
  const activeLateralJoin = activeLateralJoinId
    ? (queryState.joins.find((j) => j.id === activeLateralJoinId) ??
       queryState.unionQuery?.queryState.joins.find((j) => j.id === activeLateralJoinId))
    : null

  const loadStructures = useJsonStructureStore((s) => s.loadStructures)
  useEffect(() => { loadStructures() }, [loadStructures])

  const {
    leftWidth, rightWidth,
    leftVisible, rightVisible,
    isDragging,
    onLeftDividerMouseDown, onRightDividerMouseDown,
    toggleLeft, toggleRight,
  } = usePanelResize()

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [importSqlOpen, setImportSqlOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setOnboardingOpen(true)
    }
  }, [])

  // ── Save dialog ─────────────────────────────────────────────
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saveFolderId, setSaveFolderId] = useState<number | null>(null)
  const [saveTagsInput, setSaveTagsInput] = useState('')
  const [saveTags, setSaveTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [allQueries, setAllQueries] = useState<SavedQuery[]>([])
  const [folders, setFolders] = useState<QueryFolder[]>([])
  const [overwriteTarget, setOverwriteTarget] = useState<SavedQuery | null>(null)
  const [doOverwrite, setDoOverwrite] = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const openSaveDialog = async () => {
    setSaveName('')
    setSaveDesc('')
    setSaveFolderId(null)
    setSaveTags([])
    setSaveTagsInput('')
    setOverwriteTarget(null)
    setDoOverwrite(false)
    setNewFolderInput('')
    const [queries, foldersData] = await Promise.all([api.queries.list(), api.folders.list()])
    setAllQueries(queries)
    setFolders(foldersData)
    setSaveDialogOpen(true)
  }

  const handleSaveNameChange = (name: string) => {
    setSaveName(name)
    const match = allQueries.find((q) => q.name.trim().toLowerCase() === name.trim().toLowerCase())
    setOverwriteTarget(match ?? null)
    if (!match) setDoOverwrite(false)
  }

  const handleTagsInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const tag = saveTagsInput.trim().replace(/,$/, '')
      if (tag && !saveTags.includes(tag)) {
        setSaveTags((prev) => [...prev, tag])
      }
      setSaveTagsInput('')
    }
  }

  const removeTag = (tag: string) => setSaveTags((prev) => prev.filter((t) => t !== tag))

  const handleCreateFolder = async () => {
    const name = newFolderInput.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      const folder = await api.folders.create({ name })
      setFolders((prev) => [...prev, folder])
      setSaveFolderId(folder.id)
      setNewFolderInput('')
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: saveName,
        description: saveDesc || undefined,
        queryState,
        generatedSql,
        folderId: saveFolderId,
        tags: saveTags.length > 0 ? saveTags : null,
      }
      if (doOverwrite && overwriteTarget) {
        await api.queries.update(overwriteTarget.id, payload)
      } else {
        await api.queries.create(payload)
      }
      setSaveDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Saved Queries dialog ─────────────────────────────────────
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false)

  const handleLoad = (qs: QueryState) => {
    loadQueryState(qs)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(userEditedSql ?? generatedSql)
  }

  // ── File save / load ─────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveToFile = () => {
    const payload = { version: 1, queryState, generatedSql }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.queryState) { alert('Invalid file: missing queryState'); return }
        loadQueryState(data.queryState as QueryState)
      } catch {
        alert('Failed to parse JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* NavBar */}
      <nav className="flex h-12 shrink-0 items-center justify-between border-b border-[#14b8c4]/20 bg-[#0d3d40] px-4">
        <div className="flex items-center gap-2 font-semibold text-sm text-white">
          <Database className="h-4 w-4 text-[#14b8c4]" />
          SQL Query Builder
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/schema" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            Schema Admin
          </a>
          <a href="/help" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            Help
          </a>
          <Button variant="outline" size="sm" onClick={() => setSavedQueriesOpen(true)} className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            Load
          </Button>
          <Button variant="outline" size="sm" onClick={openSaveDialog} className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveToFile} title="Save query to a local JSON file" className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <FileDown className="mr-1 h-3.5 w-3.5" />
            Save to File
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} title="Load query from a local JSON file" className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <FileUp className="mr-1 h-3.5 w-3.5" />
            Load from File
          </Button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleLoadFromFile} />
          <Button variant="outline" size="sm" onClick={() => setImportSqlOpen(true)} title="Import a SELECT query from Grafana" className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <FileCode className="mr-1 h-3.5 w-3.5" />
            Import SQL
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="border-white/20 bg-transparent text-white/75 hover:bg-white/10 hover:border-white/30 hover:text-white">
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy SQL
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)} className="text-white/60 hover:bg-white/10 hover:text-white">
            <LayoutTemplate className="mr-1 h-3.5 w-3.5" />
            Templates
          </Button>
          <Button variant="ghost" size="sm" onClick={resetQuery} className="text-white/60 hover:bg-white/10 hover:text-white">
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOnboardingOpen(true)}
            title="Take the tour"
            className="text-white/60 hover:bg-white/10 hover:text-white"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </nav>

      {/* UNION part switcher */}
      <UnionPartSwitcher />

      {/* Three-column layout */}
      <DndContext>
        <DragOverlay dropAnimation={null}><TableDragOverlay /></DragOverlay>
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel */}
          <div
            className="shrink-0 overflow-hidden border-r bg-background"
            style={{ width: leftWidth, transition: isDragging ? 'none' : 'width 150ms ease' }}
          >
            <TableLibrary />
          </div>

          {/* Left divider + toggle */}
          <div className="relative z-10 flex-none select-none" style={{ width: 8 }}>
            {leftVisible && (
              <div
                className="absolute inset-y-0 left-0 w-1 cursor-col-resize hover:bg-teal-300 active:bg-teal-400 transition-colors"
                onMouseDown={onLeftDividerMouseDown}
              />
            )}
            <button
              className="absolute top-1/2 -translate-y-1/2 left-0 z-20 flex h-8 w-4 items-center justify-center rounded-r border border-l-0 bg-background text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm"
              onClick={toggleLeft}
              title={leftVisible ? 'Hide table library' : 'Show table library'}
            >
              {leftVisible ? <ChevronsLeft className="h-3 w-3" /> : <ChevronsRight className="h-3 w-3" />}
            </button>
          </div>

          {/* Canvas column */}
          <div className="relative flex flex-col flex-1 overflow-hidden min-w-0">
            {/* CTE editing banner */}
            {activeCte && (
              <div className="flex shrink-0 items-center gap-3 border-b border-teal-100 bg-teal-50 px-3 py-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1 text-teal-700 hover:bg-teal-100 hover:text-teal-900"
                  onClick={stopEditingCte}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Main query
                </Button>
                <span className="text-xs text-teal-700">
                  Editing CTE: <span className="font-semibold">{activeCte.name}</span>
                </span>
                {activeCte.rawSql !== undefined && activeCte.rawSql !== null && (
                  <span className="rounded bg-purple-100 text-purple-700 px-1 py-0.5 text-xs">
                    Raw SQL mode — canvas inactive
                  </span>
                )}
              </div>
            )}

            {/* LATERAL editing banner */}
            {activeLateralJoin && !activeCte && (
              <div className="flex shrink-0 items-center gap-3 border-b border-cyan-100 bg-cyan-50 px-3 py-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-900"
                  onClick={stopEditingLateralJoin}
                >
                  <ArrowLeft className="h-3 w-3" />
                  {activeQueryPart === 'union' ? 'Part 2' : 'Main query'}
                </Button>
                <span className="text-xs text-cyan-700">
                  Editing LATERAL subquery: <span className="font-semibold">{activeLateralJoin.lateralAlias ?? 'lateral_sub'}</span>
                </span>
              </div>
            )}

            {/* Canvas with optional ring overlay for editing modes */}
            <div className={`relative flex-1 overflow-hidden${
              activeCte ? ' ring-2 ring-teal-400 ring-inset' :
              activeLateralJoin ? ' ring-2 ring-cyan-400 ring-inset' :
              activeQueryPart === 'union' ? ' ring-2 ring-green-400 ring-inset' : ''
            }`}>
              <QueryCanvas onStartTour={() => setOnboardingOpen(true)} />
            </div>
          </div>

          {/* Right divider + toggle */}
          <div className="relative z-10 flex-none select-none" style={{ width: 8 }}>
            {rightVisible && (
              <div
                className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-teal-300 active:bg-teal-400 transition-colors"
                onMouseDown={onRightDividerMouseDown}
              />
            )}
            <button
              className="absolute top-1/2 -translate-y-1/2 right-0 z-20 flex h-8 w-4 items-center justify-center rounded-l border border-r-0 bg-background text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm"
              onClick={toggleRight}
              title={rightVisible ? 'Hide right panel' : 'Show right panel'}
            >
              {rightVisible ? <ChevronsRight className="h-3 w-3" /> : <ChevronsLeft className="h-3 w-3" />}
            </button>
          </div>

          {/* Right Panel */}
          <div
            className="shrink-0 overflow-hidden bg-background"
            style={{ width: rightWidth, transition: isDragging ? 'none' : 'width 150ms ease' }}
          >
            <RightPanel />
          </div>
        </div>
      </DndContext>

      <OnboardingOverlay
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
      <TemplateLibrary
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />

      <ImportSqlDialog
        open={importSqlOpen}
        onClose={() => setImportSqlOpen(false)}
      />

      {/* Saved Queries Dialog */}
      <SavedQueriesDialog
        open={savedQueriesOpen}
        onClose={() => setSavedQueriesOpen(false)}
        onLoad={(qs) => handleLoad(qs)}
      />

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={saveName}
                onChange={(e) => handleSaveNameChange(e.target.value)}
                placeholder="My Query"
              />
            </div>

            {/* Overwrite detection banner */}
            {overwriteTarget && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                <p className="text-amber-800">
                  A query named <span className="font-medium">"{overwriteTarget.name}"</span> already
                  exists (saved {formatRelativeDate(overwriteTarget.updatedAt)}).
                </p>
                <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={doOverwrite}
                    onChange={(e) => setDoOverwrite(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-amber-700">Update the existing query instead</span>
                </label>
              </div>
            )}

            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                placeholder="What does this query do?"
              />
            </div>

            {/* Folder picker */}
            <div className="space-y-1">
              <Label>Folder (optional)</Label>
              <div className="flex gap-2">
                <select
                  className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                  value={saveFolderId ?? ''}
                  onChange={(e) => setSaveFolderId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              {/* Quick new folder creation */}
              <div className="flex gap-1.5 items-center">
                <Input
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  placeholder="New folder name…"
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2 shrink-0"
                  onClick={handleCreateFolder}
                  disabled={!newFolderInput.trim() || creatingFolder}
                >
                  + Add
                </Button>
              </div>
            </div>

            {/* Tags input */}
            <div className="space-y-1">
              <Label>Tags (optional)</Label>
              <div className="rounded-md border px-2 py-1.5 min-h-[36px] flex flex-wrap gap-1 items-center">
                {saveTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-0.5 rounded-full bg-teal-100 text-teal-700 px-2 py-0.5 text-xs"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-blue-900">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  value={saveTagsInput}
                  onChange={(e) => setSaveTagsInput(e.target.value)}
                  onKeyDown={handleTagsInputKeyDown}
                  placeholder={saveTags.length === 0 ? 'Type a tag, press Enter or comma…' : ''}
                  className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !saveName.trim()}>
              {saving ? 'Saving…' : doOverwrite && overwriteTarget ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatRelativeDate(d: Date | string) {
  const date = new Date(d)
  const now = Date.now()
  const diff = now - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
